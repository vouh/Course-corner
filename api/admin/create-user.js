/**
 * Admin API: Create Firebase Auth user account for institutional partners
 * Uses Firebase Admin SDK so it doesn't affect admin's client session
 */

const { initializeFirebase } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, password, displayName, commissionRate, referralCode } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Email and password are required' 
      });
    }

    console.log(`📝 Creating user account for: ${email}`);

    const { admin, db } = await initializeFirebase();
    if (!db) {
      throw new Error('Firebase not initialized');
    }

    // Create Firebase Auth user using Admin SDK (doesn't affect client session)
    let authUser;
    try {
      authUser = await admin.auth().createUser({
        email: email,
        password: password,
        displayName: displayName || email.split('@')[0],
        emailVerified: false
      });
      console.log(`✅ Firebase Auth user created: ${authUser.uid}`);
    } catch (authError) {
      // Check if user already exists
      if (authError.code === 'auth/email-already-exists') {
        console.log(`ℹ️ User already exists, fetching existing user`);
        authUser = await admin.auth().getUserByEmail(email);
        console.log(`✅ Existing user found: ${authUser.uid}`);
      } else {
        throw authError;
      }
    }

    // Create/Update Firestore user profile
    const userRef = db.collection('users').doc(authUser.uid);
    const userDoc = await userRef.get();

    const profileData = {
      uid: authUser.uid,
      email: email,
      displayName: displayName || email.split('@')[0],
      photoURL: '',
      phoneNumber: '',
      referralCode: referralCode || '',
      referralCreatedAt: referralCode ? admin.firestore.FieldValue.serverTimestamp() : null,
      referralCount: 0,
      referralPaidCount: 0,
      referralEarnings: 0,
      referralPending: 0,
      referredBy: '',
      isAdmin: true,
      commissionRate: commissionRate || 50,
      accountType: 'institutional',
      isAdminAdded: true,
      source: 'admin-manual',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (userDoc.exists) {
      // Update existing user
      await userRef.update(profileData);
      console.log(`✅ Updated existing user profile: ${authUser.uid}`);
    } else {
      // Create new profile
      profileData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await userRef.set(profileData);
      console.log(`✅ Created new user profile: ${authUser.uid}`);
    }

    // Update referralCode document to link to user
    if (referralCode) {
      try {
        await db.collection('referralCodes').doc(referralCode).update({
          userId: authUser.uid,
          pendingAuth: false,
          linkedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Linked referralCode ${referralCode} to user ${authUser.uid}`);
      } catch (codeError) {
        console.warn('⚠️ Could not update referralCode:', codeError.message);
      }
    }

    return res.status(200).json({
      success: true,
      userId: authUser.uid,
      email: authUser.email,
      message: 'User account created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating user:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to create user account'
    });
  }
};
