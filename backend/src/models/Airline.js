const mongoose = require('mongoose');
const { Schema } = mongoose;

const airlineSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Airline name is required'],
    trim: true,
  },
  iataCode: {
    type: String,
    required: [true, 'IATA code is required'],
    unique: true,
    uppercase: true,
    length: [2, 'IATA code must be exactly 2 characters'],
    match: [/^[A-Z]{2}$/, 'IATA code must be 2 uppercase letters'],
  },
  icaoCode: {
    type: String,
    uppercase: true,
    length: [3, 'ICAO code must be exactly 3 characters'],
    match: [/^[A-Z]{3}$/, 'ICAO code must be 3 uppercase letters'],
  },
  logo: {
    type: String,
    validate: {
      validator: function(v) {
        return !v || /^https?:\/\/.+/.test(v);
      },
      message: 'Logo must be a valid URL',
    },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for performance
airlineSchema.index({ iataCode: 1 });
airlineSchema.index({ name: 'text' }); // Text search index

// Virtual for flight count (if needed)
airlineSchema.virtual('flightCount', {
  ref: 'Flight',
  localField: '_id',
  foreignField: 'airline',
  count: true,
});

// Static method to find or create airline
airlineSchema.statics.findOrCreate = async function(airlineData) {
  const { iataCode } = airlineData;
  
  let airline = await this.findOne({ iataCode });
  
  if (!airline) {
    airline = await this.create(airlineData);
  }
  
  return airline;
};

const Airline = mongoose.model('Airline', airlineSchema);

module.exports = Airline; 