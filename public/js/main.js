// Initialize Socket.io connection
const socket = io();

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements - Only get elements if they exist on the page
    const loginBtn = document.querySelector('.btn-secondary');
    const signupBtn = document.querySelector('.btn-primary');
    const networkLink = document.getElementById('networkLink');
    const eventsLink = document.getElementById('eventsLink');
    const authModal = document.getElementById('authModal');
    const closeBtn = document.querySelector('.close');

    // Event Listeners - Only add if elements exist
    if (loginBtn) {
        loginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/login';
        });
    }

    if (signupBtn) {
        signupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = '/signup';
        });
    }

    if (closeBtn && authModal) {
        closeBtn.addEventListener('click', () => {
            authModal.style.display = 'none';
        });

        window.addEventListener('click', (e) => {
            if (e.target === authModal) {
                authModal.style.display = 'none';
            }
        });
    }

    // Tab Switching - Only initialize if elements exist
    const tabBtns = document.querySelectorAll('.tab-btn');
    if (tabBtns.length > 0) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                switchTab(tab);
            });
        });
    }

    // Functions
    function showModal(tab = 'login') {
        if (authModal) {
            authModal.style.display = 'block';
            switchTab(tab);
        }
    }

    function switchTab(tab) {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');

        // Only proceed if necessary elements exist
        if (!tabBtns.length || !loginForm || !signupForm) return;

        // Update tab buttons
        tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update form visibility
        loginForm.classList.toggle('active', tab === 'login');
        signupForm.classList.toggle('active', tab === 'signup');
    }
});

// Socket.io event handlers
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('private-message', (data) => {
    console.log('Received private message:', data);
    // Handle incoming messages
});