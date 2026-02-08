/**
 * Admin Authentication & Access Control
 * Checks Firestore database for isAdmin flag
 */

const ADMIN_EMAILS = [
    'peterkelvinkibiru1532@gmail.com',
    'macharia074m@gmail.com' // Hardcoded super admins (fallback)
];

/**
 * Checks if a user is authorized as an admin
 * First checks Firestore for isAdmin flag, then falls back to hardcoded list
 * @param {firebase.User} user - The Firebase user object
 * @returns {Promise<boolean>} - True if authorized
 */
async function isAuthorizedAdmin(user) {
    if (!user || !user.email) return false;
    
    // Check hardcoded list first (super admins)
    if (ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        console.log('✅ Super admin detected:', user.email);
        return true;
    }
    
    // Check Firestore for isAdmin flag
    try {
        const db = firebase.firestore();
        const userDoc = await db.collection('users').doc(user.uid).get();
        
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.isAdmin === true) {
                console.log('✅ Admin user from database:', user.email, 'Commission:', userData.commissionRate + '%');
                return true;
            }
        }
        
        console.warn('⚠️ User not authorized as admin:', user.email);
        return false;
    } catch (error) {
        console.error('Error checking admin status:', error);
        // Fallback to hardcoded list on error
        return ADMIN_EMAILS.includes(user.email.toLowerCase());
    }
}

/**
 * Common auth state handler for admin pages
 * Automatically redirects unauthorized users
 * @param {firebase.User} user - Firebase user
 * @param {Function} onSuccess - Callback when authorized
 * @param {string} redirectUrl - Where to send unauthorized users
 */
async function handleAdminAuthState(user, onSuccess, redirectUrl = 'index.html') {
    if (user) {
        const isAdmin = await isAuthorizedAdmin(user);
        if (isAdmin) {
            if (onSuccess) onSuccess(user);
        } else {
            console.error('❌ Unauthorized admin access attempt:', user.email);
            // Sign out and redirect
            if (typeof firebase !== 'undefined') {
                firebase.auth().signOut().then(() => {
                    window.location.href = redirectUrl;
                });
            } else if (typeof auth !== 'undefined') {
                auth.signOut().then(() => {
                    window.location.href = redirectUrl;
                });
            } else {
                window.location.href = redirectUrl;
            }
        }
    } else {
        // Only redirect if we are NOT on the index.html page (which contains the login)
        const currentPage = window.location.pathname.split('/').pop();
        if (currentPage && currentPage !== 'index.html') {
            window.location.href = redirectUrl;
        } else if (typeof showLogin === 'function') {
            showLogin();
        }
    }
}
