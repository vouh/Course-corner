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

            this.showToast('Account created successfully!', 'success');
            return { success: true, user };

        } catch (error) {
            console.error('Signup error:', error);
            this.showToast(this.getErrorMessage(error.code), 'error');
            return { success: false, error: error.message };
        }
    }

    /**
     * Sign in with email and password
     */
    async signIn(email, password) {
        try {
            const { signInWithEmailAndPassword } = this.firebaseFunctions;
            
            const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
            
            this.showToast('Welcome back!', 'success');
            return { success: true, user: userCredential.user };

        } catch (error) {
            console.error('Sign in error:', error);
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

            // Check if user profile exists, if not create one
            const profileExists = await this.checkUserProfileExists(user.uid);
            if (!profileExists) {
                await this.createUserProfile(user, {
                    displayName: user.displayName,
                    photoURL: user.photoURL
                });
            }

            this.showToast('Signed in with Google!', 'success');
            return { success: true, user };

        } catch (error) {
            console.error('Google sign in error:', error);
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
        try {
            const { signOut } = this.firebaseFunctions;
            await signOut(this.auth);
            this.showToast('Signed out successfully', 'success');
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
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
                kcseYear: '',
                kcseGrades: {
                    mathematics: '',
                    english: '',
                    kiswahili: '',
                    biology: '',
                    chemistry: '',
                    physics: '',
                    history: '',
                    geography: '',
                    cre: '',
                    agriculture: '',
                    business: '',
                    computer: ''
                },
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
     * Update KCSE grades
     */
    async updateKCSEGrades(grades) {
        return await this.updateUserProfile({ kcseGrades: grades });
    }

    /**
     * Update phone number
     */
    async updatePhoneNumber(phoneNumber) {
        return await this.updateUserProfile({ phoneNumber });
    }

    /**
     * Update KCSE year
     */
    async updateKCSEYear(kcseYear) {
        return await this.updateUserProfile({ kcseYear });
    }

    /**
     * Get user's KCSE grades
     */
    getKCSEGrades() {
        return this.userProfile?.kcseGrades || null;
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

        if (authBtn) {
            authBtn.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Logout';
            authBtn.onclick = () => this.logout();
        }

        if (authBtnMobile) {
            authBtnMobile.innerHTML = '<i class="fas fa-sign-out-alt mr-2"></i>Logout';
            authBtnMobile.onclick = () => this.logout();
        }

        if (profileBtn) {
            profileBtn.classList.remove('hidden');
        }

        if (profileBtnMobile) {
            profileBtnMobile.classList.remove('hidden');
        }

        if (userAvatar && this.currentUser) {
            if (this.currentUser.photoURL) {
                userAvatar.innerHTML = `<img src="${this.currentUser.photoURL}" alt="Profile" class="w-8 h-8 rounded-full">`;
            } else {
                const initial = (this.currentUser.displayName || this.currentUser.email || 'U')[0].toUpperCase();
                userAvatar.innerHTML = `<div class="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center font-bold">${initial}</div>`;
            }
            userAvatar.classList.remove('hidden');
        }

        // Pre-fill calculator with saved grades if available
        if (this.userProfile?.kcseGrades) {
            this.prefillCalculatorGrades();
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

        if (authBtn) {
            authBtn.innerHTML = '<i class="fas fa-user mr-2"></i>Login';
            authBtn.onclick = () => this.openAuthModal();
        }

        if (authBtnMobile) {
            authBtnMobile.innerHTML = '<i class="fas fa-user mr-2"></i>Login';
            authBtnMobile.onclick = () => this.openAuthModal();
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
    }

    /**
     * Pre-fill calculator with saved grades
     */
    prefillCalculatorGrades() {
        const grades = this.userProfile?.kcseGrades;
        if (!grades) return;

        const gradeMap = {
            'mathematics': 'math',
            'english': 'eng',
            'kiswahili': 'kis',
            'biology': 'bio',
            'chemistry': 'chem',
            'physics': 'phy',
            'history': 'hist',
            'geography': 'geo',
            'cre': 'cre',
            'agriculture': 'agri',
            'business': 'bus',
            'computer': 'comp'
        };

        Object.entries(grades).forEach(([subject, grade]) => {
            const selectId = gradeMap[subject];
            if (selectId && grade) {
                const select = document.getElementById(selectId);
                if (select) {
                    select.value = grade;
                }
            }
        });
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
        const profileKcseYear = document.getElementById('profileKcseYear');

        if (profileEmail) profileEmail.value = this.userProfile.email || '';
        if (profileName) profileName.value = this.userProfile.displayName || '';
        if (profilePhone) profilePhone.value = this.userProfile.phoneNumber || '';
        if (profileKcseYear) profileKcseYear.value = this.userProfile.kcseYear || '';

        // KCSE Grades
        const grades = this.userProfile.kcseGrades || {};
        const gradeFields = ['mathematics', 'english', 'kiswahili', 'biology', 'chemistry', 
                            'physics', 'history', 'geography', 'cre', 'agriculture', 
                            'business', 'computer'];

        gradeFields.forEach(field => {
            const select = document.getElementById(`profile_${field}`);
            if (select && grades[field]) {
                select.value = grades[field];
            }
        });
    }

    /**
     * Save profile from form
     */
    async saveProfile() {
        const phoneNumber = document.getElementById('profilePhone')?.value || '';
        const kcseYear = document.getElementById('profileKcseYear')?.value || '';
        
        const gradeFields = ['mathematics', 'english', 'kiswahili', 'biology', 'chemistry', 
                            'physics', 'history', 'geography', 'cre', 'agriculture', 
                            'business', 'computer'];

        const kcseGrades = {};
        gradeFields.forEach(field => {
            const select = document.getElementById(`profile_${field}`);
            if (select) {
                kcseGrades[field] = select.value;
            }
        });

        const result = await this.updateUserProfile({
            phoneNumber,
            kcseYear,
            kcseGrades
        });

        if (result.success) {
            this.closeProfileModal();
            // Update calculator with new grades
            this.prefillCalculatorGrades();
        }

        return result;
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
     * Show toast notification
     */
    showToast(message, type = 'info') {
        if (typeof Swal !== 'undefined') {
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true
            });

            Toast.fire({
                icon: type,
                title: message
            });
        } else {
            alert(message);
        }
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
