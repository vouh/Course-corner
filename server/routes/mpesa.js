const express = require('express');
const router = express.Router();
const { initiateSTKPush, querySTKPushStatus } = require('../utils/mpesaUtil');
const PaymentStore = require('../models/PaymentStore');
const { generateSessionId } = require('../utils/helpers');
const { savePaymentTransaction, updatePaymentTransaction, getAllTransactions, getTransactionStats } = require('../utils/firebaseAdmin');

// Payment amounts for each category
const PAYMENT_AMOUNTS = {
  'calculate-cluster-points': 1,
  'courses-only': 1,
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

    // Save transaction to Firebase
    await savePaymentTransaction({
      sessionId,
      phoneNumber,
      amount,
      category,
      status: 'pending',
      checkoutRequestId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId
    });

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

// Query Payment Status (supports both path param and query param)
// Now actively queries M-Pesa if status is still pending
router.get('/status/:sessionId?', async (req, res) => {
  try {
    const sessionId = req.params.sessionId || req.query.sessionId;
    
    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }
    
    const payment = PaymentStore.getPaymentBySessionId(sessionId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment session not found'
      });
    }

    // If payment is still pending and we have a checkout ID, query M-Pesa directly
    if (payment.status === 'pending' && payment.checkoutRequestId) {
      console.log('🔍 Querying M-Pesa for status of:', payment.checkoutRequestId);
      
      try {
        const queryResult = await querySTKPushStatus(payment.checkoutRequestId);
        console.log('📋 M-Pesa Query Result:', JSON.stringify(queryResult, null, 2));
        
        // Check the result code
        // ResultCode 0 = Success, 1032 = Cancelled, other = failed
        if (queryResult.ResultCode === '0' || queryResult.ResultCode === 0) {
          // Payment successful
          console.log('✅ M-Pesa confirms payment successful');
          PaymentStore.updatePaymentStatus(sessionId, 'completed', queryResult.ResultDesc || 'Payment successful');
          
          // Update Firebase
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'completed',
            resultDesc: queryResult.ResultDesc,
            mpesaReceiptNumber: queryResult.MpesaReceiptNumber || null
          });
          
          payment.status = 'completed';
          payment.resultDesc = queryResult.ResultDesc || 'Payment successful';
        } else if (queryResult.ResultCode === '1032' || queryResult.ResultCode === 1032) {
          // User cancelled
          console.log('❌ User cancelled the payment');
          PaymentStore.updatePaymentStatus(sessionId, 'failed', 'Request cancelled by user');
          
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'failed',
            resultDesc: 'Request cancelled by user'
          });
          
          payment.status = 'failed';
          payment.resultDesc = 'Request cancelled by user';
        } else if (queryResult.ResultCode && queryResult.ResultCode !== '0') {
          // Other failure
          console.log('❌ Payment failed with code:', queryResult.ResultCode);
          PaymentStore.updatePaymentStatus(sessionId, 'failed', queryResult.ResultDesc || 'Payment failed');
          
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'failed',
            resultDesc: queryResult.ResultDesc,
            resultCode: queryResult.ResultCode
          });
          
          payment.status = 'failed';
          payment.resultDesc = queryResult.ResultDesc || 'Payment failed';
        }
        // If no ResultCode, the transaction is still processing
      } catch (queryError) {
        console.log('⏳ M-Pesa query pending or error:', queryError.message);
        // Don't fail - just return current status, transaction might still be processing
      }
    }

    res.json({
      success: true,
      data: {
        sessionId,
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        resultDesc: payment.resultDesc || null,
        errorMessage: payment.errorMessage || null,
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
router.post('/callback', async (req, res) => {
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
        
        // Update Firebase with success status and transaction details
        await updatePaymentTransaction(checkoutRequestID, {
          status: 'completed',
          resultDesc,
          mpesaReceiptNumber: metadata.MpesaReceiptNumber || null,
          transactionCode: metadata.MpesaReceiptNumber || null,
          transactionDate: metadata.TransactionDate || null,
          metadata
        });
        
        console.log('💾 Payment data saved:', metadata);
      } else {
        // Payment failed
        console.log('❌ Payment failed for session:', payment.sessionId);
        console.log('Reason:', resultDesc);
        PaymentStore.updatePaymentStatus(payment.sessionId, 'failed', resultDesc);
        
        // Update Firebase with failed status
        await updatePaymentTransaction(checkoutRequestID, {
          status: 'failed',
          resultDesc,
          resultCode
        });
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
router.get('/admin/completed', async (req, res) => {
  try {
    // Get from Firebase
    const firebaseTransactions = await getAllTransactions(100, 'completed');
    
    // Fallback to in-memory store if Firebase is empty
    if (firebaseTransactions.length === 0) {
      const payments = PaymentStore.getCompletedPayments();
      return res.json({
        success: true,
        source: 'memory',
        data: payments
      });
    }
    
    res.json({
      success: true,
      source: 'firebase',
      data: firebaseTransactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get all transactions (admin) - includes all statuses
router.get('/admin/transactions', async (req, res) => {
  try {
    const { limit = 100, status } = req.query;
    const transactions = await getAllTransactions(parseInt(limit), status || null);
    
    res.json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get payment statistics (admin)
router.get('/admin/stats', async (req, res) => {
  try {
    // Get from Firebase
    const firebaseStats = await getTransactionStats();
    
    // Fallback to in-memory store
    if (!firebaseStats) {
      const stats = PaymentStore.getStatistics();
      return res.json({
        success: true,
        source: 'memory',
        data: stats
      });
    }
    
    res.json({
      success: true,
      source: 'firebase',
      data: firebaseStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
