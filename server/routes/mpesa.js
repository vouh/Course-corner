const express = require('express');
const router = express.Router();
const { initiateSTKPush, querySTKPushStatus } = require('../utils/mpesaUtil');
const PaymentStore = require('../models/PaymentStore');
const { generateSessionId } = require('../utils/helpers');

// Payment amounts for each category
const PAYMENT_AMOUNTS = {
  'calculate-cluster-points': 150,
  'courses-only': 150,
  'point-and-courses': 160
};

// Initiate STK Push Payment
router.post('/stkpush', async (req, res) => {
  try {
    const { phoneNumber, category } = req.body;

    // Validate input
    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: 'Phone number is required'
      });
    }

    if (!category || !PAYMENT_AMOUNTS[category]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid category. Must be one of: calculate-cluster-points, courses-only, point-and-courses'
      });
    }

    const amount = PAYMENT_AMOUNTS[category];
    const sessionId = generateSessionId();

    // Create payment record
    PaymentStore.createPayment(sessionId, category, phoneNumber, amount);

    // Initiate STK Push
    const stkResult = await initiateSTKPush(
      phoneNumber,
      amount,
      `CC-${category}-${sessionId}`,
      `Course Corner - ${category}`
    );

    // Update payment with checkout details
    PaymentStore.updatePaymentCheckout(
      sessionId,
      stkResult.checkoutRequestId,
      stkResult.merchantRequestId,
      stkResult.responseCode
    );

    res.json({
      success: true,
      message: 'STK Push initiated successfully',
      data: {
        sessionId,
        checkoutRequestId: stkResult.checkoutRequestId,
        responseCode: stkResult.responseCode,
        responseDesc: stkResult.responseDesc,
        amount,
        category
      }
    });

  } catch (error) {
    console.error('STK Push Error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate payment'
    });
  }
});

// Query Payment Status
router.get('/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const payment = PaymentStore.getPaymentBySessionId(sessionId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment session not found'
      });
    }

    res.json({
      success: true,
      data: {
        sessionId,
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        metadata: payment.metadata
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// M-Pesa Callback Handler
router.post('/callback', (req, res) => {
  try {
    const callbackData = req.body;
    console.log('📱 M-Pesa Callback Received:', new Date().toISOString());
    console.log(JSON.stringify(callbackData, null, 2));

    // Extract callback data
    const stkCallback = callbackData.Body?.stkCallback;
    
    if (!stkCallback) {
      console.error('Invalid callback structure');
      return res.json({
        ResultCode: 1,
        ResultDesc: 'Invalid callback structure'
      });
    }

    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    // Find payment by checkout request ID
    const payment = PaymentStore.getPaymentByCheckoutId(checkoutRequestID);

    if (payment) {
      if (resultCode === 0) {
        // Payment successful
        console.log('✅ Payment successful for session:', payment.sessionId);
        
        // Extract payment metadata
        const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
        const metadata = {};
        
        callbackMetadata.forEach(item => {
          metadata[item.Name] = item.Value;
        });

        PaymentStore.updatePaymentStatus(payment.sessionId, 'completed', resultDesc, metadata);
        
        console.log('💾 Payment data saved:', metadata);
      } else {
        // Payment failed
        console.log('❌ Payment failed for session:', payment.sessionId);
        console.log('Reason:', resultDesc);
        PaymentStore.updatePaymentStatus(payment.sessionId, 'failed', resultDesc);
      }
    } else {
      console.warn('⚠️ Payment session not found for checkout ID:', checkoutRequestID);
    }

    // Acknowledge callback receipt
    res.json({
      ResultCode: 0,
      ResultDesc: 'Callback received and processed successfully'
    });

  } catch (error) {
    console.error('❌ Callback Error:', error);
    res.status(500).json({
      ResultCode: 1,
      ResultDesc: 'Error processing callback'
    });
  }
});

// Verify Payment
router.post('/verify', async (req, res) => {
  try {
    const { sessionId, checkoutRequestId } = req.body;

    if (!sessionId && !checkoutRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Either sessionId or checkoutRequestId is required'
      });
    }

    let payment;
    if (sessionId) {
      payment = PaymentStore.getPaymentBySessionId(sessionId);
    } else {
      payment = PaymentStore.getPaymentByCheckoutId(checkoutRequestId);
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // If status is still pending, query M-Pesa
    if (payment.status === 'pending' && payment.checkoutRequestId) {
      try {
        const queryResult = await querySTKPushStatus(payment.checkoutRequestId);
        
        if (queryResult.ResponseCode === '0') {
          PaymentStore.updatePaymentStatus(payment.sessionId, 'completed');
        }
      } catch (error) {
        console.log('Query result:', error.message);
      }
    }

    res.json({
      success: true,
      payment: {
        sessionId: payment.sessionId,
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get all completed payments (admin)
router.get('/admin/completed', (req, res) => {
  try {
    const payments = PaymentStore.getCompletedPayments();
    res.json({
      success: true,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get payment statistics (admin)
router.get('/admin/stats', (req, res) => {
  try {
    const stats = PaymentStore.getStatistics();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
