const express = require('express');
const cors = require('cors');
require('dotenv').config();

const mpesaRoutes = require('./routes/mpesa');
const paymentRoutes = require('./routes/payment');

const app = express();
const PORT = process.env.PORT || 8080;

// CORS Configuration - Allow all origins for payment API
const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: false
};

// Middleware
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/mpesa', mpesaRoutes);
app.use('/api/payment', paymentRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Course Corner M-Pesa Backend'
  });
});

// Debug endpoint to check credentials
app.get('/api/debug', async (req, res) => {
  const axios = require('axios');
  
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
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 M-Pesa Payment Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🏢 Business Code: ${process.env.BusinessShortCode}`);
});

module.exports = app;
