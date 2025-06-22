// lib/npi-registry.ts
import axios from 'axios';

const NPI_BASE_URL = 'https://npiregistry.cms.hhs.gov/api/';

export interface NPIProvider {
  number: string; // NPI number
  basic: {
    first_name?: string;
    last_name?: string;
    organization_name?: string;
    credential?: string;
    sole_proprietor?: string;
    gender?: string;
    enumeration_date?: string;
    status?: string;
  };
  addresses: Array<{
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postal_code: string;
    country_code: string;
    telephone_number?: string;
    fax_number?: string;
    address_purpose: string; // 'LOCATION' or 'MAILING'
    address_type?: string; // 'DOM' (domestic) or 'FOR' (foreign)
  }>;
  taxonomies: Array<{
    code: string;
    desc: string;
    primary: boolean;
    state?: string;
    license?: string;
  }>;
  identifiers?: Array<{
    identifier: string;
    type_text: string;
    state?: string;
    issuer?: string;
  }>;
}

export interface NPISearchParams {
  // Location parameters
  city?: string;
  state?: string;
  postal_code?: string;
  country_code?: string;
  
  // Provider type
  enumeration_type?: 'NPI-1' | 'NPI-2'; // 1=Individual, 2=Organization
  
  // Taxonomy/Specialty
  taxonomy_description?: string; // e.g., "Internal Medicine"
  
  // Organization search
  organization_name?: string;
  
  // Individual search  
  first_name?: string;
  last_name?: string;
  
  // Pagination
  limit?: number; // Max 200
  skip?: number;
}

// Helper function to calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Radius of the Earth in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// ZIP code to approximate lat/lon (for common Texas ZIPs)
const ZIP_COORDINATES: Record<string, { lat: number; lon: number }> = {
  '77001': { lat: 29.7530, lon: -95.3698 }, // Houston
  '77002': { lat: 29.7589, lon: -95.3677 },
  '77003': { lat: 29.7436, lon: -95.3491 },
  '77004': { lat: 29.7199, lon: -95.3660 },
  '77005': { lat: 29.7168, lon: -95.4215 },
  '77006': { lat: 29.7376, lon: -95.3999 },
  '77007': { lat: 29.7752, lon: -95.4019 },
  '77008': { lat: 29.7989, lon: -95.3976 },
  '77009': { lat: 29.7869, lon: -95.3541 },
  '77019': { lat: 29.7502, lon: -95.4145 },
  '77024': { lat: 29.7807, lon: -95.5245 },
  '77025': { lat: 29.6908, lon: -95.4244 },
  '77027': { lat: 29.7491, lon: -95.4574 },
  '77030': { lat: 29.7105, lon: -95.3820 },
  '77054': { lat: 29.6868, lon: -95.3958 },
  '77056': { lat: 29.7557, lon: -95.4839 },
  '77057': { lat: 29.7490, lon: -95.4962 },
  '77401': { lat: 29.5544, lon: -95.8044 }, // Bellaire
  '77407': { lat: 29.7058, lon: -95.5972 }, // Richmond
  // Add more as needed
};

export class NPIRegistryService {
  /**
   * Get nearby ZIP codes for a given ZIP with actual distance calculation
   */
  static getNearbyZipCodes(zip: string, maxDistance: number = 15): string[] {
    const zip5 = zip.substring(0, 5);
    const origin = ZIP_COORDINATES[zip5];
    
    if (!origin) {
      // If we don't have coordinates, return the original ZIP
      return [zip5];
    }
    
    const nearbyZips: Array<{ zip: string; distance: number }> = [];
    
    // Calculate distances to all known ZIPs
    for (const [otherZip, coords] of Object.entries(ZIP_COORDINATES)) {
      if (otherZip === zip5) continue;
      
      const distance = calculateDistance(
        origin.lat, origin.lon,
        coords.lat, coords.lon
      );
      
      if (distance <= maxDistance) {
        nearbyZips.push({ zip: otherZip, distance });
      }
    }
    
    // Sort by distance and return ZIP codes
    return [
      zip5,
      ...nearbyZips
        .sort((a, b) => a.distance - b.distance)
        .map(item => item.zip)
    ];
  }
  
  /**
   * Search for providers in the NPI Registry
   */
  static async searchProviders(params: NPISearchParams): Promise<NPIProvider[]> {
    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      
      // Add all defined parameters
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          queryParams.append(key, value.toString());
        }
      });
      
      // Default version
      queryParams.append('version', '2.1');
      
      // Make request
      const response = await axios.get(NPI_BASE_URL, {
        params: queryParams,
        timeout: 10000
      });
      
      if (response.data.result_count === 0) {
        return [];
      }
      
      const providers = response.data.results as NPIProvider[];
      
      // Filter out non-clinical providers
      const clinicalTaxonomies = [
        'Urgent Care', 'Emergency Medicine', 'Family Medicine', 
        'Internal Medicine', 'Clinic/Center', 'Hospital',
        'Walk-in', 'Immediate Care', 'Express Care',
        'Ambulatory', 'Primary Care', 'General Practice'
      ];
      
      const clinicalProviders = providers.filter((p: NPIProvider) => 
        p.taxonomies.some((t: any) => 
          clinicalTaxonomies.some(ct => t.desc?.toLowerCase().includes(ct.toLowerCase()))
        ) &&
        // Filter out administrative entities
        !p.basic.organization_name?.toLowerCase().includes('admitting') &&
        !p.basic.organization_name?.toLowerCase().includes('billing') &&
        !p.basic.organization_name?.toLowerCase().includes('administrative') &&
        !p.basic.organization_name?.toLowerCase().includes('anesthesia') &&
        !p.basic.organization_name?.toLowerCase().includes('radiology') &&
        !p.basic.organization_name?.toLowerCase().includes('pathology')
      );
      
      return clinicalProviders;
      
    } catch (error) {
      console.error('NPI Registry API error:', error);
      throw error;
    }
  }
  
  /**
   * Search providers with location filtering and distance calculation
   */
  static async searchProvidersNearby(
    city: string, 
    state: string, 
    zip: string,
    taxonomyDesc?: string,
    enumerationType?: 'NPI-1' | 'NPI-2',
    limit: number = 20
  ): Promise<NPIProvider[]> {
    const allProviders: NPIProvider[] = [];
    const zip5 = zip.substring(0, 5);
    const userCoords = ZIP_COORDINATES[zip5];
    
    console.log(`🔍 Searching for providers near ${city}, ${state} ${zip5}`);
    
    // First try exact ZIP code
    const zipResults = await this.searchProviders({
      postal_code: zip5,
      state,
      taxonomy_description: taxonomyDesc,
      enumeration_type: enumerationType,
      limit: 50
    });
    
    allProviders.push(...zipResults);
    console.log(`Found ${zipResults.length} providers in ZIP ${zip5}`);
    
    // If we need more providers, search nearby ZIPs
    if (allProviders.length < limit) {
      const nearbyZips = this.getNearbyZipCodes(zip5, 20); // 20 mile radius
      console.log(`Searching ${nearbyZips.length - 1} nearby ZIPs:`, nearbyZips.slice(1));
      
      for (const nearbyZip of nearbyZips.slice(1)) { // Skip first (original ZIP)
        if (allProviders.length >= limit * 2) break; // Get extra for filtering
        
        const nearbyResults = await this.searchProviders({
          postal_code: nearbyZip,
          state,
          taxonomy_description: taxonomyDesc,
          enumeration_type: enumerationType,
          limit: 10
        });
        
        allProviders.push(...nearbyResults);
      }
    }
    
    // If still not enough, try city-wide search
    if (allProviders.length < 10) {
      console.log(`Expanding search to all of ${city}, ${state}`);
      const cityResults = await this.searchProviders({
        city,
        state,
        taxonomy_description: taxonomyDesc,
        enumeration_type: enumerationType,
        limit: 30
      });
      
      // Filter to only include providers actually in the specified city
      const cityFiltered = cityResults.filter((p: NPIProvider) => {
        const location = p.addresses.find((a: any) => a.address_purpose === 'LOCATION');
        return location?.city.toUpperCase() === city.toUpperCase();
      });
      
      allProviders.push(...cityFiltered);
    }
    
    // Remove duplicates by NPI
    const uniqueProviders = Array.from(
      new Map(allProviders.map(p => [p.number, p])).values()
    );
    
    // Calculate distances if we have user coordinates
    let providersWithDistance = uniqueProviders;
    if (userCoords) {
      providersWithDistance = uniqueProviders.map(provider => {
        const location = provider.addresses.find(a => a.address_purpose === 'LOCATION');
        if (!location) return { ...provider, distance: 999 };
        
        // Try to get coordinates for provider's ZIP
        const providerZip5 = location.postal_code.substring(0, 5);
        const providerCoords = ZIP_COORDINATES[providerZip5];
        
        if (providerCoords) {
          const distance = calculateDistance(
            userCoords.lat, userCoords.lon,
            providerCoords.lat, providerCoords.lon
          );
          return { ...provider, distance: Math.round(distance * 10) / 10 };
        }
        
        // If we don't have coordinates, estimate based on ZIP difference
        const zipDiff = Math.abs(parseInt(providerZip5) - parseInt(zip5));
        const estimatedDistance = zipDiff < 10 ? zipDiff * 0.5 : zipDiff * 0.8;
        return { ...provider, distance: Math.round(estimatedDistance * 10) / 10 };
      });
      
      // Sort by distance
      providersWithDistance.sort((a: any, b: any) => a.distance - b.distance);
    }
    
    console.log(`✅ Returning ${Math.min(providersWithDistance.length, limit)} providers sorted by distance`);
    return providersWithDistance.slice(0, limit);
  }
  
  /**
   * Get a single provider by NPI number
   */
  static async getProvider(npi: string): Promise<NPIProvider | null> {
    try {
      const response = await axios.get(NPI_BASE_URL, {
        params: {
          number: npi,
          version: '2.1'
        }
      });
      
      if (response.data.result_count === 0) {
        return null;
      }
      
      return response.data.results[0] as NPIProvider;
      
    } catch (error) {
      console.error('NPI Registry API error:', error);
      return null;
    }
  }
  
  /**
   * Search for urgent care centers near a location
   */
  static async findUrgentCare(city: string, state: string, limit: number = 10, zip: string = ''): Promise<NPIProvider[]> {
    if (zip) {
      return this.searchProvidersNearby(city, state, zip, 'Urgent Care', 'NPI-2', limit);
    }
    
    // Search multiple related terms
    const searchTerms = ['Urgent Care', 'Walk-in Clinic', 'Immediate Care', 'Express Care'];
    const allResults: NPIProvider[] = [];
    
    for (const term of searchTerms) {
      const results = await this.searchProviders({
        city,
        state,
        taxonomy_description: term,
        enumeration_type: 'NPI-2',
        limit: Math.ceil(limit / searchTerms.length)
      });
      allResults.push(...results);
    }
    
    // Remove duplicates by NPI
    const unique = Array.from(
      new Map(allResults.map(p => [p.number, p])).values()
    );
    
    return unique.slice(0, limit);
  }
  
  /**
   * Search for emergency rooms
   */
  static async findEmergencyRooms(city: string, state: string, limit: number = 10, zip: string = ''): Promise<NPIProvider[]> {
    if (zip) {
      return this.searchProvidersNearby(city, state, zip, 'Emergency Medicine', 'NPI-2', limit);
    }
    
    // Also search for hospitals with emergency departments
    const erResults = await this.searchProviders({
      city,
      state,
      taxonomy_description: 'Emergency Medicine',
      enumeration_type: 'NPI-2',
      limit: limit / 2
    });
    
    const hospitalResults = await this.searchProviders({
      city,
      state,
      organization_name: 'hospital',
      enumeration_type: 'NPI-2',
      limit: limit / 2
    });
    
    // Filter hospitals to likely have ERs
    const hospitalERs = hospitalResults.filter(h => 
      !h.basic.organization_name?.toLowerCase().includes('rehab') &&
      !h.basic.organization_name?.toLowerCase().includes('psychiatric')
    );
    
    return [...erResults, ...hospitalERs].slice(0, limit);
  }
  
  /**
   * Search for primary care physicians
   */
  static async findPrimaryCare(city: string, state: string, limit: number = 10, zip: string = ''): Promise<NPIProvider[]> {
    if (zip) {
      const taxonomies = ['Family Medicine', 'Internal Medicine', 'General Practice'];
      const results: NPIProvider[] = [];
      
      for (const taxonomy of taxonomies) {
        const providers = await this.searchProvidersNearby(
          city, state, zip, taxonomy, 'NPI-1', Math.floor(limit / 3)
        );
        results.push(...providers);
      }
      
      return results.slice(0, limit);
    }
    
    const taxonomies = [
      'Family Medicine',
      'Internal Medicine',
      'General Practice',
      'Primary Care'
    ];
    
    const results: NPIProvider[] = [];
    
    for (const taxonomy of taxonomies) {
      const providers = await this.searchProviders({
        city,
        state,
        taxonomy_description: taxonomy,
        enumeration_type: 'NPI-1', // Individuals
        limit: Math.floor(limit / taxonomies.length)
      });
      results.push(...providers);
    }
    
    return results.slice(0, limit);
  }
  
  /**
   * Format provider for display
   */
  static formatProvider(provider: NPIProvider & { distance?: number }): {
    name: string;
    type: string;
    address: string;
    phone: string;
    npi: string;
    specialty: string;
    distance?: number;
  } {
    const location = provider.addresses.find(a => a.address_purpose === 'LOCATION') || provider.addresses[0];
    const primaryTaxonomy = provider.taxonomies.find(t => t.primary) || provider.taxonomies[0];
    
    const name = provider.basic.organization_name || 
                 `${provider.basic.first_name} ${provider.basic.last_name}${provider.basic.credential ? ', ' + provider.basic.credential : ''}`;
    
    // Format ZIP code
    const fullZip = location.postal_code || '';
    const zip5 = fullZip.substring(0, 5);
    const formattedZip = fullZip.length > 5 ? `${zip5}-${fullZip.substring(5)}` : zip5;
    
    return {
      name,
      type: primaryTaxonomy?.desc || 'Healthcare Provider',
      address: `${location.address_1}${location.address_2 ? ' ' + location.address_2 : ''}, ${location.city}, ${location.state} ${formattedZip}`,
      phone: location.telephone_number || 'N/A',
      npi: provider.number,
      specialty: primaryTaxonomy?.desc || 'General',
      distance: provider.distance
    };
  }
}