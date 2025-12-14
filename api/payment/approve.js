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
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'Session ID is required' });
    }

    global.payments = global.payments || {};
    const payment = global.payments[sessionId];

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment session not found' });
    }

    if (payment.status !== 'completed') {
      return res.status(403).json({
        success: false,
        message: `Cannot approve. Payment status is: ${payment.status}`,
        status: payment.status
      });
    }

    res.json({
      success: true,
      message: 'Payment verified and approved',
      data: {
        sessionId: payment.sessionId,
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        approved: true,
        accessToken: Buffer.from(sessionId).toString('base64'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
