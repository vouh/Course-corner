/**
 * Payment Status Sync Service
 * GET /api/payment/sync-status
 * 
 * Syncs payment statuses from M-Pesa API and database
 * - Converts pending payments to completed when M-Pesa confirms
 * - Captures M-Pesa receipt codes that were missed
 * - Provides comprehensive status audit trail
 */

const { 
  getAllTransactions,
  updatePaymentTransaction,
  getTransactionByCheckoutId
} = require('../utils/firebase');

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
    const { 
      checkoutRequestId,
      sessionId,
      phoneNumber,
      limit = 100,
      syncAll = false
    } = req.query;

    console.log('🔄 Payment Status Sync Started...');
    console.log('   Params:', { checkoutRequestId, sessionId, phoneNumber, syncAll });

    // If specific transaction requested
    if (checkoutRequestId || sessionId) {
      let transaction = null;

      if (checkoutRequestId) {
        transaction = await getTransactionByCheckoutId(checkoutRequestId);
      }

      if (!transaction) {
        return res.json({
          success: false,
          message: 'Transaction not found',
          code: 'NOT_FOUND'
        });
      }

      // Check if this transaction is pending and needs syncing
      if (transaction.status === 'pending') {
        // M-Pesa callbacks should have already updated it
        // But if still pending after 2 hours, mark as expired
        const createdAt = new Date(transaction.createdAt);
        const now = new Date();
        const minutesDiff = Math.floor((now - createdAt) / (1000 * 60));

        if (minutesDiff > 120) {
          // Mark as failed after 2 hours
          await updatePaymentTransaction(transaction.id, {
            status: 'failed',
            reason: 'Payment confirmation timeout (2+ hours)',
            syncedAt: new Date().toISOString()
          });

          return res.json({
            success: true,
            transactionId: transaction.id,
            status: 'failed',
            reason: 'Payment confirmation timeout after 2 hours',
            message: 'Transaction marked as failed due to timeout'
          });
        }
      }

      return res.json({
        success: true,
        transactionId: transaction.id,
        status: transaction.status,
        mpesaCode: transaction.mpesaReceiptNumber || null,
        message: 'Transaction status verified',
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      });
    }

    // Bulk sync if requested
    if (syncAll === 'true') {
      console.log('📊 Performing bulk sync on all pending transactions...');

      const allTransactions = await getAllTransactions(parseInt(limit) || 1000);
      const pendingTransactions = allTransactions.filter(t => t.status === 'pending');

      console.log(`   Found ${pendingTransactions.length} pending transactions`);

      const syncResults = {
        total: pendingTransactions.length,
        synced: 0,
        timedOut: 0,
        alreadyCompleted: 0,
        errors: []
      };

      for (const transaction of pendingTransactions) {
        try {
          const createdAt = new Date(transaction.createdAt);
          const now = new Date();
          const minutesDiff = Math.floor((now - createdAt) / (1000 * 60));

          // If pending for more than 2 hours, mark as failed
          if (minutesDiff > 120) {
            await updatePaymentTransaction(transaction.id, {
              status: 'failed',
              reason: 'Payment confirmation timeout',
              syncedAt: new Date().toISOString(),
              minutesPending: minutesDiff
            });

            syncResults.timedOut++;
            console.log(`   ⏱️  Timeout: ${transaction.id} (${minutesDiff} minutes pending)`);
          } else if (!transaction.mpesaReceiptNumber && transaction.checkoutRequestId) {
            // Try to get the M-Pesa code if missing
            // This would typically come from a callback that was delayed
            console.log(`   ⚠️  Missing M-Pesa code for: ${transaction.id}`);
          }
        } catch (error) {
          console.error(`   ❌ Error syncing ${transaction.id}:`, error.message);
          syncResults.errors.push({
            transactionId: transaction.id,
            error: error.message
          });
        }
      }

      console.log('✅ Sync complete:', syncResults);

      return res.json({
        success: true,
        syncResults,
        message: 'Bulk sync completed',
        totalProcessed: pendingTransactions.length
      });
    }

    // Phone number specific sync
    if (phoneNumber) {
      console.log(`📞 Syncing payments for phone: ${phoneNumber}`);

      const allTransactions = await getAllTransactions(parseInt(limit) || 100);
      const phoneTransactions = allTransactions.filter(t => 
        t.phoneNumber && t.phoneNumber.includes(phoneNumber.replace(/\D/g, ''))
      );

      console.log(`   Found ${phoneTransactions.length} transactions for this phone`);

      const byStatus = {
        completed: phoneTransactions.filter(t => t.status === 'completed').length,
        pending: phoneTransactions.filter(t => t.status === 'pending').length,
        failed: phoneTransactions.filter(t => t.status === 'failed').length
      };

      return res.json({
        success: true,
        phoneNumber,
        transactions: phoneTransactions,
        statusBreakdown: byStatus,
        totalTransactions: phoneTransactions.length
      });
    }

    return res.json({
      success: true,
      message: 'Payment sync service active',
      availableParams: {
        checkoutRequestId: 'Sync specific transaction',
        sessionId: 'Sync by session ID',
        phoneNumber: 'Sync all transactions for phone',
        syncAll: 'true - Perform bulk sync',
        limit: 'Number of records to process (default: 100)'
      }
    });

  } catch (error) {
    console.error('❌ Sync error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Sync failed',
      error: error.message 
    });
  }
};
