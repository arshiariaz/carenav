// scripts/seed-pinecone.ts
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const indexName = process.env.PINECONE_INDEX_NAME || 'insurance-plans';

// Expanded list of realistic insurance plans
const plans = [
  // Aetna Plans
  {
    id: 'plan_aetna_ppo',
    name: 'Aetna Silver PPO 2500',
    summary: 'Aetna PPO plan with $2500 deductible, 80% coinsurance, $30 primary care copay, wide national network, prescription coverage.',
  },
  {
    id: 'plan_aetna_hdhp',
    name: 'Aetna Bronze HDHP',
    summary: 'Aetna high-deductible health plan, HSA eligible, $6500 deductible, 100% coverage after deductible, preventive care covered.',
  },
  
  // Blue Cross Blue Shield Plans
  {
    id: 'plan_bcbs_hmo',
    name: 'Blue Cross Blue Shield HMO Bronze',
    summary: 'Blue Cross Blue Shield BCBS HMO plan with $6000 deductible, no out-of-network coverage, $50 specialist copay, referral required.',
  },
  {
    id: 'plan_bcbs_ppo_gold',
    name: 'Blue Cross Blue Shield Gold PPO',
    summary: 'BCBS Blue Cross PPO Gold plan, $1000 deductible, $20 PCP copay, nationwide BlueCard network, out-of-network coverage.',
  },
  
  // UnitedHealthcare Plans
  {
    id: 'plan_united_epo',
    name: 'UnitedHealthcare EPO Saver',
    summary: 'UnitedHealthcare United UHC EPO plan with $4500 deductible, $40 urgent care, no PCP requirement, in-network only.',
  },
  {
    id: 'plan_united_pos',
    name: 'UnitedHealthcare POS Silver',
    summary: 'United Healthcare UHC Point of Service plan, $3000 deductible, flexibility to see out-of-network providers, $35 PCP copay.',
  },
  
  // Kaiser Permanente Plans
  {
    id: 'plan_kp_gold',
    name: 'Kaiser Permanente Gold',
    summary: 'Kaiser KP Gold plan with low out-of-pocket costs, $20 PCP visits, integrated pharmacy and lab services, California coverage.',
  },
  {
    id: 'plan_kp_bronze',
    name: 'Kaiser Permanente Bronze 60',
    summary: 'Kaiser Bronze plan, $6300 deductible, preventive care covered, integrated care model, pharmacy benefits included.',
  },
  
  // Cigna Plans
  {
    id: 'plan_cigna_high_deductible',
    name: 'Cigna Connect Bronze HSA',
    summary: 'Cigna high-deductible plan compatible with HSA, $7500 deductible, 100% coverage after deductible, preventive care covered.',
  },
  {
    id: 'plan_cigna_ppo',
    name: 'Cigna PPO Platinum',
    summary: 'Cigna PPO premium plan, $500 deductible, $15 PCP copay, extensive network, comprehensive prescription coverage.',
  },
  
  // Anthem Plans
  {
    id: 'plan_anthem_hsa_2800',
    name: 'Anthem $2800 HSA Plan National BlueCard PPO',
    summary: 'Anthem HSA-eligible high deductible health plan HDHP with $2800 deductible, BlueCard PPO network, preventive care covered, prescription coverage included.',
  },
  {
    id: 'plan_anthem_hmo',
    name: 'Anthem HMO Silver',
    summary: 'Anthem HMO plan, $3500 deductible, $30 primary care, specialist referral required, California network.',
  },
  {
    id: 'plan_anthem_ppo',
    name: 'Anthem PPO Gold',
    summary: 'Anthem PPO flexible plan, $1500 deductible, out-of-network coverage, $25 PCP copay, dental and vision included.',
  },
  
  // Humana Plans
  {
    id: 'plan_humana_hmo',
    name: 'Humana HMO Bronze',
    summary: 'Humana HMO affordable plan, $6000 deductible, $60 specialist visit, prescription coverage, preventive care included.',
  },
  {
    id: 'plan_humana_ppo',
    name: 'Humana PPO Silver',
    summary: 'Humana PPO plan with $2800 deductible, nationwide network, $40 urgent care copay, telehealth included.',
  },
];

async function run() {
  console.log(`🚀 Seeding Pinecone index: ${indexName}...`);
  
  try {
    const index = pinecone.index(indexName);
    
    // Process in batches to avoid rate limits
    const batchSize = 5;
    let processedCount = 0;
    
    for (let i = 0; i < plans.length; i += batchSize) {
      const batch = plans.slice(i, i + batchSize);
      
      const vectors = await Promise.all(
        batch.map(async (plan) => {
          // Create embedding from plan summary
          const embedding = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: plan.summary,
          });

          return {
            id: plan.id,
            values: embedding.data[0].embedding,
            metadata: {
              name: plan.name,
              summary: plan.summary,
            },
          };
        })
      );

      // Upsert batch to Pinecone
      await index.upsert(vectors);
      processedCount += vectors.length;
      console.log(`  ✓ Processed ${processedCount}/${plans.length} plans`);
      
      // Small delay to respect rate limits
      if (i + batchSize < plans.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`✅ Successfully seeded ${plans.length} plans into ${indexName}`);
    
    // Verify the index stats
    const stats = await index.describeIndexStats();
    console.log(`📊 Index stats:`, {
      dimension: stats.dimension,
      totalVectors: stats.totalRecordCount,
    });
    
  } catch (error) {
    console.error('❌ Error seeding Pinecone:', error);
    throw error;
  }
}

// Run the script
run().catch((err) => {
  console.error('❌ Pinecone seed script failed:', err);
  process.exit(1);
});