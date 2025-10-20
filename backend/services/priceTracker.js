const Flight = require('../models/Flight');
const PriceHistory = require('../models/PriceHistory');
const TrackingRule = require('../models/TrackingRule');
const moment = require('moment');

class PriceTracker {
  constructor() {
    this.isRunning = false;
    this.jobs = new Map();
  }

  // Start automated price tracking
  start() {
    if (this.isRunning) {
      console.log('Price tracker is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting automated price tracking...');

    // Schedule different tracking intervals
    this.scheduleTracking('15min', '*/15 * * * *');
    this.scheduleTracking('1hour', '0 * * * *');
    this.scheduleTracking('6hours', '0 */6 * * *');
    this.scheduleTracking('1day', '0 9 * * *');
    this.scheduleTracking('1week', '0 9 * * 1');

    console.log('Price tracking scheduled successfully');
  }

  // Stop automated price tracking
  stop() {
    if (!this.isRunning) {
      console.log('Price tracker is not running');
      return;
    }

    this.isRunning = false;
    this.jobs.forEach((job, interval) => {
      job.destroy();
      console.log(`Stopped ${interval} tracking job`);
    });
    this.jobs.clear();
    console.log('Price tracking stopped');
  }

  // Schedule tracking for specific interval
  scheduleTracking(interval, cronExpression) {
    const cron = require('node-cron');
    
    const job = cron.schedule(cronExpression, async () => {
      try {
        console.log(`Running ${interval} price tracking...`);
        await this.updatePricesForInterval(interval);
        console.log(`Completed ${interval} price tracking`);
      } catch (error) {
        console.error(`Error in ${interval} price tracking:`, error);
      }
    }, {
      scheduled: false
    });

    this.jobs.set(interval, job);
    job.start();
  }

  // Update prices for flights with specific tracking interval
  async updatePricesForInterval(interval) {
    try {
      const flights = await Flight.find({
        isActive: true,
        trackingInterval: interval,
        flightDate: { $gte: new Date() } // Only future flights
      });

      console.log(`Found ${flights.length} flights for ${interval} tracking`);

      for (const flight of flights) {
        await this.updateFlightPrice(flight);
      }
    } catch (error) {
      console.error(`Error updating prices for ${interval}:`, error);
    }
  }

  // Update price for a specific flight
  async updateFlightPrice(flight) {
    try {
      // Simulate price fetching (in real implementation, this would call airline APIs)
      const newPrice = await this.fetchFlightPrice(flight);
      
      if (newPrice) {
        const priceHistory = new PriceHistory({
          flightId: flight._id,
          price: newPrice.price,
          currency: newPrice.currency || 'USD',
          source: 'automated',
          metadata: {
            bookingClass: flight.class,
            seatAvailability: newPrice.seatAvailability || 'Available',
            bookingUrl: newPrice.bookingUrl,
            rawData: newPrice.rawData
          }
        });

        await priceHistory.save();
        console.log(`Updated price for ${flight.route.from}-${flight.route.to}: $${newPrice.price}`);
      }
    } catch (error) {
      console.error(`Error updating price for flight ${flight._id}:`, error);
    }
  }

  // Simulate price fetching (replace with real API calls)
  async fetchFlightPrice(flight) {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));

    // Get the latest price to calculate new price
    const latestPrice = await PriceHistory.findOne({ flightId: flight._id })
      .sort({ timestamp: -1 });

    const basePrice = latestPrice ? latestPrice.price : this.getBasePriceForRoute(flight);
    
    // Simulate price volatility
    const volatility = (Math.random() - 0.5) * 0.15; // ±7.5% volatility
    const trend = this.getTrendForFlight(flight);
    const newPrice = Math.round(basePrice * (1 + volatility + trend));

    return {
      price: newPrice,
      currency: 'USD',
      seatAvailability: Math.random() > 0.2 ? 'Available' : 'Limited',
      bookingUrl: `https://example.com/book/${flight._id}`,
      rawData: {
        timestamp: new Date(),
        source: 'simulated_api',
        confidence: Math.random() * 0.3 + 0.7 // 70-100% confidence
      }
    };
  }

  // Get base price for a route (simulated)
  getBasePriceForRoute(flight) {
    const routePrices = {
      'LHE-BKK': 650,
      'SIN-BKK': 180,
      'JED-LHE': 450,
      'DXB-LHR': 850,
      'KHI-DXB': 280,
      'ISB-KUL': 520,
      'BKK-NRT': 420,
      'LHE-JED': 380,
      'SIN-SYD': 750,
      'DXB-CDG': 680
    };

    const routeKey = `${flight.route.from}-${flight.route.to}`;
    return routePrices[routeKey] || 500; // Default price
  }

  // Get trend for a flight (simulated)
  getTrendForFlight(flight) {
    const daysUntilFlight = moment(flight.flightDate).diff(moment(), 'days');
    
    // Prices generally increase as flight date approaches
    if (daysUntilFlight < 30) return 0.1; // 10% increase for flights within 30 days
    if (daysUntilFlight < 90) return 0.05; // 5% increase for flights within 90 days
    return 0; // No trend for flights more than 90 days away
  }

  // Manual price update for a specific flight
  async manualUpdate(flightId, priceData) {
    try {
      const flight = await Flight.findById(flightId);
      if (!flight) {
        throw new Error('Flight not found');
      }

      const priceHistory = new PriceHistory({
        flightId,
        price: priceData.price,
        currency: priceData.currency || 'USD',
        source: 'manual',
        metadata: priceData.metadata || {}
      });

      await priceHistory.save();
      console.log(`Manual price update for flight ${flightId}: $${priceData.price}`);
      
      return priceHistory;
    } catch (error) {
      console.error(`Error in manual price update:`, error);
      throw error;
    }
  }

  // Get tracking statistics
  async getTrackingStats() {
    try {
      const stats = await Promise.all([
        Flight.countDocuments({ isActive: true }),
        PriceHistory.countDocuments({ timestamp: { $gte: moment().subtract(24, 'hours').toDate() } }),
        PriceHistory.aggregate([
          { $match: { timestamp: { $gte: moment().subtract(7, 'days').toDate() } } },
          { $group: { _id: null, avgPrice: { $avg: '$price' }, count: { $sum: 1 } } }
        ])
      ]);

      return {
        activeFlights: stats[0],
        recentUpdates: stats[1],
        weeklyAverage: stats[2][0]?.avgPrice || 0,
        weeklyCount: stats[2][0]?.count || 0
      };
    } catch (error) {
      console.error('Error getting tracking stats:', error);
      throw error;
    }
  }

  // Check if tracking should start for a flight
  async checkAndStartTracking() {
    try {
      const now = new Date();
      const sixMonthsFromNow = moment().add(6, 'months').toDate();

      const flightsToStart = await Flight.find({
        isActive: false,
        flightDate: { $gte: now, $lte: sixMonthsFromNow },
        trackingStartDate: { $lte: now }
      });

      for (const flight of flightsToStart) {
        await Flight.findByIdAndUpdate(flight._id, { isActive: true });
        console.log(`Started tracking for flight ${flight.route.from}-${flight.route.to}`);
      }

      return flightsToStart.length;
    } catch (error) {
      console.error('Error checking tracking start:', error);
      throw error;
    }
  }
}

module.exports = new PriceTracker();
