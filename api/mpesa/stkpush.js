const axios = require('axios');

// M-Pesa Configuration
const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const BUSINESS_SHORT_CODE = process.env.BusinessShortCode;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;
const CALLBACK_URL = process.env.CALLBACK_URL;

// M-Pesa URLs (Sandbox)
const AUTH_URL = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const STK_PUSH_URL = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

// In-memory payment store (for serverless, consider using a database)
const payments = new Map();

// Payment amounts for each category
const PAYMENT_AMOUNTS = {
  'calculate-cluster-points': 150,
  'courses-only': 150,
  'point-and-courses': 160
};

// Get M-Pesa Access Token
async function getMpesaToken() {
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

// Generate password for STK push
function generatePassword(timestamp) {
  const stringToEncode = BUSINESS_SHORT_CODE + MPESA_PASSKEY + timestamp;
  return Buffer.from(stringToEncode).toString('base64');
}

// Format phone number to 254XXXXXXXXX format
function formatPhoneNumber(phoneNumber) {
  let formattedPhone = phoneNumber.replace(/[^\d]/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '254' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('254')) {
    formattedPhone = '254' + formattedPhone;
  }
  return formattedPhone;
}

// Generate unique session ID
function generateSessionId() {
  return 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
}

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
    const { phoneNumber, category } = req.body;

    // Validate input
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required' });
    }

    if (!category || !PAYMENT_AMOUNTS[category]) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid category. Must be one of: calculate-cluster-points, courses-only, point-and-courses' 
      });
    }

    const amount = PAYMENT_AMOUNTS[category];
    const sessionId = generateSessionId();
    const formattedPhone = formatPhoneNumber(phoneNumber);
    const accessToken = await getMpesaToken();
    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);

    const stkPushRequest = {
      BusinessShortCode: BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: BUSINESS_SHORT_CODE,
      PhoneNumber: formattedPhone,
      CallBackURL: CALLBACK_URL || `https://course-corner-server.vercel.app/api/mpesa/callback`,
      AccountReference: `CC-${category}-${sessionId}`,
      TransactionDesc: `Course Corner - ${category}`
    };

    const response = await axios.post(STK_PUSH_URL, stkPushRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    // Store payment info (in production, use a database)
    global.payments = global.payments || {};
    global.payments[sessionId] = {
      sessionId,
      category,
      phoneNumber: formattedPhone,
      amount,
      status: 'pending',
      checkoutRequestId: response.data.CheckoutRequestID,
      merchantRequestId: response.data.MerchantRequestID,
      createdAt: new Date()
    };

    res.json({
      success: true,
      message: 'STK Push initiated successfully',
      data: {
        sessionId,
        checkoutRequestId: response.data.CheckoutRequestID,
        responseCode: response.data.ResponseCode,
        responseDesc: response.data.ResponseDescription,
        amount,
        category
      }
    });

  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.errorMessage || error.message || 'Failed to initiate payment'
    });
  }
};
