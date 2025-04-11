document.addEventListener('DOMContentLoaded', () => {
    // Get auth token from both localStorage and cookies for redundancy
    let token = localStorage.getItem('token');
    
    // Try to get from cookie if not in localStorage
    if (!token) {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'token') {
                token = value;
                // Store in localStorage for future use
                localStorage.setItem('token', token);
                break;
            }
        }
    }
    
    console.log('Dashboard loaded, token present:', !!token);
    
    // If still no token, redirect to login
    if (!token) {
        console.error('No auth token found. Redirecting to login page.');
        window.location.href = '/login';
        return;
    }

    // Initialize Socket.io using local server path 
    let socket;
    try {
        socket = io({
            auth: { token },
            transports: ['websocket', 'polling']
        });
        
        socket.on('connect', () => {
            console.log('Connected to Socket.IO server');
        });
        
        socket.on('connect_error', (error) => {
            console.log('Socket.IO connection error:', error);
        });
    } catch (e) {
        console.error('Failed to initialize Socket.IO:', e);
        // Continue without socket functionality
    }
    
    let currentUser = null;
    
    // Pagination settings
    const paginationSettings = {
        recentJoins: {
            page: 1,
            limit: 5,
            hasMore: true,
            loading: false
        },
        suggestions: {
            page: 1,
            limit: 5,
            hasMore: true,
            loading: false
        },
        posts: {
            page: 1,
            limit: 5,
            hasMore: true,
            loading: false
        }
    };

    // Initialize dashboard components
    initializeDashboard();

    // Add logout button event listener
    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        doLogout();
    });

    // Make sure search form is properly initialized
    initializeSearchForm();
    
    // Make connectWithUser available globally
    window.connectWithUser = connectWithUser;
    window.handleSearch = handleSearch;
    
    // Function for network page to call when connection is added
    window.updateDashboardConnections = function() {
        console.log("Dashboard connections update requested");
        // Update the connections count
        fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        })
        .then(response => response.json())
        .then(userData => {
            // Update connections count
            const connectionsCountElement = document.getElementById('connectionsCount');
            if (connectionsCountElement) {
                connectionsCountElement.textContent = userData.connections?.length || 0;
            }
            
            // Refresh suggestions
            loadConnectionSuggestions(localStorage.getItem('token'), true);
        })
        .catch(error => {
            console.error("Error updating dashboard connections", error);
        });
    };

    // Also listen for connection update events
    window.addEventListener('connectionUpdate', async (event) => {
        console.log("Dashboard received connection update event");
        window.updateDashboardConnections();
    });

    // Fetch user data and update dashboard
    async function initializeDashboard() {
        try {
            console.log('Initializing dashboard, fetching profile data...');
            const response = await fetch('/api/user/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                if (response.status === 401 || response.status === 403) {
                    // Token is invalid or expired
                    console.error('Auth token is invalid. Redirecting to login.');
                    localStorage.removeItem('token');
                    window.location.href = '/login';
                    return;
                }
                throw new Error('Failed to fetch user data');
            }

            const userData = await response.json();
            console.log('User data loaded successfully');
            
            // Check if user was converted from student to alumni
            if (userData.wasConverted) {
                showConversionNotification(userData);
            }
            
            updateDashboard(userData);
            loadRecentJoins(token, true);
            loadConnectionSuggestions(token, true);
            loadPosts(token, true);
            
            // Set up post creation functionality
            setupPostCreation(userData);
        } catch (error) {
            console.error('Dashboard initialization error:', error);
            showError('Error loading dashboard. Please try refreshing the page.');
        }
    }

    function updateDashboard(user) {
        // Update user info in sidebar
        document.getElementById('userName').textContent = `${user.firstname} ${user.lastname}`;
        document.getElementById('userTitle').textContent = user.userType === 'student' ? 
            `Student at ${user.collegeName}` : 
            `${user.designation || 'Working'} at ${user.companyname || 'Company'}`;
        document.getElementById('userAvatar').src = user.profilePicture?.url || '/images/default-profile.png';
        
        // Update welcome message
        document.getElementById('welcomeName').textContent = user.firstname;
        
        // Also update post avatar
        const postUserAvatar = document.getElementById('postUserAvatar');
        if (postUserAvatar) {
            postUserAvatar.src = user.profilePicture?.url || '/images/default-profile.png';
        }
        
        // Update stats
        document.getElementById('connectionsCount').textContent = user.connections?.length || 0;
        document.getElementById('viewsCount').textContent = user.profileViews || 0;
    }

    async function loadRecentJoins(token, isReset = false) {
        try {
            // If already loading or no more results, return
            if (paginationSettings.recentJoins.loading || 
                (!paginationSettings.recentJoins.hasMore && !isReset)) {
                return;
            }
            
            // Reset pagination if requested
            if (isReset) {
                paginationSettings.recentJoins.page = 1;
                paginationSettings.recentJoins.hasMore = true;
            }
            
            // Set loading state
            paginationSettings.recentJoins.loading = true;
            
            // Add loading indicator if loading more (not initial load)
            const recentJoinsContainer = document.getElementById('recentJoins');
            if (!recentJoinsContainer) {
                console.error('Recent joins container not found!');
                return;
            }
            
            if (!isReset) {
                const loadingEl = document.createElement('div');
                loadingEl.className = 'loading-indicator';
                loadingEl.textContent = 'Loading...';
                recentJoinsContainer.appendChild(loadingEl);
            } else {
                recentJoinsContainer.innerHTML = '<div class="loading-indicator">Loading...</div>';
            }

            // Build URL with pagination parameters
            const url = `/api/users/recent?page=${paginationSettings.recentJoins.page}&limit=${paginationSettings.recentJoins.limit}`;
            console.log(`Loading recent joins from: ${url}`);
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch recent joins');
            }

            // Remove loading indicator
            const loadingIndicator = recentJoinsContainer.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            // Clear container if this is a reset
            if (isReset) {
            recentJoinsContainer.innerHTML = '';
            } else {
                // Remove any existing "View More" button
                const existingViewMoreBtn = recentJoinsContainer.querySelector('.view-more-btn');
                if (existingViewMoreBtn) {
                    existingViewMoreBtn.remove();
                }
            }

            const recentUsers = await response.json();
            console.log(`Loaded ${recentUsers.length} recent users of ${paginationSettings.recentJoins.limit} limit`);
            
            if (recentUsers.length === 0 && isReset) {
                recentJoinsContainer.innerHTML = '<p class="no-data">No recent joins to display</p>';
                paginationSettings.recentJoins.hasMore = false;
                return;
            }
            
            // If fewer results than limit, we've reached the end
            if (recentUsers.length < paginationSettings.recentJoins.limit) {
                paginationSettings.recentJoins.hasMore = false;
                console.log('No more recent users to load');
            } else {
                console.log('More recent users available');
                paginationSettings.recentJoins.hasMore = true;
            }

            recentUsers.forEach(user => {
                const userElement = createUserElement(user);
                recentJoinsContainer.appendChild(userElement);
            });
            
            // Always force show "View More" button for testing if we have at least one result
            const forceShowViewMore = recentUsers.length > 0;
            
            // Add "View More" button if there are more results or we're forcing it for testing
            if (paginationSettings.recentJoins.hasMore || forceShowViewMore) {
                const viewMoreBtn = document.createElement('button');
                viewMoreBtn.className = 'view-more-btn';
                viewMoreBtn.id = 'recentJoinsViewMore';
                viewMoreBtn.textContent = 'View More';
                viewMoreBtn.addEventListener('click', () => {
                    // Increment page and load more
                    paginationSettings.recentJoins.page++;
                    loadRecentJoins(token, false);
                });
                recentJoinsContainer.appendChild(viewMoreBtn);
            }
            
            // Reset loading state
            paginationSettings.recentJoins.loading = false;
        } catch (error) {
            console.error('Error loading recent joins:', error);
            paginationSettings.recentJoins.loading = false;
            
            // Remove loading indicator
            const recentJoinsContainer = document.getElementById('recentJoins');
            const loadingIndicator = recentJoinsContainer.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
        }
    }

    async function loadConnectionSuggestions(token, isReset = false) {
        try {
            // If already loading or no more results, return
            if (paginationSettings.suggestions.loading && !isReset) {
                console.log('Suggestions already loading, skipping');
                return;
            }
            
            // Reset pagination if requested
            if (isReset) {
                console.log('Resetting suggestions pagination');
                paginationSettings.suggestions.page = 1;
                paginationSettings.suggestions.hasMore = true;
                
                // Clear the container
                const suggestionsContainer = document.getElementById('connectionSuggestions');
                if (suggestionsContainer) {
                    suggestionsContainer.innerHTML = '<div class="loading-spinner">Loading suggestions...</div>';
                }
            }
            
            // Set loading state
            paginationSettings.suggestions.loading = true;
            
            // Add loading indicator if loading more (not initial load)
            const suggestionsContainer = document.getElementById('connectionSuggestions');
            if (!suggestionsContainer) {
                console.error('Connection suggestions container not found!');
                paginationSettings.suggestions.loading = false;
                return;
            }
            
            if (!isReset) {
                // Remove any existing "View More" button before adding loading indicator
                const existingViewMoreBtn = suggestionsContainer.querySelector('.view-more-btn');
                if (existingViewMoreBtn) {
                    existingViewMoreBtn.remove();
                }
                
                // Add loading indicator
                const loadingEl = document.createElement('div');
                loadingEl.className = 'loading-indicator';
                loadingEl.textContent = 'Loading...';
                suggestionsContainer.appendChild(loadingEl);
            }

            console.log('Fetching connection suggestions...');
            // Build URL with pagination parameters
            const url = `/api/users/suggestions?page=${paginationSettings.suggestions.page}&limit=${paginationSettings.suggestions.limit}`;
            console.log(`Loading suggestions from: ${url}`);
            
            // Make sure token is valid
            if (!token) {
                token = localStorage.getItem('token');
                console.log('Token was empty, using token from localStorage');
                if (!token) {
                    console.error('No token available for suggestions API');
                    throw new Error('Authentication token missing');
                }
            }
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('Suggestions response status:', response.status);

            // Remove loading indicator
            const loadingIndicator = suggestionsContainer.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            // Clear container if this is a reset
            if (isReset) {
                suggestionsContainer.innerHTML = '';
            }

            if (!response.ok) {
                console.error(`Suggestions API error: ${response.status} ${response.statusText}`);
                throw new Error(`Failed to fetch suggestions: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Suggestions API response:', data);
            
            // Handle case where the API returns an empty response or null
            if (!data) {
                console.warn('Received empty response from suggestions API');
                suggestionsContainer.innerHTML = `
                    <div class="card mb-3">
                        <div class="card-body text-center">
                            <h5 class="card-title">No Suggestions Available</h5>
                            <p class="card-text">We're currently finding people for you to connect with. Check back soon!</p>
                            <button id="refreshSuggestions" class="btn btn-primary">Refresh Suggestions</button>
                        </div>
                    </div>
                `;
                
                // Add refresh button handler
                const refreshBtn = document.getElementById('refreshSuggestions');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', function() {
                        loadConnectionSuggestions(localStorage.getItem('token'), true);
                    });
                }
                paginationSettings.suggestions.hasMore = false;
                paginationSettings.suggestions.loading = false;
                return;
            }
            
            // Enhanced handling of different response formats
            let suggestions = [];
            let currentConnections = [];
            
            if (Array.isArray(data)) {
                // If data is already an array, use it directly
                suggestions = data;
                console.log('Data is an array with', suggestions.length, 'items');
            } else if (data && typeof data === 'object') {
                console.log('Data is an object with keys:', Object.keys(data));
                // Handle object responses
                if (Array.isArray(data.users)) {
                    suggestions = data.users;
                    console.log('Using data.users array with', suggestions.length, 'items');
                } else if (data.users && typeof data.users === 'object') {
                    // Handle case where data.users is an object instead of array
                    suggestions = Object.values(data.users);
                    console.log('Converted data.users object to array with', suggestions.length, 'items');
                } else if (data.suggestions && Array.isArray(data.suggestions)) {
                    // Handle format { suggestions: [...] }
                    suggestions = data.suggestions;
                    console.log('Using data.suggestions array with', suggestions.length, 'items');
                }
                
                // Get connections if available
                if (Array.isArray(data.connections)) {
                    currentConnections = data.connections;
                    console.log('Current connections array has', currentConnections.length, 'items');
                }
            }
            
            // Final safety check
            if (!Array.isArray(suggestions)) {
                console.error('Failed to extract suggestions array from response:', data);
                suggestions = [];
            }
            
            console.log(`Processing ${suggestions.length} suggestion items`);
            
            if (suggestions.length === 0 && isReset) {
                console.log('No suggestions available');
                suggestionsContainer.innerHTML = `
                    <div class="card mb-3">
                        <div class="card-body text-center">
                            <h5 class="card-title">No Suggestions Available</h5>
                            <p class="card-text">We're currently finding people for you to connect with. Check back soon!</p>
                            <button id="refreshSuggestions" class="btn btn-primary">Refresh Suggestions</button>
                        </div>
                    </div>
                `;
                
                // Add refresh button handler
                const refreshBtn = document.getElementById('refreshSuggestions');
                if (refreshBtn) {
                    refreshBtn.addEventListener('click', function() {
                        loadConnectionSuggestions(localStorage.getItem('token'), true);
                    });
                }
                paginationSettings.suggestions.hasMore = false;
                paginationSettings.suggestions.loading = false;
                return;
            }
            
            // If fewer results than limit, we've reached the end
            paginationSettings.suggestions.hasMore = suggestions.length >= paginationSettings.suggestions.limit;

            suggestions.forEach(user => {
                try {
                    if (!user || !user._id) {
                        console.error('Invalid user object in suggestions:', user);
                        return;
                    }
                    
                    // Check if this user is already connected
                    const isConnected = currentConnections.includes(user._id) || 
                                        (user.isConnected === true) || 
                                        (Array.isArray(user.connections) && user.connections.includes(getCurrentUserId()));
                    
                    console.log('Creating suggestion element for user:', user.firstname, user._id);
                    const suggestionElement = createSuggestionElement(user, isConnected);
                    suggestionsContainer.appendChild(suggestionElement);
                } catch (err) {
                    console.error('Error processing suggestion:', err, user);
                }
            });
            
            // Add "View More" button if there are more results
            if (paginationSettings.suggestions.hasMore) {
                console.log('Adding View More button for suggestions');
                const viewMoreBtn = document.createElement('button');
                viewMoreBtn.className = 'view-more-btn';
                viewMoreBtn.id = 'suggestionsViewMore';
                viewMoreBtn.textContent = 'View More';
                viewMoreBtn.onclick = function() {
                    // Increment page and load more
                    paginationSettings.suggestions.page++;
                    loadConnectionSuggestions(localStorage.getItem('token'), false);
                };
                suggestionsContainer.appendChild(viewMoreBtn);
            }
            
            // Reset loading state
            paginationSettings.suggestions.loading = false;
        } catch (error) {
            console.error('Error loading suggestions:', error);
            paginationSettings.suggestions.loading = false;
            
            // Remove loading indicator
            const suggestionsContainer = document.getElementById('connectionSuggestions');
            if (suggestionsContainer) {
                const loadingIndicator = suggestionsContainer.querySelector('.loading-indicator');
                if (loadingIndicator) {
                    loadingIndicator.remove();
                }
                
                // Add error message
                if (suggestionsContainer.children.length === 0) {
                    suggestionsContainer.innerHTML = `
                        <div class="card mb-3">
                            <div class="card-body text-center">
                                <h5 class="card-title">Error loading suggestions</h5>
                                <p class="card-text">Please try again later</p>
                                <button id="retrySuggestions" class="btn btn-primary">Try Again</button>
                            </div>
                        </div>
                    `;
                    
                    // Add retry button handler
                    const retryBtn = document.getElementById('retrySuggestions');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', function() {
                            loadConnectionSuggestions(localStorage.getItem('token'), true);
                        });
                    }
                }
            }
        }
    }

    function createUserElement(user) {
        const userElement = document.createElement('div');
        userElement.className = 'activity-item';
        userElement.innerHTML = `
            <img src="${user.profilePicture?.url || '/images/default-profile.png'}" alt="${user.firstname}" class="activity-avatar">
            <div class="activity-info">
                <h3>${user.firstname} ${user.lastname}</h3>
                <p>${user.userType === 'student' ? `Student at ${user.collegeName}` : `${user.designation || 'Working'} at ${user.companyname || 'Company'}`}</p>
            </div>
        `;
        
        // Make the entire element clickable to view profile
        userElement.style.cursor = 'pointer';
        userElement.addEventListener('click', function() {
            window.location.href = `/profile?userId=${user._id}`;
        });
        
        return userElement;
    }

    function createSuggestionElement(user, isConnected = false) {
        const suggestionElement = document.createElement('div');
        suggestionElement.className = 'suggestion-item';
        suggestionElement.dataset.userId = user._id;
        
        // Create user info content
        const userInfo = `
            <img src="${user.profilePicture?.url || '/images/default-profile.png'}" alt="${user.firstname}" class="suggestion-avatar">
            <div class="suggestion-info">
                <h3>${user.firstname} ${user.lastname}</h3>
                <p>${user.userType === 'student' ? `Student at ${user.collegeName}` : `${user.designation || 'Working'} at ${user.companyname || 'Company'}`}</p>
            </div>
        `;
        
        // Create connection button based on connection status
        let connectionButton;
        if (isConnected) {
            connectionButton = `<button class="connect-btn connected" disabled>Connected</button>`;
        } else {
            connectionButton = `<button class="connect-btn" data-user-id="${user._id}">Connect</button>`;
        }
        
        // Combine user info and connection button
        suggestionElement.innerHTML = userInfo + connectionButton;
        
        // Make the user info clickable to view profile
        const infoElement = suggestionElement.querySelector('.suggestion-info');
        if (infoElement) {
            infoElement.style.cursor = 'pointer';
            infoElement.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent event from bubbling to parent elements
                window.location.href = `/profile?userId=${user._id}`;
            });
        }
        
        // Make the avatar clickable to view profile
        const avatar = suggestionElement.querySelector('img');
        if (avatar) {
            avatar.style.cursor = 'pointer';
            avatar.addEventListener('click', function(e) {
                e.stopPropagation(); // Prevent event from bubbling to parent elements
                window.location.href = `/profile?userId=${user._id}`;
            });
        }
        
        // Add direct click handler for the connect button
        if (!isConnected) {
            const connectBtn = suggestionElement.querySelector('.connect-btn');
            if (connectBtn) {
                connectBtn.addEventListener('click', function() {
                    connectWithUser(user._id, localStorage.getItem('token'));
                });
            }
        }
        
        return suggestionElement;
    }

    // Connect with a user
    async function connectWithUser(userId, token) {
        try {
            console.log('Connecting with user:', userId);
            
            if (!userId) {
                console.error('No user ID provided to connect with');
                showError('Failed to connect: Missing user information');
                return;
            }
            
            // Show visual feedback immediately
            const connectBtn = document.querySelector(`.connect-btn[data-user-id="${userId}"]`);
            if (connectBtn) {
                console.log('Found connect button, updating UI state');
                connectBtn.textContent = 'Connecting...';
                connectBtn.disabled = true;
            } else {
                console.warn('Connect button not found for user:', userId);
            }
            
            // Ensure valid token
            if (!token) {
                console.log('No token provided, checking localStorage');
                token = localStorage.getItem('token');
                if (!token) {
                    console.error('No authentication token found');
                    showError('You must be logged in to connect with others');
                    resetConnectButton(userId);
                    return;
                }
            }
            
            console.log('Sending connect request to server');
            const response = await fetch('/api/connections/connect', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ userId })
            });

            console.log('Connect response status:', response.status);
            
            if (!response.ok) {
                console.error(`Connect request failed with status: ${response.status}`);
                throw new Error(`Failed to connect: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('Connect successful, response data:', data);
            
            // Update connections count
            const connectionsCountElement = document.getElementById('connectionsCount');
            if (connectionsCountElement) {
                console.log('Updating connections count');
                connectionsCountElement.textContent = 
                    data.connectionsCount || (parseInt(connectionsCountElement.textContent) + 1);
            }
            
            // Show success message
            showMessage('Connected successfully!');
            
            // Find and update ALL connect buttons for this user across the page
            console.log('Updating connect buttons for user', userId);
            updateAllConnectButtons(userId);
            
            // Remove all suggestion items for this user
            removeAllSuggestionItems(userId);
            
            // Refresh suggestions after a delay to allow other UI updates to complete
            setTimeout(() => {
                console.log('Refreshing suggestions list after connection');
                loadConnectionSuggestions(localStorage.getItem('token'), true);
            }, 500);

            // Refresh the network page connections if it exists
            if (window.refreshNetworkConnections) {
                console.log('Refreshing network connections list');
                window.refreshNetworkConnections();
            }

            // Broadcast a custom event for connection update
            console.log('Broadcasting connection update event');
            const connectionUpdateEvent = new CustomEvent('connectionUpdate', {
                detail: { userId, action: 'add' }
            });
            window.dispatchEvent(connectionUpdateEvent);

        } catch (error) {
            console.error('Error connecting with user:', error);
            showError('Failed to connect. Please try again.');
            
            // Reset buttons if there was an error
            resetConnectButton(userId);
        }
    }

    // Helper function to update all connect buttons for a user
    function updateAllConnectButtons(userId) {
        // Find all buttons by data attribute and those with onclick handler
        const connectButtons = document.querySelectorAll(
            `.connect-btn[data-user-id="${userId}"], button[onclick*="${userId}"]`
        );
        
        console.log(`Found ${connectButtons.length} buttons to update for user ${userId}`);
        
        connectButtons.forEach(btn => {
            btn.textContent = 'Connected';
            btn.disabled = true;
            btn.classList.add('connected');
        });
    }

    // Helper function to reset connect buttons after an error
    function resetConnectButton(userId) {
        const connectButtons = document.querySelectorAll(`.connect-btn[data-user-id="${userId}"]`);
        console.log(`Resetting ${connectButtons.length} connect buttons for user ${userId}`);
        
        connectButtons.forEach(btn => {
            btn.textContent = 'Connect';
            btn.disabled = false;
            btn.classList.remove('connected');
        });
    }

    // Helper function to remove all suggestion items for a user
    function removeAllSuggestionItems(userId) {
        // Remove suggestion items from dashboard
        const suggestionItems = document.querySelectorAll(`.suggestion-item[data-user-id="${userId}"]`);
        console.log(`Removing ${suggestionItems.length} suggestion items for user ${userId}`);
        
        suggestionItems.forEach(item => {
            item.remove();
        });

        // Also remove search results for this user
        const searchResults = document.querySelectorAll(`.search-result-item[data-user-id="${userId}"]`);
        console.log(`Removing ${searchResults.length} search results for user ${userId}`);
        
        searchResults.forEach(item => {
            item.remove();
        });
    }

    // Logout user
    function doLogout() {
        localStorage.removeItem('token');
        document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
        window.location.href = '/login';
    }

    // Search functionality
    async function handleSearch(event) {
        event.preventDefault();
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim();
        
        console.log('Handling search with query:', query);
        
        if (!query) {
            console.log('Empty search query, ignoring');
            return;
        }
        
        try {
            console.log('Fetching search results for query:', query);
            
            // Show loading state
            const searchResults = document.getElementById('searchResults');
            if (searchResults) {
                searchResults.innerHTML = '<div class="loading-indicator">Searching...</div>';
            }
            
            const response = await fetch(`/api/users/search?query=${encodeURIComponent(query)}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            console.log('Search response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Search failed with status: ${response.status}`);
            }

            const results = await response.json();
            console.log(`Search returned ${results.length} results`);
            displaySearchResults(results);
        } catch (error) {
            console.error('Search error:', error);
            
            // Show error message in search results
            const searchResults = document.getElementById('searchResults');
            if (searchResults) {
                searchResults.innerHTML = '<p class="error-data">Error while searching. Please try again.</p>';
            }
            
            showError('Search failed. Please try again.');
        }
    }

    function displaySearchResults(users) {
        console.log('Displaying search results:', users);
        const searchResultsContainer = document.getElementById('searchResults');
        if (!searchResultsContainer) {
            console.error('Search results container not found!');
            return;
        }
        
        searchResultsContainer.innerHTML = '';
        
        if (!users || users.length === 0) {
            console.log('No search results found');
            searchResultsContainer.innerHTML = '<p class="no-results">No users found matching your search.</p>';
            return;
        }
        
        console.log(`Creating ${users.length} search result elements`);
        users.forEach(user => {
            try {
                console.log(`Creating result for user: ${user.firstname} ${user.lastname}`);
                const resultElement = document.createElement('div');
                resultElement.className = 'search-result-item';
                resultElement.dataset.userId = user._id;
                
                resultElement.innerHTML = `
                    <img src="${user.profilePicture?.url || '/images/default-profile.png'}" alt="${user.firstname}" class="result-avatar">
                    <div class="result-info">
                        <h3>${user.firstname} ${user.lastname}</h3>
                        <p>${user.userType === 'student' ? `Student at ${user.collegeName || 'Unknown College'}` : `${user.designation || 'Working'} at ${user.companyname || 'Company'}`}</p>
                    </div>
                    <div class="result-actions">
                        <button class="connect-btn" data-user-id="${user._id}">Connect</button>
                    </div>
                `;
                
                // Make the search result clickable to view profile
                const userInfo = resultElement.querySelector('.result-info');
                if (userInfo) {
                    userInfo.style.cursor = 'pointer';
                    userInfo.addEventListener('click', function(e) {
                        e.stopPropagation();
                        window.location.href = `/profile?userId=${user._id}`;
                    });
                }
                
                // Add explicit click handler for connect button
                const connectBtn = resultElement.querySelector('.connect-btn');
                if (connectBtn) {
                    connectBtn.addEventListener('click', function() {
                        console.log(`Connect button clicked for user: ${user._id}`);
                        connectWithUser(user._id, localStorage.getItem('token'));
                    });
                }
                
                searchResultsContainer.appendChild(resultElement);
            } catch (err) {
                console.error('Error creating search result element:', err);
            }
        });
    }

    // Helper functions for UI messages
    function showMessage(message) {
        const msgElement = document.createElement('div');
        msgElement.className = 'success-message';
        msgElement.textContent = message;
        document.body.appendChild(msgElement);
        setTimeout(() => msgElement.remove(), 3000);
    }
    
    function showError(message) {
        const msgElement = document.createElement('div');
        msgElement.className = 'error-message';
        msgElement.textContent = message;
        document.body.appendChild(msgElement);
        setTimeout(() => msgElement.remove(), 3000);
    }

    // Real-time updates
    socket.on('new-user-joined', (user) => {
        const recentJoinsContainer = document.getElementById('recentJoins');
        const userElement = createUserElement(user);
        recentJoinsContainer.insertBefore(userElement, recentJoinsContainer.firstChild);
    });

    // Add new function to set up post creation
    function setupPostCreation(userData) {
        // Ensure valid token
        const token = ensureValidToken();
        if (!token) return;
        
        console.log('Setting up post creation functionality');
        
        // Set the user's avatar
        const postUserAvatar = document.getElementById('postUserAvatar');
        if (postUserAvatar) {
            postUserAvatar.src = userData.profilePicture?.url || '/images/default-profile.png';
        }
        
        // Set up post type selector
        const postTypeButtons = document.querySelectorAll('.post-type-btn');
        let currentPostType = 'general';
        
        postTypeButtons.forEach(button => {
            button.addEventListener('click', () => {
                // Remove active class from all buttons
                postTypeButtons.forEach(btn => btn.classList.remove('active'));
                
                // Add active class to clicked button
                button.classList.add('active');
                
                // Store the selected post type
                currentPostType = button.getAttribute('data-post-type');
                console.log('Post type changed to:', currentPostType);
                
                // Show/hide relevant form fields based on post type
                togglePostDetailsForm(currentPostType);
            });
        });
        
        // Handle form visibility based on post type
        function togglePostDetailsForm(postType) {
            const jobPostDetails = document.getElementById('jobPostDetails');
            const imageUploadForm = document.getElementById('imageUploadForm');
            
            if (jobPostDetails) jobPostDetails.style.display = postType === 'job' ? 'block' : 'none';
            if (imageUploadForm) imageUploadForm.style.display = postType === 'image' ? 'block' : 'none';
            
            console.log('Form visibility updated for post type:', postType);
        }
        
        // Handle post creation
        const createPostBtn = document.getElementById('createPostBtn');
        if (createPostBtn) {
            console.log('Adding event listener to create post button');
            createPostBtn.addEventListener('click', () => {
                console.log('Create post button clicked');
                createPost(currentPostType);
            });
        } else {
            console.error('Create post button not found!');
        }
        
        // Allow pressing Enter in the post content field to submit
        const postContentInput = document.getElementById('postContent');
        if (postContentInput) {
            console.log('Adding keypress event listener to post content input');
            postContentInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('Enter key pressed in post content input');
                    createPost(currentPostType);
                }
            });
        } else {
            console.error('Post content input not found!');
        }
    }

    // Function to create a new post
    async function createPost(postType) {
        try {
            const token = ensureValidToken();
            if (!token) return;
            
            const contentInput = document.getElementById('postContent');
            const content = contentInput.value.trim();
            
            if (!content) {
                showError('Please enter some content for your post');
                return;
            }
            
            // Show loading state
            const createPostBtn = document.getElementById('createPostBtn');
            createPostBtn.disabled = true;
            createPostBtn.textContent = 'Posting...';
            
            // Get job details if it's a job post
            let jobDetails = null;
            if (postType === 'job') {
                const company = document.getElementById('jobCompany')?.value.trim();
                const position = document.getElementById('jobPosition')?.value.trim();
                const location = document.getElementById('jobLocation')?.value.trim();
                const applyLink = document.getElementById('jobApplyLink')?.value.trim();
                
                // Validate required job fields
                if (!company || !position || !location) {
                    showError('Please fill in all required job details (company, position, and location)');
                    createPostBtn.disabled = false;
                    createPostBtn.textContent = 'Post';
                    return;
                }
                
                jobDetails = {
                    company,
                    position,
                    location,
                    applyLink
                };
            }
            
            // Get image URL if it's an image post
            let imageUrl = null;
            if (postType === 'image') {
                const imageUrlInput = document.getElementById('imageUrl');
                imageUrl = imageUrlInput?.value.trim();
                
                // Validate image URL
                if (!imageUrl) {
                    showError('Please enter an image URL');
                    createPostBtn.disabled = false;
                    createPostBtn.textContent = 'Post';
                    return;
                }
                
                // Basic URL validation
                if (!imageUrl.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i)) {
                    showError('Please enter a valid image URL (ending with .jpg, .png, .gif, etc.)');
                    createPostBtn.disabled = false;
                    createPostBtn.textContent = 'Post';
                    return;
                }
            }
            
            const postData = {
                content,
                postType
            };
            
            // Add job details or image URL if present
            if (jobDetails) {
                postData.jobDetails = jobDetails;
            }
            
            if (imageUrl) {
                postData.imageUrl = imageUrl;
            }
            
            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(postData)
                });

                if (!response.ok) {
                throw new Error('Failed to create post');
            }
            
            const newPost = await response.json();
            
            // Add new post to the UI (prepend to show at top)
            addPostToUI(newPost, true);
            
            // Reset form
            contentInput.value = '';
            
            if (postType === 'job') {
                document.getElementById('jobCompany').value = '';
                document.getElementById('jobPosition').value = '';
                document.getElementById('jobLocation').value = '';
                document.getElementById('jobApplyLink').value = '';
                document.getElementById('jobPostDetails').style.display = 'none';
            }
            
            if (postType === 'image') {
                document.getElementById('imageUrl').value = '';
                document.getElementById('imageUploadForm').style.display = 'none';
            }
            
            // Reset post type selector to 'general'
            const postTypeButtons = document.querySelectorAll('.post-type-btn');
            postTypeButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelector('.post-type-btn[data-post-type="general"]').classList.add('active');
            
            showMessage('Post created successfully');
            } catch (error) {
            console.error('Error creating post:', error);
            showError('Failed to create post. Please try again.');
        } finally {
            // Reset button state
            const createPostBtn = document.getElementById('createPostBtn');
            createPostBtn.disabled = false;
            createPostBtn.textContent = 'Post';
        }
    }

    // Function to load posts
    async function loadPosts(token, isReset = false) {
        try {
            console.log('Loading posts, isReset:', isReset);
            // If already loading or no more results, return
            if (paginationSettings.posts.loading || 
                (!paginationSettings.posts.hasMore && !isReset)) {
                console.log('Skipping post load - already loading or no more posts');
                return;
            }
            
            // Reset pagination if requested
            if (isReset) {
                paginationSettings.posts.page = 1;
                paginationSettings.posts.hasMore = true;
            }
            
            // Set loading state
            paginationSettings.posts.loading = true;
            
            // Add loading indicator if loading more
            const postsContainer = document.getElementById('recentPosts');
            if (!postsContainer) {
                console.error('Posts container not found!');
            return;
        }

            if (!isReset) {
                const loadingEl = document.createElement('div');
                loadingEl.className = 'loading-indicator';
                loadingEl.textContent = 'Loading posts...';
                postsContainer.appendChild(loadingEl);
            } else {
                postsContainer.innerHTML = '<div class="loading-indicator">Loading posts...</div>';
            }

            // Build URL with pagination parameters
            const url = `/api/posts?page=${paginationSettings.posts.page}&limit=${paginationSettings.posts.limit}`;
            console.log(`Loading posts from: ${url}`);
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('Posts API response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.text();
                console.error('Failed to fetch posts:', errorData);
                throw new Error('Failed to fetch posts');
            }

            // Remove loading indicator
            const loadingIndicator = postsContainer.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            // Clear container if this is a reset
            if (isReset) {
                postsContainer.innerHTML = '';
            } else {
                // Remove any existing "View More" button
                const existingViewMoreBtn = postsContainer.querySelector('.view-more-btn');
                if (existingViewMoreBtn) {
                    existingViewMoreBtn.remove();
                }
            }

            const posts = await response.json();
            console.log(`Loaded ${posts.length} posts of ${paginationSettings.posts.limit} limit`);
            
            // Add debugging - log the first post to see its structure
            if (posts.length > 0) {
                console.log('First post structure:', JSON.stringify(posts[0]));
            }
            
            if (posts.length === 0 && isReset) {
                postsContainer.innerHTML = '<p class="no-data">No posts to display. Be the first to post!</p>';
                paginationSettings.posts.hasMore = false;
                return;
            }

            // If fewer results than limit, we've reached the end
            if (posts.length < paginationSettings.posts.limit) {
                paginationSettings.posts.hasMore = false;
                console.log('No more posts to load');
            } else {
                console.log('More posts available');
                paginationSettings.posts.hasMore = true;
            }

            // Try-catch for each post to prevent one bad post from breaking all rendering
            posts.forEach(post => {
                try {
                    console.log('Adding post to UI:', post._id);
                    addPostToUI(post);
                } catch (err) {
                    console.error('Error rendering post:', post._id, err);
                }
            });
            
            // Add "View More" button if there are more results
            if (paginationSettings.posts.hasMore) {
                console.log('Adding View More button to Posts');
                const viewMoreBtn = document.createElement('button');
                viewMoreBtn.className = 'view-more-btn';
                viewMoreBtn.id = 'postsViewMore';
                viewMoreBtn.textContent = 'View More';
                viewMoreBtn.addEventListener('click', () => {
                    console.log('View More clicked for Posts');
                    // Increment page and load more
                    paginationSettings.posts.page++;
                    loadPosts(token, false);
                });
                postsContainer.appendChild(viewMoreBtn);
                console.log('View More button added to posts section');
            }
            
            // Reset loading state
            paginationSettings.posts.loading = false;
        } catch (error) {
            console.error('Error loading posts:', error);
            paginationSettings.posts.loading = false;
            
            // Remove loading indicator
            const postsContainer = document.getElementById('recentPosts');
            const loadingIndicator = postsContainer?.querySelector('.loading-indicator');
            if (loadingIndicator) {
                loadingIndicator.remove();
            }
            
            // Show error message in posts container if empty
            if (isReset && (!postsContainer.children.length || postsContainer.children.length === 0)) {
                postsContainer.innerHTML = '<p class="error-data">Error loading posts. Please refresh to try again.</p>';
            }
        }
    }

    // Function to add a post to the UI
    function addPostToUI(post, prepend = false) {
        const postsContainer = document.getElementById('recentPosts');
        if (!postsContainer) return;
        
        const postElement = createPostElement(post);
        
        if (prepend && postsContainer.firstChild) {
            postsContainer.insertBefore(postElement, postsContainer.firstChild);
        } else {
            postsContainer.appendChild(postElement);
        }
    }

    // Add the missing getTimeAgo function to convert dates to human-readable time
    function getTimeAgo(date) {
        if (!date) return 'Unknown time';
        
        const seconds = Math.floor((new Date() - date) / 1000);
        
        let interval = seconds / 31536000; // Years
        if (interval > 1) {
            return Math.floor(interval) + ' years ago';
        }
        
        interval = seconds / 2592000; // Months
        if (interval > 1) {
            return Math.floor(interval) + ' months ago';
        }
        
        interval = seconds / 86400; // Days
        if (interval > 1) {
            return Math.floor(interval) + ' days ago';
        }
        
        interval = seconds / 3600; // Hours
        if (interval > 1) {
            return Math.floor(interval) + ' hours ago';
        }
        
        interval = seconds / 60; // Minutes
        if (interval > 1) {
            return Math.floor(interval) + ' minutes ago';
        }
        
        if (seconds < 10) return 'just now';
        
        return Math.floor(seconds) + ' seconds ago';
    }

    // Function to create post element
    function createPostElement(post) {
        // Add defensive coding to handle missing post data
        if (!post) {
            console.error('Attempted to create post element with null or undefined post');
            return document.createElement('div');
        }
        
        if (!post.userId) {
            console.error('Post missing userId object:', post._id);
            // Create a placeholder element with error message
            const errorEl = document.createElement('div');
            errorEl.className = 'post-item error';
            errorEl.innerHTML = `<p>Error loading post ${post._id || 'unknown'}</p>`;
            return errorEl;
        }
        
        console.log(`Creating post element for: ${post._id}, by user: ${post.userId._id || 'unknown'}, type: ${post.postType}`);
        
        const postDate = new Date(post.createdAt);
        const timeAgo = getTimeAgo(postDate);
        
        // Get the user's name who created the post - with fallbacks
        const userFirstName = post.userId.firstname || 'Unknown';
        const userLastName = post.userId.lastname || 'User';
        const userDisplayName = `${userFirstName} ${userLastName}`;
        
        // Get the user's title based on user type - with fallbacks
        const userType = post.userId.userType || 'student';
        const userTitle = userType === 'student' 
            ? `Student at ${post.userId.collegeName || 'College'}` 
            : `${post.userId.designation || 'Working'} at ${post.userId.companyname || 'Company'}`;
        
        const postElement = document.createElement('div');
        postElement.className = 'post-item';
        postElement.dataset.postId = post._id;
        postElement.dataset.postType = post.postType || 'general';
        
        // Check if current user is the post creator
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        const isPostCreator = currentUser._id === post.userId._id;
        
        // Safely handle post content
        const postContent = post.content ? escapeHTML(post.content) : 'No content';
        
        // Prepare additional content based on post type
        let additionalContent = '';
        
        // Handle different post types
        if (post.postType === 'job') {
            console.log('Rendering job post with details:', post.jobDetails);
            const company = post.jobDetails?.company || '';
            const position = post.jobDetails?.position || '';
            const location = post.jobDetails?.location || '';
            const applyLink = post.jobDetails?.applyLink || '';
            
            additionalContent = `
                <div class="job-details">
                    <div class="job-header">
                        <span class="job-icon">💼</span>
                        <h4>Job Opportunity</h4>
                    </div>
                    <div class="job-info">
                        ${company ? `<p><strong>Company:</strong> ${escapeHTML(company)}</p>` : ''}
                        ${position ? `<p><strong>Position:</strong> ${escapeHTML(position)}</p>` : ''}
                        ${location ? `<p><strong>Location:</strong> ${escapeHTML(location)}</p>` : ''}
                        ${applyLink ? `<p><strong>Apply:</strong> <a href="${escapeHTML(applyLink)}" target="_blank" class="job-link">${escapeHTML(applyLink)}</a></p>` : ''}
                    </div>
                </div>
            `;
        } else if (post.postType === 'image') {
            console.log('Rendering image post with URL:', post.imageUrl);
            const imageUrl = post.imageUrl || '';
            if (imageUrl) {
                additionalContent = `
                    <div class="image-container">
                        <a href="${escapeHTML(imageUrl)}" target="_blank" class="post-image-link">
                            <img src="${escapeHTML(imageUrl)}" alt="Shared image" class="post-image" onerror="this.onerror=null; this.src='/images/image-error.png'; console.error('Failed to load image:', '${escapeHTML(imageUrl)}');">
                        </a>
                    </div>
                `;
            }
        }
        
        // Basic post structure with user info and post content
        postElement.innerHTML = `
            <div class="post-header">
                <img src="${post.userId.profilePicture?.url || '/images/default-profile.png'}" alt="${userDisplayName}" class="post-avatar">
                <div class="post-user-info">
                    <h3 class="post-user-name">${userDisplayName}</h3>
                    <p class="post-user-title">${userTitle}</p>
                    <span class="post-time">${timeAgo}</span>
                </div>
                ${isPostCreator ? `<button class="delete-post-btn" data-post-id="${post._id}">Delete</button>` : ''}
            </div>
            <div class="post-content">
                <p>${postContent}</p>
                ${additionalContent}
            </div>
            <div class="post-actions">
                <button class="like-post-btn ${post.likes?.includes(currentUser._id) ? 'active' : ''}" data-post-id="${post._id}">
                    <span class="like-icon">👍</span> 
                    <span class="like-count">${post.likes?.length || 0}</span>
                </button>
                <button class="comment-post-btn" data-post-id="${post._id}">
                    <span class="comment-icon">💬</span> 
                    <span class="comment-count">${post.comments?.length || 0}</span>
                </button>
            </div>
            <div class="post-comments" data-post-id="${post._id}" style="display: none;">
                <div class="comments-list">
                    ${renderComments(post.comments || [])}
                </div>
                <div class="comment-form">
                    <input type="text" class="comment-input" placeholder="Write a comment..." data-post-id="${post._id}">
                    <button class="comment-submit-btn" data-post-id="${post._id}">Post</button>
                </div>
            </div>
        `;
        
        // Add event listeners for interactive elements
        setupPostInteractions(postElement, post);
        
        return postElement;
    }

    // Helper function to render comments
    function renderComments(comments) {
        if (!comments || comments.length === 0) {
            return '<p class="no-comments">No comments yet. Be the first to comment!</p>';
        }
        
        return comments.map(comment => {
            const commentDate = new Date(comment.createdAt);
            const timeAgo = getTimeAgo(commentDate);
            const userName = `${comment.userId.firstname} ${comment.userId.lastname}`;
            
            return `
                <div class="comment-item" data-comment-id="${comment._id}">
                    <img src="${comment.userId.profilePicture?.url || '/images/default-profile.png'}" alt="${userName}" class="comment-avatar">
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-username">${userName}</span>
                            <span class="comment-time">${timeAgo}</span>
                        </div>
                        <p class="comment-text">${escapeHTML(comment.content)}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Function to setup all post interactions
    function setupPostInteractions(postElement, post) {
        // Debug logs to ensure post data is correct
        console.log('Setting up interactions for post:', post._id);
        console.log('Post type:', post.postType);
        if (post.postType === 'job') {
            console.log('Job details:', post.jobDetails);
        }
        if (post.postType === 'image') {
            console.log('Image URL:', post.imageUrl);
        }
        
        // Setup like button
        const likeButton = postElement.querySelector('.like-post-btn');
        if (likeButton) {
            likeButton.addEventListener('click', function() {
                console.log('Like button clicked for post:', post._id);
                const postId = this.dataset.postId;
                handleLikePost(postId, this);
            });
        }
        
        // Setup comment button
        const commentButton = postElement.querySelector('.comment-post-btn');
        if (commentButton) {
            commentButton.addEventListener('click', function() {
                const postId = this.dataset.postId;
                const commentsSection = document.querySelector(`.post-comments[data-post-id="${postId}"]`);
                if (commentsSection) {
                    const isVisible = commentsSection.style.display !== 'none';
                    commentsSection.style.display = isVisible ? 'none' : 'block';
                }
            });
        }
        
        // Setup delete button for post owner
        const deleteButton = postElement.querySelector('.delete-post-btn');
        if (deleteButton) {
            deleteButton.addEventListener('click', function() {
                console.log('Delete button clicked for post:', post._id);
                const postId = this.dataset.postId;
                handleDeletePost(postId);
            });
        }
        
        // Setup comment form submission
        const commentForm = postElement.querySelector('.comment-input');
        if (commentForm) {
            commentForm.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const postId = this.dataset.postId;
                    const content = this.value.trim();
                    if (content) {
                        handleAddComment(postId, content, this);
                    }
                }
            });
        }
        
        // Setup comment submit button
        const commentSubmitBtn = postElement.querySelector('.comment-submit-btn');
        if (commentSubmitBtn) {
            commentSubmitBtn.addEventListener('click', function() {
                const postId = this.dataset.postId;
                const input = postElement.querySelector(`.comment-input[data-post-id="${postId}"]`);
                if (input) {
                    const content = input.value.trim();
                    if (content) {
                        handleAddComment(postId, content, input);
                    }
                }
            });
        }
    }

    // Function to handle liking a post
    async function handleLikePost(postId, likeButton) {
        try {
            console.log('Handling like for post:', postId);
            const token = ensureValidToken();
            if (!token) return;
            
            // Disable button temporarily to prevent multiple clicks
            likeButton.disabled = true;
            
            // Get the like count element
            const likeCount = likeButton.querySelector('.like-count');
            if (!likeCount) {
                console.error('Like count element not found');
                return;
            }
            
            // Get current state
            const currentCount = parseInt(likeCount.textContent) || 0;
            const isAlreadyLiked = likeButton.classList.contains('active');
            console.log('Current like count:', currentCount, 'Is already liked:', isAlreadyLiked);
            
            // Update UI optimistically (we'll revert if the server request fails)
            if (isAlreadyLiked) {
                likeButton.classList.remove('active');
                likeCount.textContent = Math.max(0, currentCount - 1);
            } else {
                likeButton.classList.add('active');
                likeCount.textContent = currentCount + 1;
            }
            
            // Make API request
            console.log('Sending like request to server for post:', postId);
            const response = await fetch(`/api/posts/${postId}/like`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log('Like API response status:', response.status);
            if (!response.ok) {
                // Revert UI changes if the request failed
                if (isAlreadyLiked) {
                    likeButton.classList.add('active');
                    likeCount.textContent = currentCount;
                } else {
                    likeButton.classList.remove('active');
                    likeCount.textContent = currentCount;
                }
                throw new Error(`Failed to like post: ${response.status} ${response.statusText}`);
            }
            
            // Process server response
            const result = await response.json();
            console.log('Like API response data:', result);
            
            // Update the like count with actual count from server
            let newCount;
            if (Array.isArray(result.likes)) {
                newCount = result.likes.length;
            } else if (typeof result.likeCount === 'number') {
                newCount = result.likeCount;
            } else {
                console.warn('Server did not return a valid like count:', result);
                // Keep the optimistic update
                return;
            }
            
            console.log('Server returned like count:', newCount);
            likeCount.textContent = newCount;
            
            // Update the active state based on server response
            const shouldBeLiked = result.liked === true;
            if (shouldBeLiked) {
                console.log('Server says post is liked');
                likeButton.classList.add('active');
            } else {
                console.log('Server says post is not liked');
                likeButton.classList.remove('active');
            }
        } catch (error) {
            console.error('Error liking post:', error);
            showError('Failed to like post. Please try again.');
        } finally {
            likeButton.disabled = false;
        }
    }

    // Function to handle post deletion
    async function handleDeletePost(postId) {
        if (!confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
            return;
        }
        
        try {
            console.log('Deleting post:', postId);
            const token = ensureValidToken();
            if (!token) return;
            
            // Show loading state
            const postElement = document.querySelector(`.post-item[data-post-id="${postId}"]`);
            if (postElement) {
                postElement.style.opacity = '0.6';
                postElement.style.pointerEvents = 'none';
                
                // Add deletion indicator
                const deleteIndicator = document.createElement('div');
                deleteIndicator.className = 'delete-indicator';
                deleteIndicator.textContent = 'Deleting...';
                deleteIndicator.style.position = 'absolute';
                deleteIndicator.style.top = '50%';
                deleteIndicator.style.left = '50%';
                deleteIndicator.style.transform = 'translate(-50%, -50%)';
                deleteIndicator.style.background = 'rgba(0,0,0,0.7)';
                deleteIndicator.style.color = 'white';
                deleteIndicator.style.padding = '10px 20px';
                deleteIndicator.style.borderRadius = '4px';
                deleteIndicator.style.zIndex = '10';
                postElement.style.position = 'relative';
                postElement.appendChild(deleteIndicator);
            }
            
            const response = await fetch(`/api/posts/${postId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            console.log('Delete response status:', response.status);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('Server error deleting post:', errorData);
                throw new Error(errorData.error || 'Failed to delete post');
            }
            
            // Remove post from UI with animation
            if (postElement) {
                postElement.style.height = postElement.offsetHeight + 'px';
                postElement.style.transition = 'all 0.3s ease-out';
                
                setTimeout(() => {
                    postElement.style.height = '0';
                    postElement.style.opacity = '0';
                    postElement.style.margin = '0';
                    postElement.style.padding = '0';
                    postElement.style.overflow = 'hidden';
                    
                    setTimeout(() => {
                        postElement.remove();
                        showMessage('Post deleted successfully');
                    }, 300);
                }, 100);
            } else {
                showMessage('Post deleted successfully');
            }
            
        } catch (error) {
            console.error('Error deleting post:', error);
            showError(error.message || 'Failed to delete post. Please try again.');
            
            // Reset the post element if there was an error
            const postElement = document.querySelector(`.post-item[data-post-id="${postId}"]`);
            if (postElement) {
                postElement.style.opacity = '';
                postElement.style.pointerEvents = '';
                const deleteIndicator = postElement.querySelector('.delete-indicator');
                if (deleteIndicator) {
                    deleteIndicator.remove();
                }
            }
        }
    }

    // Function to load comments for a post
    async function loadComments(postId, commentsSection) {
        try {
            const token = ensureValidToken();
            if (!token) return;
            
            const commentsList = commentsSection.querySelector('.comments-list');
            if (!commentsList) return;
            
            // Add loading indicator
            commentsList.innerHTML = '<div class="loading-comments">Loading comments...</div>';
            
            const response = await fetch(`/api/posts/${postId}/comments`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load comments');
            }
            
            const comments = await response.json();
            
            // Update comments list
            commentsList.innerHTML = renderComments(comments);
            
            // Update comment count
            const commentCount = document.querySelector(`.comment-post-btn[data-post-id="${postId}"] .comment-count`);
            if (commentCount) {
                commentCount.textContent = comments.length || '0';
            }
            
        } catch (error) {
            console.error('Error loading comments:', error);
            const commentsList = commentsSection.querySelector('.comments-list');
            if (commentsList) {
                commentsList.innerHTML = '<p class="error-message">Failed to load comments. Please try again.</p>';
            }
        }
    }

    // Function to submit a new comment
    async function submitComment(postId, content, commentsSection) {
        try {
            if (!content || content.trim() === '') {
                console.log('Empty comment - ignoring');
                return;
            }
            
            console.log('Submitting comment for post:', postId);
            const token = ensureValidToken();
            if (!token) return;
            
            const commentInput = commentsSection.querySelector('.comment-input');
            const commentSubmit = commentsSection.querySelector('.comment-submit-btn');
            const commentsList = commentsSection.querySelector('.comments-list');
            
            if (!commentInput || !commentSubmit || !commentsList) {
                console.error('Comment elements not found:', { commentInput, commentSubmit, commentsList });
                return;
            }
            
            // Disable input and button while submitting
            commentInput.disabled = true;
            commentSubmit.disabled = true;
            commentSubmit.textContent = 'Posting...';
            
            // Add optimistic UI update - show the comment immediately
            const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
            const optimisticComment = document.createElement('div');
            optimisticComment.className = 'comment-item comment-pending';
            optimisticComment.innerHTML = `
                <img src="${currentUser.profilePicture?.url || '/images/default-profile.png'}" alt="${currentUser.firstname || 'You'} ${currentUser.lastname || ''}" class="comment-avatar">
                <div class="comment-content">
                    <div class="comment-header">
                        <span class="comment-username">${currentUser.firstname || 'You'} ${currentUser.lastname || ''}</span>
                        <span class="comment-time">Just now</span>
                    </div>
                    <p class="comment-text">${escapeHTML(content.trim())}</p>
                    <span class="comment-pending-indicator">Posting...</span>
                </div>
            `;
            
            // Add no-comments message removal
            const noCommentsMsg = commentsList.querySelector('.no-comments');
            if (noCommentsMsg) {
                noCommentsMsg.remove();
            }
            
            // Add our optimistic comment
            commentsList.appendChild(optimisticComment);
            
            console.log('Sending comment to server for post:', postId);
            const response = await fetch(`/api/posts/${postId}/comments`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content: content.trim() })
            });
            
            console.log('Comment API response status:', response.status);
            if (!response.ok) {
                // Remove the optimistic comment
                optimisticComment.remove();
                throw new Error(`Failed to post comment: ${response.status} ${response.statusText}`);
            }
            
            // Get the response data (should contain the new comment)
            const result = await response.json();
            console.log('Comment API response data:', result);
            
            // Clear input
            commentInput.value = '';
            
            // Update comment count
            const commentCount = document.querySelector(`.comment-post-btn[data-post-id="${postId}"] .comment-count`);
            if (commentCount) {
                const currentCount = parseInt(commentCount.textContent) || 0;
                commentCount.textContent = currentCount + 1;
            }
            
            // Remove the optimistic comment and reload all comments to get proper formatting
            optimisticComment.remove();
            loadComments(postId, commentsSection);
            
        } catch (error) {
            console.error('Error posting comment:', error);
            showError('Failed to post comment. Please try again.');
        } finally {
            // Re-enable input and button
            const commentInput = commentsSection.querySelector('.comment-input');
            const commentSubmit = commentsSection.querySelector('.comment-submit-btn');
            
            if (commentInput) commentInput.disabled = false;
            if (commentSubmit) {
                commentSubmit.disabled = false;
                commentSubmit.textContent = 'Post';
            }
        }
    }

    // Function to ensure we have a valid token for all API calls
    function ensureValidToken() {
        let token = localStorage.getItem('token');
        
        if (!token) {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'token') {
                    token = value;
                    localStorage.setItem('token', token);
                    break;
                }
            }
        }
        
        if (!token) {
            console.error('No token found for API call');
            window.location.href = '/login';
            return null;
        }
        
        return token;
    }

    // Add the missing escapeHTML function to sanitize content
    function escapeHTML(html) {
        if (!html) return '';
        
        return String(html)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Add getCurrentUserId function for the connection checks
    function getCurrentUserId() {
        const token = localStorage.getItem('token');
        if (!token) return null;
        
        try {
            // Decode JWT to get user ID
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));
            
            const decoded = JSON.parse(jsonPayload);
            return decoded.userId;
        } catch (e) {
            console.error('Error decoding token:', e);
            return null;
        }
    }

    function initializeSearchForm() {
        console.log('Initializing search form');
        const searchForm = document.getElementById('searchForm');
        if (searchForm) {
            console.log('Search form found, adding event listener');
            searchForm.addEventListener('submit', function(e) {
                e.preventDefault();
                console.log('Search form submitted');
                handleSearch(e);
            });
        } else {
            console.error('Search form not found!');
        }
        
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            console.log('Search input found, adding event listener');
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    console.log('Enter key pressed in search input');
                    handleSearch(e);
                }
            });
        }
    }

    // Function to handle adding a comment
    async function handleAddComment(postId, content, inputElement) {
        try {
            console.log('Adding comment to post:', postId);
            if (!content || content.trim() === '') {
                console.log('Empty comment - ignoring');
                return;
            }
            
            const token = ensureValidToken();
            if (!token) return;
            
            // Find the comment section
            const postElement = document.querySelector(`.post-item[data-post-id="${postId}"]`);
            if (!postElement) {
                console.error('Post element not found for comment');
                return;
            }
            
            const commentsSection = postElement.querySelector('.post-comments');
            if (!commentsSection) {
                console.error('Comments section not found for post');
                return;
            }
            
            // Show comments section if it's hidden
            commentsSection.style.display = 'block';
            
            // Disable input while submitting
            inputElement.disabled = true;
            
            // Call the submitComment function to handle the actual submission
            await submitComment(postId, content, commentsSection);
            
            // Clear the input
            inputElement.value = '';
        } catch (error) {
            console.error('Error handling comment submission:', error);
            showError('Failed to post comment. Please try again.');
        } finally {
            // Re-enable input
            if (inputElement) {
                inputElement.disabled = false;
                inputElement.focus(); // Return focus to the input
            }
        }
    }
});