const express = require('express');
const router = express.Router();
const PriceHistory = require('../models/PriceHistory');
const Flight = require('../models/Flight');
const moment = require('moment');

// Get price history for a specific flight
router.get('/flight/:flightId', async (req, res) => {
  try {
    const { flightId } = req.params;
    const { startDate, endDate, limit = 100 } = req.query;

    const filter = { flightId };
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const prices = await PriceHistory.find(filter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('flightId', 'route airline flightDate');

    res.json({
      success: true,
      count: prices.length,
      data: prices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get price history by route
router.get('/route/:from-:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const { startDate, endDate, airline, limit = 100 } = req.query;

    // First find flights matching the route
    const flightFilter = {
      'route.from': from.toUpperCase(),
      'route.to': to.toUpperCase(),
      isActive: true
    };

    if (airline) flightFilter.airline = airline;
    if (startDate) flightFilter.flightDate = { $gte: new Date(startDate) };
    if (endDate) flightFilter.flightDate = { $lte: new Date(endDate) };

    const flights = await Flight.find(flightFilter).select('_id');
    const flightIds = flights.map(flight => flight._id);

    if (flightIds.length === 0) {
      return res.json({
        success: true,
        count: 0,
        data: [],
        message: 'No flights found for this route'
      });
    }

    // Get price history for these flights
    const priceFilter = { flightId: { $in: flightIds } };
    
    if (startDate || endDate) {
      priceFilter.timestamp = {};
      if (startDate) priceFilter.timestamp.$gte = new Date(startDate);
      if (endDate) priceFilter.timestamp.$lte = new Date(endDate);
    }

    const prices = await PriceHistory.find(priceFilter)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .populate('flightId', 'route airline flightDate departureTime arrivalTime');

    res.json({
      success: true,
      count: prices.length,
      data: prices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Add new price data
router.post('/', async (req, res) => {
  try {
    const {
      flightId,
      price,
      currency = 'USD',
      source = 'system',
      metadata = {}
    } = req.body;

    if (!flightId || !price) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: flightId, price'
      });
    }

    // Verify flight exists
    const flight = await Flight.findById(flightId);
    if (!flight) {
      return res.status(404).json({
        success: false,
        error: 'Flight not found'
      });
    }

    const priceHistory = new PriceHistory({
      flightId,
      price: parseFloat(price),
      currency,
      source,
      metadata
    });

    await priceHistory.save();
    res.status(201).json({ success: true, data: priceHistory });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get price statistics for a flight
router.get('/stats/:flightId', async (req, res) => {
  try {
    const { flightId } = req.params;
    const { startDate, endDate } = req.query;

    const filter = { flightId };
    
    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const prices = await PriceHistory.find(filter)
      .sort({ timestamp: 1 })
      .select('price timestamp');

    if (prices.length === 0) {
      return res.json({
        success: true,
        data: {
          count: 0,
          message: 'No price data found'
        }
      });
    }

    const priceValues = prices.map(p => p.price);
    const stats = {
      count: prices.length,
      min: Math.min(...priceValues),
      max: Math.max(...priceValues),
      avg: priceValues.reduce((a, b) => a + b, 0) / priceValues.length,
      latest: prices[prices.length - 1].price,
      first: prices[0].price,
      priceChange: prices[prices.length - 1].price - prices[0].price,
      priceChangePercent: ((prices[prices.length - 1].price - prices[0].price) / prices[0].price * 100).toFixed(2),
      data: prices
    };

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get latest prices for all active flights
router.get('/latest', async (req, res) => {
  try {
    const { route, airline } = req.query;

    const pipeline = [
      {
        $lookup: {
          from: 'flights',
          localField: 'flightId',
          foreignField: '_id',
          as: 'flight'
        }
      },
      { $unwind: '$flight' },
      { $match: { 'flight.isActive': true } }
    ];

    if (route) {
      const [from, to] = route.split('-');
      pipeline.push({
        $match: {
          'flight.route.from': from.toUpperCase(),
          'flight.route.to': to.toUpperCase()
        }
      });
    }

    if (airline) {
      pipeline.push({ $match: { 'flight.airline': airline } });
    }

    pipeline.push(
      { $sort: { timestamp: -1 } },
      { $group: { _id: '$flightId', latestPrice: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latestPrice' } },
      { $sort: { 'flight.flightDate': 1 } }
    );

    const latestPrices = await PriceHistory.aggregate(pipeline);

    res.json({
      success: true,
      count: latestPrices.length,
      data: latestPrices
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
