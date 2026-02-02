/**
 * Admin Transactions API - Unified endpoint for admin dashboard
 * This fetches transactions directly from Firebase
 * 
 * GET /api/admin/transactions - Get all transactions
 * GET /api/admin/transactions?status=completed - Filter by status
 * GET /api/admin/transactions?limit=50 - Limit results
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
    console.log('📊 Admin transactions request received');
    
    const { limit, status } = req.query;
    const limitNum = parseInt(limit) || 200;
    
    console.log(`🔍 Fetching transactions: limit=${limitNum}, status=${status || 'all'}`);

    const transactions = await getAllTransactions(limitNum, status || null);

    console.log(`✅ Retrieved ${transactions.length} transactions from Firebase`);

    // Calculate stats from transactions
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
      count: transactions.length,
      data: transactions
    });

  } catch (error) {
    console.error('❌ Admin transactions error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
