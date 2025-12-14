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
    const { sessionId, category } = req.body;

    if (!sessionId) {
      return res.status(400).json({ 
        success: false, 
        hasAccess: false, 
        message: 'Session ID is required' 
      });
    }

    global.payments = global.payments || {};
    const payment = global.payments[sessionId];

    if (!payment) {
      return res.json({
        success: true,
        hasAccess: false,
        message: 'No payment found for this session'
      });
    }

    const hasAccess = payment.status === 'completed' && 
                      (!category || payment.category === category);

    res.json({
      success: true,
      hasAccess,
      data: {
        category: payment.category,
        status: payment.status,
        amount: payment.amount
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, hasAccess: false, message: error.message });
  }
};
