// app/api/test-npi/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { NPIRegistryService } from '@/lib/npi-registry';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const city = searchParams.get('city') || 'Houston';
  const state = searchParams.get('state') || 'TX';
  const zip = searchParams.get('zip') || '77001';
  const type = searchParams.get('type') || 'urgent_care';
  
  console.log(`🔍 Testing NPI search for ${type} in ${city}, ${state} ${zip}`);
  
  try {
    let providers: any[] = [];
    
    // Test different search approaches
    if (type === 'urgent_care') {
      // Try multiple search terms
      const searches = [
        { taxonomy: 'Urgent Care', enumType: 'NPI-2' },
        { taxonomy: 'Walk-in', enumType: 'NPI-2' },
        { taxonomy: 'Clinic', enumType: 'NPI-2' },
        { orgName: 'urgent', enumType: 'NPI-2' },
        { orgName: 'clinic', enumType: 'NPI-2' }
      ];
      
      for (const search of searches) {
        console.log(`Trying search:`, search);
        
        const results = await NPIRegistryService.searchProviders({
          city,
          state,
          postal_code: zip,
          taxonomy_description: search.taxonomy,
          organization_name: search.orgName,
          enumeration_type: search.enumType as 'NPI-1' | 'NPI-2',
          limit: 10
        });
        
        console.log(`Found ${results.length} results for`, search);
        providers.push(...results);
      }
      
      // Deduplicate
      const uniqueMap = new Map(providers.map(p => [p.number, p]));
      providers = Array.from(uniqueMap.values());
    }
    
    // Format for display
    const formatted = providers.slice(0, 20).map(p => {
      const location = p.addresses.find((a: any) => a.address_purpose === 'LOCATION') || p.addresses[0];
      const taxonomy = p.taxonomies[0];
      
      return {
        npi: p.number,
        name: p.basic.organization_name || `${p.basic.first_name} ${p.basic.last_name}`,
        type: p.enumeration_type,
        address: `${location.address_1}, ${location.city}, ${location.state} ${location.postal_code}`,
        taxonomy: taxonomy?.desc || 'Unknown',
        city: location.city,
        state: location.state,
        zip: location.postal_code
      };
    });
    
    return NextResponse.json({
      success: true,
      search: { city, state, zip, type },
      totalFound: formatted.length,
      providers: formatted,
      debug: {
        searchUrl: 'https://npiregistry.cms.hhs.gov/api/',
        parameters: { city, state, postal_code: zip }
      }
    });
    
  } catch (error) {
    console.error('NPI test error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      search: { city, state, zip, type }
    }, { status: 500 });
  }
}

// Test with: /api/test-npi?city=Houston&state=TX&zip=77001&type=urgent_care