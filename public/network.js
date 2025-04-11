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
            suggestionsList.innerHTML = `
                <div class="no-suggestions-container">
                    <p class="no-suggestions">No suggestions available at this time</p>
                    <p class="no-suggestions-hint">We're currently finding people for you to connect with. Check back soon!</p>
                    <button id="refreshSuggestions" class="btn btn-primary">Refresh Suggestions</button>
                </div>
            `;
            
            // Add refresh button handler
            const refreshBtn = document.getElementById('refreshSuggestions');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', function() {
                    loadSuggestions();
                });
            }
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
            suggestionsList.innerHTML = `
                <div class="error-message">
                    <p>Failed to load connection suggestions</p>
                    <button id="retrySuggestions" class="btn btn-primary">Try Again</button>
                </div>
            `;
            
            // Add retry button handler
            const retryBtn = document.getElementById('retrySuggestions');
            if (retryBtn) {
                retryBtn.addEventListener('click', function() {
                    loadSuggestions();
                });
            }
        }
    }
} 