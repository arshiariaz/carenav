// lib/google-distance-service.ts
import axios from 'axios';

interface GoogleDistanceResult {
  distance: {
    text: string;
    value: number; // meters
  };
  duration: {
    text: string;
    value: number; // seconds
  };
  status: string;
}

interface DistanceMatrixResponse {
  destination_addresses: string[];
  origin_addresses: string[];
  rows: Array<{
    elements: Array<{
      distance?: GoogleDistanceResult['distance'];
      duration?: GoogleDistanceResult['duration'];
      status: 'OK' | 'NOT_FOUND' | 'ZERO_RESULTS';
    }>;
  }>;
  status: 'OK' | 'INVALID_REQUEST' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'UNKNOWN_ERROR';
}

export class GoogleDistanceService {
  private static DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
  private static API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  
  // Cache to avoid repeated API calls
  private static cache = new Map<string, { distance: number; duration: number; timestamp: number }>();
  private static CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  
  /**
   * Calculate distance between two locations using Google Distance Matrix API
   * @param origin - Origin address or ZIP code
   * @param destination - Destination address or ZIP code
   * @param mode - Travel mode (default: driving)
   */
  static async calculateDistance(
    origin: string,
    destination: string,
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ): Promise<{
    distance: string;
    distanceValue: number; // in miles
    duration: string;
    durationValue: number; // in minutes
  }> {
    // Check if API key is configured
    if (!this.API_KEY) {
      console.warn('Google Maps API key not configured, using fallback');
      return this.fallbackCalculation(origin, destination);
    }
    
    // Check cache first
    const cacheKey = `${origin}-${destination}-${mode}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return {
        distance: `${cached.distance.toFixed(1)} mi`,
        distanceValue: cached.distance,
        duration: `${cached.duration} min`,
        durationValue: cached.duration
      };
    }
    
    try {
      const response = await axios.get(this.DISTANCE_MATRIX_URL, {
        params: {
          origins: origin,
          destinations: destination,
          mode,
          units: 'imperial',
          key: this.API_KEY
        },
        timeout: 5000
      });
      
      const responseData = response.data as DistanceMatrixResponse;
      
      if (responseData.status !== 'OK') {
        console.error('Distance Matrix API error:', responseData.status);
        return this.fallbackCalculation(origin, destination);
      }
      
      const element = responseData.rows[0]?.elements[0];
      if (!element || element.status !== 'OK' || !element.distance || !element.duration) {
        console.error('No route found between locations');
        return this.fallbackCalculation(origin, destination);
      }
      
      // Convert meters to miles and seconds to minutes
      const distanceInMiles = element.distance.value * 0.000621371;
      const durationInMinutes = Math.round(element.duration.value / 60);
      
      // Cache the result
      this.cache.set(cacheKey, {
        distance: distanceInMiles,
        duration: durationInMinutes,
        timestamp: Date.now()
      });
      
      return {
        distance: element.distance.text,
        distanceValue: distanceInMiles,
        duration: element.duration.text,
        durationValue: durationInMinutes
      };
      
    } catch (error) {
      console.error('Google Distance API error:', error);
      return this.fallbackCalculation(origin, destination);
    }
  }
  
  /**
   * Calculate distances for multiple destinations from a single origin
   * More efficient than multiple individual calls
   */
  static async calculateMultipleDistances(
    origin: string,
    destinations: string[],
    mode: 'driving' | 'walking' | 'transit' = 'driving'
  ): Promise<Array<{
    destination: string;
    distance: string;
    distanceValue: number;
    duration: string;
    durationValue: number;
  }>> {
    if (!this.API_KEY || destinations.length === 0) {
      return destinations.map(dest => ({
        destination: dest,
        ...this.fallbackCalculation(origin, dest)
      }));
    }
    
    // Google allows up to 25 destinations per request
    const chunks = [];
    for (let i = 0; i < destinations.length; i += 25) {
      chunks.push(destinations.slice(i, i + 25));
    }
    
    const results: any[] = [];
    
    for (const chunk of chunks) {
      try {
        const response = await axios.get(this.DISTANCE_MATRIX_URL, {
          params: {
            origins: origin,
            destinations: chunk.join('|'),
            mode,
            units: 'imperial',
            key: this.API_KEY
          },
          timeout: 5000
        });
        
        const responseData = response.data as DistanceMatrixResponse;
        
        if (responseData.status === 'OK' && responseData.rows[0]) {
          responseData.rows[0].elements.forEach((element, index) => {
            if (element.status === 'OK' && element.distance && element.duration) {
              const distanceInMiles = element.distance.value * 0.000621371;
              const durationInMinutes = Math.round(element.duration.value / 60);
              
              results.push({
                destination: chunk[index],
                distance: element.distance.text,
                distanceValue: distanceInMiles,
                duration: element.duration.text,
                durationValue: durationInMinutes
              });
            } else {
              // Fallback for failed elements
              results.push({
                destination: chunk[index],
                ...this.fallbackCalculation(origin, chunk[index])
              });
            }
          });
        }
      } catch (error) {
        console.error('Batch distance calculation error:', error);
        // Add fallback results for this chunk
        chunk.forEach(dest => {
          results.push({
            destination: dest,
            ...this.fallbackCalculation(origin, dest)
          });
        });
      }
    }
    
    return results;
  }
  
  /**
   * Format an address for Google Maps (ensures proper formatting)
   */
  static formatAddress(address: string, city?: string, state?: string, zip?: string): string {
    const parts = [address];
    if (city) parts.push(city);
    if (state) parts.push(state);
    if (zip) parts.push(zip);
    
    // If it's just a ZIP code, add USA for better results
    if (parts.length === 1 && /^\d{5}(-\d{4})?$/.test(parts[0])) {
      parts.push('USA');
    }
    
    return parts.filter(Boolean).join(', ');
  }
  
  /**
   * Get geocode coordinates for an address
   */
  static async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.API_KEY) return null;
    
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address,
          key: this.API_KEY
        }
      });
      
      const responseData = response.data as any;
      
      if (responseData.status === 'OK' && responseData.results && responseData.results[0]) {
        return responseData.results[0].geometry.location;
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    
    return null;
  }
  
  /**
   * Fallback distance calculation when API is unavailable
   */
  private static fallbackCalculation(origin: string, destination: string): {
    distance: string;
    distanceValue: number;
    duration: string;
    durationValue: number;
  } {
    // Extract ZIP codes if present
    const originZip = origin.match(/\d{5}/)?.[0];
    const destZip = destination.match(/\d{5}/)?.[0];
    
    let miles = 5;
    if (originZip && destZip) {
      const diff = Math.abs(parseInt(originZip) - parseInt(destZip));
      if (diff === 0) miles = 0.5 + Math.random() * 2;
      else if (diff < 10) miles = 2 + Math.random() * 3;
      else if (diff < 50) miles = 5 + Math.random() * 5;
      else miles = 10 + Math.random() * 10;
    }
    
    const minutes = Math.round(miles * 2.5); // Assume 24mph average
    
    return {
      distance: `${miles.toFixed(1)} mi`,
      distanceValue: miles,
      duration: `${minutes} min`,
      durationValue: minutes
    };
  }
  
  /**
   * Clear the distance cache
   */
  static clearCache(): void {
    this.cache.clear();
  }
}