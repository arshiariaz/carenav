// scripts/debug-npi.ts
// Run with: npx tsx scripts/debug-npi.ts

async function testNPIRegistry() {
  const baseUrl = 'https://npiregistry.cms.hhs.gov/api/';
  
  console.log('🔍 Testing NPI Registry API...\n');
  
  // Test 1: Search for urgent care in Houston
  console.log('Test 1: Urgent Care in Houston, TX');
  try {
    const params = new URLSearchParams({
      version: '2.1',
      city: 'Houston',
      state: 'TX',
      taxonomy_description: 'Urgent Care',
      enumeration_type: 'NPI-2',
      limit: '5'
    });
    
    const response = await fetch(`${baseUrl}?${params}`);
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Results found: ${data.result_count || 0}`);
    
    if (data.results && data.results.length > 0) {
      console.log('\nFirst result:');
      const first = data.results[0];
      console.log(`- Name: ${first.basic.organization_name}`);
      console.log(`- NPI: ${first.number}`);
      const addr = first.addresses.find((a: any) => a.address_purpose === 'LOCATION');
      if (addr) {
        console.log(`- Address: ${addr.address_1}, ${addr.city}, ${addr.state} ${addr.postal_code}`);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('\n---\n');
  
  // Test 2: Search by organization name
  console.log('Test 2: Search by organization name containing "clinic"');
  try {
    const params = new URLSearchParams({
      version: '2.1',
      city: 'Houston',
      state: 'TX',
      organization_name: 'clinic',
      enumeration_type: 'NPI-2',
      limit: '5'
    });
    
    const response = await fetch(`${baseUrl}?${params}`);
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Results found: ${data.result_count || 0}`);
    
    if (data.results) {
      data.results.slice(0, 3).forEach((result: any, i: number) => {
        console.log(`\nResult ${i + 1}:`);
        console.log(`- Name: ${result.basic.organization_name}`);
        console.log(`- Taxonomy: ${result.taxonomies[0]?.desc || 'N/A'}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
  
  console.log('\n---\n');
  
  // Test 3: Search by ZIP code
  console.log('Test 3: Search by ZIP code 77001');
  try {
    const params = new URLSearchParams({
      version: '2.1',
      postal_code: '77001',
      enumeration_type: 'NPI-2',
      limit: '10'
    });
    
    const response = await fetch(`${baseUrl}?${params}`);
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Results found: ${data.result_count || 0}`);
    
    // Group by taxonomy
    if (data.results) {
      const byTaxonomy: Record<string, number> = {};
      data.results.forEach((result: any) => {
        const taxonomy = result.taxonomies[0]?.desc || 'Unknown';
        byTaxonomy[taxonomy] = (byTaxonomy[taxonomy] || 0) + 1;
      });
      
      console.log('\nProvider types found:');
      Object.entries(byTaxonomy).forEach(([type, count]) => {
        console.log(`- ${type}: ${count}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the test
testNPIRegistry().then(() => {
  console.log('\n✅ Test complete');
}).catch(error => {
  console.error('❌ Test failed:', error);
});