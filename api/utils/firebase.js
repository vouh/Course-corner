/**
 * Firebase Admin SDK for Serverless Functions
 * Shared module for all API endpoints to use Firebase Firestore
 */

// Use dynamic import for firebase-admin since it's CommonJS
let admin = null;
let db = null;

const initializeFirebase = async () => {
  if (admin && db) return { admin, db };

  try {
    admin = require('firebase-admin');

    if (admin.apps.length === 0) {
      // Handle private key - it may have literal \n or escaped \\n
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

        // Configure Firestore to ignore undefined values (fixes M-Pesa Balance field issue)
        const firestore = admin.firestore();
        firestore.settings({
          ignoreUndefinedProperties: true
        });

        console.log('🔥 Firebase Admin initialized for serverless');
        console.log('✅ Firestore configured to ignore undefined properties');
      } else {
        admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || 'course-corner'
        });
        console.log('🔥 Firebase Admin initialized (limited mode)');
      }
    }

    db = admin.firestore();
    return { admin, db };
  } catch (error) {
    console.error('Firebase init error:', error.message);
    return { admin: null, db: null };
  }
};

// ==================== TRANSACTIONS ====================

/**
 * Save a new payment transaction
 */
const saveTransaction = async (paymentData) => {
  console.log('🔥 saveTransaction called with status:', paymentData.status);

  try {
    const { admin, db } = await initializeFirebase();
    if (!db) {
      console.error('❌ Firebase DB is NULL - Firebase initialization failed!');
      console.error('   Check FIREBASE_PRIVATE_KEY and FIREBASE_CLIENT_EMAIL environment variables');
      const memId = saveToMemory(paymentData);
      console.warn('⚠️ Transaction saved to MEMORY ONLY (not Firebase):', memId);
      return memId;
    }

    console.log('✅ Firebase DB initialized, creating transaction...');

    const transactionRef = db.collection('transactions').doc();
    const transaction = {
      id: transactionRef.id,
      sessionId: paymentData.sessionId,
      phoneNumber: paymentData.phoneNumber,
      amount: paymentData.amount,
      category: paymentData.category,
      status: paymentData.status || 'pending',
      checkoutRequestId: paymentData.checkoutRequestId || null,
      merchantRequestId: paymentData.merchantRequestId || null,
      mpesaReceiptNumber: paymentData.mpesaReceiptNumber || null,
      transactionCode: paymentData.transactionCode || null,
      resultDesc: paymentData.resultDesc || null,
      resultCode: paymentData.resultCode || null,
      // REMOVED: metadata field causes Firestore write failures
      // Referral tracking
      referralCode: paymentData.referralCode || null,
      referrerCredited: false,
      commissionAmount: 0,
      // Usage tracking
      used: false,
      usedAt: null,
      downloadCount: 0,
      // Student data (saved after payment for retrieval)
      studentData: paymentData.studentData || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    console.log('📤 Writing to Firestore...');
    console.log('📊 Transaction keys:', Object.keys(transaction).join(', '));
    console.log('📊 Status:', transaction.status);

    try {
      await transactionRef.set(transaction);
      console.log('✅ Firestore write completed successfully');
    } catch (firestoreErr) {
      console.error('❌ FIRESTORE WRITE FAILED:');
      console.error('   Code:', firestoreErr.code);
      console.error('   Message:', firestoreErr.message);
      throw firestoreErr;
    }
    console.log('💾✅ Transaction SUCCESSFULLY saved to Firebase:', transactionRef.id);
    console.log('   Status:', transaction.status);
    console.log('   Amount:', transaction.amount);
    console.log('   Phone:', transaction.phoneNumber);
    console.log('   Receipt:', transaction.mpesaReceiptNumber || 'N/A');

    // Also save to memory for immediate access
    saveToMemory({ ...transaction, id: transactionRef.id });

    return transactionRef.id;
  } catch (error) {
    console.error('❌ FIREBASE SAVE ERROR:', error.message);
    console.error('   Error code:', error.code);
    console.error('   Error stack:', error.stack);
    console.error('   Transaction status:', paymentData.status);
    console.error('   Error name:', error.name);

    const memId = saveToMemory(paymentData);
    console.warn('⚠️ Transaction saved to MEMORY as fallback:', memId);
    return memId;
  }
};

/**
 * Update transaction by checkoutRequestId
 */
const updateTransactionByCheckoutId = async (checkoutRequestId, updateData) => {
  try {
    const { admin, db } = await initializeFirebase();
    if (!db) {
      return updateInMemory(checkoutRequestId, updateData);
    }

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

      // Update in-memory too
      updateInMemory(checkoutRequestId, updateData);

      console.log('📝 Transaction updated in Firebase');
      return snapshot.docs[0].id;
    }
    return null;
  } catch (error) {
    console.error('Error updating transaction:', error.message);
    return updateInMemory(checkoutRequestId, updateData);
  }
};

/**
 * Update transaction by ID
 */
const updateTransaction = async (transactionId, updateData) => {
  try {
    const { admin, db } = await initializeFirebase();
    if (!db) return false;

    const docRef = db.collection('transactions').doc(transactionId);
    await docRef.update({
      ...updateData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return transactionId;
  } catch (error) {
    console.error('Error updating transaction by ID:', error.message);
    return false;
  }
};

/**
 * Get transaction by checkoutRequestId
 */
const getTransactionByCheckoutId = async (checkoutRequestId) => {
  try {
    const { db } = await initializeFirebase();
    if (!db) {
      return getFromMemoryByCheckoutId(checkoutRequestId);
    }

    const snapshot = await db.collection('transactions')
      .where('checkoutRequestId', '==', checkoutRequestId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      return {
        id: snapshot.docs[0].id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      };
    }

    // Fallback to memory
    return getFromMemoryByCheckoutId(checkoutRequestId);
  } catch (error) {
    console.error('Error getting transaction by checkoutId:', error.message);
    return getFromMemoryByCheckoutId(checkoutRequestId);
  }
};

/**
 * Get transaction by sessionId
 */
const getTransactionBySessionId = async (sessionId) => {
  try {
    const { db } = await initializeFirebase();
    if (!db) {
      return getFromMemory(sessionId);
    }

    const snapshot = await db.collection('transactions')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();
      return {
        id: snapshot.docs[0].id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      };
    }

    // Fallback to memory
    return getFromMemory(sessionId);
  } catch (error) {
    console.error('Error getting transaction:', error.message);
    return getFromMemory(sessionId);
  }
};

/**
 * Get transaction by M-Pesa receipt number (for verification)
 */
const getTransactionByMpesaCode = async (mpesaCode, phoneNumber = null) => {
  try {
    const { db } = await initializeFirebase();
    if (!db) return null;

    let query = db.collection('transactions')
      .where('mpesaReceiptNumber', '==', mpesaCode.toUpperCase())
      .where('status', '==', 'completed')
      .limit(1);

    const snapshot = await query.get();

    if (!snapshot.empty) {
      const data = snapshot.docs[0].data();

      // Optional: verify phone number matches
      if (phoneNumber) {
        const formattedPhone = formatPhoneNumber(phoneNumber);
        if (data.phoneNumber !== formattedPhone) {
          return { error: 'Phone number does not match payment record' };
        }
      }

      return {
        id: snapshot.docs[0].id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
      };
    }

    return null;
  } catch (error) {
    console.error('Error finding transaction by M-Pesa code:', error.message);
    return null;
  }
};

/**
 * Mark transaction as used (for one-time code verification)
 */
const markTransactionAsUsed = async (transactionId) => {
  try {
    const { admin, db } = await initializeFirebase();
    if (!db) return false;

    const docRef = db.collection('transactions').doc(transactionId);
    await docRef.update({
      used: true,
      usedAt: admin.firestore.FieldValue.serverTimestamp(),
      downloadCount: admin.firestore.FieldValue.increment(1),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error('Error marking transaction as used:', error.message);
    return false;
  }
};

/**
 * Save student results to transaction
 */
const saveStudentResults = async (sessionId, studentData) => {
  try {
    const { admin, db } = await initializeFirebase();
    if (!db) return false;

    const snapshot = await db.collection('transactions')
      .where('sessionId', '==', sessionId)
      .limit(1)
      .get();

    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({
        studentData: studentData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error saving student results:', error.message);
    return false;
  }
};

/**
 * Get all transactions (for admin)
 */
const getAllTransactions = async (limit = 100, status = null) => {
  try {
    const { db } = await initializeFirebase();
    if (!db) {
      console.warn('⚠️ Firebase DB not available, using memory fallback');
      return getAllFromMemory();
    }

    console.log(`📊 Querying Firebase transactions: limit=${limit}, status=${status || 'all'}`);

    // Build query - Note: If status filter is used with orderBy, a composite index is required
    let query = db.collection('transactions');

    // Add status filter first if provided (Firestore requires filter before orderBy)
    if (status) {
      query = query.where('status', '==', status);
    }

    // Add ordering and limit
    query = query.orderBy('createdAt', 'desc').limit(limit);

    const snapshot = await query.get();
    const transactions = [];

    console.log(`✅ Firebase returned ${snapshot.size} documents`);

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
    console.error('❌ Error getting transactions:', error.message);

    // If it's an index error, try without ordering
    if (error.message.includes('index')) {
      console.log('🔄 Retrying without ordering (missing index)...');
      try {
        const { db } = await initializeFirebase();
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
        console.error('❌ Retry also failed:', retryError.message);
      }
    }

    return getAllFromMemory();
  }
};

// ==================== REFERRALS ====================

/**
 * Validate referral code exists
 */
const validateReferralCode = async (code) => {
  try {
    const { db } = await initializeFirebase();
    if (!db) return null;

    const snapshot = await db.collection('users')
      .where('referralCode', '==', code.toUpperCase())
      .limit(1)
      .get();

    if (!snapshot.empty) {
      const userData = snapshot.docs[0].data();
      return {
        valid: true,
        referrerId: snapshot.docs[0].id,
        referrerName: userData.displayName || 'Course Corner User'
      };
    }

    return { valid: false };
  } catch (error) {
    console.error('Error validating referral code:', error.message);
    return { valid: false, error: error.message };
  }
};

/**
 * Credit referrer with commission (12%)
 */
const creditReferrer = async (referralCode, paymentAmount, paymentId) => {
  const COMMISSION_RATE = 0.12; // 12%

  try {
    const { admin, db } = await initializeFirebase();
    if (!db) return false;

    // Find referrer by code
    const userSnapshot = await db.collection('users')
      .where('referralCode', '==', referralCode.toUpperCase())
      .limit(1)
      .get();

    if (userSnapshot.empty) {
      console.warn('Referrer not found for code:', referralCode);
      return false;
    }

    const referrerId = userSnapshot.docs[0].id;
    const commissionAmount = Math.round(paymentAmount * COMMISSION_RATE);

    // Update referrer's earnings (matching firebase-auth.js schema)
    // Fields: referralCount, referralPaidCount, referralEarnings, referralPending
    await userSnapshot.docs[0].ref.update({
      referralCount: admin.firestore.FieldValue.increment(1),
      referralPaidCount: admin.firestore.FieldValue.increment(1),
      referralEarnings: admin.firestore.FieldValue.increment(commissionAmount),
      referralPending: admin.firestore.FieldValue.increment(commissionAmount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Create referral transaction record
    await db.collection('referralTransactions').add({
      referrerId: referrerId,
      referralCode: referralCode.toUpperCase(),
      paymentId: paymentId,
      paymentAmount: paymentAmount,
      commissionRate: COMMISSION_RATE,
      commissionAmount: commissionAmount,
      status: 'credited',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Update the payment record
    await db.collection('transactions').doc(paymentId).update({
      referrerCredited: true,
      commissionAmount: commissionAmount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`💰 Credited ${commissionAmount} KES to referrer ${referrerId}`);
    return { success: true, commissionAmount };
  } catch (error) {
    console.error('Error crediting referrer:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get referral stats for a user
 */
const getReferralStats = async (userId) => {
  try {
    const { db } = await initializeFirebase();
    if (!db) return null;

    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;

    const userData = userDoc.data();

    // Get referral transaction history
    const txSnapshot = await db.collection('referralTransactions')
      .where('referrerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const transactions = [];
    txSnapshot.forEach(doc => {
      const data = doc.data();
      transactions.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.() || data.createdAt
      });
    });

    return {
      referralCode: userData.referralCode,
      totalReferrals: userData.referralCount || 0,
      paidReferrals: userData.referralPaidCount || 0,
      totalEarnings: userData.referralEarnings || 0,
      withdrawable: userData.referralWithdrawable || 0,
      totalWithdrawn: userData.referralTotalWithdrawn || 0,
      transactions: transactions
    };
  } catch (error) {
    console.error('Error getting referral stats:', error.message);
    return null;
  }
};

/**
 * Create withdrawal request
 */
const createWithdrawalRequest = async (userId, amount, mpesaPhone) => {
  const MINIMUM_WITHDRAWAL = 100; // 100 KES minimum

  try {
    const { admin, db } = await initializeFirebase();
    if (!db) return { success: false, error: 'Database not available' };

    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return { success: false, error: 'User not found' };
    }

    const userData = userDoc.data();
    const withdrawable = userData.referralWithdrawable || 0;

    // Validate amount
    if (amount < MINIMUM_WITHDRAWAL) {
      return { success: false, error: `Minimum withdrawal is ${MINIMUM_WITHDRAWAL} KES` };
    }

    if (amount > withdrawable) {
      return { success: false, error: `Insufficient balance. Available: ${withdrawable} KES` };
    }

    // Check for pending withdrawals (cooldown)
    const pendingSnapshot = await db.collection('withdrawals')
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (!pendingSnapshot.empty) {
      return { success: false, error: 'You have a pending withdrawal request' };
    }

    // Create withdrawal request
    const withdrawalRef = await db.collection('withdrawals').add({
      userId: userId,
      userEmail: userData.email,
      userName: userData.displayName,
      amount: amount,
      mpesaPhone: formatPhoneNumber(mpesaPhone),
      status: 'pending',
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedAt: null,
      processedBy: null,
      mpesaReference: null
    });

    // Deduct from withdrawable (move to pending)
    await userDoc.ref.update({
      referralWithdrawable: admin.firestore.FieldValue.increment(-amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`📤 Withdrawal request created: ${withdrawalRef.id}`);
    return { success: true, withdrawalId: withdrawalRef.id };
  } catch (error) {
    console.error('Error creating withdrawal:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get all pending withdrawals (for admin)
 */
const getPendingWithdrawals = async () => {
  try {
    const { db } = await initializeFirebase();
    if (!db) return [];

    const snapshot = await db.collection('withdrawals')
      .where('status', '==', 'pending')
      .orderBy('requestedAt', 'asc')
      .get();

    const withdrawals = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      withdrawals.push({
        id: doc.id,
        ...data,
        requestedAt: data.requestedAt?.toDate?.() || data.requestedAt
      });
    });

    return withdrawals;
  } catch (error) {
    console.error('Error getting pending withdrawals:', error.message);
    return [];
  }
};

/**
 * Process withdrawal (admin marks as paid)
 */
const processWithdrawal = async (withdrawalId, adminId, mpesaReference) => {
  try {
    const { admin, db } = await initializeFirebase();
    if (!db) return { success: false, error: 'Database not available' };

    const withdrawalRef = db.collection('withdrawals').doc(withdrawalId);
    const withdrawalDoc = await withdrawalRef.get();

    if (!withdrawalDoc.exists) {
      return { success: false, error: 'Withdrawal not found' };
    }

    const withdrawalData = withdrawalDoc.data();

    if (withdrawalData.status !== 'pending') {
      return { success: false, error: 'Withdrawal already processed' };
    }

    // Update withdrawal status
    await withdrawalRef.update({
      status: 'completed',
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedBy: adminId,
      mpesaReference: mpesaReference || null
    });

    // Update user's total withdrawn
    await db.collection('users').doc(withdrawalData.userId).update({
      referralTotalWithdrawn: admin.firestore.FieldValue.increment(withdrawalData.amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Withdrawal ${withdrawalId} processed`);
    return { success: true };
  } catch (error) {
    console.error('Error processing withdrawal:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Get all referrers with stats (for admin)
 */
const getAllReferrers = async (limit = 100) => {
  try {
    const { db } = await initializeFirebase();
    if (!db) return [];

    const snapshot = await db.collection('users')
      .where('referralCode', '!=', '')
      .orderBy('referralCode')
      .orderBy('referralEarnings', 'desc')
      .limit(limit)
      .get();

    const referrers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.referralCode) {
        referrers.push({
          id: doc.id,
          displayName: data.displayName,
          email: data.email,
          referralCode: data.referralCode,
          totalReferrals: data.referralCount || 0,
          paidReferrals: data.referralPaidCount || 0,
          totalEarnings: data.referralEarnings || 0,
          withdrawable: data.referralWithdrawable || 0,
          totalWithdrawn: data.referralTotalWithdrawn || 0
        });
      }
    });

    return referrers;
  } catch (error) {
    console.error('Error getting referrers:', error.message);
    return [];
  }
};

// ==================== HELPER FUNCTIONS ====================

function formatPhoneNumber(phoneNumber) {
  let formattedPhone = phoneNumber.replace(/[^\d]/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '254' + formattedPhone.substring(1);
  } else if (!formattedPhone.startsWith('254')) {
    formattedPhone = '254' + formattedPhone;
  }
  return formattedPhone;
}

// ==================== IN-MEMORY FALLBACK ====================
// Used when Firebase is not available

function saveToMemory(paymentData) {
  global.payments = global.payments || {};
  const id = paymentData.id || paymentData.sessionId;
  global.payments[paymentData.sessionId] = {
    ...paymentData,
    id: id
  };
  return id;
}

function updateInMemory(checkoutRequestId, updateData) {
  global.payments = global.payments || {};
  for (const sessionId in global.payments) {
    if (global.payments[sessionId].checkoutRequestId === checkoutRequestId) {
      global.payments[sessionId] = {
        ...global.payments[sessionId],
        ...updateData,
        updatedAt: new Date()
      };
      return sessionId;
    }
  }
  return null;
}

function getFromMemory(sessionId) {
  global.payments = global.payments || {};
  return global.payments[sessionId] || null;
}

function getFromMemoryByCheckoutId(checkoutRequestId) {
  global.payments = global.payments || {};
  for (const sessionId in global.payments) {
    if (global.payments[sessionId].checkoutRequestId === checkoutRequestId) {
      return global.payments[sessionId];
    }
  }
  return null;
}

function getAllFromMemory() {
  global.payments = global.payments || {};
  return Object.values(global.payments).sort((a, b) =>
    new Date(b.createdAt) - new Date(a.createdAt)
  );
}

// ==================== EXPORTS ====================

module.exports = {
  initializeFirebase,
  // Transactions
  saveTransaction,
  createPaymentTransaction: saveTransaction, // Alias
  updateTransaction,
  updatePaymentTransaction: updateTransaction, // Alias
  updateTransactionByCheckoutId,
  getTransactionByCheckoutId,
  getTransactionBySessionId,
  getTransactionByMpesaCode,
  markTransactionAsUsed,
  saveStudentResults,
  getAllTransactions,
  // Referrals
  validateReferralCode,
  creditReferrer,
  getReferralStats,
  createWithdrawalRequest,
  getPendingWithdrawals,
  processWithdrawal,
  getAllReferrers,
  // Helpers
  formatPhoneNumber
};
