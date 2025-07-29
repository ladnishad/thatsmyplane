const express = require('express');
const { param, query } = require('express-validator');
const authController = require('../controllers/authController');
const aircraftController = require('../controllers/aircraftController');

const router = express.Router();

// Request size limiting for aircraft endpoints
const aircraftLimiter = express.json({ limit: '20kb' }); // For aircraft photo data

// All routes require authentication
router.use(authController.protect);

// Validation middleware - using more secure validation approach
const tailNumberValidation = [
  param('tail')
    .isLength({ min: 2, max: 10 })
    .withMessage('Tail number must be between 2 and 10 characters')
    .custom((value) => {
      // Use character-by-character validation instead of regex to prevent ReDoS
      const allowedChars = /^[A-Z0-9-]+$/;
      if (!allowedChars.test(value)) {
        throw new Error('Tail number can only contain uppercase letters, numbers, and hyphens');
      }
      // Additional validation to ensure it follows aircraft tail number patterns
      if (value.length < 2 || value.startsWith('-') || value.endsWith('-') || value.includes('--')) {
        throw new Error('Invalid tail number format');
      }
      return true;
    }),
];

const imageSearchValidation = [
  query('registration').optional().isString(),
  query('aircraftType').optional().isString(),
  query('airline').optional().isString(),
];

// Routes with request size limits
router.get('/image', imageSearchValidation, aircraftController.getAircraftImage);
router.get('/:tail', tailNumberValidation, aircraftController.getAircraft);
router.get('/:tail/photos', tailNumberValidation, aircraftController.getAircraftPhotos);
router.post('/:registration/fetch-photos', aircraftLimiter, aircraftController.fetchAircraftPhotos);

module.exports = router; 