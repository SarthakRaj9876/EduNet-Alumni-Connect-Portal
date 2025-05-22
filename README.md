
# EduNet Alumni Network

Bridge the Gap Between Students and Alumni

EduNet is a modern, full-stack alumni networking platform that empowers students and alumni to connect, share experiences, and unlock career opportunities. The platform features real-time chat, profile management, job and query posting, and robust privacy controls—all in a secure, scalable, and user-friendly environment.

---

## Features

- **User Registration & Authentication**
  - Secure sign-up and login (including Google OAuth)
  - Password reset and email verification
- **Profile Management**
  - Rich user profiles for students and alumni
  - Editable education, work, and contact information
  - Privacy controls for sensitive data
- **Networking & Connections**
  - Search and connect with peers, alumni, and professionals
  - Connection requests and suggestions based on college/department
  - Profile view tracking and statistics
- **Dashboard**
  - Personalized dashboard with recent activity, posts, and suggestions
  - Search by name, country, college, or department
- **Posts & Activity Feed**
  - Create posts (general, job, query, image)
  - Like, comment, and interact with posts
  - Job posting with company, position, and application link
- **Real-Time Chat**
  - One-to-one and group messaging with Socket.io
  - Unread message notifications and online status
- **Email Communication**
  - Send emails to connections directly from the platform
- **Events & Opportunities**
  - Highlighted networking events, mentorship programs, and job boards
- **Responsive UI**
  - Modern, mobile-friendly design with Bootstrap and custom CSS
- **Security & Performance**
  - Rate limiting, helmet, CORS, and secure session management
  - Cloudinary integration for profile images

---

## Tech Stack

- **Backend:** Node.js, Express, MongoDB, Mongoose, Passport, JWT, Socket.io
- **Frontend:** HTML5, CSS3, Bootstrap, Vanilla JavaScript
- **Other:** Cloudinary, Nodemailer, SendGrid, Multer, dotenv

---

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- MongoDB (local or Atlas)

### Environment Variables
Create a `.env` file in the root directory with the following variables:

```
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_email_address
EMAIL_PASS=your_email_password
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Installation
```bash
# Install dependencies
npm install

# Start the server
npm run dev
# or
npm start
```

The app will be available at `http://localhost:3000` by default.

---

## Usage

1. **Sign Up:** Register as a student or alumni, providing required details.
2. **Login:** Access your dashboard, update your profile, and start connecting.
3. **Network:** Search for people, send connection requests, and accept/decline requests.
4. **Posts:** Share updates, job opportunities, queries, or images with your network.
5. **Chat:** Start real-time conversations with your connections.
6. **Send Mail:** Email your connections directly from the platform.
7. **Events:** Explore and register for upcoming networking events.

---

## Folder Structure

```
├── models/           # Mongoose models (User, Post, Message, etc.)
├── public/           # Static frontend files (HTML, CSS, JS, images)
├── views/            # (If using server-side rendering/templates)
├── server.js         # Main Express server
├── package.json      # Project metadata and dependencies
└── .env              # Environment variables (not committed)
```

---

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for improvements or bug fixes.

---

## License

This project is licensed under the MIT License.

---

## Acknowledgements
- Inspired by leading alumni and professional networking platforms.
- Built with ❤️ by the EduNet team.
