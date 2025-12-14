const express = require('express');
const router = express.Router();
const PaymentStore = require('../models/PaymentStore');

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
