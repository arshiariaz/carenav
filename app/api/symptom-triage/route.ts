// app/api/symptom-triage/route.ts
import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

interface ICD10Entry {
  code:        string;
  description: string;
  cpt_codes:   Array<{ code: string; desc: string }>;
  urgency:     'emergency' | 'urgent' | 'routine';
}

// Module-level cache
let icdIndex:  ICD10Entry[] | null = null;
let icdMatrix: Float32Array | null = null;
let icdRows = 0;
let icdCols = 0;
let icdLoaded = false;

function loadICD10Index(): boolean {
  if (icdLoaded) return icdMatrix !== null;

  const indexPath = join(process.cwd(), 'data', 'icd10_index.json');
  const binPath   = join(process.cwd(), 'data', 'icd10_vectors.bin');

  if (!existsSync(indexPath) || !existsSync(binPath)) {
    console.log('⚠️  ICD-10 index not found. Run: python scripts/convert_vectors.py');
    icdLoaded = true;
    return false;
  }

  try {
    icdIndex = JSON.parse(readFileSync(indexPath, 'utf-8')) as ICD10Entry[];

    // .bin format: uint32 rows + uint32 cols + float32 data
    const buf = readFileSync(binPath);
    icdRows   = buf.readUInt32LE(0);
    icdCols   = buf.readUInt32LE(4);

    // Copy into a proper Float32Array (avoids alignment issues)
    const floatData = new Float32Array(icdRows * icdCols);
    for (let i = 0; i < floatData.length; i++) {
      floatData[i] = buf.readFloatLE(8 + i * 4);
    }
    icdMatrix = floatData;

    console.log(`✅ ICD-10 index loaded: ${icdRows} codes × ${icdCols} dims`);
    icdLoaded = true;
    return true;
  } catch (err) {
    console.error('❌ Failed to load ICD-10 index:', err);
    icdLoaded = true;
    return false;
  }
}

function rowSimilarity(row: number, query: Float32Array): number {
  const offset = row * icdCols;
  let dot = 0, normA = 0, normB = 0;
  for (let j = 0; j < icdCols; j++) {
    const a = icdMatrix![offset + j];
    const b = query[j];
    dot   += a * b;
    normA += a * a;
    normB += b * b;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

async function embedQuery(text: string): Promise<Float32Array> {
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return new Float32Array(res.data[0].embedding);
}

async function searchICD10(symptom: string, topK = 5): Promise<{
  matches:         Array<ICD10Entry & { similarity: number }>;
  inferredUrgency: 'emergency' | 'urgent' | 'routine';
  cptCodes:        Array<{ code: string; description: string; probability: number }>;
  dataSource:      'icd10_semantic' | 'fallback';
}> {
  if (!loadICD10Index() || !icdIndex || !icdMatrix || icdRows === 0) {
    return fallbackSearch(symptom);
  }

  try {
    const queryVec = await embedQuery(symptom);

    // Compute all cosine similarities
    const sims: Array<{ index: number; similarity: number }> = [];
    for (let i = 0; i < icdRows; i++) {
      sims.push({ index: i, similarity: rowSimilarity(i, queryVec) });
    }
    sims.sort((a, b) => b.similarity - a.similarity);

    const matches = sims.slice(0, topK).map(({ index, similarity }) => ({
      ...icdIndex![index],
      similarity,
    }));

    // Weighted urgency vote
    const scores = { emergency: 0, urgent: 0, routine: 0 };
    for (const m of matches) scores[m.urgency] += m.similarity;
    const inferredUrgency = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])[0][0] as 'emergency' | 'urgent' | 'routine';

    // Deduplicate CPT codes
    const cptScores = new Map<string, { desc: string; score: number }>();
    for (const m of matches) {
      for (const cpt of m.cpt_codes) {
        const ex = cptScores.get(cpt.code);
        if (ex) ex.score += m.similarity;
        else cptScores.set(cpt.code, { desc: cpt.desc, score: m.similarity });
      }
    }
    const cptCodes = Array.from(cptScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 4)
      .map(([code, { desc, score }]) => ({
        code,
        description: desc,
        probability: Math.min(0.95, score / (matches[0]?.similarity || 1)),
      }));

    console.log(`🔍 ICD-10 "${symptom}":`, {
      topMatch:  matches[0]?.code,
      topDesc:   matches[0]?.description?.substring(0, 50),
      sim:       matches[0]?.similarity?.toFixed(3),
      urgency:   inferredUrgency,
      cpts:      cptCodes.map(c => c.code),
    });

    return { matches, inferredUrgency, cptCodes, dataSource: 'icd10_semantic' };

  } catch (err) {
    console.error('ICD-10 search error:', err);
    return fallbackSearch(symptom);
  }
}

function fallbackSearch(symptom: string) {
  const s = symptom.toLowerCase();
  let urgency: 'emergency' | 'urgent' | 'routine' = 'routine';
  let cptCodes = [{ code: '99213', description: 'Office visit', probability: 0.8 }];

  if (/chest pain|heart attack|can.t breathe|stroke|unconscious|severe bleed/.test(s)) {
    urgency = 'emergency';
    cptCodes = [
      { code: '99284', description: 'ER visit high complexity', probability: 0.95 },
      { code: '93010', description: 'EKG',                      probability: 0.85 },
      { code: '71046', description: 'Chest X-ray',              probability: 0.75 },
    ];
  } else if (/flu|fever|cough/.test(s)) {
    cptCodes = [
      { code: '99213', description: 'Office visit', probability: 0.9 },
      { code: '87804', description: 'Flu test',     probability: 0.85 },
    ];
  } else if (/throat|strep/.test(s)) {
    cptCodes = [
      { code: '99213', description: 'Office visit',     probability: 0.9 },
      { code: '87880', description: 'Rapid strep test', probability: 0.85 },
    ];
  } else if (/ankle|sprain|fracture|broken/.test(s)) {
    urgency = 'urgent';
    cptCodes = [
      { code: '99213', description: 'Office visit', probability: 0.9 },
      { code: '73610', description: 'Ankle X-ray',  probability: 0.8 },
    ];
  } else if (/uti|urinary|burning/.test(s)) {
    cptCodes = [
      { code: '99213', description: 'Office visit', probability: 0.9 },
      { code: '81001', description: 'Urinalysis',   probability: 0.85 },
    ];
  }

  return { matches: [], inferredUrgency: urgency, cptCodes, dataSource: 'fallback' as const };
}

export async function POST(request: NextRequest) {
  try {
    const { symptom } = await request.json();
    console.log('🧠 Symptom triage:', symptom);

    const icdResult = await searchICD10(symptom);

    const icdContext = icdResult.matches.length > 0
      ? `Top ICD-10 matches:\n${icdResult.matches.slice(0, 3).map(m =>
          `- ${m.code}: ${m.description} (sim: ${m.similarity.toFixed(2)})`
        ).join('\n')}`
      : '';

    const systemPrompt = `You are a medical triage assistant. CPT codes and urgency are already determined by a clinical coding system. Your job ONLY:
1. Write 1-2 sentence clinical reasoning
2. List 2-3 red flag symptoms requiring immediate care  
3. Estimate resolution duration
4. Suggest care settings
Return only valid JSON: { reasoning, redFlags, estimatedDuration, careSettings }`;

    const userPrompt = `Symptoms: "${symptom}"
${icdContext}
Urgency: ${icdResult.inferredUrgency}
CPT codes: ${icdResult.cptCodes.map(c => `${c.code} (${c.description})`).join(', ')}`;

    let reasoning = '', redFlags: string[] = [], estimatedDuration = '3-7 days', careSettings: string[] = [];

    try {
      const gptRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        temperature: 0.3,
        max_tokens: 300,
      });
      const parsed      = JSON.parse(gptRes.choices[0].message.content || '{}');
      reasoning         = parsed.reasoning         || '';
      redFlags          = parsed.redFlags           || [];
      estimatedDuration = parsed.estimatedDuration  || '3-7 days';
      careSettings      = parsed.careSettings       || [];
    } catch {
      reasoning = icdResult.inferredUrgency === 'emergency'
        ? 'Seek immediate emergency care.' : icdResult.inferredUrgency === 'urgent'
        ? 'Prompt medical attention advised.' : 'A primary care visit is recommended.';
      redFlags = ['Severe or worsening symptoms', 'High fever (>103°F)', 'Difficulty breathing'];
    }

    if (!careSettings.length) {
      careSettings = icdResult.inferredUrgency === 'emergency'
        ? ['Emergency Room']
        : icdResult.inferredUrgency === 'urgent'
        ? ['Urgent Care', 'Emergency Room']
        : ['Primary Care', 'Urgent Care', 'Telehealth'];
    }

    const analysis = {
      urgency:          icdResult.inferredUrgency,
      careSettings,
      cptCodes:         icdResult.cptCodes,
      reasoning,
      redFlags,
      estimatedDuration,
      icdMatches:       icdResult.matches.slice(0, 3).map(m => ({
        code:        m.code,
        description: m.description,
        similarity:  parseFloat(m.similarity.toFixed(3)),
      })),
      dataSource: icdResult.dataSource,
    };

    console.log('✅ Triage complete:', {
      urgency:    analysis.urgency,
      dataSource: analysis.dataSource,
      topICD:     analysis.icdMatches[0]?.code,
      cptCodes:   analysis.cptCodes.map(c => c.code),
    });

    return NextResponse.json({ success: true, symptom, analysis, timestamp: new Date().toISOString() });

  } catch (error) {
    console.error('❌ Triage error:', error);
    return NextResponse.json({
      success: true, symptom: '',
      analysis: {
        urgency: 'routine', careSettings: ['Primary Care', 'Urgent Care'],
        cptCodes: [{ code: '99213', description: 'Office visit', probability: 0.8 }],
        reasoning: 'Analysis unavailable.', redFlags: ['Severe pain', 'Difficulty breathing'],
        estimatedDuration: '1-2 weeks', dataSource: 'fallback',
      },
      fallback: true,
    });
  }
}
