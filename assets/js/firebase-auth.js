/**
 * Firebase Authentication Handler
 * Handles login, signup, Google auth, and user profile management
 */

class FirebaseAuthHandler {
    constructor() {
        this.auth = null;
        this.db = null;
        this.currentUser = null;
        this.userProfile = null;
        this.initialized = false;
        this.authStateListeners = [];
    }

    /**
     * Initialize Firebase Auth and Firestore
     */
    async init() {
        if (this.initialized) return;

        try {
            // Wait for Firebase to be available
            await this.waitForFirebase();

            // Import Firebase Auth
            const { getAuth, onAuthStateChanged, signInWithEmailAndPassword,
                createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
                signOut, sendPasswordResetEmail, updateProfile } =
                await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js");

            // Import Firestore
            const { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp } =
                await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");

            this.auth = getAuth(window.firebaseApp);
            this.db = getFirestore(window.firebaseApp);

            // Store Firebase functions for later use
            this.firebaseFunctions = {
                signInWithEmailAndPassword,
                createUserWithEmailAndPassword,
                signInWithPopup,
                GoogleAuthProvider,
                signOut,
                sendPasswordResetEmail,
                updateProfile,
                doc,
                setDoc,
                getDoc,
                updateDoc,
                serverTimestamp
            };

            // Listen for auth state changes
            onAuthStateChanged(this.auth, async (user) => {
                this.currentUser = user;
                if (user) {
                    await this.loadUserProfile();
                    this.updateUIForLoggedInUser();
                } else {
                    this.userProfile = null;
                    this.updateUIForLoggedOutUser();
                }
                // Notify all listeners
                this.authStateListeners.forEach(listener => listener(user));
            });

            this.initialized = true;
            console.log('🔐 Firebase Auth initialized');

        } catch (error) {
            console.error('Firebase Auth initialization error:', error);
            throw error;
        }
    }

    /**
     * Wait for Firebase to be available on window
     */
    waitForFirebase() {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const maxAttempts = 50;

            const check = () => {
                if (window.firebaseApp) {
                    resolve();
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Firebase not initialized'));
                } else {
                    attempts++;
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    /**
     * Add auth state change listener
     */
    onAuthStateChange(callback) {
        this.authStateListeners.push(callback);
        // Immediately call with current state
        if (this.initialized) {
            callback(this.currentUser);
        }
    }

    /**
     * Sign up with email and password
     */
    async signUp(email, password, displayName = '', phoneNumber = '') {
        this.showLoadingOverlay('Creating your account...', 'Please wait');
        try {
            const { createUserWithEmailAndPassword, updateProfile } = this.firebaseFunctions;

            const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
            const user = userCredential.user;

            // Update display name if provided
            if (displayName) {
                await updateProfile(user, { displayName });
            }

            // Create user profile in Firestore with phone number
            await this.createUserProfile(user, { displayName, phoneNumber });

            this.showSuccessOverlay('Account Created!', 'Welcome to Course Corner', 2000);
            return { success: true, user };

        } catch (error) {
            console.error('Signup error:', error);
            this.hideLoadingOverlay();
            this.showToast(this.getErrorMessage(error.code), 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign in with email and password
     */
    async signIn(email, password) {
        this.showLoadingOverlay('Signing you in...', 'Please wait');
        try {
            const { signInWithEmailAndPassword } = this.firebaseFunctions;

            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);

            this.showSuccessOverlay('Welcome Back!', 'You are now signed in', 1500);
            return { success: true, user: userCredential.user };

        } catch (error) {
            console.error('Sign in error:', error);
            this.hideLoadingOverlay();
            this.showToast(this.getErrorMessage(error.code), 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign in with Google
     */
    async signInWithGoogle() {
        try {
            const { signInWithPopup, GoogleAuthProvider } = this.firebaseFunctions;

            const provider = new GoogleAuthProvider();
            provider.addScope('profile');
            provider.addScope('email');

            const result = await signInWithPopup(this.auth, provider);
            const user = result.user;

            this.showLoadingOverlay('Completing sign in...', 'Please wait');

            // Check if user profile exists, if not create one
            const profileExists = await this.checkUserProfileExists(user.uid);
            if (!profileExists) {
                await this.createUserProfile(user, {
                    displayName: user.displayName,
                    photoURL: user.photoURL
                });
            }

            this.showSuccessOverlay('Welcome!', 'Signed in with Google', 1500);
            return { success: true, user };

        } catch (error) {
            console.error('Google sign in error:', error);
            this.hideLoadingOverlay();
            if (error.code !== 'auth/popup-closed-by-user') {
                this.showToast(this.getErrorMessage(error.code), 'error');
            }
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign out
     */
    async logout() {
        this.showLoadingOverlay('Signing out...', '');
        try {
            const { signOut } = this.firebaseFunctions;
            await signOut(this.auth);
            this.showSuccessOverlay('Goodbye!', 'You have been signed out', 1500);
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            this.hideLoadingOverlay();
            this.showToast('Error signing out', 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Send password reset email
     */
    async resetPassword(email) {
        try {
            const { sendPasswordResetEmail } = this.firebaseFunctions;
            await sendPasswordResetEmail(this.auth, email);
            this.showToast('Password reset email sent!', 'success');
            return { success: true };
        } catch (error) {
            console.error('Password reset error:', error);
            this.showToast(this.getErrorMessage(error.code), 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Create user profile in Firestore
     */
    async createUserProfile(user, additionalData = {}) {
        try {
            const { doc, setDoc, serverTimestamp } = this.firebaseFunctions;

            const userRef = doc(this.db, 'users', user.uid);

            const profileData = {
                uid: user.uid,
                email: user.email,
                displayName: additionalData.displayName || user.displayName || '',
                photoURL: additionalData.photoURL || user.photoURL || '',
                phoneNumber: additionalData.phoneNumber || '',
                // Referral system fields
                referralCode: '',
                referralCreatedAt: null,
                referralCount: 0,
                referralPaidCount: 0,
                referralEarnings: 0,
                referralPending: 0,
                referredBy: additionalData.referredBy || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            await setDoc(userRef, profileData);
            this.userProfile = profileData;

            console.log('User profile created');
            return profileData;

        } catch (error) {
            console.error('Error creating user profile:', error);
            throw error;
        }
    }

    /**
     * Check if user profile exists
     */
    async checkUserProfileExists(uid) {
        try {
            const { doc, getDoc } = this.firebaseFunctions;
            const userRef = doc(this.db, 'users', uid);
            const docSnap = await getDoc(userRef);
            return docSnap.exists();
        } catch (error) {
            console.error('Error checking profile:', error);
            return false;
        }
    }

    /**
     * Load user profile from Firestore
     */
    async loadUserProfile() {
        if (!this.currentUser) return null;

        try {
            const { doc, getDoc } = this.firebaseFunctions;
            const userRef = doc(this.db, 'users', this.currentUser.uid);
            const docSnap = await getDoc(userRef);

            if (docSnap.exists()) {
                this.userProfile = docSnap.data();
                return this.userProfile;
            } else {
                // Create profile if it doesn't exist
                return await this.createUserProfile(this.currentUser);
            }

        } catch (error) {
            console.error('Error loading user profile:', error);
            return null;
        }
    }

    /**
     * Update user profile in Firestore
     */
    async updateUserProfile(updates) {
        if (!this.currentUser) {
            this.showToast('Please sign in first', 'error');
            return { success: false };
        }

        try {
            const { doc, updateDoc, serverTimestamp } = this.firebaseFunctions;
            const userRef = doc(this.db, 'users', this.currentUser.uid);

            await updateDoc(userRef, {
                ...updates,
                updatedAt: serverTimestamp()
            });

            // Update local profile
            this.userProfile = { ...this.userProfile, ...updates };

            this.showToast('Profile updated successfully!', 'success');
            return { success: true };

        } catch (error) {
            console.error('Error updating profile:', error);
            this.showToast('Error updating profile', 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Update phone number
     */
    async updatePhoneNumber(phoneNumber) {
        return await this.updateUserProfile({ phoneNumber });
    }

    /**
     * Get current user info
     */
    getCurrentUser() {
        return this.currentUser;
    }

    /**
     * Get user profile
     */
    getProfile() {
        return this.userProfile;
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        return !!this.currentUser;
    }

    /**
     * Update UI for logged in user
     */
    updateUIForLoggedInUser() {
        const authBtn = document.getElementById('authBtn');
        const profileBtn = document.getElementById('profileBtn');
        const userAvatar = document.getElementById('userAvatar');
        const authBtnMobile = document.getElementById('authBtnMobile');
        const profileBtnMobile = document.getElementById('profileBtnMobile');
        const userAvatarMobile = document.getElementById('userAvatarMobile');
        const homeReferralCta = document.querySelector('.referral-cta-button');

        // Hide auth buttons when logged in (we only show avatar now)
        if (authBtn) {
            authBtn.classList.add('hidden');
        }

        if (authBtnMobile) {
            authBtnMobile.classList.add('hidden');
        }

        if (homeReferralCta) {
            homeReferralCta.innerHTML = '<i class="fas fa-chart-line mr-2"></i>View My Dashboard <i class="fas fa-arrow-right ml-2"></i>';
            homeReferralCta.onclick = (e) => {
                const prefix = window.location.pathname.includes('/pages/') ? '' : 'pages/';
                window.location.href = prefix + 'referral.html';
            };
        }

        // Hide profile buttons (we only show avatar now)
        if (profileBtn) {
            profileBtn.classList.add('hidden');
        }

        if (profileBtnMobile) {
            profileBtnMobile.classList.add('hidden');
        }

        // Desktop Avatar
        if (userAvatar && this.currentUser) {
            userAvatar.style.cursor = 'pointer';
            userAvatar.onclick = () => {
                const prefix = window.location.pathname.includes('/pages/') ? '' : 'pages/';
                window.location.href = prefix + 'referral.html';
            };
            
            if (this.currentUser.photoURL) {
                userAvatar.innerHTML = `<img src="${this.currentUser.photoURL}" alt="Profile" class="w-10 h-10 rounded-full hover:ring-2 hover:ring-green-500 transition-all">`;
            } else {
                const initial = (this.currentUser.displayName || this.currentUser.email || 'U')[0].toUpperCase();
                userAvatar.innerHTML = `<div class="w-10 h-10 rounded-full bg-green-600 text-white flex items-center justify-center font-bold hover:bg-green-700 transition-all shadow-md">${initial}</div>`;
            }
            userAvatar.classList.remove('hidden');
        }

        // Mobile Avatar
        if (userAvatarMobile && this.currentUser) {
            userAvatarMobile.style.cursor = 'pointer';
            userAvatarMobile.onclick = () => {
                const prefix = window.location.pathname.includes('/pages/') ? '' : 'pages/';
                window.location.href = prefix + 'referral.html';
            };
            
            if (this.currentUser.photoURL) {
                userAvatarMobile.innerHTML = `
                    <div class="flex flex-col items-center">
                        <img src="${this.currentUser.photoURL}" alt="Profile" class="w-16 h-16 rounded-full mb-2">
                        <span class="text-gray-700 font-medium">My Dashboard</span>
                    </div>`;
            } else {
                const initial = (this.currentUser.displayName || this.currentUser.email || 'U')[0].toUpperCase();
                userAvatarMobile.innerHTML = `
                    <div class="flex flex-col items-center">
                        <div class="w-16 h-16 rounded-full bg-green-600 text-white flex items-center justify-center font-bold text-xl mb-2">${initial}</div>
                        <span class="text-gray-700 font-medium">My Dashboard</span>
                    </div>`;
            }
            userAvatarMobile.classList.remove('hidden');
        }
    }

    /**
     * Update UI for logged out user
     */
    updateUIForLoggedOutUser() {
        const authBtn = document.getElementById('authBtn');
        const profileBtn = document.getElementById('profileBtn');
        const userAvatar = document.getElementById('userAvatar');
        const authBtnMobile = document.getElementById('authBtnMobile');
        const profileBtnMobile = document.getElementById('profileBtnMobile');
        const userAvatarMobile = document.getElementById('userAvatarMobile');
        const homeReferralCta = document.querySelector('.referral-cta-button');

        if (authBtn) {
            authBtn.innerHTML = '<i class="fas fa-user mr-2"></i>Login';
            authBtn.classList.remove('hidden');
            authBtn.onclick = () => this.openAuthModal();
        }

        if (authBtnMobile) {
            authBtnMobile.innerHTML = '<i class="fas fa-user mr-2"></i>Login';
            authBtnMobile.classList.remove('hidden');
            authBtnMobile.onclick = () => this.openAuthModal();
        }

        if (homeReferralCta) {
            homeReferralCta.onclick = (e) => {
                e.preventDefault();
                this.openAuthModal();
            };
        }

        if (profileBtn) {
            profileBtn.classList.add('hidden');
        }

        if (profileBtnMobile) {
            profileBtnMobile.classList.add('hidden');
        }

        if (userAvatar) {
            userAvatar.classList.add('hidden');
        }

        if (userAvatarMobile) {
            userAvatarMobile.classList.add('hidden');
        }
    }

    /**
     * Open authentication modal
     */
    openAuthModal(mode = 'login') {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.switchAuthMode(mode);
        }
    }

    /**
     * Close authentication modal
     */
    closeAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Open profile modal
     */
    openProfileModal() {
        const modal = document.getElementById('profileModal');
        if (modal) {
            modal.classList.remove('hidden');
            this.populateProfileForm();
        }
    }

    /**
     * Close profile modal
     */
    closeProfileModal() {
        const modal = document.getElementById('profileModal');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * Switch between login and signup modes
     */
    switchAuthMode(mode) {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const loginTab = document.getElementById('loginTab');
        const signupTab = document.getElementById('signupTab');
        const forgotPasswordSection = document.getElementById('forgotPasswordSection');

        if (mode === 'login') {
            loginForm?.classList.remove('hidden');
            signupForm?.classList.add('hidden');
            forgotPasswordSection?.classList.add('hidden');
            loginTab?.classList.add('bg-green-600', 'text-white');
            loginTab?.classList.remove('bg-gray-200', 'text-gray-700');
            signupTab?.classList.remove('bg-green-600', 'text-white');
            signupTab?.classList.add('bg-gray-200', 'text-gray-700');
        } else if (mode === 'signup') {
            loginForm?.classList.add('hidden');
            signupForm?.classList.remove('hidden');
            forgotPasswordSection?.classList.add('hidden');
            signupTab?.classList.add('bg-green-600', 'text-white');
            signupTab?.classList.remove('bg-gray-200', 'text-gray-700');
            loginTab?.classList.remove('bg-green-600', 'text-white');
            loginTab?.classList.add('bg-gray-200', 'text-gray-700');
        } else if (mode === 'forgot') {
            loginForm?.classList.add('hidden');
            signupForm?.classList.add('hidden');
            forgotPasswordSection?.classList.remove('hidden');
        }
    }

    /**
     * Populate profile form with current data
     */
    populateProfileForm() {
        if (!this.userProfile) return;

        // Profile info
        const profileEmail = document.getElementById('profileEmail');
        const profileName = document.getElementById('profileName');
        const profilePhone = document.getElementById('profilePhone');

        if (profileEmail) profileEmail.value = this.userProfile.email || '';
        if (profileName) profileName.value = this.userProfile.displayName || '';
        if (profilePhone) profilePhone.value = this.userProfile.phoneNumber || '';
    }

    /**
     * Save profile from form
     */
    async saveProfile() {
        const displayName = document.getElementById('profileName')?.value || '';
        const phoneNumber = document.getElementById('profilePhone')?.value || '';
        const email = document.getElementById('profileEmail')?.value || '';

        this.showLoadingOverlay('Saving profile...', 'Updating your information');

        try {
            const { updateProfile } = this.firebaseFunctions;

            // 1. Update Firebase Auth Profile (DisplayName)
            if (this.currentUser && displayName !== this.currentUser.displayName) {
                await updateProfile(this.currentUser, { displayName });
            }

            // 2. Update Firestore Profile
            const result = await this.updateUserProfile({
                displayName,
                phoneNumber,
                email
            });

            if (result.success) {
                // Update header display name if it exists
                const userDisplayName = document.getElementById('userDisplayName');
                if (userDisplayName) userDisplayName.textContent = displayName;
                
                this.closeProfileModal();
                this.showSuccessOverlay('Profile Updated', 'Your changes have been saved', 1500);
            }
            return result;

        } catch (error) {
            console.error('Error saving profile:', error);
            this.hideLoadingOverlay();
            this.showToast('Error saving profile', 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Get friendly error message
     */
    getErrorMessage(errorCode) {
        const errorMessages = {
            'auth/email-already-in-use': 'This email is already registered',
            'auth/invalid-email': 'Invalid email address',
            'auth/operation-not-allowed': 'Email/password accounts are not enabled',
            'auth/weak-password': 'Password is too weak (min 6 characters)',
            'auth/user-disabled': 'This account has been disabled',
            'auth/user-not-found': 'No account found with this email',
            'auth/wrong-password': 'Incorrect password',
            'auth/invalid-credential': 'Invalid email or password',
            'auth/too-many-requests': 'Too many failed attempts. Please try again later',
            'auth/popup-blocked': 'Popup was blocked. Please allow popups',
            'auth/popup-closed-by-user': 'Sign in was cancelled',
            'auth/network-request-failed': 'Network error. Check your connection'
        };
        return errorMessages[errorCode] || 'An error occurred. Please try again';
    }

    /**
     * Show toast notification - Modern redesigned version
     */
    showToast(message, type = 'info') {
        // Remove any existing toasts
        const existingToast = document.querySelector('.cc-toast');
        if (existingToast) existingToast.remove();

        const icons = {
            success: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            error: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
            warning: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            info: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
        };

        const colors = {
            success: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: '#10b981' },
            error: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '#ef4444' },
            warning: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '#f59e0b' },
            info: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', icon: '#3b82f6' }
        };

        const color = colors[type] || colors.info;
        const icon = icons[type] || icons.info;

        const toast = document.createElement('div');
        toast.className = 'cc-toast';
        toast.innerHTML = `
            <div class="cc-toast-icon" style="color: ${color.icon}">${icon}</div>
            <div class="cc-toast-message">${message}</div>
            <button class="cc-toast-close" onclick="this.parentElement.remove()">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;

        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 20px;
            background: ${color.bg};
            border: 1px solid ${color.border};
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.15);
            font-family: 'Inter', -apple-system, sans-serif;
            font-size: 14px;
            font-weight: 500;
            color: ${color.text};
            max-width: 400px;
            animation: ccToastSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        `;

        // Add animation styles if not present
        if (!document.getElementById('cc-toast-styles')) {
            const style = document.createElement('style');
            style.id = 'cc-toast-styles';
            style.textContent = `
                @keyframes ccToastSlideIn {
                    from { opacity: 0; transform: translateX(100px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes ccToastSlideOut {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(100px); }
                }
                .cc-toast-icon { flex-shrink: 0; }
                .cc-toast-message { flex: 1; line-height: 1.4; }
                .cc-toast-close {
                    flex-shrink: 0;
                    background: none;
                    border: none;
                    cursor: pointer;
                    padding: 4px;
                    opacity: 0.5;
                    transition: opacity 0.2s;
                }
                .cc-toast-close:hover { opacity: 1; }
                @media (max-width: 480px) {
                    .cc-toast {
                        left: 16px !important;
                        right: 16px !important;
                        max-width: none !important;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(toast);

        // Auto remove after 4 seconds
        setTimeout(() => {
            toast.style.animation = 'ccToastSlideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    /**
     * Show loading overlay - Modern full-screen loader
     */
    showLoadingOverlay(message = 'Loading...', subtext = '') {
        this.hideLoadingOverlay(); // Remove any existing

        const overlay = document.createElement('div');
        overlay.id = 'cc-loading-overlay';
        overlay.innerHTML = `
            <div class="cc-loader-content">
                <div class="cc-loader-spinner">
                    <svg viewBox="0 0 50 50">
                        <circle cx="25" cy="25" r="20" fill="none" stroke-width="4"></circle>
                    </svg>
                </div>
                <div class="cc-loader-text">${message}</div>
                ${subtext ? `<div class="cc-loader-subtext">${subtext}</div>` : ''}
            </div>
        `;

        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99998;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(8px);
            animation: ccOverlayFadeIn 0.3s ease;
        `;

        // Add loader styles if not present
        if (!document.getElementById('cc-loader-styles')) {
            const style = document.createElement('style');
            style.id = 'cc-loader-styles';
            style.textContent = `
                @keyframes ccOverlayFadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes ccSpinnerRotate {
                    100% { transform: rotate(360deg); }
                }
                @keyframes ccSpinnerDash {
                    0% { stroke-dasharray: 1, 150; stroke-dashoffset: 0; }
                    50% { stroke-dasharray: 90, 150; stroke-dashoffset: -35; }
                    100% { stroke-dasharray: 90, 150; stroke-dashoffset: -124; }
                }
                .cc-loader-content {
                    text-align: center;
                }
                .cc-loader-spinner {
                    width: 56px;
                    height: 56px;
                    margin: 0 auto 20px;
                }
                .cc-loader-spinner svg {
                    animation: ccSpinnerRotate 2s linear infinite;
                }
                .cc-loader-spinner circle {
                    stroke: #16a34a;
                    stroke-linecap: round;
                    animation: ccSpinnerDash 1.5s ease-in-out infinite;
                }
                .cc-loader-text {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                    margin-bottom: 8px;
                }
                .cc-loader-subtext {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 14px;
                    color: #6b7280;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';
    }

    /**
     * Hide loading overlay
     */
    hideLoadingOverlay() {
        const overlay = document.getElementById('cc-loading-overlay');
        if (overlay) {
            overlay.remove();
        }
        document.body.style.overflow = '';
    }

    /**
     * Show success overlay - For completed actions
     */
    showSuccessOverlay(title = 'Success!', message = '', duration = 2000) {
        this.hideLoadingOverlay();

        const overlay = document.createElement('div');
        overlay.id = 'cc-success-overlay';
        overlay.innerHTML = `
            <div class="cc-success-content">
                <div class="cc-success-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                </div>
                <div class="cc-success-title">${title}</div>
                ${message ? `<div class="cc-success-message">${message}</div>` : ''}
            </div>
        `;

        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 99998;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(8px);
            animation: ccOverlayFadeIn 0.3s ease;
        `;

        // Add success styles if not present
        if (!document.getElementById('cc-success-styles')) {
            const style = document.createElement('style');
            style.id = 'cc-success-styles';
            style.textContent = `
                @keyframes ccSuccessPop {
                    0% { transform: scale(0); opacity: 0; }
                    50% { transform: scale(1.1); }
                    100% { transform: scale(1); opacity: 1; }
                }
                @keyframes ccSuccessCheck {
                    0% { stroke-dashoffset: 100; }
                    100% { stroke-dashoffset: 0; }
                }
                .cc-success-content {
                    text-align: center;
                    animation: ccSuccessPop 0.5s cubic-bezier(0.16, 1, 0.3, 1);
                    padding: 20px;
                }
                .cc-success-icon {
                    width: 80px;
                    height: 80px;
                    margin: 0 auto 24px;
                    background: #dcfce7;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #16a34a;
                }
                .cc-success-icon svg {
                    stroke-dasharray: 100;
                    animation: ccSuccessCheck 0.6s ease 0.2s forwards;
                }
                .cc-success-title {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 24px;
                    font-weight: 700;
                    color: #111827;
                    margin-bottom: 8px;
                }
                .cc-success-message {
                    font-family: 'Inter', -apple-system, sans-serif;
                    font-size: 16px;
                    color: #6b7280;
                    max-width: 300px;
                    margin: 0 auto;
                    line-height: 1.5;
                }
                .cc-success-message strong, .cc-success-message b {
                    color: #059669;
                    font-weight: 700;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        // Auto remove
        setTimeout(() => {
            overlay.style.opacity = '0';
            overlay.style.transition = 'opacity 0.3s ease';
            setTimeout(() => {
                overlay.remove();
                document.body.style.overflow = '';
            }, 300);
        }, duration);
    }
}

// Create global instance
window.firebaseAuth = new FirebaseAuthHandler();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Wait a bit for Firebase to initialize
    setTimeout(async () => {
        try {
            await window.firebaseAuth.init();
        } catch (error) {
            console.error('Auth init failed:', error);
        }
    }, 500);
});
