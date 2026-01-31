/**
 * Payment Verification API
 * POST /api/payment/verify-code
 * Body: { mpesaCode, phoneNumber (optional) }
 * 
 * Verifies an M-Pesa transaction code and returns access to download results.
 * Marks the code as "used" to prevent multiple redemptions.
 */
const { getTransactionByMpesaCode, markTransactionAsUsed } = require('../utils/firebase');

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
    const { mpesaCode, phoneNumber } = req.body;

    if (!mpesaCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'M-Pesa transaction code is required' 
      });
    }

    // Clean up the code (remove spaces, uppercase)
    const cleanCode = mpesaCode.trim().toUpperCase().replace(/\s+/g, '');

    // Find transaction by M-Pesa code
    const transaction = await getTransactionByMpesaCode(cleanCode, phoneNumber);

    if (!transaction) {
      return res.json({
        success: false,
        message: 'Transaction not found. Please check your M-Pesa code and try again.',
        code: 'NOT_FOUND'
      });
    }

    if (transaction.error) {
      return res.json({
        success: false,
        message: transaction.error,
        code: 'PHONE_MISMATCH'
      });
    }

    // Check if already used
    if (transaction.used) {
      const usedDate = transaction.usedAt ? 
        new Date(transaction.usedAt).toLocaleDateString() : 'previously';
      
      return res.json({
        success: false,
        message: `This code was already redeemed on ${usedDate}. Each code can only be used once.`,
        code: 'ALREADY_USED',
        usedAt: transaction.usedAt,
        // Still return package info for reference
        category: transaction.category,
        amount: transaction.amount
      });
    }

    // Check if payment is completed
    if (transaction.status !== 'completed') {
      return res.json({
        success: false,
        message: `Payment status is "${transaction.status}". Only completed payments can be verified.`,
        code: 'NOT_COMPLETED',
        status: transaction.status
      });
    }

    // Check if code is expired (30 days)
    const createdAt = new Date(transaction.createdAt);
    const now = new Date();
    const daysDiff = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    
    if (daysDiff > 30) {
      return res.json({
        success: false,
        message: 'This code has expired (over 30 days old). Please contact support for assistance.',
        code: 'EXPIRED',
        createdAt: transaction.createdAt
      });
    }

    // Mark as used
    await markTransactionAsUsed(transaction.id);

    // Return success with access data
    res.json({
      success: true,
      message: 'Payment verified successfully!',
      data: {
        transactionId: transaction.id,
        category: transaction.category,
        amount: transaction.amount,
        phoneNumber: transaction.phoneNumber,
        mpesaReceiptNumber: transaction.mpesaReceiptNumber,
        createdAt: transaction.createdAt,
        // Include student data if available (for re-generating results)
        studentData: transaction.studentData || null,
        // Access token for one-time access (simple base64 encoding for demo)
        accessToken: Buffer.from(`${transaction.id}:${Date.now()}`).toString('base64')
      }
    });

  } catch (error) {
    console.error('Payment verification error:', error.message);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while verifying payment. Please try again.' 
    });
  }
};
