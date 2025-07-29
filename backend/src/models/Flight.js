const mongoose = require('mongoose');
const { Schema } = mongoose;

const flightSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  flightNumber: {
    type: String,
    required: [true, 'Flight number is required'],
    trim: true,
    uppercase: true,
  },
  airline: {
    type: Schema.Types.ObjectId,
    ref: 'Airline',
    required: [true, 'Airline is required'],
  },
  date: {
    type: Date,
    required: [true, 'Flight date is required'],
  },
  originAirport: {
    type: Schema.Types.ObjectId,
    ref: 'Airport',
    required: [true, 'Origin airport is required'],
  },
  destinationAirport: {
    type: Schema.Types.ObjectId,
    ref: 'Airport',
    required: [true, 'Destination airport is required'],
  },
  aircraft: {
    type: Schema.Types.ObjectId,
    ref: 'Aircraft',
    required: [true, 'Aircraft is required'],
  },
  times: {
    gate: Date,
    takeoff: Date,
    landing: Date,
    scheduled: {
      departure: Date,
      arrival: Date,
    },
  },
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters'],
  },
  seat: {
    type: String,
    trim: true,
    uppercase: true,
    match: [/^[0-9]{1,3}[A-Z]?$/, 'Invalid seat format'],
  },
  flightAwareData: {
    type: Schema.Types.Mixed,
    select: false, // Don't include in queries by default
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Compound indexes for performance
flightSchema.index({ userId: 1, date: -1 });
flightSchema.index({ userId: 1, aircraft: 1, date: -1 });
flightSchema.index({ airline: 1, flightNumber: 1, date: 1 });

// Virtual for flight duration
flightSchema.virtual('duration').get(function() {
  if (this.times.takeoff && this.times.landing) {
    return this.times.landing - this.times.takeoff;
  }
  return null;
});

// Virtual for route display
flightSchema.virtual('route').get(function() {
  if (this.populated('originAirport') && this.populated('destinationAirport')) {
    return `${this.originAirport.iataCode} → ${this.destinationAirport.iataCode}`;
  }
  return null;
});

// Pre-populate related documents
flightSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'airline',
    select: 'name iataCode logo',
  }).populate({
    path: 'originAirport',
    select: 'name iataCode city country',
  }).populate({
    path: 'destinationAirport',
    select: 'name iataCode city country',
  }).populate({
    path: 'aircraft',
    select: 'tailNumber aircraftType manufacturer model photos airline',
    populate: {
      path: 'airline',
      select: 'name iataCode logo',
    },
  });
  
  next();
});

// Static method for hangar view (ordered by tail number, then date desc)
flightSchema.statics.getHangarView = async function(userId) {
  return this.aggregate([
    {
      $match: { userId: new mongoose.Types.ObjectId(userId) }
    },
    {
      $lookup: {
        from: "aircrafts",
        localField: "aircraft",
        foreignField: "_id",
        as: "aircraftInfo"
      }
    },
    {
      $lookup: {
        from: "airports",
        localField: "originAirport",
        foreignField: "_id",
        as: "originAirportInfo"
      }
    },
    {
      $lookup: {
        from: "airports",
        localField: "destinationAirport",
        foreignField: "_id",
        as: "destinationAirportInfo"
      }
    },
    {
      $lookup: {
        from: "airlines",
        localField: "airline",
        foreignField: "_id",
        as: "airlineInfo"
      }
    },
    {
      $project: {
        flightNumber: 1,
        date: 1,
        times: 1,
        notes: 1,
        seat: 1,
        createdAt: 1,
        updatedAt: 1,
        aircraft: {
          $arrayElemAt: ["$aircraftInfo", 0]
        },
        airline: {
          $arrayElemAt: ["$airlineInfo", 0]
        },
        originAirport: {
          $arrayElemAt: ["$originAirportInfo", 0]
        },
        destinationAirport: {
          $arrayElemAt: ["$destinationAirportInfo", 0]
        },
        aircraftInfoCount: {
          $size: "$aircraftInfo"
        }
      }
    },
    {
      $sort: {
        'date': -1
      }
    }
  ]);
};

// Instance method to get formatted flight info
flightSchema.methods.getFormattedFlightInfo = function() {
  const airlineCode = this.populated('airline') ? this.airline.iataCode : '';
  return `${airlineCode}${this.flightNumber}`;
};

// Instance method to check if flight is in the past
flightSchema.methods.isPastFlight = function() {
  return this.date < new Date();
};

const Flight = mongoose.model('Flight', flightSchema);

module.exports = Flight; 