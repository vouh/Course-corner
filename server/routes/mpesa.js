const express = require('express');
const router = express.Router();
const { initiateSTKPush, querySTKPushStatus } = require('../utils/mpesaUtil');
const PaymentStore = require('../models/PaymentStore');
const { generateSessionId } = require('../utils/helpers');
const { 
  savePaymentTransaction, 
  updatePaymentTransaction, 
  getAllTransactions, 
  getTransactionStats,
  getTransactionByMpesaCode,
  markTransactionAsUsed,
  creditReferrer,
  bulkDeleteTransactions,
  deleteTransaction
} = require('../utils/firebaseAdmin');

// Payment amounts for each category
const PAYMENT_AMOUNTS = {
  'calculate-cluster-points': 100,
  'courses-only': 200,
  'point-and-courses': 300,
  'bronze': 400,
  'silver': 500,
  'gold': 600
};

// Initiate STK Push Payment
router.post('/stkpush', async (req, res) => {
  try {
    const { phoneNumber, category, amount: requestedAmount, referralCode } = req.body;

    console.log('📱 STK Push Request:', { phoneNumber, category, referralCode: referralCode || 'NONE' });

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
        message: 'Invalid category. Must be one of: ' + Object.keys(PAYMENT_AMOUNTS).join(', ')
      });
    }

    // Use requested amount if provided (for testing), otherwise use default
    const amount = requestedAmount || PAYMENT_AMOUNTS[category];
    const sessionId = generateSessionId();

    // Create payment record with referral code
    PaymentStore.createPayment(sessionId, category, phoneNumber, amount, referralCode);

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
      status: 'processing',
      checkoutRequestId: stkResult.checkoutRequestId,
      merchantRequestId: stkResult.merchantRequestId,
      referralCode: referralCode ? referralCode.toUpperCase() : null
    });
    console.log('💾 Firebase save result:', firebaseId ? `Success (${firebaseId})` : 'Failed or skipped');
    console.log('🎁 Referral Code:', referralCode ? referralCode.toUpperCase() : 'NONE');

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
          // Payment successful!
          // NOTE: STK Push Query does NOT return MpesaReceiptNumber - that only comes from callback
          // If we have it from a previous callback, use it. Otherwise it will be null.
          const existingReceipt = payment.mpesaReceiptNumber || payment.metadata?.MpesaReceiptNumber || null;
          console.log('✅ M-Pesa confirms payment successful!');
          console.log('   ResultDesc:', queryResult.ResultDesc);
          console.log('   Existing Receipt (from callback):', existingReceipt || 'NOT YET RECEIVED - waiting for callback');

          // Update PaymentStore - mark as completed
          PaymentStore.updatePaymentStatus(sessionId, 'completed', queryResult.ResultDesc || 'The service request is processed successfully.', {
            mpesaReceiptNumber: existingReceipt
          });

          // Update Firebase - mark as completed
          await updatePaymentTransaction(payment.checkoutRequestId, {
            status: 'completed',
            resultDesc: queryResult.ResultDesc || 'The service request is processed successfully.',
            // Only update receipt if we have one
            ...(existingReceipt && { mpesaReceiptNumber: existingReceipt, transactionCode: existingReceipt })
          });

          payment.status = 'completed';
          payment.resultDesc = queryResult.ResultDesc || 'The service request is processed successfully.';
          if (existingReceipt) payment.mpesaReceiptNumber = existingReceipt;
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
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📱 M-PESA CALLBACK RECEIVED:', new Date().toISOString());
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Raw Callback Data:');
    console.log(JSON.stringify(callbackData, null, 2));

    // Extract callback data
    const stkCallback = callbackData.Body?.stkCallback;

    if (!stkCallback) {
      console.error('❌ Invalid callback structure - no stkCallback found');
      return res.json({
        ResultCode: 1,
        ResultDesc: 'Invalid callback structure'
      });
    }

    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const merchantRequestID = stkCallback.MerchantRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    console.log('📋 Callback Details:');
    console.log('   CheckoutRequestID:', checkoutRequestID);
    console.log('   MerchantRequestID:', merchantRequestID);
    console.log('   ResultCode:', resultCode);
    console.log('   ResultDesc:', resultDesc);

    // Find payment by checkout request ID
    const payment = PaymentStore.getPaymentByCheckoutId(checkoutRequestID);
    console.log('   Found Payment:', payment ? `Session: ${payment.sessionId}` : 'NOT FOUND');

    if (payment) {
      if (resultCode === 0) {
        // Payment successful - Extract metadata including M-Pesa Receipt Number
        console.log('✅ PAYMENT SUCCESSFUL!');

        // ============================================
        // COMPREHENSIVE RECEIPT EXTRACTION ALGORITHM
        // ============================================
        console.log('✅ ResultCode = 0: Payment SUCCESSFUL');
        
        const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
        const metadata = {};

        console.log('📦 RAW CallbackMetadata.Item[] array:');
        callbackMetadata.forEach(item => {
          metadata[item.Name] = item.Value;
          console.log(`   ${item.Name}: ${item.Value}`);
        });

        // Extract receipt with CASE-INSENSITIVE matching
        let mpesaReceiptNumber = null;
        
        for (const item of callbackMetadata) {
          const itemName = item.Name || '';
          // Check both 'MpesaReceiptNumber' and 'mpesaReceiptNumber' (case-insensitive)
          if (itemName.toLowerCase() === 'mpesareceiptnumber') {
            mpesaReceiptNumber = String(item.Value); // Store as string only
            console.log(`🎯 RECEIPT FOUND! Name="${item.Name}" → Value="${mpesaReceiptNumber}"`);
            break;
          }
        }
        
        // DEBUG: Log extraction result
        if (mpesaReceiptNumber) {
          console.log(`✅ Receipt extracted successfully: "${mpesaReceiptNumber}"`);
        } else {
          console.error('❌ CRITICAL: Receipt NOT FOUND in callback metadata!');
          console.error('Available field names:', callbackMetadata.map(i => i.Name).join(', '));
        }

        // Update PaymentStore with all metadata including receipt number
        PaymentStore.updatePaymentStatus(payment.sessionId, 'completed', resultDesc, {
          ...metadata,
          mpesaReceiptNumber: mpesaReceiptNumber
        });

        // Update Firebase with success status and transaction details
        await updatePaymentTransaction(checkoutRequestID, {
          status: 'completed',
          resultDesc,
          mpesaReceiptNumber: mpesaReceiptNumber,
          transactionCode: mpesaReceiptNumber,
          transactionDate: metadata.TransactionDate || null,
          amount: metadata.Amount || payment.amount,
          phoneNumber: metadata.PhoneNumber || payment.phoneNumber,
          metadata,
          callbackReceivedAt: new Date().toISOString()
        });

        console.log('💾 Payment data saved successfully with Receipt:', mpesaReceiptNumber);

        // Credit referrer if applicable (12% commission)
        if (payment.referralCode) {
          console.log('💰 Processing referral commission for code:', payment.referralCode);
          try {
            await creditReferrer(payment.referralCode, payment.amount, payment.sessionId);
          } catch (refError) {
            console.error('❌ Error crediting referrer:', refError.message);
          }
        }
      } else {
        // Payment failed (ResultCode != 0)
        console.log(`❌ ResultCode = ${resultCode}: Payment FAILED`);
        console.log(`📝 Failure Reason: ${resultDesc}`);

        PaymentStore.updatePaymentStatus(payment.sessionId, 'failed', resultDesc, {
          resultCode: resultCode,
          failureReason: resultDesc
        });

        // Update Firebase with failed status and detailed failure info
        await updatePaymentTransaction(checkoutRequestID, {
          status: 'failed',
          resultDesc,
          resultCode,
          failureReason: resultDesc,
          failedAt: new Date().toISOString(),
          callbackReceivedAt: new Date().toISOString()
        });
        
        console.log('❌ Transaction marked as failed:', resultDesc);
      }
    } else {
      console.warn('⚠️ Payment session NOT FOUND for checkout ID:', checkoutRequestID);
      console.warn('   This might be an orphan callback or the payment session expired');
    }

    console.log('═══════════════════════════════════════════════════════════');

    // Acknowledge callback receipt to M-Pesa
    res.json({
      ResultCode: 0,
      ResultDesc: 'Callback received and processed successfully'
    });

  } catch (error) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ CALLBACK PROCESSING ERROR:', error);
    console.error('═══════════════════════════════════════════════════════════');
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

// Sync/recover missing M-Pesa receipts for completed transactions
router.post('/admin/sync-receipts', async (req, res) => {
  try {
    console.log('🔄 Starting receipt sync for pending/missing receipts...');
    
    // Get all completed transactions without receipt numbers
    const transactions = await getAllTransactions(200);
    const toSync = transactions.filter(tx => 
      tx.status === 'completed' && !tx.mpesaReceiptNumber && tx.checkoutRequestId
    );
    
    console.log(`📋 Found ${toSync.length} completed transactions without receipts`);
    
    const results = { synced: 0, failed: 0, errors: [] };
    
    for (const tx of toSync) {
      try {
        console.log(`🔍 Querying M-Pesa for: ${tx.checkoutRequestId}`);
        const queryResult = await querySTKPushStatus(tx.checkoutRequestId);
        
        if (queryResult.ResultCode === '0' || queryResult.ResultCode === 0) {
          // Try to get receipt from callback metadata if stored
          if (queryResult.MpesaReceiptNumber) {
            await updatePaymentTransaction(tx.checkoutRequestId, {
              mpesaReceiptNumber: queryResult.MpesaReceiptNumber,
              transactionCode: queryResult.MpesaReceiptNumber
            });
            results.synced++;
            console.log(`✅ Updated receipt for ${tx.id}: ${queryResult.MpesaReceiptNumber}`);
          }
        }
      } catch (err) {
        results.failed++;
        results.errors.push({ id: tx.id, error: err.message });
        console.log(`⚠️ Failed to sync ${tx.id}: ${err.message}`);
      }
    }
    
    res.json({
      success: true,
      message: `Synced ${results.synced} receipts, ${results.failed} failed`,
      data: results
    });
  } catch (error) {
    console.error('Sync receipts error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Force re-query a specific transaction
router.post('/admin/requery/:transactionId', async (req, res) => {
  try {
    const { transactionId } = req.params;
    console.log(`🔍 Force re-querying transaction: ${transactionId}`);
    
    // Get transaction from Firebase
    const transactions = await getAllTransactions(500);
    const tx = transactions.find(t => t.id === transactionId || t.checkoutRequestId === transactionId);
    
    if (!tx) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    if (!tx.checkoutRequestId) {
      return res.status(400).json({ success: false, message: 'No checkoutRequestId for this transaction' });
    }
    
    console.log(`📋 Found transaction, querying M-Pesa for: ${tx.checkoutRequestId}`);
    const queryResult = await querySTKPushStatus(tx.checkoutRequestId);
    console.log('📱 M-Pesa Query Result:', JSON.stringify(queryResult, null, 2));
    
    let updated = false;
    let newData = {};

    // Normalize M-Pesa result fields across formats
    const resultCode = queryResult?.ResultCode ?? queryResult?.errorCode ?? null;
    const resultDesc = queryResult?.ResultDesc ?? queryResult?.errorMessage ?? queryResult?.errorDescription ?? null;

    newData.lastRequeryAt = new Date().toISOString();
    newData.lastRequeryResultCode = resultCode;
    newData.lastRequeryResultDesc = resultDesc;
    
    if (resultCode === '0' || resultCode === 0) {
      newData.status = 'completed';
      newData.resultDesc = resultDesc || 'Success';
      if (queryResult.MpesaReceiptNumber) {
        newData.mpesaReceiptNumber = queryResult.MpesaReceiptNumber;
        newData.transactionCode = queryResult.MpesaReceiptNumber;
      }
      updated = true;
    } else if (resultCode === 'pending') {
      // Still pending – keep it pending, but store a human-readable reason
      newData.status = tx.status || 'pending';
      newData.resultDesc = resultDesc || 'Transaction is still being processed';
      newData.resultCode = 'pending';
      updated = true;
    } else if (resultCode) {
      newData.status = 'failed';
      newData.resultDesc = resultDesc || `Failed with code: ${resultCode}`;
      newData.resultCode = resultCode;
      updated = true;
    } else {
      // Unknown response – keep current status but record what we got
      newData.status = tx.status || 'pending';
      if (!newData.resultDesc) newData.resultDesc = 'Unable to determine M-Pesa status. Please retry re-query.';
      updated = true;
    }
    
    if (updated && Object.keys(newData).length > 0) {
      await updatePaymentTransaction(tx.checkoutRequestId, newData);
      console.log('✅ Transaction updated:', newData);
    }
    
    res.json({
      success: true,
      transaction: tx,
      mpesaResult: queryResult,
      updated,
      newData
    });
  } catch (error) {
    console.error('Requery error:', error);
    res.status(500).json({ success: false, message: error.message });
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

// Debug: View all in-memory payments (useful for debugging callback issues)
router.get('/debug/payments', async (req, res) => {
  try {
    const payments = PaymentStore.getAllPayments();
    res.json({
      success: true,
      message: 'In-memory payment store',
      count: payments.length,
      data: payments
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Debug: Simulate a successful callback (for testing)
router.post('/debug/simulate-callback', async (req, res) => {
  try {
    const { checkoutRequestId, mpesaReceiptNumber } = req.body;

    if (!checkoutRequestId) {
      return res.status(400).json({
        success: false,
        message: 'checkoutRequestId is required'
      });
    }

    const payment = PaymentStore.getPaymentByCheckoutId(checkoutRequestId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found for this checkoutRequestId'
      });
    }

    // Simulate successful callback
    const simulatedReceipt = mpesaReceiptNumber || `SIM${Date.now().toString().slice(-8)}`;

    PaymentStore.updatePaymentStatus(payment.sessionId, 'completed', 'Simulated successful payment', {
      MpesaReceiptNumber: simulatedReceipt,
      mpesaReceiptNumber: simulatedReceipt,
      Amount: payment.amount,
      PhoneNumber: payment.phoneNumber,
      TransactionDate: new Date().toISOString()
    });

    // Update Firebase
    await updatePaymentTransaction(checkoutRequestId, {
      status: 'completed',
      resultDesc: 'Simulated successful payment',
      mpesaReceiptNumber: simulatedReceipt,
      transactionCode: simulatedReceipt
    });

    res.json({
      success: true,
      message: 'Callback simulated successfully',
      data: {
        sessionId: payment.sessionId,
        mpesaReceiptNumber: simulatedReceipt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Admin: Sync pending Firebase transactions by querying M-Pesa
router.post('/admin/sync-pending', async (req, res) => {
  try {
    const { getAllTransactions: getAll } = require('../utils/firebaseAdmin');

    // Get all pending transactions from Firebase
    const pendingTransactions = await getAll(50, 'pending');
    console.log(`🔄 Found ${pendingTransactions.length} pending transactions to sync`);

    const results = {
      total: pendingTransactions.length,
      updated: 0,
      stillPending: 0,
      failed: 0,
      errors: []
    };

    for (const tx of pendingTransactions) {
      if (!tx.checkoutRequestId) {
        results.errors.push({ id: tx.id, error: 'No checkoutRequestId' });
        continue;
      }

      try {
        console.log(`📡 Querying status for: ${tx.checkoutRequestId}`);
        const queryResult = await querySTKPushStatus(tx.checkoutRequestId);
        console.log('   Result:', JSON.stringify(queryResult, null, 2));

        if (queryResult.ResultCode === '0' || queryResult.ResultCode === 0) {
          // Success - update to completed
          await updatePaymentTransaction(tx.checkoutRequestId, {
            status: 'completed',
            resultDesc: queryResult.ResultDesc || 'The service request is processed successfully.',
            syncedAt: new Date().toISOString()
          });
          results.updated++;
          console.log(`   ✅ Updated to completed`);
        } else if (queryResult.ResultCode === 'pending' || queryResult.status === 'pending') {
          // Still pending
          results.stillPending++;
          console.log(`   ⏳ Still pending`);
        } else {
          // Failed
          await updatePaymentTransaction(tx.checkoutRequestId, {
            status: 'failed',
            resultDesc: queryResult.ResultDesc || 'Payment failed',
            resultCode: queryResult.ResultCode,
            syncedAt: new Date().toISOString()
          });
          results.failed++;
          console.log(`   ❌ Marked as failed: ${queryResult.ResultDesc}`);
        }
      } catch (err) {
        results.errors.push({ id: tx.id, checkoutRequestId: tx.checkoutRequestId, error: err.message });
        console.log(`   ⚠️ Error: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: 'Sync completed',
      results
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Admin: Manually update a transaction's status and receipt
router.post('/admin/update-transaction', async (req, res) => {
  try {
    const { transactionId, checkoutRequestId, status, mpesaReceiptNumber } = req.body;

    if (!transactionId && !checkoutRequestId) {
      return res.status(400).json({
        success: false,
        message: 'Either transactionId or checkoutRequestId is required'
      });
    }

    const updateData = {
      updatedAt: new Date().toISOString(),
      manuallyUpdated: true
    };

    if (status) updateData.status = status;
    if (mpesaReceiptNumber) {
      updateData.mpesaReceiptNumber = mpesaReceiptNumber;
      updateData.transactionCode = mpesaReceiptNumber;
    }

    let success = false;

    if (checkoutRequestId) {
      success = await updatePaymentTransaction(checkoutRequestId, updateData);
    } else if (transactionId) {
      // Update directly by document ID
      const { getFirestore } = require('../utils/firebaseAdmin');
      const db = getFirestore();
      const docRef = db.collection('transactions').doc(transactionId);
      await docRef.update(updateData);
      success = true;
    }

    if (success) {
      res.json({
        success: true,
        message: 'Transaction updated successfully',
        data: updateData
      });
    } else {
      res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
  } catch (error) {
    console.error('Update transaction error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =====================================================
// VERIFY BY M-PESA CODE (One-time use)
// =====================================================
router.post('/verify-mpesa-code', async (req, res) => {
  try {
    const { mpesaCode, category } = req.body;

    if (!mpesaCode) {
      return res.status(400).json({
        success: false,
        message: 'M-Pesa transaction code is required'
      });
    }

    // Find transaction by M-Pesa receipt number
    const transaction = await getTransactionByMpesaCode(mpesaCode.toUpperCase());

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'No payment found with this M-Pesa code. Please check and try again.'
      });
    }

    // Check if payment was successful
    if (transaction.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: `This payment is ${transaction.status}. Only completed payments can be used.`
      });
    }

    // Check if already used (one-time use)
    if (transaction.used) {
      return res.status(400).json({
        success: false,
        message: 'This M-Pesa code has already been used to view results. Each code can only be used once.',
        usedAt: transaction.usedAt
      });
    }

    // Check category match if specified
    if (category && transaction.category !== category) {
      return res.status(400).json({
        success: false,
        message: `This payment was for ${transaction.category} package, not ${category}.`,
        actualCategory: transaction.category
      });
    }

    // Mark as used
    await markTransactionAsUsed(transaction.id);

    res.json({
      success: true,
      message: 'Payment verified successfully',
      hasAccess: true,
      data: {
        sessionId: transaction.sessionId,
        category: transaction.category,
        amount: transaction.amount,
        mpesaCode: transaction.mpesaReceiptNumber,
        paidAt: transaction.createdAt
      }
    });

  } catch (error) {
    console.error('Verify M-Pesa code error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// =====================================================
// ADMIN BULK DELETE ENDPOINT
// =====================================================

// Bulk delete transactions
router.post('/admin/transactions/bulk-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of transaction IDs is required'
      });
    }

    const result = await bulkDeleteTransactions(ids);
    
    if (result) {
      res.json({
        success: true,
        message: `Successfully deleted ${ids.length} transactions`
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Failed to delete transactions'
      });
    }
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
