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

    // Find payment by checkout request ID
    global.payments = global.payments || {};
    let payment = null;
    
    for (const sessionId in global.payments) {
      if (global.payments[sessionId].checkoutRequestId === checkoutRequestID) {
        payment = global.payments[sessionId];
        break;
      }
    }

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

        payment.status = 'completed';
        payment.resultDesc = resultDesc;
        payment.metadata = metadata;
        payment.updatedAt = new Date();
        
        console.log('💾 Payment data saved:', metadata);
      } else {
        // Payment failed
        console.log('❌ Payment failed for session:', payment.sessionId);
        console.log('Reason:', resultDesc);
        payment.status = 'failed';
        payment.resultDesc = resultDesc;
        payment.updatedAt = new Date();
      }
    } else {
      console.warn('⚠️ Payment session not found for checkout ID:', checkoutRequestID);
    }

    // Acknowledge callback receipt
    res.json({ ResultCode: 0, ResultDesc: 'Callback received and processed successfully' });

  } catch (error) {
    console.error('❌ Callback Error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
};
