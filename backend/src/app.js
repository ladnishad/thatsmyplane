const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const mongoSanitize = require('express-mongo-sanitize');

const globalErrorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/appError');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/authRoutes');
const flightRoutes = require('./routes/flightRoutes');
const aircraftRoutes = require('./routes/aircraftRoutes');
const airlineRoutes = require('./routes/airlineRoutes');

const app = express();

// Trust proxy for accurate client IP addresses
app.set('trust proxy', 1);

// Security HTTP headers with enhanced configuration
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "https:", "data:"],
      connectSrc: ["'self'", "https://api.flightaware.com", "https://api.flickr.com"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  permittedCrossDomainPolicies: false,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or same-origin requests)
    if (!origin) return callback(null, true);
    
    // In development, allow localhost and local network IPs
    if (process.env.NODE_ENV === 'development') {
      const allowedPatterns = [
        /^http:\/\/localhost:\d+$/,           // localhost with any port
        /^http:\/\/192\.168\.\d+\.\d+:\d+$/, // Local network IPs
        /^exp:\/\/192\.168\.\d+\.\d+:\d+$/,  // Expo protocol
      ];
      
      if (allowedPatterns.some(pattern => pattern.test(origin))) {
        return callback(null, true);
      }
    }
    
    // In production, only allow specific origins
    const allowedOrigins = process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : [];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true, // Allow cookies
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parser, reading data from body into req.body
// Default limit for all routes
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser middleware
app.use(cookieParser());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Request logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
  
  // Secure custom logging for debugging - sanitizes sensitive data
  app.use((req, res, next) => {
    // Sanitize headers - remove sensitive authentication data
    const sanitizedHeaders = { ...req.headers };
    delete sanitizedHeaders.authorization;
    delete sanitizedHeaders.cookie;
    delete sanitizedHeaders['x-api-key'];
    delete sanitizedHeaders['x-auth-token'];
    
    // Sanitize body - remove password fields and sensitive data
    const sanitizedBody = { ...req.body };
    if (sanitizedBody.password) sanitizedBody.password = '[REDACTED]';
    if (sanitizedBody.currentPassword) sanitizedBody.currentPassword = '[REDACTED]';
    if (sanitizedBody.newPassword) sanitizedBody.newPassword = '[REDACTED]';
    if (sanitizedBody.confirmPassword) sanitizedBody.confirmPassword = '[REDACTED]';
    if (sanitizedBody.token) sanitizedBody.token = '[REDACTED]';
    
    // Sanitize query parameters
    const sanitizedQuery = { ...req.query };
    if (sanitizedQuery.token) sanitizedQuery.token = '[REDACTED]';
    if (sanitizedQuery.apiKey) sanitizedQuery.apiKey = '[REDACTED]';
    
    console.log('📥 ===== INCOMING REQUEST =====');
    console.log('📥 Method:', req.method);
    console.log('📥 URL:', req.originalUrl);
    console.log('📥 Headers:', JSON.stringify(sanitizedHeaders, null, 2));
    console.log('📥 Body:', JSON.stringify(sanitizedBody, null, 2));
    console.log('📥 Query:', JSON.stringify(sanitizedQuery, null, 2));
    console.log('📥 IP:', req.ip);
    console.log('📥 User-Agent:', req.get('User-Agent'));
    console.log('📥 Timestamp:', new Date().toISOString());
    console.log('📥 ================================');
    next();
  });
} else {
  app.use(morgan('combined', { 
    stream: { write: (message) => logger.info(message.trim()) }
  }));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Apply rate limiting to all requests
app.use('/api/', limiter);

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/aircraft', aircraftRoutes);
app.use('/api/airlines', airlineRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Handle undefined routes
app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handling middleware
app.use(globalErrorHandler);

module.exports = app; 