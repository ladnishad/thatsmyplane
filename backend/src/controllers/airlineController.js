const { validationResult } = require('express-validator');
const Airline = require('../models/Airline');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.searchAirlines = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  const { q } = req.query;

  res.status(200).json({
    status: 'success',
    message: 'Airline search endpoint - implementation coming soon',
    data: {
      query: q,
      airlines: [],
    },
  });
}); 