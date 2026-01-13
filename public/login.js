// Login page JavaScript
// Handles authentication on the dedicated login page

let isLoginMode = true;

// DOM elements
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authStatus = document.getElementById('auth-status');

// Check if user is already logged in
const savedToken = localStorage.getItem('authToken');
if (savedToken) {
    // Verify token is still valid
    checkAuthAndRedirect(savedToken);
}

// Toggle between login and signup
function switchAuthMode(isLogin) {
    isLoginMode = isLogin;
    const signupOptionsGroup = document.getElementById('signup-options-group');
    const termsCheckbox = document.getElementById('terms-checkbox');
    const newsletterCheckbox = document.getElementById('newsletter-checkbox');
    
    if (isLogin) {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        authSubmitBtn.textContent = 'Login';
        if (signupOptionsGroup) {
            signupOptionsGroup.style.display = 'none';
        }
        if (termsCheckbox) {
            termsCheckbox.required = false;
            termsCheckbox.removeAttribute('required');
        }
    } else {
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        authSubmitBtn.textContent = 'Sign Up';
        if (signupOptionsGroup) {
            signupOptionsGroup.style.display = 'block';
        }
        if (termsCheckbox) {
            termsCheckbox.required = true;
            termsCheckbox.setAttribute('required', 'required');
        }
        // Ensure both checkboxes are checked by default when switching to signup
        if (newsletterCheckbox) {
            newsletterCheckbox.checked = true;
        }
        if (termsCheckbox) {
            termsCheckbox.checked = true;
        }
    }
    hideAuthStatus();
}

// Show auth status message
function showAuthStatus(message, type) {
    authStatus.textContent = message;
    authStatus.className = `auth-status ${type}`;
    authStatus.style.display = 'block';
}

// Hide auth status
function hideAuthStatus() {
    authStatus.style.display = 'none';
}

// Check auth and redirect if valid
async function checkAuthAndRedirect(token) {
    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            // Token is valid, redirect to main app
            window.location.href = '/';
        } else {
            // Token invalid, clear it
            localStorage.removeItem('authToken');
        }
    } catch (error) {
        console.error('Auth check error:', error);
        localStorage.removeItem('authToken');
    }
}

// Login function
async function handleLogin() {
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    
    if (!email || !password) {
        showAuthStatus('Please enter both email and password', 'error');
        return;
    }
    
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Logging in...';
    hideAuthStatus();
    
    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }
        
        // Save tokens and expiration for persistent sessions
        localStorage.setItem('authToken', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('refreshToken', data.refresh_token);
        }
        if (data.expires_at) {
            localStorage.setItem('tokenExpiresAt', data.expires_at);
        }
        window.location.href = '/';
        
    } catch (error) {
        console.error('Login error:', error);
        showAuthStatus(error.message || 'Login failed. Please check your credentials.', 'error');
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isLoginMode ? 'Login' : 'Sign Up';
    }
}

// Signup function
async function handleSignup() {
    const email = authEmail.value.trim();
    const password = authPassword.value.trim();
    const termsCheckbox = document.getElementById('terms-checkbox');
    const newsletterCheckbox = document.getElementById('newsletter-checkbox');
    
    console.log('=== FRONTEND SIGNUP START ===');
    console.log('Email:', email);
    console.log('Password length:', password.length);
    console.log('Terms checkbox:', termsCheckbox ? termsCheckbox.checked : 'not found');
    console.log('Newsletter checkbox:', newsletterCheckbox ? newsletterCheckbox.checked : 'not found');
    
    if (!email || !password) {
        showAuthStatus('Please enter both email and password', 'error');
        return;
    }
    
    if (password.length < 6) {
        showAuthStatus('Password must be at least 6 characters', 'error');
        return;
    }
    
    if (!termsCheckbox || !termsCheckbox.checked) {
        showAuthStatus('You must agree to the Terms and Conditions and Privacy Policy to sign up', 'error');
        return;
    }
    
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Signing up...';
    hideAuthStatus();
    
    // Prepare request body
    const requestBody = { 
        email, 
        password, 
        role: 'customer',
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        newsletter_subscribed: newsletterCheckbox ? newsletterCheckbox.checked : false
    };
    
    console.log('=== FRONTEND REQUEST BODY ===');
    console.log(JSON.stringify(requestBody, null, 2));
    
    try {
        console.log('Sending signup request to /api/auth/signup...');
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('Response status:', response.status);
        console.log('Response ok:', response.ok);
        
        const data = await response.json();
        console.log('=== FRONTEND RESPONSE DATA ===');
        console.log(JSON.stringify(data, null, 2));
        
        if (!response.ok) {
            console.error('Signup failed with error:', data.error);
            throw new Error(data.error || 'Signup failed');
        }
        
        console.log('✅ Signup successful, attempting auto-login...');
        // After signup, automatically login
        await handleLogin();
        
    } catch (error) {
        console.error('❌ Signup error:', error);
        console.error('Error details:', error.message);
        showAuthStatus(error.message || 'Signup failed. Please try again.', 'error');
    } finally {
        authSubmitBtn.disabled = false;
        authSubmitBtn.textContent = isLoginMode ? 'Login' : 'Sign Up';
        console.log('=== FRONTEND SIGNUP END ===');
    }
}

// Event handlers
loginTab.addEventListener('click', () => switchAuthMode(true));
signupTab.addEventListener('click', () => switchAuthMode(false));

authForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // Remove required attribute from hidden checkbox to prevent browser validation errors
    const termsCheckbox = document.getElementById('terms-checkbox');
    const signupOptionsGroup = document.getElementById('signup-options-group');
    if (termsCheckbox && signupOptionsGroup && signupOptionsGroup.style.display === 'none') {
        termsCheckbox.removeAttribute('required');
    }
    
    if (isLoginMode) {
        handleLogin();
    } else {
        // Ensure required is set for signup validation
        if (termsCheckbox) {
            termsCheckbox.setAttribute('required', 'required');
        }
        handleSignup();
    }
});

// Allow Enter key to submit
authPassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        authForm.dispatchEvent(new Event('submit'));
    }
});
