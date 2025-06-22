// app/api/provider-network/route.ts
import { NextRequest, NextResponse } from 'next/server';

// Working FHIR endpoints (tested and confirmed!)
interface Endpoint {
  name: string;
  baseUrl: string;
  requiresAuth: boolean;
  states: string[];
  active: boolean;
  insurers?: string[]; // Which insurance companies this endpoint serves
}

const WORKING_ENDPOINTS: Record<string, Endpoint> = {
  bcbs_tn: {
    name: 'BCBS Tennessee',
    baseUrl: 'https://api.bcbst.com/fhir/r4',
    requiresAuth: false,
    states: ['TN', 'MS', 'AR'], // BCBS TN covers multiple states
    active: true,
    insurers: ['bcbs', 'anthem', 'blue cross', 'bluecross']
  },
  bcbs_nc: {
    name: 'BCBS North Carolina',
    baseUrl: 'https://api.bcbsnc.com/fhir/r4',
    requiresAuth: false,
    states: ['NC', 'SC'],
    active: false, // Set to true once tested
    insurers: ['bcbs', 'blue cross', 'bluecross']
  },
  bcbs_mi: {
    name: 'BCBS Michigan',
    baseUrl: 'https://api.bcbsm.com/fhir/r4',
    requiresAuth: false,
    states: ['MI'],
    active: false, // Set to true once tested
    insurers: ['bcbs', 'blue cross', 'bluecross']
  },
  bcbs_il: {
    name: 'BCBS Illinois',
    baseUrl: 'https://api.bcbsil.com/fhir/r4',
    requiresAuth: false,
    states: ['IL', 'MT', 'NM', 'OK', 'TX'], // HCSC states
    active: false, // Set to true once tested
    insurers: ['bcbs', 'blue cross', 'bluecross']
  },
  cigna_sandbox: {
    name: 'Cigna Sandbox',
    baseUrl: 'https://fhir.cigna.com/ProviderDirectory/v1-devportal',
    requiresAuth: false,
    states: ['ALL'],
    active: true,
    insurers: ['cigna']
  },
  cms_nppes: {
    name: 'CMS NPPES Registry',
    baseUrl: 'https://npiregistry.cms.hhs.gov/api',
    requiresAuth: false,
    states: ['ALL'],
    active: true,
    insurers: ['ALL'] // Fallback for all insurers
  }
};

// Enhanced insurer mapping with multiple possible names
const INSURER_MAPPINGS: Record<string, string[]> = {
  'anthem': ['anthem', 'elevance', 'empire', 'wellpoint'],
  'bcbs': ['blue cross', 'bluecross', 'blue shield', 'blueshield', 'bcbs', 'carefirst', 'highmark', 'independence', 'premera'],
  'united': ['united', 'uhc', 'unitedhealthcare', 'optum'],
  'cigna': ['cigna'],
  'aetna': ['aetna', 'cvs'],
  'humana': ['humana'],
  'kaiser': ['kaiser', 'kp', 'kaiser permanente'],
  'centene': ['centene', 'wellcare', 'ambetter', 'healthnet'],
  'molina': ['molina'],
  'medicare': ['medicare', 'cms'],
  'medicaid': ['medicaid']
};

// Helper to select the best endpoint for a state and insurer
function selectEndpoint(state: string, insurerName?: string): Endpoint | null {
  const normalizedInsurer = insurerName?.toLowerCase() || '';
  
  // First, try to find insurer-specific endpoints in the requested state
  if (insurerName) {
    // Check which insurer family this belongs to
    let insurerFamily = 'unknown';
    for (const [family, variants] of Object.entries(INSURER_MAPPINGS)) {
      if (variants.some(variant => normalizedInsurer.includes(variant))) {
        insurerFamily = family;
        break;
      }
    }
    
    // Find endpoints that serve this insurer in this state
    const matchingEndpoints = Object.values(WORKING_ENDPOINTS).filter(
      ep => ep.active && 
           (ep.states.includes(state) || ep.states.includes('ALL')) &&
           (ep.insurers?.includes('ALL') || 
            ep.insurers?.some(ins => normalizedInsurer.includes(ins)) ||
            (insurerFamily === 'bcbs' && ep.insurers?.some(ins => ins.includes('bcbs'))))
    );
    
    // Prefer specific state endpoints over ALL
    const stateSpecific = matchingEndpoints.filter(ep => ep.states.includes(state));
    if (stateSpecific.length > 0) {
      return stateSpecific[0];
    }
    
    if (matchingEndpoints.length > 0) {
      return matchingEndpoints[0];
    }
  }
  
  // Fallback to CMS NPPES which works for everyone
  return WORKING_ENDPOINTS.cms_nppes;
}

export async function POST(request: NextRequest) {
  try {
    const { action, npi, providerName, planId, state = 'TN', source, insurerName } = await request.json();
    
    // Allow specific source selection or auto-select based on insurer and state
    const endpoint = source && source in WORKING_ENDPOINTS 
      ? WORKING_ENDPOINTS[source as keyof typeof WORKING_ENDPOINTS] 
      : selectEndpoint(state, insurerName);
    
    if (!endpoint) {
      return NextResponse.json({ 
        success: false, 
        error: 'No available endpoint for this state' 
      }, { status: 400 });
    }
    
    console.log(`📡 Using ${endpoint.name} for ${insurerName || 'unknown insurer'} in ${state}`);
    
    if (action === 'CHECK_NETWORK') {
      // Check if a provider (by NPI) is in-network
      return await checkProviderNetwork(npi, planId, state, endpoint);
    } else if (action === 'FIND_PROVIDERS') {
      // Find providers by name or specialty
      return await findProviders(providerName, state, endpoint);
    } else if (action === 'GET_PLANS') {
      // Get available plans
      return await getInsurancePlans(state, endpoint, insurerName);
    } else if (action === 'TEST_ENDPOINT') {
      // Test if an endpoint is working
      return await testEndpoint(endpoint);
    } else if (action === 'LIST_ENDPOINTS') {
      // List all available endpoints for debugging
      return NextResponse.json({
        success: true,
        endpoints: Object.entries(WORKING_ENDPOINTS).map(([key, ep]) => ({
          key,
          ...ep,
          status: ep.active ? 'Active' : 'Inactive'
        }))
      });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: 'Invalid action' 
    }, { status: 400 });
    
  } catch (error) {
    console.error('Provider network API error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to query provider network' 
    }, { status: 500 });
  }
}

async function checkProviderNetwork(npi: string, planId: string, state: string, endpoint: Endpoint) {
  try {
    // First, find the provider by NPI
    const practitionerUrl = `${endpoint.baseUrl}/Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|${npi}`;
    const practitionerResponse = await fetch(practitionerUrl, {
      headers: { 'Accept': 'application/fhir+json' }
    });
    
    const practitionerData = await practitionerResponse.json();
    
    if (!practitionerData.entry || practitionerData.entry.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'Provider not found in network',
        inNetwork: false
      });
    }
    
    const practitioner = practitionerData.entry[0].resource;
    
    // Get the practitioner's roles to find network affiliations
    const roleUrl = `${endpoint.baseUrl}/PractitionerRole?practitioner=Practitioner/${practitioner.id}`;
    const roleResponse = await fetch(roleUrl, {
      headers: { 'Accept': 'application/fhir+json' }
    });
    
    const roleData = await roleResponse.json();
    
    // Check if any roles are associated with the requested plan
    let inNetwork = false;
    const networks: string[] = [];
    
    if (roleData.entry) {
      for (const entry of roleData.entry) {
        const role = entry.resource;
        // Check network references
        if (role.network) {
          role.network.forEach((net: any) => {
            networks.push(net.reference);
            if (net.reference.includes(planId)) {
              inNetwork = true;
            }
          });
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      inNetwork,
      provider: {
        npi,
        name: formatProviderName(practitioner),
        specialty: practitioner.qualification?.[0]?.code?.coding?.[0]?.display
      },
      networks,
      source: endpoint.name
    });
    
  } catch (error) {
    console.error('Network check error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check network status'
    }, { status: 500 });
  }
}

async function findProviders(searchTerm: string, state: string, endpoint: Endpoint) {
  try {
    // Special handling for CMS NPPES
    if (endpoint.name === 'CMS NPPES Registry') {
      const nppesUrl = `${endpoint.baseUrl}/?version=2.1&state=${state}&city=${searchTerm}&enumeration_type=NPI-1&limit=10`;
      const response = await fetch(nppesUrl);
      const data = await response.json();
      
      const providers = (data.results || []).map((result: any) => ({
        id: result.number,
        npi: result.number,
        name: result.basic.first_name ? 
          `${result.basic.first_name} ${result.basic.last_name}` : 
          result.basic.organization_name,
        specialty: result.taxonomies?.[0]?.desc || 'Healthcare Provider',
        phone: result.addresses?.[0]?.telephone_number || 'N/A',
        address: result.addresses?.[0] ? 
          `${result.addresses[0].address_1}, ${result.addresses[0].city}, ${result.addresses[0].state} ${result.addresses[0].postal_code}` : 
          'Address not available'
      }));
      
      return NextResponse.json({
        success: true,
        totalResults: data.result_count || providers.length,
        providers,
        source: endpoint.name
      });
    }
    
    // Regular FHIR handling
    const searchUrl = `${endpoint.baseUrl}/Practitioner?name=${encodeURIComponent(searchTerm)}&_count=10`;
    const response = await fetch(searchUrl, {
      headers: { 'Accept': 'application/fhir+json' }
    });
    
    const data = await response.json();
    
    const providers = (data.entry || []).map((entry: any) => {
      const practitioner = entry.resource;
      return {
        id: practitioner.id,
        npi: practitioner.identifier?.find((id: any) => 
          id.system === 'http://hl7.org/fhir/sid/us-npi'
        )?.value,
        name: formatProviderName(practitioner),
        specialty: practitioner.qualification?.[0]?.code?.coding?.[0]?.display,
        phone: practitioner.telecom?.find((t: any) => t.system === 'phone')?.value
      };
    });
    
    return NextResponse.json({
      success: true,
      totalResults: data.total || providers.length,
      providers,
      source: endpoint.name
    });
    
  } catch (error) {
    console.error('Provider search error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to search providers'
    }, { status: 500 });
  }
}

async function getInsurancePlans(state: string, endpoint: Endpoint, insurerName?: string) {
  try {
    // Special handling for CMS NPPES (doesn't have insurance plans)
    if (endpoint.name === 'CMS NPPES Registry') {
      return NextResponse.json({
        success: true,
        totalPlans: 0,
        plans: { bronze: [], silver: [], gold: [], other: [] },
        source: endpoint.name,
        note: 'CMS NPPES does not provide insurance plan data - only provider data',
        recommendation: 'Use BCBS or insurer-specific APIs for plan data'
      });
    }
    
    // Get insurance plans
    const plansUrl = `${endpoint.baseUrl}/InsurancePlan?_count=50`;
    const response = await fetch(plansUrl, {
      headers: { 'Accept': 'application/fhir+json' },
      signal: AbortSignal.timeout(10000)
    });
    
    const data = await response.json();
    
    // If it's Cigna and returns empty, provide a helpful message
    if (endpoint.name.includes('Cigna') && (!data.entry || data.entry.length === 0)) {
      return NextResponse.json({
        success: true,
        totalPlans: 0,
        plans: { bronze: [], silver: [], gold: [], other: [] },
        source: endpoint.name,
        note: 'Cigna sandbox API does not contain insurance plan data. Production API requires registration.',
        recommendation: 'Contact Cigna developer portal for production access'
      });
    }
    
    const plans = (data.entry || []).map((entry: any) => {
      const plan = entry.resource;
      return {
        id: plan.id,
        planId: plan.identifier?.[0]?.value,
        name: plan.name,
        period: plan.period,
        networks: plan.network?.map((net: any) => net.reference) || [],
        type: extractPlanType(plan.name),
        issuer: insurerName || endpoint.name.split(' ')[0]
      };
    });
    
    // Group by plan type with proper typing
    const groupedPlans = {
      bronze: plans.filter((p: any) => p.type === 'Bronze'),
      silver: plans.filter((p: any) => p.type === 'Silver'),
      gold: plans.filter((p: any) => p.type === 'Gold'),
      other: plans.filter((p: any) => !['Bronze', 'Silver', 'Gold'].includes(p.type))
    };
    
    return NextResponse.json({
      success: true,
      totalPlans: data.total || plans.length,
      plans: groupedPlans,
      source: endpoint.name,
      note: `Real insurance plan data from ${endpoint.name}`,
      endpoint: endpoint.baseUrl
    });
    
  } catch (error) {
    console.error('Plan search error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch plans',
      source: endpoint.name
    }, { status: 500 });
  }
}

// New function to test endpoints
async function testEndpoint(endpoint: Endpoint) {
  try {
    const testUrl = `${endpoint.baseUrl}/InsurancePlan?_count=1`;
    const response = await fetch(testUrl, {
      headers: { 'Accept': 'application/fhir+json' },
      signal: AbortSignal.timeout(5000)
    });
    
    if (response.ok) {
      const data = await response.json();
      return NextResponse.json({
        success: true,
        endpoint: endpoint.name,
        status: response.status,
        hasData: !!(data.entry?.length || data.total)
      });
    } else {
      return NextResponse.json({
        success: false,
        endpoint: endpoint.name,
        status: response.status
      });
    }
  } catch (error) {
    return NextResponse.json({
      success: false,
      endpoint: endpoint.name,
      error: 'Connection failed'
    });
  }
}

// Helper functions
function formatProviderName(practitioner: any): string {
  if (practitioner.name && practitioner.name[0]) {
    const name = practitioner.name[0];
    const given = name.given?.join(' ') || '';
    const family = name.family || '';
    return `${given} ${family}`.trim() || 'Unknown Provider';
  }
  return 'Unknown Provider';
}

function extractPlanType(planName: string): string {
  if (planName.toLowerCase().includes('bronze')) return 'Bronze';
  if (planName.toLowerCase().includes('silver')) return 'Silver';
  if (planName.toLowerCase().includes('gold')) return 'Gold';
  if (planName.toLowerCase().includes('platinum')) return 'Platinum';
  return 'Other';
}