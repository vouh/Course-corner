const { getAllReferrers, getPendingWithdrawals, processWithdrawal, syncReferralStats } = require('../utils/firebase');

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

      if (action === 'sync-referrals' || action === 'syncReferrals') {
        const result = await syncReferralStats();
        if (result.success) {
          return res.json({
            success: true,
            message: `Synced ${result.updated} referrers successfully.`,
            details: result
          });
        } else {
          return res.status(500).json({
            success: false,
            message: result.error || 'Failed to sync referrals'
          });
        }
      }

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
