const axios = require('axios');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const CONSUMER_KEY = process.env.CONSUMER_KEY;
  const CONSUMER_SECRET = process.env.CONSUMER_SECRET;
  const BUSINESS_SHORT_CODE = process.env.BusinessShortCode;
  const MPESA_PASSKEY = process.env.MPESA_PASSKEY;

  // Check which env vars are set (don't expose actual values)
  const envCheck = {
    CONSUMER_KEY: CONSUMER_KEY ? `Set (${CONSUMER_KEY.length} chars)` : 'NOT SET',
    CONSUMER_SECRET: CONSUMER_SECRET ? `Set (${CONSUMER_SECRET.length} chars)` : 'NOT SET',
    BusinessShortCode: BUSINESS_SHORT_CODE || 'NOT SET',
    MPESA_PASSKEY: MPESA_PASSKEY ? `Set (${MPESA_PASSKEY.length} chars)` : 'NOT SET',
    CALLBACK_URL: process.env.CALLBACK_URL || 'NOT SET'
  };

  // Try to get token
  let tokenResult = null;
  let tokenError = null;

  if (CONSUMER_KEY && CONSUMER_SECRET) {
    try {
      const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
      const response = await axios.get(
        'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );
      tokenResult = {
        success: true,
        hasToken: !!response.data.access_token,
        expiresIn: response.data.expires_in
      };
    } catch (error) {
      tokenError = {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      };
    }
  }

  res.json({
    message: 'M-Pesa Configuration Check',
    timestamp: new Date().toISOString(),
    environmentVariables: envCheck,
    tokenTest: tokenResult || { error: tokenError || 'Credentials not set' }
  });
};
