// scripts/parse-test-mrf.ts
import * as fs from 'fs';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const gunzip = promisify(zlib.gunzip);

// Initialize BigQuery
const bigquery = new BigQuery({
  projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID
});

// Common CPT codes from your procedure bundles
const TARGET_CPT_CODES = [
  // Urgent Care
  '99213', // Office visit (15-20 min)
  '99214', // Office visit (25 min)
  '87804', // Rapid flu test
  '87880', // Rapid strep test
  '73610', // Ankle X-ray
  '29540', // Ankle strapping
  
  // Emergency Room
  '99284', // ER visit - high complexity
  '99283', // ER visit - moderate complexity
  '93010', // EKG
  '71045', // Chest X-ray
  '74177', // CT abdomen
  '80053', // Comprehensive metabolic panel
  '84443', // Troponin test
  '85025', // Complete blood count
  '81001', // Urinalysis
  
  // Primary Care
  '99395', // Preventive visit
  '80061', // Lipid panel
  '83036', // Hemoglobin A1C
  '82947', // Glucose test
];

// Houston area providers to look for
const HOUSTON_KEYWORDS = [
  'houston', 'memorial hermann', 'methodist', 'kelsey', 'seybold',
  'st luke', 'texas children', 'ben taub', 'harris health',
  'cvs', 'walgreens', 'htx', '77001', '77002', '77003', '77004', '77005'
];

interface ParsedRate {
  billing_code: string;
  billing_code_type: string;
  provider_name: string;
  provider_npi: string;
  negotiated_rate: number;
  billing_class: string;
}

async function parseTestMRF() {
  console.log('🚀 Parsing BCBS Texas MRF file...\n');
  
  try {
    const filePath = 'data/tx-blue-choice.json.gz';
    
    // Read and decompress
    console.log('📂 Reading compressed file...');
    const compressed = await fs.promises.readFile(filePath);
    
    console.log('🔓 Decompressing...');
    const decompressed = await gunzip(compressed);
    
    console.log('📊 Parsing JSON...');
    const data = JSON.parse(decompressed.toString());
    
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
    
    // Parse rates for target CPT codes
    const targetRates: ParsedRate[] = [];
    const houstonRates: ParsedRate[] = [];
    const cptCodeCounts = new Map<string, number>();
    
    console.log('\n🔍 Searching for target CPT codes...');
    
    // Build provider reference map if exists
    const providerMap = new Map();
    if (data.provider_references) {
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
    }
    console.log(`  Provider references: ${providerMap.size}`);
    
    // Process each billing code
    let processed = 0;
    for (const item of data.in_network) {
      processed++;
      
      if (processed % 1000 === 0) {
        console.log(`  Processed ${processed}/${data.in_network.length} items...`);
      }
      
      const billingCode = item.billing_code;
      
      // Skip if not a target CPT code
      if (!TARGET_CPT_CODES.includes(billingCode)) {
        continue;
      }
      
      // Track CPT code occurrences
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
                  
                  targetRates.push(rate);
                  
                  // Check if Houston provider
                  const nameLower = provider.name.toLowerCase();
                  if (HOUSTON_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
                    houstonRates.push(rate);
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
                  
                  targetRates.push(rate);
                  
                  // Check if Houston provider
                  const nameLower = groupName.toLowerCase();
                  if (HOUSTON_KEYWORDS.some(keyword => nameLower.includes(keyword))) {
                    houstonRates.push(rate);
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
    console.log(`Target CPT codes found: ${cptCodeCounts.size} of ${TARGET_CPT_CODES.length}`);
    console.log(`Total rates extracted: ${targetRates.length}`);
    console.log(`Houston area rates: ${houstonRates.length}`);
    
    // Show CPT code breakdown
    console.log('\n📋 CPT Codes Found:');
    for (const [code, count] of cptCodeCounts) {
      console.log(`  ${code}: ${count} occurrences`);
    }
    
    // Show sample rates
    if (targetRates.length > 0) {
      console.log('\n💰 Sample Rates:');
      
      // Office visit samples
      const officeVisits = targetRates.filter(r => r.billing_code === '99213');
      if (officeVisits.length > 0) {
        console.log('\n  Office Visit (99213):');
        officeVisits.slice(0, 5).forEach(rate => {
          console.log(`    ${rate.provider_name}: $${rate.negotiated_rate}`);
        });
      }
      
      // ER visit samples
      const erVisits = targetRates.filter(r => r.billing_code === '99284');
      if (erVisits.length > 0) {
        console.log('\n  ER Visit (99284):');
        erVisits.slice(0, 5).forEach(rate => {
          console.log(`    ${rate.provider_name}: $${rate.negotiated_rate}`);
        });
      }
    }
    
    // Houston providers
    if (houstonRates.length > 0) {
      console.log('\n🏥 Houston Area Providers Found:');
      const uniqueHoustonProviders = new Set(houstonRates.map(r => r.provider_name));
      Array.from(uniqueHoustonProviders).slice(0, 10).forEach(provider => {
        console.log(`  - ${provider}`);
      });
    }
    
    // Save results
    console.log('\n💾 Saving results...');
    
    // Save to local file
    await fs.promises.writeFile(
      'data/test-mrf-results.json',
      JSON.stringify({
        summary: {
          totalRates: targetRates.length,
          houstonRates: houstonRates.length,
          cptCodesFound: Array.from(cptCodeCounts.keys()),
          uniqueProviders: new Set(targetRates.map(r => r.provider_name)).size
        },
        sampleRates: targetRates.slice(0, 100),
        houstonProviders: Array.from(new Set(houstonRates.map(r => r.provider_name)))
      }, null, 2)
    );
    console.log('✅ Results saved to data/test-mrf-results.json');
    
    // Optionally save to BigQuery
    if (process.env.NEXT_PUBLIC_GCP_PROJECT_ID) {
      console.log('\n☁️  Saving to BigQuery...');
      await saveToBigQuery(targetRates);
    }
    
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
  }
}

async function saveToBigQuery(rates: ParsedRate[]) {
  try {
    // Create dataset if it doesn't exist
    const datasetId = 'insurance_rates';
    const tableId = 'mrf_test_rates';
    
    const dataset = bigquery.dataset(datasetId);
    const table = dataset.table(tableId);
    
    // Add metadata to rates
    const enrichedRates = rates.map(rate => ({
      ...rate,
      plan_name: 'BCBS Texas Blue Choice PPO',
      plan_id: 'test-plan',
      insurer: 'BCBS Texas',
      processed_at: new Date().toISOString(),
      file_source: 'test-mrf.json.gz'
    }));
    
    // Insert in batches
    const batchSize = 500;
    for (let i = 0; i < enrichedRates.length; i += batchSize) {
      const batch = enrichedRates.slice(i, i + batchSize);
      await table.insert(batch);
      console.log(`  Inserted batch ${Math.floor(i / batchSize) + 1}`);
    }
    
    console.log(`✅ Inserted ${rates.length} rates to BigQuery`);
    
  } catch (error) {
    console.log('⚠️  BigQuery save failed (table might not exist):', error instanceof Error ? error.message : error);
    console.log('💡 Run this to create the table:');
    console.log('   bq mk --table YOUR_PROJECT:insurance_rates.mrf_test_rates');
  }
}

// Run the parser
parseTestMRF();