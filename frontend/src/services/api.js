import axios from 'axios'

const API_BASE_URL = 'http://localhost:3000/api'

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config) => {
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response.data
  },
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

// Health check
export const checkHealth = () => api.get('/health')

// Flights API
export const flightsAPI = {
  getAll: (params = {}) => api.get('/flights', { params }),
  getById: (id) => api.get(`/flights/${id}`),
  getByRoute: (from, to) => api.get(`/flights/route/${from}-${to}`),
  create: (data) => api.post('/flights', data),
  update: (id, data) => api.put(`/flights/${id}`, data),
  delete: (id) => api.delete(`/flights/${id}`),
}

// Prices API
export const pricesAPI = {
  getByFlight: (flightId, params = {}) => api.get(`/prices/flight/${flightId}`, { params }),
  getByRoute: (from, to, params = {}) => api.get(`/prices/route/${from}-${to}`, { params }),
  getStats: (flightId, params = {}) => api.get(`/prices/stats/${flightId}`, { params }),
  getLatest: (params = {}) => api.get('/prices/latest', { params }),
  create: (data) => api.post('/prices', data),
}

// Search API
export const searchAPI = {
  hybrid: (params = {}) => api.get('/search/hybrid', { params }),
  suggestions: (params = {}) => api.get('/search/suggestions', { params }),
  advanced: (data) => api.post('/search/advanced', data),
}

// Tracking API
export const trackingAPI = {
  getRules: () => api.get('/tracking/rules'),
  createRule: (data) => api.post('/tracking/rules', data),
  updateRule: (id, data) => api.put(`/tracking/rules/${id}`, data),
  deleteRule: (id) => api.delete(`/tracking/rules/${id}`),
  getStatus: (flightId) => api.get(`/tracking/status/${flightId}`),
  startTracking: (flightId) => api.post(`/tracking/start/${flightId}`),
  stopTracking: (flightId) => api.post(`/tracking/stop/${flightId}`),
  updatePrice: (flightId, data) => api.post(`/tracking/update-price/${flightId}`, data),
  getDashboard: (params = {}) => api.get('/tracking/dashboard', { params }),
}

export default api