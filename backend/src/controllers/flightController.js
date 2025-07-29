const { validationResult } = require('express-validator');
const Flight = require('../models/Flight');
const Airport = require('../models/Airport');
const Aircraft = require('../models/Aircraft');
const Airline = require('../models/Airline');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const flightAwareService = require('../services/flightAwareService');

exports.lookupFlight = catchAsync(async (req, res, next) => {
  console.log('🛩️  ===== FLIGHT LOOKUP ENDPOINT HIT =====');
  console.log('🛩️  Request method:', req.method);
  console.log('🛩️  Request URL:', req.originalUrl);
  console.log('🛩️  Request headers:', JSON.stringify(req.headers, null, 2));
  console.log('🛩️  Request body:', JSON.stringify(req.body, null, 2));
  console.log('🛩️  User ID:', req.user?.id || 'No user found');
  console.log('🛩️  Timestamp:', new Date().toISOString());

  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('🛩️  ❌ Validation errors:', errors.array());
    return next(new AppError(errors.array()[0].msg, 400));
  }

  const { flightNumber, date, time } = req.body;
  console.log('🛩️  ✅ Validation passed');
  console.log('🛩️  Flight number:', flightNumber);
  console.log('🛩️  Date:', date);
  console.log('🛩️  Time:', time);

  // Validate required fields
  if (!flightNumber) {
    return next(new AppError('Flight number is required', 400));
  }

  try {
    // Search for flights using FlightAware API
    const flightData = await flightAwareService.searchFlights(
      flightNumber,
      date || null,
      time || null
    );

    // Log the search for analytics
    console.log('Flight search performed:', {
      userId: req.user?.id,
      searchedFlightNumber: flightData.searchedFlightNumber,
      originalInput: flightNumber,
      date: date || null,
      time: time || null,
      resultsCount: flightData.totalCount,
      timestamp: new Date().toISOString(),
    });

    // Return flight data
    res.status(200).json({
      status: 'success',
      message: flightData.message,
      data: {
        searchCriteria: {
          originalInput: flightNumber,
          normalizedFlightNumber: flightData.searchedFlightNumber,
          date: date || null,
          time: time || null,
        },
        flights: flightData.flights,
        totalCount: flightData.totalCount,
      },
    });

  } catch (error) {
    // Handle specific FlightAware errors
    if (error instanceof AppError) {
      return next(error);
    }

    // Log unexpected errors for debugging
    console.error('Unexpected error in flight lookup:', error);
    return next(new AppError('Flight lookup failed. Please try again.', 500));
  }
});

exports.createFlight = catchAsync(async (req, res, next) => {
  console.log('✈️  ===== CREATE FLIGHT ENDPOINT HIT =====');
  console.log('✈️  Request body:', JSON.stringify(req.body, null, 2));
  console.log('✈️  User ID:', req.user?.id);

  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('✈️  ❌ Validation errors:', errors.array());
    return next(new AppError(errors.array()[0].msg, 400));
  }

  const { flight: flightData, seatNumber, notes } = req.body;
  
  if (!flightData) {
    return next(new AppError('Flight data is required', 400));
  }

  if (!req.user?.id) {
    return next(new AppError('User authentication required', 401));
  }

  try {
    console.log('✈️  Processing flight data for:', flightData.ident);

    // Import services (doing it here to avoid circular dependencies)
    const airlineService = require('../services/airlineService');
    const entityService = require('../services/entityService');

    // Step 1: Parse airline and flight number from identifier
    const { airline, flightNumber } = await airlineService.getAirlineFromFlightIdent(flightData.ident);
    console.log('✈️  ✅ Airline resolved:', airline.name, `(${airline.iataCode})`);

    // Step 2: Find or create aircraft (linked to the airline)
    const aircraft = await entityService.findOrCreateAircraft(flightData.aircraft, airline);
    console.log('✈️  ✅ Aircraft resolved:', aircraft.tailNumber, `(${aircraft.aircraftType})`, 
      aircraft.airline ? `operated by ${airline.name}` : 'no airline linked');

    // Step 3: Find or create airports
    const [originAirport, destinationAirport] = await Promise.all([
      entityService.findOrCreateAirport(flightData.origin),
      entityService.findOrCreateAirport(flightData.destination),
    ]);
    console.log('✈️  ✅ Airports resolved:', 
      `${originAirport.iataCode} → ${destinationAirport.iataCode}`);

    // Step 4: Transform flight times
    const times = entityService.transformFlightTimes(flightData);
    const flightDate = entityService.extractFlightDate(flightData);

    // Step 5: Check for duplicate flights
    const existingFlight = await Flight.findOne({
      userId: req.user.id,
      airline: airline._id,
      flightNumber,
      date: {
        $gte: new Date(flightDate.getFullYear(), flightDate.getMonth(), flightDate.getDate()),
        $lt: new Date(flightDate.getFullYear(), flightDate.getMonth(), flightDate.getDate() + 1),
      },
    });

    if (existingFlight) {
      return next(new AppError(
        `Flight ${flightData.ident} on ${flightDate.toDateString()} is already in your hangar`, 
        409
      ));
    }

    // Step 6: Create flight record
    const newFlightData = {
      userId: req.user.id,
      flightNumber,
      airline: airline._id,
      date: flightDate,
      originAirport: originAirport._id,
      destinationAirport: destinationAirport._id,
      aircraft: aircraft._id,
      times,
      notes: notes?.trim() || undefined,
      seat: seatNumber?.trim()?.toUpperCase() || undefined,
      flightAwareData: flightData, // Store original FlightAware response
    };

    const flight = await Flight.create(newFlightData);
    console.log('✈️  ✅ Flight created successfully:', flight._id);

    // Step 7: Populate the response with related data
    const populatedFlight = await Flight.findById(flight._id);

    res.status(201).json({
      status: 'success',
      message: `Flight ${flightData.ident} added to your hangar successfully`,
      data: {
        flight: populatedFlight,
        summary: {
          flightNumber: `${airline.iataCode}${flightNumber}`,
          route: `${originAirport.iataCode} → ${destinationAirport.iataCode}`,
          aircraft: `${aircraft.manufacturer || ''} ${aircraft.model || aircraft.aircraftType}`.trim(),
          date: flightDate.toDateString(),
          seat: seatNumber || null,
          notes: notes || null,
        },
      },
    });

  } catch (error) {
    console.error('✈️  ❌ Error creating flight:', error);
    
    // Handle specific error types
    if (error.message.includes('Unknown airline code')) {
      return next(new AppError(
        `Unable to identify airline from flight number "${flightData.ident}". Please contact support.`,
        400
      ));
    }
    
    if (error.message.includes('Aircraft data is required')) {
      return next(new AppError(
        'Insufficient aircraft information provided by FlightAware. Please try again.',
        400
      ));
    }
    
    if (error.message.includes('Airport data is required')) {
      return next(new AppError(
        'Insufficient airport information provided by FlightAware. Please try again.',
        400
      ));
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const message = Object.values(error.errors).map(err => err.message).join('. ');
      return next(new AppError(`Validation error: ${message}`, 400));
    }

    // Generic error
    return next(new AppError('Failed to add flight to hangar. Please try again.', 500));
  }
});

exports.getFlights = catchAsync(async (req, res, next) => {
  console.log('🛩️ ===== GET FLIGHTS (HANGAR) ENDPOINT HIT =====');
  console.log('🛩️ User ID:', req.user?.id);
  console.log('🛩️ Request URL:', req.originalUrl);
  console.log('🛩️ Request method:', req.method);

  if (!req.user?.id) {
    return next(new AppError('User authentication required', 401));
  }

  try {
    // Get user's flights with custom hangar sorting
    console.log('🛩️ 🔍 Fetching hangar flights...');
    const flights = await Flight.getHangarView(req.user.id);
    
    console.log(`🛩️ ✅ Found ${flights.length} flights in user's hangar`);
    if (flights.length > 0) {
      console.log('🛩️ 📊 First flight sample:', {
        _id: flights[0]._id,
        flightNumber: flights[0].flightNumber,
        airline: flights[0].airline?.iataCode,
        aircraft: flights[0].aircraft?.tailNumber,
        route: `${flights[0].originAirport?.iataCode} → ${flights[0].destinationAirport?.iataCode}`
      });
    }

    // Calculate some hangar statistics
    const stats = {
      totalFlights: flights.length,
      uniqueAircraft: [...new Set(flights.map(f => f.aircraft?.tailNumber || 'unknown'))].length,
      uniqueAirlines: [...new Set(flights.map(f => f.airline?.iataCode || 'unknown'))].length,
      uniqueAirports: [...new Set([
        ...flights.map(f => f.originAirport?.iataCode || 'unknown'),
        ...flights.map(f => f.destinationAirport?.iataCode || 'unknown')
      ])].length,
    };

    console.log('🛩️ 📊 Calculated stats:', stats);

    res.status(200).json({
      status: 'success',
      message: `Found ${flights.length} flight(s) in your hangar`,
      data: {
        flights,
        stats,
        totalCount: flights.length,
      },
    });

  } catch (error) {
    console.error('🛩️ ❌ Error fetching hangar flights:', error);
    console.error('🛩️ ❌ Error stack:', error.stack);
    return next(new AppError('Failed to load your hangar. Please try again.', 500));
  }
});

exports.getFlight = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  res.status(200).json({
    status: 'success',
    message: 'Get single flight endpoint - implementation coming soon',
    data: {
      flightId: req.params.id,
    },
  });
});

exports.updateFlight = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  res.status(200).json({
    status: 'success',
    message: 'Update flight endpoint - implementation coming soon',
    data: {
      flightId: req.params.id,
      updates: req.body,
    },
  });
});

exports.deleteFlight = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  res.status(204).json({
    status: 'success',
    data: null,
  });
}); 