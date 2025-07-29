const express = require('express');
const { body, param } = require('express-validator');
const authController = require('../controllers/authController');
const flightController = require('../controllers/flightController');

const router = express.Router();

// Request size limiting middleware for specific endpoints
const flightDataLimiter = express.json({ limit: '50kb' }); // For flight creation with detailed data
const lookupLimiter = express.json({ limit: '5kb' });      // For flight lookups with minimal data

// All routes require authentication
router.use(authController.protect);

// Validation middleware
const lookupFlightValidation = [
  body('flightNumber')
    .notEmpty()
    .trim()
    .withMessage('Flight number is required'),
  body('date')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) {
        return true;
      }
      // Try to parse as ISO8601 date
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Valid flight date is required');
      }
      return true;
    }),
  body('time')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === null || value === undefined) {
        return true;
      }
      // Try to parse as ISO8601 date
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Valid flight time is required');
      }
      return true;
    }),
];

const createFlightValidation = [
  body('flight')
    .isObject()
    .withMessage('Flight data is required'),
  body('flight.ident')
    .notEmpty()
    .withMessage('Flight identifier is required'),
  body('flight.aircraft')
    .optional()
    .isObject()
    .withMessage('Aircraft data must be an object'),
  body('flight.origin')
    .optional()
    .isObject()
    .withMessage('Origin airport data must be an object'),
  body('flight.destination')
    .optional()
    .isObject()
    .withMessage('Destination airport data must be an object'),
  body('seatNumber')
    .optional()
    .matches(/^[0-9]{1,3}[A-Z]?$/)
    .withMessage('Invalid seat format (e.g., 12A, 45F)'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
];

const updateFlightValidation = [
  param('id')
    .isMongoId()
    .withMessage('Invalid flight ID'),
  body('seat')
    .optional()
    .matches(/^[0-9]{1,3}[A-Z]?$/)
    .withMessage('Invalid seat format'),
  body('notes')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Notes cannot exceed 1000 characters'),
];

// Routes with appropriate request size limits
router.post('/lookup-flight', lookupLimiter, lookupFlightValidation, flightController.lookupFlight);
router.post('/', flightDataLimiter, createFlightValidation, flightController.createFlight);
router.get('/', flightController.getFlights);
router.get('/:id', param('id').isMongoId(), flightController.getFlight);
router.put('/:id', flightDataLimiter, updateFlightValidation, flightController.updateFlight);
router.delete('/:id', param('id').isMongoId(), flightController.deleteFlight);

module.exports = router; 