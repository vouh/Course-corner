/**
 * Verify Payment by Phone Number API
 * POST /api/payment/verify-phone
 * Used for "I Already Paid" feature
 */

const { initializeFirebase } = require('../utils/firebase');

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
    const { phoneNumber, category } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number required' });
    }

    const formattedPhone = formatPhoneNumber(phoneNumber);
    console.log('Verifying payment for phone:', formattedPhone);

    // Initialize Firebase
    const admin = require('firebase-admin');
    
    if (admin.apps.length === 0) {
      let privateKey = process.env.FIREBASE_PRIVATE_KEY;
      if (privateKey) {
        privateKey = privateKey.replace(/\\n/g, '\n');
      }
      
      const serviceAccount = {
        type: 'service_account',
        project_id: process.env.FIREBASE_PROJECT_ID || 'course-corner',
        private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
        private_key: privateKey,
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        client_id: process.env.FIREBASE_CLIENT_ID,
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url: process.env.FIREBASE_CERT_URL
      };

      if (privateKey && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      } else {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'course-corner'
        });
      }
    }

    const db = admin.firestore();

    // Look for completed payments with this phone number
    let query = db.collection('transactions')
      .where('phoneNumber', '==', formattedPhone)
      .where('status', '==', 'completed')
      .orderBy('createdAt', 'desc')
      .limit(5);

    const snapshot = await query.get();

    if (snapshot.empty) {
      // Try with alternate phone format
      const altPhone = phoneNumber.startsWith('0') ? phoneNumber : '0' + phoneNumber.slice(-9);
      console.log('Trying alternate format:', altPhone);
      
      return res.json({
        success: false,
        hasAccess: false,
        message: 'No completed payment found for this phone number'
      });
    }

    // Found payments - check if any match the category or are recent
    let matchingPayment = null;
    
    snapshot.forEach(doc => {
      const data = doc.data();
      if (category && data.category === category) {
        matchingPayment = { id: doc.id, ...data };
      } else if (!matchingPayment) {
        matchingPayment = { id: doc.id, ...data };
      }
    });

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
};
