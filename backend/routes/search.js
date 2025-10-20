const express = require('express');
const router = express.Router();
const Flight = require('../models/Flight');
const PriceHistory = require('../models/PriceHistory');
const _ = require('lodash');

// Hybrid search with text and price filtering
router.get('/hybrid', async (req, res) => {
  try {
    const {
      query,
      from,
      to,
      airline,
      minPrice,
      maxPrice,
      startDate,
      endDate,
      sortBy = 'relevance',
      limit = 20,
      page = 1,
      alpha = 0.5 // weight for BM25 vs semantic cosine
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build base filter
    const baseFilter = { isActive: true };
    
    if (from && from.trim()) baseFilter['route.from'] = from.toUpperCase();
    if (to && to.trim()) baseFilter['route.to'] = to.toUpperCase();
    if (airline) baseFilter.airline = airline;
    // Build exact date range (UTC) if startDate/endDate provided
    if (startDate || endDate) {
      const dateRange = {};
      if (startDate) {
        const start = new Date(startDate);
        // Normalize to start of day UTC
        start.setUTCHours(0, 0, 0, 0);
        dateRange.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        // Normalize to end of day UTC
        end.setUTCHours(23, 59, 59, 999);
        dateRange.$lte = end;
      }
      baseFilter.flightDate = dateRange;
    }

    // Text search in multiple fields
    let textSearchFilter = {};
    if (query && query.trim()) {
      const searchRegex = new RegExp(query.trim(), 'i');
      textSearchFilter = {
        $or: [
          { airline: searchRegex },
          { 'route.from': searchRegex },
          { 'route.to': searchRegex },
          { aircraft: searchRegex },
          { class: searchRegex }
        ]
      };
    }

    // Combine filters
    const combinedFilter = { ...baseFilter, ...textSearchFilter };

    // Hybrid ranking requires all candidates first (we'll page after scoring)
    // Also join minimal price info (latest) to display
    const pipeline = [
      { $match: combinedFilter },
      {
        $lookup: {
          from: 'pricehistories',
          localField: '_id',
          foreignField: 'flightId',
          as: 'prices'
        }
      },
      {
        $addFields: {
          latestPrice: { $arrayElemAt: ['$prices.price', -1] },
          priceCount: { $size: '$prices' },
          avgPrice: { $avg: '$prices.price' },
          minPrice: { $min: '$prices.price' },
          maxPrice: { $max: '$prices.price' }
        }
      }
    ];

    // Apply price filters
    if (minPrice || maxPrice) {
      const priceFilter = {};
      if (minPrice) priceFilter.latestPrice = { $gte: parseFloat(minPrice) };
      if (maxPrice) {
        priceFilter.latestPrice = { 
          ...priceFilter.latestPrice, 
          $lte: parseFloat(maxPrice) 
        };
      }
      pipeline.push({ $match: priceFilter });
    }

    const candidates = await Flight.aggregate(pipeline);

    // Apply price range filter on fetched candidates (based on latestPrice)
    let filtered = candidates;
    if (minPrice || maxPrice) {
      const minP = minPrice ? parseFloat(minPrice) : -Infinity;
      const maxP = maxPrice ? parseFloat(maxPrice) : Infinity;
      filtered = filtered.filter(d => (d.latestPrice ?? Infinity) >= minP && (d.latestPrice ?? -Infinity) <= maxP);
    }

    // Hybrid ranking (BM25 + cosine on simple TF-IDF) in-memory
    const alphaNum = Math.max(0, Math.min(1, Number(alpha))); // clamp to [0,1]

    // Build corpus texts
    const textOf = (d) => [
      d.airline || '',
      d.route?.from || '',
      d.route?.to || '',
      d.aircraft || '',
      d.class || ''
    ].join(' ').toLowerCase();

    const docs = filtered.map(textOf);
    const q = (query || [from, to, airline].filter(Boolean).join(' ')).toLowerCase();

    // Tokenization
    const tokenize = (s) => (s || '').replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
    const docTokens = docs.map(tokenize);
    const qTokens = tokenize(q);

    // Vocabulary & DF
    const vocab = new Map();
    const df = new Map();
    docTokens.forEach(tokens => {
      const seen = new Set();
      tokens.forEach(t => {
        if (!vocab.has(t)) vocab.set(t, vocab.size);
        if (!seen.has(t)) { seen.add(t); df.set(t, (df.get(t) || 0) + 1); }
      });
    });
    qTokens.forEach(t => { if (!vocab.has(t)) vocab.set(t, vocab.size); });

    const N = docTokens.length || 1;
    const avgdl = docTokens.reduce((s, t) => s + t.length, 0) / N;
    const idf = (t) => Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
    const k1 = 1.5, b = 0.75;

    // BM25 per doc
    const bm25 = docTokens.map(tokens => {
      const tf = new Map();
      tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
      const dl = tokens.length || 1;
      let score = 0;
      qTokens.forEach(t => {
        const f = tf.get(t) || 0;
        if (!f) return;
        const _idf = idf(t);
        score += _idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (dl / avgdl))));
      });
      return score;
    });

    // TF-IDF vectors and cosine similarity
    const terms = Array.from(new Set([...qTokens, ...Array.from(vocab.keys())]));
    const idfTf = new Map(terms.map(t => [t, Math.log((N + 1) / ((df.get(t) || 0) + 1)) + 1]));
    const vec = (tokens) => {
      const tf = new Map();
      tokens.forEach(t => tf.set(t, (tf.get(t) || 0) + 1));
      return terms.map(t => (tf.get(t) || 0) * (idfTf.get(t) || 0));
    };
    const dot = (a,b)=>a.reduce((s,v,i)=>s+v*(b[i]||0),0);
    const norm = (a)=>Math.sqrt(dot(a,a))||1e-12;
    const qv = vec(qTokens);
    const cos = docTokens.map(toks => {
      const dv = vec(toks);
      return dot(qv, dv) / (norm(qv) * norm(dv));
    });

    // Normalize scores
    const normalize = (arr) => {
      if (!arr.length) return arr;
      const mn = Math.min(...arr);
      const mx = Math.max(...arr);
      if (mx - mn < 1e-12) return arr.map(() => 0);
      return arr.map(x => (x - mn) / (mx - mn));
    };

    const bm25N = normalize(bm25);
    const cosN = normalize(cos);
    const hybrid = bm25N.map((b,i)=> alphaNum*b + (1-alphaNum)*cosN[i]);

    // Compose results with scores and sort
    const withScores = filtered.map((d,i)=> ({
      ...d,
      _scores: {
        bm25: bm25N[i],
        cosine: cosN[i],
        hybrid: hybrid[i],
        alpha: alphaNum
      }
    }));

    // Sorting strategy
    let sorted = withScores;
    switch (sortBy) {
      case 'price_asc':
        sorted = withScores.sort((a,b)=>(a.latestPrice??Infinity)-(b.latestPrice??Infinity));
        break;
      case 'price_desc':
        sorted = withScores.sort((a,b)=>(b.latestPrice??-Infinity)-(a.latestPrice??-Infinity));
        break;
      case 'date_asc':
        sorted = withScores.sort((a,b)=>new Date(a.flightDate)-new Date(b.flightDate));
        break;
      case 'date_desc':
        sorted = withScores.sort((a,b)=>new Date(b.flightDate)-new Date(a.flightDate));
        break;
      case 'relevance':
      default:
        sorted = withScores.sort((a,b)=>b._scores.hybrid - a._scores.hybrid);
        break;
    }

    const total = sorted.length;
    const totalPages = Math.ceil(total / parseInt(limit));
    const pageNum = parseInt(page);
    const paged = sorted.slice((pageNum-1)*parseInt(limit), (pageNum)*parseInt(limit));

    res.json({
      success: true,
      data: paged,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalResults: total,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1
      },
      filters: { query, from, to, airline, minPrice, maxPrice, startDate, endDate, sortBy, alpha: alphaNum }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Advanced search with multiple criteria
router.get('/advanced', async (req, res) => {
  try {
    const {
      routes, // Array of route objects: [{from: 'LHE', to: 'BKK'}, ...]
      airlines,
      priceRange,
      dateRange,
      class: flightClass,
      sortBy = 'relevance',
      limit = 20
    } = req.body;

    let matchStage = { isActive: true };

    // Route filtering
    if (routes && routes.length > 0) {
      const routeConditions = routes.map(route => ({
        'route.from': route.from.toUpperCase(),
        'route.to': route.to.toUpperCase()
      }));
      matchStage.$or = routeConditions;
    }

    // Airline filtering
    if (airlines && airlines.length > 0) {
      matchStage.airline = { $in: airlines };
    }

    // Class filtering
    if (flightClass) {
      matchStage.class = flightClass;
    }

    // Date range filtering
    if (dateRange) {
      matchStage.flightDate = {};
      if (dateRange.start) matchStage.flightDate.$gte = new Date(dateRange.start);
      if (dateRange.end) matchStage.flightDate.$lte = new Date(dateRange.end);
    }

    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'pricehistories',
          localField: '_id',
          foreignField: 'flightId',
          as: 'prices'
        }
      },
      {
        $addFields: {
          latestPrice: { $arrayElemAt: ['$prices.price', -1] },
          priceCount: { $size: '$prices' },
          avgPrice: { $avg: '$prices.price' },
          minPrice: { $min: '$prices.price' },
          maxPrice: { $max: '$prices.price' },
          priceVariance: {
            $divide: [
              { $stdDevPop: '$prices.price' },
              { $avg: '$prices.price' }
            ]
          }
        }
      }
    ];

    // Price range filtering
    if (priceRange) {
      const priceFilter = {};
      if (priceRange.min) priceFilter.latestPrice = { $gte: priceRange.min };
      if (priceRange.max) {
        priceFilter.latestPrice = { 
          ...priceFilter.latestPrice, 
          $lte: priceRange.max 
        };
      }
      pipeline.push({ $match: priceFilter });
    }

    // Calculate advanced relevance score
    pipeline.push({
      $addFields: {
        relevanceScore: {
          $add: [
            // Base score for having price data
            { $cond: [{ $gt: ['$priceCount', 0] }, 5, 0] },
            
            // Price stability score (lower variance = higher score)
            {
              $cond: [
                { $lt: ['$priceVariance', 0.1] },
                3,
                { $cond: [{ $lt: ['$priceVariance', 0.2] }, 2, 1] }
              ]
            },
            
            // Recent data score
            {
              $cond: [
                { $gte: ['$flightDate', new Date()] },
                2, 0
              ]
            },
            
            // Price competitiveness (lower price = higher score, but normalized)
            {
              $multiply: [
                { $subtract: [1000, '$latestPrice'] },
                0.001
              ]
            }
          ]
        }
      }
    });

    // Apply sorting
    let sortStage = {};
    switch (sortBy) {
      case 'price_asc':
        sortStage = { latestPrice: 1 };
        break;
      case 'price_desc':
        sortStage = { latestPrice: -1 };
        break;
      case 'date_asc':
        sortStage = { flightDate: 1 };
        break;
      case 'date_desc':
        sortStage = { flightDate: -1 };
        break;
      case 'relevance':
      default:
        sortStage = { relevanceScore: -1, latestPrice: 1 };
        break;
    }

    pipeline.push({ $sort: sortStage });
    pipeline.push({ $limit: parseInt(limit) });

    const results = await Flight.aggregate(pipeline);

    res.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search suggestions/autocomplete
router.get('/suggestions', async (req, res) => {
  try {
    const { q, type = 'all' } = req.query;
    
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const suggestions = [];
    const searchRegex = new RegExp(q, 'i');

    if (type === 'all' || type === 'routes') {
      // Get unique route combinations
      const routes = await Flight.aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: {
              from: '$route.from',
              to: '$route.to'
            }
          }
        },
        {
          $match: {
            $or: [
              { '_id.from': searchRegex },
              { '_id.to': searchRegex }
            ]
          }
        },
        { $limit: 10 }
      ]);

      suggestions.push(...routes.map(route => ({
        type: 'route',
        value: `${route._id.from}-${route._id.to}`,
        label: `${route._id.from} → ${route._id.to}`
      })));
    }

    if (type === 'all' || type === 'airlines') {
      // Get unique airlines
      const airlines = await Flight.aggregate([
        { $match: { isActive: true, airline: searchRegex } },
        { $group: { _id: '$airline' } },
        { $limit: 10 }
      ]);

      suggestions.push(...airlines.map(airline => ({
        type: 'airline',
        value: airline._id,
        label: airline._id
      })));
    }

    res.json({
      success: true,
      data: suggestions.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
