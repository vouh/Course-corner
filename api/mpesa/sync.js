/**
 * Manual sync endpoint to query M-Pesa for transaction status
 * Use this to update pending transactions that didn't receive callbacks
 */

const axios = require('axios');
const { updateTransactionByCheckoutId, getTransactionBySessionId, creditReferrer } = require('../utils/firebase');

const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const BUSINESS_SHORT_CODE = process.env.BusinessShortCode;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;

const AUTH_URL = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const QUERY_URL = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

async function getMpesaToken() {
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const response = await axios.get(AUTH_URL, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 10000
  });
  return response.data.access_token;
}

function getTimestamp() {
  const now = new Date();
  return now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { sessionId, checkoutRequestId } = req.query;

    if (!sessionId && !checkoutRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide sessionId or checkoutRequestId'
      });
    }

    let transaction = null;
    let checkoutId = checkoutRequestId;

    // Get transaction from database
    if (sessionId) {
      transaction = await getTransactionBySessionId(sessionId);
      if (transaction) {
        checkoutId = transaction.checkoutRequestId;
      }
    }

    if (!checkoutId) {
      return res.status(404).json({
        success: false,
        message: 'Transaction not found or missing checkoutRequestId'
      });
    }

    console.log('🔍 Querying M-Pesa for checkoutRequestId:', checkoutId);

    // Query M-Pesa for the transaction status
    const accessToken = await getMpesaToken();
    const timestamp = getTimestamp();
    const password = Buffer.from(BUSINESS_SHORT_CODE + MPESA_PASSKEY + timestamp).toString('base64');

    const queryRequest = {
      BusinessShortCode: BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutId
    };

    const mpesaResponse = await axios.post(QUERY_URL, queryRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    const result = mpesaResponse.data;
    console.log('📱 M-Pesa Query Response:', JSON.stringify(result, null, 2));

    // Parse result
    const resultCode = result.ResultCode;
    const resultDesc = result.ResultDesc;

    let newStatus = 'pending';
    let updateData = {};

    if (resultCode === '0' || resultCode === 0) {
      // Payment was successful
      newStatus = 'completed';
      updateData = {
        status: 'completed',
        resultDesc: resultDesc,
        syncedAt: new Date().toISOString(),
        syncSource: 'manual_query'
      };

      // Try to extract receipt number from result if available
      // Note: STK Query doesn't always return receipt number
      
      const transactionId = await updateTransactionByCheckoutId(checkoutId, updateData);
      console.log('✅ Transaction synced to completed:', transactionId);

      // Process referral if applicable
      if (transaction && transaction.referralCode) {
        try {
          await creditReferrer(transaction.referralCode, transaction.amount, transactionId || transaction.id);
          console.log('💰 Referral commission credited for:', transaction.referralCode);
        } catch (refError) {
          console.error('Referral error:', refError.message);
        }
      }

    } else if (resultCode === '1032' || resultDesc?.includes('cancelled')) {
      // User cancelled
      newStatus = 'cancelled';
      updateData = {
        status: 'cancelled',
        resultDesc: 'Payment cancelled by user',
        syncedAt: new Date().toISOString()
      };
      await updateTransactionByCheckoutId(checkoutId, updateData);

    } else if (resultCode === '1037' || resultDesc?.includes('timeout')) {
      // Timeout
      newStatus = 'expired';
      updateData = {
        status: 'expired',
        resultDesc: 'Transaction timed out',
        syncedAt: new Date().toISOString()
      };
      await updateTransactionByCheckoutId(checkoutId, updateData);

    } else if (resultCode === '1' || resultCode === '1025' || resultDesc?.includes('insufficient')) {
      // Failed
      newStatus = 'failed';
      updateData = {
        status: 'failed',
        resultDesc: resultDesc,
        syncedAt: new Date().toISOString()
      };
      await updateTransactionByCheckoutId(checkoutId, updateData);
    }

    res.json({
      success: true,
      message: `Transaction status synced: ${newStatus}`,
      data: {
        checkoutRequestId: checkoutId,
        previousStatus: transaction?.status || 'unknown',
        newStatus: newStatus,
        mpesaResultCode: resultCode,
        mpesaResultDesc: resultDesc
      }
    });

  } catch (error) {
    console.error('Sync error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.errorMessage || error.message,
      details: error.response?.data
    });
  }
};
