document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const errorElement = document.getElementById('error-message');

    // Add profile picture upload elements with improved visibility
    const profilePicContainer = document.createElement('div');
    profilePicContainer.className = 'form-group profile-pic-container';
    profilePicContainer.innerHTML = `
        <label for="signupProfilePictureInput">Profile Picture</label>
        <div class="profile-pic-upload">
            <img id="profilePicPreview" src="/images/default-profile.png" alt="">
            <input type="file" id="signupProfilePictureInput" name="profilePicture" accept="image/jpeg,image/png,image/jpg" style="display: none;">
            <button type="button" class="btn btn-primary" id="choosePictureBtn">Choose Photo</button>
            <p class="upload-hint" style="margin-top: 8px; font-size: 0.85rem; color: #666;">
                Upload a profile picture (JPEG, JPG, or PNG, max 5MB)
            </p>
        </div>
    `;

    // Insert at the beginning of the form
    if (signupForm && signupForm.firstChild) {
        signupForm.insertBefore(profilePicContainer, signupForm.firstChild);
        console.log("Profile picture upload container added to form");
    } else {
        console.error("Could not find signup form or its first child");
    }

    // Handle click on Choose Photo button
    const choosePictureBtn = document.getElementById('choosePictureBtn');
    if (choosePictureBtn) {
        choosePictureBtn.addEventListener('click', function() {
            const fileInput = document.getElementById('signupProfilePictureInput');
            if (fileInput) {
                fileInput.click();
            }
        });
    }

    // Handle profile picture preview with improved error handling
    const profilePicInput = document.getElementById('signupProfilePictureInput');
    const profilePicPreview = document.getElementById('profilePicPreview');

    if (profilePicInput && profilePicPreview) {
        profilePicInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file
            const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
            if (!validTypes.includes(file.type)) {
                showError('Please select a valid image file (JPEG, JPG, or PNG)');
                return;
            }

            if (file.size > 5 * 1024 * 1024) { // 5MB limit
                showError('Image size should be less than 5MB');
                return;
            }

            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                profilePicPreview.src = e.target.result;
                console.log("Profile picture preview updated");
            };
            reader.onerror = () => {
                console.error("Error reading file");
                showError('Error reading file. Please try another image.');
            };
            reader.readAsDataURL(file);
        });
    } else {
        console.error("Profile picture input or preview elements not found");
    }

    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            try {
                // Show loading state
                const submitBtn = document.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Creating Account...';
                }

                // Basic validation
                const password = document.getElementById('password').value;
                const confirmPassword = document.getElementById('cpassword').value;
                
                if (password !== confirmPassword) {
                    throw new Error('Passwords do not match');
                }
                
                if (password.length < 6) {
                    throw new Error('Password must be at least 6 characters long');
                }

                // Create FormData object for file upload
                const formData = new FormData();
                
                // Add profile picture if selected
                const profilePicInput = document.getElementById('signupProfilePictureInput');
                if (profilePicInput && profilePicInput.files[0]) {
                    formData.append('profilePicture', profilePicInput.files[0]);
                    console.log("Profile picture added to form data");
                } else {
                    console.log("No profile picture selected");
                }

                // Add other form fields
                formData.append('firstname', this.firstname.value);
                formData.append('lastname', this.lastname.value);
                formData.append('email', this.email.value.toLowerCase());
                formData.append('phone', this.phone.value);
                formData.append('password', this.password.value);
                formData.append('userType', this.userType.value);
                formData.append('dateofbirth', this.dateofbirth.value);
                formData.append('country', this.country.value);
                
                // LinkedIn field (optional)
                if (this.linkedin && this.linkedin.value) {
                    formData.append('linkedin', this.linkedin.value);
                }
                
                // Optional fields - check if they exist before accessing
                if (this.yearOfAdmission) {
                    formData.append('yearofadmission', this.yearOfAdmission.value || '');
                }
                if (this.yearOfGraduation) {
                    formData.append('yearofgrad', this.yearOfGraduation.value || '');
                }
                if (this.branch) {
                    formData.append('department', this.branch.value || '');
                }
                if (this.course) {
                    formData.append('courseName', this.course.value || '');
                }
                
                // Handle college name field
                if (this.collegeName) {
                    const collegeValue = this.collegeName.value;
                    if (collegeValue === 'Other' && this.otherCollege) {
                        formData.append('collegeName', this.otherCollege.value);
                    } else {
                        formData.append('collegeName', collegeValue);
                    }
                }
                
                if (this.rollNo) {
                    formData.append('collegeId', this.rollNo.value || '');
                }

                // Add alumni specific fields
                if (this.userType.value === 'alumni') {
                    if (this.employmentStatus) formData.append('employed', this.employmentStatus.value || '');
                    if (this.companyName) formData.append('companyname', this.companyName.value || '');
                    if (this.companyLocation) formData.append('companylocation', this.companyLocation.value || '');
                }

                console.log("Submitting signup form data");
                const response = await fetch('/api/auth/signup', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Signup failed');
                }
                
                // Store authentication token
                localStorage.setItem('token', data.token);
                
                // Show success message
                showSuccess('Account created successfully! Redirecting to dashboard...');
                
                // Redirect to dashboard
                setTimeout(() => {
                    window.location.href = '/dashboard';
                }, 1500);
                
            } catch (error) {
                console.error('Signup error:', error);
                showError(error.message || 'Error creating account. Please try again.');
                
                // Re-enable submit button
                const submitBtn = document.querySelector('button[type="submit"]');
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Create Account';
                }
            }
        });
    }

    // Helper functions
    function showError(message) {
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            errorElement.style.color = 'red';
            errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        } else {
            alert(message);
        }
    }

    function showSuccess(message) {
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            errorElement.style.color = 'green';
        } else {
            alert(message);
        }
    }
});

// Toggle fields based on user type
window.toggleFields = function() {
    const userType = document.getElementById('userType').value;
    const studentFields = document.getElementById('studentFields');
    const alumniFields = document.getElementById('alumniFields');

    if (userType === 'student') {
        studentFields.style.display = 'block';
        alumniFields.style.display = 'none';
    } else if (userType === 'alumni') {
        alumniFields.style.display = 'block';
        studentFields.style.display = 'none';
    } else {
        studentFields.style.display = 'none';
        alumniFields.style.display = 'none';
    }
};

// Toggle other college field
window.toggleOtherCollegeField = function() {
    const collegeSelect = document.getElementById('collegeName');
    const otherCollegeField = document.getElementById('otherCollegeField');

    if (collegeSelect.value === 'Other') {
        otherCollegeField.style.display = 'block';
    } else {
        otherCollegeField.style.display = 'none';
    }
};



   

   

    
   
    

       

    // Form submission
    