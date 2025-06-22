// lib/enhanced-provider-search.ts
import axios from 'axios';
import { ProviderSearchService } from './provider-search-service';
import { ProviderDirectoryService, convertFHIRToCareNav } from './provider-directory-apis';

const NPI_BASE_URL = 'https://npiregistry.cms.hhs.gov/api/';

interface NPIResponse {
  result_count?: number;
  results?: any[];
}

interface EnhancedSearchParams {
  symptom?: string;
  urgency?: string;
  city: string;
  state: string;
  zip?: string;
  insuranceCompany?: string;
  planId?: string;
}

export class EnhancedProviderSearch {
  /**
   * Multi-source provider search with intelligent fallbacks
   */
  static async findProviders(params: EnhancedSearchParams) {
    const providers: any[] = [];
    const { city, state, zip, insuranceCompany, planId, symptom, urgency } = params;
    
    console.log('🔍 Enhanced provider search:', params);
    
    // Step 1: Try insurer-specific FHIR APIs if we have insurance info
    if (insuranceCompany && planId) {
      try {
        const insurerProviders = await this.searchInsuranceNetwork(
          insuranceCompany,
          planId,
          city,
          state,
          symptom
        );
        providers.push(...insurerProviders);
        console.log(`✅ Found ${insurerProviders.length} in-network providers`);
      } catch (error) {
        console.error('Insurance network search failed:', error);
      }
    }
    
    // Step 2: Use enhanced NPI search with better categorization
    try {
      const npiProviders = await this.enhancedNPISearch(
        city,
        state,
        zip,
        symptom,
        urgency
      );
      providers.push(...npiProviders);
      console.log(`✅ Found ${npiProviders.length} providers via NPI`);
    } catch (error) {
      console.error('NPI search failed:', error);
    }
    
    // Step 3: Try specialty-specific searches based on symptoms
    if (symptom) {
      const specialtyProviders = await this.searchBySpecialty(
        symptom,
        city,
        state,
        zip
      );
      providers.push(...specialtyProviders);
    }
    
    // Step 4: Deduplicate and categorize
    const uniqueProviders = this.deduplicateProviders(providers);
    const categorized = this.categorizeBySymptom(uniqueProviders, symptom, urgency);
    
    return categorized;
  }
  
  /**
   * Search insurance-specific provider directories
   */
  static async searchInsuranceNetwork(
    insuranceCompany: string,
    planId: string,
    city: string,
    state: string,
    symptom?: string
  ) {
    const providers: any[] = [];
    
    // Map insurance company to API endpoints
    const insurerMap: Record<string, string[]> = {
      'anthem': ['anthem', 'bcbs_capital', 'bcbs_tennessee'],
      'blue cross': ['bcbs_capital', 'bcbs_tennessee'],
      'bcbs': ['bcbs_capital', 'bcbs_tennessee'],
      'cigna': ['cigna'],
      'aetna': ['aetna'],
      'united': ['uhc'],
    };
    
    const company = insuranceCompany.toLowerCase();
    let endpoints: string[] = [];
    
    for (const [key, values] of Object.entries(insurerMap)) {
      if (company.includes(key)) {
        endpoints = values;
        break;
      }
    }
    
    // Try each endpoint
    for (const endpoint of endpoints) {
      try {
        const results = await ProviderDirectoryService.findInNetworkProviders(
          planId,
          endpoint,
          city,
          state,
          this.mapSymptomToSpecialty(symptom),
          20
        );
        
        // Convert FHIR to CareNav format
        const converted = results.map(r => 
          convertFHIRToCareNav(r.practitioner, r.role, r.location)
        );
        
        providers.push(...converted);
      } catch (error) {
        console.error(`Failed to query ${endpoint}:`, error);
      }
    }
    
    return providers;
  }
  
  /**
   * Enhanced NPI search with multiple strategies
   */
  static async enhancedNPISearch(
    city: string,
    state: string,
    zip?: string,
    symptom?: string,
    urgency?: string
  ) {
    // Use the existing ProviderSearchService but with enhancements
    const results = await ProviderSearchService.findMedicalFacilities({
      city,
      state: ProviderSearchService.normalizeState(state),
      zip
    });
    
    // Based on urgency/symptom, return appropriate providers
    if (urgency === 'emergency' || symptom?.toLowerCase().includes('chest pain')) {
      return results.emergency;
    } else if (urgency === 'urgent') {
      return results.urgentCare;
    } else {
      return [...results.urgentCare, ...results.primaryCare];
    }
  }
  
  /**
   * Search by medical specialty based on symptoms
   */
  static async searchBySpecialty(
    symptom: string,
    city: string,
    state: string,
    zip?: string
  ) {
    const specialtyMap: Record<string, string[]> = {
      'chest pain': ['Cardiology', 'Emergency Medicine', 'Internal Medicine'],
      'breathing': ['Pulmonology', 'Emergency Medicine', 'Internal Medicine'],
      'diabetes': ['Endocrinology', 'Internal Medicine', 'Family Medicine'],
      'mental health': ['Psychiatry', 'Psychology', 'Behavioral Health'],
      'pregnancy': ['Obstetrics', 'Gynecology', 'Family Medicine'],
      'child': ['Pediatrics', 'Family Medicine'],
      'skin': ['Dermatology', 'Family Medicine'],
      'broken': ['Orthopedics', 'Emergency Medicine', 'Sports Medicine'],
      'eye': ['Ophthalmology', 'Optometry'],
      'ear': ['Otolaryngology', 'ENT', 'Family Medicine'],
    };
    
    const providers: any[] = [];
    const symptomLower = symptom.toLowerCase();
    
    // Find matching specialties
    let specialties: string[] = ['Family Medicine', 'Internal Medicine']; // defaults
    
    for (const [key, specs] of Object.entries(specialtyMap)) {
      if (symptomLower.includes(key)) {
        specialties = specs;
        break;
      }
    }
    
    // Search for each specialty
    for (const specialty of specialties) {
      try {
        const params = new URLSearchParams({
          version: '2.1',
          city,
          state: ProviderSearchService.normalizeState(state),
          taxonomy_description: specialty,
          limit: '10'
        });
        
        if (zip) params.append('postal_code', zip);
        
        const response = await axios.get<NPIResponse>(
          `${NPI_BASE_URL}?${params.toString()}`
        );
        
        const data = response.data;
        if (data && data.results) {
          providers.push(...data.results);
        }
      } catch (error) {
        console.error(`Specialty search failed for ${specialty}:`, error);
      }
    }
    
    return providers;
  }
  
  /**
   * Map symptoms to medical specialties
   */
  static mapSymptomToSpecialty(symptom?: string): string | undefined {
    if (!symptom) return undefined;
    
    const lower = symptom.toLowerCase();
    
    if (lower.includes('heart') || lower.includes('chest')) return 'Cardiology';
    if (lower.includes('breathing') || lower.includes('asthma')) return 'Pulmonology';
    if (lower.includes('diabetes') || lower.includes('blood sugar')) return 'Endocrinology';
    if (lower.includes('anxiety') || lower.includes('depression')) return 'Psychiatry';
    if (lower.includes('pregnant') || lower.includes('pregnancy')) return 'Obstetrics';
    if (lower.includes('child') || lower.includes('pediatric')) return 'Pediatrics';
    
    return 'Family Medicine';
  }
  
  /**
   * Deduplicate providers by NPI
   */
  static deduplicateProviders(providers: any[]): any[] {
    const seen = new Set<string>();
    return providers.filter(p => {
      const id = p.npi || p.number || `${p.name}-${p.address}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }
  
  /**
   * Categorize providers based on symptom and urgency
   */
  static categorizeBySymptom(
    providers: any[],
    symptom?: string,
    urgency?: string
  ): any[] {
    return providers.map(provider => {
      // Determine if provider can handle the symptom
      let canHandleSymptom = true;
      let relevanceScore = 0;
      
      if (symptom && urgency) {
        const providerType = provider.type?.toLowerCase() || '';
        const specialty = provider.specialty?.toLowerCase() || '';
        
        // Emergency symptoms
        if (urgency === 'emergency') {
          canHandleSymptom = providerType.includes('emergency') || 
                            providerType.includes('hospital');
          relevanceScore = canHandleSymptom ? 10 : 1;
        }
        // Urgent symptoms
        else if (urgency === 'urgent') {
          canHandleSymptom = providerType.includes('urgent') || 
                            providerType.includes('emergency') ||
                            specialty.includes('walk-in');
          relevanceScore = canHandleSymptom ? 8 : 3;
        }
        // Routine symptoms
        else {
          canHandleSymptom = true; // Most providers can handle routine issues
          relevanceScore = 5;
          
          // Boost score for primary care
          if (providerType.includes('primary') || specialty.includes('family')) {
            relevanceScore = 7;
          }
        }
      }
      
      return {
        ...provider,
        canHandleSymptom,
        relevanceScore,
        recommendedFor: urgency || 'routine'
      };
    }).sort((a, b) => b.relevanceScore - a.relevanceScore);
  }
}

// Additional helper: Provider enrichment with better data
export class ProviderEnrichment {
  // Known urgent care chains and their variations
  static URGENT_CARE_CHAINS = [
    { name: 'CityMD', type: 'Urgent Care', hours: '8am-8pm', walkIns: true },
    { name: 'MedExpress', type: 'Urgent Care', hours: '8am-8pm', walkIns: true },
    { name: 'MinuteClinic', type: 'Retail Clinic', hours: '9am-7pm', walkIns: true },
    { name: 'NextCare', type: 'Urgent Care', hours: '8am-8pm', walkIns: true },
    { name: 'AFC Urgent Care', type: 'Urgent Care', hours: '8am-8pm', walkIns: true },
    { name: 'GoHealth', type: 'Urgent Care', hours: '8am-8pm', walkIns: true },
    { name: 'CareNow', type: 'Urgent Care', hours: '7am-9pm', walkIns: true },
    { name: 'Concentra', type: 'Urgent Care', hours: '8am-5pm', walkIns: true },
  ];
  
  static enrichProvider(provider: any): any {
    const name = provider.name?.toLowerCase() || '';
    
    // Check if it's a known chain
    const chain = this.URGENT_CARE_CHAINS.find(c => 
      name.includes(c.name.toLowerCase())
    );
    
    if (chain) {
      return {
        ...provider,
        type: chain.type,
        hours: provider.hours || chain.hours,
        acceptsWalkIns: chain.walkIns,
        isChain: true,
        chainName: chain.name
      };
    }
    
    // Try to infer type from name/taxonomy
    if (name.includes('urgent') || name.includes('walk-in')) {
      provider.type = 'Urgent Care';
      provider.acceptsWalkIns = true;
    } else if (name.includes('emergency') || name.includes('hospital')) {
      provider.type = 'Emergency Room';
      provider.hours = '24/7';
    }
    
    return provider;
  }
}