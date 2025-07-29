const Aircraft = require('../models/Aircraft');
const Airport = require('../models/Airport');
const logger = require('../utils/logger');
const flickrService = require('./flickrService');
const flightAwareService = require('./flightAwareService');

class EntityService {
  /**
   * Find or create aircraft entity
   * @param {object} aircraftData - Aircraft data from FlightAware
   * @param {object} airline - Airline document (optional)
   * @returns {Promise<object>} Aircraft document
   */
  async findOrCreateAircraft(aircraftData, airline = null) {
    if (!aircraftData) {
      throw new Error('Aircraft data is required');
    }

    const { registration, type } = aircraftData;
    
    if (!registration && !type) {
      throw new Error('Either aircraft registration or type is required');
    }

    logger.info(`Finding or creating aircraft:`, { registration, type, airline: airline?.name });

    // Primary search by registration (most reliable)
    if (registration) {
      const normalizedRegistration = registration.toUpperCase().trim();
      let aircraft = await Aircraft.findOne({ tailNumber: normalizedRegistration });
      
      if (aircraft) {
        logger.info(`Found existing aircraft by registration: ${aircraft.tailNumber}`);
        
        // Update aircraft with missing information
        let updated = false;
        
        if (!aircraft.aircraftType && type) {
          aircraft.aircraftType = type;
          updated = true;
          logger.info(`Updated aircraft type for ${aircraft.tailNumber}: ${type}`);
        }
        
        if (!aircraft.airline && airline) {
          aircraft.airline = airline._id;
          updated = true;
          logger.info(`Updated airline for ${aircraft.tailNumber}: ${airline.name}`);
        }
        
        if (!aircraft.manufacturer && type) {
          aircraft.manufacturer = this.extractManufacturer(type);
          updated = true;
        }
        
        if (!aircraft.model && type) {
          aircraft.model = this.extractModel(type);
          updated = true;
        }
        
        if (updated) {
          await aircraft.save();
          logger.info(`Updated aircraft data for ${aircraft.tailNumber}`);
        }
        
        return aircraft;
      }

      // Create new aircraft with registration
      return this.createAircraft({
        tailNumber: normalizedRegistration,
        aircraftType: type || 'Unknown',
        manufacturer: this.extractManufacturer(type),
        model: this.extractModel(type),
        airline: airline?._id || null,
      });
    }

    // Fallback: search by type only (less reliable, might create duplicates)
    if (type) {
      logger.warn(`No registration provided, searching by type only: ${type}`);
      
      // For aircraft without registration, we'll create a generic entry
      // This is not ideal but handles cases where FlightAware doesn't provide registration
      return this.createAircraft({
        tailNumber: `UNKNOWN-${type}-${Date.now()}`, // Unique identifier
        aircraftType: type,
        manufacturer: this.extractManufacturer(type),
        model: this.extractModel(type),
        airline: airline?._id || null,
      });
    }

    throw new Error('Insufficient aircraft data provided');
  }

  /**
   * Create new aircraft with proper error handling
   * @param {object} aircraftData - Aircraft data to create
   * @returns {Promise<object>} Created aircraft document
   */
  async createAircraft(aircraftData) {
    try {
      const aircraft = await Aircraft.create(aircraftData);
      logger.info(`Created new aircraft: ${aircraft.tailNumber} (${aircraft.aircraftType})`);
      
      // Fetch and save aircraft photos in the background (don't await to avoid slowing down flight creation)
      this.fetchAndSaveAircraftPhotos(aircraft).catch(error => {
        logger.warn(`Failed to fetch photos for aircraft ${aircraft.tailNumber}:`, error.message);
      });
      
      return aircraft;
    } catch (error) {
      if (error.code === 11000) {
        // Handle race condition - another request created the aircraft
        const aircraft = await Aircraft.findOne({ tailNumber: aircraftData.tailNumber });
        if (aircraft) {
          logger.info(`Found aircraft created by concurrent request: ${aircraft.tailNumber}`);
          
          // Still try to fetch photos for the existing aircraft if it doesn't have any
          if (!aircraft.photos || aircraft.photos.length === 0) {
            this.fetchAndSaveAircraftPhotos(aircraft).catch(error => {
              logger.warn(`Failed to fetch photos for existing aircraft ${aircraft.tailNumber}:`, error.message);
            });
          }
          
          return aircraft;
        }
      }
      logger.error(`Failed to create aircraft:`, error);
      throw error;
    }
  }

  /**
   * Fetch and save aircraft photos from Flickr
   * @param {object} aircraft - Aircraft document
   * @returns {Promise<void>}
   */
  async fetchAndSaveAircraftPhotos(aircraft) {
    try {
      // Skip if aircraft already has photos that are recent
      if (aircraft.photos && aircraft.photos.length > 0 && !aircraft.needsPhotoUpdate()) {
        logger.info(`✅ Aircraft ${aircraft.tailNumber} already has recent photos, skipping fetch`);
        return;
      }

      // Get airline name if available
      let airlineName = null;
      if (aircraft.airline) {
        // Populate airline data if not already populated
        if (typeof aircraft.airline === 'string') {
          const Airline = require('../models/Airline');
          const airline = await Airline.findById(aircraft.airline);
          airlineName = airline?.name;
        } else {
          airlineName = aircraft.airline.name;
        }
      }

      // Get aircraft type display name
      const aircraftTypeName = this.getAircraftTypeDisplayName(aircraft.aircraftType);

      logger.info(`🔍 Fetching photos for aircraft: ${aircraft.tailNumber} (${aircraftTypeName}) operated by ${airlineName || 'Unknown'}`);

      // Clear any existing cache for this aircraft to ensure fresh search
      await flickrService.clearCachedResult(aircraft.tailNumber, aircraftTypeName, airlineName);

      // Fetch photos from Flickr with retry logic
      let photos = null;
      let attempts = 0;
      const maxAttempts = 2;

      while (attempts < maxAttempts && (!photos || photos.length === 0)) {
        attempts++;
        
        if (attempts > 1) {
          logger.info(`🔄 Retry attempt ${attempts} for aircraft ${aircraft.tailNumber}`);
          // Try with simplified search terms on retry
          photos = await flickrService.searchAircraftImages(
            aircraft.tailNumber,
            null, // Skip aircraft type on retry
            null  // Skip airline on retry
          );
        } else {
          // First attempt with full details
          photos = await flickrService.searchAircraftImages(
            aircraft.tailNumber,
            aircraftTypeName,
            airlineName
          );
        }
      }

      if (photos && photos.length > 0) {
        logger.info(`📸 Found ${photos.length} photo(s) for aircraft ${aircraft.tailNumber}`);
        
        // Add photos to aircraft document
        photos.forEach(photo => {
          aircraft.addPhoto({
            url: photo.url,
            photographer: photo.attribution || 'Flickr User',
            flickrId: photo.id,
            license: 'Unknown', // Flickr service could be enhanced to get license info
          });
        });

        // Save the aircraft with new photos
        await aircraft.save();
        logger.info(`✅ Successfully saved ${photos.length} photo(s) to database for aircraft ${aircraft.tailNumber}`);
      } else {
        logger.warn(`⚠️ No photos found for aircraft ${aircraft.tailNumber} after ${attempts} attempts`);
        // Update the photoLastUpdated to avoid frequent retries
        aircraft.photoLastUpdated = new Date();
        await aircraft.save();
      }

    } catch (error) {
      logger.error(`❌ Error fetching photos for aircraft ${aircraft.tailNumber}:`, error);
      
      // Still update photoLastUpdated to avoid continuous retries on error
      try {
        aircraft.photoLastUpdated = new Date();
        await aircraft.save();
      } catch (saveError) {
        logger.error(`❌ Failed to update photoLastUpdated for ${aircraft.tailNumber}:`, saveError);
      }
      
      // Don't re-throw error to avoid breaking flight creation
    }
  }

  /**
   * Get display name for aircraft type
   * @param {string} aircraftType - Aircraft type code
   * @returns {string} Display name
   */
  getAircraftTypeDisplayName(aircraftType) {
    if (!aircraftType) return 'Unknown';

    const manufacturer = this.extractManufacturer(aircraftType);
    const model = this.extractModel(aircraftType);

    if (manufacturer && model) {
      return `${manufacturer} ${model}`;
    }

    return aircraftType;
  }

  /**
   * Extract manufacturer from aircraft type
   * @param {string} aircraftType - Aircraft type code (e.g., "B738", "A320")
   * @returns {string} Manufacturer name
   */
  extractManufacturer(aircraftType) {
    if (!aircraftType) return null;
    
    const type = aircraftType.toUpperCase();
    
    if (type.startsWith('B') || type.includes('BOEING')) return 'Boeing';
    if (type.startsWith('A') || type.includes('AIRBUS')) return 'Airbus';
    if (type.startsWith('E') || type.includes('EMBRAER')) return 'Embraer';
    if (type.startsWith('C') || type.includes('BOMBARDIER')) return 'Bombardier';
    if (type.includes('MD') || type.includes('MCDONNELL')) return 'McDonnell Douglas';
    if (type.includes('ATR')) return 'ATR';
    if (type.includes('DHC') || type.includes('DASH')) return 'De Havilland Canada';
    
    return null;
  }

  /**
   * Extract model from aircraft type
   * @param {string} aircraftType - Aircraft type code
   * @returns {string} Model name
   */
  extractModel(aircraftType) {
    if (!aircraftType) return null;
    
    const type = aircraftType.toUpperCase();
    
    // Boeing models
    if (type === 'B738') return '737-800';
    if (type === 'B739') return '737-900';
    if (type === 'B38M') return '737-8 MAX';
    if (type === 'B39M') return '737-9 MAX';
    if (type === 'B744') return '747-400';
    if (type === 'B748') return '747-8';
    if (type === 'B772') return '777-200';
    if (type === 'B773') return '777-300';
    if (type === 'B77W') return '777-300ER';
    if (type === 'B788') return '787-8';
    if (type === 'B789') return '787-9';
    if (type === 'B78X') return '787-10';
    
    // Airbus models
    if (type === 'A320') return 'A320';
    if (type === 'A321') return 'A321';
    if (type === 'A20N') return 'A320neo';
    if (type === 'A21N') return 'A321neo';
    if (type === 'A333') return 'A330-300';
    if (type === 'A359') return 'A350-900';
    if (type === 'A380') return 'A380';
    
    // Return original type if no specific mapping found
    return aircraftType;
  }

  /**
   * Convert ICAO airport code to IATA code
   * @param {string} icaoCode - ICAO airport code (4 letters)
   * @returns {string|null} IATA code (3 letters) if known
   */
  icaoToIataAirport(icaoCode) {
    // Common ICAO to IATA airport mappings
    const icaoToIataMap = {
      // Major US airports
      'KJFK': 'JFK', // John F Kennedy Intl
      'KLAX': 'LAX', // Los Angeles Intl
      'KORD': 'ORD', // Chicago O'Hare
      'KATL': 'ATL', // Atlanta Hartsfield-Jackson
      'KDFW': 'DFW', // Dallas/Fort Worth
      'KDEN': 'DEN', // Denver Intl
      'KSFO': 'SFO', // San Francisco Intl
      'KLAS': 'LAS', // Las Vegas McCarran
      'KMIA': 'MIA', // Miami Intl
      'KBOS': 'BOS', // Boston Logan
      'KSEA': 'SEA', // Seattle-Tacoma
      'KPHX': 'PHX', // Phoenix Sky Harbor
      'KIAH': 'IAH', // Houston Intercontinental
      'KDTW': 'DTW', // Detroit Metro
      'KMSP': 'MSP', // Minneapolis-St Paul
      'KPHL': 'PHL', // Philadelphia
      'KCLT': 'CLT', // Charlotte Douglas
      
      // Major International airports
      'EGLL': 'LHR', // London Heathrow
      'EGKK': 'LGW', // London Gatwick
      'LFPG': 'CDG', // Paris Charles de Gaulle
      'EDDF': 'FRA', // Frankfurt
      'EHAM': 'AMS', // Amsterdam Schiphol
      'LEMD': 'MAD', // Madrid Barajas
      'LIRF': 'FCO', // Rome Fiumicino
      'LOWW': 'VIE', // Vienna
      'LSZH': 'ZUR', // Zurich
      'ESSA': 'ARN', // Stockholm Arlanda
      'EKCH': 'CPH', // Copenhagen
      'ENGM': 'OSL', // Oslo Gardermoen
      'EFHK': 'HEL', // Helsinki Vantaa
      
      // Middle East
      'OMDB': 'DXB', // Dubai Intl
      'OERK': 'RUH', // Riyadh King Khalid
      'OTHH': 'DOH', // Doha Hamad
      'HECA': 'CAI', // Cairo Intl
      'LTBA': 'IST', // Istanbul Airport
      
      // Asia Pacific
      'RJTT': 'NRT', // Tokyo Narita
      'RJAA': 'HND', // Tokyo Haneda
      'RKSI': 'ICN', // Seoul Incheon
      'VHHH': 'HKG', // Hong Kong Intl
      'WSSS': 'SIN', // Singapore Changi
      'WMKK': 'KUL', // Kuala Lumpur
      'VTBS': 'BKK', // Bangkok Suvarnabhumi
      'YSSY': 'SYD', // Sydney Kingsford Smith
      'YMML': 'MEL', // Melbourne
      'NZAA': 'AKL', // Auckland
      
      // India
      'VIDP': 'DEL', // New Delhi Indira Gandhi
      'VABB': 'BOM', // Mumbai Chhatrapati Shivaji
      'VOBL': 'BLR', // Bangalore Kempegowda
      'VOMM': 'MAA', // Chennai
      'VECC': 'CCU', // Kolkata
      'VOHS': 'HYD', // Hyderabad
      'VAAH': 'AMD', // Ahmedabad
      'VOCI': 'COK', // Kochi
      'VOTR': 'TRV', // Trivandrum
      'VAGO': 'GOI', // Goa
      'VOGO': 'GOI', // Goa (alternative ICAO code)
      
      // Canada
      'CYYZ': 'YYZ', // Toronto Pearson
      'CYVR': 'YVR', // Vancouver
      'CYUL': 'YUL', // Montreal Trudeau
      'CYYC': 'YYC', // Calgary
      'CYOW': 'YOW', // Ottawa
      'CYWG': 'YWG', // Winnipeg
      
      // South America
      'SBGR': 'GRU', // São Paulo Guarulhos
      'SCEL': 'SCL', // Santiago
      'SAEZ': 'EZE', // Buenos Aires Ezeiza
      'SKBO': 'BOG', // Bogotá El Dorado
      'SPJC': 'LIM', // Lima Jorge Chávez
    };

    const normalizedIcao = icaoCode.toUpperCase();
    if (icaoToIataMap[normalizedIcao]) {
      logger.info(`Airport ICAO to IATA conversion: ${normalizedIcao} → ${icaoToIataMap[normalizedIcao]}`);
      return icaoToIataMap[normalizedIcao];
    }
    
    return null;
  }

  /**
   * Find or create airport entity
   * @param {object} airportData - Airport data from FlightAware
   * @returns {Promise<object>} Airport document
   */
  async findOrCreateAirport(airportData) {
    if (!airportData) {
      throw new Error('Airport data is required');
    }

    const { code, codeIcao, codeIata, code_icao, code_iata, name, city } = airportData;
    
    if (!code && !codeIcao && !codeIata && !code_icao && !code_iata) {
      throw new Error('Airport code is required');
    }

    // FlightAware provides multiple code formats, prioritize IATA then ICAO
    let iataCode = null;
    let icaoCode = null;

    // First priority: Use explicit IATA code if provided
    if (codeIata || code_iata) {
      iataCode = (codeIata || code_iata).toUpperCase().trim();
    }

    // Second priority: Use explicit ICAO code if provided  
    if (codeIcao || code_icao) {
      icaoCode = (codeIcao || code_icao).toUpperCase().trim();
    }

    // Third priority: If we only have 'code' field, determine if it's IATA or ICAO
    if (!iataCode && !icaoCode && code) {
      const normalizedCode = code.toUpperCase().trim();
      if (normalizedCode.length === 3) {
        // It's likely an IATA code
        iataCode = normalizedCode;
      } else if (normalizedCode.length === 4) {
        // It's likely an ICAO code
        icaoCode = normalizedCode;
        // Try to convert ICAO to IATA as fallback
        iataCode = this.icaoToIataAirport(normalizedCode);
      }
    }

    // If we still don't have IATA but have ICAO, try FlightAware API lookup first, then hardcoded conversion
    if (!iataCode && icaoCode) {
      try {
        logger.info(`🔍 Attempting FlightAware API lookup for airport: ${icaoCode}`);
        const flightAwareAirport = await flightAwareService.getAirportInfo(icaoCode);
        
        if (flightAwareAirport && flightAwareAirport.codeIata) {
          iataCode = flightAwareAirport.codeIata.toUpperCase().trim();
          logger.info(`✅ FlightAware API provided IATA code: ${icaoCode} → ${iataCode}`);
          
          // Update airport data with FlightAware information
          if (!name && flightAwareAirport.name) {
            airportData.name = flightAwareAirport.name;
          }
          if (!city && flightAwareAirport.city) {
            airportData.city = flightAwareAirport.city;
          }
        }
      } catch (error) {
        logger.warn(`⚠️  FlightAware API lookup failed for ${icaoCode}: ${error.message}`);
      }
      
      // If FlightAware didn't provide IATA code, fall back to hardcoded mapping
      if (!iataCode) {
        iataCode = this.icaoToIataAirport(icaoCode);
        if (iataCode) {
          logger.info(`✅ Hardcoded mapping provided IATA code: ${icaoCode} → ${iataCode}`);
        }
      }
    }

    logger.info(`Finding or creating airport:`, { 
      originalCode: code,
      providedIata: codeIata || code_iata,
      providedIcao: codeIcao || code_icao,
      resolvedIata: iataCode, 
      resolvedIcao: icaoCode, 
      name, 
      city 
    });

    // Primary search by IATA code (most common)
    if (iataCode) {
      let airport = await Airport.findOne({ iataCode });
      
      if (airport) {
        logger.info(`Found existing airport: ${airport.name} (${airport.iataCode})`);
        
        // Update missing fields if we have new data
        let updated = false;
        if (!airport.icaoCode && icaoCode) {
          airport.icaoCode = icaoCode;
          updated = true;
        }
        if (!airport.name && name) {
          airport.name = name;
          updated = true;
        }
        if (!airport.city && city) {
          airport.city = city;
          updated = true;
        }
        
        if (updated) {
          await airport.save();
          logger.info(`Updated airport data for ${airport.iataCode}`);
        }
        
        return airport;
      }
    }

    // Secondary search by ICAO code
    if (icaoCode && !iataCode) {
      let airport = await Airport.findOne({ icaoCode });
      
      if (airport) {
        logger.info(`Found existing airport by ICAO: ${airport.name} (${airport.icaoCode})`);
        return airport;
      }
    }

    // Create new airport
    if (!iataCode) {
      // If we have an ICAO code but no IATA mapping, try one more FlightAware lookup
      if (icaoCode) {
        try {
          logger.info(`🚨 Last resort: FlightAware lookup for ICAO-only airport: ${icaoCode}`);
          const flightAwareAirport = await flightAwareService.getAirportInfo(icaoCode);
          
          if (flightAwareAirport) {
            // Check if FlightAware has IATA code in any field
            if (flightAwareAirport.codeIata) {
              iataCode = flightAwareAirport.codeIata.toUpperCase().trim();
              logger.info(`✅ FlightAware provided IATA code on retry: ${icaoCode} → ${iataCode}`);
            } else if (flightAwareAirport.code && flightAwareAirport.code.length === 3) {
              iataCode = flightAwareAirport.code.toUpperCase().trim();
              logger.info(`✅ FlightAware 'code' field appears to be IATA: ${icaoCode} → ${iataCode}`);
            } else {
              // Create airport with ICAO-derived IATA code as a fallback
              // This is not ideal but allows the system to function
              iataCode = `I${icaoCode.substring(1)}`.toUpperCase(); // Convert VOGO to IOGO as fallback
              logger.warn(`⚠️  Creating synthetic IATA code for ${icaoCode}: ${iataCode}`);
            }
            
            // Update airport data with FlightAware information
            if (flightAwareAirport.name) {
              airportData.name = flightAwareAirport.name;
            }
            if (flightAwareAirport.city) {
              airportData.city = flightAwareAirport.city;
            }
          }
        } catch (error) {
          logger.error(`❌ Final FlightAware lookup failed for ${icaoCode}: ${error.message}`);
        }
        
        // If we still don't have an IATA code, create a synthetic one
        if (!iataCode) {
          iataCode = `I${icaoCode.substring(1)}`.toUpperCase();
          logger.warn(`🔧 Creating synthetic IATA code for unmapped airport ${icaoCode}: ${iataCode}`);
        }
      } else {
        throw new Error('Airport code (IATA or ICAO) is required to create new airport');
      }
    }

    const airportCreateData = {
      name: name || `Airport ${iataCode}`,
      city: city || 'Unknown',
      country: 'Unknown', // Required field, will need to be updated later
      iataCode,
      icaoCode,
      timezone: 'UTC', // Default timezone, will need to be updated later
    };

    return this.createAirport(airportCreateData);
  }

  /**
   * Create new airport with proper error handling
   * @param {object} airportData - Airport data to create
   * @returns {Promise<object>} Created airport document
   */
  async createAirport(airportData) {
    try {
      const airport = await Airport.create(airportData);
      logger.info(`Created new airport: ${airport.name} (${airport.iataCode})`);
      return airport;
    } catch (error) {
      if (error.code === 11000) {
        // Handle race condition - another request created the airport
        const airport = await Airport.findOne({ iataCode: airportData.iataCode });
        if (airport) {
          logger.info(`Found airport created by concurrent request: ${airport.iataCode}`);
          return airport;
        }
      }
      logger.error(`Failed to create airport:`, error);
      throw error;
    }
  }

  /**
   * Validate and transform time data from FlightAware
   * @param {object} flightData - FlightAware flight data
   * @returns {object} Transformed time data
   */
  transformFlightTimes(flightData) {
    const times = {
      scheduled: {},
    };

    // Transform scheduled times
    if (flightData.scheduledDeparture) {
      times.scheduled.departure = new Date(flightData.scheduledDeparture);
    }
    if (flightData.scheduledArrival) {
      times.scheduled.arrival = new Date(flightData.scheduledArrival);
    }

    // Add estimated times if available
    if (flightData.estimatedDeparture) {
      times.estimated = times.estimated || {};
      times.estimated.departure = new Date(flightData.estimatedDeparture);
    }
    if (flightData.estimatedArrival) {
      times.estimated = times.estimated || {};
      times.estimated.arrival = new Date(flightData.estimatedArrival);
    }

    // Add actual times if available
    if (flightData.actualDeparture) {
      times.actual = times.actual || {};
      times.actual.departure = new Date(flightData.actualDeparture);
    }
    if (flightData.actualArrival) {
      times.actual = times.actual || {};
      times.actual.arrival = new Date(flightData.actualArrival);
    }

    return times;
  }

  /**
   * Extract flight date from FlightAware data
   * @param {object} flightData - FlightAware flight data
   * @returns {Date} Flight date
   */
  extractFlightDate(flightData) {
    // Use scheduled departure as primary source for flight date
    if (flightData.scheduledDeparture) {
      return new Date(flightData.scheduledDeparture);
    }
    
    // Fallback to estimated departure
    if (flightData.estimatedDeparture) {
      return new Date(flightData.estimatedDeparture);
    }
    
    // Fallback to actual departure
    if (flightData.actualDeparture) {
      return new Date(flightData.actualDeparture);
    }
    
    // Last resort: use current date
    logger.warn('No departure time found in flight data, using current date');
    return new Date();
  }
}

module.exports = new EntityService(); 