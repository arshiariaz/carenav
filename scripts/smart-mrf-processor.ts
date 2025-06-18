// scripts/smart-mrf-processor.ts
import * as dotenv from 'dotenv';
import { BigQuery } from '@google-cloud/bigquery';
// import { PubSub } from '@google-cloud/pubsub'; // Commented out for now
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

dotenv.config({ path: '.env.local' });

// Extended CPT codes covering 90%+ of common healthcare needs
const ESSENTIAL_CPT_CODES = {
  // Office Visits (Most Common)
  '99201-99205': 'New patient office visits',
  '99211-99215': 'Established patient office visits',
  '99381-99387': 'Preventive care visits (new patient)',
  '99391-99397': 'Preventive care visits (established)',
  
  // Emergency & Urgent Care
  '99281-99285': 'Emergency room visits',
  '99051': 'Service during regular hours in addition to basic service',
  
  // Lab Tests (High Volume)
  '80053': 'Comprehensive metabolic panel',
  '80061': 'Lipid panel',
  '81001': 'Urinalysis',
  '85025': 'Complete blood count (CBC)',
  '87804': 'Flu test',
  '87880': 'Strep test',
  '87426': 'COVID-19 test',
  
  // Imaging
  '71045-71048': 'Chest X-ray',
  '73610': 'Ankle X-ray',
  '74177': 'CT abdomen/pelvis',
  '70450': 'CT head/brain',
  '72148': 'MRI lumbar spine',
  
  // Common Procedures
  '93000': 'EKG',
  '96372': 'Therapeutic injection',
  '20610': 'Arthrocentesis (joint injection)',
  '11042': 'Debridement',
  '12001-12018': 'Simple wound repair',
  
  // Mental Health
  '90834': 'Psychotherapy 45 min',
  '90837': 'Psychotherapy 60 min',
  '90791': 'Psychiatric evaluation',
  
  // Preventive Services
  '77067': 'Mammography',
  '45378': 'Colonoscopy',
  '88305': 'Pap smear'
};

interface MRFFile {
  url: string;
  description: string;
  state?: string;
  plans?: any[];
  priority?: 'high' | 'normal' | 'low';
}

interface ProcessingJob {
  fileUrl: string;
  targetCPTs: string[];
  priority: string;
  retryCount?: number;
}

interface ParsedRate {
  billing_code: string;
  billing_code_type: string;
  provider_name: string;
  provider_npi: string;
  provider_tin: string;
  provider_state: string;
  provider_zip: string;
  negotiated_rate: number;
  billing_class: string;
  plan_name: string;
  plan_id: string;
  reporting_entity: string;
  loaded_at: string;
}

export class SmartMRFProcessor {
  private bigquery: BigQuery;
  // private pubsub: PubSub; // Commented out for now
  private projectId: string;
  private processedFiles: Set<string> = new Set();
  
  constructor() {
    this.projectId = process.env.NEXT_PUBLIC_GCP_PROJECT_ID || 'carenav-health';
    this.bigquery = new BigQuery({ projectId: this.projectId });
    // this.pubsub = new PubSub({ projectId: this.projectId }); // Commented out for now
  }
  
  /**
   * Analyze BCBS index file and prioritize files for processing
   */
  async analyzeIndex(indexPath: string, maxFiles: number = 10): Promise<MRFFile[]> {
    console.log('🔍 Analyzing BCBS index file...');
    
    const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const allFiles: any[] = indexData.reporting_structure || [];
    
    // Categorize files
    const texasFiles: MRFFile[] = [];
    const multiStateFiles: MRFFile[] = [];
    const otherFiles: MRFFile[] = [];
    
    for (const file of allFiles) {
      const desc = (file.description || '').toLowerCase();
      const url = file.location || '';
      
      // Extract state from URL or description
      const state = this.extractState(url, desc);
      
      const mrfFile: MRFFile = {
        url,
        description: file.description || 'Unknown',
        state,
        plans: file.in_network_files || []
      };
      
      // Prioritize Texas files
      if (state === 'TX' || desc.includes('texas') || desc.includes(' tx ')) {
        mrfFile.priority = 'high';
        texasFiles.push(mrfFile);
      } else if (desc.includes('multi-state') || desc.includes('national')) {
        mrfFile.priority = 'normal';
        multiStateFiles.push(mrfFile);
      } else {
        mrfFile.priority = 'low';
        otherFiles.push(mrfFile);
      }
    }
    
    console.log(`📊 File Analysis:
    - Texas-specific: ${texasFiles.length}
    - Multi-state: ${multiStateFiles.length}
    - Other states: ${otherFiles.length}`);
    
    // Return prioritized list
    const prioritized = [
      ...texasFiles.slice(0, Math.ceil(maxFiles * 0.6)),  // 60% Texas files
      ...multiStateFiles.slice(0, Math.ceil(maxFiles * 0.3)), // 30% multi-state
      ...otherFiles.slice(0, Math.ceil(maxFiles * 0.1))  // 10% other
    ];
    
    return prioritized.slice(0, maxFiles);
  }
  
  /**
   * Extract state from URL or description
   */
  private extractState(url: string, description: string): string {
    // Common state patterns in URLs
    const urlMatch = url.match(/[_-]([A-Z]{2})[_-]/);
    if (urlMatch) return urlMatch[1];
    
    // State names in description
    const stateMap: Record<string, string> = {
      'texas': 'TX',
      'california': 'CA',
      'new york': 'NY',
      'florida': 'FL',
      'illinois': 'IL'
    };
    
    const descLower = description.toLowerCase();
    for (const [name, code] of Object.entries(stateMap)) {
      if (descLower.includes(name)) return code;
    }
    
    // Check for state codes
    const stateCodeMatch = description.match(/\b([A-Z]{2})\b/);
    if (stateCodeMatch) return stateCodeMatch[1];
    
    return 'UNKNOWN';
  }
  
  /**
   * Create processing jobs for selected files (PubSub disabled for now)
   */
  async createProcessingJobs(files: MRFFile[]): Promise<void> {
    console.log(`📝 Would create ${files.length} processing jobs (PubSub disabled)`);
    
    // const topic = this.pubsub.topic('mrf-processing');
    
    for (const file of files) {
      console.log(`✅ Would queue: ${file.description} (${file.priority} priority)`);
      // Actual PubSub publishing commented out for now
    }
  }
  
  /**
   * Process a single MRF file (called by Cloud Function)
   */
  async processMRFFile(job: ProcessingJob): Promise<number> {
    console.log(`🔄 Processing MRF: ${job.fileUrl}`);
    
    try {
      // Download file in chunks
      const response = await axios.get(job.fileUrl, {
        responseType: 'stream',
        timeout: 300000 // 5 minutes
      });
      
      // Stream process the file
      const rates = await this.streamProcessMRF(response.data, job.targetCPTs);
      
      // Batch insert to BigQuery
      if (rates.length > 0) {
        await this.batchInsertRates(rates);
        console.log(`✅ Inserted ${rates.length} rates`);
      }
      
      return rates.length;
      
    } catch (error) {
      console.error(`❌ Error processing ${job.fileUrl}:`, error);
      
      // Retry logic
      if (job.retryCount && job.retryCount < 3) {
        job.retryCount++;
        await this.requeueJob(job);
      }
      
      throw error;
    }
  }
  
  /**
   * Stream process MRF file to handle large files
   */
  private async streamProcessMRF(stream: NodeJS.ReadableStream, targetCPTs: string[]): Promise<ParsedRate[]> {
    const rates: ParsedRate[] = [];
    const targetCPTSet = new Set(targetCPTs);
    
    return new Promise((resolve, reject) => {
      let buffer = '';
      
      stream.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        
        // Process complete JSON objects
        let startIndex = 0;
        let openBraces = 0;
        
        for (let i = 0; i < buffer.length; i++) {
          if (buffer[i] === '{') openBraces++;
          if (buffer[i] === '}') openBraces--;
          
          if (openBraces === 0 && buffer[i] === '}') {
            // Found complete object
            try {
              const jsonStr = buffer.substring(startIndex, i + 1);
              const obj = JSON.parse(jsonStr);
              
              // Extract rates if it's a rate object
              if (obj.billing_code && targetCPTSet.has(obj.billing_code)) {
                const extractedRates = this.extractRatesFromObject(obj);
                rates.push(...extractedRates);
              }
              
              startIndex = i + 1;
            } catch (e) {
              // Not valid JSON, continue
            }
          }
        }
        
        // Keep unprocessed data
        buffer = buffer.substring(startIndex);
      });
      
      stream.on('end', () => resolve(rates));
      stream.on('error', reject);
    });
  }
  
  /**
   * Extract rates from MRF object
   */
  private extractRatesFromObject(obj: any): ParsedRate[] {
    const rates: ParsedRate[] = [];
    
    if (!obj.negotiated_rates) return rates;
    
    for (const rateGroup of obj.negotiated_rates) {
      const providerGroups = rateGroup.provider_groups || [];
      
      for (const provider of providerGroups) {
        const npis = provider.npi || [];
        
        for (const price of (rateGroup.negotiated_prices || [])) {
          if (price.negotiated_rate && price.negotiated_rate > 0) {
            rates.push({
              billing_code: obj.billing_code,
              billing_code_type: obj.billing_code_type || 'CPT',
              provider_name: provider.name || 'Unknown',
              provider_npi: npis[0] || 'Unknown',
              provider_tin: provider.tin?.value || 'Unknown',
              provider_state: this.extractProviderState(provider),
              provider_zip: provider.address?.zip || 'Unknown',
              negotiated_rate: price.negotiated_rate,
              billing_class: price.billing_class || 'professional',
              plan_name: obj.plan_name || 'Unknown',
              plan_id: obj.plan_id || 'Unknown',
              reporting_entity: obj.reporting_entity || 'BCBS',
              loaded_at: new Date().toISOString()
            });
          }
        }
      }
    }
    
    return rates;
  }
  
  /**
   * Extract provider state from address
   */
  private extractProviderState(provider: any): string {
    if (provider.address?.state) return provider.address.state;
    
    // Try to extract from address string
    const address = provider.address?.street || '';
    const stateMatch = address.match(/,\s*([A-Z]{2})\s*\d{5}/);
    if (stateMatch) return stateMatch[1];
    
    return 'UNKNOWN';
  }
  
  /**
   * Batch insert rates to BigQuery
   */
  private async batchInsertRates(rates: ParsedRate[]): Promise<void> {
    const dataset = this.bigquery.dataset('insurance_rates');
    const table = dataset.table('bcbs_rates');
    
    // Insert in chunks of 500
    const chunkSize = 500;
    for (let i = 0; i < rates.length; i += chunkSize) {
      const chunk = rates.slice(i, i + chunkSize);
      await table.insert(chunk);
    }
  }
  
  /**
   * Requeue failed job (PubSub disabled for now)
   */
  private async requeueJob(job: ProcessingJob): Promise<void> {
    // const topic = this.pubsub.topic('mrf-processing');
    // await topic.publish(Buffer.from(JSON.stringify(job)));
    console.log('Would requeue job (PubSub disabled)');
  }
  
  /**
   * Monitor processing progress
   */
  async getProcessingStats(): Promise<any> {
    const query = `
      SELECT 
        DATE(loaded_at) as load_date,
        provider_state,
        COUNT(DISTINCT billing_code) as unique_cpts,
        COUNT(*) as total_rates,
        COUNT(DISTINCT plan_name) as unique_plans
      FROM \`${this.projectId}.insurance_rates.bcbs_rates\`
      WHERE loaded_at >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 7 DAY)
      GROUP BY load_date, provider_state
      ORDER BY load_date DESC, total_rates DESC
    `;
    
    const [rows] = await this.bigquery.query(query);
    return rows;
  }
}

// CLI usage
async function main() {
  const processor = new SmartMRFProcessor();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'analyze':
      const indexPath = process.argv[3] || '2025-05-20_Blue-Cross-and-Blue-Shield-of-Texas_index.json';
      const files = await processor.analyzeIndex(indexPath, 20);
      console.log('\n📋 Files to process:', files);
      break;
      
    case 'queue':
      const filesToQueue = await processor.analyzeIndex(
        '2025-05-20_Blue-Cross-and-Blue-Shield-of-Texas_index.json',
        10
      );
      await processor.createProcessingJobs(filesToQueue);
      break;
      
    case 'stats':
      const stats = await processor.getProcessingStats();
      console.table(stats);
      break;
      
    default:
      console.log(`
Usage:
  npm run smart-mrf analyze [index-file]  # Analyze index and prioritize files
  npm run smart-mrf queue                  # Queue files for processing
  npm run smart-mrf stats                  # View processing statistics
      `);
  }
}

if (require.main === module) {
  main().catch(console.error);
}