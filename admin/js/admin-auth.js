/**
 * Admin Authentication & Access Control
 * Only hardcoded emails can access admin panel
 */

const ADMIN_EMAILS = [
    'peterkelvinkibiru1532@gmail.com',
    'macharia074m@gmail.com' // Add more admin panel emails here
];

/**
 * Checks if a user is authorized as an admin (for admin panel access only)
 * @param {firebase.User} user - The Firebase user object
 * @returns {boolean} - True if authorized for admin panel
 */
function isAuthorizedAdmin(user) {
    if (!user || !user.email) return false;
    return ADMIN_EMAILS.includes(user.email.toLowerCase());
}

/**
 * Common auth state handler for admin pages
 * Automatically redirects unauthorized users
 * @param {firebase.User} user - Firebase user
 * @param {Function} onSuccess - Callback when authorized
 * @param {string} redirectUrl - Where to send unauthorized users
 */
function handleAdminAuthState(user, onSuccess, redirectUrl = 'index.html') {
    if (user) {
        if (isAuthorizedAdmin(user)) {
            if (onSuccess) onSuccess(user);
        } else {
            console.error('❌ Unauthorized admin panel access attempt:', user.email);
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
