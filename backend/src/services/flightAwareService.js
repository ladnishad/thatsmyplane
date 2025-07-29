const axios = require('axios');
const AppError = require('../utils/appError');

class FlightAwareService {
  constructor() {
    console.log('FlightAwareService constructor initialized');
    this.apiKey = process.env.FLIGHTAWARE_API_KEY;
    console.log('FlightAwareService apiKey:', this.apiKey);
    this.baseURL = process.env.FLIGHTAWARE_BASE_URL || 'https://aeroapi.flightaware.com/aeroapi';
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      headers: {
        'x-apikey': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    });
  }

  /**
   * Smart flight number parsing and normalization
   * Converts various input formats to proper IATA flight identifiers
   */
  parseFlightNumber(input) {
    if (!input || typeof input !== 'string') {
      throw new AppError('Flight number is required', 400);
    }

    const cleaned = input.trim().toUpperCase().replace(/\s+/g, '');
    
    // Airline name to IATA code mapping
    const airlineMap = {
      'EMIRATES': 'EK',
      'AMERICAN': 'AA',
      'AMERICANAIRLINES': 'AA',
      'DELTA': 'DL',
      'DELTAAIRLINES': 'DL',
      'UNITED': 'UA',
      'UNITEDAIRLINES': 'UA',
      'LUFTHANSA': 'LH',
      'BRITISH': 'BA',
      'BRITISHAIRWAYS': 'BA',
      'QATAR': 'QR',
      'QATARAIRWAYS': 'QR',
      'SINGAPORE': 'SQ',
      'SINGAPOREAIRLINES': 'SQ',
      'CATHAY': 'CX',
      'CATHAYPACIFIC': 'CX',
      'ETIHAD': 'EY',
      'ETIHADAIRWAYS': 'EY',
      'TURKISH': 'TK',
      'TURKISHAIRLINES': 'TK',
      'AIR': 'AF', // Air France
      'AIRFRANCE': 'AF',
      'KLM': 'KL',
      'SOUTHWEST': 'WN',
      'SOUTHWESTAIRLINES': 'WN',
      'JETBLUE': 'B6',
      'JETBLUEAIRWAYS': 'B6',
      'ALASKA': 'AS',
      'ALASKAAIRLINES': 'AS',
      'VIRGIN': 'VS',
      'VIRGINATLANTIC': 'VS',
      'NORWEGIANAIR': 'DY',
      'NORWEGIAN': 'DY',
      'RYANAIR': 'FR',
      'EASYJET': 'U2',
      'AIRCANADA': 'AC',
      'WESTJET': 'WS',
      'JAPANAIRLINES': 'JL',
      'ALLNIPPONAIRWAYS': 'NH',
      'KOREANAIR': 'KE',
      'ASIANA': 'OZ',
      'CHINA': 'CA',
      'CHINAAIRLINES': 'CI',
      'THAIAIRWAYS': 'TG',
      'MALAYSIAAIRLINES': 'MH',
      'PHILIPPINEAIRLINES': 'PR',
      'GARUDA': 'GA',
      'QANTAS': 'QF',
      'JETSTAR': 'JQ',
      'VIRGINAUSTRALIA': 'VA',
      'AIRASIA': 'AK',
      'CEBU': '5J',
      'INDIGO': '6E',
      'SPICEJET': 'SG',
      'VISTARA': 'UK',
      'GOAIR': 'G8',
      'AIRINDIA': 'AI',
    };

    // Pattern matching for different input formats
    const patterns = [
      // Full airline name + number (Emirates 221, American Airlines 123, JETBLUE1023)
      /^([A-Z]+(?:AIRLINES?|AIRWAYS?)?)(\d+)$/,
      // IATA code + number (EK221, EK 221)
      /^([A-Z]{2})(\d+)$/,
      // ICAO code + number (UAE221, UAE 221)
      /^([A-Z]{3})(\d+)$/,
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const [, airline, number] = match;
        
        // Convert airline name to IATA code if needed
        const airlineCode = airlineMap[airline] || airline;
        
        // Validate IATA code format (2 letters)
        if (airlineCode.length === 2 && /^[A-Z]{2}$/.test(airlineCode)) {
          return `${airlineCode}${number}`;
        }
        
        // If it's a 3-letter code, try to find corresponding IATA
        if (airlineCode.length === 3) {
          // Some common ICAO to IATA mappings
          const icaoToIata = {
            'UAE': 'EK', // Emirates
            'AAL': 'AA', // American Airlines
            'DAL': 'DL', // Delta
            'UAL': 'UA', // United
            'DLH': 'LH', // Lufthansa
            'BAW': 'BA', // British Airways
            'QTR': 'QR', // Qatar Airways
            'SIA': 'SQ', // Singapore Airlines
            'CPA': 'CX', // Cathay Pacific
            'ETD': 'EY', // Etihad
            'THY': 'TK', // Turkish Airlines
            'AFR': 'AF', // Air France
            'KLM': 'KL', // KLM
          };
          
          const iataCode = icaoToIata[airlineCode];
          if (iataCode) {
            return `${iataCode}${number}`;
          }
        }
      }
    }

    // If no pattern matches but it looks like a valid flight number, return as-is
    if (/^[A-Z0-9]{2,7}$/.test(cleaned)) {
      return cleaned;
    }

    throw new AppError(
      'Invalid flight number format. Please use formats like "EK221", "Emirates 221", or "AA123"',
      400
    );
  }

  /**
   * Format date for FlightAware API (ISO8601 without milliseconds)
   */
  formatDateForAPI(date) {
    if (!date) return null;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      throw new AppError('Invalid date format', 400);
    }
    
    // FlightAware API expects ISO8601 format without milliseconds
    return d.toISOString().split('.')[0] + 'Z';
  }

  /**
   * Format datetime for FlightAware API (ISO8601 without milliseconds)
   */
  formatDateTimeForAPI(date, time = null) {
    if (!date) return null;
    
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      throw new AppError('Invalid date format', 400);
    }
    
    if (time) {
      const t = new Date(time);
      if (!isNaN(t.getTime())) {
        // Use the time from the time parameter
        d.setHours(t.getHours(), t.getMinutes(), t.getSeconds(), 0); // Remove milliseconds
      }
    }
    
    // FlightAware API expects ISO8601 format without milliseconds
    return d.toISOString().split('.')[0] + 'Z';
  }

  /**
   * Determine whether a given date string (ISO-8601 or any JS-parsable format)
   * is in a past calendar day relative to the server clock.
   * Returns true only when the date is strictly before today (local time).
   */
  isPastDate(date) {
    if (!date) return false;

    const d = new Date(date);
    if (isNaN(d.getTime())) {
      throw new AppError('Invalid date format', 400);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // midnight today
    d.setHours(0, 0, 0, 0); // midnight of provided date

    return d < today;
  }

  /**
   * Search for flights using FlightAware API (recent or historical).
   */
  async searchFlights(flightNumber, date = null, time = null) {
    try {
      // Parse and normalize flight number
      const normalizedFlightNumber = this.parseFlightNumber(flightNumber);
      
      // Build API parameters for FlightAware v4 API
      const params = {
        max_pages: 1, // Limit to first page for performance
      };

      // Add date parameters if provided
      if (date) {
        if (time) {
          // If both date and time provided, search for flights on/after that datetime
          const startISO = this.formatDateTimeForAPI(date, time);
          const endDate = new Date(date);
          endDate.setHours(23, 59, 59, 0); // Remove milliseconds
          const endISO = endDate.toISOString().split('.')[0] + 'Z';
          
          params.start = startISO;
          params.end = endISO;
        } else {
          // If only date provided, search for flights on that date
          const startDate = new Date(date);
          startDate.setHours(0, 0, 0, 0);
          const endDate = new Date(date);
          endDate.setHours(23, 59, 59, 0); // Remove milliseconds
          
          params.start = startDate.toISOString().split('.')[0] + 'Z';
          params.end = endDate.toISOString().split('.')[0] + 'Z';
        }
      } else {
        // If no date provided, get recent and upcoming flights (2 days range)
        const now = new Date();
        const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));
        const twoDaysFromNow = new Date(now.getTime() + (2 * 24 * 60 * 60 * 1000));
        
        params.start = twoDaysAgo.toISOString().split('.')[0] + 'Z';
        params.end = twoDaysFromNow.toISOString().split('.')[0] + 'Z';
      }

      // Select the appropriate FlightAware endpoint
      let endpoint = `/flights/${normalizedFlightNumber}`;
      if (date && this.isPastDate(date)) {
        endpoint = `/history${endpoint}`; // prepend /history for past-date lookups
      }

      console.log('FlightAware API Request:', {
        url: endpoint,
        params,
        baseURL: this.baseURL,
      });

      // Make API request to FlightAware v4 API
      const response = await this.apiClient.get(endpoint, { params });

      // Process and return flight data
      return this.processFlightData(response.data, normalizedFlightNumber);

    } catch (error) {
      console.error('FlightAware API Error:', error.response?.data || error.message);
      
      if (error.response?.status === 401) {
        throw new AppError('FlightAware API authentication failed', 500);
      } else if (error.response?.status === 404) {
        throw new AppError(`No flights found for flight number: ${flightNumber}`, 404);
      } else if (error.response?.status === 429) {
        throw new AppError('FlightAware API rate limit exceeded. Please try again later.', 429);
      } else if (error instanceof AppError) {
        throw error;
      } else {
        throw new AppError('Flight lookup service temporarily unavailable', 500);
      }
    }
  }

  /**
   * Process and normalize flight data from FlightAware API
   */
  processFlightData(apiResponse, searchedFlightNumber) {
    const flights = apiResponse.flights || [];
    
    if (flights.length === 0) {
      return {
        searchedFlightNumber,
        flights: [],
        message: 'No flights found for the specified criteria'
      };
    }

    const processedFlights = flights.map(flight => ({
      // Flight identification
      faFlightId: flight.fa_flight_id,
      ident: flight.ident,
      identIcao: flight.ident_icao,
      identPrefix: flight.ident_prefix,
      
      // Aircraft information
      aircraft: {
        type: flight.aircraft_type,
        registration: flight.registration,
      },
      
      // Route information
      origin: {
        code: flight.origin?.code,
        codeIcao: flight.origin?.code_icao,
        name: flight.origin?.name,
        city: flight.origin?.city,
        timezone: flight.origin?.timezone,
      },
      destination: {
        code: flight.destination?.code,
        codeIcao: flight.destination?.code_icao,
        name: flight.destination?.name,
        city: flight.destination?.city,
        timezone: flight.destination?.timezone,
      },
      
      // Timing information
      scheduledDeparture: flight.scheduled_out,
      estimatedDeparture: flight.estimated_out,
      actualDeparture: flight.actual_out,
      scheduledArrival: flight.scheduled_in,
      estimatedArrival: flight.estimated_in,
      actualArrival: flight.actual_in,
      
      // Flight status
      status: flight.status,
      progressPercent: flight.progress_percent,
      
      // Additional metadata
      filed: flight.filed,
      route: flight.route,
      distance: flight.distance,
      departureDelay: flight.departure_delay,
      arrivalDelay: flight.arrival_delay,
    }));

    return {
      searchedFlightNumber,
      originalQuery: apiResponse,
      flights: processedFlights,
      totalCount: flights.length,
      message: `Found ${flights.length} flight(s) for ${searchedFlightNumber}`
    };
  }

  /**
   * Get detailed flight information by FA flight ID
   */
  async getFlightDetails(faFlightId) {
    try {
      const response = await this.apiClient.get(`/flights/${faFlightId}`);
      return this.processFlightData({ flights: [response.data] }, response.data.ident);
    } catch (error) {
      console.error('FlightAware Flight Details Error:', error.response?.data || error.message);
      throw new AppError('Unable to fetch flight details', 500);
    }
  }

  /**
   * Get airport information by ICAO or IATA code from FlightAware API
   */
  async getAirportInfo(airportCode) {
    try {
      if (!airportCode) {
        throw new AppError('Airport code is required', 400);
      }

      const code = airportCode.trim().toUpperCase();
      console.log(`🔍 Looking up airport information for: ${code}`);
      
      // FlightAware airport endpoint accepts ICAO, IATA, or LID codes
      const response = await this.apiClient.get(`/airports/${code}`);
      
      if (response.data) {
        const airport = response.data;
        
        console.log(`✅ Found airport data from FlightAware:`, {
          code: airport.code,
          codeIcao: airport.code_icao,
          codeIata: airport.code_iata,
          name: airport.name,
          city: airport.city
        });

        return {
          code: airport.code || code,
          codeIcao: airport.code_icao,
          codeIata: airport.code_iata,
          name: airport.name,
          city: airport.city,
          country: airport.country_code,
          timezone: airport.timezone,
          latitude: airport.latitude,
          longitude: airport.longitude
        };
      }

      return null;
    } catch (error) {
      console.error(`❌ FlightAware Airport Lookup Error for ${airportCode}:`, error.response?.data || error.message);
      
      if (error.response?.status === 404) {
        console.log(`📍 Airport ${airportCode} not found in FlightAware database`);
        return null;
      } else if (error.response?.status === 401) {
        throw new AppError('FlightAware API authentication failed', 500);
      } else if (error.response?.status === 429) {
        throw new AppError('FlightAware API rate limit exceeded. Please try again later.', 429);
      } else if (error instanceof AppError) {
        throw error;
      } else {
        // Don't throw error for airport lookup failures - just return null
        console.log(`⚠️  Could not fetch airport data from FlightAware for ${airportCode}, will use fallback logic`);
        return null;
      }
    }
  }
}

module.exports = new FlightAwareService(); 