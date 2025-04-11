const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const passport = require('passport');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const cookieParser = require('cookie-parser');
const socketIO = require('socket.io');

// Load environment variables first, before any database connection
require('dotenv').config();

const app = express();
const server = require('http').createServer(app);
const io = socketIO(server);

// Configure nodemailer with business email
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verify transporter connection
transporter.verify(function(error, success) {
    if (error) {
        console.error('Email server connection error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

// Try to import the ProfileView model if it exists
let ProfileView;
try {
    ProfileView = require('./models/ProfileView');
} catch (err) {
    console.log('ProfileView model not found. Profile view tracking will be limited.');
}

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// Add timestamp validation for Cloudinary
cloudinary.config().private_cdn = true;

// Configure Multer for memory storage
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb('Error: Images only (jpeg, jpg, png)!');
    }
  }
});

// MongoDB connection with retry logic
const connectWithRetry = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            maxPoolSize: 10, // Maintain up to 10 socket connections
            minPoolSize: 5, // Maintain at least 5 socket connections
            retryWrites: true,
            retryReads: true
        });
        console.log('MongoDB connected successfully');
    } catch (err) {
        console.error('MongoDB connection error:', err);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
    }
};

// Initial connection attempt
connectWithRetry();

// Handle connection events
mongoose.connection.on('error', err => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected. Attempting to reconnect...');
    connectWithRetry();
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected successfully');
});

let isServerListening = false;

// Function to schedule automatic student to alumni conversion
function scheduleStudentToAlumniConversion() {
    // Run the conversion immediately when server starts
    checkAndConvertAllGraduatedStudents();
    
    // Then schedule it to run daily at midnight
    const now = new Date();
    const night = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1, // tomorrow
        0, // hours (midnight)
        0, // minutes
        0  // seconds
    );
    
    // Calculate milliseconds until midnight
    const msUntilMidnight = night.getTime() - now.getTime();
    
    // Schedule first run at next midnight
    setTimeout(() => {
        checkAndConvertAllGraduatedStudents();
        
        // Then schedule to run every 24 hours
        setInterval(checkAndConvertAllGraduatedStudents, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);
    
    console.log(`Automatic student to alumni conversion scheduled to run daily at midnight. First run in ${Math.round(msUntilMidnight / (1000 * 60 * 60))} hours.`);
}

// Function to check all students and convert them to alumni if their graduation year has passed
async function checkAndConvertAllGraduatedStudents() {
    try {
        console.log('Running scheduled student to alumni conversion check...');
        
        const currentYear = new Date().getFullYear();
        
        // Find all students whose graduation year has passed
        const studentsToConvert = await User.find({
            userType: 'student',
            yearofgrad: { $lte: currentYear }
        }).select('_id firstname lastname email yearofgrad');
        
        console.log(`Found ${studentsToConvert.length} students to convert to alumni status.`);
        
        if (studentsToConvert.length === 0) {
            return;
        }
        
        // Update all matching students to alumni
        const updateResult = await User.updateMany(
            { _id: { $in: studentsToConvert.map(s => s._id) } },
            { 
                $set: { 
                    userType: 'alumni',
                    updatedAt: new Date()
                } 
            }
        );
        
        console.log(`Successfully converted ${updateResult.modifiedCount} students to alumni status.`);
        
        // Log the details of converted users
        for (const student of studentsToConvert) {
            console.log(`Converted: ${student.firstname} ${student.lastname} (${student.email}) - Graduated: ${student.yearofgrad}`);
        }
    } catch (error) {
        console.error('Error in scheduled student to alumni conversion:', error);
    }
}

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
    console.log('📡 MongoDB disconnected');
    setTimeout(connectWithRetry, 5000);
});

mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB error:', err);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

const userSchema = new mongoose.Schema({
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { 
        type: String, 
        required: true, 
        unique: true,
        index: true
    },
    phone: { type: String, required: true },
    yearofadmission: { type: Number },
    yearofgrad: { type: Number },
    department: { type: String },
    dateofbirth: { type: Date, required: true },
    userType: { type: String, required: true, enum: ['student', 'alumni'] },
    password: { type: String, required: true },
    collegeName: String,
    collegeId: String,
    employed: String,
    designation: String,
    companyname: String,
    companylocation: String,
    linkedin: String,
    about: String,
    resetToken: String,
    resetTokenExpires: Date,
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    profileViews: { type: Number, default: 0 },
    visibility: { type: Boolean, default: true },
    country: { type: String, required: true },
    courseName: { type: String },
    profilePicture: {
        url: String,
        publicId: String
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Add text indexes for search
userSchema.index({
    firstname: 'text',
    lastname: 'text',
    country: 'text',
    department: 'text',
    collegeName: 'text',
    courseName: 'text'
});

userSchema.index({ email: 1, userType: 1 });

const User = mongoose.model('User', userSchema);

// Before the Post model definition, add the FriendRequest schema definition
const friendRequestSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { 
        type: String, 
        enum: ['pending', 'accepted', 'rejected'], 
        default: 'pending' 
    },
    createdAt: { type: Date, default: Date.now }
});

const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

// After the User model, update the Post schema
const postSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    content: { 
        type: String, 
        required: true 
    },
    postType: { 
        type: String, 
        enum: ['general', 'job', 'query', 'image'],
        default: 'general'
    },
    imageUrl: String,
    jobDetails: {
        company: String,
        position: String,
        location: String,
        applyLink: String
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        content: String,
        createdAt: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

const Post = mongoose.model('Post', postSchema);

app.set('trust proxy', true);

app.use(session({
    secret: process.env.JWT_SECRET || 'your_jwt_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://res.cloudinary.com", "https://*", "http://*"],
            connectSrc: ["'self'", "ws:", "wss:"],
            scriptSrcAttr: ["'unsafe-inline'"]
        }
    },
    crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// API rate limiter - only for API endpoints
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // 500 requests per window (significantly increased)
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many API requests, please try again later.',
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket?.remoteAddress;
    }
});

// Page rate limiter - for HTML pages
const pageLimiter = rateLimit({
    windowMs: 2 * 60 * 1000, // 2 minutes window (reduced)
    max: 200, // 200 requests per 2 minutes (very generous)
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many page requests, please try again shortly.',
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket?.remoteAddress;
    }
});

// Special rate limiter for dashboard and network pages
const dashboardLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many dashboard requests, please try again shortly.',
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket?.remoteAddress;
    }
});

// Authentication pages limiter - extremely generous
const authPagesLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 500, // 500 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many authentication requests, please try again shortly.',
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket?.remoteAddress;
    }
});

// Special API endpoints that need higher limits
const highVolumeApiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 150, // 150 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests to this API, please try again shortly.',
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket?.remoteAddress;
    }
});

// User profile endpoint rate limiter
const profileLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120, // 120 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many profile requests, please try again shortly.',
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket?.remoteAddress;
    }
});

// Email sending rate limiter
const emailLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 10, // 10 email sends per 5 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many email requests, please try again later.',
    keyGenerator: (req) => {
        return req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress ||
               req.connection.socket?.remoteAddress;
    }
});

// IMPORTANT: Order of middleware matters - static files should be served without limits
// Serve static files without rate limiting
app.use(express.static('public', {
    maxAge: '1d', // Add client-side caching to reduce requests
    etag: true,   // Enable ETag for better caching
    lastModified: true // Enable Last-Modified for better caching
}));

// Add specific Cache-Control headers for images and other static assets
app.use('/images', (req, res, next) => {
    res.set('Cache-Control', 'public, max-age=86400'); // Cache images for 1 day
    next();
});

app.use('/css', (req, res, next) => {
    res.set('Cache-Control', 'public, max-age=86400'); // Cache CSS for 1 day
    next();
});

app.use('/js', (req, res, next) => {
    res.set('Cache-Control', 'public, max-age=86400'); // Cache JS for 1 day
    next();
});

// Only apply rate limiters after static files are handled
// Apply specific API endpoint limiters first
app.use('/api/user/profile', profileLimiter);
app.use('/api/user/:userId/profile', profileLimiter);
app.use('/api/users/suggestions', highVolumeApiLimiter);
app.use('/api/users/recent', highVolumeApiLimiter);
app.use('/api/email/send', emailLimiter);
app.use('/api/', apiLimiter);

// Add middleware to show remaining rate limit in response
app.use((req, res, next) => {
    // Add remaining rate limit info to response headers for debugging
    res.on('finish', () => {
        if (res.statusCode === 429) {
            console.warn(`⚠️ Rate limit exceeded for ${req.method} ${req.originalUrl} from ${req.ip}`);
        }
        
        const remaining = res.getHeader('X-RateLimit-Remaining');
        const limit = res.getHeader('X-RateLimit-Limit');
        
        if (remaining !== undefined && limit !== undefined) {
            const usagePercent = 100 - (parseInt(remaining) / parseInt(limit)) * 100;
            
            // Log when usage is high
            if (usagePercent > 80) {
                console.warn(`⚠️ High rate limit usage (${usagePercent.toFixed(1)}%) for ${req.method} ${req.originalUrl}`);
            }
        }
    });
    
    next();
});

// Middleware for adding cache-control headers
app.use((req, res, next) => {
    // Add cache-control headers
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// Add this code before your routes
const authMiddleware = (req, res, next) => {
    try {
        // Get token from header, cookie, or query parameter
        const token = req.cookies.token || 
                      req.header('Authorization')?.replace('Bearer ', '') || 
                      req.query.token;
        
        console.log('Auth attempt for:', req.path);
        console.log('Token present:', !!token);
        
        if (!token) {
            console.log('No auth token found, redirecting to login');
            return res.redirect('/login');
        }

        // Verify token
        jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, decoded) => {
            if (err) {
                console.error('Token verification failed:', err.message);
                return res.redirect('/login');
            }
            
            // Token is valid, add user data to request
            console.log('Auth successful for user:', decoded.userId);
            req.user = decoded;
            next();
        });
        
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.redirect('/login');
    }
};

// Routes - apply specific limiters
app.get('/', pageLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/login', authPagesLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/signup', authPagesLimiter, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

// Middleware to verify JWT for protected routes
const verifyAuthToken = (req, res, next) => {
    // Check for JWT in cookie or authorization header
    const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
        // Redirect to login page if no token found
        return res.redirect('/login');
    }
    
    try {
        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        next();
    } catch (error) {
        // Redirect to login if token is invalid or expired
        console.log('Invalid token, redirecting to login:', error.message);
        return res.redirect('/login');
    }
};

// Dashboard route
app.get('/dashboard', (req, res) => {
    console.log('Dashboard route accessed');
    console.log('Cookies received:', req.cookies);
    console.log('Auth header:', req.headers.authorization);
    
    // Always serve the dashboard HTML page
    // Token validation will happen on the client side
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/profile', dashboardLimiter, verifyAuthToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

app.get('/network', dashboardLimiter, verifyAuthToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'network.html'));
});

app.get('/chat', dashboardLimiter, verifyAuthToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Add a more specific route for exact path match
app.get('/chat/', dashboardLimiter, verifyAuthToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/sendmail', dashboardLimiter, verifyAuthToken, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'sendmail.html'));
});

// Function to check and update student to alumni status
async function checkAndUpdateGraduationStatus(user) {
    try {
        // Only process if user is a student and has a graduation year
        if (user.userType === 'student' && user.yearofgrad) {
            const currentYear = new Date().getFullYear();
            
            // If current year is equal to or greater than graduation year, convert to alumni
            if (currentYear >= user.yearofgrad) {
                console.log(`Converting user ${user._id} from student to alumni - graduation year ${user.yearofgrad} has passed`);
                
                // Update user type to alumni
                await User.findByIdAndUpdate(user._id, {
                    userType: 'alumni',
                    updatedAt: new Date()
                });
                
                // Return true to indicate user was updated
                return true;
            }
        }
        // No update needed
        return false;
    } catch (error) {
        console.error('Error checking graduation status:', error);
        return false;
    }
}

// Authentication Routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await User.findOne({ email }).maxTimeMS(5000);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Check if student should be converted to alumni based on graduation year
        const wasUpdated = await checkAndUpdateGraduationStatus(user);
        
        // If user type was updated, get the updated user data
        const updatedUser = wasUpdated ? 
            await User.findById(user._id) : user;

        const token = jwt.sign(
            { userId: updatedUser._id, email: updatedUser.email },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '24h' }
        );

        // Set JWT as a cookie as well as returning it in the response
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });

        res.json({ 
            token, 
            userId: updatedUser._id, 
            userType: updatedUser.userType,
            wasConverted: wasUpdated
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Error logging in. Please try again.' });
    }
});

// Setup dedicated form parser for signup
const signupUpload = upload.single('profilePicture');

app.post('/api/auth/signup', upload.single('profilePicture'), async (req, res) => {
    try {
        console.log('Signup endpoint hit');
        
        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            throw new Error('Database connection not ready');
        }
        
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        
        console.log("File uploaded successfully");
        console.log("Form fields received:", Object.keys(req.body));
        
        try {
            // Add courseName to required fields
            const requiredFields = [
                'email', 'password', 'firstname', 'lastname', 'phone', 
                'dateofbirth', 'userType', 'country', 'courseName'
            ];
            
            // Check required fields with detailed logging
            const missingFields = [];
            for (const field of requiredFields) {
                if (!req.body[field]) {
                    missingFields.push(field);
                }
            }
            
            if (missingFields.length > 0) {
                console.error('Missing required fields:', missingFields);
                return res.status(400).json({ 
                    error: `Missing required fields: ${missingFields.join(', ')}` 
                });
            }
            
            console.log("All required fields present");

            // Check if email already exists
            const existingUser = await User.findOne({ email: req.body.email });
            if (existingUser) {
                console.log("Email already registered:", req.body.email);
                return res.status(400).json({ error: 'Email already registered' });
            }
            
            console.log("Email is available");

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(req.body.password, salt);
            
            console.log("Password hashed successfully");

            // Create new user with proper data parsing
            const userData = {
                ...req.body,
                password: hashedPassword,
                dateofbirth: new Date(req.body.dateofbirth),
                yearofadmission: req.body.yearofadmission ? parseInt(req.body.yearofadmission) : null,
                yearofgrad: req.body.yearofgrad ? parseInt(req.body.yearofgrad) : null,
                collegeName: req.body.collegeName || 'Other',
                userType: req.body.userType || 'student'
            };
            
            console.log("User data prepared");

            // Handle profile picture upload if provided
            if (req.file) {
                console.log("Processing profile picture");
                
                // Convert buffer to base64
                const b64 = Buffer.from(req.file.buffer).toString('base64');
                const dataURI = `data:${req.file.mimetype};base64,${b64}`;

                // Upload to Cloudinary
                const timestamp = Math.floor(Date.now() / 1000);
                const publicId = `user_signup_${Date.now()}`;
                
                console.log("Uploading to Cloudinary...");
                
                const result = await cloudinary.uploader.upload(dataURI, {
                    folder: 'profile_pictures',
                    public_id: publicId,
                    timestamp: timestamp,
                    overwrite: true,
                    resource_type: 'image',
                    width: 400,
                    height: 400,
                    crop: 'fill',
                    gravity: 'face'
                });
                
                console.log("Cloudinary upload successful");

                // Add profile picture data to user data
                userData.profilePicture = {
                    url: result.secure_url,
                    publicId: result.public_id
                };
            }

            console.log("Creating user in database");
            const user = new User(userData);
            await user.save();
            console.log("User saved to database successfully");

            const token = jwt.sign(
                { userId: user._id, email: user.email },  // Payload
                process.env.JWT_SECRET || 'your_jwt_secret', // Secret key
                { expiresIn: '24h' } // Token expiration
            );
            
            console.log("JWT token generated");

            // Set JWT as a cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
                path: '/'
            });
            
            console.log("Auth cookie set");

            // Send response to client
            console.log("Sending success response");
            res.status(201).json({
                success: true,
                message: 'Account created successfully',
                token,
                userId: user._id
            });
            
            console.log("Signup process completed successfully");

        } catch (error) {
            console.error('Signup error:', error);
            if (error.code === 11000) {
                return res.status(400).json({ error: 'Email already exists' });
            }
            res.status(500).json({ error: 'Error creating account' });
        }
    } catch (error) {
        console.error('Signup error:', error);
        if (error.message === 'Database connection not ready') {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again in a few moments.' });
        } else {
            res.status(500).json({ error: 'An error occurred during signup. Please try again.' });
        }
    }
});

app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const resetToken = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET || 'your_jwt_secret',
            { expiresIn: '1h' }
        );

        // Use findByIdAndUpdate instead of save() to avoid full validation
        await User.findByIdAndUpdate(
            user._id,
            {
                $set: {
                    resetToken: resetToken,
                    resetTokenExpires: Date.now() + 3600000 // 1 hour
                }
            },
            { new: true }
        );

        const resetUrl = `${req.protocol}://${req.get('host')}/reset-password?token=${resetToken}`;
        
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: 'Password Reset Request',
            html: `
                <h1>Password Reset Request</h1>
                <p>Click the link below to reset your password. This link will expire in 1 hour.</p>
                <a href="${resetUrl}">Reset Password</a>
                <p>If you didn't request this, please ignore this email.</p>
            `
        };

        await transporter.sendMail(mailOptions);
        res.json({ message: 'Password reset email sent' });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Error processing request' });
    }
});

app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
        const user = await User.findOne({
            _id: decoded.userId,
            resetToken: token,
            resetTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Use findByIdAndUpdate instead of save() to avoid validation
        await User.findByIdAndUpdate(
            user._id,
            {
                $set: {
                    password: hashedPassword,
                    resetToken: undefined,
                    resetTokenExpires: undefined
                }
            },
            { new: true }
        );

        res.json({ message: 'Password reset successful' });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Error resetting password' });
    }
});

// Profile Routes
app.get('/api/user/profile', authenticateToken, async (req, res) => {
    try {
        // Validate user ID from token
        if (!req.user || !req.user.userId) {
            return res.status(401).json({ error: 'Invalid authentication token' });
        }

        // Get the requested profile ID (if viewing someone else's profile)
        const requestedProfileId = req.query.userId || req.user.userId;
        const isOwnProfile = requestedProfileId === req.user.userId;
        
        // Check if this is a refresh request (from the ?refresh=true parameter)
        const isRefresh = req.query.refresh === 'true';
        
        // Get client IP for better tracking
        const clientIP = req.headers['x-forwarded-for'] || 
                        req.connection.remoteAddress || 
                        req.socket.remoteAddress ||
                        req.connection.socket?.remoteAddress;

        // Find user with better error handling
        const user = await User.findById(requestedProfileId)
            .select('-password -resetToken -resetTokenExpires')
            .populate('connections', 'firstname lastname userType collegeName designation companyname profilePicture')
            .maxTimeMS(5000)
            .lean();
            
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If viewing own profile, check if student should be converted to alumni
        if (isOwnProfile) {
            const statusChanged = await checkAndUpdateGraduationStatus(user);
            if (statusChanged) {
                // If status changed, fetch updated user data
                const updatedUser = await User.findById(requestedProfileId)
                    .select('-password -resetToken -resetTokenExpires')
                    .populate('connections', 'firstname lastname userType collegeName designation companyname profilePicture')
                    .maxTimeMS(5000)
                    .lean();
                
                // Use updated user data for the rest of the function
                Object.assign(user, updatedUser);
                // Add notification that status was changed
                user.wasConverted = true;
            }
        }

        // Only increment profile views when someone else views the profile
        // AND this is not a refresh request
        if (!isOwnProfile && !isRefresh) {
            try {
                if (ProfileView) {
                    // Create a session key for the current view attempt
                    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                    
                    // Try to create a view record - this will fail if the unique index is violated
                    try {
                        const newView = new ProfileView({
                            viewerId: req.user.userId,
                            profileId: requestedProfileId,
                            timestamp: new Date(),
                            viewDate: today,
                            ipAddress: clientIP // Store IP for better tracking
                        });
                        
                        await newView.save();
                        
                        // Only increment count if we successfully saved the view
                        await User.findByIdAndUpdate(requestedProfileId, {
                            $inc: { profileViews: 1 }
                        });
                        
                        console.log(`Profile view recorded: ${req.user.userId} viewed ${requestedProfileId}`);
                    } catch (saveError) {
                        if (saveError.code === 11000) {
                            // Duplicate key error (user already viewed profile today)
                            console.log(`Duplicate view rejected: ${req.user.userId} already viewed ${requestedProfileId} today`);
                        } else {
                            throw saveError;
                        }
                    }
                } else {
                    // Fallback if ProfileView model doesn't exist
                    console.log('ProfileView model not available, using session tracking');
                    
                    // Use simpler approach by storing in the user's session (if available)
                    if (req.session) {
                        const viewKey = `viewed_${requestedProfileId}`;
                        if (!req.session[viewKey]) {
                            await User.findByIdAndUpdate(requestedProfileId, {
                                $inc: { profileViews: 1 }
                            });
                            req.session[viewKey] = Date.now();
                        }
                    } else {
                        // Least reliable option - just increment if not refresh
                        await User.findByIdAndUpdate(requestedProfileId, {
                            $inc: { profileViews: 1 }
                        });
                    }
                }
            } catch (error) {
                console.error('Error tracking profile view:', error);
                // Continue execution even if tracking fails
            }
        } else if (isOwnProfile) {
            console.log('Own profile view - not incrementing count');
        } else if (isRefresh) {
            console.log('Page refresh detected - not incrementing count');
        }

        // Add timestamp to response
        user.lastViewed = new Date();
        // Add a flag to indicate if this is the user's own profile
        user.isOwnProfile = isOwnProfile;

        // Hide email and phone for other users' profiles
        if (!isOwnProfile) {
            user.email = "Hidden for privacy";
            user.phone = "Hidden for privacy";
        }

        res.json(user);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            error: 'Error fetching profile',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

app.put('/api/user/profile/update', authenticateToken, async (req, res) => {
    try {
        const updates = {
            firstname: req.body.firstname,
            lastname: req.body.lastname,
            phone: req.body.phone,
            about: req.body.about,
            employed: req.body.employed,
            designation: req.body.designation,
            companyname: req.body.companyname,
            companylocation: req.body.companylocation,
            linkedin: req.body.linkedin,
            visibility: req.body.visibility,
            updatedAt: new Date()
        };

        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { $set: updates },
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ 
            error: 'Error updating profile',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Profile picture upload route
app.post('/api/user/profile/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Delete previous profile picture if it exists
        if (user.profilePicture?.publicId) {
            try {
                await cloudinary.uploader.destroy(user.profilePicture.publicId, {
                    invalidate: true
                });
            } catch (deleteError) {
                console.warn('Failed to delete old image:', deleteError);
                // Continue with upload even if delete fails
            }
        }

        // Convert buffer to base64
        const b64 = Buffer.from(req.file.buffer).toString('base64');
        const dataURI = `data:${req.file.mimetype};base64,${b64}`;

        // Upload to Cloudinary
        const timestamp = Math.floor(Date.now() / 1000);
        const publicId = `user_${req.user.userId}_${Date.now()}`;
        
        const result = await cloudinary.uploader.upload(dataURI, {
            folder: 'profile_pictures',
            public_id: publicId,
            timestamp: timestamp,
            overwrite: true,
            resource_type: 'image',
            width: 400,
            height: 400,
            crop: 'fill',
            gravity: 'face'
        });

        // Update user's profile picture
        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            {
                $set: {
                    'profilePicture.url': result.secure_url,
                    'profilePicture.publicId': result.public_id,
                    'updatedAt': new Date()
                }
            },
            { new: true }
        ).select('-password');

        res.json({
            message: 'Profile picture updated successfully',
            profilePicture: updatedUser.profilePicture
        });

    } catch (error) {
        console.error('Profile picture upload error:', error);
        res.status(500).json({
            error: 'Error uploading profile picture',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Network Routes
app.post('/api/connections/connect', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        console.log(`Connection request received: ${req.user.userId} wants to connect with ${userId}`);
        
        if (!userId) {
            console.log('Connection request missing userId');
            return res.status(400).json({ error: 'Missing user ID' });
        }
        
        // Validate users exist
        const currentUser = await User.findById(req.user.userId);
        if (!currentUser) {
            console.log('Current user not found:', req.user.userId);
            return res.status(404).json({ error: 'Current user not found' });
        }
        
        const targetUser = await User.findById(userId);
        if (!targetUser) {
            console.log('Target user not found:', userId);
            return res.status(404).json({ error: 'Target user not found' });
        }
        
        // Check if already connected
        const alreadyConnected = currentUser.connections && 
                                 currentUser.connections.some(id => id.toString() === userId);
        
        if (alreadyConnected) {
            console.log('Users are already connected');
            return res.status(200).json({ 
                message: 'Already connected',
                connectionsCount: currentUser.connections.length
            });
        }
        
        // Add connection to both users
        console.log('Adding connection between users');
        await User.findByIdAndUpdate(
            req.user.userId,
            { $addToSet: { connections: userId } }
        );
        
        await User.findByIdAndUpdate(
            userId,
            { $addToSet: { connections: req.user.userId } }
        );
        
        // Get updated connections count
        const updatedUser = await User.findById(req.user.userId);
        const connectionsCount = updatedUser.connections.length;
        
        console.log(`Connection successful, user now has ${connectionsCount} connections`);
        
        res.status(200).json({
            message: 'Connected successfully',
            connectionsCount
        });
    } catch (error) {
        console.error('Error connecting users:', error);
        res.status(500).json({ error: 'Failed to connect users' });
    }
});

// Simple Friend Requests route to prevent 404 errors in client
app.get('/api/friends/requests', authenticateToken, (req, res) => {
    // Return empty array since friend requests aren't implemented
    res.json([]);
});

// Message API Endpoints
app.get('/api/messages/:userId', authenticateToken, async (req, res) => {
    try {
        const Message = require('./models/Message');
        const userId = req.params.userId;
        const currentUserId = req.user.userId;
        
        // Fetch messages between these two users
        const messages = await Message.find({
            $or: [
                { sender: currentUserId, recipient: userId },
                { sender: userId, recipient: currentUserId }
            ]
        })
        .sort({ timestamp: 1 })
        .limit(100);
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ error: 'Failed to fetch message history' });
    }
});

// Store a new message
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const Message = require('./models/Message');
        const { recipient, content, chatId } = req.body;
        
        if (!recipient || !content) {
            return res.status(400).json({ error: 'Recipient and content are required' });
        }
        
        const newMessage = new Message({
            sender: req.user.userId,
            recipient,
            content,
            timestamp: new Date(),
            chatId: chatId || undefined
        });
        
        await newMessage.save();
        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Error saving message:', error);
        res.status(500).json({ error: 'Failed to save message' });
    }
});

// Get messages for a group chat
app.get('/api/messages/group/:chatId', authenticateToken, async (req, res) => {
    try {
        const Message = require('./models/Message');
        const chatId = req.params.chatId;
        
        // Fetch messages for this chat ID
        const messages = await Message.find({ chatId })
            .sort({ timestamp: 1 })
            .limit(100)
            .populate('sender', 'firstname lastname profilePicture');
        
        res.json(messages);
    } catch (error) {
        console.error('Error fetching group messages:', error);
        res.status(500).json({ error: 'Failed to fetch group message history' });
    }
});

// Delete a message
app.delete('/api/messages/:id', authenticateToken, async (req, res) => {
    try {
        const Message = require('./models/Message');
        const messageId = req.params.id;
        
        // Find the message
        const message = await Message.findById(messageId);
        
        if (!message) {
            return res.status(404).json({ error: 'Message not found' });
        }
        
        // Check if the user is the sender of the message
        if (message.sender.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'You can only delete your own messages' });
        }
        
        // Delete the message
        await Message.findByIdAndDelete(messageId);
        
        res.status(200).json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
});

app.get('/api/connections', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .populate('connections', '-password -connections')
            .select('connections');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user.connections);
    } catch (error) {
        console.error('Fetch connections error:', error);
        res.status(500).json({ error: 'Error fetching connections' });
    }
});

app.get('/api/users/recent', authenticateToken, async (req, res) => {
    try {
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        
        const users = await User.find(
            // Exclude current user
            { _id: { $ne: req.user.userId }, visibility: true },
            { password: 0, resetToken: 0, resetTokenExpires: 0 }
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        res.json(users);
    } catch (error) {
        console.error('Error fetching recent users:', error);
        res.status(500).json({ error: 'Failed to fetch recent users' });
    }
});

app.get('/api/users/suggestions', authenticateToken, async (req, res) => {
    try {
        console.log('Suggestions API called by user:', req.user.userId);
        // Get pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        
        // Get current user with connections
        const currentUser = await User.findById(req.user.userId)
            .select('connections collegeName')
            .lean();
        
        if (!currentUser) {
            console.log('User not found for suggestions:', req.user.userId);
            return res.status(404).json({ error: 'User not found' });
        }
        
        console.log('Current user college name:', currentUser.collegeName);
        
        // Get all connections for current user
        const connections = currentUser.connections || [];
        console.log('Current user connections count:', connections.length);
        
        // Get all user IDs with pending friend requests
        let pendingRequestUserIds = [];
        try {
            const pendingRequests = await FriendRequest.find({
                $or: [
                    { sender: req.user.userId },
                    { receiver: req.user.userId }
                ],
                status: 'pending'
            }).lean();
            
            pendingRequestUserIds = pendingRequests.map(request => 
                request.sender.toString() === req.user.userId 
                    ? request.receiver.toString() 
                    : request.sender.toString()
            );
            console.log('Pending friend requests count:', pendingRequestUserIds.length);
        } catch (err) {
            console.log('Friend requests may not be enabled:', err.message);
        }
        
        // Combine IDs to exclude from suggestions
        const excludeIds = [
            req.user.userId, 
            ...connections.map(id => id.toString()),
            ...pendingRequestUserIds
        ];
        console.log('Total excluded IDs count:', excludeIds.length);
        
        // First try to get suggestions from the same college
        let collegeQuery = {};
        if (currentUser.collegeName && currentUser.collegeName.length > 0) {
            collegeQuery = { collegeName: currentUser.collegeName };
            console.log('Filtering suggestions by college:', currentUser.collegeName);
        } else {
            console.log('User has no college name, showing all suggestions');
        }
        
        // Find users to suggest from the same college
        let suggestions = await User.find(
            { 
                _id: { $nin: excludeIds },
                visibility: true,
                ...collegeQuery
            },
            { password: 0, resetToken: 0, resetTokenExpires: 0 }
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
        
        console.log('Found college suggestions count:', suggestions.length);
        
        // If we didn't find any suggestions from the same college or user has no college,
        // get suggestions from any college
        if (suggestions.length === 0 && currentUser.collegeName) {
            console.log('No suggestions from same college, fetching from any college');
            suggestions = await User.find(
                { 
                    _id: { $nin: excludeIds },
                    visibility: true
                },
                { password: 0, resetToken: 0, resetTokenExpires: 0 }
            )
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();
            
            console.log('Found general suggestions count:', suggestions.length);
        }
        
        // Get all connected users to return for reference
        const connectedUsers = await User.find(
            { _id: { $in: connections } },
            { _id: 1, firstname: 1, lastname: 1, profilePicture: 1 }
        ).lean();
        
        console.log('Connected users count:', connectedUsers.length);
        
        // Return suggestions with connection data
        res.json({
            users: suggestions,
            connections: connectedUsers.map(user => user._id.toString()),
            page,
            limit,
            total: suggestions.length
        });
    } catch (error) {
        console.error('Error getting suggestions:', error);
        res.status(500).json({ error: 'Failed to get suggestions' });
    }
});

app.get('/api/users/search', authenticateToken, async (req, res) => {
    try {
        const { query } = req.query;
        
        console.log('Search API called with query:', query);
        
        if (!query) {
            console.log('No search query provided');
            return res.status(400).json({ error: 'Search query is required' });
        }

        // Allow searching by multiple fields
        const users = await User.find(
            {
                $or: [
                    { firstname: { $regex: query, $options: 'i' } },
                    { lastname: { $regex: query, $options: 'i' } },
                    { email: { $regex: query, $options: 'i' } },
                    { collegeName: { $regex: query, $options: 'i' } },
                    { companyname: { $regex: query, $options: 'i' } },
                    { department: { $regex: query, $options: 'i' } },
                    { designation: { $regex: query, $options: 'i' } }
                ],
                _id: { $ne: req.user.userId }, // Exclude current user
                visibility: true
            },
            {
                password: 0,
                resetToken: 0,
                resetTokenExpires: 0
            }
        )
        .limit(20);

        console.log('Search found', users.length, 'results');
        res.json(users);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Error searching users' });
    }
});

// View another user's profile
app.get('/api/user/:userId/profile', authenticateToken, async (req, res) => {
    try {
        const viewerId = req.user.userId;
        const viewedUserId = req.params.userId;
        
        // Get client IP for better tracking
        const clientIP = req.headers['x-forwarded-for'] || 
                        req.connection.remoteAddress || 
                        req.socket.remoteAddress ||
                        req.connection.socket?.remoteAddress;
        
        // Check if this is a refresh request
        const isRefresh = req.query.refresh === 'true';
        
        // Prevent incrementing view count if viewing own profile
        if (viewerId === viewedUserId) {
            return res.redirect('/api/user/profile');
        }
        
        // Find user with better error handling
        const user = await User.findById(viewedUserId)
            .select('-password -resetToken -resetTokenExpires')
            .populate('connections', 'firstname lastname userType collegeName designation companyname profilePicture')
            .maxTimeMS(5000)
            .lean();
            
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // Check if the profile is visible
        if (!user.visibility) {
            return res.status(403).json({ error: 'This profile is private' });
        }

        // Only track view if this is not a refresh
        if (!isRefresh) {
            try {
                if (ProfileView) {
                    // Create a session key for the current view attempt
                    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                    
                    // Try to create a view record - this will fail if the unique index is violated
                    try {
                        const newView = new ProfileView({
                            viewerId: viewerId,
                            profileId: viewedUserId,
                            timestamp: new Date(),
                            viewDate: today,
                            ipAddress: clientIP
                        });
                        
                        await newView.save();
                        
                        // Only increment count if we successfully saved the view
                        await User.findByIdAndUpdate(viewedUserId, {
                            $inc: { profileViews: 1 }
                        });
                        
                        console.log(`Profile view recorded: ${viewerId} viewed ${viewedUserId}`);
                    } catch (saveError) {
                        if (saveError.code === 11000) {
                            // Duplicate key error (user already viewed profile today)
                            console.log(`Duplicate view rejected: ${viewerId} already viewed ${viewedUserId} today`);
                        } else {
                            throw saveError;
                        }
                    }
                } else {
                    // Fallback method without ProfileView model
                    await User.findByIdAndUpdate(viewedUserId, {
                        $inc: { profileViews: 1 }
                    });
                }
            } catch (error) {
                console.error('Error tracking profile view:', error);
                // Continue execution even if tracking fails
            }
        } else {
            console.log('Page refresh detected - not incrementing count');
        }
        
        // Add timestamp and set isOwnProfile to false
        user.lastViewed = new Date();
        user.isOwnProfile = false;
        
        // Hide email and phone for privacy when viewing other users' profiles
        user.email = "Hidden for privacy";
        user.phone = "Hidden for privacy";

        res.json(user);
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            error: 'Error fetching profile',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get profile view statistics
app.get('/api/user/profile/views', authenticateToken, async (req, res) => {
    try {
        if (!ProfileView) {
            // If ProfileView model doesn't exist, return empty stats
            return res.json({
                totalViews: 0,
                recentViews: []
            });
        }
        
        const userId = req.user.userId;
        
        // Get the total number of views
        const totalViews = await User.findById(userId)
            .select('profileViews')
            .lean();
            
        // Get recent views with viewer details
        const recentViews = await ProfileView.find({ profileId: userId })
            .sort({ timestamp: -1 })
            .limit(10)
            .populate('viewerId', 'firstname lastname profilePicture')
            .lean();
            
        // Format the response
        const formattedViews = recentViews.map(view => ({
            viewerId: view.viewerId._id,
            name: `${view.viewerId.firstname} ${view.viewerId.lastname}`,
            profilePicture: view.viewerId.profilePicture?.url,
            timestamp: view.timestamp
        }));
        
        res.json({
            totalViews: totalViews.profileViews || 0,
            recentViews: formattedViews
        });
    } catch (error) {
        console.error('Error fetching profile views:', error);
        res.status(500).json({ 
            error: 'Error fetching profile views',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Send email to connections
app.post('/api/email/send', emailLimiter, authenticateToken, async (req, res) => {
    try {
        const { recipients, subject, message } = req.body;
        
        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({ error: 'At least one recipient is required' });
        }
        
        if (!subject || !message) {
            return res.status(400).json({ error: 'Subject and message are required' });
        }
        
        // Get current user details
        const sender = await User.findById(req.user.userId)
            .select('firstname lastname email')
            .lean();
            
        if (!sender) {
            return res.status(404).json({ error: 'Sender profile not found' });
        }
        
        // Get recipient email addresses
        const recipientUsers = await User.find({
            _id: { $in: recipients },
            connections: req.user.userId // Ensure recipients are connected to the sender
        })
        .select('firstname lastname email')
        .lean();
        
        if (recipientUsers.length === 0) {
            return res.status(404).json({ error: 'No valid recipients found' });
        }
        
        // Create personalized emails for each recipient to avoid spam filters
        const senderFullName = `${sender.firstname} ${sender.lastname}`;
        let successCount = 0;
        
        // Send individual email to each recipient to avoid spam filters
        for (const recipient of recipientUsers) {
            try {
                // Create personalized greeting
                const recipientName = `${recipient.firstname} ${recipient.lastname}`;
                
                // Create a professional email template with minimum spammy characteristics
                const emailHtml = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Message from ${senderFullName}</title>
                    </head>
                    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                        <div style="border-bottom: 1px solid #eee; padding-bottom: 15px; margin-bottom: 20px;">
                            <h2 style="color: #333; margin-top: 0;">${subject}</h2>
                        </div>
                        
                        <p>Hello ${recipientName},</p>
                        
                        <p>${senderFullName} has sent you a message via EduNet:</p>
                        
                        <div style="background-color: #f7f9fc; padding: 15px; border-radius: 4px; margin: 15px 0; border-left: 4px solid #4a6fdc;">
                            ${message.replace(/\n/g, '<br>')}
                        </div>
                        
                        <p>You can reply directly to this email to respond to ${sender.firstname}.</p>
                        
                        <div style="margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; font-size: 13px; color: #666;">
                            <p>This message was sent to you because you are connected with ${senderFullName} on EduNet Alumni Network.</p>
                            <p>EduNet - Connecting alumni and students</p>
                        </div>
                    </body>
                    </html>
                `;
                
                // Set up email with better anti-spam configuration
                const mailOptions = {
                    from: {
                        name: 'EduNet Alumni Network',
                        address: process.env.EMAIL_USER
                    },
                    to: recipient.email,
                    subject: `Message from ${senderFullName}: ${subject}`,
                    html: emailHtml,
                    replyTo: sender.email,
                    headers: {
                        'Precedence': 'Bulk',
                        'X-Auto-Response-Suppress': 'OOF, AutoReply',
                        'X-Entity-Ref-ID': `${new Date().getTime()}-${recipient._id}`
                    },
                    priority: 'normal'
                };
                
                // Send the individual email with better deliverability
                await transporter.sendMail(mailOptions);
                successCount++;
                
                // Add small delay between emails to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 500));
                
            } catch (error) {
                console.error(`Failed to send email to ${recipient.email}:`, error.message);
                // Continue with next recipient even if one fails
            }
        }
        
        if (successCount === 0) {
            throw new Error('Failed to send any emails');
        }
        
        // Log the email send for auditing
        console.log(`Email sent from ${sender.email} to ${successCount} recipients`);
        
        res.json({ 
            success: true, 
            message: `Email sent to ${successCount} of ${recipientUsers.length} recipients` 
        });
        
    } catch (error) {
        console.error('Email sending error:', error);
        res.status(500).json({ 
            error: 'Error sending email',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

function authenticateToken(req, res, next) {
    try {
        // Check for token in multiple locations: authorization header, cookies, or query param
        const authHeader = req.headers['authorization'];
        let token = null;
        
        // Try to get token from authorization header
        if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
        
        // If no token in header, try cookie
        if (!token && req.cookies && req.cookies.token) {
            token = req.cookies.token;
        }
        
        // As a last resort, check query parameter (not recommended for production)
        if (!token && req.query && req.query.token) {
            token = req.query.token;
        }
        
        if (!token) {
            return res.status(401).json({ 
                error: 'Authentication failed',
                message: 'No token provided' 
            });
        }

        jwt.verify(
            token, 
            process.env.JWT_SECRET || 'your_jwt_secret', 
            { algorithms: ['HS256'] },
            (err, decoded) => {
                if (err) {
                    if (err.name === 'TokenExpiredError') {
                        return res.status(401).json({ 
                            error: 'Authentication failed',
                            message: 'Token has expired' 
                        });
                    }
                    return res.status(403).json({ 
                        error: 'Authentication failed',
                        message: 'Invalid token' 
                    });
                }
                
                req.user = {
                    userId: decoded.userId,
                    email: decoded.email,
                    iat: decoded.iat,
                    exp: decoded.exp
                };
                next();
            }
        );
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({ 
            error: 'Server error',
            message: 'Error processing authentication' 
        });
    }
}

// Get unread messages count grouped by sender
app.get('/api/messages/unread', authenticateToken, async (req, res) => {
    try {
        const Message = require('./models/Message');
        
        // Find all unread messages for the current user
        const unreadMessages = await Message.aggregate([
            { 
                $match: { 
                    recipient: new mongoose.Types.ObjectId(req.user.userId),
                    isRead: false
                } 
            },
            {
                $group: {
                    _id: '$sender',
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    senderId: '$_id',
                    count: 1,
                    _id: 0
                }
            }
        ]);
        
        res.status(200).json(unreadMessages);
    } catch (error) {
        console.error('Error getting unread messages:', error);
        res.status(500).json({ error: 'Failed to get unread messages' });
    }
});

// Mark messages as read
app.post('/api/messages/mark-read', authenticateToken, async (req, res) => {
    try {
        const { senderIds } = req.body;
        
        if (!senderIds || !Array.isArray(senderIds)) {
            return res.status(400).json({ error: 'Invalid request. senderIds array is required' });
        }
        
        const Message = require('./models/Message');
        
        // Convert string IDs to ObjectIds
        const senderObjectIds = senderIds.map(id => new mongoose.Types.ObjectId(id));
        
        // Mark all messages from these senders as read
        const result = await Message.updateMany(
            {
                recipient: new mongoose.Types.ObjectId(req.user.userId),
                sender: { $in: senderObjectIds },
                isRead: false
            },
            {
                $set: { isRead: true }
            }
        );
        
        res.status(200).json({ 
            success: true, 
            count: result.modifiedCount,
            message: `Marked ${result.modifiedCount} messages as read`
        });
    } catch (error) {
        console.error('Error marking messages as read:', error);
        res.status(500).json({ error: 'Failed to mark messages as read' });
    }
});

// Set up Socket.io connection handling
io.use((socket, next) => {
    try {
        // Get token from socket handshake auth
        const token = socket.handshake.auth.token;
        
        if (!token) {
            return next(new Error('Authentication error: Token required'));
        }
        
        // Verify the token
        jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret', (err, decoded) => {
            if (err) {
                return next(new Error('Authentication error: Invalid token'));
            }
            
            // Store user data in socket object
            socket.userId = decoded.userId;
            socket.userEmail = decoded.email;
            next();
        });
    } catch (error) {
        next(new Error('Authentication error'));
    }
});

// Track online users
const onlineUsers = new Map();

io.on('connection', (socket) => {
    console.log(`User ${socket.userId} connected`);
    
    // Add user to online users
    onlineUsers.set(socket.userId, socket.id);
    
    // Broadcast user online status to others
    socket.broadcast.emit('user-status', {
        userId: socket.userId,
        status: 'online'
    });
    
    // Handle private messages
    socket.on('private-message', async (data) => {
        try {
            // Get the recipient's socket ID
            const recipientSocketId = onlineUsers.get(data.to);
            
            if (recipientSocketId) {
                // If recipient is online, send the message
                io.to(recipientSocketId).emit('private-message', {
                    from: socket.userId,
                    message: data.message,
                    timestamp: data.timestamp || new Date()
                });
            }
            
            // Store message in database
            try {
                const Message = require('./models/Message');
                const newMessage = new Message({
                    sender: socket.userId,
                    recipient: data.to,
                    content: data.message,
                    timestamp: data.timestamp || new Date(),
                    chatId: data.chatId
                });
                
                await newMessage.save();
                console.log('Message saved to database successfully');
            } catch (err) {
                console.error('Message could not be saved to database:', err.message);
            }
        } catch (error) {
            console.error('Error sending private message:', error);
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`User ${socket.userId} disconnected`);
        
        // Remove from online users
        onlineUsers.delete(socket.userId);
        
        // Broadcast user offline status
        socket.broadcast.emit('user-status', {
            userId: socket.userId,
            status: 'offline'
        });
    });
});

// Optional middleware to log all incoming requests (for debugging)
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Delete a connection (unfriend)
app.delete('/api/connections/:userId', authenticateToken, async (req, res) => {
    try {
        const currentUserId = req.user.userId;
        const connectionUserId = req.params.userId;

        // Validation
        if (!mongoose.Types.ObjectId.isValid(connectionUserId)) {
            return res.status(400).json({ error: 'Invalid user ID format' });
        }

        // Find the current user
        const currentUser = await User.findById(currentUserId);
        if (!currentUser) {
            return res.status(404).json({ error: 'Current user not found' });
        }

        // Check if they are actually connected
        if (!currentUser.connections.includes(connectionUserId)) {
            return res.status(400).json({ error: 'You are not connected with this user' });
        }

        // Remove connection from both users
        const updateCurrentUser = User.findByIdAndUpdate(
            currentUserId,
            { $pull: { connections: connectionUserId } },
            { new: true }
        );

        const updateConnectionUser = User.findByIdAndUpdate(
            connectionUserId,
            { $pull: { connections: currentUserId } },
            { new: true }
        );

        // Execute both updates concurrently
        await Promise.all([updateCurrentUser, updateConnectionUser]);

        res.status(200).json({ message: 'Connection removed successfully' });
    } catch (error) {
        console.error('Error removing connection:', error);
        res.status(500).json({ error: 'Failed to remove connection', details: error.message });
    }
});

// Add this route with the other static page routes
app.get('/reset-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

// Create a new post
app.post('/api/posts', authenticateToken, async (req, res) => {
    try {
        const { content, postType, imageUrl, jobDetails } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'Post content is required' });
        }
        
        // Extra validation for job posts
        if (postType === 'job') {
            if (!jobDetails) {
                return res.status(400).json({ error: 'Job details are required for job posts' });
            }
            
            if (!jobDetails.company) {
                return res.status(400).json({ error: 'Company name is required for job posts' });
            }
            
            if (!jobDetails.position) {
                return res.status(400).json({ error: 'Position title is required for job posts' });
            }
            
            if (!jobDetails.location) {
                return res.status(400).json({ error: 'Location is required for job posts' });
            }
        }
        
        // Extra validation for image posts
        if (postType === 'image' && !imageUrl) {
            return res.status(400).json({ error: 'Image URL is required for image posts' });
        }
        
        const newPost = new Post({
            userId: req.user.userId,
            content,
            postType: postType || 'general',
            imageUrl,
            jobDetails,
            likes: [],
            comments: []
        });
        
        await newPost.save();
        
        // Populate user details
        const populatedPost = await Post.findById(newPost._id)
            .populate('userId', 'firstname lastname profilePicture userType collegeName designation companyname')
            .lean();
        
        // Log successful post creation
        console.log(`Post created successfully by user ${req.user.userId}, post ID: ${newPost._id}, type: ${postType}`);
        
        res.status(201).json(populatedPost);
    } catch (error) {
        console.error('Error creating post:', error);
        res.status(500).json({ error: 'Failed to create post', details: error.message });
    }
});

// Get all posts with pagination
app.get('/api/posts', authenticateToken, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        
        const posts = await Post.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate('userId', 'firstname lastname profilePicture userType collegeName designation companyname')
            .lean();
        
        res.json(posts);
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// Delete a post
app.delete('/api/posts/:id', authenticateToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Only allow the post owner to delete it
        if (post.userId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Unauthorized to delete this post' });
        }
        
        await Post.findByIdAndDelete(req.params.id);
        res.json({ message: 'Post deleted successfully' });
    } catch (error) {
        console.error('Error deleting post:', error);
        res.status(500).json({ error: 'Failed to delete post' });
    }
});

// Like a post
app.post('/api/posts/:id/like', authenticateToken, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Check if user already liked the post
        const alreadyLiked = post.likes.includes(req.user.userId);
        
        if (alreadyLiked) {
            // Unlike the post
            post.likes = post.likes.filter(userId => userId.toString() !== req.user.userId);
        } else {
            // Like the post
            post.likes.push(req.user.userId);
        }
        
        await post.save();
        res.json({ likes: post.likes.length, liked: !alreadyLiked });
    } catch (error) {
        console.error('Error liking post:', error);
        res.status(500).json({ error: 'Failed to like post' });
    }
});

// Add a comment to a post
app.post('/api/posts/:id/comments', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ error: 'Comment content is required' });
        }
        
        const post = await Post.findById(req.params.id);
        
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        post.comments.push({
            userId: req.user.userId,
            content,
            createdAt: new Date()
        });
        
        await post.save();
        
        // Populate the new comment with user details
        const populatedPost = await Post.findById(post._id)
            .populate('userId', 'firstname lastname profilePicture')
            .populate('comments.userId', 'firstname lastname profilePicture')
            .lean();
        
        res.json(populatedPost.comments[populatedPost.comments.length - 1]);
    } catch (error) {
        console.error('Error adding comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// Delete a comment from a post
app.delete('/api/posts/:postId/comments/:commentId', authenticateToken, async (req, res) => {
    try {
        const { postId, commentId } = req.params;
        
        // Find the post
        const post = await Post.findById(postId);
        
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Find the comment
        const comment = post.comments.id(commentId);
        
        if (!comment) {
            return res.status(404).json({ error: 'Comment not found' });
        }
        
        // Check if the user is authorized to delete the comment
        if (comment.userId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'You are not authorized to delete this comment' });
        }
        
        // Remove the comment
        comment.remove();
        
        // Save the post
        await post.save();
        
        res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
        console.error('Error deleting comment:', error);
        res.status(500).json({ error: 'Failed to delete comment' });
    }
});

// Get comments for a post
app.get('/api/posts/:postId/comments', authenticateToken, async (req, res) => {
    try {
        const postId = req.params.postId;
        
        // Find the post
        const post = await Post.findById(postId)
            .populate('comments.userId', 'firstname lastname profilePicture')
            .select('comments')
            .lean();
        
        if (!post) {
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Return the comments
        res.json(post.comments || []);
    } catch (error) {
        console.error('Error fetching comments:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// Serve static files from the public directory
app.use(express.static('public'));

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    
    // Socket.io connection handling
    io.on('connection', (socket) => {
        console.log('A user connected');
        
        // Add your socket event handlers here
        
        socket.on('disconnect', () => {
            console.log('User disconnected');
        });
    });
});

// Route to like/unlike a post
app.post('/api/posts/:postId/like', authenticateToken, async (req, res) => {
    try {
        const { postId } = req.params;
        const userId = req.user.id;
        
        console.log(`User ${userId} attempting to like/unlike post ${postId}`);
        
        // Find the post
        const post = await Post.findById(postId);
        if (!post) {
            console.log(`Post ${postId} not found`);
            return res.status(404).json({ error: 'Post not found' });
        }
        
        // Check if the user has already liked the post
        const alreadyLiked = post.likes.includes(userId);
        console.log(`User has ${alreadyLiked ? 'already' : 'not'} liked the post`);
        
        // Toggle like status
        if (alreadyLiked) {
            // Unlike: Remove user ID from likes array
            post.likes = post.likes.filter(id => id.toString() !== userId);
            console.log(`Removing like from post. New likes count: ${post.likes.length}`);
        } else {
            // Like: Add user ID to likes array
            post.likes.push(userId);
            console.log(`Adding like to post. New likes count: ${post.likes.length}`);
        }
        
        // Save the updated post
        await post.save();
        
        // Return the updated likes count and liked status
        const updatedLikeStatus = !alreadyLiked;
        console.log(`Updated like status: ${updatedLikeStatus ? 'liked' : 'unliked'}`);
        
        return res.status(200).json({
            liked: updatedLikeStatus,
            likes: post.likes,
            likeCount: post.likes.length
        });
    } catch (error) {
        console.error('Error handling like/unlike:', error);
        res.status(500).json({ error: 'Server error while processing like/unlike' });
    }
});