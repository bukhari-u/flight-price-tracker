const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');
const PriceHistory = require('../models/PriceHistory');
const TrackingRule = require('../models/TrackingRule');
const cron = require('node-cron');
const moment = require('moment');

// Get all tracking rules
router.get('/rules', async (req, res) => {
  try {
    const rules = await TrackingRule.find({ isActive: true })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: rules.length,
      data: rules
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new tracking rule
router.post('/rules', async (req, res) => {
  try {
    const {
      from,
      to,
      airline,
      trackingStartMonths = 6,
      trackingInterval = '1day',
      priceThreshold = {}
    } = req.body;

    if (!from || !to) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to'
      });
    }

    const rule = new TrackingRule({
      route: { from: from.toUpperCase(), to: to.toUpperCase() },
      airline,
      trackingStartMonths,
      trackingInterval,
      priceThreshold
    });

    await rule.save();
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update tracking rule
router.put('/rules/:id', async (req, res) => {
  try {
    const rule = await TrackingRule.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!rule) {
      return res.status(404).json({ success: false, error: 'Tracking rule not found' });
    }

    res.json({ success: true, data: rule });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete tracking rule
router.delete('/rules/:id', async (req, res) => {
  try {
    const rule = await TrackingRule.findByIdAndDelete(req.params.id);
    if (!rule) {
      return res.status(404).json({ success: false, error: 'Tracking rule not found' });
    }
    res.json({ success: true, message: 'Tracking rule deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get tracking status for a flight
router.get('/status/:flightId', async (req, res) => {
  try {
    const flight = await Flight.findById(req.params.flightId);
    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found' });
    }

    // Get latest price data
    const latestPrice = await PriceHistory.findOne({ flightId: flight._id })
      .sort({ timestamp: -1 });

    // Get price statistics
    const priceStats = await PriceHistory.aggregate([
      { $match: { flightId: flight._id } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          min: { $min: '$price' },
          max: { $max: '$price' },
          avg: { $avg: '$price' },
          latest: { $last: '$price' }
        }
      }
    ]);

    const stats = priceStats[0] || { count: 0 };

    // Calculate tracking status
    const now = new Date();
    const flightDate = new Date(flight.flightDate);
    const daysUntilFlight = Math.ceil((flightDate - now) / (1000 * 60 * 60 * 24));
    
    const trackingStatus = {
      isTracking: flight.isActive,
      daysUntilFlight,
      shouldStartTracking: daysUntilFlight <= (flight.trackingStartDate ? 
        Math.ceil((flightDate - new Date(flight.trackingStartDate)) / (1000 * 60 * 60 * 24)) : 
        180), // Default 6 months
      lastPriceUpdate: latestPrice?.timestamp,
      priceCount: stats.count,
      currentPrice: latestPrice?.price,
      priceRange: stats.count > 0 ? {
        min: stats.min,
        max: stats.max,
        avg: Math.round(stats.avg * 100) / 100
      } : null
    };

    res.json({
      success: true,
      data: {
        flight: {
          id: flight._id,
          route: flight.route,
          airline: flight.airline,
          flightDate: flight.flightDate,
          isActive: flight.isActive
        },
        tracking: trackingStatus
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start tracking for a flight
router.post('/start/:flightId', async (req, res) => {
  try {
    const flight = await Flight.findByIdAndUpdate(
      req.params.flightId,
      { 
        isActive: true,
        trackingStartDate: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found' });
    }

    res.json({
      success: true,
      message: 'Tracking started for flight',
      data: flight
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Stop tracking for a flight
router.post('/stop/:flightId', async (req, res) => {
  try {
    const flight = await Flight.findByIdAndUpdate(
      req.params.flightId,
      { 
        isActive: false,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found' });
    }

    res.json({
      success: true,
      message: 'Tracking stopped for flight',
      data: flight
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Manual price update for a flight
router.post('/update-price/:flightId', async (req, res) => {
  try {
    const { price, currency = 'USD', source = 'manual', metadata = {} } = req.body;

    if (!price) {
      return res.status(400).json({
        success: false,
        error: 'Price is required'
      });
    }

    const flight = await Flight.findById(req.params.flightId);
    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found' });
    }

    const priceHistory = new PriceHistory({
      flightId: flight._id,
      price: parseFloat(price),
      currency,
      source,
      metadata
    });

    await priceHistory.save();

    res.json({
      success: true,
      message: 'Price updated successfully',
      data: priceHistory
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get tracking dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = moment().subtract(parseInt(days), 'days').toDate();

    // Get tracking statistics
    const stats = await Promise.all([
      // Total active flights
      Flight.countDocuments({ isActive: true }),
      
      // Total price records in period
      PriceHistory.countDocuments({ timestamp: { $gte: startDate } }),
      
      // Flights with price data
      Flight.aggregate([
        { $match: { isActive: true } },
        {
          $lookup: {
            from: 'pricehistories',
            localField: '_id',
            foreignField: 'flightId',
            as: 'prices'
          }
        },
        { $match: { 'prices.0': { $exists: true } } },
        { $count: 'count' }
      ]),
      
      // Average price by route
      PriceHistory.aggregate([
        { $match: { timestamp: { $gte: startDate } } },
        {
          $lookup: {
            from: 'flights',
            localField: 'flightId',
            foreignField: '_id',
            as: 'flight'
          }
        },
        { $unwind: '$flight' },
        {
          $group: {
            _id: {
              from: '$flight.route.from',
              to: '$flight.route.to'
            },
            avgPrice: { $avg: '$price' },
            count: { $sum: 1 }
          }
        },
        { $sort: { avgPrice: 1 } },
        { $limit: 10 }
      ])
    ]);

    const [totalFlights, totalPrices, flightsWithPrices, routeStats] = stats;

    res.json({
      success: true,
      data: {
        overview: {
          totalActiveFlights: totalFlights,
          totalPriceRecords: totalPrices,
          flightsWithPriceData: flightsWithPrices[0]?.count || 0,
          period: `${days} days`
        },
        topRoutes: routeStats,
        lastUpdated: new Date()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
