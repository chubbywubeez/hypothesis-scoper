// Login page JavaScript
// Handles authentication on the dedicated login page

let isLoginMode = true;

// Function to capture and store acquisition details (UTM parameters, referrer, etc.)
// This data will be sent to Beehiv for tracking and automation
function getAcquisitionDetails() {
    const params = new URLSearchParams(window.location.search);
    const details = {};
    
    // Capture UTM parameters from URL
    const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    utmParams.forEach(param => {
        const value = params.get(param);
        if (value) {
            details[param] = value;
            // Store in sessionStorage for persistence across page navigations
            sessionStorage.setItem(param, value);
        } else {
            // Check sessionStorage if not in URL (user navigated from landing page)
            const stored = sessionStorage.getItem(param);
            if (stored) {
                details[param] = stored;
            }
        }
    });
    
    // Capture referrer (where user came from)
    if (document.referrer) {
        details.referrer = document.referrer;
        sessionStorage.setItem('referrer', document.referrer);
    } else {
        const storedReferrer = sessionStorage.getItem('referrer');
        if (storedReferrer) {
            details.referrer = storedReferrer;
        }
    }
    
    // Capture landing page (first page user visited)
    const landingPage = sessionStorage.getItem('landing_page') || window.location.pathname;
    if (!sessionStorage.getItem('landing_page')) {
        sessionStorage.setItem('landing_page', window.location.pathname);
    }
    details.landing_page = landingPage;
    
    // Determine acquisition source if not set via UTM
    if (!details.utm_source) {
        if (document.referrer) {
            try {
                const referrerUrl = new URL(document.referrer);
                const hostname = referrerUrl.hostname;
                // Set source based on referrer
                if (hostname.includes('google')) {
                    details.acquisition_source = 'google';
                } else if (hostname.includes('facebook') || hostname.includes('instagram')) {
                    details.acquisition_source = 'facebook';
                } else if (hostname.includes('twitter') || hostname.includes('x.com')) {
                    details.acquisition_source = 'twitter';
                } else if (hostname.includes('linkedin')) {
                    details.acquisition_source = 'linkedin';
                } else if (hostname.includes('youtube')) {
                    details.acquisition_source = 'youtube';
                } else if (hostname.includes('tiktok')) {
                    details.acquisition_source = 'tiktok';
                } else {
                    details.acquisition_source = 'referral';
                }
            } catch (e) {
                details.acquisition_source = 'direct';
            }
        } else {
            details.acquisition_source = 'direct';
        }
    } else {
        // Use utm_source as acquisition_source
        details.acquisition_source = details.utm_source;
    }
    
    return details;
}

// DOM elements
const loginTab = document.getElementById('login-tab');
const signupTab = document.getElementById('signup-tab');
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authPasswordConfirm = document.getElementById('auth-password-confirm');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authStatus = document.getElementById('auth-status');

// Check if user is already logged in
const savedToken = localStorage.getItem('authToken');
if (savedToken) {
    // Verify token is still valid
    checkAuthAndRedirect(savedToken);
}

// Show forgot password link on initial load (login mode is default)
const forgotPasswordLink = document.getElementById('forgot-password-link');
if (forgotPasswordLink && isLoginMode) {
    forgotPasswordLink.style.display = 'block';
}

// Toggle between login and signup
function switchAuthMode(isLogin) {
    isLoginMode = isLogin;
    const signupOptionsGroup = document.getElementById('signup-options-group');
    const passwordConfirmGroup = document.getElementById('password-confirm-group');
    const passwordRequirements = document.getElementById('password-requirements');
    const termsCheckbox = document.getElementById('terms-checkbox');
    const newsletterCheckbox = document.getElementById('newsletter-checkbox');
    
    if (isLogin) {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        authSubmitBtn.textContent = 'Login';
        if (signupOptionsGroup) {
            signupOptionsGroup.style.display = 'none';
        }
        if (passwordConfirmGroup) {
            passwordConfirmGroup.style.display = 'none';
        }
        if (passwordRequirements) {
            passwordRequirements.style.display = 'none';
        }
        if (authPasswordConfirm) {
            authPasswordConfirm.removeAttribute('required');
            authPasswordConfirm.value = '';
        }
        if (termsCheckbox) {
            termsCheckbox.required = false;
            termsCheckbox.removeAttribute('required');
        }
        // Show forgot password link in login mode
        const forgotPasswordLink = document.getElementById('forgot-password-link');
        if (forgotPasswordLink) {
            forgotPasswordLink.style.display = 'block';
        }
        // Clear password validation styling
        if (authPassword) {
            authPassword.classList.remove('error', 'valid');
        }
    } else {
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        authSubmitBtn.textContent = 'Sign Up';
        if (signupOptionsGroup) {
            signupOptionsGroup.style.display = 'block';
        }
        if (passwordConfirmGroup) {
            passwordConfirmGroup.style.display = 'block';
        }
        // Hide forgot password link in signup mode
        const forgotPasswordLink = document.getElementById('forgot-password-link');
        if (forgotPasswordLink) {
            forgotPasswordLink.style.display = 'none';
        }
        // Don't show requirements by default - only show when password is invalid
        if (passwordRequirements) {
            passwordRequirements.style.display = 'none';
        }
        if (authPasswordConfirm) {
            authPasswordConfirm.setAttribute('required', 'required');
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
    // Validate password when switching to signup mode (but don't show requirements unless invalid)
    if (!isLogin && authPassword && authPassword.value.length > 0) {
        validatePassword(authPassword.value);
    }
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

// Validate password against requirements
function validatePassword(password) {
    const requirements = {
        length: password.length >= 8,
        uppercase: /[A-Z]/.test(password),
        lowercase: /[a-z]/.test(password),
        number: /[0-9]/.test(password)
    };
    
    const passwordRequirements = document.getElementById('password-requirements');
    const isValid = Object.values(requirements).every(req => req === true);
    
    // Show requirements only if password is invalid and user has typed something
    if (passwordRequirements) {
        if (password.length > 0 && !isValid) {
            passwordRequirements.style.display = 'block';
        } else {
            passwordRequirements.style.display = 'none';
        }
    }
    
    // Update requirement indicators
    const reqLength = document.getElementById('req-length');
    const reqUppercase = document.getElementById('req-uppercase');
    const reqLowercase = document.getElementById('req-lowercase');
    const reqNumber = document.getElementById('req-number');
    
    if (reqLength) {
        reqLength.className = requirements.length ? 'valid' : 'invalid';
    }
    if (reqUppercase) {
        reqUppercase.className = requirements.uppercase ? 'valid' : 'invalid';
    }
    if (reqLowercase) {
        reqLowercase.className = requirements.lowercase ? 'valid' : 'invalid';
    }
    if (reqNumber) {
        reqNumber.className = requirements.number ? 'valid' : 'invalid';
    }
    
    // Update password field styling
    if (authPassword) {
        authPassword.classList.remove('error', 'valid');
        if (password.length > 0) {
            authPassword.classList.add(isValid ? 'valid' : 'error');
        }
    }
    
    return isValid;
}

// Validate password confirmation matches
function validatePasswordMatch() {
    if (!authPasswordConfirm || !authPassword) return true;
    
    const password = authPassword.value;
    const confirm = authPasswordConfirm.value;
    
    if (confirm.length === 0) {
        authPasswordConfirm.classList.remove('error', 'valid');
        return false;
    }
    
    if (password === confirm) {
        authPasswordConfirm.classList.remove('error');
        authPasswordConfirm.classList.add('valid');
        return true;
    } else {
        authPasswordConfirm.classList.remove('valid');
        authPasswordConfirm.classList.add('error');
        return false;
    }
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
            window.location.href = '/index.html';
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
        window.location.href = '/index.html';
        
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
    const passwordConfirm = authPasswordConfirm ? authPasswordConfirm.value.trim() : '';
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
    
    // Validate password requirements
    if (!validatePassword(password)) {
        showAuthStatus('Password does not meet requirements. Please check the requirements below.', 'error');
        return;
    }
    
    // Validate password confirmation
    if (password !== passwordConfirm) {
        showAuthStatus('Passwords do not match', 'error');
        if (authPasswordConfirm) {
            authPasswordConfirm.classList.add('error');
        }
        return;
    }
    
    if (!termsCheckbox || !termsCheckbox.checked) {
        showAuthStatus('You must agree to the Terms and Conditions and Privacy Policy to sign up', 'error');
        return;
    }
    
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = 'Signing up...';
    hideAuthStatus();
    
    // Capture acquisition details (UTM parameters, referrer, etc.)
    const acquisitionDetails = getAcquisitionDetails();
    
    // Prepare request body
    const requestBody = { 
        email, 
        password, 
        role: 'customer',
        terms_accepted: true,
        terms_accepted_at: new Date().toISOString(),
        newsletter_subscribed: newsletterCheckbox ? newsletterCheckbox.checked : false,
        // Include acquisition details for Beehiv tracking
        ...acquisitionDetails
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

// Real-time password validation
if (authPassword) {
    authPassword.addEventListener('input', (e) => {
        if (!isLoginMode) {
            validatePassword(e.target.value);
            // Also re-validate password match if confirmation field has value
            if (authPasswordConfirm && authPasswordConfirm.value.length > 0) {
                validatePasswordMatch();
            }
        }
    });
}

// Real-time password confirmation validation
if (authPasswordConfirm) {
    authPasswordConfirm.addEventListener('input', (e) => {
        if (!isLoginMode) {
            validatePasswordMatch();
        }
    });
}

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

// Password toggle functionality
const togglePasswordBtn = document.getElementById('toggle-password');
const togglePasswordConfirmBtn = document.getElementById('toggle-password-confirm');
const eyeIcon = document.getElementById('eye-icon');
const eyeOffIcon = document.getElementById('eye-off-icon');
const eyeIconConfirm = document.getElementById('eye-icon-confirm');
const eyeOffIconConfirm = document.getElementById('eye-off-icon-confirm');

if (togglePasswordBtn && authPassword) {
    togglePasswordBtn.addEventListener('click', () => {
        const isPassword = authPassword.type === 'password';
        authPassword.type = isPassword ? 'text' : 'password';
        if (eyeIcon) eyeIcon.style.display = isPassword ? 'none' : 'block';
        if (eyeOffIcon) eyeOffIcon.style.display = isPassword ? 'block' : 'none';
    });
}

if (togglePasswordConfirmBtn && authPasswordConfirm) {
    togglePasswordConfirmBtn.addEventListener('click', () => {
        const isPassword = authPasswordConfirm.type === 'password';
        authPasswordConfirm.type = isPassword ? 'text' : 'password';
        if (eyeIconConfirm) eyeIconConfirm.style.display = isPassword ? 'none' : 'block';
        if (eyeOffIconConfirm) eyeOffIconConfirm.style.display = isPassword ? 'block' : 'none';
    });
}

// Forgot password functionality is now handled on a separate page (forgot-password.html)
