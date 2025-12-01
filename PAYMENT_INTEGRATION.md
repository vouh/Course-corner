<!-- INTEGRATION GUIDE FOR COURSE CORNER INDEX.HTML -->

<!-- Step 1: Add this script reference in the <head> section -->
<script src="paymentHandler.js"></script>

<!-- Step 2: Update the three payment buttons to this: -->

<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
    <!-- Button 1: Calculate Cluster Points (Green) -->
    <button id="calculateBtn" class="blink-button w-full bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-500 transition transform hover:scale-105 payment-btn" data-category="calculate-cluster-points">
        <i class="fas fa-calculator mr-2"></i>
        Calculate Cluster Points
        <small class="block text-xs mt-1">KSH 150</small>
    </button>
    
    <!-- Button 2: Courses Only (Blue) -->
    <button id="calculateBtn2" class="blink-button w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-500 transition transform hover:scale-105 payment-btn" data-category="courses-only">
        <i class="fas fa-book mr-2"></i>
        Courses Only
        <small class="block text-xs mt-1">KSH 150</small>
    </button>
    
    <!-- Button 3: Point & Courses (Purple) -->
    <button id="calculateBtn3" class="blink-button w-full bg-purple-600 text-white py-3 px-4 rounded-lg hover:bg-purple-500 transition transform hover:scale-105 payment-btn" data-category="point-and-courses">
        <i class="fas fa-star mr-2"></i>
        Point & Courses
        <small class="block text-xs mt-1">KSH 160</small>
    </button>
</div>

<!-- Step 3: Add this JavaScript before closing </body> tag -->

<script>
// Initialize Payment Handler
const paymentHandler = new PaymentHandler('http://localhost:8080/api'); // Change URL when deploying

// Handle payment button clicks
document.querySelectorAll('.payment-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const category = btn.getAttribute('data-category');
        const amount = PaymentHandler.AMOUNTS[category];
        
        try {
            // Get phone number
            const { value: phoneNumber } = await Swal.fire({
                title: 'Enter Phone Number',
                input: 'text',
                inputLabel: 'Your M-Pesa phone number',
                inputPlaceholder: '254712345678 or 0712345678',
                showCancelButton: true,
                inputValidator: (value) => {
                    if (!value) return 'Phone number is required';
                    return undefined;
                }
            });

            if (!phoneNumber) return;

            // Show processing
            Swal.fire({
                title: 'Processing Payment',
                text: `Amount: KSH ${amount}\nPhone: ${phoneNumber}`,
                icon: 'info',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            // Initiate payment
            const result = await paymentHandler.initiatePayment(phoneNumber, category);

            // STK sent - show prompt message
            await Swal.fire({
                icon: 'info',
                title: 'Check Your Phone',
                text: `STK prompt sent to ${phoneNumber}\nEnter your M-Pesa PIN to complete the payment.`,
                allowOutsideClick: false
            });

            // Poll for payment completion
            Swal.fire({
                title: 'Waiting for Payment',
                text: 'Please complete the payment on your phone...',
                icon: 'info',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            await paymentHandler.pollPaymentStatus();

            // Payment successful
            await paymentHandler.approveAccess();

            Swal.fire({
                icon: 'success',
                title: 'Payment Successful!',
                text: 'Your payment has been confirmed. Generating results...',
                timer: 2000
            });

            // Show results based on category
            if (category === 'calculate-cluster-points') {
                document.getElementById('results').classList.remove('hidden');
            } else if (category === 'courses-only') {
                // Scroll to courses section and show courses
                document.getElementById('results').classList.remove('hidden');
                window.scrollTo({ top: document.getElementById('results').offsetTop, behavior: 'smooth' });
            } else if (category === 'point-and-courses') {
                // Show both points and courses
                document.getElementById('results').classList.remove('hidden');
                window.scrollTo({ top: document.getElementById('results').offsetTop, behavior: 'smooth' });
            }

        } catch (error) {
            Swal.fire({
                icon: 'error',
                title: 'Payment Failed',
                text: error.message || 'An error occurred during payment'
            });
            paymentHandler.clearSession();
        }
    });
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    // Optional: Save session for resuming if needed
});
</script>

<!-- CONFIGURATION GUIDE -->

1. LOCAL DEVELOPMENT:
   - Server URL: 'http://localhost:8080/api'
   - Make sure server/server.js is running
   - Command: cd server && npm run dev

2. PRODUCTION (VERCEL):
   - Server URL: 'https://your-vercel-domain.vercel.app/api'
   - Deploy server folder to Vercel
   - Set environment variables in Vercel dashboard

3. PAYMENT FLOW:
   - User clicks a button
   - Prompted for phone number
   - STK push sent to phone
   - User enters M-Pesa PIN
   - Payment confirmed
   - Results displayed

4. SESSION MANAGEMENT:
   - Session ID stored in localStorage
   - Payment status polled every 3 seconds
   - Max 40 attempts (2 minutes timeout)
   - Session cleared on completion or error

5. ERROR HANDLING:
   - Invalid phone number → Show error
   - Payment declined → Show error
   - Network error → Show error
   - Timeout → Show error and retry option

THAT'S IT! Your payment system is ready! 🎉
