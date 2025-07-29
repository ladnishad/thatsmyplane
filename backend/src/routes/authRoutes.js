const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');

const router = express.Router();

// Request size limiting for auth endpoints
const authLimiter = express.json({ limit: '2kb' }); // Auth data is minimal

// Validation middleware
const registerValidation = [
  body('firstName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('First name is required and must be less than 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Last name is required and must be less than 50 characters'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .isAlphanumeric('en-US', { ignore: '_' })
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters long')
    .custom((value) => {
      // Use individual checks instead of complex regex to prevent ReDoS
      const hasLowercase = /[a-z]/.test(value);
      const hasUppercase = /[A-Z]/.test(value);
      const hasDigit = /\d/.test(value);
      
      if (!hasLowercase || !hasUppercase || !hasDigit) {
        throw new Error('Password must contain at least one uppercase letter, one lowercase letter, and one number');
      }
      return true;
    }),
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Routes with request size limits
router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login', authLimiter, loginValidation, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.protect, authController.getMe);

// Username checking routes
router.get('/check-username/:username', authController.checkUsername);
router.post('/suggest-usernames', authLimiter, authController.suggestUsernames);

module.exports = router; 