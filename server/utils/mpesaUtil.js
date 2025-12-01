const axios = require('axios');

const CONSUMER_KEY = process.env.CONSUMER_KEY;
const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
const BUSINESS_SHORT_CODE = process.env.BusinessShortCode;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;

// M-Pesa URLs - PRODUCTION (Live)
const AUTH_URL = 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
const STK_PUSH_URL = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
const QUERY_URL = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

// Get M-Pesa Access Token
async function getMpesaToken() {
  try {
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    const response = await axios.get(AUTH_URL, {
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting M-Pesa token:', error.message);
    throw new Error('Failed to authenticate with M-Pesa: ' + error.message);
  }
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
// M-Pesa requires: base64(BusinessShortCode + Passkey + Timestamp)
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

// Initiate STK Push
async function initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc) {
  try {
    const formattedPhone = formatPhoneNumber(phoneNumber);
    const accessToken = await getMpesaToken();
    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);

    console.log('📱 STK Push Request Details:');
    console.log('Phone:', formattedPhone);
    console.log('Amount:', amount);
    console.log('BusinessShortCode:', BUSINESS_SHORT_CODE);
    console.log('Timestamp:', timestamp);

    // Determine transaction type based on short code length
    // Till numbers (Buy Goods) are typically 5-7 digits
    // Paybills are typically 5-6 digits but registered differently
    const transactionType = 'CustomerBuyGoodsOnline'; // Use this for Till Numbers

    const stkPushRequest = {
      BusinessShortCode: BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: transactionType,
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: BUSINESS_SHORT_CODE,
      PhoneNumber: formattedPhone,
      CallBackURL: process.env.CALLBACK_URL || 'https://course-corner-server.vercel.app/api/mpesa/callback',
      AccountReference: accountReference.substring(0, 12), // Max 12 chars for Till
      TransactionDesc: transactionDesc.substring(0, 13) // Max 13 chars
    };

    console.log('📤 Sending STK Push request...');

    const response = await axios.post(STK_PUSH_URL, stkPushRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ STK Push Response:', response.data);

    return {
      success: true,
      checkoutRequestId: response.data.CheckoutRequestID,
      responseCode: response.data.ResponseCode,
      responseDesc: response.data.ResponseDescription,
      merchantRequestId: response.data.MerchantRequestID
    };
  } catch (error) {
    console.error('❌ STK Push Error:', error.response?.data || error.message);
    throw new Error('Failed to initiate payment: ' + (error.response?.data?.errorMessage || error.response?.data?.errorCode || error.message));
  }
}

// Query STK Push Status
async function querySTKPushStatus(checkoutRequestId) {
  try {
    const accessToken = await getMpesaToken();
    const timestamp = getTimestamp();
    const password = generatePassword(timestamp);

    const queryRequest = {
      BusinessShortCode: BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    const response = await axios.post(QUERY_URL, queryRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    console.error('STK Query Error:', error.message);
    throw new Error('Failed to query payment status: ' + error.message);
  }
}

module.exports = {
  getMpesaToken,
  getTimestamp,
  generatePassword,
  formatPhoneNumber,
  initiateSTKPush,
  querySTKPushStatus
};
