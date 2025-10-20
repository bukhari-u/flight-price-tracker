const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema({
  flightId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flight', required: true },
  price: { type: Number, required: true },
  currency: { type: String, default: 'USD' },
  timestamp: { type: Date, default: Date.now },
  source: { type: String, default: 'system' }, // system, api, manual
  metadata: {
    bookingClass: { type: String },
    seatAvailability: { type: String },
    bookingUrl: { type: String },
    rawData: { type: mongoose.Schema.Types.Mixed }
  }
});

// Index for efficient querying
priceHistorySchema.index({ flightId: 1, timestamp: -1 });
priceHistorySchema.index({ timestamp: -1 });
priceHistorySchema.index({ price: 1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
