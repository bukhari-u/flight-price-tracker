const mongoose = require('mongoose');

const flightSchema = new mongoose.Schema({
  route: {
    from: { type: String, required: true, uppercase: true },
    to: { type: String, required: true, uppercase: true }
  },
  airline: { type: String, required: true },
  flightDate: { type: Date, required: true },
  departureTime: { type: String, required: true },
  arrivalTime: { type: String, required: true },
  duration: { type: String, required: true },
  aircraft: { type: String },
  class: { type: String, enum: ['Economy', 'Business', 'First'], default: 'Economy' },
  isActive: { type: Boolean, default: true },
  trackingStartDate: { type: Date, required: true },
  trackingInterval: { 
    type: String, 
    enum: ['15min', '1hour', '6hours', '1day', '1week'], 
    default: '1day' 
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for efficient querying
flightSchema.index({ 'route.from': 1, 'route.to': 1 });
flightSchema.index({ flightDate: 1 });
flightSchema.index({ airline: 1 });
flightSchema.index({ isActive: 1 });

module.exports = mongoose.model('Flight', flightSchema);
