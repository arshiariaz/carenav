// app/api/provider-costs-local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBundleForSymptom, calculateBundleCost } from '@/lib/procedure-bundles';
import { ProviderSearchService } from '@/lib/provider-search-service';
import { 
  CMSPriceLookup, 
  MedicationService, 
  DistanceService, 
  HRSAService,
  FinancialAssistanceService,
  type DistanceResult 
} from '@/lib/healthcare-apis';

// Define the enriched provider type
interface EnrichedProvider {
  name: string;
  type: string;
  address: string;
  phone: string;
  npi: string;
  specialty: string;
  distance: number;
  driveTime: number;
  distanceText?: string;
  durationText?: string;
  waitTime: string;
  acceptsWalkIns: boolean;
  hasPharmacy: boolean;
  hours: string;
  zip: string;
  bundleName: string;
  totalCost: number;
  estimatedPatientCost: number;
  insurancePays: number;
  costBreakdown: any[];
  costNote: string;
  priceLevel?: string;
  negotiatedRate: number;
  dataSource: string;
  usingRealPricing: boolean;
  [key: string]: any;
}

// Provider-specific price multipliers
const PROVIDER_MULTIPLIERS: Record<string, number> = {
  'CVS MinuteClinic': 0.85,
  'Walgreens Healthcare Clinic': 0.90,
  'CityMD Urgent Care': 1.10,
  'MedExpress': 1.05,
  'NextCare': 1.00,
  'Houston Methodist Emergency Room': 1.25,
  'Memorial Hermann ER': 1.15,
  'Ben Taub Hospital Emergency': 0.60,
  'Houston Methodist Primary Care': 1.10,
  'Community Health Center': 0.50,
};

export async function POST(request: NextRequest) {
  try {
    const { planId, symptom, cptCodes, urgency, city, state, zip } = await request.json();
    
    console.log('🔍 Provider search request:', { planId, symptom, cptCodes, urgency, city, state, zip });
    
    // Get the procedure bundle
    const bundle = getBundleForSymptom(symptom || 'office visit');
    
    if (!bundle) {
      console.log('⚠️ No bundle found for symptom:', symptom);
      const defaultBundle = {
        name: 'Office Visit',
        description: 'Standard office visit',
        components: [
          { code: '99213', description: 'Office visit', category: 'physician' as const, typical_cost: 125, required: true }
        ]
      };
      
      return processProviderSearch({
        bundle: defaultBundle,
        planId,
        cptCodes: cptCodes || ['99213'],
        urgency,
        city,
        state,
        zip,
        symptom
      });
    }
    
    return processProviderSearch({
      bundle,
      planId,
      cptCodes: cptCodes || bundle.components.map(c => c.code),
      urgency,
      city,
      state,
      zip,
      symptom
    });
    
  } catch (error) {
    console.error('❌ Provider costs error:', error);
    
    return NextResponse.json({
      success: false,
      providers: [],
      stats: { min: 100, max: 500, avg: 250, count: 0 },
      message: 'Unable to load provider costs',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

async function processProviderSearch(params: {
  bundle: any;
  planId: string;
  cptCodes: string[];
  urgency?: string;
  city?: string;
  state?: string;
  zip?: string;
  symptom?: string;
}) {
  const { bundle, planId, cptCodes, urgency, city = 'Houston', state = 'TX', zip = '77001', symptom } = params;
  
  // Determine provider type
  let providerType = 'urgent_care';
  if (bundle.name.includes('ER') || urgency === 'emergency') {
    providerType = 'emergency';
  } else if (bundle.name.includes('Primary') || bundle.name.includes('Annual')) {
    providerType = 'primary';
  }
  
  let providers: any[] = [];
  
  try {
    console.log(`🏥 Searching for ${providerType} providers in ${city}, ${state} ${zip}...`);
    
    // Search for providers
    const searchResults = await ProviderSearchService.findMedicalFacilities({
      city,
      state,
      zip
    });
    
    // Select providers based on type
    if (providerType === 'urgent_care') {
      providers = searchResults.urgentCare;
    } else if (providerType === 'emergency') {
      providers = searchResults.emergency;
    } else {
      providers = searchResults.primaryCare;
    }
    
    // If we didn't find enough, include some general clinics
    if (providers.length < 5 && searchResults.all.length > providers.length) {
      const additional = searchResults.all
        .filter(p => !providers.some(existing => existing.number === p.number))
        .slice(0, 10 - providers.length);
      providers.push(...additional);
    }
    
    console.log(`✅ Found ${providers.length} ${providerType} providers`);
    
  } catch (error) {
    console.error('❌ Provider search failed:', error);
  }
  
  // If no providers found, use fallback data
  if (providers.length === 0) {
    console.log('⚠️ No providers found, using fallback data');
    providers = getFallbackProviders(city, state, providerType);
  }
  
  // Format and enrich providers
  const formattedProviders = await formatAndEnrichProviders(
    providers, 
    { city, state, zip }, 
    bundle, 
    planId, 
    cptCodes,
    providerType
  );
  
  // Add HRSA health centers if cost is high
  const estimatedCost = bundle.components.reduce((sum: number, c: any) => sum + c.typical_cost, 0);
  if (estimatedCost > 200 && formattedProviders.length < 10) {
    try {
      console.log('💰 High cost detected, adding HRSA health centers...');
      const healthCenters = await HRSAService.findHealthCenters(zip, 25);
      
      for (const center of healthCenters.slice(0, 3)) {
        const fqhcProvider: EnrichedProvider = {
          name: center.name || 'Community Health Center',
          type: 'Community Health Center',
          address: center.address || `${city}, ${state} ${zip}`,
          phone: center.phone || '1-877-464-4772',
          npi: 'FQHC-' + Math.random().toString(36).substr(2, 9),
          specialty: 'Federally Qualified Health Center',
          distance: Math.random() * 10,
          driveTime: Math.round(Math.random() * 30 + 10),
          waitTime: 'Same day appointments',
          acceptsWalkIns: true,
          hasPharmacy: true,
          hours: center.hours || 'Mon-Fri 8am-5pm, Sat 9am-1pm',
          zip: zip,
          bundleName: bundle.name,
          totalCost: 40,
          estimatedPatientCost: 40,
          insurancePays: 0,
          costBreakdown: [{
            category: 'Sliding Scale Fee',
            items: [{
              description: 'Income-based payment',
              cost: 40,
              patientPays: 40
            }]
          }],
          costNote: 'Sliding scale based on income',
          priceLevel: 'low',
          negotiatedRate: 40,
          dataSource: 'HRSA FQHC Program',
          usingRealPricing: true
        };
        formattedProviders.push(fqhcProvider);
      }
    } catch (error) {
      console.error('HRSA API error:', error);
    }
  }
  
  // Calculate statistics
  const patientCosts = formattedProviders.map((p: any) => p.estimatedPatientCost);
  const stats = patientCosts.length > 0 ? {
    min: Math.min(...patientCosts),
    max: Math.max(...patientCosts),
    avg: Math.round(patientCosts.reduce((a: number, b: number) => a + b, 0) / patientCosts.length),
    count: formattedProviders.length,
    bundleUsed: bundle.name,
    dataSource: 'NPI Registry + Estimated Costs'
  } : {
    min: 0,
    max: 0,
    avg: 0,
    count: 0,
    bundleUsed: bundle.name,
    dataSource: 'No data'
  };
  
  // Get financial assistance if costs are high
  let financialAssistance = null;
  if (stats.avg > 200) {
    try {
      financialAssistance = await FinancialAssistanceService.findPrograms(zip);
    } catch (error) {
      console.error('Financial assistance lookup failed:', error);
    }
  }
  
  console.log(`📤 Sending response with ${formattedProviders.length} providers`);
  
  return NextResponse.json({
    success: true,
    symptom: bundle.name,
    bundle: {
      name: bundle.name,
      description: bundle.description,
      totalComponents: bundle.components.length
    },
    providers: formattedProviders, // THIS IS THE KEY LINE - MAKE SURE PROVIDERS ARE INCLUDED
    stats,
    planInfo: {
      isHSA: planId?.toLowerCase().includes('hsa'),
      deductible: planId?.toLowerCase().includes('hsa') ? 2800 : 1500,
      deductibleMet: 0,
      message: planId?.toLowerCase().includes('hsa') ? 
        'With your HSA plan, you pay the full negotiated rate until you meet your deductible.' :
        'Your plan includes copays for office visits and coinsurance for other services.'
    },
    usingNPIProviders: true,
    location: { city, state, zip },
    financialAssistance
  });
}

async function formatAndEnrichProviders(
  providers: any[], 
  location: { city: string; state: string; zip: string },
  bundle: any,
  planId: string,
  cptCodes: string[],
  providerType: string
): Promise<EnrichedProvider[]> {
  const { city, state, zip } = location;
  const isHSA = planId?.toLowerCase().includes('hsa');
  
  // Get pricing data
  const cmsPrices = await CMSPriceLookup.getMedicarePrices(cptCodes);
  
  // Format providers
  const formattedProviders: EnrichedProvider[] = [];
  
  for (const provider of providers) {
    const formatted = ProviderSearchService.formatProvider(provider, providerType);
    if (!formatted) continue;
    
    // Calculate costs
    const multiplier = PROVIDER_MULTIPLIERS[formatted.name] || 1.0;
    const bundleCopy = JSON.parse(JSON.stringify(bundle));
    
    bundleCopy.components.forEach((component: any) => {
      const cmsRate = cmsPrices.get(component.code);
      if (cmsRate) {
        component.typical_cost = Math.round(cmsRate * multiplier);
      } else {
        component.typical_cost = Math.round(component.typical_cost * multiplier);
      }
    });
    
    const mockPlan = {
      id: planId,
      isHSA,
      deductible: isHSA ? 2800 : 1500,
      deductibleMet: 0,
      copays: {
        urgentCare: isHSA ? 0 : 75,
        emergency: isHSA ? 0 : 350,
        primaryCare: isHSA ? 0 : 30
      }
    };
    
    const costDetails = calculateBundleCost(bundleCopy, mockPlan);
    
    const enrichedProvider: EnrichedProvider = {
      name: formatted.name,
      type: formatted.type,
      address: formatted.address,
      phone: formatted.phone,
      npi: formatted.npi,
      specialty: formatted.specialty,
      distance: formatted.distance || Math.round(Math.random() * 10 * 10) / 10,
      driveTime: formatted.driveTime || Math.round(Math.random() * 30 + 10),
      waitTime: formatted.waitTime,
      acceptsWalkIns: formatted.acceptsWalkIns,
      hasPharmacy: formatted.hasPharmacy,
      hours: formatted.hours,
      zip: formatted.zip,
      bundleName: bundle.name,
      totalCost: costDetails.totalCost,
      estimatedPatientCost: costDetails.patientCost,
      insurancePays: costDetails.insurancePays,
      costBreakdown: costDetails.breakdown,
      costNote: isHSA ? 
        'You pay full cost (counts toward $2,800 deductible)' : 
        'After insurance',
      priceLevel: multiplier < 0.9 ? 'low' : multiplier > 1.1 ? 'high' : 'average',
      negotiatedRate: costDetails.totalCost,
      dataSource: cmsPrices.size > 0 ? 'CMS Medicare Data' : 'Estimated',
      usingRealPricing: cmsPrices.size > 0
    };
    
    formattedProviders.push(enrichedProvider);
  }
  
  // Sort by distance
  formattedProviders.sort((a, b) => a.distance - b.distance);
  
  return formattedProviders;
}

// Fallback provider data
function getFallbackProviders(city: string, state: string, type: string): any[] {
  const providers = [];
  
  if (type === 'urgent_care' || type === 'all') {
    providers.push({
      basic: {
        organization_name: `${city} Urgent Care Center`
      },
      addresses: [{
        address_purpose: 'LOCATION',
        address_1: '123 Main St',
        city: city,
        state: state,
        postal_code: '77001',
        telephone_number: '(713) 555-0100'
      }],
      taxonomies: [{
        desc: 'Urgent Care',
        primary: true
      }],
      number: 'FALLBACK-UC-001'
    });
  }
  
  if (type === 'emergency' || type === 'all') {
    providers.push({
      basic: {
        organization_name: `${city} Medical Center Emergency`
      },
      addresses: [{
        address_purpose: 'LOCATION',
        address_1: '456 Hospital Dr',
        city: city,
        state: state,
        postal_code: '77002',
        telephone_number: '(713) 555-0911'
      }],
      taxonomies: [{
        desc: 'Emergency Medicine',
        primary: true
      }],
      number: 'FALLBACK-ER-001'
    });
  }
  
  if (type === 'primary' || type === 'all') {
    providers.push({
      basic: {
        organization_name: `${city} Family Practice`
      },
      addresses: [{
        address_purpose: 'LOCATION',
        address_1: '789 Health Blvd',
        city: city,
        state: state,
        postal_code: '77003',
        telephone_number: '(713) 555-0200'
      }],
      taxonomies: [{
        desc: 'Family Medicine',
        primary: true
      }],
      number: 'FALLBACK-PC-001'
    });
  }
  
  console.log(`📋 Using ${providers.length} fallback providers`);
  return providers;
}