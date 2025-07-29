const axios = require('axios');
const logger = require('../utils/logger');

class FlickrService {
  constructor() {
    this.baseUrl = 'https://www.flickr.com/services/rest/';
    this.apiKey = process.env.FLICKR_API_KEY;
    this.cache = new Map(); // Simple in-memory cache
    this.cacheExpiry = 1000 * 60 * 30; // 30 minutes cache
    
    if (!this.apiKey) {
      logger.warn('⚠️ Flickr API key not configured. Aircraft images will not be available.');
    }
  }

  /**
   * Generate cache key from search parameters
   */
  getCacheKey(registration, aircraftType, airline) {
    const key = [registration, aircraftType, airline]
      .filter(Boolean)
      .join('|')
      .toLowerCase();
    return `flickr:${key}`;
  }

  /**
   * Get cached result if available and not expired
   */
  getCachedResult(cacheKey) {
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      logger.info(`💾 Cache hit for key: ${cacheKey}`);
      return cached.data;
    }
    return null;
  }

  /**
   * Store result in cache
   */
  setCachedResult(cacheKey, data) {
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
    });
    logger.info(`💾 Cached result for key: ${cacheKey}`);
  }

  /**
   * Clear all cached results
   */
  clearCache() {
    this.cache.clear();
    logger.info('🗑️ Cleared all cached aircraft images');
  }

  /**
   * Clear specific cached result
   */
  clearCachedResult(registration, aircraftType, airline) {
    const cacheKey = this.getCacheKey(registration, aircraftType, airline);
    const deleted = this.cache.delete(cacheKey);
    if (deleted) {
      logger.info(`🗑️ Cleared cached result for key: ${cacheKey}`);
    } else {
      logger.info(`ℹ️ No cached result found for key: ${cacheKey}`);
    }
    return deleted;
  }

  /**
   * Force refresh - clear cache and fetch fresh results
   */
  async forceRefreshAircraftImage(registration, aircraftType, airline) {
    // Clear cache first
    this.clearCachedResult(registration, aircraftType, airline);
    
    // Then fetch fresh results
    return await this.getAircraftImage(registration, aircraftType, airline);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    const expired = entries.filter(([key, value]) => now - value.timestamp >= this.cacheExpiry);
    
    return {
      totalEntries: this.cache.size,
      expiredEntries: expired.length,
      validEntries: this.cache.size - expired.length,
      cacheExpiry: this.cacheExpiry,
    };
  }

  /**
   * Search for aircraft images based on aircraft registration, type, and airline
   */
  async searchAircraftImages(registration, aircraftType, airline) {
    logger.info('🎯 searchAircraftImages called with:', registration, aircraftType, airline);
    
    // Check if API key is available
    if (!this.apiKey) {
      logger.warn('⚠️ No Flickr API key available, returning empty results');
      return [];
    }

    // Generate cache key and check cache first
    const cacheKey = this.getCacheKey(registration, aircraftType, airline);
    const cached = this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    // Build search query for aircraft photos
    const searchTerms = [];
    if (registration) {
      searchTerms.push(registration);
    }
    if (aircraftType) {
      // Add common aircraft type variations
      searchTerms.push(aircraftType);
      // Add manufacturer if recognizable
      const manufacturer = this.getManufacturerFromType(aircraftType);
      if (manufacturer) searchTerms.push(manufacturer);
    }
    if (airline) {
      searchTerms.push(airline);
    }

    const searchQuery = searchTerms.join(' ');
    logger.info(`🔍 Searching Flickr for: "${searchQuery}"`);

    try {
      // Make the Flickr API call
      const params = {
        method: 'flickr.photos.search',
        api_key: this.apiKey,
        text: searchQuery,
        format: 'json',
        nojsoncallback: 1,
        per_page: 10,
        page: 1,
        extras: 'url_m,url_l,url_o', // Request multiple sizes
        safe_search: 1,
        content_type: 1, // Photos only
        media: 'photos',
        sort: 'relevance',
      };

      logger.info('📡 Making Flickr API request');
      
      // Sanitized logging - don't expose API key
      const sanitizedParams = { ...params };
      delete sanitizedParams.api_key;
      logger.info('📡 Request params:', sanitizedParams);
      
      const response = await axios.get(this.baseUrl, { 
        params, 
        timeout: 10000, 
        headers: { 'User-Agent': 'ThatsMyPlane/1.0' },
        maxRedirects: 5
      });
      
      // Validate response structure
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid response format from Flickr API');
      }
      
      if (response.data.stat !== 'ok') {
        // Sanitize error message to prevent information disclosure
        const errorMessage = response.data.message || 'External service error';
        logger.warn('⚠️ Flickr API returned error:', errorMessage);
        throw new Error('External image service temporarily unavailable');
      }

      logger.info('✅ Flickr API call successful');
      return this.processFlickrResponse(response.data, cacheKey, searchQuery);

    } catch (error) {
      // Enhanced error handling with sanitization
      if (error.code === 'ECONNABORTED') {
        logger.error('❌ Flickr API timeout');
      } else if (error.response) {
        logger.error('❌ Flickr API HTTP error:', error.response.status);
      } else if (error.request) {
        logger.error('❌ Flickr API network error');
      } else {
        logger.error('❌ Flickr API error:', error.message);
      }
      
      // Return empty results on any error - never expose internal errors
      logger.info('📷 Returning empty results due to external service error');
      this.setCachedResult(cacheKey, []);
      return [];
    }
  }

  /**
   * Extract manufacturer from aircraft type code
   */
  getManufacturerFromType(aircraftType) {
    if (!aircraftType) return null;
    
    const type = aircraftType.toUpperCase();
    
    // Common aircraft type to manufacturer mapping
    const manufacturerMap = {
      'A': 'Airbus',     // A320, A350, etc.
      'B': 'Boeing',     // B737, B777, etc.
      'E': 'Embraer',    // E190, etc.
      'C': 'Bombardier', // CRJ, etc.
      'AT': 'ATR',       // ATR72, etc.
      'DH': 'De Havilland',
    };

    // Check for direct matches
    for (const [prefix, manufacturer] of Object.entries(manufacturerMap)) {
      if (type.startsWith(prefix)) {
        return manufacturer;
      }
    }

    return null;
  }

  /**
   * Process Flickr API response data into our standard format
   */
  processFlickrResponse(data, cacheKey, searchQuery) {
    // Check if photos exist
    if (!data.photos || !data.photos.photo || data.photos.photo.length === 0) {
      logger.info(`📷 No photos found for search query: ${searchQuery}`);
      const emptyResult = [];
      if (cacheKey) this.setCachedResult(cacheKey, emptyResult);
      return emptyResult;
    }

    logger.info(`✅ Found ${data.photos.photo.length} photos for query: ${searchQuery}`);

    // Process and return photos
    const result = data.photos.photo
      .filter(photo => photo.url_m || photo.url_l || photo.url_o) // Only photos with URLs
      .map(photo => ({
        id: photo.id,
        title: photo.title,
        url: photo.url_o || photo.url_l || photo.url_m || this.constructPhotoUrl(photo),
        thumbnail: photo.url_m || this.constructPhotoUrl(photo, 'm'),
        source: 'flickr',
        attribution: `Photo by Flickr user - ${photo.title}`,
      }))
      .slice(0, 5); // Return top 5 results

    // Cache the result
    if (cacheKey) this.setCachedResult(cacheKey, result);
    return result;
  }

  /**
   * Construct photo URL manually if extras URLs are not available
   */
  constructPhotoUrl(photo, size = 'm') {
    // Construct image URL according to Flickr URL format
    return `https://farm${photo.farm}.staticflickr.com/${photo.server}/${photo.id}_${photo.secret}_${size}.jpg`;
  }

  /**
   * Get a single best aircraft image
   */
  async getAircraftImage(registration, aircraftType, airline) {
    try {
      const images = await this.searchAircraftImages(registration, aircraftType, airline);
      return images.length > 0 ? images[0] : null;
    } catch (error) {
      logger.error('❌ Error getting aircraft image:', error);
      return null; // Return null for graceful fallback
    }
  }

  /**
   * Health check for Flickr service
   */
  async healthCheck() {
    try {
      if (!this.apiKey) {
        return { status: 'error', message: 'API key not configured' };
      }

      // Test with a simple search
      const params = {
        method: 'flickr.test.echo',
        api_key: this.apiKey,
        format: 'json',
        nojsoncallback: 1,
      };

      const response = await axios.get(this.baseUrl, { params });
      
      if (response.data.stat === 'ok') {
        return { status: 'ok', message: 'Flickr API is accessible' };
      } else {
        return { status: 'error', message: 'Flickr API returned error' };
      }
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

module.exports = new FlickrService(); 