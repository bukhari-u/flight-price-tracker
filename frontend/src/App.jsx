import React, { useState, useEffect } from 'react'
import { 
  Plane, 
  Search, 
  Calendar, 
  DollarSign, 
  TrendingUp,
  Clock,
  MapPin
} from 'lucide-react'
import { flightsAPI, pricesAPI, searchAPI } from './services/api'
import { format, parseISO } from 'date-fns'

function App() {
  const [flights, setFlights] = useState([])
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [priceHistory, setPriceHistory] = useState([])
  const [loadingFlights, setLoadingFlights] = useState(false)
  const [loadingSearch, setLoadingSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])

  useEffect(() => {
    fetchFlights()
  }, [])

  const fetchFlights = async () => {
    try {
      setLoadingFlights(true)
      const response = await flightsAPI.getAll()
      setFlights(response.data)
    } catch (error) {
      console.error('Error fetching flights:', error)
    } finally {
      setLoadingFlights(false)
    }
  }

  const handleSearch = async () => {
    const raw = searchQuery.trim()
    if (!raw) return

    try {
      setLoadingSearch(true)
      
      // Parse route patterns like "LHE → BKK", "LHE-BKK", "LHE BKK", "LHE->BKK"
      const normalized = raw
        .replace(/\s*→\s*|\s*->\s*|\s*–\s*|\s*—\s*/g, '-')
        .replace(/\s+/g, '-')
        .toUpperCase()

      const routeMatch = normalized.match(/^([A-Z]{3})-([A-Z]{3})$/)

      if (routeMatch) {
        // Route search: LHE-BKK format
        const from = routeMatch[1]
        const to = routeMatch[2]
        const response = await searchAPI.hybrid({ from, to, sortBy: 'relevance' })
        setSearchResults(response.data || [])
      } else if (raw.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Date search: YYYY-MM-DD format
        const response = await searchAPI.hybrid({ startDate: raw, endDate: raw, sortBy: 'relevance' })
        setSearchResults(response.data || [])
      } else {
        // Airline name search
        const response = await searchAPI.hybrid({ query: raw, sortBy: 'relevance' })
        setSearchResults(response.data || [])
      }
    } catch (error) {
      console.error('Error searching:', error)
      setSearchResults([])
    } finally {
      setLoadingSearch(false)
    }
  }

  const handleFlightSelect = async (flight) => {
    setSelectedFlight(flight)
    try {
      const response = await pricesAPI.getByFlight(flight._id)
      setPriceHistory(response.data)
    } catch (error) {
      console.error('Error fetching price history:', error)
    }
  }


  const formatPrice = (price) => `$${price}`
  const formatDate = (date) => format(parseISO(date), 'MMM dd')
  const formatTime = (date) => format(parseISO(date), 'HH:mm')

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-lg border-b-4 border-blue-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="p-3 bg-blue-600 rounded-xl mr-4">
                <Plane className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Flight Price Tracker</h1>
                <p className="text-gray-600">Track flight prices over time with automated monitoring</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Search Section */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Search className="h-6 w-6 mr-3 text-blue-600" />
            Search Flights
          </h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by route (LHE→BKK), date (2026-01-15), or airline name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-6 py-4 text-lg border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
          <button
            onClick={handleSearch}
            disabled={loadingSearch}
              className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center text-lg font-medium transition-all"
            >
              <Search className="h-5 w-5 mr-2" />
            {loadingSearch ? 'Searching...' : 'Search'}
            </button>
          </div>
          <div className="mt-4 text-sm text-gray-600">
            <p className="mb-2">Search examples:</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">LHE→BKK</span>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">SIN-BKK</span>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">2026-01-15</span>
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">Pakistan International Airlines</span>
            </div>
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">Search Results ({searchResults.length})</h3>
              <button
                onClick={() => setSearchResults([])}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Clear Results
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {searchResults.map((flight) => (
                <div
                  key={flight._id}
                  onClick={() => handleFlightSelect(flight)}
                  className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all bg-gradient-to-r from-blue-50 to-indigo-50"
                >
                  <div className="flex items-center mb-4">
                    <MapPin className="h-5 w-5 text-blue-600 mr-3" />
                    <span className="text-xl font-bold text-gray-900">{flight.route.from} → {flight.route.to}</span>
                  </div>
                  <p className="text-gray-700 font-medium mb-2">{flight.airline}</p>
                  <div className="flex items-center text-gray-600 mb-2">
                    <Calendar className="h-4 w-4 mr-2" />
                    {format(parseISO(flight.flightDate), 'MMM dd, yyyy')}
                  </div>
                  <div className="flex items-center text-gray-600 mb-3">
                    <Clock className="h-4 w-4 mr-2" />
                    {flight.departureTime} - {flight.arrivalTime}
                  </div>
                  {flight.latestPrice && (
                    <div className="bg-green-100 rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-green-800 font-medium">Current Price:</span>
                        <span className="text-2xl font-bold text-green-600">{formatPrice(flight.latestPrice)}</span>
                      </div>
                      <div className="text-sm text-green-700 mt-1">
                        {flight.priceCount} price records available
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : searchQuery && !loadingSearch ? (
          <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-200">
            <div className="text-center py-8">
              <Search className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No flights found</h3>
              <p className="text-gray-600">Try searching with a different route, date, or airline name.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-4 text-blue-600 hover:text-blue-700 text-sm"
              >
                Clear search
              </button>
            </div>
          </div>
        ) : null}

        {/* Available Flights */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8 border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <Plane className="h-6 w-6 mr-3 text-blue-600" />
            Tracked Flights ({flights.length})
          </h2>
          {loadingFlights ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 text-lg">Loading flights...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {flights.map((flight) => (
                <div
                  key={flight._id}
                  onClick={() => handleFlightSelect(flight)}
                  className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:shadow-lg cursor-pointer transition-all bg-gradient-to-r from-gray-50 to-blue-50"
                >
                  <div className="flex items-center mb-4">
                    <MapPin className="h-5 w-5 text-blue-600 mr-3" />
                    <span className="text-xl font-bold text-gray-900">{flight.route.from} → {flight.route.to}</span>
                  </div>
                  <p className="text-gray-700 font-medium mb-2">{flight.airline}</p>
                  <div className="flex items-center text-gray-600 mb-2">
                    <Calendar className="h-4 w-4 mr-2" />
                    {format(parseISO(flight.flightDate), 'MMM dd, yyyy')}
                  </div>
                  <div className="flex items-center text-gray-600 mb-3">
                    <Clock className="h-4 w-4 mr-2" />
                    {flight.departureTime} - {flight.arrivalTime}
                  </div>
                  <div className="text-sm text-gray-500">
                    {flight.aircraft} • {flight.class}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Price History - Time Series Display */}
        {selectedFlight && (
          <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <TrendingUp className="h-6 w-6 mr-3 text-green-600" />
              Price History: {selectedFlight.route.from} → {selectedFlight.route.to}
            </h2>
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-lg font-medium text-gray-800">
                {selectedFlight.airline} • {format(parseISO(selectedFlight.flightDate), 'MMMM dd, yyyy')}
              </p>
              <p className="text-gray-600">
                Flight: {selectedFlight.departureTime} - {selectedFlight.arrivalTime} ({selectedFlight.duration})
              </p>
            </div>
            
            {priceHistory.length > 0 ? (
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Time-Series Price Data</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {priceHistory.slice(0, 16).map((price, index) => (
                      <div key={price._id} className="p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 hover:shadow-md transition-all">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center">
                            <DollarSign className="h-5 w-5 text-green-600 mr-2" />
                            <span className="text-2xl font-bold text-gray-900">{formatPrice(price.price)}</span>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          <div className="font-medium">{formatDate(price.timestamp)}</div>
                          <div className="text-gray-500">{formatTime(price.timestamp)}</div>
                        </div>
                        {price.metadata?.seatAvailability && (
                          <div className="text-xs text-gray-500 mt-2">
                            {price.metadata.seatAvailability}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {priceHistory.length > 16 && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg text-center">
                      <p className="text-gray-600">
                        Showing latest 16 prices of <span className="font-bold">{priceHistory.length}</span> total records
                      </p>
                    </div>
                  )}
                </div>

                {/* Price Statistics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  <div className="p-4 bg-green-100 rounded-lg text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {formatPrice(Math.min(...priceHistory.map(p => p.price)))}
                    </div>
                    <div className="text-sm text-green-700">Lowest Price</div>
                  </div>
                  <div className="p-4 bg-red-100 rounded-lg text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {formatPrice(Math.max(...priceHistory.map(p => p.price)))}
                    </div>
                    <div className="text-sm text-red-700">Highest Price</div>
                  </div>
                  <div className="p-4 bg-blue-100 rounded-lg text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {formatPrice(Math.round(priceHistory.reduce((sum, p) => sum + p.price, 0) / priceHistory.length))}
                    </div>
                    <div className="text-sm text-blue-700">Average Price</div>
                  </div>
                  <div className="p-4 bg-purple-100 rounded-lg text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {formatPrice(priceHistory[priceHistory.length - 1]?.price || 0)}
                    </div>
                    <div className="text-sm text-purple-700">Latest Price</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <TrendingUp className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-xl font-medium text-gray-900 mb-2">No Price History Available</h3>
                <p className="text-gray-600">This flight doesn't have any price tracking data yet.</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default App