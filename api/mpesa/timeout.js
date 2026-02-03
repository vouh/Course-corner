const { getTransactionBySessionId, updateTransaction } = require('../utils/firebase');

module.exports = async (req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { sessionId } = req.body;

        if (!sessionId) {
            return res.status(400).json({ success: false, message: 'Session ID is required' });
        }

        console.log(`⏰ Timing out session: ${sessionId}`);

        // Find the transaction
        const payment = await getTransactionBySessionId(sessionId);

        if (!payment) {
            return res.status(404).json({ success: false, message: 'Payment session not found' });
        }

        // Only update if it's still in a pending state
        if (payment.status === 'pending' || payment.status === 'awaiting_callback') {
            await updateTransaction(payment.id, {
                status: 'failed',
                resultDesc: 'Payment request timed out (user wait-time exceeded)',
                failureReason: 'timeout',
                updatedAt: new Date()
            });

            console.log(`✅ Session ${sessionId} marked as timed out`);
            return res.json({ success: true, message: 'Session marked as timed out' });
        }

        return res.json({
            success: true,
            message: 'Session status was already updated',
            status: payment.status
        });

    } catch (error) {
        console.error('Timeout handler error:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
