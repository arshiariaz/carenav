// lib/npi-registry-improved.ts
import axios from 'axios';

const NPI_BASE_URL = 'https://npiregistry.cms.hhs.gov/api/';

export interface NPIProvider {
  number: string;
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
    address_purpose: string;
    address_type?: string;
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

export class ImprovedNPIService {
  /**
   * Find urgent care providers using multiple search strategies
   */
  static async findUrgentCareProviders(
    city: string,
    state: string,
    zip?: string,
    limit: number = 30
  ): Promise<NPIProvider[]> {
    const allProviders: NPIProvider[] = [];
    
    // Strategy 1: Search by organization names that commonly indicate urgent care
    const urgentCareKeywords = [
      'urgent care',
      'urgent',
      'walk in',
      'walk-in',
      'immediate care',
      'express care',
      'quick care',
      'minute clinic',
      'minuteclinic',
      'healthcare clinic',
      'medical clinic',
      'family clinic',
      'clinic'
    ];
    
    // Try each keyword
    for (const keyword of urgentCareKeywords.slice(0, 5)) { // Limit to avoid too many requests
      try {
        console.log(`🔍 Searching for: "${keyword}" in ${city}, ${state}`);
        const results = await this.searchByOrganizationName(keyword, city, state, zip);
        allProviders.push(...results);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error searching for ${keyword}:`, error);
      }
    }
    
    // Strategy 2: Search by taxonomy codes that might include urgent care
    const relevantTaxonomies = [
      'Clinic/Center',
      'Walk-in Retail Health Clinic',
      'Federally Qualified Health Center',
      'Community Health Center',
      'Rural Health Clinic'
    ];
    
    for (const taxonomy of relevantTaxonomies.slice(0, 3)) {
      try {
        const results = await this.searchByTaxonomy(taxonomy, city, state, zip);
        allProviders.push(...results);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error searching taxonomy ${taxonomy}:`, error);
      }
    }
    
    // Deduplicate by NPI
    const uniqueProviders = Array.from(
      new Map(allProviders.map(p => [p.number, p])).values()
    );
    
    // Filter to likely urgent care providers
    const filteredProviders = uniqueProviders.filter(provider => {
      const name = provider.basic.organization_name?.toLowerCase() || '';
      const taxonomy = provider.taxonomies[0]?.desc?.toLowerCase() || '';
      
      // Include if name suggests urgent care
      const nameIndicatesUrgentCare = urgentCareKeywords.some(keyword => 
        name.includes(keyword.toLowerCase())
      );
      
      // Include clinics that aren't specialized
      const isGeneralClinic = taxonomy.includes('clinic') && 
        !taxonomy.includes('dental') && 
        !taxonomy.includes('mental') && 
        !taxonomy.includes('substance') &&
        !taxonomy.includes('dialysis') &&
        !taxonomy.includes('oncology');
      
      // Exclude hospitals, nursing homes, etc.
      const excludeTypes = ['hospital', 'nursing', 'hospice', 'home health', 'pharmacy', 'durable medical'];
      const shouldExclude = excludeTypes.some(type => name.includes(type));
      
      return (nameIndicatesUrgentCare || isGeneralClinic) && !shouldExclude;
    });
    
    console.log(`✅ Found ${filteredProviders.length} urgent care providers from ${uniqueProviders.length} total results`);
    
    return filteredProviders.slice(0, limit);
  }
  
  /**
   * Find emergency rooms
   */
  static async findEmergencyRooms(
    city: string,
    state: string,
    zip?: string,
    limit: number = 20
  ): Promise<NPIProvider[]> {
    const allProviders: NPIProvider[] = [];
    
    // Search for hospitals and emergency departments
    const keywords = ['hospital', 'medical center', 'emergency'];
    
    for (const keyword of keywords) {
      try {
        const results = await this.searchByOrganizationName(keyword, city, state, zip);
        allProviders.push(...results);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error searching for ${keyword}:`, error);
      }
    }
    
    // Deduplicate
    const uniqueProviders = Array.from(
      new Map(allProviders.map(p => [p.number, p])).values()
    );
    
    // Filter to hospitals likely to have ERs
    const hospitals = uniqueProviders.filter(provider => {
      const name = provider.basic.organization_name?.toLowerCase() || '';
      const taxonomy = provider.taxonomies[0]?.desc?.toLowerCase() || '';
      
      const isHospital = name.includes('hospital') || 
                        name.includes('medical center') ||
                        taxonomy.includes('general acute care hospital');
      
      const notSpecialty = !name.includes('psychiatric') && 
                          !name.includes('rehabilitation') && 
                          !name.includes('children') &&
                          !name.includes('behavioral');
      
      return isHospital && notSpecialty;
    });
    
    return hospitals.slice(0, limit);
  }
  
  /**
   * Find primary care providers
   */
  static async findPrimaryCareProviders(
    city: string,
    state: string,
    zip?: string,
    limit: number = 30
  ): Promise<NPIProvider[]> {
    const allProviders: NPIProvider[] = [];
    
    // Search for individual practitioners
    const taxonomies = [
      'Family Medicine',
      'Internal Medicine',
      'General Practice',
      'Family Practice'
    ];
    
    for (const taxonomy of taxonomies) {
      try {
        const results = await this.searchProviders({
          city,
          state,
          postal_code: zip,
          taxonomy_description: taxonomy,
          enumeration_type: 'NPI-1',
          limit: 10
        });
        allProviders.push(...results);
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error(`Error searching for ${taxonomy}:`, error);
      }
    }
    
    // Also search for primary care clinics
    try {
      const clinicResults = await this.searchByOrganizationName('family practice', city, state, zip);
      allProviders.push(...clinicResults);
    } catch (error) {
      console.error('Error searching for family practice clinics:', error);
    }
    
    // Deduplicate
    const uniqueProviders = Array.from(
      new Map(allProviders.map(p => [p.number, p])).values()
    );
    
    return uniqueProviders.slice(0, limit);
  }
  
  /**
   * Base search function
   */
  static async searchProviders(params: any): Promise<NPIProvider[]> {
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('version', '2.1');
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          queryParams.append(key, value.toString());
        }
      });
      
      const response = await axios.get(NPI_BASE_URL, {
        params: queryParams,
        timeout: 10000
      });
      
      const data = response.data as any;
      
      if (!data || data.result_count === 0 || !data.results) {
        return [];
      }
      
      return data.results as NPIProvider[];
      
    } catch (error) {
      console.error('NPI Registry API error:', error);
      throw error;
    }
  }
  
  /**
   * Search by organization name
   */
  static async searchByOrganizationName(
    name: string,
    city: string,
    state: string,
    zip?: string
  ): Promise<NPIProvider[]> {
    const params: any = {
      organization_name: name,
      state,
      enumeration_type: 'NPI-2',
      limit: 50
    };
    
    // Try with city if provided
    if (city) {
      params.city = city;
    }
    
    // Try with ZIP if provided
    if (zip) {
      params.postal_code = zip;
    }
    
    let results = await this.searchProviders(params);
    
    // If no results with city/zip, try just state
    if (results.length === 0 && (city || zip)) {
      delete params.city;
      delete params.postal_code;
      results = await this.searchProviders(params);
    }
    
    return results;
  }
  
  /**
   * Search by taxonomy
   */
  static async searchByTaxonomy(
    taxonomy: string,
    city: string,
    state: string,
    zip?: string
  ): Promise<NPIProvider[]> {
    const params: any = {
      taxonomy_description: taxonomy,
      state,
      enumeration_type: 'NPI-2',
      limit: 50
    };
    
    if (city) params.city = city;
    if (zip) params.postal_code = zip;
    
    let results = await this.searchProviders(params);
    
    // If no results with city/zip, try just state
    if (results.length === 0 && (city || zip)) {
      delete params.city;
      delete params.postal_code;
      results = await this.searchProviders(params);
    }
    
    return results;
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
    city: string;
    state: string;
    zip: string;
    distance?: number;
    driveTime?: number;
    waitTime?: string;
    acceptsWalkIns?: boolean;
    hasPharmacy?: boolean;
    hours?: string;
  } {
    const location = provider.addresses.find(a => a.address_purpose === 'LOCATION') || provider.addresses[0];
    const primaryTaxonomy = provider.taxonomies.find(t => t.primary) || provider.taxonomies[0];
    
    const name = provider.basic.organization_name || 
                 `${provider.basic.first_name} ${provider.basic.last_name}${provider.basic.credential ? ', ' + provider.basic.credential : ''}`;
    
    return {
      name,
      type: this.categorizeProviderType(provider),
      address: `${location.address_1}${location.address_2 ? ' ' + location.address_2 : ''}, ${location.city}, ${location.state} ${location.postal_code}`,
      phone: location.telephone_number || 'N/A',
      npi: provider.number,
      specialty: primaryTaxonomy?.desc || 'General',
      city: location.city,
      state: location.state,
      zip: location.postal_code
    };
  }
  
  /**
   * Categorize provider type based on name and taxonomy
   */
  static categorizeProviderType(provider: NPIProvider): string {
    const name = provider.basic.organization_name?.toLowerCase() || '';
    const taxonomy = provider.taxonomies[0]?.desc?.toLowerCase() || '';
    
    if (name.includes('urgent') || name.includes('walk-in') || name.includes('immediate care')) {
      return 'Urgent Care';
    }
    
    if (name.includes('hospital') || name.includes('emergency')) {
      return 'Emergency Room';
    }
    
    if (taxonomy.includes('family medicine') || taxonomy.includes('internal medicine')) {
      return 'Primary Care';
    }
    
    if (name.includes('clinic')) {
      return 'Urgent Care';
    }
    
    return 'Medical Facility';
  }
}
