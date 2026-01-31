// M-Pesa Payment Handler for Course Corner
// Manages all payment interactions with the backend

class PaymentHandler {
    constructor(serverUrl = 'https://course-corner-server.vercel.app/api') {
        this.serverUrl = serverUrl;
        this.sessionId = localStorage.getItem('paymentSessionId') || null;
        this.isPaymentCompleted = false;
        console.log('PaymentHandler initialized with server URL:', serverUrl);
    }

    // Base configuration is handled in the first constructor

    // Initiate payment
    async initiatePayment(phoneNumber, category, amount, referralCode = null) {
        try {
            console.log('Initiating payment:', { phoneNumber, category, amount, referralCode });

            // Validate inputs
            if (!phoneNumber) {
                throw new Error('Please enter your phone number');
            }

            if (!category) {
                throw new Error('Invalid category selected');
            }
            if (!amount) throw new Error('Invalid amount');

            // Call backend to initiate STK push
            const response = await fetch(`${this.serverUrl}/mpesa/stkpush`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phoneNumber,
                    category,
                    amount: parseInt(amount),
                    referralCode
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

    // Poll payment status with real-time feedback
    async pollPaymentStatus(maxAttempts = 40, interval = 3000, onStatusUpdate = null) {
        if (!this.sessionId) {
            throw new Error('No active payment session');
        }

        console.log('Starting payment status polling...');
        let attempts = 0;

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
                        console.log('Payment completed!');
                        resolve({
                            success: true,
                            status: 'completed',
                            data: data.data
                        });
                    } else if (data.data?.status === 'failed') {
                        // Check if it's actually still processing (server bug workaround)
                        const resultDesc = data.data?.resultDesc || data.data?.errorMessage || '';
                        if (resultDesc.toLowerCase().includes('processing')) {
                            console.log('Still processing despite failed status, continuing to poll...');
                            // Don't stop polling - this is a false "failed" status
                        } else {
                            clearInterval(pollInterval);
                            console.log('Payment failed!');

                            // Get detailed error message from M-Pesa
                            const errorMessage = this.getMpesaErrorMessage(resultDesc);
                            reject(new Error(errorMessage));
                        }
                    } else if (data.data?.status === 'cancelled') {
                        clearInterval(pollInterval);
                        console.log('Payment cancelled!');
                        reject(new Error('You cancelled the M-Pesa payment request'));
                    }

                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval);
                        console.log('Payment polling timed out');
                        reject(new Error('Payment verification timed out. If money was deducted, please contact support.'));
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

    // Get user-friendly M-Pesa error message
    getMpesaErrorMessage(resultDesc) {
        if (!resultDesc) return 'Payment failed. Please try again.';

        // Check for WRONG_PIN prefix first (from server)
        if (resultDesc.startsWith('WRONG_PIN:')) {
            return '🔐 Wrong M-Pesa PIN entered! Please try again with the correct PIN.';
        }

        const errorMessages = {
            'Request cancelled by user': 'You cancelled the payment request.',
            'The initiator information is invalid': 'Payment service error. Please try again.',
            'DS timeout': 'M-Pesa request timed out. Please try again.',
            'insufficient_balance': 'Insufficient M-Pesa balance.',
            'Wrong Pin': '🔐 Wrong M-Pesa PIN entered! Please try again with the correct PIN.',
            'wrong pin': '🔐 Wrong M-Pesa PIN entered! Please try again with the correct PIN.',
            'Invalid MSISDN': 'Invalid phone number. Please check and try again.',
            'The service request is processed successfully': 'Payment successful!',
            'The balance is insufficient': 'Insufficient M-Pesa balance. Please top up and try again.',
            'User did not enter pin': 'You did not enter your M-Pesa PIN. Please try again.',
            'Transaction timed out': 'Transaction timed out. Please try again.',
            'System internal error': 'M-Pesa system error. Please try again later.',
            '1032': 'You cancelled the payment request.',
            '1': 'Insufficient M-Pesa balance.',
            '2001': '🔐 Wrong M-Pesa PIN entered! Please try again with the correct PIN.',
            '1025': '🔐 Wrong M-Pesa PIN entered! Please try again with the correct PIN.',
            '1037': 'M-Pesa request timed out. No response received.',
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

    // Verify existing payment (for "I Already Paid" option)
    async verifyExistingPayment(phoneNumber, category, onSuccess) {
        try {
            Swal.fire({
                title: 'Verifying Payment...',
                html: '<p>Checking for your payment...</p>',
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading()
            });

            // Format phone number
            let formattedPhone = phoneNumber.replace(/\s/g, '');
            if (formattedPhone.startsWith('0')) {
                formattedPhone = '254' + formattedPhone.substring(1);
            } else if (formattedPhone.startsWith('+')) {
                formattedPhone = formattedPhone.substring(1);
            }

            // Check for completed payment with this phone
            const response = await fetch(`${this.serverUrl}/payment/verify-phone`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phoneNumber: formattedPhone, category })
            });

            const data = await response.json();

            if (data.success && data.hasAccess) {
                // Found a completed payment
                this.sessionId = data.sessionId;
                localStorage.setItem('paymentSessionId', this.sessionId);
                this.isPaymentCompleted = true;

                await Swal.fire({
                    icon: 'success',
                    title: '✅ Payment Verified!',
                    text: 'Your previous payment has been found. Loading your results...',
                    timer: 2000,
                    showConfirmButton: false,
                    timerProgressBar: true
                });

                if (onSuccess && typeof onSuccess === 'function') {
                    onSuccess();
                }
                return { success: true };
            } else {
                // No payment found
                await Swal.fire({
                    icon: 'warning',
                    title: 'No Payment Found',
                    html: `
                        <p>We couldn't find a completed payment for this phone number.</p>
                        <p style="margin-top: 0.5rem; font-size: 0.9rem; color: #6b7280;">
                            If you just paid, please wait a moment and try again. M-Pesa confirmations can take up to 2 minutes.
                        </p>
                    `,
                    confirmButtonText: 'Try Again',
                    confirmButtonColor: '#10b981',
                    showCancelButton: true,
                    cancelButtonText: 'New Payment'
                }).then((result) => {
                    if (!result.isConfirmed) {
                        // User wants to make new payment, re-trigger payment flow
                        this.processPayment(category, data.amount || 100, onSuccess);
                    }
                });
                return { success: false };
            }
        } catch (error) {
            console.error('Payment verification error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Verification Failed',
                text: 'Could not verify payment. Please try again or contact support.',
                confirmButtonColor: '#10b981'
            });
            return { success: false };
        }
    }

    // Full payment flow with UI - processPayment wrapper
    async processPayment(category, amount, onSuccess) {
        try {
            // Get referral code from localStorage or URL
            let storedReferralCode = localStorage.getItem('pendingReferralCode') || '';
            
            // Check URL params for referral code (supports both ?ref= and #ref=)
            const urlParams = new URLSearchParams(window.location.search);
            let urlRefCode = urlParams.get('ref') || urlParams.get('referral');
            
            // Also check hash params (e.g., #ref=XXXXX)
            if (!urlRefCode && window.location.hash) {
                const hashParams = window.location.hash.substring(1);
                if (hashParams.startsWith('ref=')) {
                    urlRefCode = hashParams.split('=')[1];
                }
            }
            
            if (urlRefCode) {
                storedReferralCode = urlRefCode;
                localStorage.setItem('pendingReferralCode', urlRefCode);
            }

            // Prompt for phone number with referral code option
            const { value: formData, isDenied } = await Swal.fire({
                title: '📱 M-Pesa Payment',
                html: `
                    <div style="text-align: left;">
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                Phone Number <span style="color: #ef4444;">*</span>
                            </label>
                            <input type="tel" id="swal-phone" class="swal2-input" placeholder="07XXXXXXXX" 
                                style="margin: 0; width: 100%; box-sizing: border-box;">
                        </div>
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-weight: 600; color: #374151; margin-bottom: 0.5rem; font-size: 0.9rem;">
                                <i class="fas fa-gift" style="color: #8b5cf6;"></i> Referral Code <span style="color: #9ca3af; font-weight: 400;">(optional)</span>
                            </label>
                            <input type="text" id="swal-referral" class="swal2-input" placeholder="Enter code if you have one" 
                                value="${storedReferralCode}" style="margin: 0; width: 100%; box-sizing: border-box; text-transform: uppercase;">
                        </div>
                        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 0.5rem; padding: 0.75rem; margin-top: 1rem;">
                            <p style="color: #166534; font-size: 0.85rem; margin: 0;">
                                <i class="fas fa-info-circle"></i> You'll receive an M-Pesa prompt on your phone. Enter your PIN to pay <strong>KES ${amount}</strong>.
                            </p>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                showDenyButton: true,
                confirmButtonText: '<i class="fas fa-mobile-alt"></i> Pay KES ' + amount,
                denyButtonText: '<i class="fas fa-check-circle"></i> I Already Paid',
                cancelButtonText: 'Cancel',
                confirmButtonColor: '#10b981',
                denyButtonColor: '#3b82f6',
                cancelButtonColor: '#6b7280',
                focusConfirm: false,
                preConfirm: () => {
                    const phone = document.getElementById('swal-phone').value;
                    const referral = document.getElementById('swal-referral').value.trim().toUpperCase();
                    
                    if (!phone) {
                        Swal.showValidationMessage('Please enter your phone number');
                        return false;
                    }
                    
                    const cleaned = phone.replace(/\s/g, '');
                    if (!/^(0|254|\+254)?[17]\d{8}$/.test(cleaned)) {
                        Swal.showValidationMessage('Please enter a valid Kenyan phone number');
                        return false;
                    }
                    
                    return { phone, referral };
                },
                preDeny: () => {
                    const phone = document.getElementById('swal-phone').value;
                    const referral = document.getElementById('swal-referral').value.trim().toUpperCase();
                    
                    if (!phone) {
                        Swal.showValidationMessage('Please enter your phone number to verify payment');
                        return false;
                    }
                    
                    return { phone, referral };
                }
            });

            // Handle "I Already Paid" option
            if (isDenied && formData) {
                return await this.verifyExistingPayment(formData.phone, category, onSuccess);
            }

            if (!formData) {
                console.log('Payment cancelled');
                return;
            }

            const phoneNumber = formData.phone;
            const referralCode = formData.referral || null;

            // Store referral code if provided
            if (referralCode) {
                localStorage.setItem('pendingReferralCode', referralCode);
                console.log('📌 Referral code saved:', referralCode);
            }

            // Show loading
            Swal.fire({
                title: 'Initiating Payment...',
                html: '<p>Please wait while we connect to M-Pesa...</p>',
                allowOutsideClick: false,
                showConfirmButton: false,
                didOpen: () => Swal.showLoading()
            });

            if (referralCode) {
                console.log('📌 Applying referral code:', referralCode);
            }

            // Initiate payment with referral code
            const initResult = await this.initiatePayment(phoneNumber, category, amount, referralCode);
            
            if (!initResult.success) {
                throw new Error('Failed to initiate payment');
            }

            // Show waiting for payment
            Swal.fire({
                title: '⏳ Waiting for Payment',
                html: `
                    <div style="text-align: center;">
                        <p style="margin-bottom: 1rem;">Check your phone for the M-Pesa prompt</p>
                        <p style="font-size: 0.875rem; color: #6b7280;">Enter your M-Pesa PIN to complete payment of <strong>KES ${amount}</strong></p>
                        <div id="paymentStatus" style="margin-top: 1rem; padding: 0.5rem; background: #f3f4f6; border-radius: 0.5rem;">
                            <i class="fas fa-spinner fa-spin"></i> Waiting for confirmation...
                        </div>
                    </div>
                `,
                allowOutsideClick: false,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'Cancel',
                cancelButtonColor: '#6b7280'
            });

            // Poll for payment status
            const result = await this.pollPaymentStatus(40, 3000, (status, attempt, max) => {
                const statusEl = document.getElementById('paymentStatus');
                if (statusEl) {
                    statusEl.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Checking payment (${attempt}/${max})...`;
                }
            });

            if (result.success && result.status === 'completed') {
                // Payment successful!
                await Swal.fire({
                    icon: 'success',
                    title: '✅ Payment Successful!',
                    text: 'Your payment has been confirmed. Loading your results...',
                    timer: 2000,
                    showConfirmButton: false,
                    timerProgressBar: true
                });

                // Call success callback
                if (onSuccess && typeof onSuccess === 'function') {
                    onSuccess();
                }
            }

        } catch (error) {
            console.error('Payment process error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Payment Failed',
                text: error.message || 'Something went wrong. Please try again.',
                confirmButtonColor: '#10b981'
            });
            throw error;
        }
    }
}

// Make PaymentHandler globally available
window.PaymentHandler = PaymentHandler;
console.log('PaymentHandler class loaded and ready');
