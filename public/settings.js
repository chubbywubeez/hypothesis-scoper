// Settings page JavaScript
// Handles user account settings, subscription management, and password reset

// Check authentication on page load
let authToken = localStorage.getItem('authToken');
let refreshToken = localStorage.getItem('refreshToken');

// Redirect to login if not authenticated
if (!authToken) {
    window.location.href = '/login.html';
}

// DOM elements
const userEmailDisplay = document.getElementById('user-email-display');
const subscriptionStatusText = document.getElementById('subscription-status-text');
const subscriptionBadge = document.getElementById('subscription-badge');
const subscriptionActionItem = document.getElementById('subscription-action-item');
const subscriptionActionLabel = document.getElementById('subscription-action-label');
const subscriptionActionDesc = document.getElementById('subscription-action-desc');
const subscriptionActionBtn = document.getElementById('subscription-action-btn');
const logoutBtn = document.getElementById('logout-btn');
const settingsStatus = document.getElementById('settings-status');

// Show status message
function showStatus(message, type) {
    settingsStatus.textContent = message;
    settingsStatus.className = `settings-status ${type}`;
    settingsStatus.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        settingsStatus.style.display = 'none';
    }, 5000);
}

// Hide status message
function hideStatus() {
    settingsStatus.style.display = 'none';
}

// Get valid auth token (refresh if needed)
async function getValidToken() {
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
                            refreshToken = data.refresh_token;
                            localStorage.setItem('refreshToken', refreshToken);
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

// Load user profile and subscription info
async function loadUserInfo() {
    const token = await getValidToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    try {
        // Get user info
        const userResponse = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!userResponse.ok) {
            throw new Error('Failed to load user info');
        }
        
        const userData = await userResponse.json();
        
        // Display email
        if (userData.user && userData.user.email) {
            userEmailDisplay.textContent = userData.user.email;
        }
        
        // Get subscription status
        const subscriptionResponse = await fetch('/api/subscription/status', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (subscriptionResponse.ok) {
            const subscriptionData = await subscriptionResponse.json();
            updateSubscriptionUI(subscriptionData);
        } else {
            // User might not have subscription endpoint access, show inactive
            updateSubscriptionUI({
                hasAccess: false,
                subscriptionStatus: 'inactive',
                isOnTrial: false
            });
        }
        
    } catch (error) {
        console.error('Error loading user info:', error);
        showStatus('Failed to load account information', 'error');
    }
}

// Update subscription UI based on status
function updateSubscriptionUI(data) {
    const { hasAccess, subscriptionStatus, isOnTrial, role } = data;
    
    // Update status text and badge
    if (role === 'internal') {
        subscriptionStatusText.textContent = 'Internal user - Full access';
        subscriptionBadge.textContent = 'Active';
        subscriptionBadge.className = 'status-badge active';
        subscriptionActionItem.style.display = 'none';
    } else if (isOnTrial) {
        subscriptionStatusText.textContent = '3-day free trial active';
        subscriptionBadge.textContent = 'Trial';
        subscriptionBadge.className = 'status-badge trial';
        subscriptionActionItem.style.display = 'flex';
        subscriptionActionLabel.textContent = 'Upgrade to Paid';
        subscriptionActionDesc.textContent = 'Subscribe to continue after trial ends';
        subscriptionActionBtn.textContent = 'Subscribe';
        subscriptionActionBtn.onclick = () => upgradeSubscription();
    } else if (hasAccess && subscriptionStatus === 'active') {
        subscriptionStatusText.textContent = 'Active subscription';
        subscriptionBadge.textContent = 'Active';
        subscriptionBadge.className = 'status-badge active';
        subscriptionActionItem.style.display = 'flex';
        subscriptionActionLabel.textContent = 'Manage Subscription';
        subscriptionActionDesc.textContent = 'Cancel your subscription';
        subscriptionActionBtn.textContent = 'Cancel';
        subscriptionActionBtn.className = 'btn btn-secondary btn-small';
        subscriptionActionBtn.onclick = () => cancelSubscription();
    } else {
        subscriptionStatusText.textContent = 'No active subscription';
        subscriptionBadge.textContent = 'Inactive';
        subscriptionBadge.className = 'status-badge inactive';
        subscriptionActionItem.style.display = 'flex';
        subscriptionActionLabel.textContent = 'Subscribe';
        subscriptionActionDesc.textContent = 'Get access to Advanced Mode';
        subscriptionActionBtn.textContent = 'Subscribe';
        subscriptionActionBtn.className = 'btn btn-primary btn-small';
        subscriptionActionBtn.onclick = () => upgradeSubscription();
    }
}

// Upgrade/Subscribe to subscription
async function upgradeSubscription() {
    const token = await getValidToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    try {
        subscriptionActionBtn.disabled = true;
        subscriptionActionBtn.textContent = 'Loading...';
        
        // Check if user is on trial - if so, use trial checkout
        const subscriptionResponse = await fetch('/api/subscription/status', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        let isTrial = false;
        if (subscriptionResponse.ok) {
            const data = await subscriptionResponse.json();
            isTrial = data.isOnTrial || false;
        }
        
        // Create checkout session
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
        console.error('Upgrade error:', error);
        showStatus(error.message || 'Failed to start checkout. Please try again.', 'error');
        subscriptionActionBtn.disabled = false;
        subscriptionActionBtn.textContent = 'Subscribe';
    }
}

// Cancel subscription
async function cancelSubscription() {
    if (!confirm('Are you sure you want to cancel your subscription? You will lose access to Advanced Mode at the end of your billing period.')) {
        return;
    }
    
    const token = await getValidToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    
    try {
        subscriptionActionBtn.disabled = true;
        subscriptionActionBtn.textContent = 'Canceling...';
        
        const response = await fetch('/api/subscription/cancel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to cancel subscription');
        }
        
        showStatus('Subscription canceled successfully. You will retain access until the end of your billing period.', 'success');
        
        // Reload subscription info
        setTimeout(() => {
            loadUserInfo();
        }, 2000);
        
    } catch (error) {
        console.error('Cancel error:', error);
        showStatus(error.message || 'Failed to cancel subscription. Please try again.', 'error');
        subscriptionActionBtn.disabled = false;
        subscriptionActionBtn.textContent = 'Cancel';
    }
}

// Logout
logoutBtn.addEventListener('click', () => {
    // Clear tokens
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('tokenExpiresAt');
    
    // Redirect to login
    window.location.href = '/login.html';
});

// Load user info on page load
loadUserInfo();
