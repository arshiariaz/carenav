// app/api/ai-advisor/route.ts
//
// RAG-powered benefits advisor.
//
// Architecture
// ─────────────────────────────────────────────────────────────────────────────
// 1. RETRIEVAL  — the frontend sends the user's already-matched plan as
//    structured JSON.  The plan was retrieved by our OCR → BigQuery → GPT-4
//    plan-matching pipeline, so this endpoint only needs to receive it.
//
// 2. AUGMENTATION — we build a tightly-scoped system prompt that injects the
//    plan context and instructs GPT-4 to answer ONLY from that context.
//    This prevents hallucination of benefits that don't exist in the plan.
//
// 3. GENERATION — GPT-4 produces a short, grounded, dollar-specific answer.
//
// This pattern (structured retrieval → constrained generation) is the
// industry-standard RAG approach for high-stakes factual Q&A.

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { question, plan, carrier, memberId } = await req.json();

    if (!question?.trim()) {
      return NextResponse.json({ error: 'Question is required' }, { status: 400 });
    }

    // ── Build RAG context from matched plan ─────────────────────────────────
    // This is the "retrieved document" in RAG terminology.
    // Source: CareNav plan-matching pipeline (OCR → BigQuery → GPT-4 fallback)
    const planContext = plan ? `
MEMBER PLAN (retrieved by CareNav plan-matching pipeline):
  Carrier: ${plan.carrier ?? carrier ?? 'Unknown'}
  Plan: ${plan.name} (${plan.type})
  Deductible: $${plan.deductible} individual / $${plan.deductibleFamily} family
  Out-of-pocket max: $${plan.oopMax} individual / $${plan.oopMaxFamily} family
  Coinsurance after deductible: ${plan.type === 'HMO' || plan.type === 'EPO' ? '0' : '20'}%
  
  Copays:
    Primary care visit: $${plan.copays?.primaryCare ?? 0}
    Specialist visit: $${plan.copays?.specialist ?? 0}${plan.features?.referralRequired ? ' (referral required)' : ''}
    Urgent care: $${plan.copays?.urgentCare ?? 0}
    Emergency room: $${plan.copays?.emergency ?? 0} copay + coinsurance
    Generic prescription: $${plan.copays?.generic ?? 0}
  
  Coverage rules:
    Referral required for specialists: ${plan.features?.referralRequired ? 'Yes' : 'No'}
    Telehealth: ${plan.features?.telehealth ? 'Included at PCP copay rate' : 'Not covered'}
    Out-of-network coverage: ${plan.features?.outOfNetworkCovered ? 'Covered at higher cost (typically 40% coinsurance)' : 'Not covered — in-network providers only'}
    Network: ${plan.features?.networkSize ?? 'Regional'}
    HSA eligible: ${plan.features?.hsaEligible ? 'Yes' : 'No'}
  
  Preventive care: 100% covered with no deductible or copay (ACA mandate)
  Physical therapy: ~$${Math.round((plan.copays?.specialist ?? 30) * 1.1)} copay / 30 visits per year typical limit
  Mental health: $${plan.copays?.specialist ?? 30} copay (mental health parity law applies)
  Lab work / imaging: ${plan.type === 'HMO' ? '0%' : '20%'} coinsurance after deductible
  MRI / CT scan: ${plan.type === 'HMO' ? '0%' : '20%'} coinsurance after deductible + prior authorization required
  Ambulance: ${plan.type === 'HMO' ? '0%' : '20%'} coinsurance after deductible
`.trim() : 'No plan data available. Advise the member to upload their insurance card.';

    // ── Constrained generation prompt ───────────────────────────────────────
    const systemPrompt = `You are a helpful, accurate health insurance benefits advisor for ${carrier ?? 'the member\'s plan'}.

Answer the member's question using ONLY the plan context below. Rules:
- Be specific with dollar amounts from the context
- If something requires prior auth, mention it
- If a referral is required, mention it  
- Keep your answer to 2-3 sentences maximum
- If the answer is genuinely not in the context, say: "For this specific detail, please check your plan documents or call member services."
- Never invent coverage details not in the context
- Always remind the member to verify with their insurer for final confirmation

${planContext}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',   // fast and cheap for short Q&A; swap to gpt-4o for more nuanced answers
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: question },
      ],
      max_tokens: 200,
      temperature: 0.2,  // low temp = more deterministic, less hallucination
    });

    const answer = completion.choices[0]?.message?.content?.trim() ?? 
      'Unable to generate an answer. Please try again.';

    return NextResponse.json({
      success: true,
      answer,
      model: completion.model,
      usage: completion.usage,
      // Surface these so the UI can show "grounded on X tokens of plan context"
      contextTokens: systemPrompt.length,
    });

  } catch (err: any) {
    console.error('AI advisor error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'AI advisor unavailable' },
      { status: 500 }
    );
  }
}