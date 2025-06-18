// scripts/diagnose-mrf-structure.ts
import * as fs from 'fs';

async function diagnoseMRFStructure() {
  console.log('🔍 Diagnosing MRF file structure...\n');
  
  try {
    const filePath = 'data/tx-blue-advantage-behavioral.json';
    const rawData = await fs.promises.readFile(filePath, 'utf-8');
    const data = JSON.parse(rawData);
    
    console.log('📋 Top-level structure:');
    console.log('Keys:', Object.keys(data));
    
    // Check provider references structure
    if (data.provider_references) {
      console.log('\n📦 Provider References:');
      console.log(`Count: ${data.provider_references.length}`);
      if (data.provider_references.length > 0) {
        console.log('Sample provider reference:');
        console.log(JSON.stringify(data.provider_references[0], null, 2));
      }
    }
    
    // Check in_network structure
    if (data.in_network && data.in_network.length > 0) {
      console.log('\n📦 In-Network Structure:');
      console.log(`Total items: ${data.in_network.length}`);
      
      // Find an item with office visit code
      const officeVisit = data.in_network.find((item: any) => item.billing_code === '99213');
      if (officeVisit) {
        console.log('\nSample item (99213 - Office Visit):');
        console.log('Billing code:', officeVisit.billing_code);
        console.log('Description:', officeVisit.description);
        console.log('Negotiated rates count:', officeVisit.negotiated_rates?.length || 0);
        
        if (officeVisit.negotiated_rates && officeVisit.negotiated_rates.length > 0) {
          const firstRate = officeVisit.negotiated_rates[0];
          console.log('\nFirst negotiated rate structure:');
          console.log('Keys:', Object.keys(firstRate));
          
          // Check for provider groups
          if (firstRate.provider_groups && firstRate.provider_groups.length > 0) {
            console.log('\nProvider group example:');
            console.log(JSON.stringify(firstRate.provider_groups[0], null, 2));
          }
          
          // Check for provider references
          if (firstRate.provider_references) {
            console.log('\nProvider references:', firstRate.provider_references.slice(0, 5));
          }
          
          // Check negotiated prices
          if (firstRate.negotiated_prices && firstRate.negotiated_prices.length > 0) {
            console.log('\nNegotiated price example:');
            console.log(JSON.stringify(firstRate.negotiated_prices[0], null, 2));
          }
        }
      }
      
      // Look for any item with actual provider names
      console.log('\n🔍 Searching for items with provider names...');
      let foundProviderName = false;
      
      for (const item of data.in_network.slice(0, 50)) {
        if (item.negotiated_rates) {
          for (const rate of item.negotiated_rates) {
            if (rate.provider_groups) {
              for (const group of rate.provider_groups) {
                if (group.name && group.name !== 'Unknown') {
                  console.log(`\nFound provider: ${group.name}`);
                  console.log('In billing code:', item.billing_code);
                  console.log('Provider structure:', JSON.stringify(group, null, 2));
                  foundProviderName = true;
                  break;
                }
              }
            }
            if (foundProviderName) break;
          }
        }
        if (foundProviderName) break;
      }
      
      if (!foundProviderName) {
        console.log('No named providers found in first 50 items');
      }
    }
    
    // Save a small sample for inspection
    const sample = {
      reporting_entity: data.reporting_entity_name,
      provider_references_count: data.provider_references?.length || 0,
      provider_reference_sample: data.provider_references?.[0],
      in_network_count: data.in_network?.length || 0,
      in_network_sample: data.in_network?.[0]
    };
    
    await fs.promises.writeFile(
      'data/mrf-structure-sample.json',
      JSON.stringify(sample, null, 2)
    );
    console.log('\n💾 Full structure sample saved to data/mrf-structure-sample.json');
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }
}

diagnoseMRFStructure();