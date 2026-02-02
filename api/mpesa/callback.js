const { saveTransaction, creditReferrer } = require('../utils/firebase');

// Helper to store logs for admin viewing
function logToAdmin(logEntry) {
  global.recentCallbackLogs = global.recentCallbackLogs || [];
  global.recentCallbackLogs.push({
    ...logEntry,
    timestamp: new Date().toISOString()
  });
  if (global.recentCallbackLogs.length > 50) {
    global.recentCallbackLogs = global.recentCallbackLogs.slice(-50);
  }
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

  const callbackLog = {
    type: 'callback',
    timestamp: new Date().toISOString(),
    steps: []
  };

  try {
    const callbackData = req.body;
    console.log('📱 M-Pesa Callback Received:', new Date().toISOString());
    console.log(JSON.stringify(callbackData, null, 2));

    callbackLog.steps.push({ step: 'Callback received', time: new Date().toISOString() });

    // Extract callback data
    const stkCallback = callbackData.Body?.stkCallback;

    if (!stkCallback) {
      console.error('Invalid callback structure');
      callbackLog.error = 'Invalid callback structure';
      logToAdmin(callbackLog);
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback structure' });
    }

    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    callbackLog.checkoutRequestID = checkoutRequestID;
    callbackLog.resultCode = resultCode;
    callbackLog.resultDesc = resultDesc;

    if (resultCode === 0) {
      // ============================================
      // COMPREHENSIVE RECEIPT EXTRACTION ALGORITHM
      // (Based on proven Spectre Tech system)
      // ============================================
      console.log('✅ ResultCode = 0: Payment SUCCESSFUL');
      callbackLog.steps.push({ step: 'Payment SUCCESSFUL', status: 'completed' });

      // Get CallbackMetadata items array
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];

      // DEBUG: Log raw callback structure before extraction
      console.log('📦 RAW CallbackMetadata.Item[] array:');
      console.log(JSON.stringify(callbackMetadata, null, 2));

      // Extract all metadata fields for inspection (SAFE for Firestore)
      const metadataObj = {};
      callbackMetadata.forEach(item => {
        if (item.Name) {
          metadataObj[item.Name] = item.Value !== undefined ? item.Value : null;
          console.log(`   ${item.Name}: ${item.Value}`);
        }
      });

      // Extract receipt with CASE-INSENSITIVE matching
      let mpesaReceiptNumber = null;

      for (const item of callbackMetadata) {
        const itemName = (item.Name || '').toLowerCase();
        // Match 'MpesaReceiptNumber' case-insensitively
        if (itemName === 'mpesareceiptnumber') {
          mpesaReceiptNumber = String(item.Value || '').trim();
          console.log(`🎯 RECEIPT FOUND! Name="${item.Name}" → Value="${mpesaReceiptNumber}"`);
          break;
        }
      }

      // DEBUG: Log extraction result
      if (mpesaReceiptNumber) {
        console.log(`✅ Receipt extracted successfully: "${mpesaReceiptNumber}"`);
      } else {
        console.error('❌ CRITICAL: Receipt NOT FOUND in callback metadata!');
        console.error('Available fields:', Object.keys(metadataObj).join(', '));
        // Fallback: try to find it by checking all fields
        for (const key in metadataObj) {
          if (key.toLowerCase().includes('receipt')) {
            mpesaReceiptNumber = String(metadataObj[key]).trim();
            console.warn('⚠️ Found receipt in alternate field:', key, '→', mpesaReceiptNumber);
            break;
          }
        }
      }

      // Build metadata object for reference (optional)
      const metadata = {};
      callbackMetadata.forEach(item => {
        metadata[item.Name] = item.Value;
      });

      // Get payment data from in-memory store
      global.payments = global.payments || {};
      let paymentData = null;
      let sessionId = null;

      for (const sid in global.payments) {
        if (global.payments[sid].checkoutRequestId === checkoutRequestID) {
          paymentData = global.payments[sid];
          sessionId = sid;
          break;
        }
      }


      if (!paymentData) {
        console.warn('⚠️ Payment data not found in memory for checkoutRequestID:', checkoutRequestID);
        console.log('🔄 Attempting to recover transaction details from Callback Metadata...');

        // Recovery Mode: Extract details directly from metadata
        const extractedAmount = metadataObj['Amount'];
        const extractedPhone = metadataObj['PhoneNumber'];

        if (extractedAmount && extractedPhone) {
          console.log('✅ Recovered details from metadata:', { amount: extractedAmount, phone: extractedPhone });

          paymentData = {
            sessionId: `recovered-${checkoutRequestID}`,
            phoneNumber: extractedPhone,
            amount: Number(extractedAmount),
            category: 'general', // Default category since we can't know the original
            merchantRequestId: null,
            status: 'pending'
          };
        } else {
          console.error('❌ Critical: Could not recover Amount or PhoneNumber from metadata.');
          console.error('❌ Payment data lost and unrecoverable.');
          return res.json({ ResultCode: 1, ResultDesc: 'Payment record not found and unrecoverable' });
        }
      }

      // CREATE transaction in Firebase (not UPDATE - since we didn't save on STK Push)
      const transactionData = {
        sessionId: paymentData?.sessionId || `success-${checkoutRequestID}`,
        phoneNumber: paymentData?.phoneNumber || 'unknown',
        amount: paymentData?.amount || 0,
        category: paymentData?.category || 'unknown',
        status: 'completed',
        checkoutRequestId: checkoutRequestID,
        merchantRequestId: paymentData?.merchantRequestId || null,
        mpesaReceiptNumber: mpesaReceiptNumber || null,
        transactionCode: mpesaReceiptNumber || null,
        resultDesc: resultDesc,
        resultCode: 0,
        completedAt: new Date().toISOString(),
        callbackReceivedAt: new Date().toISOString()
      };

      console.log('💾 Saving SUCCESSFUL transaction to Firebase...');
      console.log('📋 Transaction data:', JSON.stringify(transactionData, null, 2));

      callbackLog.steps.push({ step: 'Calling saveTransaction for SUCCESS', transactionData });

      let transactionId = null;
      try {
        console.log('🔄 About to call saveTransaction...');
        transactionId = await saveTransaction(transactionData);
        console.log('✅ saveTransaction returned:', transactionId);
      } catch (saveError) {
        console.error('❌❌❌ CRITICAL ERROR in saveTransaction call:');
        console.error('   Error message:', saveError.message);
        console.error('   Error stack:', saveError.stack);
        console.error('   Error name:', saveError.name);
        console.error('   Full error object:', JSON.stringify(saveError, Object.getOwnPropertyNames(saveError)));
        callbackLog.steps.push({
          step: 'saveTransaction threw error',
          error: saveError.message,
          stack: saveError.stack
        });
      }

      if (transactionId) {
        console.log('✅ Payment successful, transaction CREATED:', transactionId);
        callbackLog.steps.push({ step: 'Transaction saved', transactionId, success: true });
        callbackLog.transactionId = transactionId;
        callbackLog.success = true;
      } else {
        console.error('⚠️ Transaction may not have been saved to Firebase! Check Firebase credentials.');
        callbackLog.steps.push({ step: 'Transaction save returned null', success: false });
        callbackLog.warning = 'Transaction ID is null - check Firebase credentials';
      }
      console.log('   M-Pesa Receipt Number:', mpesaReceiptNumber || 'NOT FOUND IN CALLBACK');
      callbackLog.mpesaReceiptNumber = mpesaReceiptNumber;

      // Update in-memory tracking
      if (sessionId) {
        global.payments[sessionId].status = 'completed';
        global.payments[sessionId].mpesaReceiptNumber = mpesaReceiptNumber;
        global.payments[sessionId].metadata = metadataObj;
        global.payments[sessionId].transactionId = transactionId;
      }

      logToAdmin(callbackLog);
    } else {
      // Payment failed (ResultCode != 0)
      console.log(`❌ ResultCode = ${resultCode}: Payment FAILED`);
      console.log(`📝 Failure Reason: ${resultDesc}`);

      // Get payment data from in-memory store
      global.payments = global.payments || {};
      let paymentData = null;
      let sessionId = null;

      for (const sid in global.payments) {
        if (global.payments[sid].checkoutRequestId === checkoutRequestID) {
          paymentData = global.payments[sid];
          sessionId = sid;
          break;
        }
      }

      // Even if paymentData not found, try to save the failed transaction with available info
      const failureData = {
        sessionId: paymentData?.sessionId || `unknown-${checkoutRequestID}`,
        phoneNumber: paymentData?.phoneNumber || 'unknown',
        amount: paymentData?.amount || 0,
        category: paymentData?.category || 'unknown',
        status: 'failed',
        checkoutRequestId: checkoutRequestID,
        merchantRequestId: paymentData?.merchantRequestId || null,
        resultDesc: resultDesc,
        resultCode: resultCode,
        failureReason: resultDesc,
        failedAt: new Date().toISOString(),
        callbackReceivedAt: new Date().toISOString()
      };

      console.log('💾 Saving failed transaction to Firebase...');
      const failedTxId = await saveTransaction(failureData);

      if (failedTxId) {
        console.log('❌ Transaction marked as failed:', resultDesc, '| ID:', failedTxId);
        callbackLog.steps.push({ step: 'Failed transaction saved', transactionId: failedTxId, success: true });
        callbackLog.transactionId = failedTxId;
      } else {
        console.error('⚠️ Failed transaction may not have been saved to Firebase!');
        callbackLog.steps.push({ step: 'Failed transaction save returned null', success: false });
      }

      callbackLog.success = false;
      callbackLog.failureReason = resultDesc;

      // Update in-memory if we have the session
      if (sessionId && paymentData) {
        global.payments[sessionId].status = 'failed';
        global.payments[sessionId].resultDesc = resultDesc;
      }

      logToAdmin(callbackLog);
    }

    // Acknowledge callback receipt
    res.json({ ResultCode: 0, ResultDesc: 'Callback received and processed successfully' });

  } catch (error) {
    console.error('❌ Callback Error:', error);
    console.error('Stack:', error.stack);

    if (typeof callbackLog !== 'undefined') {
      callbackLog.error = error.message;
      callbackLog.stack = error.stack;
      logToAdmin(callbackLog);
    }

    res.status(500).json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
};
