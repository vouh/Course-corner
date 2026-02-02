/**
 * Firebase Debug & Test Endpoint
 * 
 * GET /api/admin/firebase-test - Test Firebase connectivity
 * POST /api/admin/firebase-test - Create a test transaction
 */

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const results = {
    timestamp: new Date().toISOString(),
    checks: []
  };

  try {
    // Check 1: Environment variables
    const envCheck = {
      name: 'Environment Variables',
      status: 'checking'
    };
    
    const hasProjectId = !!process.env.FIREBASE_PROJECT_ID;
    const hasPrivateKey = !!process.env.FIREBASE_PRIVATE_KEY;
    const hasClientEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
    
    envCheck.details = {
      FIREBASE_PROJECT_ID: hasProjectId ? '✅ Set' : '❌ Missing',
      FIREBASE_PRIVATE_KEY: hasPrivateKey ? '✅ Set' : '❌ Missing',
      FIREBASE_CLIENT_EMAIL: hasClientEmail ? '✅ Set' : '❌ Missing',
    };
    
    envCheck.status = (hasProjectId && hasPrivateKey && hasClientEmail) ? 'pass' : 'fail';
    results.checks.push(envCheck);

    // Check 2: Firebase initialization
    const initCheck = {
      name: 'Firebase Initialization',
      status: 'checking'
    };

    let admin, db;
    try {
      admin = require('firebase-admin');
      
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
          initCheck.details = { mode: 'Full credentials' };
        } else {
          admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || 'course-corner'
          });
          initCheck.details = { mode: 'Limited (no credentials)' };
        }
      } else {
        initCheck.details = { mode: 'Already initialized', apps: admin.apps.length };
      }
      
      db = admin.firestore();
      initCheck.status = 'pass';
    } catch (error) {
      initCheck.status = 'fail';
      initCheck.error = error.message;
    }
    results.checks.push(initCheck);

    // Check 3: Firestore read test
    const readCheck = {
      name: 'Firestore Read Test',
      status: 'checking'
    };

    try {
      if (db) {
        const snapshot = await db.collection('transactions')
          .orderBy('createdAt', 'desc')
          .limit(5)
          .get();
        
        readCheck.status = 'pass';
        readCheck.details = {
          documentsFound: snapshot.size,
          collectionExists: true
        };
        
        // Show sample of recent transactions
        if (snapshot.size > 0) {
          readCheck.recentTransactions = [];
          snapshot.forEach(doc => {
            const data = doc.data();
            readCheck.recentTransactions.push({
              id: doc.id,
              phone: data.phoneNumber ? `${String(data.phoneNumber).slice(0, 6)}...` : 'N/A',
              amount: data.amount,
              status: data.status,
              receipt: data.mpesaReceiptNumber || 'N/A',
              createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt
            });
          });
        }
      } else {
        readCheck.status = 'fail';
        readCheck.error = 'Database not initialized';
      }
    } catch (error) {
      readCheck.status = 'fail';
      readCheck.error = error.message;
      
      // Check if it's an index error
      if (error.message.includes('index')) {
        readCheck.suggestion = 'Create a composite index on "transactions" collection for (status, createdAt desc)';
      }
    }
    results.checks.push(readCheck);

    // Check 4: Firestore write test (only on POST)
    if (req.method === 'POST') {
      const writeCheck = {
        name: 'Firestore Write Test',
        status: 'checking'
      };

      try {
        if (db) {
          const testRef = db.collection('transactions').doc();
          const testData = {
            id: testRef.id,
            sessionId: `test-${Date.now()}`,
            phoneNumber: '254700000000',
            amount: 1,
            category: 'test',
            status: 'test',
            mpesaReceiptNumber: `TEST${Date.now()}`,
            transactionCode: `TEST${Date.now()}`,
            resultDesc: 'Firebase connectivity test - safe to delete',
            metadata: { test: true },
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          await testRef.set(testData);
          writeCheck.status = 'pass';
          writeCheck.details = {
            documentId: testRef.id,
            message: 'Test transaction created successfully'
          };

          // Optionally delete the test document
          // await testRef.delete();
          // writeCheck.details.cleaned = true;
        } else {
          writeCheck.status = 'fail';
          writeCheck.error = 'Database not initialized';
        }
      } catch (error) {
        writeCheck.status = 'fail';
        writeCheck.error = error.message;
      }
      results.checks.push(writeCheck);
    }

    // Overall status
    results.overallStatus = results.checks.every(c => c.status === 'pass') ? 'healthy' : 'issues';
    
    res.json({
      success: true,
      ...results
    });

  } catch (error) {
    console.error('Firebase test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
