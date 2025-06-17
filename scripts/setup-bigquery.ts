// scripts/setup-bigquery.ts
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function setupBigQuery() {
  console.log('🔧 Setting up BigQuery...');
  
  try {
    // Initialize BigQuery with proper credentials
    const bigquery = new BigQuery({
      projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID,
      // Use keyFilename if you have a service account file
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json') 
        ? process.env.GOOGLE_APPLICATION_CREDENTIALS 
        : undefined,
      // Or use credentials object if you have JSON in env var
      credentials: !process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json')
        ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}')
        : undefined
    });

    // Test connection
    const [datasets] = await bigquery.getDatasets();
    console.log('✅ BigQuery connected successfully');
    console.log(`Found ${datasets.length} datasets`);

    // Create dataset if it doesn't exist
    const datasetId = 'insurance_rates';
    try {
      await bigquery.createDataset(datasetId);
      console.log(`✅ Created dataset: ${datasetId}`);
    } catch (error: any) {
      if (error.code === 409) {
        console.log(`✅ Dataset ${datasetId} already exists`);
      } else {
        throw error;
      }
    }

    // Create tables with proper schema
    const dataset = bigquery.dataset(datasetId);
    
    // 1. Parsed MRF rates table
    const ratesTableSchema = [
      { name: 'billing_code', type: 'STRING', mode: 'REQUIRED' },
      { name: 'billing_code_type', type: 'STRING' },
      { name: 'provider_name', type: 'STRING' },
      { name: 'provider_npi', type: 'STRING' },
      { name: 'provider_tin', type: 'STRING' },
      { name: 'negotiated_rate', type: 'FLOAT64' },
      { name: 'billing_class', type: 'STRING' },
      { name: 'plan_name', type: 'STRING' },
      { name: 'plan_id', type: 'STRING' },
      { name: 'reporting_entity', type: 'STRING' },
      { name: 'loaded_at', type: 'TIMESTAMP' },
      { name: 'file_source', type: 'STRING' }
    ];

    try {
      await dataset.createTable('parsed_mrf_rates', { 
        schema: ratesTableSchema,
        timePartitioning: {
          type: 'DAY',
          field: 'loaded_at'
        },
        clustering: {
          fields: ['billing_code', 'provider_npi', 'plan_id']
        }
      });
      console.log('✅ Created table: parsed_mrf_rates');
    } catch (error: any) {
      if (error.code === 409) {
        console.log('✅ Table parsed_mrf_rates already exists');
      } else {
        throw error;
      }
    }

    // 2. OCR logs table (if it doesn't exist)
    const ocrTableSchema = [
      { name: 'timestamp', type: 'TIMESTAMP' },
      { name: 'insurance', type: 'STRING' },
      { name: 'member_id', type: 'STRING' },
      { name: 'group', type: 'STRING' },
      { name: 'confidence', type: 'FLOAT64' }
    ];

    try {
      await dataset.createTable('ocr_logs', { schema: ocrTableSchema });
      console.log('✅ Created table: ocr_logs');
    } catch (error: any) {
      if (error.code === 409) {
        console.log('✅ Table ocr_logs already exists');
      }
    }

    console.log('\n🎯 BigQuery setup complete!');
    
  } catch (error) {
    console.error('❌ BigQuery setup failed:', error);
    
    console.log('\n🔧 Troubleshooting steps:');
    console.log('1. Check your .env.local file has:');
    console.log('   NEXT_PUBLIC_GCP_PROJECT_ID=your-project-id');
    console.log('   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json');
    console.log('2. Or set credentials as JSON string in env var');
    console.log('3. Make sure the service account has BigQuery Admin role');
  }
}

setupBigQuery().catch(console.error);