const mongoose = require('mongoose');
const { Schema } = mongoose;

const airportSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Airport name is required'],
    trim: true,
  },
  city: {
    type: String,
    required: [true, 'City is required'],
    trim: true,
  },
  country: {
    type: String,
    required: [true, 'Country is required'],
    trim: true,
  },
  iataCode: {
    type: String,
    required: [true, 'IATA code is required'],
    unique: true,
    uppercase: true,
    length: [3, 'IATA code must be exactly 3 characters'],
    match: [/^[A-Z]{3}$/, 'IATA code must be 3 uppercase letters'],
  },
  icaoCode: {
    type: String,
    uppercase: true,
    length: [4, 'ICAO code must be exactly 4 characters'],
    match: [/^[A-Z]{4}$/, 'ICAO code must be 4 uppercase letters'],
  },
  timezone: {
    type: String,
    required: [true, 'Timezone is required'],
  },
  coordinates: {
    lat: {
      type: Number,
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90'],
    },
    lng: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180'],
    },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for performance
airportSchema.index({ iataCode: 1 });
airportSchema.index({ icaoCode: 1 });
airportSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
airportSchema.index({ name: 'text', city: 'text', country: 'text' }); // Text search

// Virtual for flight count (if needed)
airportSchema.virtual('departureCount', {
  ref: 'Flight',
  localField: '_id',
  foreignField: 'originAirport',
  count: true,
});

airportSchema.virtual('arrivalCount', {
  ref: 'Flight',
  localField: '_id',
  foreignField: 'destinationAirport',
  count: true,
});

// Static method to find or create airport
airportSchema.statics.findOrCreate = async function(airportData) {
  const { iataCode } = airportData;
  
  let airport = await this.findOne({ iataCode });
  
  if (!airport) {
    airport = await this.create(airportData);
  }
  
  return airport;
};

// Instance method to get formatted location
airportSchema.methods.getFormattedLocation = function() {
  return `${this.name} (${this.iataCode}) - ${this.city}, ${this.country}`;
};

const Airport = mongoose.model('Airport', airportSchema);

module.exports = Airport; 