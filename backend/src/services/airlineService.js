const Airline = require('../models/Airline');
const logger = require('../utils/logger');

class AirlineService {
  constructor() {
    // Comprehensive airline code mapping for intelligent detection
    this.airlineCodeMap = {
      // Major Airlines
      'EK': { name: 'Emirates', icaoCode: 'UAE' },
      'AA': { name: 'American Airlines', icaoCode: 'AAL' },
      'DL': { name: 'Delta Air Lines', icaoCode: 'DAL' },
      'UA': { name: 'United Airlines', icaoCode: 'UAL' },
      'BA': { name: 'British Airways', icaoCode: 'BAW' },
      'LH': { name: 'Lufthansa', icaoCode: 'DLH' },
      'AF': { name: 'Air France', icaoCode: 'AFR' },
      'KL': { name: 'KLM Royal Dutch Airlines', icaoCode: 'KLM' },
      'SQ': { name: 'Singapore Airlines', icaoCode: 'SIA' },
      'QF': { name: 'Qantas', icaoCode: 'QFA' },
      'CX': { name: 'Cathay Pacific', icaoCode: 'CPA' },
      'JL': { name: 'Japan Airlines', icaoCode: 'JAL' },
      'NH': { name: 'All Nippon Airways', icaoCode: 'ANA' },
      'TK': { name: 'Turkish Airlines', icaoCode: 'THY' },
      'EY': { name: 'Etihad Airways', icaoCode: 'ETD' },
      'QR': { name: 'Qatar Airways', icaoCode: 'QTR' },
      'SV': { name: 'Saudia', icaoCode: 'SVA' },
      'LX': { name: 'Swiss International Air Lines', icaoCode: 'SWR' },
      'OS': { name: 'Austrian Airlines', icaoCode: 'AUA' },
      'SK': { name: 'Scandinavian Airlines', icaoCode: 'SAS' },
      'AY': { name: 'Finnair', icaoCode: 'FIN' },
      'IB': { name: 'Iberia', icaoCode: 'IBE' },
      'TP': { name: 'TAP Air Portugal', icaoCode: 'TAP' },
      'AI': { name: 'Air India', icaoCode: 'AIC' },
      'AC': { name: 'Air Canada', icaoCode: 'ACA' },
      'WF': { name: 'WestJet', icaoCode: 'WJA' },
      'VS': { name: 'Virgin Atlantic', icaoCode: 'VIR' },
      'VY': { name: 'Vueling', icaoCode: 'VLG' },
      'FR': { name: 'Ryanair', icaoCode: 'RYR' },
      'U2': { name: 'easyJet', icaoCode: 'EZY' },
      'WN': { name: 'Southwest Airlines', icaoCode: 'SWA' },
      'B6': { name: 'JetBlue Airways', icaoCode: 'JBU' },
      'AS': { name: 'Alaska Airlines', icaoCode: 'ASA' },
      'F9': { name: 'Frontier Airlines', icaoCode: 'FFT' },
      'NK': { name: 'Spirit Airlines', icaoCode: 'NKS' },
      
      // Regional and Other Airlines
      'OO': { name: 'SkyWest Airlines', icaoCode: 'SKW' },
      'YV': { name: 'Mesa Airlines', icaoCode: 'ASH' },
      'OH': { name: 'PSA Airlines', icaoCode: 'JIA' },
      'MQ': { name: 'Envoy Air', icaoCode: 'ENY' },
      'YX': { name: 'Republic Airways', icaoCode: 'RPA' },
      'G7': { name: 'Allegiant Air', icaoCode: 'AAY' },
      'SY': { name: 'Sun Country Airlines', icaoCode: 'SCX' },
    };
  }

  /**
   * Parse flight identifier to extract airline code and flight number
   * @param {string} flightIdent - Flight identifier (e.g., "EK221", "Emirates 221")
   * @returns {object} Parsed flight information
   */
  parseFlightIdent(flightIdent) {
    if (!flightIdent) {
      throw new Error('Flight identifier is required');
    }

    const cleaned = flightIdent.trim().toUpperCase();
    logger.info(`Parsing flight identifier: ${cleaned}`);

    // Pattern 1: Standard IATA code + number (e.g., "EK221", "AA1234")
    const standardPattern = /^([A-Z]{2,3})(\d+[A-Z]?)$/;
    const standardMatch = cleaned.match(standardPattern);
    
    if (standardMatch) {
      const [, airlineCode, flightNumber] = standardMatch;
      logger.info(`Standard pattern matched: ${airlineCode} ${flightNumber}`);
      return {
        airlineCode,
        flightNumber,
        originalIdent: flightIdent.trim(),
      };
    }

    // Pattern 2: Airline name + number (e.g., "Emirates 221", "American 1234")
    const namePattern = /^([A-Z][A-Z\s]+?)\s+(\d+[A-Z]?)$/;
    const nameMatch = cleaned.match(namePattern);
    
    if (nameMatch) {
      const [, airlineName, flightNumber] = nameMatch;
      const airlineCode = this.findAirlineCodeByName(airlineName.trim());
      
      if (airlineCode) {
        logger.info(`Name pattern matched: ${airlineName} → ${airlineCode} ${flightNumber}`);
        return {
          airlineCode,
          flightNumber,
          originalIdent: flightIdent.trim(),
        };
      }
    }

    // Pattern 3: Code with space (e.g., "EK 221", "AA 1234")
    const spacePattern = /^([A-Z]{2,3})\s+(\d+[A-Z]?)$/;
    const spaceMatch = cleaned.match(spacePattern);
    
    if (spaceMatch) {
      const [, airlineCode, flightNumber] = spaceMatch;
      logger.info(`Space pattern matched: ${airlineCode} ${flightNumber}`);
      return {
        airlineCode,
        flightNumber,
        originalIdent: flightIdent.trim(),
      };
    }

    logger.warn(`Could not parse flight identifier: ${cleaned}`);
    throw new Error(`Invalid flight identifier format: ${flightIdent}`);
  }

  /**
   * Find airline code by airline name
   * @param {string} airlineName - Full airline name
   * @returns {string|null} IATA code if found
   */
  findAirlineCodeByName(airlineName) {
    const normalizedName = airlineName.toLowerCase();
    
    for (const [code, info] of Object.entries(this.airlineCodeMap)) {
      if (info.name.toLowerCase().includes(normalizedName) || 
          normalizedName.includes(info.name.toLowerCase())) {
        return code;
      }
    }
    
    return null;
  }

  /**
   * Find or create airline entity
   * @param {string} airlineCode - IATA or ICAO airline code
   * @returns {Promise<object>} Airline document
   */
  async findOrCreateAirline(airlineCode) {
    if (!airlineCode) {
      throw new Error('Airline code is required');
    }

    const normalizedCode = airlineCode.toUpperCase();
    logger.info(`Finding or creating airline: ${normalizedCode}`);

    // Try to find existing airline by IATA code
    let airline = await Airline.findOne({ iataCode: normalizedCode });
    
    if (airline) {
      logger.info(`Found existing airline by IATA: ${airline.name} (${airline.iataCode})`);
      return airline;
    }

    // Try to find existing airline by ICAO code
    airline = await Airline.findOne({ icaoCode: normalizedCode });
    
    if (airline) {
      logger.info(`Found existing airline by ICAO: ${airline.name} (${airline.icaoCode})`);
      return airline;
    }

    // Try to find in our mapping (IATA to airline info)
    let airlineInfo = this.airlineCodeMap[normalizedCode];
    let iataCode = normalizedCode;
    let icaoCode = null;

    if (airlineInfo) {
      // Found direct IATA mapping
      icaoCode = airlineInfo.icaoCode;
      logger.info(`Found airline in IATA mapping: ${normalizedCode} -> ${airlineInfo.name}`);
    } else {
      // Try reverse lookup (ICAO to IATA)
      for (const [iata, info] of Object.entries(this.airlineCodeMap)) {
        if (info.icaoCode === normalizedCode) {
          airlineInfo = info;
          iataCode = iata;
          icaoCode = normalizedCode;
          logger.info(`Found airline in ICAO reverse lookup: ${normalizedCode} -> ${iata} (${info.name})`);
          break;
        }
      }
    }

    // If we still don't have mapping info, create a generic airline entry
    if (!airlineInfo) {
      logger.warn(`No mapping found for airline code: ${normalizedCode}. Creating generic entry.`);
      
      // Determine if it's likely IATA (2-3 chars) or ICAO (3-4 chars)
      if (normalizedCode.length === 2) {
        // Likely IATA code
        iataCode = normalizedCode;
        icaoCode = null;
      } else if (normalizedCode.length === 3) {
        // Could be either IATA or ICAO - assume IATA for now
        iataCode = normalizedCode;
        icaoCode = null;
      } else {
        // Likely ICAO code, try to derive IATA
        icaoCode = normalizedCode;
        iataCode = normalizedCode.substring(0, 2); // Best guess
      }
      
      airlineInfo = {
        name: `Airline ${iataCode}`, // Generic name, can be updated later
        icaoCode: icaoCode,
      };
    }

    const airlineData = {
      name: airlineInfo.name,
      iataCode: iataCode,
      icaoCode: icaoCode,
    };

    try {
      airline = await Airline.create(airlineData);
      logger.info(`Created new airline: ${airline.name} (IATA: ${airline.iataCode}, ICAO: ${airline.icaoCode})`);
      return airline;
    } catch (error) {
      if (error.code === 11000) {
        // Handle race condition - another request created the airline
        airline = await Airline.findOne({ 
          $or: [
            { iataCode: iataCode },
            { icaoCode: icaoCode }
          ]
        });
        if (airline) {
          logger.info(`Found airline created by concurrent request: ${airline.name}`);
          return airline;
        }
      }
      throw error;
    }
  }

  /**
   * Get airline information from flight identifier
   * @param {string} flightIdent - Flight identifier
   * @returns {Promise<object>} Airline document and parsed flight info
   */
  async getAirlineFromFlightIdent(flightIdent) {
    const parsed = this.parseFlightIdent(flightIdent);
    const airline = await this.findOrCreateAirline(parsed.airlineCode);
    
    return {
      airline,
      flightNumber: parsed.flightNumber,
      originalIdent: parsed.originalIdent,
    };
  }
}

module.exports = new AirlineService(); 