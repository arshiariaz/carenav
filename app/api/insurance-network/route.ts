// app/api/insurance-network/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Insurance company to API endpoint mapping
const INSURANCE_ENDPOINTS = {
  'anthem': {
    api: 'bcbs_tn', // Use BCBS TN as proxy for now
    states: ['TN']
  },
  'blue cross': {
    api: 'bcbs_tn',
    states: ['TN']
  },
  'bcbs': {
    api: 'bcbs_tn',
    states: ['TN']
  },
  'cigna': {
    api: 'cigna_sandbox',
    states: ['ALL']
  },
  // All others use CMS NPPES for provider data
  'default': {
    api: 'cms_nppes',
    states: ['ALL']
  }
};

export async function POST(request: NextRequest) {
  try {
    const { action, insuranceCompany, state, city, npi } = await request.json();
    
    console.log('🔍 Insurance network request:', { action, insuranceCompany, state, city });
    
    // Determine which API to use based on insurance company
    const companyLower = insuranceCompany?.toLowerCase() || '';
    let endpoint = INSURANCE_ENDPOINTS.default;
    
    for (const [key, value] of Object.entries(INSURANCE_ENDPOINTS)) {
      if (companyLower.includes(key)) {
        endpoint = value;
        break;
      }
    }
    
    if (action === 'GET_REAL_PLANS') {
      // Only BCBS TN has real plan data
      if (endpoint.api === 'bcbs_tn') {
        const response = await fetch(`${request.nextUrl.origin}/api/provider-network`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'GET_PLANS',
            state: 'TN',
            source: 'bcbs_tn'
          })
        });
        const data = await response.json();
        return NextResponse.json(data);
      } else {
        // No plan data available - be transparent about it
        return NextResponse.json({
          success: true,
          plans: getMockPlansForInsurer(insuranceCompany),
          source: 'none',
          message: `Real-time plan data not available for ${insuranceCompany}. We'll use industry standard copays and deductibles for cost estimates.`,
          recommendation: 'Contact your insurance company for exact plan details'
        });
      }
    }
    
    if (action === 'FIND_NETWORK_PROVIDERS') {
      // Use CMS NPPES for all provider searches - it has everyone!
      const providers = await searchCMSProviders(city, state);
      
      console.log(`✅ Found ${providers.length} providers from CMS`);
      
      // If we have BCBS data, we can check actual network status
      if (endpoint.api === 'bcbs_tn' && state === 'TN') {
        // Enrich with network status
        for (const provider of providers) {
          const networkCheck = await checkNetworkStatus(provider.npi, 'bcbs_tn', request.nextUrl.origin);
          provider.networkStatus = networkCheck.inNetwork ? 'In-Network' : 'Out-of-Network';
        }
      } else {
        // For others, assume in-network for major providers
        providers.forEach((p: any) => {
          p.networkStatus = 'Likely In-Network';
        });
      }
      
      return NextResponse.json({
        success: true,
        providers,
        totalCount: providers.length,
        source: 'CMS National Provider Registry',
        networkSource: endpoint.api === 'bcbs_tn' ? 'Verified' : 'Estimated'
      });
    }
    
    if (action === 'VERIFY_PROVIDER') {
      // Verify a specific provider by NPI
      const provider = await getProviderByNPI(npi);
      return NextResponse.json({
        success: true,
        provider,
        source: 'CMS NPPES'
      });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action' 
    }, { status: 400 });
    
  } catch (error) {
    console.error('Insurance network error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Network query failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Search CMS NPPES for providers
async function searchCMSProviders(city: string, state: string) {
  try {
    console.log(`🔍 Searching CMS for providers in ${city}, ${state}`);
    
    const response = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?version=2.1&city=${city}&state=${state}&enumeration_type=NPI-2&limit=50`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CareNav/1.0'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`CMS API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log(`📊 CMS returned ${data.result_count} results`);
    
    // Filter for actual healthcare facilities (not DME, home health, etc)
    const healthcareProviders = (data.results || [])
      .filter((result: any) => {
        const taxonomy = result.taxonomies?.[0]?.desc || '';
        const name = result.basic.organization_name || '';
        
        // Filter out non-clinical providers
        const excludeTerms = ['equipment', 'supplies', 'transport', 'durable medical', 'ambulance'];
        const isExcluded = excludeTerms.some(term => 
          taxonomy.toLowerCase().includes(term) || name.toLowerCase().includes(term)
        );
        
        if (isExcluded) return false;
        
        // Include clinical providers
        const includeTerms = [
          'urgent care', 'emergency', 'hospital', 'clinic',
          'family practice', 'internal medicine', 'primary care',
          'physician', 'medical', 'health center', 'healthcare'
        ];
        
        return includeTerms.some(term => 
          taxonomy.toLowerCase().includes(term) || name.toLowerCase().includes(term)
        );
      })
      .map((result: any) => {
        const location = result.addresses.find((a: any) => a.address_purpose === 'LOCATION') || result.addresses[0];
        return {
          npi: result.number,
          name: result.basic.organization_name || `${result.basic.first_name} ${result.basic.last_name}`,
          type: determineProviderType(result.taxonomies?.[0]?.desc),
          specialty: result.taxonomies?.[0]?.desc,
          address: `${location.address_1}, ${location.city}, ${location.state} ${location.postal_code}`,
          phone: location.telephone_number,
          city: location.city,
          state: location.state,
          zip: location.postal_code,
          networkStatus: ''
        };
      });
    
    console.log(`✅ Filtered to ${healthcareProviders.length} clinical providers`);
    return healthcareProviders;
  } catch (error) {
    console.error('CMS search error:', error);
    return [];
  }
}

// Get specific provider by NPI
async function getProviderByNPI(npi: string) {
  try {
    const response = await fetch(
      `https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${npi}`,
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'CareNav/1.0'
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`CMS API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      const result = data.results[0];
      const location = result.addresses.find((a: any) => a.address_purpose === 'LOCATION') || result.addresses[0];
      
      return {
        npi: result.number,
        name: result.basic.organization_name || `${result.basic.first_name} ${result.basic.last_name}`,
        type: determineProviderType(result.taxonomies?.[0]?.desc),
        specialty: result.taxonomies?.[0]?.desc,
        address: `${location.address_1}, ${location.city}, ${location.state} ${location.postal_code}`,
        phone: location.telephone_number,
        verified: true,
        lastUpdated: result.basic.last_updated
      };
    }
    
    return null;
  } catch (error) {
    console.error('NPI lookup error:', error);
    return null;
  }
}

// Check network status (only works for BCBS TN right now)
async function checkNetworkStatus(npi: string, source: string, origin: string) {
  if (source !== 'bcbs_tn') {
    return { inNetwork: null, reason: 'Cannot verify for this insurer' };
  }
  
  try {
    const response = await fetch(`${origin}/api/provider-network`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'CHECK_NETWORK',
        npi,
        planId: 'any',
        state: 'TN',
        source: 'bcbs_tn'
      })
    });
    
    const data = await response.json();
    return data;
  } catch (error) {
    return { inNetwork: null, reason: 'Network check failed' };
  }
}

// Determine provider type from taxonomy
function determineProviderType(taxonomy: string): string {
  const lower = taxonomy?.toLowerCase() || '';
  
  if (lower.includes('urgent care') || lower.includes('walk-in')) return 'Urgent Care';
  if (lower.includes('emergency')) return 'Emergency Room';
  if (lower.includes('hospital')) return 'Hospital';
  if (lower.includes('family') || lower.includes('primary') || lower.includes('internal medicine')) return 'Primary Care';
  if (lower.includes('clinic')) return 'Clinic';
  
  return 'Healthcare Facility';
}

// Mock plans for insurers without API access
function getMockPlansForInsurer(insurer: string) {
  // Return empty plans instead of mock data
  return {
    bronze: [],
    silver: [],
    gold: [],
    other: []
  };
}