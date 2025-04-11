document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // Initialize Socket.io connection with the token
    const socket = io({
        auth: {
            token: token
        }
    });

    // Global variables
    let currentUser = null;
    let connections = [];
    let selectedConnections = new Set();
    let activeChatId = null;
    let messageHistory = {};
    let unreadMessages = {}; // Track unread messages by user ID
    let totalUnreadCount = 0; // Total unread messages

    // Create notification sound
    const notificationSound = new Audio();
    notificationSound.src = 'https://assets.mixkit.co/active_storage/sfx/1031/1031-preview.mp3'; // Default notification sound

    // DOM elements
    const connectionsList = document.getElementById('connectionsList');
    const connectionSearch = document.getElementById('connectionSearch');
    const selectedCount = document.getElementById('selectedCount');
    const startChatBtn = document.getElementById('startChatBtn');
    const chatTitle = document.getElementById('chatTitle');
    const participantsList = document.getElementById('participantsList');
    const messagesArea = document.getElementById('messagesArea');
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    // Event listeners
    connectionSearch.addEventListener('input', filterConnections);
    startChatBtn.addEventListener('click', startChat);
    sendMessageBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    logoutBtn.addEventListener('click', doLogout);

    // Initialize
    initializeChat();
    
    // Update notification badge in header
    updateNotificationBadge();

    // Socket event listeners
    socket.on('connect', () => {
        console.log('Connected to the server');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        showError('Failed to connect to the chat server. Please try again later.');
    });

    socket.on('private-message', (data) => {
        receiveMessage(data);
    });

    socket.on('user-status', (data) => {
        updateUserStatus(data.userId, data.status);
    });

    async function initializeChat() {
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
            
            // Load connections
            await loadConnections();
            
            // Check for unread messages
            await checkUnreadMessages();
        } catch (error) {
            console.error('Initialization error:', error);
            showError('Failed to initialize chat. Please refresh the page.');
        }
    }
    
    // Get unread message count
    async function checkUnreadMessages() {
        try {
            const response = await fetch('/api/messages/unread', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                return; // Fail silently
            }

            const unreadData = await response.json();
            
            // Update unread counts
            unreadData.forEach(item => {
                unreadMessages[item.senderId] = (unreadMessages[item.senderId] || 0) + item.count;
                totalUnreadCount += item.count;
                
                // Add notification to UI for each sender with unread messages
                const connectionElement = document.querySelector(`.connection-item[data-id="${item.senderId}"]`);
                if (connectionElement) {
                    connectionElement.classList.add('new-message');
                    
                    // Add unread count
                    let badge = connectionElement.querySelector('.unread-badge');
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'unread-badge';
                        connectionElement.appendChild(badge);
                    }
                    badge.textContent = item.count;
                }
            });
            
            // Update header notification badge
            updateNotificationBadge();
            
        } catch (error) {
            console.error('Error checking unread messages:', error);
        }
    }

    async function loadConnections() {
        try {
            const response = await fetch('/api/connections', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch connections');
            }

            connections = await response.json();
            renderConnections(connections);
        } catch (error) {
            console.error('Error loading connections:', error);
            connectionsList.innerHTML = '<div class="error-message">Failed to load connections</div>';
        }
    }

    function renderConnections(connectionsArray) {
        connectionsList.innerHTML = '';

        if (connectionsArray.length === 0) {
            connectionsList.innerHTML = '<div class="no-connections">You have no connections yet</div>';
            return;
        }

        connectionsArray.forEach(connection => {
            const isSelected = selectedConnections.has(connection._id);
            const connectionElement = createConnectionElement(connection, isSelected);
            connectionsList.appendChild(connectionElement);
            
            // Add unread indicator if there are unread messages from this user
            if (unreadMessages[connection._id] && unreadMessages[connection._id] > 0) {
                connectionElement.classList.add('new-message');
                
                // Add unread count badge
                const badge = document.createElement('span');
                badge.className = 'unread-badge';
                badge.textContent = unreadMessages[connection._id];
                connectionElement.appendChild(badge);
            }
        });
    }

    function createConnectionElement(connection, isSelected) {
        const div = document.createElement('div');
        div.className = `connection-item ${isSelected ? 'selected' : ''}`;
        div.dataset.id = connection._id;
        
        const userTitle = connection.userType === 'student' ? 
            `Student at ${connection.collegeName}` : 
            `${connection.designation || 'Working'} at ${connection.companyname || 'Company'}`;

        div.innerHTML = `
            <img src="${connection.profilePicture?.url || 'https://placehold.co/40'}" alt="${connection.firstname}" class="connection-avatar">
            <div class="connection-info">
                <h3>${connection.firstname} ${connection.lastname}</h3>
                <p>${userTitle}</p>
            </div>
            <div class="connection-status ${getRandomStatus()}"></div>
        `;

        div.addEventListener('click', () => toggleConnectionSelection(connection._id));
        return div;
    }

    function getRandomStatus() {
        // This is just a placeholder - in a real app, this would be based on actual online status
        return Math.random() > 0.5 ? 'online' : '';
    }

    function toggleConnectionSelection(connectionId) {
        if (selectedConnections.has(connectionId)) {
            selectedConnections.delete(connectionId);
            
            // Clear unread message notification when user is selected
            clearUnreadNotification(connectionId);
        } else {
            selectedConnections.add(connectionId);
        }

        // Update UI
        const connectionElement = document.querySelector(`.connection-item[data-id="${connectionId}"]`);
        if (connectionElement) {
            connectionElement.classList.toggle('selected');
        }

        selectedCount.textContent = selectedConnections.size;
        startChatBtn.disabled = selectedConnections.size === 0;

        // Update participants display in chat area
        updateParticipantsDisplay();
    }
    
    // Clear unread notification for a specific user
    function clearUnreadNotification(userId) {
        const connectionElement = document.querySelector(`.connection-item[data-id="${userId}"]`);
        if (connectionElement) {
            connectionElement.classList.remove('new-message');
            
            // Remove unread badge
            const badge = connectionElement.querySelector('.unread-badge');
            if (badge) {
                badge.remove();
            }
            
            // Update counters
            if (unreadMessages[userId]) {
                totalUnreadCount -= unreadMessages[userId];
                unreadMessages[userId] = 0;
                updateNotificationBadge();
            }
        }
    }

    function updateParticipantsDisplay() {
        if (selectedConnections.size === 0) {
            chatTitle.textContent = 'Select connections to start a chat';
            participantsList.innerHTML = '';
            return;
        }

        const selectedUsers = connections.filter(conn => selectedConnections.has(conn._id));
        
        if (selectedUsers.length === 1) {
            chatTitle.textContent = `${selectedUsers[0].firstname} ${selectedUsers[0].lastname}`;
        } else {
            chatTitle.textContent = `Group Chat (${selectedUsers.length} people)`;
        }

        participantsList.innerHTML = '';
        selectedUsers.forEach(user => {
            const img = document.createElement('img');
            img.src = user.profilePicture?.url || 'https://placehold.co/30';
            img.alt = `${user.firstname} ${user.lastname}`;
            img.className = 'participant-avatar';
            img.title = `${user.firstname} ${user.lastname}`;
            participantsList.appendChild(img);
        });
    }

    function filterConnections() {
        const searchTerm = connectionSearch.value.toLowerCase();
        const filteredConnections = connections.filter(conn => 
            conn.firstname.toLowerCase().includes(searchTerm) ||
            conn.lastname.toLowerCase().includes(searchTerm) ||
            (conn.collegeName && conn.collegeName.toLowerCase().includes(searchTerm)) ||
            (conn.companyname && conn.companyname.toLowerCase().includes(searchTerm))
        );
        renderConnections(filteredConnections);
    }

    function startChat() {
        if (selectedConnections.size === 0) return;

        // Enable chat interface
        messageInput.disabled = false;
        sendMessageBtn.disabled = false;
        
        // Clear message area
        messagesArea.innerHTML = '';
        
        // Generate a chat ID based on participants
        const participants = Array.from(selectedConnections).sort();
        activeChatId = participants.join('-');
        
        // Show loading indicator
        messagesArea.innerHTML = '<div class="loading-messages">Loading messages...</div>';
        
        // Clear unread messages for all selected users
        participants.forEach(userId => {
            clearUnreadNotification(userId);
        });
        
        // Determine if this is a one-on-one chat or a group chat
        if (participants.length === 1) {
            // One-on-one chat
            loadDirectMessageHistory(participants[0]);
        } else {
            // Group chat
            loadGroupMessageHistory(activeChatId);
        }
        
        // Mark messages as read
        markMessagesAsRead(participants);
    }
    
    // Mark messages as read on the server
    async function markMessagesAsRead(userIds) {
        try {
            await fetch('/api/messages/mark-read', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ senderIds: userIds })
            });
        } catch (error) {
            console.error('Error marking messages as read:', error);
        }
    }
    
    async function loadDirectMessageHistory(userId) {
        try {
            const response = await fetch(`/api/messages/${userId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load message history');
            }
            
            const messages = await response.json();
            
            // Clear loading indicator
            messagesArea.innerHTML = '';
            
            if (messages.length === 0) {
                messagesArea.innerHTML = '<div class="no-messages-placeholder">No messages yet. Start the conversation!</div>';
                return;
            }
            
            // Initialize message history array if it doesn't exist
            if (!messageHistory[activeChatId]) {
                messageHistory[activeChatId] = [];
            }
            
            // Process and display messages
            messages.forEach(msg => {
                const messageObj = {
                    _id: msg._id, // Include message ID for deletion
                    senderId: msg.sender,
                    senderName: getSenderName(msg.sender),
                    message: msg.content,
                    timestamp: new Date(msg.timestamp),
                    isOwnMessage: msg.sender === currentUser._id
                };
                
                // Add to history if not already there
                messageHistory[activeChatId].push(messageObj);
                
                // Display the message
                displayMessage(messageObj);
            });
            
            // Scroll to bottom
            messagesArea.scrollTop = messagesArea.scrollHeight;
            
        } catch (error) {
            console.error('Error loading message history:', error);
            messagesArea.innerHTML = '<div class="error-message">Failed to load message history</div>';
        }
    }
    
    async function loadGroupMessageHistory(chatId) {
        try {
            const response = await fetch(`/api/messages/group/${chatId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to load group message history');
            }
            
            const messages = await response.json();
            
            // Clear loading indicator
            messagesArea.innerHTML = '';
            
            if (messages.length === 0) {
                messagesArea.innerHTML = '<div class="no-messages-placeholder">No messages yet. Start the conversation!</div>';
                return;
            }
            
            // Initialize message history array if it doesn't exist
            if (!messageHistory[activeChatId]) {
                messageHistory[activeChatId] = [];
            }
            
            // Process and display messages
            messages.forEach(msg => {
                const messageObj = {
                    _id: msg._id, // Include message ID for deletion
                    senderId: msg.sender._id,
                    senderName: `${msg.sender.firstname} ${msg.sender.lastname}`,
                    message: msg.content,
                    timestamp: new Date(msg.timestamp),
                    isOwnMessage: msg.sender._id === currentUser._id
                };
                
                // Add to history if not already there
                messageHistory[activeChatId].push(messageObj);
                
                // Display the message
                displayMessage(messageObj);
            });
            
            // Scroll to bottom
            messagesArea.scrollTop = messagesArea.scrollHeight;
            
        } catch (error) {
            console.error('Error loading group message history:', error);
            messagesArea.innerHTML = '<div class="error-message">Failed to load group message history</div>';
        }
    }
    
    function getSenderName(senderId) {
        // Find sender's name from connections list
        const sender = connections.find(conn => conn._id === senderId);
        return sender ? `${sender.firstname} ${sender.lastname}` : 'Unknown User';
    }

    function sendMessage() {
        if (!messageInput.value.trim() || selectedConnections.size === 0) return;

        const messageText = messageInput.value.trim();
        const timestamp = new Date();
        
        // Create message object without ID initially
        const messageObj = {
            senderId: currentUser._id,
            senderName: `${currentUser.firstname} ${currentUser.lastname}`,
            message: messageText,
            timestamp: timestamp,
            isOwnMessage: true
        };

        // Add to history preliminarily
        if (!messageHistory[activeChatId]) {
            messageHistory[activeChatId] = [];
        }
        
        // Display message (temporary without ID)
        const messageElement = displayMessage(messageObj);
        
        // For each selected connection, send a private message
        selectedConnections.forEach(async (recipientId) => {
            socket.emit('private-message', {
                to: recipientId,
                message: messageText,
                timestamp: timestamp,
                chatId: activeChatId
            });
            
            // Also save via REST API for reliability and get the message ID
            const savedMessage = await saveMessageToDatabase(recipientId, messageText, activeChatId);
            
            if (savedMessage && savedMessage._id) {
                // Update the message object with the ID
                messageObj._id = savedMessage._id;
                
                // Update the message element with the ID
                if (messageElement) {
                    messageElement.setAttribute('data-message-id', savedMessage._id);
                    
                    // Add delete button event listener now that we have an ID
                    const deleteBtn = messageElement.querySelector('.delete-message-btn');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', () => deleteMessage(savedMessage._id, messageElement));
                    }
                }
            }
        });

        // Clear input and scroll to bottom
        messageInput.value = '';
        messagesArea.scrollTop = messagesArea.scrollHeight;
        
        // Focus the input field again
        messageInput.focus();
        
        return messageElement;
    }
    
    async function saveMessageToDatabase(recipientId, content, chatId) {
        try {
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    recipient: recipientId,
                    content,
                    chatId
                })
            });
            
            if (response.ok) {
                const savedMessage = await response.json();
                return savedMessage;
            }
            
            return null;
        } catch (error) {
            console.error('Error saving message:', error);
            return null;
        }
    }

    function receiveMessage(data) {
        // Play notification sound
        playNotificationSound();
        
        // Check if this message is from a connection we're currently chatting with
        const senderId = data.from;
        const isActiveChat = selectedConnections.has(senderId) && activeChatId;
        
        if (!isActiveChat) {
            // If not currently chatting with this user, update unread counter
            unreadMessages[senderId] = (unreadMessages[senderId] || 0) + 1;
            totalUnreadCount++;
            updateNotificationBadge();
            
            // Highlight the connection in the list and add bounce effect
            const connectionElement = document.querySelector(`.connection-item[data-id="${senderId}"]`);
            if (connectionElement) {
                connectionElement.classList.add('new-message');
                connectionElement.style.animation = 'pulse 1s infinite alternate';
                
                // Update or add unread badge
                let badge = connectionElement.querySelector('.unread-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'unread-badge';
                    connectionElement.appendChild(badge);
                }
                badge.textContent = unreadMessages[senderId];
                badge.style.display = 'flex'; // Ensure visibility
            }
            
            // Show notification popup
            showMessageNotification(senderId, data.message);
            
            return;
        }

        // Find sender information
        const sender = connections.find(conn => conn._id === senderId);
        const senderName = sender ? `${sender.firstname} ${sender.lastname}` : 'Unknown User';

        // Create message object
        const messageObj = {
            senderId: senderId,
            senderName: senderName,
            message: data.message,
            timestamp: data.timestamp || new Date(),
            isOwnMessage: false
        };

        // Add to history
        if (!messageHistory[activeChatId]) {
            messageHistory[activeChatId] = [];
        }
        messageHistory[activeChatId].push(messageObj);

        // Display message
        displayMessage(messageObj);

        // Scroll to bottom
        messagesArea.scrollTop = messagesArea.scrollHeight;
        
        // Mark this message as read since we're in the active chat
        markMessagesAsRead([senderId]);
    }

    function displayMessage(messageObj) {
        // Clear any "no messages" placeholder
        const placeholder = messagesArea.querySelector('.no-messages-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message ${messageObj.isOwnMessage ? 'sent' : 'received'}`;
        messageElement.setAttribute('data-message-id', messageObj._id || '');
        
        // For messages in group chats (or for received messages),
        // include the sender's name
        const showSender = !messageObj.isOwnMessage || selectedConnections.size > 1;
        
        // Add delete button only for own messages
        const deleteButton = messageObj.isOwnMessage ? 
            `<button class="delete-message-btn" title="Delete message">×</button>` : '';
        
        messageElement.innerHTML = `
            ${showSender ? `<div class="message-sender">${messageObj.senderName}</div>` : ''}
            <div class="message-content">${messageObj.message}</div>
            <div class="message-time">${new Date(messageObj.timestamp).toLocaleTimeString()}</div>
            ${deleteButton}
        `;
        
        // Add event listener for delete button if present
        if (messageObj.isOwnMessage) {
            const deleteBtn = messageElement.querySelector('.delete-message-btn');
            if (deleteBtn && messageObj._id) {
                deleteBtn.addEventListener('click', () => deleteMessage(messageObj._id, messageElement));
            }
        }
        
        messagesArea.appendChild(messageElement);
        
        return messageElement;
    }

    // Add delete message function
    async function deleteMessage(messageId, messageElement) {
        if (!messageId) return;
        
        if (!confirm('Are you sure you want to delete this message?')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/messages/${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to delete message');
            }
            
            // Remove the message from the UI
            messageElement.classList.add('message-deleted');
            setTimeout(() => {
                messageElement.remove();
            }, 300);
            
            // Remove from message history
            if (messageHistory[activeChatId]) {
                const index = messageHistory[activeChatId].findIndex(msg => msg._id === messageId);
                if (index > -1) {
                    messageHistory[activeChatId].splice(index, 1);
                }
            }
        } catch (error) {
            console.error('Error deleting message:', error);
            showError('Failed to delete message. Please try again.');
        }
    }

    function updateUserStatus(userId, status) {
        const statusIndicator = document.querySelector(`.connection-item[data-id="${userId}"] .connection-status`);
        if (statusIndicator) {
            statusIndicator.className = `connection-status ${status === 'online' ? 'online' : ''}`;
        }
    }

    function showError(message) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-toast';
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }

    function doLogout() {
        localStorage.removeItem('token');
        window.location.href = '/login';
    }

    // Play notification sound
    function playNotificationSound() {
        try {
            notificationSound.play();
        } catch (e) {
            console.log('Could not play notification sound', e);
        }
    }
    
    // Show notification popup for new message
    function showMessageNotification(senderId, message) {
        // Find sender details
        const sender = connections.find(conn => conn._id === senderId);
        if (!sender) return;
        
        // Remove any existing notification for this sender to prevent stacking
        const existingNotification = document.querySelector(`.message-notification[data-sender-id="${senderId}"]`);
        if (existingNotification) {
            existingNotification.remove();
        }
        
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'message-notification';
        notification.setAttribute('data-sender-id', senderId);
        
        // Truncate message if too long
        const truncatedMessage = message.length > 50 ? message.substring(0, 47) + '...' : message;
        
        notification.innerHTML = `
            <img src="${sender.profilePicture?.url || 'https://placehold.co/40'}" class="message-notification-avatar">
            <div class="message-notification-content">
                <div class="message-notification-sender">${sender.firstname} ${sender.lastname}</div>
                <div class="message-notification-text">${truncatedMessage}</div>
            </div>
            <button class="message-notification-close">&times;</button>
        `;
        
        // Add to document
        document.body.appendChild(notification);
        
        // Handle click on notification to open chat
        notification.addEventListener('click', (e) => {
            // Ignore if clicking on close button
            if (e.target.classList.contains('message-notification-close')) return;
            
            // Open chat with this user
            openChatWithUser(senderId);
            notification.remove();
        });
        
        // Handle close button click
        const closeBtn = notification.querySelector('.message-notification-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                notification.remove();
            });
        }
        
        // Auto remove after 8 seconds for better visibility
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 8000);
    }
    
    // Open chat with a specific user
    function openChatWithUser(userId) {
        // Clear any previous selection
        selectedConnections.forEach(id => {
            const el = document.querySelector(`.connection-item[data-id="${id}"]`);
            if (el) el.classList.remove('selected');
        });
        selectedConnections.clear();
        
        // Select this user
        selectedConnections.add(userId);
        const connectionElement = document.querySelector(`.connection-item[data-id="${userId}"]`);
        if (connectionElement) {
            connectionElement.classList.add('selected');
        }
        
        // Update UI
        selectedCount.textContent = '1';
        startChatBtn.disabled = false;
        
        // Start chat
        startChat();
    }
    
    // Update notification badge in header
    function updateNotificationBadge() {
        // Find the chat nav link
        const chatNavLink = document.querySelector('.nav-link[href="/chat"]');
        if (!chatNavLink) return;
        
        // Remove existing badge if any
        const existingBadge = chatNavLink.querySelector('.notification-badge');
        if (existingBadge) {
            existingBadge.remove();
        }
        
        // Add new badge if we have unread messages
        if (totalUnreadCount > 0) {
            const badge = document.createElement('span');
            badge.className = 'notification-badge';
            badge.textContent = totalUnreadCount > 99 ? '99+' : totalUnreadCount;
            chatNavLink.appendChild(badge);
            
            // Update page title with unread count
            document.title = `(${totalUnreadCount}) Chat - EduNet`;
        } else {
            // Reset page title
            document.title = 'Chat - EduNet';
        }
    }
});
