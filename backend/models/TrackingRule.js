const mongoose = require('mongoose');

const trackingRuleSchema = new mongoose.Schema({
  route: {
    from: { type: String, required: true, uppercase: true },
    to: { type: String, required: true, uppercase: true }
  },
  airline: { type: String },
  trackingStartMonths: { type: Number, default: 6 }, // Start tracking 6 months before
  trackingInterval: { 
    type: String, 
    enum: ['15min', '1hour', '6hours', '1day', '1week'], 
    default: '1day' 
  },
  priceThreshold: {
    min: { type: Number },
    max: { type: Number }
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Index for efficient querying
trackingRuleSchema.index({ 'route.from': 1, 'route.to': 1 });
trackingRuleSchema.index({ airline: 1 });
trackingRuleSchema.index({ isActive: 1 });

module.exports = mongoose.model('TrackingRule', trackingRuleSchema);
