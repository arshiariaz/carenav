// app/api/match-plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const { companyName, groupNumber, payerId } = await request.json();
    
    // Create search query from insurance info
    const searchQuery = `${companyName} ${payerId || ''} ${groupNumber || ''}`.trim();
    
    console.log('Searching for plan:', searchQuery);
    
    // Generate embedding for search query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: searchQuery,
    });
    
    const queryEmbedding = embeddingResponse.data[0].embedding;
    
    // Query Pinecone
    const index = pinecone.index(process.env.PINECONE_INDEX_NAME!);
    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: 3,
      includeMetadata: true,
    });
    
    console.log('Pinecone matches:', queryResponse.matches.length);
    
    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No matching plans found' 
      });
    }
    
    // Return best match with copay data
    const bestMatch = queryResponse.matches[0];
    
    // Enhanced plan data based on the match
    const planData = {
      id: bestMatch.id,
      name: bestMatch.metadata?.name || 'Unknown Plan',
      summary: bestMatch.metadata?.summary || '',
      confidence: bestMatch.score || 0,
      // Add realistic copay data based on plan type
      copays: getCopaysForPlan(bestMatch.id as string),
      deductible: getDeductibleForPlan(bestMatch.id as string),
    };
    
    return NextResponse.json({
      success: true,
      plan: planData,
      alternativeMatches: queryResponse.matches.slice(1).map(m => ({
        id: m.id,
        name: m.metadata?.name,
        confidence: m.score
      }))
    });
    
  } catch (error) {
    console.error('Plan matching error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Plan matching failed' 
    }, { status: 500 });
  }
}

// Helper functions to return realistic copay data
function getCopaysForPlan(planId: string): any {
  const copayData: Record<string, any> = {
    'plan_aetna_ppo': {
      primaryCare: 30,
      specialist: 60,
      urgentCare: 75,
      emergency: 350,
      generic: 10,
      brand: 40
    },
    'plan_bcbs_hmo': {
      primaryCare: 25,
      specialist: 50,
      urgentCare: 65,
      emergency: 300,
      generic: 5,
      brand: 35
    },
    'plan_kp_gold': {
      primaryCare: 20,
      specialist: 40,
      urgentCare: 50,
      emergency: 250,
      generic: 10,
      brand: 30
    },
    'plan_united_epo': {
      primaryCare: 35,
      specialist: 70,
      urgentCare: 85,
      emergency: 400,
      generic: 15,
      brand: 45
    },
    'plan_cigna_high_deductible': {
      primaryCare: 0, // Pay full cost until deductible
      specialist: 0,
      urgentCare: 0,
      emergency: 0,
      generic: 10,
      brand: 40
    }
  };
  
  return copayData[planId] || {
    primaryCare: 40,
    specialist: 80,
    urgentCare: 100,
    emergency: 500,
    generic: 15,
    brand: 50
  };
}

function getDeductibleForPlan(planId: string): number {
  const deductibles: Record<string, number> = {
    'plan_aetna_ppo': 2500,
    'plan_bcbs_hmo': 6000,
    'plan_kp_gold': 1000,
    'plan_united_epo': 4500,
    'plan_cigna_high_deductible': 7500
  };
  
  return deductibles[planId] || 3000;
}