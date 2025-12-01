// Firebase Admin SDK for Server-side operations
const admin = require('firebase-admin');

// Initialize Firebase Admin with environment variables
const initializeFirebase = () => {
  if (admin.apps.length === 0) {
    // Use service account credentials from environment variables
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID || 'course-corner',
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: 'https://accounts.google.com/o/oauth2/auth',
      token_uri: 'https://oauth2.googleapis.com/token',
      auth_provider_x509_cert_url: 'https://www.googleapis.com/oauth2/v1/certs',
      client_x509_cert_url: process.env.FIREBASE_CERT_URL
    };

    try {
      // Check if we have the required credentials
      if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          databaseURL: `https://${process.env.FIREBASE_PROJECT_ID || 'course-corner'}.firebaseio.com`
        });
        console.log('🔥 Firebase Admin initialized with service account');
      } else {
        // Fallback: Initialize without credentials (for development/testing)
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'course-corner'
        });
        console.log('🔥 Firebase Admin initialized (limited mode - add credentials for full access)');
      }
    } catch (error) {
      console.error('Firebase Admin initialization error:', error.message);
    }
  }
  return admin;
};

// Get Firestore instance
const getFirestore = () => {
  initializeFirebase();
  return admin.firestore();
};

// Save payment transaction to Firestore
const savePaymentTransaction = async (paymentData) => {
  try {
    const db = getFirestore();
    const transactionRef = db.collection('transactions').doc();
    
    const transaction = {
      id: transactionRef.id,
      sessionId: paymentData.sessionId,
      phoneNumber: paymentData.phoneNumber,
      amount: paymentData.amount,
      category: paymentData.category,
      status: paymentData.status,
      transactionCode: paymentData.transactionCode || null,
      mpesaReceiptNumber: paymentData.mpesaReceiptNumber || null,
      checkoutRequestId: paymentData.checkoutRequestId || null,
      merchantRequestId: paymentData.merchantRequestId || null,
      resultDesc: paymentData.resultDesc || null,
      metadata: paymentData.metadata || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await transactionRef.set(transaction);
    console.log('💾 Transaction saved to Firebase:', transactionRef.id);
    return transactionRef.id;
  } catch (error) {
    console.error('Error saving transaction to Firebase:', error.message);
    // Don't throw - we don't want to break the payment flow if Firebase fails
    return null;
  }
};

// Update payment transaction status
const updatePaymentTransaction = async (checkoutRequestId, updateData) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('transactions')
      .where('checkoutRequestId', '==', checkoutRequestId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({
        ...updateData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('📝 Transaction updated in Firebase');
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error updating transaction in Firebase:', error.message);
    return false;
  }
};

// Get all transactions (for admin)
const getAllTransactions = async (limit = 100, status = null) => {
  try {
    const db = getFirestore();
    let query = db.collection('transactions')
      .orderBy('createdAt', 'desc')
      .limit(limit);

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query.get();
    const transactions = [];
    
    snapshot.forEach(doc => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      });
    });

    return transactions;
  } catch (error) {
    console.error('Error getting transactions from Firebase:', error.message);
    return [];
  }
};

// Get transaction statistics
const getTransactionStats = async () => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('transactions').get();
    
    const stats = {
      total: 0,
      completed: 0,
      failed: 0,
      pending: 0,
      totalAmount: 0,
      completedAmount: 0
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      stats.total++;
      
      if (data.status === 'completed') {
        stats.completed++;
        stats.completedAmount += data.amount || 0;
      } else if (data.status === 'failed') {
        stats.failed++;
      } else {
        stats.pending++;
      }
      
      stats.totalAmount += data.amount || 0;
    });

    return stats;
  } catch (error) {
    console.error('Error getting transaction stats:', error.message);
    return null;
  }
};

module.exports = {
  initializeFirebase,
  getFirestore,
  savePaymentTransaction,
  updatePaymentTransaction,
  getAllTransactions,
  getTransactionStats
};
