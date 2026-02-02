// M-Pesa Payment Handler for Course Corner
// Manages all payment interactions with the backend

class PaymentHandler {
    constructor(serverUrl = 'https://course-corner-server.vercel.app/api') {
        this.serverUrl = serverUrl;
        this.sessionId = localStorage.getItem('paymentSessionId') || null;
        this.isPaymentCompleted = false;
        console.log('PaymentHandler initialized with server URL:', serverUrl);
    }

    // Payment amounts mapping
    static AMOUNTS = {
        'calculate-cluster-points': 50,
        'courses-only': 100,
        'point-and-courses': 150
    };

    // Initiate payment
    async initiatePayment(phoneNumber, category) {
        try {
            console.log('Initiating payment:', { phoneNumber, category });
            
            // Validate inputs
            if (!phoneNumber) {
                throw new Error('Please enter your phone number');
            }

            if (!category) {
                throw new Error('Invalid category selected');
            }

            // Call backend to initiate STK push
            const response = await fetch(`${this.serverUrl}/mpesa/stkpush`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phoneNumber,
                    category
                })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Failed to initiate payment');
            }

            // Store session ID
            this.sessionId = data.data.sessionId;
            localStorage.setItem('paymentSessionId', this.sessionId);
            console.log('Payment initiated. Session ID:', this.sessionId);

            return {
                success: true,
                sessionId: this.sessionId,
                amount: data.data.amount,
                category
            };

        } catch (error) {
            console.error('Payment initiation error:', error);
            throw error;
        }
    }

    // Poll payment status with real-time feedback and M-Pesa query fallback
    async pollPaymentStatus(maxAttempts = 80, interval = 3000, onStatusUpdate = null) {
        if (!this.sessionId) {
            throw new Error('No active payment session');
        }

        console.log('Starting payment status polling (4 minutes max)...');
        let attempts = 0;
        let queriedMpesa = false;

        return new Promise((resolve, reject) => {
            const pollInterval = setInterval(async () => {
                attempts++;
                console.log(`Polling attempt ${attempts}/${maxAttempts}`);

                try {
                    const response = await fetch(`${this.serverUrl}/mpesa/status?sessionId=${this.sessionId}`);
                    const data = await response.json();

                    console.log('Poll response:', data.data);

                    // Call status update callback if provided
                    if (onStatusUpdate && typeof onStatusUpdate === 'function') {
                        onStatusUpdate(data.data?.status, attempts, maxAttempts);
                    }

                    if (data.data?.status === 'completed') {
                        clearInterval(pollInterval);
                        this.isPaymentCompleted = true;
                        console.log('✅ Payment completed!');
                        resolve({
                            success: true,
                            status: 'completed',
                            data: data.data
                        });
                    } else if (data.data?.status === 'failed') {
                        clearInterval(pollInterval);
                        console.log('❌ Payment failed!');
                        
                        // Get detailed error message from M-Pesa
                        const errorMessage = this.getMpesaErrorMessage(data.data?.resultDesc || data.data?.errorMessage);
                        reject(new Error(errorMessage));
                    } else if (data.data?.status === 'cancelled') {
                        clearInterval(pollInterval);
                        console.log('❌ Payment cancelled!');
                        reject(new Error('You cancelled the M-Pesa payment request'));
                    }

                    // FALLBACK: After 2 minutes (40 attempts), query M-Pesa directly if still pending
                    if (attempts === 40 && data.data?.status === 'pending' && !queriedMpesa) {
                        queriedMpesa = true;
                        console.log('⏰ 2 minutes elapsed, querying M-Pesa directly for status...');
                        
                        try {
                            const queryResponse = await fetch(`${this.serverUrl}/mpesa/query`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ sessionId: this.sessionId })
                            });
                            
                            const queryData = await queryResponse.json();
                            console.log('📞 M-Pesa Query Result:', queryData);
                            
                            if (queryData.success && queryData.data?.status === 'completed') {
                                clearInterval(pollInterval);
                                this.isPaymentCompleted = true;
                                console.log('✅ Payment verified via M-Pesa query!');
                                resolve({
                                    success: true,
                                    status: 'completed',
                                    data: queryData.data,
                                    verified: true
                                });
                            }
                        } catch (queryError) {
                            console.error('Query fallback error:', queryError);
                            // Continue polling if query fails
                        }
                    }

                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        console.log('⏰ Payment polling timed out after 4 minutes');
                        reject(new Error('Payment verification timed out. If money was deducted, click "Verify Payment" below.'));
                    }

                } catch (error) {
                    console.error('Poll error:', error);
                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        reject(error);
                    }
                }
            }, interval);
        });
    }

    // Manually verify payment status (for when polling times out)
    async verifyPaymentManually() {
        if (!this.sessionId) {
            throw new Error('No payment session found');
        }

        console.log('🔍 Manually verifying payment status...');

        try {
            // First check current status
            const statusResponse = await fetch(`${this.serverUrl}/mpesa/status?sessionId=${this.sessionId}`);
            const statusData = await statusResponse.json();

            if (statusData.data?.status === 'completed') {
                this.isPaymentCompleted = true;
                return {
                    success: true,
                    status: 'completed',
                    message: 'Payment already completed!',
                    data: statusData.data
                };
            }

            // If still pending, query M-Pesa directly
            console.log('⏳ Status still pending, querying M-Pesa...');
            
            const queryResponse = await fetch(`${this.serverUrl}/mpesa/query`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: this.sessionId })
            });

            const queryData = await queryResponse.json();

            if (!queryData.success) {
                throw new Error(queryData.message || 'Failed to verify payment');
            }

            if (queryData.data?.status === 'completed') {
                this.isPaymentCompleted = true;
                console.log('✅ Payment verified successfully!');
                return {
                    success: true,
                    status: 'completed',
                    message: 'Payment verified successfully!',
                    data: queryData.data,
                    verified: true
                };
            } else if (queryData.data?.status === 'failed') {
                return {
                    success: false,
                    status: 'failed',
                    message: queryData.data?.resultDesc || 'Payment failed'
                };
            } else {
                return {
                    success: false,
                    status: 'pending',
                    message: 'Payment is still being processed by M-Pesa. Please wait a moment and try again.'
                };
            }

        } catch (error) {
            console.error('Manual verification error:', error);
            throw error;
        }
    }

    // Get user-friendly M-Pesa error message
    getMpesaErrorMessage(resultDesc) {
        if (!resultDesc) return 'Payment failed. Please try again.';
        
        const errorMessages = {
            'Request cancelled by user': 'You cancelled the payment request.',
            'The initiator information is invalid': 'Payment service error. Please try again.',
            'DS timeout': 'M-Pesa request timed out. Please try again.',
            'insufficient_balance': 'Insufficient M-Pesa balance.',
            'Wrong Pin': 'Wrong M-Pesa PIN entered. Please try again.',
            'Invalid MSISDN': 'Invalid phone number. Please check and try again.',
            'The service request is processed successfully': 'Payment successful!',
            'The balance is insufficient': 'Insufficient M-Pesa balance. Please top up and try again.',
            'User did not enter pin': 'You did not enter your M-Pesa PIN. Please try again.',
            'Transaction timed out': 'Transaction timed out. Please try again.',
            'System internal error': 'M-Pesa system error. Please try again later.',
            '1032': 'You cancelled the payment request.',
            '1': 'Insufficient M-Pesa balance.',
            '2001': 'Wrong M-Pesa PIN entered.',
            '1037': 'M-Pesa request timed out. No response received.',
            '1025': 'Transaction limit exceeded.',
            '1019': 'Transaction expired. Please try again.'
        };

        // Check for matching error
        for (const [key, message] of Object.entries(errorMessages)) {
            if (resultDesc.toLowerCase().includes(key.toLowerCase())) {
                return message;
            }
        }

        // Return original message if no match found
        return resultDesc;
    }

    // Check if payment is completed
    async hasAccessToCategory(category = null) {
        try {
            if (!this.sessionId) {
                return { hasAccess: false, message: 'No payment session found' };
            }

            const response = await fetch(`${this.serverUrl}/payment/has-access`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId,
                    category
                })
            });

            const data = await response.json();
            return data;

        } catch (error) {
            console.error('Access check error:', error);
            return { hasAccess: false, message: error.message };
        }
    }

    // Approve and unlock content
    async approveAccess() {
        try {
            if (!this.sessionId) {
                throw new Error('No payment session found');
            }

            const response = await fetch(`${this.serverUrl}/payment/approve`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    sessionId: this.sessionId
                })
            });

            const data = await response.json();

            if (!data.success) {
                throw new Error(data.message);
            }

            // Store access token
            localStorage.setItem('accessToken', data.data.accessToken);
            localStorage.setItem('accessExpires', data.data.expiresAt);
            console.log('Access approved');

            return data;

        } catch (error) {
            console.error('Approval error:', error);
            throw error;
        }
    }

    // Clear session
    clearSession() {
        this.sessionId = null;
        this.isPaymentCompleted = false;
        localStorage.removeItem('paymentSessionId');
        localStorage.removeItem('accessToken');
        localStorage.removeItem('accessExpires');
        console.log('Session cleared');
    }
}

// Make PaymentHandler globally available
window.PaymentHandler = PaymentHandler;
console.log('PaymentHandler class loaded and ready');
