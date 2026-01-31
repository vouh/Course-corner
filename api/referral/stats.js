/**
 * Get Referral Stats API
 * GET /api/referral/stats?userId=xxx
 */
const { getReferralStats } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    const stats = await getReferralStats(userId);

    if (!stats) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Referral stats error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
