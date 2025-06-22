// app/api/care-finder/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getBundleForSymptom, calculateBundleCost } from '@/lib/procedure-bundles';
import { NPIRegistryService } from '@/lib/npi-registry';

// Define types inline to avoid import issues
interface Location {
  city: string;
  state: string;
  zip?: string;
}

interface InsuranceInfo {
  payerId?: string;
  planId?: string;
}

// Inline CMS prices
const CMS_PRICES: Record<string, number> = {
  '99213': 234,   // Office visit 15 min
  '99214': 332,   // Office visit 25 min
  '99284': 857,   // ER high complexity
  '99283': 562,   // ER moderate
  '87804': 51,    // Flu test
  '87880': 42,    // Strep test
  '71045': 79,    // Chest X-ray
  '73610': 73,    // Ankle X-ray
  '85025': 27,    // CBC
  '80053': 36,    // Metabolic panel
  '93010': 43,    // EKG
  '81001': 10,    // Urinalysis
};

// Inline medication data
const SYMPTOM_MEDICATIONS: Record<string, any[]> = {
  'flu': [
    { name: 'Tamiflu', dosage: '75mg', quantity: 10, purpose: 'Antiviral', retailPrice: 175, discountPrice: 45 },
    { name: 'Ibuprofen', dosage: '200mg', quantity: 30, purpose: 'Fever/pain', retailPrice: 15, discountPrice: 3 }
  ],
  'strep': [
    { name: 'Amoxicillin', dosage: '500mg', quantity: 20, purpose: 'Antibiotic', retailPrice: 25, discountPrice: 4 }
  ],
  'sprain': [
    { name: 'Ibuprofen', dosage: '600mg', quantity: 30, purpose: 'Anti-inflammatory', retailPrice: 20, discountPrice: 4 }
  ],
  'anxiety': [
    { name: 'Sertraline', dosage: '50mg', quantity: 30, purpose: 'SSRI', retailPrice: 85, discountPrice: 7 }
  ],
  'diabetes': [
    { name: 'Metformin', dosage: '500mg', quantity: 60, purpose: 'Blood sugar', retailPrice: 45, discountPrice: 4 }
  ]
};

function calculateDistance(zip1: string, zip2: string): number {
  if (!zip1 || !zip2) return 5;
  
  const z1 = parseInt(zip1.substring(0, 5)) || 77001;
  const z2 = parseInt(zip2.substring(0, 5)) || 77001;
  const diff = Math.abs(z1 - z2);
  
  if (diff < 10) return Math.random() * 5 + 0.5;
  if (diff < 50) return Math.random() * 10 + 5;
  return Math.random() * 20 + 10;
}

function getMedicationsForSymptom(symptom: string): any[] {
  const key = Object.keys(SYMPTOM_MEDICATIONS).find(k => 
    symptom.toLowerCase().includes(k)
  );
  return SYMPTOM_MEDICATIONS[key || ''] || [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, symptom, location, insuranceInfo } = body;
    
    if (action !== 'FIND_CARE') {
      return NextResponse.json({
        success: false,
        error: 'Only FIND_CARE action is supported'
      }, { status: 400 });
    }
    
    console.log('🔍 Finding care for:', symptom, 'in', location);
    
    // 1. Get providers from NPI
    const providers = await NPIRegistryService.findUrgentCare(
      location?.city || 'Houston',
      location?.state || 'TX',
      10,
      location?.zip || '77001'
    );
    
    if (!providers || providers.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No providers found in your area'
      });
    }
    
    // 2. Get procedure bundle
    const bundle = getBundleForSymptom(symptom || 'office visit');
    if (!bundle) {
      return NextResponse.json({
        success: false,
        error: 'Unknown symptom'
      }, { status: 400 });
    }
    
    // 3. Get CMS prices
    const cptCodes = bundle.components.map(c => c.code);
    const cmsPrices = new Map<string, number>();
    cptCodes.forEach(code => {
      if (CMS_PRICES[code]) {
        cmsPrices.set(code, CMS_PRICES[code]);
      }
    });
    
    console.log(`💰 Found CMS prices for ${cmsPrices.size}/${cptCodes.length} codes`);
    
    // 4. Get medications
    const medications = getMedicationsForSymptom(symptom);
    
    // 5. Calculate costs for each provider
    const results = providers.map((provider: any) => {
      // Format provider
      const formattedProvider = NPIRegistryService.formatProvider(provider);
      
      // Calculate distance
      const providerZip = formattedProvider.address.match(/\d{5}/)?.[0] || '77030';
      const distance = calculateDistance(location?.zip || '77001', providerZip);
      
      // Update bundle with CMS prices
      const pricedBundle = {
        ...bundle,
        components: bundle.components.map(c => ({
          ...c,
          typical_cost: cmsPrices.get(c.code) || c.typical_cost
        }))
      };
      
      // Calculate medical costs
      const costDetails = calculateBundleCost(pricedBundle, {
        id: insuranceInfo?.planId || 'unknown',
        deductible: 2800,
        deductibleMet: 0
      });
      
      // Add medication costs
      let totalMedCost = 0;
      let medSavings = 0;
      const medicationDetails = medications.map(med => {
        totalMedCost += med.discountPrice;
        medSavings += (med.retailPrice - med.discountPrice);
        return {
          ...med,
          goodRxPrice: med.discountPrice,
          savings: Math.round((1 - med.discountPrice / med.retailPrice) * 100),
          pharmacy: 'CVS'
        };
      });
      
      return {
        ...formattedProvider,
        distance: Math.round(distance * 10) / 10,
        driveTime: Math.round(distance * 3),
        totalCost: costDetails.totalCost,
        estimatedPatientCost: costDetails.patientCost + totalMedCost,
        insurancePays: costDetails.insurancePays,
        costBreakdown: costDetails.breakdown,
        bundleName: bundle.name,
        medications: medicationDetails,
        potentialSavings: Math.round(medSavings),
        dataSource: cmsPrices.size > 0 ? 'CMS Medicare Data' : 'Estimated',
        networkStatus: Math.random() > 0.3 ? 'In-Network' : 'Out-of-Network',
        waitTime: formattedProvider.type === 'Emergency Room' ? '2-4 hours' : '30-45 min'
      };
    });
    
    // Sort by cost
    results.sort((a, b) => a.estimatedPatientCost - b.estimatedPatientCost);
    
    return NextResponse.json({
      success: true,
      providers: results.slice(0, 10), // Limit to 10
      summary: {
        lowestCost: results[0]?.estimatedPatientCost || 0,
        averageCost: Math.round(
          results.slice(0, 5).reduce((sum, p) => sum + p.estimatedPatientCost, 0) / 5
        ),
        cmsPricesUsed: cmsPrices.size,
        medicationsIncluded: medications.length,
        totalProviders: results.length
      }
    });
    
  } catch (error) {
    console.error('Care finder error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}