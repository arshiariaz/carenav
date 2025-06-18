// app/api/provider-costs-local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBundleForSymptom, calculateBundleCost } from '@/lib/procedure-bundles';

// Add this interface for BigQuery response
interface BigQueryRate {
  billing_code: string;
  sample_size: number;
  average_rate: number;
  min_rate: number;
  max_rate: number;
}

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

// New function to get real rates from BigQuery via Cloud Function
async function getRealRatesFromBigQuery(cptCodes: string[]): Promise<Map<string, BigQueryRate> | null> {
  try {
    console.log('🔍 Fetching real rates from BigQuery for CPT codes:', cptCodes);
    
    const response = await fetch('https://us-central1-carenav-health.cloudfunctions.net/get-mrf-rates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpt_codes: cptCodes })
    });
    
    const data = await response.json();
    
    if (data.success && data.rates) {
      const rateMap = new Map<string, BigQueryRate>();
      data.rates.forEach((rate: BigQueryRate) => {
        rateMap.set(rate.billing_code, rate);
      });
      console.log('✅ Got real rates for', rateMap.size, 'CPT codes');
      return rateMap;
    }
  } catch (error) {
    console.error('❌ Failed to get real rates from BigQuery:', error);
  }
  return null;
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
    
    // Get real rates from BigQuery
    const realRates = await getRealRatesFromBigQuery(bundleCptCodes);
    
    // Calculate costs for each provider
    const providers = availableProviders.map((provider: any) => {
      const multiplier = PROVIDER_MULTIPLIERS[provider.name] || 1.0;
      const bundleCopy = JSON.parse(JSON.stringify(bundle));
      
      // Update component costs with real rates or apply multiplier
      bundleCopy.components.forEach((component: any) => {
        if (realRates && realRates.has(component.code)) {
          const rate = realRates.get(component.code)!;
          // Use average rate adjusted by provider multiplier
          component.typical_cost = Math.round(rate.average_rate * multiplier);
        } else {
          // Fall back to original cost with multiplier
          component.typical_cost = Math.round(component.typical_cost * multiplier);
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
        // Add flag to show if using real rates
        usingRealRates: realRates !== null && realRates.size > 0
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
      realRatesFound: realRates?.size || 0,
      cptCodesQueried: bundleCptCodes.length
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
          'Your plan includes copays for office visits and coinsurance for other services.',
        usingRealRates: realRates !== null && realRates.size > 0
      }
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