/**
 * Validate Referral Code API
 * POST /api/referral/validate
 * Body: { code: "ABC12" }
 */
const { validateReferralCode } = require('../utils/firebase');

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
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Referral code is required' });
    }

    const result = await validateReferralCode(code);

    if (result.valid) {
      res.json({
        success: true,
        valid: true,
        referrerName: result.referrerName,
        commissionRate: result.commissionRate,
        isAdminCode: result.isAdminCode,
        accountType: result.accountType,
        message: `Code belongs to ${result.referrerName} (${result.commissionRate}% commission)`
      });
    } else {
      res.json({
        success: true,
        valid: false,
        message: 'Invalid referral code'
      });
    }

  } catch (error) {
    console.error('Referral validation error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
