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

      // Extract receipt number, amount, and phone directly from callback
      let mpesaReceiptNumber = null;
      let extractedAmount = null;
      let extractedPhone = null;

      console.log('📱 Extracting data from M-Pesa callback...');
      callbackMetadata.forEach(item => {
        if (!item.Name) return;

        const itemName = item.Name.toLowerCase();
        console.log(`   ${item.Name}: ${item.Value}`);

        // Extract receipt
        if (itemName === 'mpesareceiptnumber') {
          mpesaReceiptNumber = String(item.Value || '').trim();
          console.log(`🎯 RECEIPT FOUND: "${mpesaReceiptNumber}"`);
        }
        // Extract amount and phone for recovery
        if (item.Name === 'Amount') extractedAmount = item.Value;
        if (item.Name === 'PhoneNumber') extractedPhone = item.Value;
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

        // Recovery Mode: Use extracted values from earlier loop
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

      // Use EXACT SAME structure as failed transactions (which work!)
      const successData = {
        sessionId: paymentData?.sessionId || `unknown-${checkoutRequestID}`,
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
      const successTxId = await saveTransaction(successData);

      if (successTxId) {
        console.log('✅ Transaction marked as successful:', resultDesc, '| ID:', successTxId);
        callbackLog.steps.push({ step: 'Successful transaction saved', transactionId: successTxId, success: true });
        callbackLog.transactionId = successTxId;
        callbackLog.success = true;
      } else {
        console.error('⚠️ Successful transaction may not have been saved to Firebase!');
        callbackLog.steps.push({ step: 'Successful transaction save returned null', success: false });
      }

      console.log('   M-Pesa Receipt Number:', mpesaReceiptNumber || 'NOT FOUND IN CALLBACK');
      callbackLog.mpesaReceiptNumber = mpesaReceiptNumber;

      // Update in-memory tracking
      if (sessionId) {
        global.payments[sessionId].status = 'completed';
        global.payments[sessionId].mpesaReceiptNumber = mpesaReceiptNumber;
        // REMOVED: metadata update - causes undefined values in Firestore
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
