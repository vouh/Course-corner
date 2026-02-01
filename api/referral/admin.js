/**
 * Admin Referral Endpoints API
 * GET /api/referral/admin - Get all referrers and pending withdrawals
 * GET /api/referral/admin?action=referrers - Get all referrers only
 * GET /api/referral/admin?action=withdrawals - Get pending withdrawals only
 * POST /api/referral/admin - Process withdrawal
 */
const { getAllReferrers, getPendingWithdrawals, processWithdrawal } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const { action } = req.query;

      if (action === 'referrers') {
        const referrers = await getAllReferrers();
        return res.json({
          success: true,
          data: referrers
        });
      }

      if (action === 'withdrawals') {
        const withdrawals = await getPendingWithdrawals();
        return res.json({
          success: true,
          data: withdrawals
        });
      }

      // Default: return both referrers and withdrawals
      const [referrers, pendingWithdrawals] = await Promise.all([
        getAllReferrers(),
        getPendingWithdrawals()
      ]);

      return res.json({
        success: true,
        data: {
          referrers,
          pendingWithdrawals
        }
      });
    }

    if (req.method === 'POST') {
      const { action, withdrawalId, adminId, mpesaReference } = req.body;

      if (action === 'process-withdrawal' || action === 'processWithdrawal') {
        if (!withdrawalId) {
          return res.status(400).json({ success: false, message: 'Withdrawal ID is required' });
        }

        const result = await processWithdrawal(withdrawalId, adminId || 'admin', mpesaReference);

        if (result.success) {
          return res.json({
            success: true,
            message: 'Withdrawal processed successfully'
          });
        } else {
          return res.status(400).json({
            success: false,
            message: result.error
          });
        }
      }

      return res.status(400).json({ success: false, message: 'Invalid action' });
    }

    return res.status(405).json({ success: false, message: 'Method not allowed' });

  } catch (error) {
    console.error('Admin referral error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
