const { getTransactionBySessionId } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.query;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }

    // Get payment from Firebase (with in-memory fallback)
    let payment = await getTransactionBySessionId(sessionId);

    // FIX: If not found by sessionId, try finding by checkoutRequestId (handles server restarts)
    if (!payment && req.query.checkoutRequestId) {
      console.log('🔄 Session not found, trying lookup by checkoutRequestId:', req.query.checkoutRequestId);
      const { getTransactionByCheckoutId } = require('../utils/firebase');
      payment = await getTransactionByCheckoutId(req.query.checkoutRequestId);
    }

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment session not found' });
    }

    res.json({
      success: true,
      data: {
        sessionId: payment.sessionId, // This might be "recovered-..." which is fine, we just need the status
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        resultDesc: payment.resultDesc || null,
        mpesaReceiptNumber: payment.mpesaReceiptNumber || payment.transactionCode || null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt || payment.createdAt
      }
    });

  } catch (error) {
    console.error('Status check error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
