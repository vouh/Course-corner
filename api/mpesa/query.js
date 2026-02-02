const axios = require('axios');
const { updateTransactionByCheckoutId, getTransactionBySessionId, creditReferrer } = require('../utils/firebase');

// M-Pesa Configuration
const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const BUSINESS_SHORT_CODE = process.env.BusinessShortCode;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;

// M-Pesa URLs
const AUTH_URL = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const STK_QUERY_URL = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

// Get M-Pesa Access Token
async function getMpesaToken() {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    throw new Error('M-Pesa credentials not configured');
  }

  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const response = await axios.get(AUTH_URL, {
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    timeout: 10000
  });
  return response.data.access_token;
}

// Generate timestamp in format YYYYMMDDHHmmss
function getTimestamp() {
  const now = new Date();
  return now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    String(now.getHours()).padStart(2, '0') +
    String(now.getMinutes()).padStart(2, '0') +
    String(now.getSeconds()).padStart(2, '0');
}

// Generate password for STK query
function generatePassword(timestamp) {
  const stringToEncode = BUSINESS_SHORT_CODE + MPESA_PASSKEY + timestamp;
  return Buffer.from(stringToEncode).toString('base64');
}

/**
 * Query M-Pesa for STK Push transaction status
 * This is the fallback when callback doesn't arrive
 */
module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }

    console.log('🔍 Querying M-Pesa for session:', sessionId);

    // Get transaction from database
    const transaction = await getTransactionBySessionId(sessionId);

    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // If already completed or failed, no need to query
    if (transaction.status === 'completed') {
      return res.json({
        success: true,
        data: {
          status: 'completed',
          mpesaReceiptNumber: transaction.mpesaReceiptNumber,
          resultDesc: 'Transaction already completed'
        }
      });
    }

    if (transaction.status === 'failed') {
      return res.json({
        success: true,
        data: {
          status: 'failed',
          resultDesc: transaction.resultDesc || 'Transaction failed'
        }
      });
    }

    // Query M-Pesa API
    const accessToken = await getMpesaToken();
    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);

    const queryRequest = {
      BusinessShortCode: BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: transaction.checkoutRequestId
    };

    console.log('📞 Querying M-Pesa API for CheckoutRequestID:', transaction.checkoutRequestId);

    const response = await axios.post(STK_QUERY_URL, queryRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log('📱 M-Pesa Query Response:', JSON.stringify(response.data, null, 2));

    const { ResultCode, ResultDesc, ResponseCode } = response.data;

    // ResponseCode 0 means the query was successful
    if (ResponseCode === '0') {
      // ResultCode 0 means payment successful
      if (ResultCode === '0') {
        console.log('✅ M-Pesa Query: Transaction was successful!');

        // Update transaction in database
        const updateData = {
          status: 'completed',
          resultDesc: ResultDesc,
          queryVerifiedAt: new Date().toISOString()
        };

        await updateTransactionByCheckoutId(transaction.checkoutRequestId, updateData);

        // Credit referrer if applicable
        if (transaction.referralCode) {
          console.log('💰 Processing referral commission for code:', transaction.referralCode);
          await creditReferrer(transaction.referralCode, transaction.amount, transaction.id);
        }

        return res.json({
          success: true,
          data: {
            status: 'completed',
            resultDesc: ResultDesc,
            verified: true
          }
        });
      } else {
        // Transaction failed or cancelled
        console.log('❌ M-Pesa Query: Transaction failed -', ResultDesc);

        await updateTransactionByCheckoutId(transaction.checkoutRequestId, {
          status: 'failed',
          resultDesc: ResultDesc,
          queryVerifiedAt: new Date().toISOString()
        });

        return res.json({
          success: true,
          data: {
            status: 'failed',
            resultDesc: ResultDesc
          }
        });
      }
    } else {
      // Still pending
      console.log('⏳ M-Pesa Query: Transaction still pending');

      return res.json({
        success: true,
        data: {
          status: 'pending',
          resultDesc: 'Transaction is still being processed'
        }
      });
    }

  } catch (error) {
    console.error('❌ M-Pesa Query Error:', error.message);
    
    // If it's an axios error, log the response
    if (error.response) {
      console.error('M-Pesa API Response:', JSON.stringify(error.response.data, null, 2));
    }

    res.status(500).json({ 
      success: false, 
      message: 'Failed to query M-Pesa status',
      error: error.message 
    });
  }
};
