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
    console.log('💾 Saving transaction to Firebase...');
    const firebaseId = await savePaymentTransaction({
      sessionId,
      phoneNumber,
      amount,
      category,
      status: 'pending',
      checkoutRequestId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId
    });
    console.log('💾 Firebase save result:', firebaseId ? `Success (${firebaseId})` : 'Failed or skipped');

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
        
        // Handle "pending" status - transaction still being processed
        // Also check if ResultDesc contains "processing" - M-Pesa sometimes returns this
        const isStillProcessing = 
          queryResult.ResultCode === 'pending' || 
          queryResult.status === 'pending' ||
          (queryResult.ResultDesc && queryResult.ResultDesc.toLowerCase().includes('processing')) ||
          (queryResult.errorMessage && queryResult.errorMessage.toLowerCase().includes('processing'));
        
        if (isStillProcessing) {
          console.log('⏳ Transaction still processing, keeping pending status...');
          // Keep status as pending, don't update anything - let polling continue
        }
        // Check the result code - ResultCode 0 = Success
        else if (queryResult.ResultCode === '0' || queryResult.ResultCode === 0) {
          // Payment successful - extract M-Pesa receipt number
          const mpesaReceiptNumber = queryResult.MpesaReceiptNumber || null;
          console.log('✅ M-Pesa confirms payment successful, Receipt:', mpesaReceiptNumber);
          
          // Update PaymentStore with receipt number
          PaymentStore.updatePaymentStatus(sessionId, 'completed', queryResult.ResultDesc || 'Payment successful', {
            mpesaReceiptNumber: mpesaReceiptNumber
          });
          
          // Update Firebase with receipt number
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'completed',
            resultDesc: queryResult.ResultDesc,
            mpesaReceiptNumber: mpesaReceiptNumber,
            transactionCode: mpesaReceiptNumber
          });
          
          payment.status = 'completed';
          payment.resultDesc = queryResult.ResultDesc || 'Payment successful';
          payment.mpesaReceiptNumber = mpesaReceiptNumber;
        } 
        // ResultCode 1032 = Cancelled by user
        else if (queryResult.ResultCode === '1032' || queryResult.ResultCode === 1032) {
          // User cancelled
          console.log('❌ User cancelled the payment');
          PaymentStore.updatePaymentStatus(sessionId, 'failed', 'Request cancelled by user');
          
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'failed',
            resultDesc: 'Request cancelled by user'
          });
          
          payment.status = 'failed';
          payment.resultDesc = 'Request cancelled by user';
        } 
        // ResultCode 1037 = Timeout (user didn't respond in time)
        else if (queryResult.ResultCode === '1037' || queryResult.ResultCode === 1037) {
          console.log('⏰ Payment request timed out');
          PaymentStore.updatePaymentStatus(sessionId, 'failed', 'Payment request timed out. Please try again.');
          
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'failed',
            resultDesc: 'Payment request timed out'
          });
          
          payment.status = 'failed';
          payment.resultDesc = 'Payment request timed out. Please try again.';
        }
        // ResultCode 1 = Insufficient balance
        else if (queryResult.ResultCode === '1' || queryResult.ResultCode === 1) {
          console.log('💰 Insufficient balance');
          PaymentStore.updatePaymentStatus(sessionId, 'failed', 'Insufficient M-Pesa balance');
          
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'failed',
            resultDesc: 'Insufficient balance'
          });
          
          payment.status = 'failed';
          payment.resultDesc = 'Insufficient M-Pesa balance';
        }
        // ResultCode 2001 or 1025 = Wrong PIN
        else if (queryResult.ResultCode === '2001' || queryResult.ResultCode === 2001 || 
                 queryResult.ResultCode === '1025' || queryResult.ResultCode === 1025 ||
                 (queryResult.ResultDesc && queryResult.ResultDesc.toLowerCase().includes('wrong pin'))) {
          console.log('🔐 Wrong PIN entered');
          PaymentStore.updatePaymentStatus(sessionId, 'failed', 'WRONG_PIN: You entered the wrong M-Pesa PIN. Please try again.');
          
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'failed',
            resultDesc: 'Wrong PIN entered',
            resultCode: queryResult.ResultCode
          });
          
          payment.status = 'failed';
          payment.resultDesc = 'WRONG_PIN: You entered the wrong M-Pesa PIN. Please try again.';
        }
        // Any other non-zero ResultCode is a failure (but NOT if still processing)
        else if (queryResult.ResultCode && queryResult.ResultCode !== '0' && queryResult.ResultCode !== 0 && queryResult.ResultCode !== 'pending') {
          // Double check it's not a processing message before marking as failed
          if (queryResult.ResultDesc && queryResult.ResultDesc.toLowerCase().includes('processing')) {
            console.log('⏳ ResultDesc indicates still processing, keeping pending...');
          } else {
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
        }
        // If no ResultCode at all, the transaction is still processing
        else {
          console.log('⏳ No definitive result yet, keeping pending status');
        }
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
        mpesaReceiptNumber: payment.mpesaReceiptNumber || payment.metadata?.mpesaReceiptNumber || null,
        transactionCode: payment.mpesaReceiptNumber || payment.metadata?.mpesaReceiptNumber || payment.metadata?.MpesaReceiptNumber || null,
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

// Debug Firebase environment (admin) - shows which env vars are set
router.get('/admin/debug-firebase', async (req, res) => {
  const envCheck = {
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID ? `SET (${process.env.FIREBASE_PROJECT_ID})` : 'NOT SET',
    FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? `SET (${process.env.FIREBASE_CLIENT_EMAIL.substring(0, 20)}...)` : 'NOT SET',
    FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? `SET (length: ${process.env.FIREBASE_PRIVATE_KEY.length}, starts: ${process.env.FIREBASE_PRIVATE_KEY.substring(0, 30)}...)` : 'NOT SET',
    FIREBASE_PRIVATE_KEY_ID: process.env.FIREBASE_PRIVATE_KEY_ID ? 'SET' : 'NOT SET',
    FIREBASE_CLIENT_ID: process.env.FIREBASE_CLIENT_ID ? 'SET' : 'NOT SET',
    FIREBASE_CERT_URL: process.env.FIREBASE_CERT_URL ? 'SET' : 'NOT SET'
  };
  
  res.json({
    success: true,
    message: 'Firebase environment check',
    env: envCheck
  });
});

// Test Firebase connection (admin)
router.get('/admin/test-firebase', async (req, res) => {
  try {
    const { initializeFirebase, getFirestore } = require('../utils/firebaseAdmin');
    
    console.log('Testing Firebase connection...');
    
    // Initialize Firebase
    const admin = initializeFirebase();
    console.log('Firebase Admin initialized, apps:', admin.apps.length);
    
    const db = getFirestore();
    console.log('Got Firestore instance for project:', db._settings?.projectId || 'unknown');
    
    // First try to just list collections (read operation)
    console.log('Attempting to list collections...');
    const collections = await db.listCollections();
    console.log('Collections found:', collections.map(c => c.id));
    
    // Then try to write
    console.log('Attempting to write test document...');
    const testDoc = await db.collection('test').add({
      message: 'Firebase connection test',
      timestamp: new Date().toISOString()
    });
    console.log('Test document created:', testDoc.id);
    
    // Test read
    const readDoc = await testDoc.get();
    
    // Clean up
    await testDoc.delete();
    
    res.json({
      success: true,
      message: 'Firebase connection successful!',
      collections: collections.map(c => c.id),
      testData: readDoc.data()
    });
  } catch (error) {
    console.error('Firebase test error:', error);
    res.status(500).json({
      success: false,
      message: 'Firebase connection failed: ' + error.message,
      error: error.code || error.name,
      details: error.details || null
    });
  }
});

// Delete a transaction (admin)
router.delete('/admin/transactions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Transaction ID is required'
      });
    }
    
    // Delete from Firebase
    const { deleteTransaction } = require('../utils/firebaseAdmin');
    const deleted = await deleteTransaction(id);
    
    // Also delete from in-memory store if exists
    PaymentStore.deletePayment(id);
    
    if (deleted) {
      res.json({
        success: true,
        message: 'Transaction deleted successfully'
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
