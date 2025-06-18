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

export class NPIRegistryService {
  /**
   * Get nearby ZIP codes for a given ZIP
   */
  static getNearbyZipCodes(zip: string): string[] {
    // Extract 5-digit ZIP if ZIP+4 format
    const zip5 = zip.substring(0, 5);
    
    // Houston area ZIP codes
    const houstonZips: Record<string, string[]> = {
      '77001': ['77002', '77003', '77004', '77005', '77006', '77007', '77008', '77009'],
      '77002': ['77001', '77003', '77010', '77019', '77006', '77007'],
      '77005': ['77001', '77006', '77025', '77030', '77098', '77019'],
      '77006': ['77005', '77019', '77098', '77007', '77001'],
      '77007': ['77008', '77009', '77019', '77006', '77001'],
      '77008': ['77007', '77009', '77018', '77022'],
      '77019': ['77005', '77006', '77007', '77024', '77027', '77098'],
      '77024': ['77019', '77027', '77055', '77056', '77057', '77063'],
      '77025': ['77005', '77030', '77054', '77096', '77035'],
      '77027': ['77019', '77024', '77056', '77098', '77081'],
      '77030': ['77004', '77021', '77025', '77054', '77005'],
      '77054': ['77030', '77035', '77045', '77051', '77025'],
      // Add more Houston ZIP codes
      '77056': ['77027', '77024', '77057', '77063', '77055'],
      '77057': ['77056', '77063', '77042', '77081', '77024'],
      '77063': ['77057', '77055', '77024', '77042', '77077'],
      '77077': ['77082', '77083', '77079', '77042', '77063'],
      '77082': ['77077', '77083', '77099', '77079'],
      // Medical Center area
      '77004': ['77030', '77021', '77051', '77003', '77001'],
      '77021': ['77004', '77030', '77051', '77033', '77047'],
      // More areas
      '77098': ['77006', '77019', '77005', '77027'],
    };
    
    return houstonZips[zip5] || [zip5];
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
        'Walk-in', 'Immediate Care', 'Express Care'
      ];
      
      const clinicalProviders = providers.filter((p: NPIProvider) => 
        p.taxonomies.some((t: any) => 
          clinicalTaxonomies.some(ct => t.desc.includes(ct))
        ) &&
        // Filter out administrative entities
        !p.basic.organization_name?.includes('ADMITTING') &&
        !p.basic.organization_name?.includes('BILLING') &&
        !p.basic.organization_name?.includes('ADMINISTRATIVE')
      );
      
      return clinicalProviders;
      
    } catch (error) {
      console.error('NPI Registry API error:', error);
      throw error;
    }
  }
  
  /**
   * Search providers with location filtering
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
    
    // Extract 5-digit ZIP if ZIP+4 format
    const zip5 = zip.substring(0, 5);
    
    // Search the main ZIP
    const mainResults = await this.searchProviders({
      city,
      state,
      postal_code: zip5,
      taxonomy_description: taxonomyDesc,
      enumeration_type: enumerationType,
      limit: Math.ceil(limit / 2)
    });
    
    allProviders.push(...mainResults);
    
    // If we don't have enough, search nearby ZIPs
    if (allProviders.length < limit / 2) {
      const nearbyZips = this.getNearbyZipCodes(zip5);
      
      for (const nearbyZip of nearbyZips) {
        if (allProviders.length >= limit) break;
        
        const nearbyResults = await this.searchProviders({
          postal_code: nearbyZip,
          state,
          taxonomy_description: taxonomyDesc,
          enumeration_type: enumerationType,
          limit: 5
        });
        
        allProviders.push(...nearbyResults);
      }
    }
    
    // Also try state-wide search if still not enough
    if (allProviders.length < 5) {
      const stateResults = await this.searchProviders({
        state,
        taxonomy_description: taxonomyDesc,
        enumeration_type: enumerationType,
        limit: 10
      });
      
      // Filter to only include providers in the right city
      const cityFiltered = stateResults.filter((p: NPIProvider) => {
        const location = p.addresses.find((a: any) => a.address_purpose === 'LOCATION');
        return location?.city === city.toUpperCase();
      });
      
      allProviders.push(...cityFiltered);
    }
    
    // Remove duplicates and wrong locations
    const unique = Array.from(
      new Map(allProviders.map(p => [p.number, p])).values()
    ).filter((p: NPIProvider) => {
      const location = p.addresses.find((a: any) => a.address_purpose === 'LOCATION');
      // Filter out wrong states
      if (location?.state !== state) return false;
      // Filter out obviously wrong cities
      if (location?.city && !location.city.includes(city.toUpperCase()) && 
          location.city !== city.toUpperCase()) {
        // Allow nearby cities for Houston
        const nearbyCities = ['HOUSTON', 'BELLAIRE', 'WEST UNIVERSITY PLACE', 'PASADENA', 'PEARLAND', 'SUGAR LAND', 'KATY', 'THE WOODLANDS'];
        if (city.toUpperCase() === 'HOUSTON' && !nearbyCities.includes(location.city)) {
          return false;
        }
      }
      return true;
    });
    
    return unique.slice(0, limit);
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
    // Use nearby search if ZIP provided
    if (zip) {
      return this.searchProvidersNearby(city, state, zip, 'Urgent Care', 'NPI-2', limit);
    }
    
    // Otherwise use original search
    // Try multiple search strategies for better results
    const searches = [
      // Direct urgent care search
      this.searchProviders({
        city,
        state,
        taxonomy_description: 'Urgent Care',
        enumeration_type: 'NPI-2',
        limit: Math.ceil(limit / 2)
      }),
      // Also search for clinics
      this.searchProviders({
        city,
        state,
        organization_name: 'clinic',
        enumeration_type: 'NPI-2',
        limit: Math.ceil(limit / 2)
      })
    ];
    
    const results = await Promise.all(searches);
    const combined = [...results[0], ...results[1]];
    
    // Remove duplicates by NPI
    const unique = Array.from(
      new Map(combined.map(p => [p.number, p])).values()
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
    
    return this.searchProviders({
      city,
      state,
      taxonomy_description: 'Emergency Medicine',
      enumeration_type: 'NPI-2',
      limit
    });
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
      'General Practice'
    ];
    
    const results: NPIProvider[] = [];
    
    for (const taxonomy of taxonomies) {
      const providers = await this.searchProviders({
        city,
        state,
        taxonomy_description: taxonomy,
        enumeration_type: 'NPI-1', // Individuals
        limit: Math.floor(limit / 3)
      });
      results.push(...providers);
    }
    
    return results.slice(0, limit);
  }
  
  /**
   * Format provider for display
   */
  static formatProvider(provider: NPIProvider): {
    name: string;
    type: string;
    address: string;
    phone: string;
    npi: string;
    specialty: string;
  } {
    const location = provider.addresses.find(a => a.address_purpose === 'LOCATION') || provider.addresses[0];
    const primaryTaxonomy = provider.taxonomies.find(t => t.primary) || provider.taxonomies[0];
    
    const name = provider.basic.organization_name || 
                 `${provider.basic.first_name} ${provider.basic.last_name}${provider.basic.credential ? ', ' + provider.basic.credential : ''}`;
    
    // Extract 5-digit ZIP from ZIP+4 format
    const fullZip = location.postal_code || '';
    const zip5 = fullZip.substring(0, 5);
    const formattedZip = fullZip.length > 5 ? `${zip5}-${fullZip.substring(5)}` : zip5;
    
    return {
      name,
      type: primaryTaxonomy?.desc || 'Healthcare Provider',
      address: `${location.address_1}${location.address_2 ? ' ' + location.address_2 : ''}, ${location.city}, ${location.state} ${formattedZip}`,
      phone: location.telephone_number || 'N/A',
      npi: provider.number,
      specialty: primaryTaxonomy?.desc || 'General'
    };
  }
}