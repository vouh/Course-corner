const { updateTransactionByCheckoutId, creditReferrer } = require('../utils/firebase');

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
      // Payment successful - extract metadata
      const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
      const metadata = {};
      callbackMetadata.forEach(item => {
        metadata[item.Name] = item.Value;
      });

      const mpesaReceiptNumber = metadata.MpesaReceiptNumber || null;
      
      // Update transaction in Firebase
      const transactionId = await updateTransactionByCheckoutId(checkoutRequestID, {
        status: 'completed',
        resultDesc: resultDesc,
        mpesaReceiptNumber: mpesaReceiptNumber,
        transactionCode: mpesaReceiptNumber,
        metadata: metadata
      });

      console.log('✅ Payment successful, transaction updated:', transactionId);

      // Credit referrer if applicable (12% commission)
      // We need to get the transaction to check for referral code
      // This is handled in the updateTransactionByCheckoutId which also updates in-memory
      global.payments = global.payments || {};
      for (const sessionId in global.payments) {
        if (global.payments[sessionId].checkoutRequestId === checkoutRequestID) {
          const payment = global.payments[sessionId];
          if (payment.referralCode && transactionId) {
            console.log('💰 Processing referral commission for code:', payment.referralCode);
            await creditReferrer(payment.referralCode, payment.amount, transactionId);
          }
          // Update in-memory too
          payment.status = 'completed';
          payment.mpesaReceiptNumber = mpesaReceiptNumber;
          payment.metadata = metadata;
          break;
        }
      }
    } else {
      // Payment failed
      await updateTransactionByCheckoutId(checkoutRequestID, {
        status: 'failed',
        resultDesc: resultDesc
      });
      
      console.log('❌ Payment failed:', resultDesc);

      // Update in-memory
      global.payments = global.payments || {};
      for (const sessionId in global.payments) {
        if (global.payments[sessionId].checkoutRequestId === checkoutRequestID) {
          global.payments[sessionId].status = 'failed';
          global.payments[sessionId].resultDesc = resultDesc;
          break;
        }
      }
    }

    // Acknowledge callback receipt
    res.json({ ResultCode: 0, ResultDesc: 'Callback received and processed successfully' });

  } catch (error) {
    console.error('❌ Callback Error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
};
