/**
 * Payment Status Handler
 * POST /api/payment/status-handler
 * 
 * Handles payment status verification and updates
 * - Verifies M-Pesa receipt codes
 * - Captures transaction codes from callbacks
 * - Updates pending payments to completed
 * - Provides comprehensive status reporting
 */

const { 
  getTransactionByCheckoutId, 
  getTransactionByMpesaCode,
  updatePaymentTransaction,
  createPaymentTransaction
} = require('../utils/firebase');

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
    const { 
      action,
      checkoutRequestId,
      mpesaCode,
      sessionId,
      phoneNumber,
      status,
      amount,
      category,
      metadata
    } = req.body;

    if (!action) {
      return res.status(400).json({ 
        success: false, 
        message: 'Action is required (verify, capture, update)' 
      });
    }

    // ===== ACTION 1: Verify existing transaction by M-Pesa code =====
    if (action === 'verify') {
      if (!mpesaCode) {
        return res.status(400).json({ 
          success: false, 
          message: 'M-Pesa code required for verification' 
        });
      }

      const cleanCode = mpesaCode.trim().toUpperCase().replace(/\s+/g, '');
      
      try {
        const transaction = await getTransactionByMpesaCode(cleanCode, phoneNumber);

        if (!transaction) {
          return res.json({
            success: false,
            message: 'Transaction not found',
            code: 'NOT_FOUND'
          });
        }

        if (transaction.error) {
          return res.json({
            success: false,
            message: transaction.error,
            code: 'ERROR'
          });
        }

        // Mark as used if not already marked
        if (!transaction.used) {
          await updatePaymentTransaction(transaction.id, {
            used: true,
            usedAt: new Date().toISOString(),
            verifiedAt: new Date().toISOString()
          });
        }

        return res.json({
          success: true,
          transactionId: transaction.id,
          status: transaction.status,
          category: transaction.category,
          amount: transaction.amount,
          phoneNumber: transaction.phoneNumber,
          mpesaCode: transaction.mpesaReceiptNumber,
          message: 'Transaction verified successfully'
        });

      } catch (error) {
        console.error('Verification error:', error);
        return res.json({
          success: false,
          message: 'Failed to verify transaction',
          error: error.message
        });
      }
    }

    // ===== ACTION 2: Capture payment code from callback =====
    else if (action === 'capture') {
      if (!checkoutRequestId || !mpesaCode) {
        return res.status(400).json({ 
          success: false, 
          message: 'checkoutRequestId and mpesaCode required for capture' 
        });
      }

      try {
        // Find transaction by checkout ID
        const transaction = await getTransactionByCheckoutId(checkoutRequestId);

        if (!transaction) {
          return res.json({
            success: false,
            message: 'Transaction not found for this checkout',
            code: 'NOT_FOUND'
          });
        }

        // Update transaction with M-Pesa code
        const cleanCode = mpesaCode.trim().toUpperCase().replace(/\s+/g, '');
        
        const updateData = {
          mpesaReceiptNumber: cleanCode,
          transactionCode: cleanCode,
          status: 'completed',
          completedAt: new Date().toISOString(),
          ...metadata
        };

        const updatedId = await updatePaymentTransaction(transaction.id, updateData);

        return res.json({
          success: true,
          transactionId: updatedId,
          mpesaCode: cleanCode,
          message: 'Payment code captured and transaction updated successfully'
        });

      } catch (error) {
        console.error('Capture error:', error);
        return res.json({
          success: false,
          message: 'Failed to capture payment code',
          error: error.message
        });
      }
    }

    // ===== ACTION 3: Update transaction status from pending to completed =====
    else if (action === 'update') {
      if (!checkoutRequestId && !sessionId && !mpesaCode) {
        return res.status(400).json({ 
          success: false, 
          message: 'checkoutRequestId, sessionId, or mpesaCode required for update' 
        });
      }

      try {
        let transaction = null;

        // Try to find transaction by different identifiers
        if (checkoutRequestId) {
          transaction = await getTransactionByCheckoutId(checkoutRequestId);
        } else if (mpesaCode) {
          transaction = await getTransactionByMpesaCode(
            mpesaCode.trim().toUpperCase().replace(/\s+/g, ''),
            phoneNumber
          );
        }

        if (!transaction) {
          return res.json({
            success: false,
            message: 'Transaction not found',
            code: 'NOT_FOUND'
          });
        }

        // Update status to completed (if currently pending)
        if (transaction.status !== 'completed') {
          const updateData = {
            status: 'completed',
            completedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...metadata
          };

          // Add M-Pesa code if provided
          if (mpesaCode) {
            updateData.mpesaReceiptNumber = mpesaCode.trim().toUpperCase().replace(/\s+/g, '');
            updateData.transactionCode = updateData.mpesaReceiptNumber;
          }

          const updatedId = await updatePaymentTransaction(transaction.id, updateData);

          return res.json({
            success: true,
            transactionId: updatedId,
            previousStatus: transaction.status,
            newStatus: 'completed',
            message: 'Transaction status updated to completed'
          });
        } else {
          return res.json({
            success: true,
            transactionId: transaction.id,
            status: 'completed',
            message: 'Transaction is already completed'
          });
        }

      } catch (error) {
        console.error('Update error:', error);
        return res.json({
          success: false,
          message: 'Failed to update transaction',
          error: error.message
        });
      }
    }

    // ===== ACTION 4: Create or update transaction record =====
    else if (action === 'create') {
      if (!sessionId || !phoneNumber || !amount || !category) {
        return res.status(400).json({ 
          success: false, 
          message: 'sessionId, phoneNumber, amount, and category required for create' 
        });
      }

      try {
        const transactionData = {
          sessionId,
          phoneNumber,
          amount,
          category,
          status: status || 'pending',
          createdAt: new Date().toISOString(),
          ...metadata
        };

        const transactionId = await createPaymentTransaction(transactionData);

        return res.json({
          success: true,
          transactionId,
          message: 'Transaction created successfully'
        });

      } catch (error) {
        console.error('Create error:', error);
        return res.json({
          success: false,
          message: 'Failed to create transaction',
          error: error.message
        });
      }
    }

    else {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Supported actions: verify, capture, update, create'
      });
    }

  } catch (error) {
    console.error('Status handler error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
};
