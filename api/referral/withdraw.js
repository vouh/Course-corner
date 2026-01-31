/**
 * Withdrawal Request API
 * POST /api/referral/withdraw
 * Body: { userId, amount, mpesaPhone }
 */
const { createWithdrawalRequest } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { userId, amount, mpesaPhone } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'Valid amount is required' });
    }

    if (!mpesaPhone) {
      return res.status(400).json({ success: false, message: 'M-Pesa phone number is required' });
    }

    const result = await createWithdrawalRequest(userId, parseInt(amount), mpesaPhone);

    if (result.success) {
      res.json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        withdrawalId: result.withdrawalId
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.error
      });
    }

  } catch (error) {
    console.error('Withdrawal request error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
