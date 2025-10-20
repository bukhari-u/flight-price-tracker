const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const Flight = require('../models/Flight');
const PriceHistory = require('../models/PriceHistory');
const TrackingRule = require('../models/TrackingRule');
const moment = require('moment');

// Load flights from JSON dataset and normalize trackingStartDate to 6 months before flightDate
function loadFlightsFromJson() {
  const jsonPath = path.join(__dirname, '..', 'data', 'sample_flights.json');
  const raw = fs.readFileSync(jsonPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const flights = parsed.flights || [];
  return flights.map(f => {
    const flightDate = new Date(f.flightDate);
    const trackingStart = new Date(flightDate);
    trackingStart.setMonth(trackingStart.getMonth() - 6);
    return {
      route: f.route,
      airline: f.airline,
      flightDate,
      departureTime: f.departureTime,
      arrivalTime: f.arrivalTime,
      duration: f.duration,
      aircraft: f.aircraft,
      class: f.class || 'Economy',
      isActive: true,
      trackingStartDate: trackingStart,
      trackingInterval: f.trackingInterval || '1day'
    };
  });
}

// Load price history from CSV dataset only (no synthetic generation)
function loadPricesFromCsv() {
  const csvPath = path.join(__dirname, '..', 'data', 'flight_prices.csv');
  if (!fs.existsSync(csvPath)) return [];
  const content = fs.readFileSync(csvPath, 'utf-8').trim();
  const lines = content.split(/\r?\n/);
  const header = lines.shift().split(',').map(h => h.trim());
  const rows = lines.map(line => {
    // naive CSV split (safe for our simple dataset)
    const cols = line.split(',');
    const rec = {};
    header.forEach((h, i) => {
      rec[h] = (cols[i] || '').trim();
    });
    return rec;
  });
  return rows;
}

// Sample tracking rules
const sampleTrackingRules = [
  {
    route: { from: 'LHE', to: 'BKK' },
    airline: 'Pakistan International Airlines',
    trackingStartMonths: 6,
    trackingInterval: '1day',
    priceThreshold: { min: 400, max: 800 }
  },
  {
    route: { from: 'SIN', to: 'BKK' },
    airline: 'Singapore Airlines',
    trackingStartMonths: 3,
    trackingInterval: '1day',
    priceThreshold: { min: 200, max: 500 }
  },
  {
    route: { from: 'DXB', to: 'LHR' },
    airline: 'Emirates',
    trackingStartMonths: 6,
    trackingInterval: '1day',
    priceThreshold: { min: 600, max: 1200 }
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing data
    await Flight.deleteMany({});
    await PriceHistory.deleteMany({});
    await TrackingRule.deleteMany({});
    console.log('Cleared existing data');

    // Insert flights from JSON dataset
    const flightsPayload = loadFlightsFromJson();
    const flights = await Flight.insertMany(flightsPayload);
    console.log(`Inserted ${flights.length} flights from JSON`);

    // Build quick lookup for flight by route+date
    const routeDateToFlight = new Map();
    flights.forEach(f => {
      const key = `${f.route.from}-${f.route.to}-${new Date(f.flightDate).toISOString().slice(0,10)}`;
      routeDateToFlight.set(key, {
        id: f._id.toString(),
        flightDate: new Date(f.flightDate),
        trackingStartDate: new Date(f.trackingStartDate)
      });
    });

    // Insert price history from CSV only
    const csvRows = loadPricesFromCsv();
    const priceDocs = [];
    for (const row of csvRows) {
      // route in CSV is like LHE-BKK
      const route = (row.route || '').toUpperCase();
      const [from, to] = route.split('-');
      const flightDateIso = (row.flight_date || '').trim();
      const key = `${from}-${to}-${flightDateIso}`;
      const flightMeta = routeDateToFlight.get(key);
      if (!flightMeta) continue; // skip rows not matching inserted flights

      const ts = new Date(row.date_tracked);
      // Enforce 6-month tracking window: only accept records between trackingStartDate and flightDate
      if (isNaN(ts.getTime())) continue;
      if (ts < flightMeta.trackingStartDate || ts > flightMeta.flightDate) continue;

      priceDocs.push({
        flightId: flightMeta.id,
        price: Number(row.price),
        currency: row.currency || 'USD',
        timestamp: ts,
        source: row.source || 'csv',
        metadata: {
          bookingClass: 'Economy'
        }
      });
    }

    if (priceDocs.length) {
      await PriceHistory.insertMany(priceDocs);
    }
    console.log(`Inserted ${priceDocs.length} price records from CSV`);

    // Optional: create minimal tracking rules based on distinct routes from flights JSON
    const distinctRoutes = Array.from(new Set(flights.map(f => `${f.route.from}-${f.route.to}`)));
    const rules = distinctRoutes.slice(0, 3).map(r => {
      const [from, to] = r.split('-');
      return {
        route: { from, to },
        trackingStartMonths: 6,
        trackingInterval: '1day',
        isActive: true
      };
    });
    if (rules.length) {
      await TrackingRule.insertMany(rules);
    }
    console.log(`Inserted ${rules.length} tracking rules`);

    console.log('Database seeding completed successfully!');
    
    // Display summary
    const totalFlights = await Flight.countDocuments();
    const totalPrices = await PriceHistory.countDocuments();
    const totalRules = await TrackingRule.countDocuments();
    
    console.log('\n=== SEEDING SUMMARY ===');
    console.log(`Total Flights: ${totalFlights}`);
    console.log(`Total Price Records: ${totalPrices}`);
    console.log(`Total Tracking Rules: ${totalRules}`);
    
    console.log('\n=== SAMPLE ROUTES ===');
    const routes = await Flight.aggregate([
      { $group: { _id: { from: '$route.from', to: '$route.to' } } },
      { $sort: { '_id.from': 1 } }
    ]);
    
    routes.forEach(route => {
      console.log(`${route._id.from} → ${route._id.to}`);
    });

  } catch (error) {
    console.error('Error seeding database:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = { seedDatabase };
