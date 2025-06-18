// components/LocationInput.tsx
'use client';

import { useState, useEffect } from 'react';

interface Props {
  onLocationChange: (location: { 
    address?: string; 
    city: string; 
    state: string; 
    zip?: string;
    lat?: number;
    lng?: number;
  }) => void;
}

export default function LocationInput({ onLocationChange }: Props) {
  const [zip, setZip] = useState('77001'); // Default Houston zip
  const [city, setCity] = useState('Houston');
  const [state, setState] = useState('TX');
  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [loading, setLoading] = useState(false);

  // Auto-detect location on mount
  useEffect(() => {
    // Check if we have stored location
    const stored = localStorage.getItem('userLocation');
    if (stored) {
      const location = JSON.parse(stored);
      setZip(location.zip || '77001');
      setCity(location.city || 'Houston');
      setState(location.state || 'TX');
      onLocationChange(location);
    }
  }, []);

  const getCurrentLocation = () => {
    setLoading(true);
    
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            // Reverse geocode to get address
            const response = await fetch(
              `https://nominatim.openstreetmap.org/reverse?` +
              `lat=${position.coords.latitude}&lon=${position.coords.longitude}&format=json`
            );
            const data = await response.json();
            
            const location = {
              city: data.address.city || data.address.town || data.address.village || 'Houston',
              state: data.address.state || 'TX',
              zip: data.address.postcode || '77001',
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              address: data.display_name
            };
            
            setCity(location.city);
            setState(location.state);
            setZip(location.zip);
            
            // Save to localStorage
            localStorage.setItem('userLocation', JSON.stringify(location));
            onLocationChange(location);
            
          } catch (error) {
            console.error('Geocoding error:', error);
          } finally {
            setLoading(false);
          }
        },
        (error) => {
          console.error('Location error:', error);
          setLoading(false);
        }
      );
    }
  };

  const handleZipChange = (newZip: string) => {
    setZip(newZip);
    
    // Auto-lookup city/state from zip (simple mapping, could use API)
    if (newZip.length === 5) {
      // Houston area zips
      if (newZip.startsWith('770') || newZip.startsWith('773')) {
        setCity('Houston');
        setState('TX');
      }
      // Add more mappings or use a zip code API
      
      const location = { city, state, zip: newZip };
      localStorage.setItem('userLocation', JSON.stringify(location));
      onLocationChange(location);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold">Your Location</h3>
        <button
          onClick={getCurrentLocation}
          disabled={loading}
          className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Detecting...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Use Current Location
            </>
          )}
        </button>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ZIP Code
          </label>
          <input
            type="text"
            value={zip}
            onChange={(e) => handleZipChange(e.target.value)}
            placeholder="77001"
            maxLength={5}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City
          </label>
          <input
            type="text"
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              onLocationChange({ city: e.target.value, state, zip });
            }}
            placeholder="Houston"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State
          </label>
          <select
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              onLocationChange({ city, state: e.target.value, zip });
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="TX">TX</option>
            <option value="CA">CA</option>
            <option value="NY">NY</option>
            <option value="FL">FL</option>
            <option value="IL">IL</option>
            {/* Add more states */}
          </select>
        </div>
      </div>
      
      <p className="text-xs text-gray-500 mt-2">
        We'll show providers within 25 miles of this location
      </p>
    </div>
  );
}