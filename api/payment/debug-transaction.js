const { getTransactionBySessionId } = require('../utils/firebase');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { sessionId, phone } = req.query;

    if (!sessionId && !phone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please provide sessionId or phone number' 
      });
    }

    let transaction = null;

    if (sessionId) {
      transaction = await getTransactionBySessionId(sessionId);
    } else if (phone) {
      // Get by phone - find most recent
      const { db } = await require('../utils/firebase').initializeFirebase();
      if (db) {
        const formattedPhone = phone.startsWith('254') ? phone : `254${phone.replace(/^0+/, '')}`;
        const snapshot = await db.collection('transactions')
          .where('phoneNumber', '==', formattedPhone)
          .orderBy('createdAt', 'desc')
          .limit(1)
          .get();
        
        if (!snapshot.empty) {
          const data = snapshot.docs[0].data();
          transaction = {
            id: snapshot.docs[0].id,
            ...data,
            createdAt: data.createdAt?.toDate?.() || data.createdAt,
            updatedAt: data.updatedAt?.toDate?.() || data.updatedAt
          };
        }
      }
    }

    if (!transaction) {
      return res.status(404).json({ 
        success: false, 
        message: 'Transaction not found' 
      });
    }

    // Show full transaction data for debugging
    res.json({
      success: true,
      data: transaction,
      debug: {
        hasReferralCode: !!transaction.referralCode,
        referralCodeValue: transaction.referralCode || null,
        status: transaction.status,
        mpesaCode: transaction.mpesaReceiptNumber || null,
        allFields: Object.keys(transaction)
      }
    });

  } catch (error) {
    console.error('Debug transaction error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      stack: error.stack
    });
  }
};
