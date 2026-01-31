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
    const payment = await getTransactionBySessionId(sessionId);

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment session not found' });
    }

    res.json({
      success: true,
      data: {
        sessionId: payment.sessionId,
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        mpesaReceiptNumber: payment.mpesaReceiptNumber || null,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt || payment.createdAt
      }
    });

  } catch (error) {
    console.error('Status check error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
