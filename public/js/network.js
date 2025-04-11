document.addEventListener('DOMContentLoaded', function() {
    console.log('Network page loaded - initializing');
    
    // Initialize the network page
    initializeNetwork();
    
    // Add logout button handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            doLogout();
        });
    }
});

// Initialize network page
async function initializeNetwork() {
    try {
        // Check if we have a valid token
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No auth token found. Redirecting to login.');
            window.location.href = '/login';
            return;
        }
        
        console.log('Initializing network page with token:', token.substring(0, 10) + '...');
        
        // First, load user profile data
        await loadUserProfile(token);
        
        // Initialize all network sections
        await Promise.all([
            loadNetworkData(),
            loadConnections(),
            loadSuggestions(),
            loadFriendRequests()
        ]);

        // Listen for connection updates from other pages
        window.addEventListener('connectionUpdate', async (event) => {
            console.log('Connection update event received:', event.detail);
            const { userId, action } = event.detail;
            if (action === 'add') {
                await loadConnections(); // Refresh the connections list
                await loadSuggestions(); // Also refresh suggestions
            }
        });
        
        console.log('Network page initialization complete');
    } catch (error) {
        console.error('Error initializing network page:', error);
        showErrorMessage('An error occurred while loading the network page. Please try refreshing.');
    }
}

// Load user profile data
async function loadUserProfile(token) {
    try {
        console.log('Loading user profile data');
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`Failed to load profile: ${response.status}`);
        }
        
        const userData = await response.json();
        console.log('User profile loaded:', userData.firstname);
        
        // Store user data for reference
        localStorage.setItem('currentUser', JSON.stringify(userData));
        
        return userData;
    } catch (error) {
        console.error('Error loading user profile:', error);
        throw error;
    }
}

async function loadNetworkData() {
    try {
        const response = await fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch profile data');
        }

        const userData = await response.json();
        document.getElementById('totalConnections').textContent = userData.connections?.length || 0;
        document.getElementById('profileViews').textContent = userData.profileViews || 0;
    } catch (error) {
        console.error('Error loading network data:', error);
        showErrorMessage('Failed to load network data');
    }
}

async function loadConnections() {
    try {
        const response = await fetch('/api/connections', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch connections');
        }

        const connections = await response.json();
        const connectionsList = document.getElementById('connectionsList');
        
        if (!connectionsList) {
            console.error('connectionsList element not found');
            return;
        }

        connectionsList.innerHTML = '';

        if (connections.length === 0) {
            connectionsList.innerHTML = '<p class="no-connections">No connections yet</p>';
            return;
        }

        connections.forEach(connection => {
            const connectionCard = createConnectionCard(connection);
            connectionsList.appendChild(connectionCard);
        });

        // Update the total connections count if the element exists
        const totalConnectionsElement = document.getElementById('totalConnections');
        if (totalConnectionsElement) {
            totalConnectionsElement.textContent = connections.length;
        }

    } catch (error) {
        console.error('Error loading connections:', error);
        showErrorMessage('Failed to load connections');
    }
}

async function loadFriendRequests() {
    try {
        console.log('Loading friend requests...');
        
        // Check if element exists first
        const requestsList = document.getElementById('friendRequestsList');
        if (!requestsList) {
            console.log('Friend requests section not found in this page - skipping');
            return; // Exit early if the element doesn't exist
        }
        
        // Add loading indicator
        requestsList.innerHTML = '<div class="loading-indicator">Loading requests...</div>';
        
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No authentication token found for friend requests');
            return;
        }
        
        const response = await fetch('/api/friends/requests', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        // Remove loading indicator
        const loadingIndicator = requestsList.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }

        // If the API endpoint doesn't exist or returns an error, handle it gracefully
        if (!response.ok) {
            console.warn('Friend requests API not available:', response.status);
            requestsList.innerHTML = '<p class="no-requests">No pending friend requests</p>';
            return;
        }

        const requests = await response.json();
        console.log(`Loaded ${requests.length} friend requests`);
        
        requestsList.innerHTML = '';

        if (!Array.isArray(requests) || requests.length === 0) {
            console.log('No friend requests found');
            requestsList.innerHTML = '<p class="no-requests">No pending friend requests</p>';
            return;
        }

        requests.forEach(request => {
            try {
                console.log(`Creating friend request card for: ${request.sender?.firstname || 'unknown'}`);
                const requestCard = createFriendRequestCard(request);
                requestsList.appendChild(requestCard);
            } catch (err) {
                console.error('Error creating friend request card:', err, request);
            }
        });

        // Update friend requests badge
        const badge = document.getElementById('friendRequestsBadge');
        if (badge) {
            badge.textContent = requests.length;
            badge.style.display = requests.length > 0 ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Error loading friend requests:', error);
        
        // Handle error in UI
        const requestsList = document.getElementById('friendRequestsList');
        if (requestsList) {
            requestsList.innerHTML = '<p class="error-message">Failed to load friend requests. Please try refreshing.</p>';
        }
    }
}

function createConnectionCard(connection) {
    const card = document.createElement('div');
    card.className = 'connection-card';
    card.innerHTML = `
        <img src="${connection.profilePicture?.url || '/images/default-profile.png'}" alt="${connection.firstname}" class="connection-avatar">
        <div class="connection-info">
            <h3>${connection.firstname} ${connection.lastname}</h3>
            <p>${connection.userType === 'student' ? 
                `Student at ${connection.collegeName}` : 
                `${connection.designation || 'Working'} at ${connection.companyname || 'Company'}`}</p>
        </div>
        <div class="connection-actions">
            <button class="message-btn">Message</button>
            <button class="unfriend-btn" data-user-id="${connection._id}">Remove</button>
        </div>
    `;
    
    // Add click event to view profile
    const avatar = card.querySelector('.connection-avatar');
    const info = card.querySelector('.connection-info');
    
    [avatar, info].forEach(element => {
        if (element) {
            element.style.cursor = 'pointer';
            element.addEventListener('click', function(e) {
                e.stopPropagation();
                window.location.href = `/profile?userId=${connection._id}`;
            });
        }
    });
    
    // Add unfriend functionality
    const unfriendBtn = card.querySelector('.unfriend-btn');
    if (unfriendBtn) {
        unfriendBtn.addEventListener('click', function() {
            unfriend(connection._id);
        });
    }
    
    return card;
}

function createFriendRequestCard(request) {
    const card = document.createElement('div');
    card.className = 'connection-card request-card';
    card.innerHTML = `
        <img src="${request.sender.profilePicture?.url || '/images/default-profile.png'}" alt="${request.sender.firstname}" class="connection-avatar">
        <div class="connection-info">
            <h3>${request.sender.firstname} ${request.sender.lastname}</h3>
            <p>${request.sender.userType === 'student' ? 
                `Student at ${request.sender.collegeName}` : 
                `${request.sender.designation || 'Working'} at ${request.sender.companyname || 'Company'}`}</p>
            <span class="request-time">${timeAgo(new Date(request.createdAt))}</span>
        </div>
        <div class="connection-actions">
            <button class="accept-btn" data-request-id="${request._id}">Accept</button>
            <button class="reject-btn" data-request-id="${request._id}">Reject</button>
        </div>
    `;
    
    // Add click event to view profile
    const avatar = card.querySelector('.connection-avatar');
    const info = card.querySelector('.connection-info');
    
    [avatar, info].forEach(element => {
        if (element) {
            element.style.cursor = 'pointer';
            element.addEventListener('click', function(e) {
                e.stopPropagation();
                window.location.href = `/profile?userId=${request.sender._id}`;
            });
        }
    });
    
    // Add accept functionality
    const acceptBtn = card.querySelector('.accept-btn');
    const rejectBtn = card.querySelector('.reject-btn');
    
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function() {
            acceptFriendRequest(request._id);
        });
    }
    
    if (rejectBtn) {
        rejectBtn.addEventListener('click', function() {
            rejectFriendRequest(request._id);
        });
    }
    
    return card;
}

async function unfriend(userId) {
    if (!confirm('Are you sure you want to remove this connection?')) {
        return;
    }

    try {
        const response = await fetch(`/api/connections/${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to remove connection');
        }

        await loadConnections();
        showSuccessMessage('Connection removed successfully');
    } catch (error) {
        console.error('Error removing connection:', error);
        showErrorMessage('Failed to remove connection');
    }
}

// Helper functions
function getCurrentUserId() {
    try {
        // First try to get from localStorage currentUser
        const currentUserJson = localStorage.getItem('currentUser');
        if (currentUserJson) {
            const currentUser = JSON.parse(currentUserJson);
            if (currentUser && currentUser._id) {
                return currentUser._id;
            }
        }

        // If not available, try to decode from token
        const token = localStorage.getItem('token');
        if (!token) return null;
        
        // Decode JWT to get user ID
        const base64Url = token.split('.')[1];
        if (!base64Url) return null;
        
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        
        const decoded = JSON.parse(jsonPayload);
        return decoded.userId;
    } catch (e) {
        console.error('Error getting current user ID:', e);
        return null;
    }
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + ' years ago';
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + ' months ago';
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + ' days ago';
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + ' hours ago';
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + ' minutes ago';
    
    return Math.floor(seconds) + ' seconds ago';
}

function showSuccessMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'success-message';
    messageElement.textContent = message;
    document.body.appendChild(messageElement);
    setTimeout(() => messageElement.remove(), 3000);
}

function showErrorMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'error-message';
    messageElement.textContent = message;
    document.body.appendChild(messageElement);
    setTimeout(() => messageElement.remove(), 3000);
}

function updateUserStatus(userId, status) {
    const statusIndicator = document.querySelector(`[data-user-id="${userId}"] .status-indicator`);
    if (statusIndicator) {
        statusIndicator.className = `status-indicator ${status}`;
    }
}

// Logout function
function doLogout() {
    // Clear all stored data
    localStorage.removeItem('token');
    sessionStorage.clear();
    
    // Force redirect to login page
    window.location.replace('/login');
    
    return false;
}

// Make logout available globally
window.logout = doLogout;

// Add the missing loadSuggestions function
async function loadSuggestions() {
    try {
        console.log('Loading suggestions...');
        
        // Check for token first
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No authentication token found for suggestions');
            showErrorMessage('You must be logged in to view suggestions');
            return;
        }

        // Add loading indicator
        const suggestionsList = document.getElementById('suggestionsList');
        if (!suggestionsList) {
            console.error('suggestionsList element not found');
            return;
        }
        suggestionsList.innerHTML = '<div class="loading-indicator">Loading suggestions...</div>';
        
        console.log('Sending suggestion request with token:', token.substring(0, 10) + '...');
        const response = await fetch('/api/users/suggestions', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Suggestions response status:', response.status);
        if (!response.ok) {
            throw new Error(`Failed to fetch connection suggestions: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Suggestions response data:', data);
        
        const suggestions = data.users || data; // Handle both response formats
        const currentConnections = data.connections || []; // Get current connections if available
        
        suggestionsList.innerHTML = '';

        // Check if suggestions is properly received as an array
        if (!Array.isArray(suggestions)) {
            console.error('Suggestions is not an array:', suggestions);
            suggestionsList.innerHTML = '<p class="no-suggestions">Error loading suggestions. Please try again.</p>';
            return;
        }

        if (suggestions.length === 0) {
            console.log('No suggestions returned from API');
            suggestionsList.innerHTML = '<p class="no-suggestions">No suggestions at this time</p>';
            return;
        }

        console.log(`Processing ${suggestions.length} suggestions`);
        suggestions.forEach(user => {
            try {
                // Make sure user has an ID
                if (!user || !user._id) {
                    console.error('Invalid user object in suggestions:', user);
                    return;
                }
                
                // Check if this user is already connected
                const isConnected = currentConnections.includes(user._id) || 
                                  (user.isConnected === true) || 
                                  (Array.isArray(user.connections) && user.connections.includes(getCurrentUserId()));
                
                console.log(`Creating suggestion card for user: ${user.firstname} (${user._id})`);
                const suggestionCard = createSuggestionCard(user, isConnected);
                suggestionsList.appendChild(suggestionCard);
            } catch (error) {
                console.error('Error processing suggestion user:', error, user);
            }
        });
        
        console.log(`Loaded ${suggestions.length} suggestions`);
    } catch (error) {
        console.error('Error loading suggestions:', error);
        
        const suggestionsList = document.getElementById('suggestionsList');
        if (suggestionsList) {
            suggestionsList.innerHTML = '<p class="error-message">Failed to load connection suggestions. Please try refreshing the page.</p>';
        }
        
        showErrorMessage('Failed to load connection suggestions');
    }
}

// Create a card for each suggested connection
function createSuggestionCard(user, isConnected = false) {
    const div = document.createElement('div');
    div.className = 'suggestion-card';
    div.setAttribute('data-user-id', user._id);
    
    // Create the inner HTML based on connection status
    let buttonHTML;
    if (isConnected) {
        buttonHTML = `<button class="connect-btn connected" disabled>Connected</button>`;
    } else {
        buttonHTML = `<button class="connect-btn" data-user-id="${user._id}">Add Connection</button>`;
    }
    
    div.innerHTML = `
        <img src="${user.profilePicture?.url || '/images/default-profile.png'}" alt="${user.firstname}" class="suggestion-avatar">
        <div class="suggestion-info">
            <h3>${user.firstname} ${user.lastname}</h3>
            <p>${user.userType === 'student' ? 
                `Student at ${user.collegeName}` : 
                `${user.designation || 'Working'} at ${user.companyname || 'Company'}`}</p>
        </div>
        ${buttonHTML}
    `;
    
    // Add click event to view profile
    const avatar = div.querySelector('.suggestion-avatar');
    const info = div.querySelector('.suggestion-info');
    
    [avatar, info].forEach(element => {
        if (element) {
            element.style.cursor = 'pointer';
            element.addEventListener('click', function(e) {
                e.stopPropagation();
                window.location.href = `/profile?userId=${user._id}`;
            });
        }
    });
    
    // Add event listener to the connect button only if not already connected
    if (!isConnected) {
        const connectBtn = div.querySelector('.connect-btn');
        if (connectBtn) {
            connectBtn.addEventListener('click', function() {
                connectWith(user._id);
            });
        }
    }
    
    return div;
}

// Make the connectWith function available globally
window.connectWith = async function(userId) {
    try {
        if (!userId) {
            console.error('Error: No user ID provided to connectWith function');
            showErrorMessage('Failed to connect: Missing user information');
            return;
        }
        
        console.log('Adding to connections:', userId);
        
        // Show visual feedback that request is being processed
        const connectButtons = document.querySelectorAll(`.connect-btn[data-user-id="${userId}"]`);
        connectButtons.forEach(btn => {
            btn.textContent = 'Adding...';
            btn.disabled = true;
        });
        
        const token = localStorage.getItem('token');
        if (!token) {
            console.error('No authentication token found');
            showErrorMessage('You must be logged in to add connections');
            return;
        }
        
        const response = await fetch('/api/connections/connect', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ userId: userId })
        });

        console.log('Connect response status:', response.status);
        
        // Process the response
        if (response.status === 200 || response.status === 201) {
            const data = await response.json();
            console.log('Connection response:', data);
            
            // Update button UI immediately for all instances of this user
            connectButtons.forEach(btn => {
                btn.textContent = 'Connected';
                btn.disabled = true;
                btn.classList.add('connected');
            });
            
            // For network page - find and update the card to show Connected
            const suggestionCard = document.querySelector(`.suggestion-card[data-user-id="${userId}"]`);
            if (suggestionCard) {
                suggestionCard.remove(); // Remove from suggestions list
            }
            
            // Reload connections to see the new connection
            await loadConnections();
            
            // Update connections count
            const connectionsCount = document.getElementById('totalConnections');
            if (connectionsCount) {
                const currentCount = parseInt(connectionsCount.textContent) || 0;
                connectionsCount.textContent = currentCount + 1;
            }
            
            // Refresh suggestions list after a short delay
            setTimeout(() => {
                loadSuggestions();
            }, 300);
            
            // Broadcast a custom event for connection update
            const connectionUpdateEvent = new CustomEvent('connectionUpdate', {
                detail: { userId, action: 'add' }
            });
            window.dispatchEvent(connectionUpdateEvent);
            
            // Also notify dashboard.js if it exists
            if (window.updateDashboardConnections) {
                window.updateDashboardConnections();
            }
            
            showSuccessMessage('Added to your connections!');
            return;
        }
        
        // Handle error cases
        let errorMessage = 'Failed to add connection';
        try {
            const errorData = await response.json();
            console.error('Connect error response:', errorData);
            errorMessage = errorData.error || errorMessage;
        } catch (e) {
            console.error('Failed to parse error response:', e);
        }
        
        throw new Error(errorMessage);
    } catch (error) {
        console.error('Error connecting with user:', error);
        showErrorMessage(error.message || 'Failed to add connection. Please try again.');
        
        // Reset buttons
        const connectButtons = document.querySelectorAll(`.connect-btn[data-user-id="${userId}"]`);
        connectButtons.forEach(btn => {
            btn.textContent = 'Add Connection';
            btn.disabled = false;
        });
    }
};

// Make the refresh function available globally
window.refreshNetworkConnections = async function() {
    await loadConnections();
};