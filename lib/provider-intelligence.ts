// lib/provider-intelligence.ts
import { BigQuery } from '@google-cloud/bigquery';

interface NPIProvider {
  npi: string;
  name: string;
  practice_name?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  specialty: string;
  taxonomy_description?: string;
  lat?: number;
  lng?: number;
  place_id?: string;
}

interface NPISearchResult {
  result_count: number;
  results: NPIResult[];
}

interface NPIResult {
  number: string;
  basic: {
    first_name?: string;
    last_name?: string;
    organization_name?: string;
    authorized_official_first_name?: string;
    authorized_official_last_name?: string;
  };
  addresses: Array<{
    address_purpose: string;
    address_1: string;
    address_2?: string;
    city: string;
    state: string;
    postal_code: string;
    telephone_number?: string;
  }>;
  taxonomies: Array<{
    code: string;
    desc: string;
    primary: boolean;
    state?: string;
    license?: string;
  }>;
}

// Search NPI Registry API (FREE!)
export async function searchNPIRegistry(
  city: string,
  state: string,
  taxonomy?: string,
  organizationName?: string
): Promise<NPIProvider[]> {
  const baseUrl = 'https://npiregistry.cms.hhs.gov/api/?version=2.1';
  
  const params = new URLSearchParams({
    city,
    state,
    enumeration_type: 'NPI-2', // Organizations only
    limit: '200',
    ...(taxonomy && { taxonomy_description: taxonomy }),
    ...(organizationName && { organization_name: organizationName })
  });
  
  try {
    const response = await fetch(`${baseUrl}&${params}`);
    const data: NPISearchResult = await response.json();
    
    if (!data.results) return [];
    
    return data.results.map(result => {
      const primaryAddress = result.addresses.find(a => a.address_purpose === 'LOCATION') || result.addresses[0];
      const primaryTaxonomy = result.taxonomies.find(t => t.primary) || result.taxonomies[0];
      
      return {
        npi: result.number,
        name: result.basic.organization_name || `${result.basic.first_name} ${result.basic.last_name}`,
        practice_name: result.basic.organization_name,
        address: primaryAddress.address_1,
        city: primaryAddress.city,
        state: primaryAddress.state,
        zip: primaryAddress.postal_code,
        phone: primaryAddress.telephone_number || '',
        specialty: primaryTaxonomy?.desc || 'General',
        taxonomy_description: primaryTaxonomy?.desc
      };
    });
  } catch (error) {
    console.error('NPI API search failed:', error);
    return [];
  }
}

// Search for urgent care and ER providers near user
export async function findLocalProviders(
  userCity: string,
  userState: string,
  careType: 'urgent' | 'emergency' | 'primary'
): Promise<NPIProvider[]> {
  const taxonomyMap = {
    urgent: ['Urgent Care', 'Walk-in', 'Convenient Care'],
    emergency: ['Emergency Medicine', 'Emergency Room'],
    primary: ['Family Practice', 'Internal Medicine', 'General Practice']
  };
  
  const providers: NPIProvider[] = [];
  
  // Search for each relevant taxonomy
  for (const taxonomy of taxonomyMap[careType]) {
    const results = await searchNPIRegistry(userCity, userState, taxonomy);
    providers.push(...results);
    
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Remove duplicates by NPI
  const uniqueProviders = Array.from(
    new Map(providers.map(p => [p.npi, p])).values()
  );
  
  return uniqueProviders;
}

// Match providers with MRF rates from BigQuery
export async function matchProvidersWithRates(
  providers: NPIProvider[],
  cptCodes: string[],
  planId: string
): Promise<any[]> {
  if (providers.length === 0) return [];
  
  const bigquery = new BigQuery();
  const npis = providers.map(p => p.npi);
  
  const query = `
    WITH provider_rates AS (
      SELECT 
        provider_npi as npi,
        billing_code,
        AVG(negotiated_rate) as avg_rate,
        MIN(negotiated_rate) as min_rate,
        MAX(negotiated_rate) as max_rate,
        COUNT(*) as rate_count
      FROM \`carenav-health.insurance_rates.bcbs_rates\`
      WHERE provider_npi IN UNNEST(@npis)
        AND billing_code IN UNNEST(@cptCodes)
        AND provider_state = @state
      GROUP BY provider_npi, billing_code
    )
    SELECT 
      npi,
      ARRAY_AGG(
        STRUCT(
          billing_code,
          avg_rate,
          min_rate,
          max_rate
        )
      ) as rates
    FROM provider_rates
    GROUP BY npi
  `;
  
  try {
    const options = {
      query,
      params: {
        npis,
        cptCodes,
        state: providers[0]?.state || 'TX'
      }
    };
    
    const [rows] = await bigquery.query(options);
    
    // Merge rates with provider info
    const rateMap = new Map(rows.map((r: any) => [r.npi, r.rates]));
    
    return providers.map(provider => ({
      ...provider,
      rates: rateMap.get(provider.npi) || [],
      hasRealRates: rateMap.has(provider.npi)
    }));
  } catch (error) {
    console.error('Failed to match rates:', error);
    // Return providers without rates
    return providers.map(p => ({ ...p, rates: [], hasRealRates: false }));
  }
}

// Cost-efficient provider search workflow
export async function getCostEfficientProviders(
  symptom: string,
  cptCodes: string[],
  userCity: string = 'Houston',
  userState: string = 'TX',
  urgency: string = 'routine'
): Promise<any[]> {
  console.log('🔍 Searching for providers via FREE NPI API...');
  
  // Determine care type based on urgency
  const careType = urgency === 'emergency' ? 'emergency' : 
                   urgency === 'urgent' ? 'urgent' : 'primary';
  
  // 1. Search NPI Registry (FREE!)
  const providers = await findLocalProviders(userCity, userState, careType);
  console.log(`Found ${providers.length} providers via NPI API`);
  
  if (providers.length === 0) {
    // Fallback to broader search
    const broadResults = await searchNPIRegistry(userCity, userState);
    providers.push(...broadResults.slice(0, 20));
  }
  
  // 2. Match with MRF rates if available
  const providersWithRates = await matchProvidersWithRates(
    providers.slice(0, 20), // Limit to top 20 to reduce BigQuery costs
    cptCodes,
    'plan_anthem_hmo' // TODO: Use actual plan ID
  );
  
  // 3. Calculate estimated costs
  return providersWithRates.map(provider => {
    let totalCost = 0;
    let hasRealPricing = false;
    
    if (provider.rates && provider.rates.length > 0) {
      // Use real MRF rates
      totalCost = provider.rates.reduce((sum: number, rate: any) => 
        sum + (rate.avg_rate || 0), 0
      );
      hasRealPricing = true;
    } else {
      // Use estimates based on care type
      const estimates: Record<string, number> = {
        emergency: 1500,
        urgent: 150,
        primary: 125
      };
      totalCost = estimates[careType] || 200;
    }
    
    // Calculate patient responsibility (simplified)
    const patientCost = careType === 'emergency' ? 350 : // ER copay
                       careType === 'urgent' ? 75 :     // Urgent care copay
                       25;                              // PCP copay
    
    return {
      ...provider,
      careType,
      totalCost: Math.round(totalCost),
      estimatedPatientCost: patientCost,
      insurancePays: Math.round(totalCost - patientCost),
      dataSource: hasRealPricing ? 'MRF Data' : 'Estimated',
      costNote: hasRealPricing ? 'Based on negotiated rates' : 'Estimated cost'
    };
  }).sort((a, b) => a.estimatedPatientCost - b.estimatedPatientCost);
}

// Export for use in API routes
export default {
  searchNPIRegistry,
  findLocalProviders,
  matchProvidersWithRates,
  getCostEfficientProviders
};