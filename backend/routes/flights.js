const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');
const moment = require('moment');

// Get all flights with optional filtering
router.get('/', async (req, res) => {
  try {
    const { from, to, airline, date, active } = req.query;
    const filter = {};

    if (from) filter['route.from'] = from.toUpperCase();
    if (to) filter['route.to'] = to.toUpperCase();
    if (airline) filter.airline = airline;
    if (date) filter.flightDate = { $gte: new Date(date) };
    if (active !== undefined) filter.isActive = active === 'true';

    const flights = await Flight.find(filter)
      .sort({ flightDate: 1 })
      .limit(100);

    res.json({
      success: true,
      count: flights.length,
      data: flights
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get flight by ID
router.get('/:id', async (req, res) => {
  try {
    const flight = await Flight.findById(req.params.id);
    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found' });
    }
    res.json({ success: true, data: flight });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new flight
router.post('/', async (req, res) => {
  try {
    const {
      from,
      to,
      airline,
      flightDate,
      departureTime,
      arrivalTime,
      duration,
      aircraft,
      class: flightClass,
      trackingStartDate,
      trackingInterval
    } = req.body;

    // Validate required fields
    if (!from || !to || !airline || !flightDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: from, to, airline, flightDate'
      });
    }

    const flight = new Flight({
      route: { from: from.toUpperCase(), to: to.toUpperCase() },
      airline,
      flightDate: new Date(flightDate),
      departureTime: departureTime || '00:00',
      arrivalTime: arrivalTime || '00:00',
      duration: duration || '0h 0m',
      aircraft,
      class: flightClass || 'Economy',
      trackingStartDate: trackingStartDate ? new Date(trackingStartDate) : new Date(),
      trackingInterval: trackingInterval || '1day'
    });

    await flight.save();
    res.status(201).json({ success: true, data: flight });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update flight
router.put('/:id', async (req, res) => {
  try {
    const flight = await Flight.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found' });
    }

    res.json({ success: true, data: flight });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete flight
router.delete('/:id', async (req, res) => {
  try {
    const flight = await Flight.findByIdAndDelete(req.params.id);
    if (!flight) {
      return res.status(404).json({ success: false, error: 'Flight not found' });
    }
    res.json({ success: true, message: 'Flight deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get flights by route
router.get('/route/:from-:to', async (req, res) => {
  try {
    const { from, to } = req.params;
    const { date, airline } = req.query;
    
    const filter = {
      'route.from': from.toUpperCase(),
      'route.to': to.toUpperCase(),
      isActive: true
    };

    if (date) filter.flightDate = { $gte: new Date(date) };
    if (airline) filter.airline = airline;

    const flights = await Flight.find(filter)
      .sort({ flightDate: 1 });

    res.json({
      success: true,
      count: flights.length,
      data: flights
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
