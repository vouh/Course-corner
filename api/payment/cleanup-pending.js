/**
 * Cleanup old pending transactions
 * Run this periodically to mark stale pending transactions as expired
 */

const { admin: firebaseAdmin, db: firestoreDb } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { db } = await require('../utils/firebase').initializeFirebase();
    if (!db) {
      return res.status(500).json({ success: false, message: 'Firebase not available' });
    }

    // Find pending transactions older than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const snapshot = await db.collection('transactions')
      .where('status', '==', 'pending')
      .where('createdAt', '<', fiveMinutesAgo)
      .get();

    const updates = [];
    const failed = [];

    for (const doc of snapshot.docs) {
      try {
        await doc.ref.update({
          status: 'expired',
          resultDesc: 'Transaction expired - no response from M-Pesa',
          updatedAt: new Date()
        });
        updates.push(doc.id);
      } catch (error) {
        failed.push({ id: doc.id, error: error.message });
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${updates.length} expired transactions`,
      updated: updates.length,
      failed: failed.length,
      details: {
        updated,
        failed
      }
    });

  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};
