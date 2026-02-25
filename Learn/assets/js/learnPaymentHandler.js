/**
 * Learn Portal – Payment Handler
 * ---------------------------------------------------------------
 * Dedicated payment module for Course Corner Learn.
 *
 * • Communicates with the SAME Vercel API (/api/mpesa/stkpush)
 * • Uses the "learn-" prefix for the category so the server knows
 *   this is a Learn payment and picks up `learnAmount` instead of
 *   a fixed package price.
 * • Does NOT touch the main site's paymentHandler.js or its
 *   category keys (bronze, silver, gold, etc.)
 * ---------------------------------------------------------------
 */

const LEARN_SERVER_URL = 'https://course-corner-server.vercel.app/api';

export class LearnPaymentHandler {
    /**
     * @param {Object} opts
     * @param {string} opts.serverUrl  – Override API base URL (optional)
     */
    constructor(opts = {}) {
        this.serverUrl = opts.serverUrl || LEARN_SERVER_URL;
        this._pollTimer = null;
    }

    /**
     * Initiate M-Pesa STK push for a Learn course payment.
     *
     * @param {Object} params
     * @param {string} params.phone        – M-Pesa phone number (0712…, +254…, 254…)
     * @param {string} params.email        – Student email
     * @param {Object} params.course       – { id, title, fee, currency }
     * @param {number} params.amount       – Amount to pay (may be partial)
     * @param {function} params.onStatus   – Callback (type, title, msg, pct)
     *
     * @returns {Promise<Object>} { success, data }
     */
    async initiate({ phone, email, course, amount, onStatus }) {
        if (!phone) throw new Error('Phone number is required');
        if (!course?.id) throw new Error('Course is required');
        if (!amount || amount < 1) throw new Error('Invalid amount');

        // Always use the learn- prefix so the server takes the learnAmount path
        const category = `learn-${course.id}`;

        if (onStatus) onStatus('pending', 'Initiating…', 'Connecting to M-Pesa…', 5);

        const resp = await fetch(`${this.serverUrl}/mpesa/stkpush`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phoneNumber: phone,
                category,
                learnAmount: amount,
                email
            })
        });

        const data = await resp.json();

        if (!resp.ok || !data.success) {
            throw new Error(data.message || 'Failed to initiate payment');
        }

        return data;
    }

    /**
     * Poll the server for M-Pesa payment status.
     *
     * @param {Object}   params
     * @param {string}   params.sessionId
     * @param {string}   [params.checkoutRequestId]
     * @param {number}   [params.maxAttempts=20]
     * @param {number}   [params.intervalMs=3000]
     * @param {function} params.onStatus  – (type, title, msg, pct)
     * @param {function} params.onComplete – (resultData)
     * @param {function} params.onFail     – (message)
     * @param {function} params.onTimeout  – ()
     */
    poll({ sessionId, checkoutRequestId, maxAttempts = 20, intervalMs = 3000,
           onStatus, onComplete, onFail, onTimeout }) {
        let attempts = 0;
        this.stopPolling();

        this._pollTimer = setInterval(async () => {
            attempts++;
            const pct = Math.min(20 + (attempts / maxAttempts) * 70, 90);
            if (onStatus) onStatus('pending', 'Waiting for M-Pesa…',
                `Checking status (${attempts}/${maxAttempts})…`, pct);

            try {
                let url = `${this.serverUrl}/mpesa/status?sessionId=${sessionId}`;
                if (checkoutRequestId) url += `&checkoutRequestId=${checkoutRequestId}`;

                const sr = await fetch(url);
                const sd = await sr.json();
                const st = sd?.data?.status;

                if (st === 'completed') {
                    this.stopPolling();
                    if (onStatus) onStatus('success', 'Payment Successful!',
                        'Your payment has been received. Thank you!', 100);
                    if (onComplete) onComplete(sd.data);
                    return;
                }

                if (st === 'failed' || st === 'cancelled') {
                    this.stopPolling();
                    const msg = sd?.data?.resultDesc || 'Payment was not completed.';
                    if (onStatus) onStatus('error', 'Payment Failed', msg, 100);
                    if (onFail) onFail(msg);
                    return;
                }
            } catch (e) {
                console.error('Poll error:', e);
            }

            if (attempts >= maxAttempts) {
                this.stopPolling();
                if (onStatus) onStatus('warning', 'Status Unknown',
                    'We could not confirm payment. If you paid, it will reflect shortly.', 100);
                if (onTimeout) onTimeout();
            }
        }, intervalMs);
    }

    /** Stop any active polling loop. */
    stopPolling() {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }
}
