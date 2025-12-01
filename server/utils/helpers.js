const crypto = require('crypto');

// Generate unique session ID
function generateSessionId() {
  return crypto.randomBytes(16).toString('hex');
}

// Validate phone number format
function validatePhoneNumber(phoneNumber) {
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/[^\d]/g, '');
  
  // Check if it's a valid Kenyan number (10-12 digits)
  return /^(?:254|\+254|0)?[17]\d{8}$/.test(cleaned);
}

// Validate amount
function validateAmount(amount) {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0;
}

// Format amount to 2 decimal places
function formatAmount(amount) {
  return parseFloat(amount).toFixed(2);
}

// Log payment event
function logPaymentEvent(sessionId, event, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${event} - Session: ${sessionId}`, details);
}

module.exports = {
  generateSessionId,
  validatePhoneNumber,
  validateAmount,
  formatAmount,
  logPaymentEvent
};
