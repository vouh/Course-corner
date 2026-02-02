const { saveTransaction, creditReferrer } = require('../utils/firebase');

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
    const callbackData = req.body;
    console.log('📱 M-Pesa Callback Received:', new Date().toISOString());
    console.log(JSON.stringify(callbackData, null, 2));

    // Extract callback data
    const stkCallback = callbackData.Body?.stkCallback;
    
    if (!stkCallback) {
      console.error('Invalid callback structure');
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback structure' });
    }

    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    if (resultCode === 0) {
      // ============================================
      // COMPREHENSIVE RECEIPT EXTRACTION ALGORITHM
      // (Based on proven Spectre Tech system)
      // ============================================
      console.log('✅ ResultCode = 0: Payment SUCCESSFUL');
      
      // Get CallbackMetadata items array
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
      
      // DEBUG: Log raw callback structure before extraction
      console.log('📦 RAW CallbackMetadata.Item[] array:');
      console.log(JSON.stringify(callbackMetadata, null, 2));
      
      // Extract all metadata fields for inspection
      const metadataObj = {};
      callbackMetadata.forEach(item => {
        metadataObj[item.Name] = item.Value;
        console.log(`   ${item.Name}: ${item.Value}`);
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
        sessionId: paymentData.sessionId,
        phoneNumber: paymentData.phoneNumber,
        amount: paymentData.amount,
        category: paymentData.category,
        status: 'completed',
        checkoutRequestId: checkoutRequestID,
        merchantRequestId: paymentData.merchantRequestId || null,
        mpesaReceiptNumber: mpesaReceiptNumber,
        transactionCode: mpesaReceiptNumber,
        resultDesc: resultDesc,
        metadata: metadataObj,
        completedAt: new Date().toISOString(),
        callbackReceivedAt: new Date().toISOString()
      };
      
      const transactionId = await saveTransaction(transactionData);

      console.log('✅ Payment successful, transaction CREATED:', transactionId);
      console.log('   M-Pesa Receipt Number:', mpesaReceiptNumber || 'PENDING - waiting for M-Pesa to send in callback');
      
      // Update in-memory tracking
      if (sessionId) {
        global.payments[sessionId].status = 'completed';
        global.payments[sessionId].mpesaReceiptNumber = mpesaReceiptNumber;
        global.payments[sessionId].metadata = metadataObj;
        global.payments[sessionId].transactionId = transactionId;
      }
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
      
      if (paymentData) {
        // CREATE transaction record for failed payment
        const failureData = {
          sessionId: paymentData.sessionId,
          phoneNumber: paymentData.phoneNumber,
          amount: paymentData.amount,
          category: paymentData.category,
          status: 'failed',
          checkoutRequestId: checkoutRequestID,
          merchantRequestId: paymentData.merchantRequestId || null,
          resultDesc: resultDesc,
          resultCode: resultCode,
          failureReason: resultDesc,
          // referralCode removed - no longer tracking in payment flow
          failedAt: new Date().toISOString(),
          callbackReceivedAt: new Date().toISOString()
        };
        
        await saveTransaction(failureData);
        console.log('❌ Transaction marked as failed:', resultDesc);
        
        // Update in-memory
        global.payments[sessionId].status = 'failed';
        global.payments[sessionId].resultDesc = resultDesc;
      }
    }

    // Acknowledge callback receipt
    res.json({ ResultCode: 0, ResultDesc: 'Callback received and processed successfully' });

  } catch (error) {
    console.error('❌ Callback Error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
};
