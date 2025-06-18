// app/api/provider-costs-local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBundleForSymptom, calculateBundleCost } from '@/lib/procedure-bundles';
import * as fs from 'fs';
import * as path from 'path';

interface ParsedRate {
  billing_code: string;
  billing_code_type: string;
  provider_name: string;
  provider_npi: string;
  provider_tin: string;
  negotiated_rate: number;
  billing_class: string;
  plan_name: string;
  plan_id: string;
  reporting_entity: string;
  file_source: string;
}

// GCP Cloud Function URL for querying rates
const GCP_QUERY_RATES_URL = 'https://queryrates-b6yaa4g63q-uc.a.run.app';

// Provider-specific price multipliers (from original API)
const PROVIDER_MULTIPLIERS: Record<string, number> = {
  'CVS MinuteClinic': 0.85,        // 15% cheaper than average
  'Walgreens Healthcare Clinic': 0.90,    // 10% cheaper
  'CityMD Urgent Care': 1.10,      // 10% more expensive
  'MedExpress': 1.05,              // 5% more expensive
  'NextCare': 1.00,                // Average pricing
  'Houston Methodist Emergency Room': 1.25,        // Premium hospital
  'Memorial Hermann ER': 1.15,         // Slightly premium
  'Ben Taub Hospital Emergency': 0.60,        // Public hospital discount
  'Houston Methodist Primary Care': 1.10,        // Premium primary care
};

// Provider information (matching your original API exactly)
const PROVIDERS: Record<string, any> = {
  urgent_care: [
    {
      name: 'CVS MinuteClinic',
      type: 'Urgent Care',
      address: '1234 Main St, Houston, TX 77001',
      phone: '1-866-389-2727',
      hours: 'Mon-Fri 8:30am-7:30pm, Sat-Sun 9am-5:30pm',
      acceptsWalkIns: true,
      hasPharmacy: true
    },
    {
      name: 'Walgreens Healthcare Clinic',
      type: 'Urgent Care',
      address: '5678 Westheimer Rd, Houston, TX 77056',
      phone: '1-855-925-4733',
      hours: 'Mon-Fri 8am-8pm, Sat-Sun 8am-5pm',
      acceptsWalkIns: true,
      hasPharmacy: true
    },
    {
      name: 'CityMD Urgent Care',
      type: 'Urgent Care',
      address: '9012 Kirby Dr, Houston, TX 77054',
      phone: '(713) 555-2489',
      hours: 'Mon-Fri 8am-10pm, Sat-Sun 9am-6pm',
      acceptsWalkIns: true,
      hasPharmacy: false
    },
    {
      name: 'MedExpress',
      type: 'Urgent Care',
      address: '3456 Richmond Ave, Houston, TX 77027',
      phone: '(713) 555-3378',
      hours: 'Every day 8am-8pm',
      acceptsWalkIns: true,
      hasPharmacy: false
    }
  ],
  emergency: [
    {
      name: 'Houston Methodist Emergency Room',
      type: 'Emergency Room',
      address: '6565 Fannin St, Houston, TX 77030',
      phone: '(713) 790-3311',
      hours: '24/7',
      traumaLevel: 'Level I',
      averageWait: '3.5 hours'
    },
    {
      name: 'Memorial Hermann ER',
      type: 'Emergency Room',
      address: '6411 Fannin St, Houston, TX 77030',
      phone: '(713) 704-4000',
      hours: '24/7',
      traumaLevel: 'Level I',
      averageWait: '2.8 hours'
    },
    {
      name: 'Ben Taub Hospital Emergency',
      type: 'Emergency Room',
      address: '1504 Taub Loop, Houston, TX 77030',
      phone: '(713) 873-2000',
      hours: '24/7',
      traumaLevel: 'Level I',
      averageWait: '4.2 hours'
    }
  ],
  primary: [
    {
      name: 'Houston Methodist Primary Care',
      type: 'Primary Care',
      address: '6550 Fannin St, Suite 1101, Houston, TX 77030',
      phone: '(713) 790-3333',
      hours: 'Mon-Fri 8am-5pm',
      acceptingNewPatients: true,
      nextAvailable: '3 days'
    }
  ]
};

// Fetch real rates from GCP BigQuery
async function fetchRealRatesFromGCP(cptCodes: string[], state: string = 'TX'): Promise<Map<string, any>> {
  const rateMap = new Map<string, any>();
  
  try {
    // Fetch rates for each CPT code
    const promises = cptCodes.map(async (cptCode) => {
      try {
        const url = new URL(GCP_QUERY_RATES_URL);
        url.searchParams.append('cptCode', cptCode);
        url.searchParams.append('state', state);
        
        const response = await fetch(url.toString());
        const data = await response.json();
        
        if (data.success && data.data?.[0]) {
          rateMap.set(cptCode, data.data[0]);
          console.log(`✅ Got real rate for CPT ${cptCode}: $${data.data[0].min_rate}-$${data.data[0].max_rate}`);
        }
      } catch (error) {
        console.error(`Failed to fetch rate for CPT ${cptCode}:`, error);
      }
    });
    
    await Promise.all(promises);
  } catch (error) {
    console.error('Error fetching rates from GCP:', error);
  }
  
  return rateMap;
}

// Load parsed rates from local file (fallback)
function loadParsedRates(): ParsedRate[] {
  try {
    const filePath = path.join(process.cwd(), 'data', 'parsed-rates.json');
    if (!fs.existsSync(filePath)) {
      console.log('⚠️  parsed-rates.json not found');
      return [];
    }
    
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rates = JSON.parse(fileContent);
    console.log(`📊 Loaded ${rates.length} MRF rates from local file`);
    return rates;
  } catch (error) {
    console.error('❌ Error loading parsed rates:', error);
    return [];
  }
}

export async function POST(request: NextRequest) {
  try {
    const { planId, symptom, cptCodes, urgency } = await request.json();
    
    console.log('Getting comprehensive costs for:', { planId, symptom, cptCodes, urgency });
    
    // Get the procedure bundle for this symptom
    const bundle = getBundleForSymptom(symptom || 'office visit');
    
    if (!bundle) {
      return NextResponse.json({
        success: false,
        message: 'Could not determine appropriate care for this symptom'
      }, { status: 400 });
    }
    
    // Try to load local parsed rates first
    const allRates = loadParsedRates();
    
    // Determine provider type based on bundle
    let providerType = 'urgent_care';
    if (bundle.name.includes('ER')) {
      providerType = 'emergency';
    } else if (bundle.name.includes('Primary') || bundle.name.includes('Annual')) {
      providerType = 'primary';
    }
    
    // Get providers for this type
    const availableProviders = PROVIDERS[providerType] || [];
    
    // Check if it's an HSA plan
    const isHSA = planId?.toLowerCase().includes('hsa');
    const mockPlan = {
      id: planId,
      isHSA,
      deductible: isHSA ? 2800 : 1500,
      copays: {
        urgentCare: isHSA ? 0 : 30,
        emergency: isHSA ? 0 : 250,
        primaryCare: isHSA ? 0 : 25
      }
    };
    
    // Get CPT codes from request or fall back to bundle
    let bundleCptCodes: string[];
    
    if (cptCodes && cptCodes.length > 0) {
      // Use GPT-4 provided CPT codes
      bundleCptCodes = cptCodes;
      console.log('🧠 Using GPT-4 CPT codes:', bundleCptCodes);
    } else {
      // Fall back to bundle-based CPT codes
      bundleCptCodes = bundle.components.map(c => c.code);
      console.log('🔄 Using bundle CPT codes:', bundleCptCodes);
    }
    
    // Fetch real rates from GCP BigQuery
    const gcpRates = await fetchRealRatesFromGCP(bundleCptCodes, 'TX');
    const hasGCPRates = gcpRates.size > 0;
    
    // Find real rates for these CPT codes from local file
    const mrfRateMap = new Map<string, number>();
    allRates.forEach(rate => {
      if (bundleCptCodes.includes(rate.billing_code)) {
        const key = `${rate.provider_name}_${rate.billing_code}`;
        mrfRateMap.set(key, rate.negotiated_rate);
      }
    });
    
    console.log(`💰 Found ${mrfRateMap.size} local MRF rates, ${gcpRates.size} GCP rates`);
    
    // Calculate costs for each provider
    const providers = availableProviders.map((provider: any) => {
      const multiplier = PROVIDER_MULTIPLIERS[provider.name] || 1.0;
      
      // Use real rates if available
      const bundleCopy = JSON.parse(JSON.stringify(bundle));
      let usingRealData = false;
      
      bundleCopy.components.forEach((component: any) => {
        // First try GCP rates (most reliable)
        const gcpRate = gcpRates.get(component.code);
        if (gcpRate) {
          // Use median rate from GCP with provider multiplier
          component.typical_cost = Math.round(gcpRate.median_rate * multiplier);
          usingRealData = true;
        } else {
          // Try local MRF rates
          let realRate = mrfRateMap.get(`${provider.name}_${component.code}`);
          
          // Fallback to CVS/Walgreens rates if provider not found
          if (!realRate) {
            realRate = mrfRateMap.get(`CVS MINUTECLINIC_${component.code}`) ||
                      mrfRateMap.get(`WALGREENS HEALTHCARE CLINIC_${component.code}`);
          }
          
          if (realRate) {
            component.typical_cost = realRate;
            usingRealData = true;
          } else {
            // Final fallback: use bundle default with multiplier
            component.typical_cost = Math.round(component.typical_cost * multiplier);
          }
        }
      });
      
      const costDetails = calculateBundleCost(bundleCopy, mockPlan);
      
      return {
        ...provider,
        bundleName: bundle.name,
        totalCost: costDetails.totalCost,
        estimatedPatientCost: costDetails.patientCost,
        insurancePays: costDetails.insurancePays,
        costBreakdown: costDetails.breakdown,
        costNote: isHSA ? 
          'You pay full cost (counts toward $2,800 deductible)' : 
          'After insurance',
        priceLevel: multiplier < 0.9 ? 'low' : multiplier > 1.1 ? 'high' : 'average',
        distance: parseFloat((Math.random() * 10 + 0.5).toFixed(1)),
        waitTime: provider.averageWait || (providerType === 'urgent_care' ? '30-45 min' : '10-15 min'),
        // UI compatibility fields
        negotiatedRate: costDetails.totalCost,
        miles: parseFloat((Math.random() * 10 + 0.5).toFixed(1)),
        // New fields to indicate data source
        dataSource: usingRealData ? (hasGCPRates ? 'BCBS MRF Data' : 'Local MRF Data') : 'Estimated',
        usingRealPricing: usingRealData
      };
    }).sort((a: any, b: any) => a.estimatedPatientCost - b.estimatedPatientCost);
    
    // Calculate statistics
    const patientCosts = providers.map((p: any) => p.estimatedPatientCost);
    const stats = {
      min: Math.min(...patientCosts),
      max: Math.max(...patientCosts),
      avg: Math.round(patientCosts.reduce((a: number, b: number) => a + b, 0) / patientCosts.length),
      count: providers.length,
      bundleUsed: bundle.name,
      mrfRatesFound: mrfRateMap.size,
      gcpRatesFound: gcpRates.size,
      totalMrfRates: allRates.length,
      dataSource: hasGCPRates ? 'Real BCBS MRF rates from BigQuery' : 
                  mrfRateMap.size > 0 ? 'Local MRF data' : 'Estimated rates'
    };
    
    return NextResponse.json({
      success: true,
      symptom,
      bundle: {
        name: bundle.name,
        description: bundle.description,
        totalComponents: bundle.components.length
      },
      providers,
      stats,
      planInfo: {
        isHSA,
        deductible: mockPlan.deductible,
        deductibleMet: 0,
        message: isHSA ? 
          'With your HSA plan, you pay the full negotiated rate until you meet your deductible.' :
          'Your plan includes copays for office visits and coinsurance for other services.'
      },
      usingRealMRFData: hasGCPRates || mrfRateMap.size > 0
    });
    
  } catch (error) {
    console.error('Provider costs error:', error);
    
    return NextResponse.json({
      success: false,
      providers: [],
      stats: { min: 100, max: 500, avg: 250, count: 0 },
      message: 'Unable to load provider costs'
    }, { status: 500 });
  }
}