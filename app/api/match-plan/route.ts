// app/api/match-plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';
import { BigQuery } from '@google-cloud/bigquery';

// Initialize clients
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

const bigquery = new BigQuery({
  projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID || 'carenav-health',
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json') 
    ? process.env.GOOGLE_APPLICATION_CREDENTIALS 
    : undefined,
  credentials: !process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json')
    ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}')
    : undefined
});

export async function POST(request: NextRequest) {
  try {
    const { companyName, groupNumber, payerId } = await request.json();
    
    console.log('🔍 Searching for plan:', { companyName, groupNumber, payerId });
    
    // Step 1: Try exact match in BigQuery
    const exactMatch = await searchBigQueryExact(companyName, groupNumber, payerId);
    if (exactMatch) {
      console.log('✅ Found exact match in database');
      return NextResponse.json({
        success: true,
        plan: formatBigQueryPlan(exactMatch),
        matchType: 'exact',
        confidence: 1.0
      });
    }
    
    // Step 2: Try fuzzy match in BigQuery (broader search)
    const fuzzyMatch = await searchBigQueryFuzzy(companyName, groupNumber);
    if (fuzzyMatch) {
      console.log('🔄 Found fuzzy match in database');
      return NextResponse.json({
        success: true,
        plan: formatBigQueryPlan(fuzzyMatch),
        matchType: 'fuzzy',
        confidence: 0.8
      });
    }
    
    // Step 3: Try to find ANY plan from the same carrier
    const carrierMatch = await findCarrierPlan(companyName);
    if (carrierMatch) {
      console.log('🏢 Found plan from same carrier');
      // Use OpenAI to adjust the benefits based on what we know
      const adjustedPlan = await adjustPlanWithOpenAI(carrierMatch, groupNumber, payerId);
      return NextResponse.json({
        success: true,
        plan: adjustedPlan,
        matchType: 'carrier_adjusted',
        confidence: 0.6
      });
    }
    
    // Step 4: Use OpenAI to generate realistic plan based on carrier and identifiers
    console.log('🤖 Using OpenAI to generate plan details...');
    const aiGeneratedPlan = await generatePlanWithOpenAI(companyName, groupNumber, payerId);
    
    return NextResponse.json({
      success: true,
      plan: aiGeneratedPlan,
      matchType: 'ai_generated',
      confidence: 0.5,
      message: 'Plan details estimated based on carrier and plan identifiers'
    });
    
  } catch (error) {
    console.error('Plan matching error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Plan matching failed' 
    }, { status: 500 });
  }
}

// Exact match search
async function searchBigQueryExact(carrier: string, groupNumber?: string, payerId?: string) {
  if (!groupNumber && !payerId) return null;
  
  try {
    const query = `
      SELECT *
      FROM \`${process.env.NEXT_PUBLIC_GCP_PROJECT_ID || 'carenav-health'}.insurance_plans.plan_benefits\`
      WHERE LOWER(carrier) LIKE CONCAT('%', LOWER(@carrier), '%')
        AND (
          (group_number = @groupNumber AND @groupNumber IS NOT NULL) OR
          (payer_id = @payerId AND @payerId IS NOT NULL)
        )
      ORDER BY last_updated DESC
      LIMIT 1
    `;
    
    const [rows] = await bigquery.query({
      query,
      params: { carrier, groupNumber: groupNumber || null, payerId: payerId || null }
    });
    
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('BigQuery exact search error:', error);
    return null;
  }
}

// Fuzzy match search
async function searchBigQueryFuzzy(carrier: string, groupNumber?: string) {
  try {
    const query = `
      SELECT *,
        CASE
          WHEN LOWER(carrier) = LOWER(@carrier) THEN 1.0
          WHEN LOWER(carrier) LIKE CONCAT('%', LOWER(@carrier), '%') THEN 0.8
          WHEN LOWER(@carrier) LIKE CONCAT('%', LOWER(carrier), '%') THEN 0.7
          ELSE 0.5
        END as match_score
      FROM \`${process.env.NEXT_PUBLIC_GCP_PROJECT_ID || 'carenav-health'}.insurance_plans.plan_benefits\`
      WHERE (
        LOWER(carrier) LIKE CONCAT('%', LOWER(@carrier), '%') OR
        LOWER(@carrier) LIKE CONCAT('%', LOWER(carrier), '%') OR
        (plan_name LIKE CONCAT('%', @groupPart, '%') AND @groupPart IS NOT NULL)
      )
      ORDER BY match_score DESC, last_updated DESC
      LIMIT 1
    `;
    
    // Extract potential plan identifier from group number
    const groupPart = groupNumber ? groupNumber.substring(0, 4) : null;
    
    const [rows] = await bigquery.query({
      query,
      params: { carrier, groupPart }
    });
    
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('BigQuery fuzzy search error:', error);
    return null;
  }
}

// Find any plan from the same carrier
async function findCarrierPlan(carrier: string) {
  try {
    const query = `
      SELECT *
      FROM \`${process.env.NEXT_PUBLIC_GCP_PROJECT_ID || 'carenav-health'}.insurance_plans.plan_benefits\`
      WHERE LOWER(carrier) LIKE CONCAT('%', LOWER(@carrier), '%')
      ORDER BY last_updated DESC
      LIMIT 1
    `;
    
    const [rows] = await bigquery.query({
      query,
      params: { carrier }
    });
    
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Find carrier plan error:', error);
    return null;
  }
}

// Adjust existing plan using OpenAI
async function adjustPlanWithOpenAI(basePlan: any, groupNumber?: string, payerId?: string) {
  const prompt = `Based on this insurance plan template and the specific identifiers, adjust the benefits:

Base Plan: ${basePlan.carrier} ${basePlan.plan_type}
Current Deductible: $${basePlan.deductible_individual}
Current Copays: PCP $${basePlan.pcp_copay}, Specialist $${basePlan.specialist_copay}, ER $${basePlan.er_copay}

Specific Identifiers:
- Group Number: ${groupNumber || 'Unknown'}
- Payer ID: ${payerId || 'Unknown'}

Common patterns:
- Group numbers starting with low digits (1-3) often indicate richer benefits
- "GOLD", "SILVER", "BRONZE" in identifiers indicate ACA metal tiers
- "HSA" or "HDHP" indicate high-deductible plans
- Corporate group numbers often have better benefits than individual plans

Return ONLY a JSON object with adjusted values:
{
  "deductible_individual": number,
  "oop_max_individual": number,
  "pcp_copay": number or null (null if deductible applies),
  "specialist_copay": number or null,
  "urgent_care_copay": number or null,
  "er_copay": number,
  "confidence_note": "Brief explanation of adjustments"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    
    const adjustments = JSON.parse(response.choices[0].message.content!);
    
    return {
      ...formatBigQueryPlan(basePlan),
      deductible: adjustments.deductible_individual,
      oopMax: adjustments.oop_max_individual,
      copays: {
        primaryCare: adjustments.pcp_copay,
        specialist: adjustments.specialist_copay,
        urgentCare: adjustments.urgent_care_copay,
        emergency: adjustments.er_copay,
        generic: basePlan.rx_tier1_copay || 10
      },
      adjustmentNote: adjustments.confidence_note
    };
  } catch (error) {
    console.error('OpenAI adjustment error:', error);
    return formatBigQueryPlan(basePlan);
  }
}

// Generate complete plan using OpenAI
async function generatePlanWithOpenAI(carrier: string, groupNumber?: string, payerId?: string) {
  const prompt = `Generate realistic health insurance plan details based on these identifiers:

Carrier: ${carrier}
Group Number: ${groupNumber || 'Not provided'}
Payer ID: ${payerId || 'Not provided'}

Consider:
- ${carrier} typical plan structures and naming conventions
- Group number patterns (low numbers = richer benefits, high numbers = basic plans)
- Common employer vs individual plan differences
- Regional variations (if identifiable)
- 2024-2025 market trends

Return a JSON object with:
{
  "plan_name": "Realistic plan name based on carrier and identifiers",
  "plan_type": "HMO/PPO/EPO/POS",
  "deductible_individual": number,
  "deductible_family": number (2x individual),
  "oop_max_individual": number,
  "oop_max_family": number (2x individual),
  "pcp_copay": number or null,
  "specialist_copay": number or null,
  "urgent_care_copay": number,
  "er_copay": number,
  "rx_tier1_copay": number (generic drugs),
  "referral_required": boolean,
  "out_of_network_covered": boolean,
  "confidence_note": "Brief explanation of how you determined these values"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });
    
    const generatedPlan = JSON.parse(response.choices[0].message.content!);
    
    return {
      id: `ai-generated-${Date.now()}`,
      name: generatedPlan.plan_name,
      carrier: carrier,
      type: generatedPlan.plan_type,
      summary: `${carrier} ${generatedPlan.plan_type} plan (AI estimated)`,
      deductible: generatedPlan.deductible_individual,
      deductibleFamily: generatedPlan.deductible_family,
      oopMax: generatedPlan.oop_max_individual,
      oopMaxFamily: generatedPlan.oop_max_family,
      copays: {
        primaryCare: generatedPlan.pcp_copay,
        specialist: generatedPlan.specialist_copay,
        urgentCare: generatedPlan.urgent_care_copay,
        emergency: generatedPlan.er_copay,
        generic: generatedPlan.rx_tier1_copay
      },
      features: {
        referralRequired: generatedPlan.referral_required,
        outOfNetworkCovered: generatedPlan.out_of_network_covered,
        groupNumber: groupNumber,
        payerId: payerId
      },
      aiNote: generatedPlan.confidence_note
    };
  } catch (error) {
    console.error('OpenAI generation error:', error);
    // Last resort fallback
    return {
      id: 'fallback-plan',
      name: `${carrier} Standard Plan`,
      carrier: carrier,
      type: 'PPO',
      summary: `${carrier} estimated plan`,
      deductible: 3000,
      oopMax: 7500,
      copays: {
        primaryCare: 30,
        specialist: 60,
        urgentCare: 75,
        emergency: 350,
        generic: 15
      }
    };
  }
}

// Format BigQuery plan data
function formatBigQueryPlan(plan: any) {
  return {
    id: plan.plan_id,
    name: plan.plan_name,
    carrier: plan.carrier,
    type: plan.plan_type,
    summary: `${plan.carrier} ${plan.plan_type} - ${plan.plan_name}`,
    deductible: plan.deductible_individual || 0,
    deductibleFamily: plan.deductible_family || (plan.deductible_individual * 2),
    oopMax: plan.oop_max_individual || 0,
    oopMaxFamily: plan.oop_max_family || (plan.oop_max_individual * 2),
    copays: {
      primaryCare: plan.pcp_copay,
      specialist: plan.specialist_copay,
      urgentCare: plan.urgent_care_copay,
      emergency: plan.er_copay,
      generic: plan.rx_tier1_copay,
      brand: plan.rx_tier2_copay
    },
    features: {
      referralRequired: plan.referral_required || false,
      outOfNetworkCovered: plan.out_of_network_covered || false,
      groupNumber: plan.group_number,
      payerId: plan.payer_id
    }
  };
}