// scripts/parse-texas-behavioral.ts
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

// Common CPT codes - focus on behavioral health and primary care
const TARGET_CPT_CODES = [
  // Office visits (most likely in behavioral health file)
  '99213', // Office visit (15-20 min)
  '99214', // Office visit (25 min)
  '99215', // Office visit (40 min)
  
  // Mental health specific
  '90834', // Psychotherapy, 45 min
  '90837', // Psychotherapy, 60 min
  '90791', // Psychiatric diagnostic evaluation
  
  // Common medical codes
  '99395', // Preventive visit
  '80053', // Comprehensive metabolic panel
  '85025', // Complete blood count
  '81001', // Urinalysis
];

// Houston area keywords
const HOUSTON_KEYWORDS = [
  'houston', 'memorial hermann', 'methodist', 'kelsey', 'seybold',
  'st luke', 'texas children', 'ben taub', 'harris',
  'magellan', 'behavioral', 'htx', 'texas', ' tx '
];

interface ParsedRate {
  billing_code: string;
  billing_code_type: string;
  provider_name: string;
  provider_npi: string;
  negotiated_rate: number;
  billing_class: string;
}

async function parseTexasBehavioral() {
  console.log('🚀 Parsing BCBS Texas Behavioral Health MRF file...\n');
  
  try {
    const filePath = 'data/tx-blue-advantage-behavioral.json';
    
    // Read the uncompressed JSON file
    console.log('📂 Reading JSON file (6.6MB)...');
    const rawData = await fs.promises.readFile(filePath, 'utf-8');
    
    console.log('📊 Parsing JSON...');
    const data = JSON.parse(rawData);
    
    // Show file info
    console.log('\n📋 File Information:');
    console.log(`  Reporting Entity: ${data.reporting_entity_name || 'Unknown'}`);
    console.log(`  Plan Name: ${data.plan_name || 'Unknown'}`);
    console.log(`  Last Updated: ${data.last_updated_on || 'Unknown'}`);
    
    if (!data.in_network) {
      console.log('❌ No in_network data found');
      return;
    }
    
    console.log(`  Total items: ${data.in_network.length}`);
    
    // Parse rates
    const targetRates: ParsedRate[] = [];
    const texasRates: ParsedRate[] = [];
    const cptCodeCounts = new Map<string, number>();
    const providerSet = new Set<string>();
    
    console.log('\n🔍 Searching for behavioral health and office visit codes...');
    
    // Build provider map
    const providerMap = new Map();
    if (data.provider_references) {
      console.log(`  Building provider reference map...`);
      data.provider_references.forEach((ref: any) => {
        const refId = ref.provider_reference_id || ref.provider_reference;
        if (refId && ref.provider_groups) {
          ref.provider_groups.forEach((group: any) => {
            if (group.npi && group.npi.length > 0) {
              providerMap.set(refId, {
                name: group.name || 'Unknown',
                npi: group.npi[0]
              });
            }
          });
        }
      });
      console.log(`  Provider references: ${providerMap.size}`);
    }
    
    // Process each item
    let processed = 0;
    let behavioralCodesFound = 0;
    
    for (const item of data.in_network) {
      processed++;
      
      if (processed % 500 === 0) {
        console.log(`  Processed ${processed}/${data.in_network.length} items...`);
      }
      
      const billingCode = item.billing_code;
      
      // Check if it's a behavioral health code or our target codes
      const isBehavioralCode = billingCode?.startsWith('90') || billingCode?.startsWith('H');
      const isTargetCode = TARGET_CPT_CODES.includes(billingCode);
      
      if (isBehavioralCode) {
        behavioralCodesFound++;
      }
      
      if (!isTargetCode && !isBehavioralCode) {
        continue;
      }
      
      // Track CPT code
      cptCodeCounts.set(billingCode, (cptCodeCounts.get(billingCode) || 0) + 1);
      
      const negotiatedRates = item.negotiated_rates || [];
      
      for (const rateGroup of negotiatedRates) {
        // Handle provider references
        if (rateGroup.provider_references) {
          for (const refId of rateGroup.provider_references) {
            const provider = providerMap.get(refId);
            if (provider) {
              const prices = rateGroup.negotiated_prices || [];
              for (const price of prices) {
                if (price.negotiated_rate) {
                  const rate = {
                    billing_code: billingCode,
                    billing_code_type: item.billing_code_type || 'CPT',
                    provider_name: provider.name,
                    provider_npi: provider.npi,
                    negotiated_rate: price.negotiated_rate,
                    billing_class: price.billing_class || 'professional'
                  };
                  
                  if (isTargetCode) {
                    targetRates.push(rate);
                  }
                  
                  providerSet.add(provider.name);
                  
                  // Check if Texas provider
                  const nameLower = provider.name.toLowerCase();
                  if (HOUSTON_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
                    texasRates.push(rate);
                  }
                }
              }
            }
          }
        }
        
        // Handle inline provider groups
        if (rateGroup.provider_groups) {
          for (const group of rateGroup.provider_groups) {
            const groupName = group.name || 'Unknown';
            const npis = group.npi || [];
            
            for (const npi of npis) {
              const prices = rateGroup.negotiated_prices || [];
              for (const price of prices) {
                if (price.negotiated_rate) {
                  const rate = {
                    billing_code: billingCode,
                    billing_code_type: item.billing_code_type || 'CPT',
                    provider_name: groupName,
                    provider_npi: npi.toString(),
                    negotiated_rate: price.negotiated_rate,
                    billing_class: price.billing_class || 'professional'
                  };
                  
                  if (isTargetCode) {
                    targetRates.push(rate);
                  }
                  
                  providerSet.add(groupName);
                  
                  // Check if Texas provider
                  const nameLower = groupName.toLowerCase();
                  if (HOUSTON_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
                    texasRates.push(rate);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Display results
    console.log('\n📊 Results Summary:');
    console.log('='.repeat(50));
    console.log(`Total items processed: ${processed}`);
    console.log(`Behavioral health codes found: ${behavioralCodesFound}`);
    console.log(`Target CPT codes found: ${cptCodeCounts.size}`);
    console.log(`Total rates extracted: ${targetRates.length}`);
    console.log(`Texas/Houston area rates: ${texasRates.length}`);
    console.log(`Unique providers: ${providerSet.size}`);
    
    // Show CPT code breakdown
    console.log('\n📋 Top CPT Codes:');
    Array.from(cptCodeCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([code, count]) => {
        console.log(`  ${code}: ${count} occurrences`);
      });
    
    // Show sample rates
    if (targetRates.length > 0) {
      console.log('\n💰 Sample Rates:');
      
      // Office visit samples
      const officeVisits = targetRates.filter(r => ['99213', '99214', '99215'].includes(r.billing_code));
      if (officeVisits.length > 0) {
        console.log('\n  Office Visits:');
        officeVisits.slice(0, 5).forEach(rate => {
          console.log(`    ${rate.billing_code} - ${rate.provider_name}: $${rate.negotiated_rate}`);
        });
      }
      
      // Psychotherapy samples
      const psychotherapy = targetRates.filter(r => ['90834', '90837'].includes(r.billing_code));
      if (psychotherapy.length > 0) {
        console.log('\n  Psychotherapy:');
        psychotherapy.slice(0, 5).forEach(rate => {
          console.log(`    ${rate.billing_code} - ${rate.provider_name}: $${rate.negotiated_rate}`);
        });
      }
    }
    
    // Texas providers
    if (texasRates.length > 0) {
      console.log('\n🏥 Texas Providers Found:');
      const texasProviders = new Set(texasRates.map(r => r.provider_name));
      Array.from(texasProviders).slice(0, 15).forEach(provider => {
        console.log(`  - ${provider}`);
      });
    }
    
    // Save results
    console.log('\n💾 Saving results...');
    await fs.promises.writeFile(
      'data/texas-behavioral-results.json',
      JSON.stringify({
        summary: {
          totalRates: targetRates.length,
          texasRates: texasRates.length,
          behavioralCodesFound: behavioralCodesFound,
          topCPTCodes: Array.from(cptCodeCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20),
          uniqueProviders: providerSet.size
        },
        sampleRates: targetRates.slice(0, 100),
        texasProviders: Array.from(new Set(texasRates.map(r => r.provider_name))),
        texasSampleRates: texasRates.slice(0, 50)
      }, null, 2)
    );
    console.log('✅ Results saved to data/texas-behavioral-results.json');
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }
}

// Run the parser
parseTexasBehavioral();
