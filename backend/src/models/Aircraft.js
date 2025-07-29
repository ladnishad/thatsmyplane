const mongoose = require('mongoose');
const { Schema } = mongoose;

const aircraftSchema = new Schema({
  tailNumber: {
    type: String,
    required: [true, 'Tail number is required'],
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^[A-Z0-9-]+$/, 'Invalid tail number format'],
  },
  airline: {
    type: Schema.Types.ObjectId,
    ref: 'Airline',
    required: false, // Optional because some aircraft might not have a known operator
  },
  aircraftType: {
    type: String,
    required: [true, 'Aircraft type is required'],
    trim: true,
  },
  manufacturer: {
    type: String,
    trim: true,
  },
  model: {
    type: String,
    trim: true,
  },
  photos: [{
    url: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^https?:\/\/.+/.test(v);
        },
        message: 'Photo URL must be valid',
      },
    },
    photographer: {
      type: String,
      required: true,
    },
    flickrId: {
      type: String,
      required: true,
    },
    license: {
      type: String,
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  specs: {
    engines: String,
    capacity: Number,
    firstFlight: Date,
    deliveryDate: Date,
  },
  photoLastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for performance
aircraftSchema.index({ tailNumber: 1 });
aircraftSchema.index({ airline: 1 });
aircraftSchema.index({ aircraftType: 'text', manufacturer: 'text', model: 'text' });

// Virtual for flight count
aircraftSchema.virtual('flightCount', {
  ref: 'Flight',
  localField: '_id',
  foreignField: 'aircraft',
  count: true,
});

// Virtual for primary photo (first photo if available)
aircraftSchema.virtual('primaryPhoto').get(function() {
  return this.photos && this.photos.length > 0 ? this.photos[0] : null;
});

// Virtual for operator info (airline name when populated)
aircraftSchema.virtual('operatorInfo').get(function() {
  if (this.airline && typeof this.airline === 'object' && this.airline.name) {
    return `${this.airline.name} (${this.airline.iataCode})`;
  }
  return 'Unknown Operator';
});

// Static method to find or create aircraft
aircraftSchema.statics.findOrCreate = async function(aircraftData) {
  const { tailNumber } = aircraftData;
  
  let aircraft = await this.findOne({ tailNumber });
  
  if (!aircraft) {
    aircraft = await this.create(aircraftData);
  }
  
  return aircraft;
};

// Instance method to add photo
aircraftSchema.methods.addPhoto = function(photoData) {
  // Check if photo already exists (by flickrId)
  const existingPhoto = this.photos.find(photo => photo.flickrId === photoData.flickrId);
  
  if (!existingPhoto) {
    this.photos.push(photoData);
    this.photoLastUpdated = new Date();
  }
  
  return this;
};

// Instance method to get formatted aircraft info
aircraftSchema.methods.getFormattedInfo = function() {
  const manufacturer = this.manufacturer || '';
  const model = this.model || this.aircraftType;
  return `${manufacturer} ${model}`.trim();
};

// Instance method to check if photos need updating (older than 7 days)
aircraftSchema.methods.needsPhotoUpdate = function() {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return !this.photoLastUpdated || this.photoLastUpdated < weekAgo;
};

const Aircraft = mongoose.model('Aircraft', aircraftSchema);

module.exports = Aircraft; 