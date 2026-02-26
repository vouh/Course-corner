// Firebase Admin SDK for Server-side operations
const admin = require('firebase-admin');

// Initialize Firebase Admin with environment variables
const initializeFirebase = () => {
  if (admin.apps.length === 0) {
    // Use service account credentials from environment variables
    // Handle private key - it may have literal \n or escaped \\n
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (privateKey) {
      // Replace escaped newlines with actual newlines
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

    try {
      // Check if we have the required credentials
      if (privateKey && process.env.FIREBASE_CLIENT_EMAIL) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });

        // Configure Firestore to ignore undefined values
        const firestore = admin.firestore();
        firestore.settings({
          ignoreUndefinedProperties: true
        });

        console.log('🔥 Firebase Admin initialized with service account');
        console.log('✅ Firestore configured to ignore undefined properties');
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
  // Use custom database ID if specified, otherwise use default
  const databaseId = process.env.FIREBASE_DATABASE_ID || '(default)';
  if (databaseId !== '(default)') {
    return admin.firestore().databaseId(databaseId);
  }
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
      email: paymentData.email || null,
      amount: paymentData.amount,
      category: paymentData.category,
      status: paymentData.status,
      transactionCode: paymentData.transactionCode || null,
      mpesaReceiptNumber: paymentData.mpesaReceiptNumber || null,
      checkoutRequestId: paymentData.checkoutRequestId || null,
      merchantRequestId: paymentData.merchantRequestId || null,
      resultDesc: paymentData.resultDesc || null,
      // REMOVED: metadata field causes Firestore write failures
      // Referral tracking
      referralCode: paymentData.referralCode || null,
      referrerCredited: false,
      commissionAmount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await transactionRef.set(transaction);
    console.log('💾 Transaction saved to Firebase:', transactionRef.id);
    console.log('🎁 Referral Code saved:', paymentData.referralCode || 'NONE');
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

    console.log(`📊 [Server] Querying Firebase transactions: limit=${limit}, status=${status || 'all'}`);

    // Build query - Note: If status filter is used with orderBy, a composite index may be required
    let query = db.collection('transactions');

    // Add status filter first if provided
    if (status) {
      query = query.where('status', '==', status);
    }

    // Add ordering and limit
    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();
    const transactions = [];

    console.log(`✅ [Server] Firebase returned ${snapshot.size} documents`);

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
    console.error('❌ [Server] Error getting transactions from Firebase:', error.message);

    // If it's an index error, try without ordering
    if (error.message.includes('index')) {
      console.log('🔄 [Server] Retrying without ordering (missing index)...');
      try {
        const db = getFirestore();
        let query = db.collection('transactions').limit(limit);
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
        // Sort in memory
        transactions.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
          const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
          return dateB - dateA;
        });
        return transactions;
      } catch (retryError) {
        console.error('❌ [Server] Retry also failed:', retryError.message);
      }
    }

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

// Delete a transaction by ID
const deleteTransaction = async (transactionId) => {
  try {
    const db = getFirestore();
    const docRef = db.collection('transactions').doc(transactionId);
    const doc = await docRef.get();

    if (doc.exists) {
      await docRef.delete();
      console.log('🗑️ Transaction deleted from Firebase:', transactionId);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting transaction from Firebase:', error.message);
    return false;
  }
};

// Get transactions by phone number
const getTransactionsByPhone = async (phoneNumber, status = null) => {
  try {
    const db = getFirestore();
    let query = db.collection('transactions')
      .where('phoneNumber', '==', phoneNumber)
      .orderBy('createdAt', 'desc')
      .limit(10);

    const snapshot = await query.get();
    const transactions = [];

    snapshot.forEach(doc => {
      const data = doc.data();
      if (!status || data.status === status) {
        transactions.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
        });
      }
    });

    return transactions;
  } catch (error) {
    console.error('Error getting transactions by phone:', error.message);
    return [];
  }
};

// Get transaction by M-Pesa receipt number (unique code)
const getTransactionByMpesaCode = async (mpesaCode) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('transactions')
      .where('mpesaReceiptNumber', '==', mpesaCode.toUpperCase())
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const doc = snapshot.docs[0];
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      };
    }
    return null;
  } catch (error) {
    console.error('Error getting transaction by M-Pesa code:', error.message);
    return null;
  }
};

// Mark transaction as used (one-time use)
const markTransactionAsUsed = async (transactionId) => {
  try {
    const db = getFirestore();
    const docRef = db.collection('transactions').doc(transactionId);
    await docRef.update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log('✅ Transaction marked as used:', transactionId);
    return true;
  } catch (error) {
    console.error('Error marking transaction as used:', error.message);
    return false;
  }
};

// Credit referrer with commission (dynamic rate based on admin status)
// Uses the 'users' collection with fields matching firebase-auth.js schema
const creditReferrer = async (referralCode, transactionAmount, transactionId) => {
  try {
    const db = getFirestore();
    
    // Fetch commission rate from referralCodes collection
    const codeDoc = await db.collection('referralCodes').doc(referralCode.toUpperCase()).get();
    let commissionRate = 12; // Default 12%
    
    if (codeDoc.exists) {
      const codeData = codeDoc.data();
      commissionRate = codeData.commissionRate || 12;
    }

    // Find referrer directly in users collection (single source of truth)
    const userSnapshot = await db.collection('users')
      .where('referralCode', '==', referralCode.toUpperCase())
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      console.log('⚠️ Referral code owner not found:', referralCode);
      return false;
    }

    const referrerId = userSnapshot.docs[0].id;
    const referrerData = userSnapshot.docs[0].data();
    
    // Use user's commission rate if available, otherwise use code's rate
    if (referrerData.commissionRate !== undefined) {
      commissionRate = referrerData.commissionRate;
    }

    const commissionAmount = Math.ceil(transactionAmount * (commissionRate / 100));

    console.log('💰 Processing referral commission:');
    console.log('   Referral Code:', referralCode);
    console.log('   Transaction Amount:', transactionAmount);
    console.log(`   Commission (${commissionRate}%):`, commissionAmount, '(rounded up)');
    console.log('   User Type:', referrerData.accountType || 'regular');

    // Update transaction with commission info
    if (transactionId) {
      await db.collection('transactions').doc(transactionId).update({
        referrerCredited: true,
        commissionAmount: commissionAmount,
        commissionRate: commissionRate, // Store the rate used for this transaction
        referrerId: referrerId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    // Update user's referral stats (matching firebase-auth.js schema)
    // Fields: referralCount, referralPaidCount, referralEarnings, referralPending
    await db.collection('users').doc(referrerId).update({
      referralCount: admin.firestore.FieldValue.increment(1),
      referralPaidCount: admin.firestore.FieldValue.increment(1),
      referralEarnings: admin.firestore.FieldValue.increment(commissionAmount),
      referralPending: admin.firestore.FieldValue.increment(commissionAmount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('✅ Commission credited to referrer:', referrerId, '| Amount:', commissionAmount);
    return true;
  } catch (error) {
    console.error('Error crediting referrer:', error.message);
    return false;
  }
};

// Bulk delete transactions
const bulkDeleteTransactions = async (transactionIds) => {
  try {
    const db = getFirestore();
    const batch = db.batch();

    for (const id of transactionIds) {
      const docRef = db.collection('transactions').doc(id);
      batch.delete(docRef);
    }

    await batch.commit();
    console.log('🗑️ Bulk deleted', transactionIds.length, 'transactions');
    return true;
  } catch (error) {
    console.error('Error bulk deleting transactions:', error.message);
    return false;
  }
};

module.exports = {
  initializeFirebase,
  getFirestore,
  savePaymentTransaction,
  updatePaymentTransaction,
  getAllTransactions,
  getTransactionStats,
  deleteTransaction,
  getTransactionsByPhone,
  getTransactionByMpesaCode,
  markTransactionAsUsed,
  creditReferrer,
  bulkDeleteTransactions
};
