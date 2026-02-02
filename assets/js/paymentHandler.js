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

    // Validate referral code exists in database
    async validateReferralCode(code) {
        if (!code || code.trim() === '') {
            return { valid: true, code: null }; // No code is valid (optional)
        }

        try {
            const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
            const db = getFirestore(window.firebaseApp);
            
            // Check in referralCodes collection
            const codeDoc = await getDoc(doc(db, 'referralCodes', code.toUpperCase()));
            
            if (codeDoc.exists()) {
                const codeData = codeDoc.data();
                if (codeData.isActive) {
                    return { valid: true, code: code.toUpperCase(), owner: codeData };
                } else {
                    return { valid: false, error: 'This referral code is no longer active' };
                }
            }
            
            // Fallback: Check in users collection (for older codes)
            const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
            const usersQuery = query(collection(db, 'users'), where('referralCode', '==', code.toUpperCase()));
            const usersSnapshot = await getDocs(usersQuery);
            
            if (!usersSnapshot.empty) {
                const userData = usersSnapshot.docs[0].data();
                return { valid: true, code: code.toUpperCase(), owner: userData };
            }
            
            return { valid: false, error: 'Invalid referral code. Please check and try again.' };
        } catch (error) {
            console.error('Error validating referral code:', error);
            return { valid: false, error: 'Could not validate referral code. Please try again.' };
        }
    }

    // Initiate payment - simplified (no referral validation before STK push)
    async initiatePayment(phoneNumber, category, amount, referralCode = null) {
        try {
            console.log('Initiating payment:', { phoneNumber, category, amount });

            // Validate inputs
            if (!phoneNumber) {
                throw new Error('Please enter your phone number');
            }

            if (!category) {
                throw new Error('Invalid category selected');
            }
            if (!amount) throw new Error('Invalid amount');

            // Call backend to initiate STK push
            // NOTE: Referral code is NOT sent during STK push - removed to simplify flow
            const response = await fetch(`${this.serverUrl}/mpesa/stkpush`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    phoneNumber,
                    category,
                    amount: parseInt(amount)
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
    async pollPaymentStatus(maxAttempts = 15, interval = 3000, onStatusUpdate = null, options = {}) {
        if (!this.sessionId) {
            throw new Error('No active payment session');
        }

        const { shouldStop = null, requestTimeoutMs = 10000 } = options || {};
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        const fetchJsonWithTimeout = async (url, timeoutMs) => {
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(url, { signal: controller.signal });
                const data = await response.json();
                return { response, data };
            } finally {
                clearTimeout(t);
            }
        };

        console.log('Starting payment status polling...');
        let attempts = 0;

        while (attempts < maxAttempts) {
            attempts++;
            console.log(`Polling attempt ${attempts}/${maxAttempts}`);

            if (shouldStop && typeof shouldStop === 'function' && shouldStop()) {
                return { success: false, status: 'cancelled' };
            }

            try {
                const { response, data } = await fetchJsonWithTimeout(
                    `${this.serverUrl}/mpesa/status?sessionId=${this.sessionId}`,
                    requestTimeoutMs
                );

                const payload = data?.data || null;
                const status = payload?.status || null;
                const resultDesc = payload?.resultDesc || payload?.errorMessage || '';

                console.log('Poll response:', payload);

                if (onStatusUpdate && typeof onStatusUpdate === 'function') {
                    onStatusUpdate(status, attempts, maxAttempts);
                }

                if (!response.ok || data?.success === false) {
                    // Server error — keep polling for a few attempts, then return pending
                    if (attempts >= maxAttempts) {
                        return { success: false, status: 'pending', timedOut: true, data: payload };
                    }
                } else if (status === 'completed') {
                    this.isPaymentCompleted = true;
                    console.log('Payment completed!');
                    return { success: true, status: 'completed', data: payload };
                } else if (status === 'failed') {
                    // Sometimes M-Pesa returns a temporary state that looks like failure; treat "processing" as pending
                    if (String(resultDesc).toLowerCase().includes('processing')) {
                        console.log('Still processing, continuing to poll...');
                    } else {
                        console.log('Payment failed!');
                        throw new Error(this.getMpesaErrorMessage(resultDesc));
                    }
                } else if (status === 'cancelled') {
                    throw new Error('You cancelled the M-Pesa payment request');
                }
            } catch (error) {
                // Network/timeouts: keep trying until attempts exhausted
                console.error('Poll error:', error);
                if (attempts >= maxAttempts) {
                    return { success: false, status: 'pending', timedOut: true };
                }
            }

            await sleep(interval);
        }

        return { success: false, status: 'pending', timedOut: true };
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

    // Verify existing payment using M-Pesa transaction code (one-time use)
    async verifyByMpesaCode(mpesaCode, category, onSuccess) {
        try {
            // Show modern loading
            if (window.firebaseAuth && window.firebaseAuth.showLoadingOverlay) {
                window.firebaseAuth.showLoadingOverlay('Verifying Payment...', 'Checking your M-Pesa transaction');
            } else {
                Swal.fire({
                    title: 'Verifying Payment...',
                    html: '<p>Checking your M-Pesa transaction...</p>',
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => Swal.showLoading()
                });
            }

            // Verify M-Pesa code
            const response = await fetch(`${this.serverUrl}/mpesa/verify-mpesa-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mpesaCode: mpesaCode.toUpperCase(), category })
            });

            const data = await response.json();

            // Hide loading
            if (window.firebaseAuth && window.firebaseAuth.hideLoadingOverlay) {
                window.firebaseAuth.hideLoadingOverlay();
            }

            if (data.success && data.hasAccess) {
                // Found and verified payment
                this.sessionId = data.data.sessionId;
                localStorage.setItem('paymentSessionId', this.sessionId);
                localStorage.setItem('verifiedMpesaCode', mpesaCode.toUpperCase());
                this.isPaymentCompleted = true;

                // Show success
                if (window.firebaseAuth && window.firebaseAuth.showSuccessOverlay) {
                    window.firebaseAuth.showSuccessOverlay('Payment Verified!', 'Loading your results...', 2000);
                    
                    setTimeout(() => {
                        if (onSuccess && typeof onSuccess === 'function') {
                            onSuccess();
                        }
                    }, 2000);
                } else {
                    await Swal.fire({
                        icon: 'success',
                        title: 'Payment Verified!',
                        text: 'Your payment has been verified. Loading your results...',
                        timer: 2000,
                        showConfirmButton: false,
                        timerProgressBar: true
                    });

                    if (onSuccess && typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }
                return { success: true };
            } else {
                // Verification failed
                await Swal.fire({
                    icon: 'error',
                    title: 'Verification Failed',
                    html: `
                        <p>${data.message || 'Could not verify this M-Pesa code.'}</p>
                        ${data.usedAt ? '<p style="margin-top: 0.5rem; font-size: 0.85rem; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i> This code was already used.</p>' : ''}
                    `,
                    confirmButtonText: 'Try Again',
                    confirmButtonColor: '#10b981',
                    showCancelButton: true,
                    cancelButtonText: 'Make New Payment'
                }).then((result) => {
                    if (!result.isConfirmed) {
                        // User wants to make new payment
                        this.processPayment(category, data.amount || 100, onSuccess);
                    }
                });
                return { success: false };
            }
        } catch (error) {
            console.error('M-Pesa code verification error:', error);
            
            if (window.firebaseAuth && window.firebaseAuth.hideLoadingOverlay) {
                window.firebaseAuth.hideLoadingOverlay();
            }
            
            Swal.fire({
                icon: 'error',
                title: 'Verification Failed',
                text: 'Could not verify payment. Please check your M-Pesa code and try again.',
                confirmButtonColor: '#10b981'
            });
            return { success: false };
        }
    }

    // Legacy: Verify existing payment by phone (deprecated - use verifyByMpesaCode)
    async verifyExistingPayment(phoneNumber, category, onSuccess) {
        // Prompt for M-Pesa code instead
        const { value: mpesaCode } = await Swal.fire({
            title: '📱 Enter M-Pesa Code',
            html: `
                <div style="text-align: left;">
                    <p style="color: #6b7280; margin-bottom: 1rem; font-size: 0.9rem;">
                        Enter the M-Pesa transaction code from your SMS confirmation (e.g., <strong>SG722NMVXQ</strong>)
                    </p>
                    <input type="text" id="swal-mpesa-code" class="swal2-input" placeholder="e.g., SG722NMVXQ" 
                        style="margin: 0; width: 100%; box-sizing: border-box; text-transform: uppercase; font-family: monospace; font-size: 1.1rem; letter-spacing: 1px;">
                    <p style="margin-top: 0.75rem; font-size: 0.8rem; color: #9ca3af;">
                        <i class="fas fa-info-circle"></i> Each code can only be used once to view results.
                    </p>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'Verify Payment',
            cancelButtonText: 'Cancel',
            confirmButtonColor: '#10b981',
            focusConfirm: false,
            preConfirm: () => {
                const code = document.getElementById('swal-mpesa-code').value.trim().toUpperCase();
                if (!code) {
                    Swal.showValidationMessage('Please enter your M-Pesa transaction code');
                    return false;
                }
                if (code.length < 8) {
                    Swal.showValidationMessage('M-Pesa codes are usually 10 characters long');
                    return false;
                }
                return code;
            }
        });

        if (mpesaCode) {
            return await this.verifyByMpesaCode(mpesaCode, category, onSuccess);
        }
        return { success: false };
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

            // Show waiting for payment - Modern design
            Swal.fire({
                title: '',
                html: `
                    <div style="text-align: center; padding: 1rem 0;">
                        <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="4" width="20" height="16" rx="2"/>
                                <path d="M7 15h0M2 9h20"/>
                            </svg>
                        </div>
                        <h2 style="font-size: 1.5rem; font-weight: 700; color: #111827; margin-bottom: 0.5rem;">Check Your Phone</h2>
                        <p style="color: #6b7280; margin-bottom: 1rem;">An M-Pesa payment request has been sent</p>
                        <div style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 12px; padding: 1rem; margin-bottom: 1rem;">
                            <p style="font-size: 2rem; font-weight: 700; color: #16a34a;">KES ${amount}</p>
                            <p style="font-size: 0.875rem; color: #166534;">Enter your M-Pesa PIN to complete</p>
                        </div>
                        <div id="paymentStatus" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1rem; background: #f9fafb; border-radius: 8px; color: #6b7280; font-size: 0.875rem;">
                            <svg class="animate-spin" style="animation: spin 1s linear infinite; width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                <path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Waiting for confirmation...
                        </div>
                    </div>
                    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                `,
                allowOutsideClick: false,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'Cancel Payment',
                cancelButtonColor: '#9ca3af',
                customClass: {
                    popup: 'swal2-popup-modern',
                    cancelButton: 'swal2-cancel-modern'
                }
            });

            // Allow user to cancel polling immediately
            let userCancelled = false;
            try {
                const cancelBtn = Swal.getCancelButton && Swal.getCancelButton();
                if (cancelBtn) {
                    cancelBtn.addEventListener('click', () => {
                        userCancelled = true;
                    }, { once: true });
                }
            } catch (e) {
                // ignore
            }

            // Poll for payment status
            const pollOnce = async () => {
                return await this.pollPaymentStatus(15, 3000, (status, attempt, max) => {
                const statusEl = document.getElementById('paymentStatus');
                if (statusEl) {
                    statusEl.innerHTML = `
                        <svg class="animate-spin" style="animation: spin 1s linear infinite; width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                            <path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Verifying payment (${attempt}/${max})...
                    `;
                }
                }, { shouldStop: () => userCancelled, requestTimeoutMs: 10000 });
            };

            let result = await pollOnce();

            if (result.status === 'cancelled') {
                Swal.close();
                return;
            }

            // If still pending after a short wait, don't mark as failed — show user options.
            while (!result.success && result.status === 'pending' && result.timedOut) {
                Swal.close();

                const pendingChoice = await Swal.fire({
                    icon: 'info',
                    title: 'Payment Pending',
                    html: `
                        <p style="margin-bottom: 0.75rem;">We haven’t received confirmation yet.</p>
                        <p style="font-size: 0.9rem; color: #6b7280;">If you completed payment, tap <strong>I Already Paid</strong> and enter your M-Pesa code from the SMS.</p>
                    `,
                    showCancelButton: true,
                    showDenyButton: true,
                    confirmButtonText: 'Keep Waiting',
                    denyButtonText: 'I Already Paid',
                    cancelButtonText: 'Close',
                    confirmButtonColor: '#10b981',
                    denyButtonColor: '#3b82f6',
                    cancelButtonColor: '#6b7280'
                });

                if (pendingChoice.isDenied) {
                    await this.verifyExistingPayment(phoneNumber, category, onSuccess);
                    return;
                }

                if (!pendingChoice.isConfirmed) {
                    return;
                }

                // User chose to keep waiting — show waiting modal again and poll again
                Swal.fire({
                    title: '',
                    html: `
                        <div style="text-align: center; padding: 1rem 0;">
                            <div style="width: 80px; height: 80px; margin: 0 auto 1.5rem; background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="2" y="4" width="20" height="16" rx="2"/>
                                    <path d="M7 15h0M2 9h20"/>
                                </svg>
                            </div>
                            <h2 style="font-size: 1.5rem; font-weight: 700; color: #111827; margin-bottom: 0.5rem;">Still Checking…</h2>
                            <p style="color: #6b7280; margin-bottom: 1rem;">Please complete the prompt on your phone</p>
                            <div id="paymentStatus" style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.75rem 1rem; background: #f9fafb; border-radius: 8px; color: #6b7280; font-size: 0.875rem;">
                                <svg class="animate-spin" style="animation: spin 1s linear infinite; width: 16px; height: 16px;" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                                    <path style="opacity: 0.75;" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Waiting for confirmation...
                            </div>
                        </div>
                        <style>@keyframes spin { to { transform: rotate(360deg); } }</style>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    showCancelButton: true,
                    cancelButtonText: 'Cancel',
                    cancelButtonColor: '#9ca3af'
                });

                userCancelled = false;
                try {
                    const cancelBtn2 = Swal.getCancelButton && Swal.getCancelButton();
                    if (cancelBtn2) {
                        cancelBtn2.addEventListener('click', () => { userCancelled = true; }, { once: true });
                    }
                } catch (e) {
                    // ignore
                }

                result = await pollOnce();
                if (result.status === 'cancelled') {
                    Swal.close();
                    return;
                }
            }

            if (result.success && result.status === 'completed') {
                // Payment successful! - Show beautiful success overlay
                Swal.close();
                
                if (window.firebaseAuth && window.firebaseAuth.showSuccessOverlay) {
                    window.firebaseAuth.showSuccessOverlay('Payment Successful!', 'Loading your results...', 2500);
                    
                    setTimeout(() => {
                        if (onSuccess && typeof onSuccess === 'function') {
                            onSuccess();
                        }
                    }, 2500);
                } else {
                    await Swal.fire({
                        icon: 'success',
                        title: 'Payment Successful!',
                        text: 'Your payment has been confirmed. Loading your results...',
                        timer: 2000,
                        showConfirmButton: false,
                        timerProgressBar: true
                    });

                    if (onSuccess && typeof onSuccess === 'function') {
                        onSuccess();
                    }
                }
            }

        } catch (error) {
            console.error('Payment process error:', error);
            const msg = error?.message || 'Something went wrong. Please try again.';
            const isTimeout = msg.toLowerCase().includes('timed out') || msg.toLowerCase().includes('timeout');

            if (isTimeout) {
                // Show timeout dialog with verify button
                const result = await Swal.fire({
                    icon: 'warning',
                    title: 'Payment Verification Timeout',
                    html: `
                        <p style="margin-bottom: 1rem;">${msg}</p>
                        <div style="background: #fef3c7; border: 1px solid #fbbf24; border-radius: 0.5rem; padding: 1rem; margin-top: 1rem;">
                            <p style="color: #92400e; font-size: 0.9rem; margin: 0;">
                                <i class="fas fa-info-circle"></i> If money was deducted from your M-Pesa, click <strong>"Verify Payment"</strong> to check the status directly with M-Pesa.
                            </p>
                        </div>
                    `,
                    showCancelButton: true,
                    showDenyButton: true,
                    confirmButtonText: '<i class="fas fa-sync"></i> Verify Payment',
                    denyButtonText: '<i class="fas fa-receipt"></i> I Have M-Pesa Code',
                    cancelButtonText: 'Close',
                    confirmButtonColor: '#10b981',
                    denyButtonColor: '#3b82f6',
                    cancelButtonColor: '#6b7280'
                });

                if (result.isConfirmed) {
                    // User clicked "Verify Payment" - query M-Pesa directly
                    Swal.fire({
                        title: 'Verifying Payment...',
                        html: '<p>Checking with M-Pesa...</p>',
                        allowOutsideClick: false,
                        showConfirmButton: false,
                        didOpen: () => Swal.showLoading()
                    });

                    try {
                        const verifyResult = await this.verifyPaymentManually();
                        
                        if (verifyResult.success && verifyResult.status === 'completed') {
                            Swal.fire({
                                icon: 'success',
                                title: 'Payment Verified!',
                                html: '<p>Your payment has been confirmed. Loading your results...</p>',
                                timer: 2000,
                                showConfirmButton: false,
                                timerProgressBar: true
                            });

                            if (onSuccess && typeof onSuccess === 'function') {
                                setTimeout(() => onSuccess(), 2000);
                            }
                        } else {
                            Swal.fire({
                                icon: 'info',
                                title: verifyResult.status === 'failed' ? 'Payment Failed' : 'Still Pending',
                                text: verifyResult.message,
                                confirmButtonColor: '#10b981'
                            });
                        }
                    } catch (verifyError) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Verification Failed',
                            text: verifyError.message || 'Could not verify payment status. Please try again later.',
                            confirmButtonColor: '#10b981'
                        });
                    }
                } else if (result.isDenied) {
                    // User has M-Pesa code - redirect to verification
                    await this.verifyExistingPayment(null, category, onSuccess);
                }
            } else {
                // Non-timeout error
                await Swal.fire({
                    icon: 'error',
                    title: 'Payment Failed',
                    text: msg,
                    confirmButtonColor: '#10b981'
                });
                throw error;
            }
        }
    }
}

// Make PaymentHandler globally available
window.PaymentHandler = PaymentHandler;
console.log('PaymentHandler class loaded and ready');
