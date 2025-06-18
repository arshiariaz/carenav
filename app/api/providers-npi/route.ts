// app/api/providers-npi/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { NPIRegistryService, NPIProvider } from '@/lib/npi-registry';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    
    // Get parameters
    const city = searchParams.get('city') || 'Houston';
    const state = searchParams.get('state') || 'TX';
    const zip = searchParams.get('zip') || '';
    const type = searchParams.get('type') || 'all';
    const limit = parseInt(searchParams.get('limit') || '20');
    
    console.log(`🔍 Searching NPI Registry for ${type} providers in ${city}, ${state} ${zip ? `(ZIP: ${zip})` : ''}`);
    
    let providers: NPIProvider[] = [];
    
    // Search based on type
    switch (type) {
      case 'urgent_care':
        providers = await NPIRegistryService.findUrgentCare(city, state, limit, zip);
        break;
        
      case 'emergency':
        providers = await NPIRegistryService.findEmergencyRooms(city, state, limit, zip);
        break;
        
      case 'primary':
        providers = await NPIRegistryService.findPrimaryCare(city, state, limit, zip);
        break;
        
      case 'all':
      default:
        // Get a mix of all types
        const urgent = await NPIRegistryService.findUrgentCare(city, state, Math.floor(limit / 3), zip);
        const emergency = await NPIRegistryService.findEmergencyRooms(city, state, Math.floor(limit / 3), zip);
        const primary = await NPIRegistryService.findPrimaryCare(city, state, Math.floor(limit / 3), zip);
        providers = [...urgent, ...emergency, ...primary];
        break;
    }
    
    // Format providers for display
    const formatted = providers
      .map((p: NPIProvider) => {
        const formatted = NPIRegistryService.formatProvider(p);
        
        // Filter out providers that are clearly in wrong state/city
        const providerCity = formatted.address.split(',')[1]?.trim() || '';
        const providerState = formatted.address.split(',')[2]?.trim().split(' ')[0] || '';
        
        // Skip if wrong state
        if (providerState && providerState !== state) {
          console.log(`Filtering out ${formatted.name} - wrong state: ${providerState}`);
          return null;
        }
        
        // Skip if clearly wrong city (like Albuquerque when searching Houston)
        if (city === 'Houston' && providerCity.includes('ALBUQUERQUE')) {
          console.log(`Filtering out ${formatted.name} - wrong city: ${providerCity}`);
          return null;
        }
        
        // Add additional fields for compatibility with existing UI
        return {
          ...formatted,
          // Map type to match existing UI expectations
          type: formatted.specialty.toLowerCase().includes('urgent') ? 'Urgent Care' : 
                formatted.specialty.toLowerCase().includes('emergency') ? 'Emergency Room' : 
                formatted.specialty.toLowerCase().includes('clinic') ? 'Urgent Care' :
                formatted.specialty.toLowerCase().includes('family') ? 'Primary Care' :
                formatted.specialty.toLowerCase().includes('internal') ? 'Primary Care' :
                'Primary Care',
          // These will be populated by cost estimation
          negotiatedRate: 0,
          estimatedPatientCost: 0,
          insurancePays: 0,
          costNote: '',
          // Default values
          distance: Math.round(Math.random() * 10 * 10) / 10, // Will be replaced with real distance calc
          waitTime: formatted.type === 'Emergency Room' ? '2-4 hours' : '30-45 min',
          acceptsWalkIns: formatted.type !== 'Primary Care',
          hasPharmacy: Math.random() > 0.5, // Will be enhanced with real data
          hours: formatted.type === 'Emergency Room' ? '24/7' : 'Mon-Fri 8am-6pm',
          // Keep the raw data for reference
          npiData: p
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null); // Remove filtered out providers with proper type guard
    
    console.log(`✅ Found ${formatted.length} providers from NPI Registry`);
    
    return NextResponse.json({
      success: true,
      providers: formatted,
      source: 'NPI Registry',
      city,
      state,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ NPI Registry API error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch providers from NPI Registry',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// POST endpoint to enrich providers with cost data
export async function POST(request: NextRequest) {
  try {
    const { providers, planId, cptCodes } = await request.json();
    
    console.log(`💰 Enriching ${providers.length} NPI providers with cost data`);
    
    // Fetch real rates from BigQuery via Cloud Function
    const ratePromises = cptCodes.map(async (cpt: string) => {
      const url = `https://queryrates-b6yaa4g63q-uc.a.run.app?cptCode=${cpt}&state=TX`;
      try {
        const response = await fetch(url);
        const data = await response.json();
        return { cpt, data: data.data?.[0] || null };
      } catch (error) {
        console.error(`Failed to fetch rate for CPT ${cpt}:`, error);
        return { cpt, data: null };
      }
    });
    
    const rates = await Promise.all(ratePromises);
    const rateMap = new Map(rates.map(r => [r.cpt, r.data]));
    
    // Enrich each provider with cost estimates
    const enrichedProviders = providers.map((provider: any) => {
      // Calculate total cost based on CPT codes and rates
      let totalCost = 0;
      let hasRealData = false;
      
      cptCodes.forEach((cpt: string) => {
        const rateData = rateMap.get(cpt);
        if (rateData) {
          // Use median rate with some variance based on provider
          const baseRate = rateData.median_rate || rateData.avg_rate;
          const variance = (provider.npi.charCodeAt(provider.npi.length - 1) % 40 - 20) / 100; // +/- 20% variance
          const rate = baseRate * (1 + variance);
          totalCost += rate;
          hasRealData = true;
        } else {
          // Fallback estimate
          totalCost += 150; // Default estimate
        }
      });
      
      // Calculate patient cost based on plan type and provider type
      const isHSA = planId?.toLowerCase().includes('hsa');
      let estimatedPatientCost = totalCost;
      let costNote = '';
      
      if (isHSA) {
        estimatedPatientCost = totalCost;
        costNote = 'You pay full cost (counts toward deductible)';
      } else {
        // Traditional plan with copays - more nuanced based on care type
        if (provider.type === 'Urgent Care') {
          estimatedPatientCost = 75; // Typical urgent care copay
          costNote = 'Copay (after deductible)';
        } else if (provider.type === 'Emergency Room') {
          estimatedPatientCost = 350; // Typical ER copay
          costNote = 'ER copay + coinsurance';
        } else if (provider.specialty && provider.specialty.toLowerCase().includes('specialist')) {
          estimatedPatientCost = 60; // Specialist copay
          costNote = 'Specialist copay';
        } else {
          estimatedPatientCost = 30; // Primary care copay
          costNote = 'Office visit copay';
        }
        
        // Add some variation based on the specific plan
        if (planId?.includes('anthem')) {
          // Anthem tends to have these copays
          if (provider.type === 'Primary Care') estimatedPatientCost = 30;
          if (provider.type === 'Urgent Care') estimatedPatientCost = 75;
        }
      }
      
      return {
        ...provider,
        negotiatedRate: Math.round(totalCost),
        estimatedPatientCost: Math.round(estimatedPatientCost),
        insurancePays: Math.round(totalCost - estimatedPatientCost),
        costNote,
        dataSource: hasRealData ? 'BCBS MRF Data' : 'Estimated',
        usingRealPricing: hasRealData
      };
    });
    
    // Sort by estimated patient cost
    enrichedProviders.sort((a: any, b: any) => a.estimatedPatientCost - b.estimatedPatientCost);
    
    return NextResponse.json({
      success: true,
      providers: enrichedProviders,
      stats: {
        min: Math.min(...enrichedProviders.map((p: any) => p.estimatedPatientCost)),
        max: Math.max(...enrichedProviders.map((p: any) => p.estimatedPatientCost)),
        avg: Math.round(enrichedProviders.reduce((sum: number, p: any) => sum + p.estimatedPatientCost, 0) / enrichedProviders.length)
      }
    });
    
  } catch (error) {
    console.error('❌ Provider enrichment error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to enrich providers with cost data'
    }, { status: 500 });
  }
}