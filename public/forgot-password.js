// Forgot password page JavaScript
// Handles password reset email requests

// DOM elements
const forgotForm = document.getElementById('forgot-form');
const forgotEmail = document.getElementById('forgot-email');
const resetSubmitBtn = document.getElementById('reset-submit-btn');
const forgotStatus = document.getElementById('forgot-status');

// Show status message
function showForgotStatus(message, type) {
    forgotStatus.textContent = message;
    forgotStatus.className = `forgot-status ${type}`;
    forgotStatus.style.display = 'block';
}

// Hide status message
function hideForgotStatus() {
    forgotStatus.style.display = 'none';
}

// Handle form submission
forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = forgotEmail.value.trim();
    
    // Validate email is provided
    if (!email) {
        showForgotStatus('Please enter your email address', 'error');
        return;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        showForgotStatus('Please enter a valid email address', 'error');
        return;
    }
    
    // Disable button and show loading state
    resetSubmitBtn.disabled = true;
    resetSubmitBtn.textContent = 'Sending...';
    hideForgotStatus();
    
    try {
        // Call API to send password reset email
        const response = await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to send reset email');
        }
        
        // Show success message
        showForgotStatus(
            data.message || 'If an account exists with this email, a password reset link has been sent. Please check your email inbox and spam folder.', 
            'success'
        );
        
        // Clear the email field
        forgotEmail.value = '';
        
        // Update button to show success state
        resetSubmitBtn.textContent = 'Email Sent!';
        resetSubmitBtn.style.background = '#2d5016';
        
        // After 5 seconds, reset button state (but keep success message visible)
        setTimeout(() => {
            resetSubmitBtn.disabled = false;
            resetSubmitBtn.textContent = 'Reset Password';
            resetSubmitBtn.style.background = '';
        }, 5000);
        
    } catch (error) {
        console.error('Forgot password error:', error);
        showForgotStatus(error.message || 'Failed to send reset email. Please try again.', 'error');
        resetSubmitBtn.disabled = false;
        resetSubmitBtn.textContent = 'Reset Password';
    }
});

// Allow Enter key to submit form (handled by form submit event)
