/**
 * Bulk sync all pending transactions
 * Queries M-Pesa for each pending transaction and updates status
 */

const axios = require('axios');
const { updateTransactionByCheckoutId, creditReferrer } = require('../utils/firebase');

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
    const { db } = await require('../utils/firebase').initializeFirebase();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not available' });
    }

    // Get all pending transactions
    const snapshot = await db.collection('transactions')
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    if (snapshot.empty) {
      return res.json({
        success: true,
        message: 'No pending transactions to sync',
        results: []
      });
    }

    const accessToken = await getMpesaToken();
    const results = [];

    for (const doc of snapshot.docs) {
      const tx = doc.data();
      const checkoutId = tx.checkoutRequestId;

      if (!checkoutId) {
        results.push({
          id: doc.id,
          status: 'skipped',
          reason: 'No checkoutRequestId'
        });
        continue;
      }

      try {
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));

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
        const resultCode = String(result.ResultCode);

        let newStatus = 'pending';
        let updateData = { syncedAt: new Date().toISOString(), syncSource: 'bulk_sync' };

        if (resultCode === '0') {
          newStatus = 'completed';
          updateData.status = 'completed';
          updateData.resultDesc = result.ResultDesc;

          // Process referral
          if (tx.referralCode) {
            try {
              await creditReferrer(tx.referralCode, tx.amount, doc.id);
            } catch (e) {
              console.error('Referral error:', e.message);
            }
          }
        } else if (resultCode === '1032') {
          newStatus = 'cancelled';
          updateData.status = 'cancelled';
          updateData.resultDesc = 'Cancelled by user';
        } else if (resultCode === '1037') {
          newStatus = 'expired';
          updateData.status = 'expired';
          updateData.resultDesc = 'Transaction timed out';
        } else if (['1', '1025', '2001'].includes(resultCode)) {
          newStatus = 'failed';
          updateData.status = 'failed';
          updateData.resultDesc = result.ResultDesc;
        }

        if (newStatus !== 'pending') {
          await updateTransactionByCheckoutId(checkoutId, updateData);
        }

        results.push({
          id: doc.id,
          phone: tx.phoneNumber,
          previousStatus: 'pending',
          newStatus: newStatus,
          mpesaCode: resultCode,
          referralCode: tx.referralCode || null
        });

      } catch (queryError) {
        results.push({
          id: doc.id,
          status: 'error',
          error: queryError.response?.data?.errorMessage || queryError.message
        });
      }
    }

    const completed = results.filter(r => r.newStatus === 'completed').length;
    const failed = results.filter(r => r.newStatus === 'failed' || r.newStatus === 'cancelled' || r.newStatus === 'expired').length;

    res.json({
      success: true,
      message: `Synced ${snapshot.size} transactions: ${completed} completed, ${failed} failed/cancelled`,
      summary: {
        total: snapshot.size,
        completed,
        failed,
        pending: results.filter(r => r.newStatus === 'pending').length,
        errors: results.filter(r => r.status === 'error').length
      },
      results
    });

  } catch (error) {
    console.error('Bulk sync error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};
