document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    let currentUser = null;
    let allConnections = []; // Store connections for email recipients

    // Add logout button event listener
    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        doLogout();
    });

    // Initialize email form functionality
    initializeForm();
    
    // Fetch user data and load connections
    initializeData();

    // Initialize form event handlers
    function initializeForm() {
        const connectionFilter = document.getElementById('connectionFilter');
        const connectionsList = document.getElementById('connectionsList');
        const sendMailBtn = document.getElementById('sendMailBtn');

        // Show connection list when filter is focused
        connectionFilter.addEventListener('focus', () => {
            connectionsList.style.display = 'block';
        });

        // Hide connection list when clicking outside
        document.addEventListener('click', (e) => {
            if (!connectionFilter.contains(e.target) && !connectionsList.contains(e.target)) {
                connectionsList.style.display = 'none';
            }
        });

        // Filter connections
        connectionFilter.addEventListener('input', () => {
            const filterValue = connectionFilter.value.toLowerCase();
            const connectionItems = connectionsList.querySelectorAll('.connection-item');
            
            connectionItems.forEach(item => {
                const name = item.querySelector('.connection-name').textContent.toLowerCase();
                if (name.includes(filterValue)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });

        // Send mail button
        sendMailBtn.addEventListener('click', sendEmail);
    }

    // Load user data and connections
    async function initializeData() {
        try {
            // Get current user data
            const userResponse = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!userResponse.ok) {
                throw new Error('Failed to fetch user data');
            }

            currentUser = await userResponse.json();
            
            // Load user connections
            await loadUserConnections();
        } catch (error) {
            console.error('Initialization error:', error);
            showError('Failed to load user data. Please refresh the page.');
        }
    }

    // Load user connections
    async function loadUserConnections() {
        try {
            const response = await fetch('/api/connections', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch connections');
            }

            allConnections = await response.json();
            populateConnectionsList();
        } catch (error) {
            console.error('Error loading connections:', error);
            showError('Failed to load connections');
        }
    }

    // Populate connections list in the dropdown
    function populateConnectionsList() {
        const connectionsList = document.getElementById('connectionsList');
        connectionsList.innerHTML = '';

        if (allConnections.length === 0) {
            connectionsList.innerHTML = '<div class="no-connections">No connections found</div>';
            return;
        }

        allConnections.forEach(connection => {
            const connectionItem = document.createElement('div');
            connectionItem.className = 'connection-item';
            connectionItem.dataset.userId = connection._id;
            connectionItem.dataset.email = connection.email;
            connectionItem.innerHTML = `
                <img src="${connection.profilePicture?.url || 'https://placehold.co/35'}" alt="${connection.firstname}">
                <span class="connection-name">${connection.firstname} ${connection.lastname}</span>
            `;

            connectionItem.addEventListener('click', () => {
                addSelectedConnection(connection);
                document.getElementById('connectionFilter').value = '';
            });

            connectionsList.appendChild(connectionItem);
        });
    }

    // Add a connection to the selected list
    function addSelectedConnection(connection) {
        const selectedConnections = document.getElementById('selectedConnections');
        
        // Check if already selected
        if (selectedConnections.querySelector(`[data-user-id="${connection._id}"]`)) {
            return;
        }

        const tag = document.createElement('div');
        tag.className = 'selected-connection-tag';
        tag.dataset.userId = connection._id;
        tag.innerHTML = `
            <span>${connection.firstname} ${connection.lastname}</span>
            <span class="remove-connection">&times;</span>
        `;

        tag.querySelector('.remove-connection').addEventListener('click', () => {
            tag.remove();
        });

        selectedConnections.appendChild(tag);
    }

    // Send email to selected connections
    async function sendEmail() {
        const subject = document.getElementById('emailSubject').value.trim();
        const message = document.getElementById('emailMessage').value.trim();
        const selectedIds = Array.from(document.querySelectorAll('.selected-connection-tag'))
            .map(tag => tag.dataset.userId);

        // Validate form
        if (!subject) {
            showError('Please enter an email subject');
            return;
        }

        if (!message) {
            showError('Please enter an email message');
            return;
        }

        if (selectedIds.length === 0) {
            showError('Please select at least one recipient');
            return;
        }

        // Disable button and show loading state
        const sendBtn = document.getElementById('sendMailBtn');
        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        try {
            const response = await fetch('/api/email/send', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipients: selectedIds,
                    subject,
                    message
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to send email');
            }

            const result = await response.json();
            
            // Show success message
            showSuccess(`Email sent successfully to ${selectedIds.length} recipient(s)`);
            
            // Clear form
            document.getElementById('emailSubject').value = '';
            document.getElementById('emailMessage').value = '';
            document.getElementById('selectedConnections').innerHTML = '';
            
        } catch (error) {
            showError(error.message || 'Error sending email');
            console.error('Email sending error:', error);
        } finally {
            // Reset button state
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Email';
        }
    }

    // Show error message
    function showError(message) {
        const statusEl = document.getElementById('statusMessage');
        statusEl.textContent = message;
        statusEl.className = 'status-message error';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }

    // Show success message
    function showSuccess(message) {
        const statusEl = document.getElementById('statusMessage');
        statusEl.textContent = message;
        statusEl.className = 'status-message success';
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }

    // Logout function
    function doLogout() {
        localStorage.removeItem('token');
        window.location.href = '/login';
    }
}); 