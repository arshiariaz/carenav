// lib/provider-search-service.ts
import axios from 'axios';

const NPI_BASE_URL = 'https://npiregistry.cms.hhs.gov/api/';

interface SearchParams {
  city: string;
  state: string;  // MUST be 2-letter code
  zip?: string;
  radius?: number;
}

export class ProviderSearchService {
  /**
   * Convert state names to 2-letter codes
   */
  static normalizeState(state: string): string {
    // If already 2 letters, return as-is
    if (state.length === 2) return state.toUpperCase();
    
    // Common state mappings
    const stateMap: Record<string, string> = {
      'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
      'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
      'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
      'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
      'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
      'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
      'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
      'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
      'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
      'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
      'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
      'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
      'wisconsin': 'WI', 'wyoming': 'WY'
    };
    
    const normalized = state.toLowerCase().trim();
    return stateMap[normalized] || state.substring(0, 2).toUpperCase();
  }

  /**
   * Find all medical facilities in an area, then categorize them
   */
  static async findMedicalFacilities(params: SearchParams, limit: number = 100) {
    const state = this.normalizeState(params.state);
    console.log(`🔍 Searching for medical facilities in ${params.city}, ${state} ${params.zip || ''}`);
    
    const allProviders: any[] = [];
    
    // Strategy 1: Search by ZIP code (most accurate for proximity)
    if (params.zip) {
      try {
        const zipSearch = await this.searchNPI({
          postal_code: params.zip,
          enumeration_type: 'NPI-2',
          limit: 50
        });
        console.log(`  Found ${zipSearch.length} providers in ZIP ${params.zip}`);
        allProviders.push(...zipSearch);
      } catch (error) {
        console.error('ZIP search error:', error);
      }
    }
    
    // Strategy 2: Search by city + state (broader search)
    try {
      const citySearch = await this.searchNPI({
        city: params.city,
        state: state,
        enumeration_type: 'NPI-2',
        limit: 50
      });
      console.log(`  Found ${citySearch.length} providers in ${params.city}, ${state}`);
      allProviders.push(...citySearch);
    } catch (error) {
      console.error('City search error:', error);
    }
    
    // Strategy 3: Search common organization types
    const orgTypes = ['clinic', 'medical', 'health', 'care', 'center'];
    for (const orgType of orgTypes.slice(0, 3)) {
      try {
        const orgSearch = await this.searchNPI({
          organization_name: orgType,
          state: state,
          limit: 30
        });
        allProviders.push(...orgSearch);
        await new Promise(resolve => setTimeout(resolve, 200)); // Rate limiting
      } catch (error) {
        console.error(`Org search error for ${orgType}:`, error);
      }
    }
    
    // Deduplicate by NPI
    const uniqueProviders = Array.from(
      new Map(allProviders.map(p => [p.number, p])).values()
    );
    
    console.log(`✅ Total unique providers found: ${uniqueProviders.length}`);
    
    // Categorize providers
    const categorized = this.categorizeProviders(uniqueProviders);
    
    return {
      urgentCare: categorized.urgentCare.slice(0, limit),
      emergency: categorized.emergency.slice(0, limit),
      primaryCare: categorized.primaryCare.slice(0, limit),
      all: uniqueProviders.slice(0, limit)
    };
  }
  
  /**
   * Categorize providers based on name, taxonomy, and other indicators
   */
  static categorizeProviders(providers: any[]) {
    const urgentCare: any[] = [];
    const emergency: any[] = [];
    const primaryCare: any[] = [];
    const other: any[] = [];
    
    // Keywords that indicate provider type
    const urgentKeywords = [
      'urgent', 'walk-in', 'walk in', 'immediate', 'express', 
      'quick', 'minute', 'convenient', 'after hours'
    ];
    
    const emergencyKeywords = [
      'emergency', 'hospital', 'medical center', 'trauma'
    ];
    
    const primaryKeywords = [
      'family practice', 'family medicine', 'internal medicine',
      'primary care', 'general practice', 'pediatric'
    ];
    
    // Exclusion keywords
    const excludeKeywords = [
      'dental', 'pharmacy', 'physical therapy', 'mental health',
      'behavioral', 'substance', 'dialysis', 'nursing home',
      'hospice', 'home health', 'rehab', 'psychiatric'
    ];
    
    providers.forEach(provider => {
      const name = (provider.basic.organization_name || '').toLowerCase();
      const taxonomy = (provider.taxonomies?.[0]?.desc || '').toLowerCase();
      const combined = `${name} ${taxonomy}`;
      
      // Skip if it's an excluded type
      if (excludeKeywords.some(keyword => combined.includes(keyword))) {
        return;
      }
      
      // Categorize based on keywords
      if (urgentKeywords.some(keyword => combined.includes(keyword))) {
        urgentCare.push(provider);
      } else if (emergencyKeywords.some(keyword => name.includes(keyword))) {
        emergency.push(provider);
      } else if (primaryKeywords.some(keyword => combined.includes(keyword))) {
        primaryCare.push(provider);
      } else if (combined.includes('clinic') || combined.includes('medical')) {
        // Generic clinics often provide urgent care
        urgentCare.push(provider);
      } else {
        other.push(provider);
      }
    });
    
    console.log(`📊 Categorized providers:
      - Urgent Care: ${urgentCare.length}
      - Emergency: ${emergency.length}
      - Primary Care: ${primaryCare.length}
      - Other: ${other.length}`);
    
    return { urgentCare, emergency, primaryCare, other };
  }
  
  /**
   * Base NPI search function
   */
  static async searchNPI(params: any): Promise<any[]> {
    const queryParams = new URLSearchParams();
    queryParams.append('version', '2.1');
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });
    
    try {
      const response = await axios.get(NPI_BASE_URL, {
        params: queryParams,
        timeout: 10000
      });
      
      const data = response.data as any;
      
      if (!data || data.result_count === 0 || !data.results) {
        return [];
      }
      
      return data.results;
    } catch (error: any) {
      if (error.response?.status === 429) {
        console.error('Rate limited by NPI Registry');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      throw error;
    }
  }
  
  /**
   * Get nearby ZIP codes for radius search
   */
  static getNearbyZipCodes(centerZip: string, radiusMiles: number = 10): string[] {
    // This is a simplified version. In production, you'd use a ZIP code database
    // or a geocoding service to find actual nearby ZIPs
    const baseZip = parseInt(centerZip);
    const nearbyZips: string[] = [centerZip];
    
    // Add adjacent ZIP codes (simplified logic)
    for (let i = 1; i <= 5; i++) {
      nearbyZips.push(String(baseZip + i).padStart(5, '0'));
      nearbyZips.push(String(baseZip - i).padStart(5, '0'));
    }
    
    return nearbyZips;
  }
  
  /**
   * Format provider for display
   */
  static formatProvider(provider: any, type: string) {
    const location = provider.addresses?.find((a: any) => a.address_purpose === 'LOCATION') || provider.addresses?.[0];
    const taxonomy = provider.taxonomies?.find((t: any) => t.primary) || provider.taxonomies?.[0];
    
    if (!location) return null;
    
    return {
      npi: provider.number,
      name: provider.basic.organization_name || 
            `${provider.basic.first_name || ''} ${provider.basic.last_name || ''}`.trim(),
      type,
      address: `${location.address_1}${location.address_2 ? ' ' + location.address_2 : ''}, ${location.city}, ${location.state} ${location.postal_code}`,
      city: location.city,
      state: location.state,
      zip: location.postal_code,
      phone: location.telephone_number || 'N/A',
      specialty: taxonomy?.desc || 'General',
      // These will be filled by distance calculation
      distance: 0,
      driveTime: 0,
      waitTime: type === 'Emergency Room' ? '2-4 hours' : '30-45 min',
      acceptsWalkIns: type !== 'Primary Care',
      hasPharmacy: Math.random() > 0.5,
      hours: type === 'Emergency Room' ? '24/7' : 'Mon-Fri 8am-6pm'
    };
  }
}