const { updateTransactionByCheckoutId, getTransactionByCheckoutId, creditReferrer, saveTransaction } = require('../utils/firebase');

// Helper function to update transaction with retry
async function updateTransactionWithRetry(checkoutRequestID, updateData, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`📝 Updating transaction (attempt ${attempt}/${maxRetries})...`);
      const transactionId = await updateTransactionByCheckoutId(checkoutRequestID, updateData);
      console.log(`✅ Transaction updated successfully on attempt ${attempt}`);
      return transactionId;
    } catch (error) {
      lastError = error;
      console.error(`❌ Update attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        // Wait before retrying (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
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
      // ============================================
      console.log('✅ ResultCode = 0: Payment SUCCESSFUL');
      
      // Get CallbackMetadata items array
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
      
      // DEBUG: Log raw callback structure before extraction
      console.log('📦 RAW CallbackMetadata.Item[] array:');
      console.log(JSON.stringify(callbackMetadata, null, 2));
      
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
      
      // Build metadata object for reference (optional)
      const metadata = {};
      callbackMetadata.forEach(item => {
        metadata[item.Name] = item.Value;
      });
      
      // SAVE (CREATE) transaction in Firebase since we skipped initial save
      const updateData = {
        status: 'completed',
        resultDesc: resultDesc,
        mpesaReceiptNumber: mpesaReceiptNumber,
        transactionCode: mpesaReceiptNumber,
        metadata: metadata,
        completedAt: new Date().toISOString(),
        callbackReceivedAt: new Date().toISOString()
      };
      
      // Get payment details from in-memory store
      global.payments = global.payments || {};
      let payment = null;
      for (const sessionId in global.payments) {
        if (global.payments[sessionId].checkoutRequestId === checkoutRequestID) {
          payment = global.payments[sessionId];
          break;
        }
      }
      
      let transactionId;
      if (payment) {
        // CREATE new transaction with all details
        const transactionData = {
          sessionId: payment.sessionId,
          phoneNumber: payment.phoneNumber,
          amount: payment.amount,
          category: payment.category,
          checkoutRequestId: payment.checkoutRequestId,
          merchantRequestId: payment.merchantRequestId,
          referralCode: payment.referralCode,
          ...updateData
        };
        
        console.log('📝 Saving transaction with data:', JSON.stringify(transactionData, null, 2));
        transactionId = await saveTransaction(transactionData);
        
        if (transactionId) {
          console.log('✅ Transaction CREATED successfully in Firebase:', transactionId);
        } else {
          console.error('❌ Transaction creation returned null/empty ID');
          throw new Error('saveTransaction returned no ID');
        }
      } else {
        // FALLBACK: Payment not found in memory (happens on serverless cold starts)
        // Extract phone number and amount from M-Pesa metadata
        console.warn('⚠️ Payment not found in memory (serverless cold start?). Creating from callback metadata.');
        
        let phoneNumber = null;
        let amount = null;
        
        for (const item of callbackMetadata) {
          if (item.Name === 'PhoneNumber') {
            phoneNumber = item.Value;
          }
          if (item.Name === 'Amount') {
            amount = item.Value;
          }
        }
        
        if (!phoneNumber || !amount) {
          console.error('❌ Cannot extract phone number or amount from callback metadata');
          console.error('Available metadata:', callbackMetadata.map(i => `${i.Name}=${i.Value}`).join(', '));
          throw new Error('Missing required payment info in callback');
        }
        
        // CREATE transaction with callback data (limited info, but still saves the payment)
        const fallbackData = {
          phoneNumber: phoneNumber,
          amount: amount,
          checkoutRequestId: checkoutRequestID,
          merchantRequestId: stkCallback.MerchantRequestID,
          status: 'completed',
          resultDesc: resultDesc,
          mpesaReceiptNumber: mpesaReceiptNumber,
          transactionCode: mpesaReceiptNumber,
          metadata: metadata,
          completedAt: new Date().toISOString(),
          callbackReceivedAt: new Date().toISOString()
        };
        
        console.log('📝 Saving fallback transaction:', JSON.stringify(fallbackData, null, 2));
        transactionId = await saveTransaction(fallbackData);
        
        if (transactionId) {
          console.log('✅ Fallback transaction CREATED in Firebase:', transactionId);
        } else {
          console.error('❌ Fallback transaction creation returned null/empty');
          throw new Error('saveTransaction returned no ID');
        }
      }

      console.log('✅ Payment successful, transaction updated:', transactionId);
      console.log('   M-Pesa Code Stored:', mpesaReceiptNumber || 'NULL - Code not in callback');

      // Credit referrer if applicable (12% commission)
      try {
        // Fetch the full transaction to ensure we have referral information
        // (especially if memory was cleared or it's a cold start)
        const transaction = await getTransactionByCheckoutId(checkoutRequestID);
        
        if (transaction && transaction.referralCode) {
          console.log('💰 Processing referral commission for code:', transaction.referralCode);
          await creditReferrer(transaction.referralCode, transaction.amount, transactionId || transaction.id);
        } else {
          console.log('ℹ️ No referral code found for this transaction');
          
          // Fallback legacy check
          global.payments = global.payments || {};
          for (const sessionId in global.payments) {
            if (global.payments[sessionId].checkoutRequestId === checkoutRequestID) {
              const payment = global.payments[sessionId];
              if (payment.referralCode) {
                console.log('💰 (Fallback) Processing referral commission for code:', payment.referralCode);
                await creditReferrer(payment.referralCode, payment.amount, transactionId || payment.id);
              }
              // Update in-memory too
              payment.status = 'completed';
              payment.mpesaReceiptNumber = mpesaReceiptNumber;
              payment.metadata = metadata;
              break;
            }
          }
        }
      } catch (refError) {
        console.error('❌ Error processing referral:', refError.message);
      }
    } else {
      // Payment failed (ResultCode != 0)
      console.log(`❌ ResultCode = ${resultCode}: Payment FAILED`);
      console.log(`📝 Failure Reason: ${resultDesc}`);
      
      // Get payment data from in-memory store
      global.payments = global.payments || {};
      let payment = null;
      let sessionId = null;
      
      for (const sid in global.payments) {
        if (global.payments[sid].checkoutRequestId === checkoutRequestID) {
          payment = global.payments[sid];
          sessionId = sid;
          break;
        }
      }
      
      if (payment) {
        // CREATE failed transaction in Firebase (not UPDATE)
        const failureData = {
          sessionId: payment.sessionId,
          phoneNumber: payment.phoneNumber,
          amount: payment.amount,
          category: payment.category,
          checkoutRequestId: payment.checkoutRequestId,
          merchantRequestId: payment.merchantRequestId,
          referralCode: payment.referralCode,
          status: 'failed',
          resultDesc: resultDesc,
          failureReason: resultDesc,
          resultCode: resultCode,
          failedAt: new Date().toISOString(),
          callbackReceivedAt: new Date().toISOString()
        };
        
        await saveTransaction(failureData);
        console.log('❌ Transaction CREATED as failed:', resultDesc);
        
        // Update in-memory
        global.payments[sessionId].status = 'failed';
        global.payments[sessionId].resultDesc = resultDesc;
      } else {
        console.error('❌ Payment not found in memory for checkoutRequestID:', checkoutRequestID);
      }
    }

    // Acknowledge callback receipt
    res.json({ ResultCode: 0, ResultDesc: 'Callback received and processed successfully' });

  } catch (error) {
    console.error('❌ Callback Error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
};
