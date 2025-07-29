const { validationResult } = require('express-validator');
const Aircraft = require('../models/Aircraft');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const flickrService = require('../services/flickrService');

exports.getAircraft = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  res.status(200).json({
    status: 'success',
    message: 'Get aircraft profile endpoint - implementation coming soon',
    data: {
      tailNumber: req.params.tail,
    },
  });
});

exports.getAircraftPhotos = catchAsync(async (req, res, next) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array()[0].msg, 400));
  }

  const { tail } = req.params;
  const { aircraftType, airline } = req.query;

  try {
    // Search for aircraft images using Flickr service
    const photos = await flickrService.searchAircraftImages(
      tail,           // registration/tail number
      aircraftType,   // aircraft type (optional)
      airline         // airline name (optional)
    );

    console.log(photos)

    res.status(200).json({
      status: 'success',
      message: `Found ${photos.length} photo(s) for aircraft ${tail}`,
      data: {
        tailNumber: tail,
        aircraftType,
        airline,
        photos,
        totalCount: photos.length,
      },
    });

  } catch (error) {
    // Log the error but don't expose internal details
    console.error('Error fetching aircraft photos:', error);
    
    // Handle specific error types
    let errorMessage = 'Aircraft photos temporarily unavailable';
    let statusCode = 200; // Still return 200 for graceful degradation
    
    if (error.message.includes('rate limit')) {
      errorMessage = 'Too many requests. Aircraft photos will be available again shortly.';
    } else if (error.message.includes('API key')) {
      errorMessage = 'Aircraft photo service configuration issue';
    } else if (error.message.includes('unavailable')) {
      errorMessage = 'Aircraft photo service is temporarily down';
    }
    
    // Return graceful error response
    res.status(statusCode).json({
      status: 'success',
      message: errorMessage,
      data: {
        tailNumber: tail,
        photos: [],
        totalCount: 0,
        error: error.message,
        retryAfter: error.message.includes('rate limit') ? 300 : 60, // seconds
      },
    });
  }
});

// Debug endpoint to manually trigger photo fetching for an aircraft
exports.fetchAircraftPhotos = catchAsync(async (req, res, next) => {
  const { registration } = req.params;

  if (!registration) {
    return next(new AppError('Aircraft registration is required', 400));
  }

  try {
    // Find the aircraft in the database
    const aircraft = await Aircraft.findOne({ 
      tailNumber: registration.toUpperCase() 
    });

    if (!aircraft) {
      return next(new AppError('Aircraft not found in database', 404));
    }

    // Import entityService dynamically to avoid circular dependency
    const entityService = require('../services/entityService');
    const service = new entityService();

    // Force photo fetching
    console.log(`🔄 Manually triggering photo fetch for ${aircraft.tailNumber}`);
    await service.fetchAndSaveAircraftPhotos(aircraft);

    // Reload aircraft to get updated photos
    const updatedAircraft = await Aircraft.findOne({ 
      tailNumber: registration.toUpperCase() 
    });

    res.status(200).json({
      status: 'success',
      message: `Photo fetch completed for aircraft ${registration}`,
      data: {
        tailNumber: updatedAircraft.tailNumber,
        photosCount: updatedAircraft.photos?.length || 0,
        photos: updatedAircraft.photos || [],
        photoLastUpdated: updatedAircraft.photoLastUpdated,
      },
    });

  } catch (error) {
    console.error('Error manually fetching aircraft photos:', error);
    return next(new AppError('Failed to fetch aircraft photos', 500));
  }
});

// New endpoint to get a single aircraft image (for modal hero section)
exports.getAircraftImage = catchAsync(async (req, res, next) => {
  const { registration, aircraftType, airline } = req.query;

  if (!registration && !aircraftType && !airline) {
    return next(new AppError('At least one search parameter is required', 400));
  }

  try {
    let image = null;

    // First, try to find the aircraft in the database if we have a registration
    if (registration) {
      const aircraft = await Aircraft.findOne({ 
        tailNumber: registration.toUpperCase() 
      });

      if (aircraft && aircraft.photos && aircraft.photos.length > 0) {
        // Use the first photo from the database
        const dbPhoto = aircraft.photos[0];
        image = {
          id: dbPhoto.flickrId,
          title: dbPhoto.photographer,
          url: dbPhoto.url,
          thumbnail: dbPhoto.url,
          source: 'database',
          attribution: dbPhoto.photographer,
        };
        
        console.log(`✅ Found aircraft image in database for ${registration}`);
        
        // Return immediately if we found a database image
        return res.status(200).json({
          status: 'success',
          message: 'Aircraft image found in database',
          data: {
            image,
            searchParams: {
              registration,
              aircraftType,
              airline,
            },
          },
        });
      } else if (aircraft) {
        // Aircraft exists but no photos - check if we should retry fetching
        console.log(`🔍 Aircraft ${registration} exists in database but has no photos`);
        
        // If photos were last updated recently (within 1 hour), don't retry Flickr
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (aircraft.photoLastUpdated && aircraft.photoLastUpdated > oneHourAgo) {
          console.log(`⏳ Photos for ${registration} were recently checked, returning no image`);
          return res.status(200).json({
            status: 'success',
            message: 'No aircraft image found',
            data: {
              image: null,
            },
          });
        }
      }
    }

    // If no image found in database, try Flickr (but clear cache first if this is a retry)
    if (!image) {
      // Clear any cached "no results" for this aircraft to force a fresh Flickr search
      if (registration) {
        flickrService.clearCachedResult(registration, aircraftType, airline);
      }
      
      image = await flickrService.getAircraftImage(registration, aircraftType, airline);
    }

    if (!image) {
      return res.status(200).json({
        status: 'success',
        message: 'No aircraft image found',
        data: {
          image: null,
        },
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Aircraft image found',
      data: {
        image,
        searchParams: {
          registration,
          aircraftType,
          airline,
        },
      },
    });

  } catch (error) {
    console.error('Error fetching aircraft image:', error);
    
    // Handle specific error types
    let errorMessage = 'Aircraft image temporarily unavailable';
    
    if (error.message.includes('rate limit')) {
      errorMessage = 'Too many requests. Aircraft images will be available again shortly.';
    } else if (error.message.includes('API key')) {
      errorMessage = 'Aircraft image service configuration issue';
    } else if (error.message.includes('unavailable')) {
      errorMessage = 'Aircraft image service is temporarily down';
    }
    
    res.status(200).json({
      status: 'success',
      message: errorMessage,
      data: {
        image: null,
        error: error.message,
        retryAfter: error.message.includes('rate limit') ? 300 : 60, // seconds
      },
    });
  }
}); 