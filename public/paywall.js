// Shared Paywall Modal Component
// This file contains the paywall modal functionality that can be used across multiple pages
// Usage: Include this file and the payment modal HTML in any page that needs the paywall

// Get valid auth token (refresh if needed)
// This function should be available globally or passed in
async function getValidTokenForPaywall() {
    // Check if getValidToken exists globally (from app.js or settings.js)
    // Make it available on window for easier access
    if (typeof window.getValidToken === 'function') {
        return await window.getValidToken();
    }
    if (typeof getValidToken === 'function') {
        return await getValidToken();
    }
    
    // Fallback: try to get token from localStorage
    let authToken = localStorage.getItem('authToken');
    if (!authToken) {
        return null;
    }
    
    // Check if token is expired
    const expiresAt = localStorage.getItem('tokenExpiresAt');
    if (expiresAt) {
        const expirationTime = new Date(expiresAt).getTime();
        const now = new Date().getTime();
        const timeUntilExpiry = expirationTime - now;
        
        // Refresh if token expires in less than 5 minutes
        if (timeUntilExpiry < 5 * 60 * 1000) {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
                try {
                    const response = await fetch('/api/auth/refresh', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ refresh_token: refreshToken })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        authToken = data.access_token;
                        localStorage.setItem('authToken', authToken);
                        if (data.refresh_token) {
                            localStorage.setItem('refreshToken', data.refresh_token);
                        }
                        if (data.expires_at) {
                            localStorage.setItem('tokenExpiresAt', data.expires_at);
                        }
                    }
                } catch (error) {
                    console.error('Token refresh error:', error);
                }
            }
        }
    }
    
    return authToken;
}

// Payment Modal functions
// Make them available globally so they can be called from settings.js and app.js
function openPaymentModal() {
    const paymentModal = document.getElementById('payment-modal');
    if (paymentModal) {
        paymentModal.style.display = 'flex';
        paymentModal.classList.add('show');
    }
}

function closePaymentModalFunc() {
    const paymentModal = document.getElementById('payment-modal');
    if (paymentModal) {
        paymentModal.style.display = 'none';
        paymentModal.classList.remove('show');
    }
}

// Make functions available globally
window.openPaymentModal = openPaymentModal;
window.closePaymentModalFunc = closePaymentModalFunc;

// Create checkout session and redirect to Stripe
// Make it available globally so app.js can use it
async function createCheckoutSession(isTrial = false) {
    // Get valid token (refresh if needed)
    const token = await getValidTokenForPaywall();
    if (!token) {
        alert('Session expired. Please login again.');
        return;
    }
    
    try {
        const response = await fetch(`/api/stripe/create-checkout-session${isTrial ? '?trial=true' : ''}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to create checkout session');
        }
        
        // Redirect to Stripe Checkout
        if (data.url) {
            window.location.href = data.url;
        }
    } catch (error) {
        console.error('Checkout error:', error);
        alert(error.message || 'Failed to start checkout. Please try again.');
    }
}

// Initialize payment modal event listeners
// Call this function after the DOM is loaded
function initPaymentModal() {
    const paymentModal = document.getElementById('payment-modal');
    const closePaymentModal = document.getElementById('close-payment-modal');
    const paymentCancelBtn = document.getElementById('payment-cancel-btn');
    const paymentTrialBtn = document.getElementById('payment-trial-btn');
    const paymentUpgradeBtn = document.getElementById('payment-upgrade-btn');
    
    // Close button
    if (closePaymentModal) {
        closePaymentModal.addEventListener('click', closePaymentModalFunc);
    }
    
    // Cancel button
    if (paymentCancelBtn) {
        paymentCancelBtn.addEventListener('click', closePaymentModalFunc);
    }
    
    // Trial button - starts 3-day free trial
    if (paymentTrialBtn) {
        paymentTrialBtn.addEventListener('click', () => {
            createCheckoutSession(true); // true = trial
        });
    }
    
    // Upgrade button - pay immediately
    if (paymentUpgradeBtn) {
        paymentUpgradeBtn.addEventListener('click', () => {
            createCheckoutSession(false); // false = no trial
        });
    }
    
    // Close payment modal with Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && paymentModal && paymentModal.style.display !== 'none') {
            closePaymentModalFunc();
        }
    });
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPaymentModal);
} else {
    // DOM is already ready
    initPaymentModal();
}
