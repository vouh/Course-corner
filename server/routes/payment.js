const express = require('express');
const router = express.Router();
const PaymentStore = require('../models/PaymentStore');
const { getTransactionsByPhone } = require('../utils/firebaseAdmin');

// Helper to format phone number
function formatPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/\s/g, '').replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '254' + cleaned.substring(1);
  } else if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }
  return cleaned;
}

// Verify phone number has completed payment - for "I Already Paid" feature
router.post('/verify-phone', async (req, res) => {
  try {
    const { phoneNumber, category } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    console.log('Verifying payment for phone:', formattedPhone);

    // Look for completed payments with this phone number
    const transactions = await getTransactionsByPhone(formattedPhone, 'completed');

    if (!transactions.length) {
      return res.json({
        success: false,
        hasAccess: false,
        message: 'No completed payment found for this phone number'
      });
    }

    // Check if any match the category or return the most recent
    let matchingPayment = null;
    
    for (const tx of transactions) {
      if (category && tx.category === category) {
        matchingPayment = tx;
        break;
      } else if (!matchingPayment) {
        matchingPayment = tx;
      }
    }

    if (matchingPayment) {
      console.log('Found matching payment:', matchingPayment.id);
      
      return res.json({
        success: true,
        hasAccess: true,
        sessionId: matchingPayment.sessionId || matchingPayment.id,
        transactionId: matchingPayment.id,
        category: matchingPayment.category,
        amount: matchingPayment.amount,
        mpesaCode: matchingPayment.mpesaReceiptNumber,
        message: 'Payment verified successfully'
      });
    }

    return res.json({
      success: false,
      hasAccess: false,
      message: 'No matching payment found'
    });

  } catch (error) {
    console.error('Verify phone error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Verification failed: ' + error.message 
    });
  }
});

// Approve access after payment
router.post('/approve', (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const payment = PaymentStore.getPaymentBySessionId(sessionId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment session not found'
      });
    }

    if (payment.status !== 'completed') {
      return res.status(403).json({
        success: false,
        message: `Cannot approve. Payment status is: ${payment.status}`,
        status: payment.status
      });
    }

    res.json({
      success: true,
      message: 'Payment verified and approved',
      data: {
        sessionId: payment.sessionId,
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        approved: true,
        accessToken: Buffer.from(sessionId).toString('base64'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Check if user has access to category
router.post('/has-access', (req, res) => {
  try {
    const { sessionId, category } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        hasAccess: false,
        message: 'Session ID is required'
      });
    }

    const payment = PaymentStore.getPaymentBySessionId(sessionId);

    if (!payment) {
      return res.json({
        success: true,
        hasAccess: false,
        message: 'No payment found for this session'
      });
    }

    const hasAccess = payment.status === 'completed' && 
                      (!category || payment.category === category);

    res.json({
      success: true,
      hasAccess,
      data: {
        category: payment.category,
        status: payment.status,
        amount: payment.amount
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      hasAccess: false,
      message: error.message
    });
  }
});

// Get payment details
router.get('/details/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const payment = PaymentStore.getPaymentBySessionId(sessionId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    res.json({
      success: true,
      data: {
        sessionId: payment.sessionId,
        category: payment.category,
        amount: payment.amount,
        status: payment.status,
        phoneNumber: payment.phoneNumber,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
        metadata: payment.metadata
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
