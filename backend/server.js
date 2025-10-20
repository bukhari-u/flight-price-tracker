const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const config = require('./config');

// Import routes
const flightRoutes = require('./routes/flights');
const priceRoutes = require('./routes/prices');
const searchRoutes = require('./routes/search');
const trackingRoutes = require('./routes/tracking');

// Import services
const priceTracker = require('./services/priceTracker');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
mongoose.connect(config.MONGODB_URI)
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Routes
app.use('/api/flights', flightRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/tracking', trackingRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: err.message 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  
  // Start price tracking service
  if (config.NODE_ENV === 'production') {
    priceTracker.start();
    console.log('Price tracking service started');
  }
});

module.exports = app;
