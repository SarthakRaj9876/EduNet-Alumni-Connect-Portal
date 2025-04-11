document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // Check for profile reload instead of using a window variable
    // A more reliable approach to detect refreshes using localStorage
    loadUserProfile();
    initializeChat();

    // Edit Profile Button - Add a console log to debug
    console.log("Setting up Edit Profile button");
    const editProfileBtn = document.getElementById('editProfileBtn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', function() {
            console.log("Edit Profile button clicked");
            openEditModal();
        });
    } else {
        console.error("Edit Profile button not found in the DOM");
    }
    
    // Make sure we have the form before adding event listener
    const editProfileForm = document.getElementById('editProfileForm');
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', handleProfileUpdate);
    } else {
        console.error("Edit Profile form not found in the DOM");
    }
    
    // Cancel button for edit modal
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', closeEditModal);
    }
    
    // Add logout button event listener
    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        doLogout();
    });
});

async function loadUserProfile() {
    try {
        // Check if we're viewing another user's profile
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('userId');
        
        console.log('Loading profile. userId param:', userId);
        
        let url = '/api/user/profile';
        let isOwnProfile = true;
        
        // If userId parameter exists, modify the URL to fetch that user's profile
        if (userId) {
            url = `/api/user/${userId}/profile`;
            console.log('Loading other user profile:', url);
            isOwnProfile = false;
            
            // Hide the edit profile button if viewing someone else's profile
            const editProfileBtn = document.getElementById('editProfileBtn');
            if (editProfileBtn) {
                editProfileBtn.style.display = 'none';
            }
        }
        
        // Add a refresh parameter to indicate this is a refresh (affects view counting)
        url += '?refresh=false';
        
        console.log('Fetching profile data from:', url);
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            if (response.status === 403) {
                console.error("Profile is private or not accessible");
                throw new Error("This profile is private and not accessible");
            }
            if (response.status === 404) {
                console.error("User profile not found");
                throw new Error("User not found");
            }
            throw new Error('Failed to load profile');
        }

        const user = await response.json();
        
        // Store the user data in localStorage for later use
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        // Determine if this is a refresh based on last viewed time
        const lastViewed = localStorage.getItem('lastProfileView');
        const isRefresh = lastViewed && ((new Date() - new Date(lastViewed)) < 60000); // 60 seconds
        
        // Update last viewed timestamp
        localStorage.setItem('lastProfileView', new Date().toISOString());
        
        // Log the refresh state and views
        console.debug('Profile loaded:', {
            isRefresh,
            profileViews: user.profileViews,
            isOwnProfile: user.isOwnProfile
        });
        
        updateProfileUI(user);
        
        // Check if user was converted from student to alumni
        if (user.wasConverted) {
            showConversionNotification(user);
        }
        
        // Only add profile picture upload and load profile views when viewing own profile
        if (isOwnProfile && user.isOwnProfile) {
            console.log("Loading own profile - adding photo upload button and viewing stats");
            loadProfileViews();
            
            // Add profile picture upload button for own profile only
            setTimeout(() => {
                addProfilePictureUpload();
            }, 300);
        } else {
            console.log("Viewing another user's profile - hiding private sections");
            // Hide sections that shouldn't be visible on others' profiles
            hidePrivateSections();
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        showErrorMessage(error.message || 'Failed to load profile');
    }
}

async function loadProfileViews() {
    try {
        // Get the current user data from the profile response
        const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
        
        // If we already have the profile view count, use it
        if (currentUser && typeof currentUser.profileViews === 'number') {
            // Update view count on the profile display (not incrementing it)
            const profileViewCount = document.getElementById('profileViewCount');
            if (profileViewCount) {
                profileViewCount.textContent = currentUser.profileViews;
            }
        }
        
        // Additional profile view details can still be loaded
        const response = await fetch('/api/user/profile/views', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch profile views');
        }

        const viewData = await response.json();
        
        // Update total view count if we have that field
        if (viewData.totalViews !== undefined) {
            const profileViewCount = document.getElementById('profileViewCount');
            if (profileViewCount) {
                profileViewCount.textContent = viewData.totalViews;
            }
        }
        
        // Update view details list if available
        const viewsList = document.getElementById('profileViewsList');
        if (viewsList && viewData.recentViews && Array.isArray(viewData.recentViews)) {
            viewsList.innerHTML = '';
            
            if (viewData.recentViews.length === 0) {
                viewsList.innerHTML = '<p class="no-views">No recent profile views</p>';
                return;
            }
            
            viewData.recentViews.forEach(view => {
                const viewItem = document.createElement('div');
                viewItem.className = 'view-item';
                viewItem.innerHTML = `
                    <img src="${view.profilePicture || '/images/default-profile.png'}" class="view-avatar">
                    <div class="view-details">
                        <span class="view-name">${view.name}</span>
                        <span class="view-time">${new Date(view.timestamp).toLocaleString()}</span>
                    </div>
                `;
                viewsList.appendChild(viewItem);
            });
        }
    } catch (error) {
        console.error('Error loading profile views:', error);
    }
}

function updateProfileUI(user) {
    // Update profile header
    document.getElementById('profileAvatar').src = user.profilePicture?.url || '/images/default-profile.png';
    document.getElementById('profileName').textContent = `${user.firstname} ${user.lastname}`;
    document.getElementById('profileTitle').textContent = user.userType === 'student' ? 
        `Student at ${user.collegeName}` : 
        `${user.designation} at ${user.companyname}`;
        
    // Add "Your Profile" indicator if isOwnProfile is true
    if (user.isOwnProfile) {
        const viewsInfo = document.querySelector('.profile-header');
        if (viewsInfo) {
            const viewsNote = document.createElement('div');
            viewsNote.className = 'profile-note';
            viewsNote.innerHTML = 'You are viewing your own profile. View count will not increase.';
            
            // Remove existing note if any
            const existingNote = viewsInfo.querySelector('.profile-note');
            if (existingNote) {
                existingNote.remove();
            }
            
            viewsInfo.appendChild(viewsNote);
        }
    }

    // Update about section
    document.getElementById('profileAbout').textContent = user.about || 'No information provided';

    // Update personal information
    document.getElementById('profileEmail').textContent = user.email;
    if (user.email === "Hidden for privacy") {
        document.getElementById('profileEmail').innerHTML = '<i>Hidden for privacy</i>';
        document.getElementById('profileEmail').classList.add('private-info');
    } else {
        document.getElementById('profileEmail').classList.remove('private-info');
    }
    
    document.getElementById('profilePhone').textContent = user.phone;
    if (user.phone === "Hidden for privacy") {
        document.getElementById('profilePhone').innerHTML = '<i>Hidden for privacy</i>';
        document.getElementById('profilePhone').classList.add('private-info');
    } else {
        document.getElementById('profilePhone').classList.remove('private-info');
    }
    
    document.getElementById('profileDOB').textContent = new Date(user.dateofbirth).toLocaleDateString();

    // Update LinkedIn information if element exists - ensure it's always visible and properly formatted
    const linkedinElement = document.getElementById('profileLinkedIn');
    if (linkedinElement) {
        if (user.linkedin) {
            const linkedinUrl = user.linkedin.startsWith('http') ? user.linkedin : 'https://' + user.linkedin;
            linkedinElement.innerHTML = `<a href="${linkedinUrl}" target="_blank" class="linkedin-link">${user.linkedin}</a>`;
        } else {
            linkedinElement.textContent = 'Not provided';
        }
    }

    // Update education information
    document.getElementById('profileCollege').textContent = user.collegeName;
    document.getElementById('profileDepartment').textContent = user.department;
    document.getElementById('profileAdmissionYear').textContent = user.yearofadmission;
    document.getElementById('profileGradYear').textContent = user.yearofgrad;

    // Show work section for all profiles (own and others)
    const workSection = document.getElementById('workSection');
    if (workSection) {
        workSection.style.display = 'block';
        document.getElementById('profileEmployment').textContent = user.employed || 'Not specified';
        document.getElementById('profileDesignation').textContent = user.designation || 'Not specified';
        document.getElementById('profileCompany').textContent = user.companyname || 'Not specified';
        document.getElementById('profileLocation').textContent = user.companylocation || 'Not specified';
    }

    // Update privacy settings if the element exists
    const profileVisibility = document.getElementById('profileVisibility');
    if (profileVisibility) {
        profileVisibility.checked = user.visibility;
    }
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    
    try {
        // Show loading state
        submitButton.textContent = 'Saving...';
        submitButton.disabled = true;

        // Collect form data
        const formData = new FormData(form);
        const updateData = {
            firstname: formData.get('firstname'),
            lastname: formData.get('lastname'),
            phone: formData.get('phone'),
            about: formData.get('about'),
            employed: formData.get('employed'),
            designation: formData.get('designation'),
            companyname: formData.get('companyname'),
            companylocation: formData.get('companylocation'),
            linkedin: formData.get('linkedin'),
            visibility: formData.get('visibility') === 'true'
        };

        const response = await fetch('/api/user/profile/update', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to update profile');
        }

        const updatedUser = await response.json();
        updateProfileUI(updatedUser);
        closeEditModal();
        showSuccessMessage('Profile updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        showErrorMessage(error.message || 'Failed to update profile');
    } finally {
        if (submitButton) {
            submitButton.textContent = 'Save Changes';
            submitButton.disabled = false;
        }
    }
}

// Chat functionality
function initializeChat() {
    const socket = io();
    const chatContainer = document.getElementById('chatContainer');
    const messageInput = document.getElementById('messageInput');
    const messagesList = document.getElementById('messagesList');

    socket.on('private-message', (data) => {
        appendMessage(data.from, data.message);
        markMessageAsRead(data.messageId);
    });

    socket.on('user-status', (data) => {
        updateUserStatus(data.userId, data.status);
    });
}

function appendMessage(senderId, message) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${senderId === currentUserId ? 'sent' : 'received'}`;
    messageElement.innerHTML = `
        <div class="message-content">${message}</div>
        <div class="message-time">${new Date().toLocaleTimeString()}</div>
    `;
    messagesList.appendChild(messageElement);
    messagesList.scrollTop = messagesList.scrollHeight;
}

async function markMessageAsRead(messageId) {
    try {
        await fetch(`/api/messages/${messageId}/read`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
    } catch (error) {
        console.error('Error marking message as read:', error);
    }
}

function updateUserStatus(userId, status) {
    const statusIndicator = document.querySelector(`[data-user-id="${userId}"] .status-indicator`);
    if (statusIndicator) {
        statusIndicator.className = `status-indicator ${status}`;
    }
}

// Friend system functionality
async function sendFriendRequest(userId) {
    try {
        const response = await fetch('/api/friends/request', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ receiverId: userId })
        });

        if (!response.ok) {
            throw new Error('Failed to send friend request');
        }

        showSuccessMessage('Friend request sent successfully!');
        updateFriendshipStatus(userId, 'pending');
    } catch (error) {
        console.error('Error sending friend request:', error);
        showErrorMessage('Failed to send friend request. Please try again.');
    }
}

async function handleFriendRequest(requestId, action) {
    try {
        const response = await fetch(`/api/friends/request/${requestId}/${action}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to ${action} friend request`);
        }

        showSuccessMessage(`Friend request ${action}ed!`);
        loadFriendRequests();
    } catch (error) {
        console.error(`Error ${action}ing friend request:`, error);
        showErrorMessage(`Failed to ${action} friend request. Please try again.`);
    }
}

function updateFriendshipStatus(userId, status) {
    const friendshipButton = document.querySelector(`[data-user-id="${userId}"] .friendship-button`);
    if (friendshipButton) {
        friendshipButton.textContent = getFriendshipButtonText(status);
        friendshipButton.className = `friendship-button ${status}`;
    }
}

function getFriendshipButtonText(status) {
    switch (status) {
        case 'not-friends':
            return 'Add Friend';
        case 'pending':
            return 'Request Sent';
        case 'friends':
            return 'Friends';
        default:
            return 'Add Friend';
    }
}

// UI Helpers
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

function openEditModal() {
    console.log("Opening edit modal");
    
    // Get current user data
    let user;
    try {
        user = JSON.parse(localStorage.getItem('currentUser'));
    } catch (e) {
        console.error("Error parsing user data from localStorage:", e);
        user = null;
    }
    
    // Display the modal first to avoid delays
    const modal = document.getElementById('editProfileModal');
    console.log("Modal element:", modal);
    
    if (modal) {
        // Force the modal to be visible and properly styled
        modal.style.display = 'block';
        modal.style.position = 'fixed';
        modal.style.zIndex = '1000';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.overflow = 'auto';
        modal.style.backgroundColor = 'rgba(0,0,0,0.4)';
        console.log("Modal set to display:block with enhanced styling");
    } else {
        console.error("Edit Profile modal not found in the DOM");
        showErrorMessage("Could not open the edit profile form. Please refresh the page and try again.");
        return;
    }
    
    if (!user) {
        console.log("User data not found in localStorage, fetching...");
        // If user data not in localStorage, fetch it
        fetch('/api/user/profile', {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        }).then(response => {
            if (!response.ok) {
                throw new Error("Failed to fetch profile data");
            }
            return response.json();
        })
        .then(userData => {
            console.log("User data fetched successfully");
            fillEditForm(userData);
            localStorage.setItem('currentUser', JSON.stringify(userData));
        }).catch(error => {
            console.error('Error fetching user data:', error);
            showErrorMessage('Failed to load user data for editing');
        });
    } else {
        console.log("Using user data from localStorage");
        fillEditForm(user);
    }
}

function fillEditForm(user) {
    // Fill form fields with user data
    const firstNameInput = document.getElementById('editFirstName');
    const lastNameInput = document.getElementById('editLastName');
    const phoneInput = document.getElementById('editPhone');
    const aboutInput = document.getElementById('editAbout');
    const employedInput = document.getElementById('editEmployed');
    const designationInput = document.getElementById('editDesignation');
    const companyInput = document.getElementById('editCompany');
    const locationInput = document.getElementById('editLocation');
    const linkedinInput = document.getElementById('editLinkedIn');
    const visibilityInput = document.getElementById('editVisibility');

    if (firstNameInput) firstNameInput.value = user.firstname || '';
    if (lastNameInput) lastNameInput.value = user.lastname || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (aboutInput) aboutInput.value = user.about || '';
    if (employedInput) employedInput.value = user.employed || 'employed';
    if (designationInput) designationInput.value = user.designation || '';
    if (companyInput) companyInput.value = user.companyname || '';
    if (locationInput) locationInput.value = user.companylocation || '';
    if (linkedinInput) linkedinInput.value = user.linkedin || '';
    if (visibilityInput) visibilityInput.checked = user.visibility || false;
}

function closeEditModal() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('editProfileModal');
    if (event.target === modal) {
        closeEditModal();
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

// Add global access to the closeEditModal function for the Cancel button
window.closeEditModal = closeEditModal;

// Function to hide private sections when viewing other users' profiles
function hidePrivateSections() {
    // Add a note that we're viewing someone else's profile
    const profileContent = document.querySelector('.profile-content');
    if (profileContent) {
        const viewingNote = document.createElement('div');
        viewingNote.className = 'viewing-note';
        viewingNote.innerHTML = `
            <p>You are viewing another user's profile. Some information is hidden for privacy.</p>
        `;
        profileContent.insertBefore(viewingNote, profileContent.firstChild);
    }
    
    // Completely hide work section instead of just marking it as private
    const workSection = document.querySelector('.work-section');
    if (workSection) {
        workSection.style.display = 'none';
    }
    
    // Hide any other sections marked with private-section class
    const privateSections = document.querySelectorAll('.private-section');
    privateSections.forEach(section => {
        // Add visual indicator that this is a private section
        const privateNote = document.createElement('div');
        privateNote.className = 'private-note';
        privateNote.textContent = 'This information is private';
        section.appendChild(privateNote);
    });
}

// Function to add profile picture upload button (only for own profile)
function addProfilePictureUpload() {
    console.log("Adding profile picture upload for own profile");
    // Add profile picture upload elements
    const profilePicInput = document.createElement('input');
    profilePicInput.type = 'file';
    profilePicInput.id = 'profilePicInput';
    profilePicInput.accept = 'image/jpeg,image/png,image/jpg';
    profilePicInput.style.display = 'none';
    document.body.appendChild(profilePicInput);

    const uploadButton = document.createElement('button');
    uploadButton.className = 'btn btn-secondary upload-photo-btn';
    uploadButton.textContent = 'Change Photo';
    uploadButton.style.marginTop = '10px';
    uploadButton.style.display = 'block';
    uploadButton.style.width = '100%';
    uploadButton.style.padding = '8px';
    uploadButton.style.cursor = 'pointer';
    uploadButton.onclick = function(e) {
        e.preventDefault();
        console.log("Change Photo button clicked");
        profilePicInput.click();
    };

    // Get the profile avatar container and add the upload button
    const profileAvatar = document.getElementById('profileAvatar');
    console.log("Profile Avatar element:", profileAvatar);
    
    if (profileAvatar) {
        const profileAvatarContainer = profileAvatar.parentElement;
        console.log("Profile Avatar Container:", profileAvatarContainer);
        
        if (profileAvatarContainer) {
            profileAvatarContainer.style.position = 'relative';
            profileAvatarContainer.appendChild(uploadButton);
            console.log("Added Change Photo button to container");
        } else {
            // Fallback if parent not found
            console.error("Profile avatar parent not found, adding button after avatar");
            const parent = profileAvatar.parentNode;
            parent.insertBefore(uploadButton, profileAvatar.nextSibling);
        }
    } else {
        console.error("Profile avatar element not found");
    }

    // Handle file selection and upload
    profilePicInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Show loading state
        uploadButton.textContent = 'Uploading...';
        uploadButton.disabled = true;

        // Validate file type and size
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
        if (!validTypes.includes(file.type)) {
            showErrorMessage('Please select a valid image file (JPEG, JPG, or PNG)');
            uploadButton.textContent = 'Change Photo';
            uploadButton.disabled = false;
            return;
        }

        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showErrorMessage('Image size should be less than 5MB');
            uploadButton.textContent = 'Change Photo';
            uploadButton.disabled = false;
            return;
        }

        try {
            const formData = new FormData();
            formData.append('profilePicture', file);

            const response = await fetch('/api/user/profile/picture', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to upload profile picture');
            }

            const data = await response.json();
            
            // Update profile picture in UI
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar) {
                profileAvatar.src = data.profilePicture.url;
            }
            showSuccessMessage('Profile picture updated successfully');

        } catch (error) {
            console.error('Profile picture upload error:', error);
            showErrorMessage(error.message || 'Failed to upload profile picture. Please try again.');
        } finally {
            // Reset button state
            uploadButton.textContent = 'Change Photo';
            uploadButton.disabled = false;
        }
    });
}

// Function to show notification when user is converted from student to alumni
function showConversionNotification(userData) {
    const notification = document.createElement('div');
    notification.className = 'status-notification';
    notification.innerHTML = `
        <div class="notification-content">
            <h3>Congratulations Graduate!</h3>
            <p>Your account has been automatically updated from Student to Alumni status based on your graduation year.</p>
            <p>You now have access to all alumni features, including enhanced networking capabilities and job posting options.</p>
            <button class="notification-close">Got it</button>
        </div>
    `;
    document.body.appendChild(notification);
    
    // Add styles for the notification
    const style = document.createElement('style');
    style.textContent = `
        .status-notification {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        .notification-content {
            background-color: white;
            padding: 30px;
            border-radius: 10px;
            max-width: 500px;
            text-align: center;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
        }
        .notification-content h3 {
            color: #4CAF50;
            margin-top: 0;
            font-size: 24px;
        }
        .notification-close {
            background-color: #4CAF50;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            margin-top: 15px;
            font-weight: bold;
        }
        .notification-close:hover {
            background-color: #3e8e41;
        }
    `;
    document.head.appendChild(style);
    
    // Close notification when button is clicked
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });
}