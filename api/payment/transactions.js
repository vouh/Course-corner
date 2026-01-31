/**
 * Admin Transactions API
 * GET /api/payment/transactions - Get all transactions
 * GET /api/payment/transactions?status=completed - Filter by status
 */
const { getAllTransactions } = require('../utils/firebase');

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
    const { limit, status } = req.query;

    const transactions = await getAllTransactions(
      parseInt(limit) || 100,
      status || null
    );

    // Calculate stats
    const stats = {
      total: transactions.length,
      completed: 0,
      pending: 0,
      failed: 0,
      totalAmount: 0,
      completedAmount: 0
    };

    transactions.forEach(tx => {
      if (tx.status === 'completed') {
        stats.completed++;
        stats.completedAmount += tx.amount || 0;
      } else if (tx.status === 'failed') {
        stats.failed++;
      } else {
        stats.pending++;
      }
      stats.totalAmount += tx.amount || 0;
    });

    res.json({
      success: true,
      stats: stats,
      data: transactions
    });

  } catch (error) {
    console.error('Admin transactions error:', error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
