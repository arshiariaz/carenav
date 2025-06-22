// app/api/plan-assistant/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { BigQuery } from '@google-cloud/bigquery';

const openai = new OpenAI();
const bigquery = new BigQuery();

export async function POST(request: NextRequest) {
  const { question, planData } = await request.json();
  
  // Create a comprehensive prompt with plan context
  const prompt = `You are a helpful insurance benefits assistant. Answer the user's question based on their specific plan details.

Plan Information:
- Plan: ${planData.plan_name}
- Type: ${planData.plan_type}
- Deductible: $${planData.deductible_individual} individual / $${planData.deductible_family} family
- Out-of-pocket max: $${planData.oop_max_individual} individual
- PCP copay: $${planData.pcp_copay}
- Specialist copay: $${planData.specialist_copay}
- ER copay: $${planData.er_copay}
- Referral required: ${planData.referral_required ? 'Yes' : 'No'}

User Question: ${question}

Provide a clear, helpful answer in 2-3 sentences. If you're not sure, say so and suggest they contact their insurance company.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 200
  });
  
  return NextResponse.json({
    answer: response.choices[0].message.content
  });
}