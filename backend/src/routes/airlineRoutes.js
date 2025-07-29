const express = require('express');
const { query } = require('express-validator');
const authController = require('../controllers/authController');
const airlineController = require('../controllers/airlineController');

const router = express.Router();

// All routes require authentication
router.use(authController.protect);

// Validation middleware
const searchValidation = [
  query('q')
    .notEmpty()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Search query must be between 1 and 50 characters'),
];

// Routes
router.get('/search', searchValidation, airlineController.searchAirlines);

module.exports = router; 