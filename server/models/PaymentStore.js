// In-memory payment storage (use a real database in production)
class PaymentStore {
  constructor() {
    this.payments = new Map();
    this.sessions = new Map();
  }

  // Create a new payment record
  createPayment(sessionId, category, phoneNumber, amount) {
    const payment = {
      sessionId,
      category,
      phoneNumber,
      amount,
      status: 'pending',
      checkoutRequestId: null,
      merchantRequestId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {}
    };

    this.payments.set(sessionId, payment);
    return payment;
  }

  // Update payment with checkout details
  updatePaymentCheckout(sessionId, checkoutRequestId, merchantRequestId, responseCode) {
    const payment = this.payments.get(sessionId);
    if (payment) {
      payment.checkoutRequestId = checkoutRequestId;
      payment.merchantRequestId = merchantRequestId;
      payment.responseCode = responseCode;
      payment.updatedAt = new Date();
    }
    return payment;
  }

  // Update payment status
  updatePaymentStatus(sessionId, status, resultDesc = null, metadata = null) {
    const payment = this.payments.get(sessionId);
    if (payment) {
      payment.status = status;
      if (resultDesc) payment.resultDesc = resultDesc;
      if (metadata) {
        payment.metadata = { ...payment.metadata, ...metadata };
        // Also store mpesaReceiptNumber at top level for easy access
        if (metadata.mpesaReceiptNumber) {
          payment.mpesaReceiptNumber = metadata.mpesaReceiptNumber;
        }
        if (metadata.MpesaReceiptNumber) {
          payment.mpesaReceiptNumber = metadata.MpesaReceiptNumber;
        }
      }
      payment.updatedAt = new Date();
    }
    return payment;
  }

  // Get payment by session ID
  getPaymentBySessionId(sessionId) {
    return this.payments.get(sessionId);
  }

  // Get payment by checkout request ID
  getPaymentByCheckoutId(checkoutRequestId) {
    for (let payment of this.payments.values()) {
      if (payment.checkoutRequestId === checkoutRequestId) {
        return payment;
      }
    }
    return null;
  }

  // Get all completed payments
  getCompletedPayments() {
    const completed = [];
    for (let payment of this.payments.values()) {
      if (payment.status === 'completed') {
        completed.push(payment);
      }
    }
    return completed;
  }

  // Get payment statistics
  getStatistics() {
    const stats = {
      totalPayments: this.payments.size,
      completed: 0,
      pending: 0,
      failed: 0,
      totalAmount: 0
    };

    for (let payment of this.payments.values()) {
      if (payment.status === 'completed') {
        stats.completed++;
        stats.totalAmount += payment.amount;
      } else if (payment.status === 'pending') {
        stats.pending++;
      } else if (payment.status === 'failed') {
        stats.failed++;
      }
    }

    return stats;
  }

  // Clear old sessions (older than 24 hours)
  clearOldSessions(hoursOld = 24) {
    const now = new Date();
    const cutoff = new Date(now.getTime() - hoursOld * 60 * 60 * 1000);

    let cleared = 0;
    for (let [sessionId, payment] of this.payments.entries()) {
      if (payment.createdAt < cutoff) {
        this.payments.delete(sessionId);
        cleared++;
      }
    }
    return cleared;
  }

  // Delete payment by ID/sessionId
  deletePayment(id) {
    if (this.payments.has(id)) {
      this.payments.delete(id);
      return true;
    }
    // Also try to find by sessionId
    for (let [sessionId, payment] of this.payments.entries()) {
      if (payment.sessionId === id) {
        this.payments.delete(sessionId);
        return true;
      }
    }
    return false;
  }
}

// Export singleton instance
module.exports = new PaymentStore();
