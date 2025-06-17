// scripts/parse-mrf-enhanced.ts
import * as fs from 'fs';
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

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

class EnhancedMRFParser {
  private rates: ParsedRate[] = [];
  private bigquery: BigQuery | null = null;
  
  constructor() {
    this.initializeBigQuery();
  }
  
  private initializeBigQuery() {
    try {
      // Only initialize if we have credentials
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS && process.env.NEXT_PUBLIC_GCP_PROJECT_ID) {
        this.bigquery = new BigQuery({
          projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID,
          keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json') 
            ? process.env.GOOGLE_APPLICATION_CREDENTIALS 
            : undefined,
          credentials: !process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json')
            ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS)
            : undefined
        });
        console.log('✅ BigQuery initialized');
      } else {
        console.log('⚠️  BigQuery credentials not found - will save locally only');
      }
    } catch (error) {
      console.log('⚠️  BigQuery initialization failed - will save locally only');
      console.log('Error:', error);
      this.bigquery = null;
    }
  }
  
  parseMRFFile(filePath: string): ParsedRate[] {
    console.log(`\n📂 Parsing ${filePath}...`);
    
    try {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      
      // Extract basic plan info
      const planName = data.plan_name || data.name || 'Unknown Plan';
      const planId = data.plan_id || 'unknown';
      const reportingEntity = data.reporting_entity_name || 'unknown';
      
      console.log(`📋 Plan: ${planName} (${planId})`);
      console.log(`🏢 Entity: ${reportingEntity}`);
      
      // Handle different MRF formats
      const parsedRates = this.parseInNetworkRates(data, {
        planName,
        planId,
        reportingEntity,
        fileSource: filePath
      });
      
      this.rates.push(...parsedRates);
      console.log(`💰 Extracted ${parsedRates.length} rates from this file`);
      
      return parsedRates;
      
    } catch (error) {
      console.error(`❌ Error parsing ${filePath}:`, error);
      return [];
    }
  }
  
  private parseInNetworkRates(data: any, metadata: any): ParsedRate[] {
    const rates: ParsedRate[] = [];
    
    if (!data.in_network) {
      console.log('⚠️  No in_network data found');
      return rates;
    }
    
    // Build provider lookup map
    const providerMap = this.buildProviderMap(data.provider_references || []);
    console.log(`👥 Found ${providerMap.size} provider references`);
    
    // Process each service/billing code
    data.in_network.forEach((item: any, index: number) => {
      try {
        const billingCode = item.billing_code;
        const billingCodeType = item.billing_code_type || 'CPT';
        const description = item.description || '';
        
        if (!billingCode) {
          console.log(`⚠️  Skipping item ${index}: no billing code`);
          return;
        }
        
        // Handle different negotiated_rates structures
        const negotiatedRates = item.negotiated_rates || [];
        
        negotiatedRates.forEach((rateGroup: any) => {
          try {
            // Handle both old and new format
            const providerRefs = rateGroup.provider_references || [];
            const providerGroups = rateGroup.provider_groups || [];
            
            // Process provider references (new format)
            providerRefs.forEach((ref: string) => {
              const provider = providerMap.get(ref);
              if (!provider) return;
              
              const negotiatedPrices = rateGroup.negotiated_prices || [];
              negotiatedPrices.forEach((price: any) => {
                if (price.negotiated_rate && price.negotiated_rate > 0) {
                  rates.push({
                    billing_code: billingCode,
                    billing_code_type: billingCodeType,
                    provider_name: provider.name,
                    provider_npi: provider.npi,
                    provider_tin: provider.tin,
                    negotiated_rate: price.negotiated_rate,
                    billing_class: price.billing_class || 'professional',
                    plan_name: metadata.planName,
                    plan_id: metadata.planId,
                    reporting_entity: metadata.reportingEntity,
                    file_source: metadata.fileSource
                  });
                }
              });
            });
            
            // Process provider groups (old format like CMS sample)
            providerGroups.forEach((group: any) => {
              const npis = group.npi || [];
              const groupName = group.name || 'Unknown Provider';
              const tin = group.tin?.value || 'unknown';
              
              npis.forEach((npi: string | number) => {
                const negotiatedPrices = rateGroup.negotiated_prices || [];
                negotiatedPrices.forEach((price: any) => {
                  if (price.negotiated_rate && price.negotiated_rate > 0) {
                    rates.push({
                      billing_code: billingCode,
                      billing_code_type: billingCodeType,
                      provider_name: groupName,
                      provider_npi: npi.toString(),
                      provider_tin: tin,
                      negotiated_rate: price.negotiated_rate,
                      billing_class: price.billing_class || 'professional',
                      plan_name: metadata.planName,
                      plan_id: metadata.planId,
                      reporting_entity: metadata.reportingEntity,
                      file_source: metadata.fileSource
                    });
                  }
                });
              });
            });
            
          } catch (error) {
            console.log(`⚠️  Error processing rate group for ${billingCode}:`, error);
          }
        });
        
      } catch (error) {
        console.log(`⚠️  Error processing item ${index}:`, error);
      }
    });
    
    return rates;
  }
  
  private buildProviderMap(providerReferences: any[]): Map<string, any> {
    const map = new Map();
    
    providerReferences.forEach((ref: any) => {
      const refId = ref.provider_reference;
      if (!refId) return;
      
      const groups = ref.provider_groups || [];
      groups.forEach((group: any) => {
        const npis = group.npi || [];
        const name = group.name || 'Unknown Provider';
        const tin = group.tin?.value || 'unknown';
        
        // Use the first NPI for this reference
        if (npis.length > 0) {
          map.set(refId, {
            name,
            npi: npis[0].toString(),
            tin,
            allNpis: npis.map((n: any) => n.toString())
          });
        }
      });
    });
    
    return map;
  }
  
  displaySummary() {
    if (this.rates.length === 0) {
      console.log('\n❌ No rates to display');
      return;
    }
    
    console.log('\n📊 Parsing Summary:');
    console.log('==================');
    
    // Overall stats
    const uniqueCodes = new Set(this.rates.map(r => r.billing_code));
    const uniqueProviders = new Set(this.rates.map(r => r.provider_npi));
    const uniquePlans = new Set(this.rates.map(r => r.plan_id));
    
    console.log(`Total rates: ${this.rates.length}`);
    console.log(`Unique CPT codes: ${uniqueCodes.size}`);
    console.log(`Unique providers: ${uniqueProviders.size}`);
    console.log(`Plans: ${uniquePlans.size}`);
    
    // Group by CPT code for detailed view
    const cptSummary = new Map();
    
    this.rates.forEach(rate => {
      if (!cptSummary.has(rate.billing_code)) {
        cptSummary.set(rate.billing_code, {
          providers: new Set(),
          rates: [],
          type: rate.billing_code_type
        });
      }
      
      const summary = cptSummary.get(rate.billing_code);
      summary.providers.add(rate.provider_name);
      summary.rates.push({
        provider: rate.provider_name,
        npi: rate.provider_npi,
        rate: rate.negotiated_rate
      });
    });
    
    console.log('\n📋 Top 10 CPT Codes by Provider Count:');
    const sortedCPTs = Array.from(cptSummary.entries())
      .sort(([,a], [,b]) => b.providers.size - a.providers.size)
      .slice(0, 10);
    
    sortedCPTs.forEach(([cpt, summary]) => {
      const rates = summary.rates.map((r: any) => r.rate);
      const minRate = Math.min(...rates);
      const maxRate = Math.max(...rates);
      const avgRate = rates.reduce((a: number, b: number) => a + b, 0) / rates.length;
      
      console.log(`\n📌 ${summary.type} ${cpt}`);
      console.log(`   Providers: ${summary.providers.size}`);
      console.log(`   Rate range: $${minRate.toFixed(2)} - $${maxRate.toFixed(2)}`);
      console.log(`   Average: $${avgRate.toFixed(2)}`);
    });
  }
  
  async saveToLocalFile() {
    if (this.rates.length === 0) {
      console.log('⚠️  No rates to save');
      return;
    }
    
    const outputPath = 'data/parsed-rates.json';
    
    // Ensure data directory exists
    if (!fs.existsSync('data')) {
      fs.mkdirSync('data');
    }
    
    fs.writeFileSync(outputPath, JSON.stringify(this.rates, null, 2));
    console.log(`\n💾 Saved ${this.rates.length} rates to ${outputPath}`);
    
    // Also save a summary
    const summaryPath = 'data/parsing-summary.json';
    const summary = {
      totalRates: this.rates.length,
      uniqueCPTCodes: [...new Set(this.rates.map(r => r.billing_code))],
      uniqueProviders: [...new Set(this.rates.map(r => r.provider_npi))],
      plans: [...new Set(this.rates.map(r => r.plan_id))],
      parsedAt: new Date().toISOString()
    };
    
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`📄 Saved summary to ${summaryPath}`);
  }
  
  async saveToBigQuery() {
    if (!this.bigquery) {
      console.log('\n⚠️  Skipping BigQuery (not configured)');
      return;
    }
    
    if (this.rates.length === 0) {
      console.log('\n⚠️  No rates to save to BigQuery');
      return;
    }
    
    try {
      console.log('\n☁️  Saving to BigQuery...');
      
      const dataset = this.bigquery.dataset('insurance_rates');
      const table = dataset.table('parsed_mrf_rates');
      
      // Add timestamp to all rows
      const rows = this.rates.map(rate => ({
        ...rate,
        loaded_at: new Date().toISOString()
      }));
      
      // Insert in batches to avoid timeout
      const batchSize = 1000;
      let inserted = 0;
      
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        await table.insert(batch);
        inserted += batch.length;
        console.log(`  Inserted ${inserted}/${rows.length} rows...`);
      }
      
      console.log(`✅ Successfully inserted ${inserted} rows to BigQuery`);
      
    } catch (error) {
      console.error('❌ BigQuery insert error:', error);
      console.log('💾 Data saved locally as backup');
    }
  }
  
  // Get rates for specific CPT codes and providers
  findRates(cptCodes: string[], providerNpis?: string[]): ParsedRate[] {
    return this.rates.filter(rate => {
      const cptMatch = cptCodes.includes(rate.billing_code);
      const providerMatch = !providerNpis || providerNpis.includes(rate.provider_npi);
      return cptMatch && providerMatch;
    });
  }
}

// Main execution
async function main() {
  console.log('🚀 Enhanced MRF Parser Starting...\n');
  
  const parser = new EnhancedMRFParser();
  
  // Parse all available files
  const files = [
    'data/cms-sample-in-network.json',
    'data/houston-mock-mrf.json'
  ];
  
  let totalParsed = 0;
  
  for (const file of files) {
    if (fs.existsSync(file)) {
      const fileRates = parser.parseMRFFile(file);
      totalParsed += fileRates.length;
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  }
  
  console.log(`\n🎯 Total rates parsed: ${totalParsed}`);
  
  // Display summary
  parser.displaySummary();
  
  // Save results
  await parser.saveToLocalFile();
  await parser.saveToBigQuery();
  
  // Test the rate lookup
  console.log('\n🔍 Testing rate lookup:');
  const fluRates = parser.findRates(['99213', '87804']);
  console.log(`Found ${fluRates.length} rates for flu treatment codes`);
  
  fluRates.forEach(rate => {
    console.log(`  ${rate.provider_name}: CPT ${rate.billing_code} = $${rate.negotiated_rate}`);
  });
}

main().catch(console.error);