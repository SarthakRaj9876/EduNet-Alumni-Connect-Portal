// Auth State Management
let currentUser = null;

// Form Submissions
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const submitButton = e.target.querySelector('button[type="submit"]');

    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }

    try {
        // Show loading state
        submitButton.textContent = 'Logging in...';
        submitButton.disabled = true;

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed. Please check your credentials.');
        }

        handleAuthSuccess(data);
    } catch (error) {
        console.error('Login error:', error);
        showError(error.message || 'Login failed. Please try again.');
    } finally {
        // Reset button state
        submitButton.textContent = 'Login Now';
        submitButton.disabled = false;
    }
});

// Forgot Password
async function handleForgotPassword(e) {
    e.preventDefault();
    
    // Check if we're in a form with an email field
    const emailInput = document.getElementById('email');
    if (!emailInput) {
        // We might be on the login page, show a modal or form to enter email
        showForgotPasswordModal();
        return;
    }
    
    const email = emailInput.value;
    if (!email) {
        showError('Please enter your email address');
        return;
    }
    
    // Show loading state
    const forgotPasswordLink = document.querySelector('.forgot-password');
    if (forgotPasswordLink) {
        forgotPasswordLink.textContent = 'Sending...';
        forgotPasswordLink.style.pointerEvents = 'none';
    }

    try {
        const response = await fetch('/api/forgot-password', {
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
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.textContent = 'Password reset email sent. Please check your inbox.';
        
        const form = document.querySelector('form');
        form.insertBefore(successDiv, form.firstChild);
        
        setTimeout(() => {
            successDiv.remove();
        }, 5000);

    } catch (error) {
        showError(error.message || 'Failed to send reset email. Please try again.');
    } finally {
        // Reset UI state
        if (forgotPasswordLink) {
            forgotPasswordLink.textContent = 'Forgot Password?';
            forgotPasswordLink.style.pointerEvents = 'auto';
        }
    }
}

// Show a modal to collect email for password reset
function showForgotPasswordModal() {
    // Create modal container
    const modalContainer = document.createElement('div');
    modalContainer.className = 'auth-modal';
    modalContainer.innerHTML = `
        <div class="auth-modal-content">
            <span class="auth-modal-close">&times;</span>
            <h2>Forgot Password</h2>
            <p>Enter your email address to receive a password reset link.</p>
            <form id="forgotPasswordForm">
                <div class="form-group">
                    <label for="resetEmail">Email Address</label>
                    <input type="email" id="resetEmail" name="resetEmail" required>
                </div>
                <button type="submit" class="btn btn-primary">Send Reset Link</button>
            </form>
        </div>
    `;
    
    // Add modal to body
    document.body.appendChild(modalContainer);
    
    // Show modal
    setTimeout(() => {
        modalContainer.style.opacity = '1';
    }, 10);
    
    // Handle close button
    const closeBtn = modalContainer.querySelector('.auth-modal-close');
    closeBtn.addEventListener('click', () => {
        modalContainer.style.opacity = '0';
        setTimeout(() => {
            modalContainer.remove();
        }, 300);
    });
    
    // Handle form submission
    const form = modalContainer.querySelector('#forgotPasswordForm');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('resetEmail').value;
        if (!email) {
            showModalError(form, 'Please enter your email address');
            return;
        }
        
        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.textContent = 'Sending...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch('/api/forgot-password', {
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
            form.innerHTML = `
                <div class="success-message">
                    <p>Password reset email sent. Please check your inbox.</p>
                    <button type="button" class="btn btn-primary close-modal-btn">Close</button>
                </div>
            `;
            
            // Handle close button
            const closeModalBtn = form.querySelector('.close-modal-btn');
            closeModalBtn.addEventListener('click', () => {
                modalContainer.style.opacity = '0';
                setTimeout(() => {
                    modalContainer.remove();
                }, 300);
            });

        } catch (error) {
            showModalError(form, error.message || 'Failed to send reset email. Please try again.');
            
            // Reset UI state
            submitBtn.textContent = 'Send Reset Link';
            submitBtn.disabled = false;
        }
    });
}

// Show error message in modal
function showModalError(form, message) {
    // Remove existing error message
    const existingError = form.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    // Create error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    // Add to form
    form.insertBefore(errorDiv, form.firstChild);
    
    // Remove after 5 seconds
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Reset Password
async function handleResetPassword(e) {
    e.preventDefault();
    
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    try {
        const response = await fetch('/api/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ token, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to reset password');
        }

        // Show success message and redirect to login
        alert('Password reset successful. Please login with your new password.');
        window.location.href = '/login';

    } catch (error) {
        showError(error.message || 'Failed to reset password. Please try again.');
    }
}

function handleAuthSuccess(userData) {
    if (!userData.token) {
        showError('Invalid response from server');
        return;
    }

    currentUser = userData;
    localStorage.setItem('token', userData.token);
    
    // Show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = 'Login successful! Redirecting...';
    
    const form = document.querySelector('form');
    form.insertBefore(successDiv, form.firstChild);
    
    // Redirect after a short delay
    setTimeout(() => {
        window.location.href = '/dashboard';
    }, 1000);
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const form = document.querySelector('form');
    const existingError = form.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
    
    form.insertBefore(errorDiv, form.firstChild);
    
    // Scroll to error message
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    setTimeout(() => {
        errorDiv.remove();
    }, 5000);
}

// Logout function with prevention of going back
function doLogout() {
    // Clear all stored data
    localStorage.removeItem('token');
    sessionStorage.clear();
    currentUser = null;
    
    // Force redirect to login page
    window.location.replace('/login');
    
    return false;
}

// Make logout available globally
window.logout = doLogout;

// Add event listeners when elements exist
document.addEventListener('DOMContentLoaded', () => {
    const forgotPasswordLink = document.querySelector('.forgot-password');
    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', handleForgotPassword);
    }

    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', handleResetPassword);
    }
});

// Check authentication status on page load
const token = localStorage.getItem('token');
if (token) {
    fetch('/api/auth/verify', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    })
    .then(response => response.json())
    .then(data => {
        currentUser = data;
    })
    .catch(() => {
        localStorage.removeItem('token');
    });
}