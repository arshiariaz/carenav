// app/api/symptom-triage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(request: NextRequest) {
  try {
    const { symptom } = await request.json();
    
    console.log('🧠 Analyzing symptom with GPT-4:', symptom);
    
    const systemPrompt = `You are a medical triage assistant. Analyze the user's symptoms and return a JSON response with:

1. urgency: "emergency" | "urgent" | "routine" | "self_care"
2. careSettings: Array of recommended care types ["Emergency Room", "Urgent Care", "Primary Care", "Telehealth"]
3. cptCodes: Array of likely CPT codes with descriptions (REQUIRED - always provide at least one)
4. reasoning: Brief explanation of urgency level
5. redFlags: Array of warning signs that would require immediate care
6. estimatedDuration: How long this might take to resolve

MANDATORY CPT codes - you MUST always include at least one:
- 99213: Office visit (established patient, 15-20 min) - DEFAULT for most visits
- 99214: Office visit (established patient, 25 min) - Complex cases
- 99284: ER visit (high complexity) - Emergency cases
- 87804: Rapid flu test - Flu symptoms
- 87880: Rapid strep test - Throat symptoms
- 71045: Chest X-ray - Chest/breathing issues
- 73610: Ankle X-ray - Ankle injuries
- 93010: EKG - Heart symptoms
- 99395: Annual physical exam - Routine checkups
- 99283: ER visit (moderate complexity) - Less severe ER cases
- 85025: Complete blood count - Infection symptoms
- 81001: Urinalysis - Urinary symptoms

RULES:
- ALWAYS include "cptCodes" array with at least one code
- If unsure, default to 99213 (basic office visit)
- Emergency symptoms = 99284 + relevant tests
- Throat symptoms = 99213 + 87880
- Flu symptoms = 99213 + 87804
- Injuries = 99213 + relevant X-ray
- Format: [{"code": "99213", "description": "Office visit", "probability": 0.9}]

CRITICAL: If symptoms suggest heart attack, stroke, severe bleeding, difficulty breathing, or other life-threatening conditions, ALWAYS mark as "emergency".

Return only valid JSON, no other text.`;

    const userPrompt = `Analyze these symptoms: "${symptom}"`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Faster and cheaper than gpt-4
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.3, // Lower temperature for more consistent medical advice
      max_tokens: 500
    });
    
    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error('No response from GPT-4');
    }
    
    // Parse the JSON response
    const analysis = JSON.parse(content);
    
    // Add some safety checks and defaults
    if (!analysis.urgency) {
      analysis.urgency = 'routine';
    }
    
    // ENSURE CPT codes are always provided
    if (!analysis.cptCodes || analysis.cptCodes.length === 0) {
      analysis.cptCodes = [
        { code: '99213', description: 'Office visit', probability: 0.8 }
      ];
    }
    
    // Ensure care settings match urgency
    if (!analysis.careSettings || analysis.careSettings.length === 0) {
      if (analysis.urgency === 'emergency') {
        analysis.careSettings = ['Emergency Room'];
      } else if (analysis.urgency === 'urgent') {
        analysis.careSettings = ['Urgent Care', 'Emergency Room'];
      } else {
        analysis.careSettings = ['Primary Care', 'Urgent Care'];
      }
    }
    
    // Log for debugging
    console.log('🧠 GPT-4 analysis:', {
      urgency: analysis.urgency,
      cptCodes: analysis.cptCodes,
      careSettings: analysis.careSettings
    });
    
    return NextResponse.json({
      success: true,
      symptom,
      analysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ GPT-4 symptom analysis error:', error);
    
    // Fallback to basic analysis if GPT-4 fails
    const fallbackAnalysis = {
      urgency: 'routine',
      careSettings: ['Primary Care', 'Urgent Care'],
      cptCodes: [
        { code: '99213', description: 'Office visit', probability: 0.8 }
      ],
      reasoning: 'Basic analysis - GPT-4 unavailable',
      redFlags: ['Severe pain', 'Difficulty breathing', 'Chest pain'],
      estimatedDuration: '1-2 weeks'
    };
    
    return NextResponse.json({
      success: true,
      symptom: '',
      analysis: fallbackAnalysis,
      fallback: true
    });
  }
}