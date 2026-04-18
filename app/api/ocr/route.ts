// app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server';

const MINDEE_MODEL_ID = 'd48cdee1-7fa4-4858-b191-70979c90aa39';
const MINDEE_BASE     = 'https://api-v2.mindee.net/v2';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log(`📷 OCR request: ${file.name} (${file.size} bytes)`);

    // ── Mock mode ──────────────────────────────────────────────────────────────
    if (process.env.NEXT_PUBLIC_USE_MOCK_OCR === 'true') {
      console.log('🎭 Mock OCR mode');
      await new Promise(resolve => setTimeout(resolve, 1500));
      const extracted = {
        companyName: 'Ambetter from Superior HealthPlan',
        planName:    'Standard Silver VALUE',
        memberName:  'Demo User',
        memberId:    'U9613938301',
        groupNumber: '',
        payerId:     '68069',
        state:       'TX',
        rxBin:       '003858',
        rxGrp:       '2DSA',
        rxPcn:       'A4',
        copays:      [],
        confidence:  0.94,
      };
      return await matchAndRespond(extracted, req);
    }

    // ── Real Mindee V2 ─────────────────────────────────────────────────────────
    if (!process.env.MINDEE_API_KEY) {
      return NextResponse.json({ success: false, error: 'MINDEE_API_KEY not configured' }, { status: 500 });
    }

    // Step 1: Submit as multipart/form-data
    console.log('📤 Submitting to Mindee V2...');
    const body = new FormData();
    body.append('file', file);
    body.append('model_id', MINDEE_MODEL_ID);

    const submitRes = await fetch(
      `${MINDEE_BASE}/products/extraction/enqueue`,
      {
        method:  'POST',
        headers: { 'Authorization': process.env.MINDEE_API_KEY },
        body,
      }
    );

    if (!submitRes.ok) {
      const err = await submitRes.text();
      console.error('Mindee V2 submit error:', err);
      throw new Error(`Mindee submit failed: ${submitRes.status} — ${err}`);
    }

    const submitData = await submitRes.json() as any;
    console.log('📋 Submit response:', JSON.stringify(submitData, null, 2));

    const pollingUrl: string | undefined =
      submitData.polling_url ?? submitData.job?.polling_url;

    if (!pollingUrl) {
      throw new Error(`No polling_url in response: ${JSON.stringify(submitData)}`);
    }

    console.log(`⏳ Polling: ${pollingUrl}`);

    // Step 2: Poll until result_url appears
    let resultUrl: string | null = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const pollRes = await fetch(pollingUrl, {
        headers:  { 'Authorization': process.env.MINDEE_API_KEY },
        redirect: 'manual',
      });

      console.log(`Poll ${attempt + 1}: status ${pollRes.status}`);

      // 3xx redirect = result is ready
      if (pollRes.status >= 300 && pollRes.status < 400) {
        resultUrl = pollRes.headers.get('location');
        break;
      }

      if (pollRes.ok) {
        const pollData = await pollRes.json() as any;

        if (pollData.result_url) {
          resultUrl = pollData.result_url;
          break;
        }
        // Some V2 responses include result inline
        if (pollData.inference?.result?.fields) {
          return handleFields(pollData.inference.result.fields, req);
        }
      }
    }

    if (!resultUrl) {
      throw new Error('OCR timed out — no result after 30 polls');
    }

    // Step 3: Fetch final result
    console.log(`📥 Fetching result from: ${resultUrl}`);
    const resultRes = await fetch(resultUrl, {
      headers: { 'Authorization': process.env.MINDEE_API_KEY },
    });

    if (!resultRes.ok) {
      throw new Error(`Failed to fetch result: ${resultRes.status}`);
    }

    const resultData = await resultRes.json() as any;
    console.log('📋 Full result:', JSON.stringify(resultData, null, 2));

    const fields =
      resultData.inference?.result?.fields ??
      resultData.result?.fields ??
      resultData.fields ??
      {};

    return handleFields(fields, req);

  } catch (error: any) {
    console.error('OCR error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// ── Parse V2 fields → extracted object ────────────────────────────────────────
async function handleFields(fields: any, req: NextRequest) {
  console.log('🔍 Raw fields:', JSON.stringify(fields, null, 2));

  const get = (key: string): string =>
    fields[key]?.value ?? fields[key]?.values?.[0]?.value ?? '';

  // Parse copayments array
  const copays: { service_name: string; service_fees: number | null }[] = [];
  const rawCopays: any[] =
    fields['copayments']?.values ?? fields['copays']?.values ?? [];

  for (const item of rawCopays) {
    const f    = item.fields ?? item;
    const name = f['service_name']?.value ?? '';
    const fee  = f['service_fees']?.value ?? null;
    if (name) copays.push({ service_name: name, service_fees: fee });
  }

  const groupNumber = get('group_number');
  const payerId     = get('payer_id');
  const planNameRaw = get('plan_name');

  const extracted = {
    companyName: get('company_name') || 'Unknown',
    planName:    planNameRaw || inferPlanName(groupNumber, payerId),
    memberName:  get('member_name'),
    memberId:    get('member_id'),
    groupNumber,
    payerId,
    rxBin:       get('rx_bin'),
    rxGrp:       get('rx_grp'),
    rxPcn:       get('rx_pcn'),
    copays,
    confidence:  fields['company_name']?.confidence ?? 0,
    state:       'TX',
  };

  console.log('✅ Extracted:', {
    company:  extracted.companyName,
    plan:     extracted.planName,
    memberId: (extracted.memberId || '').substring(0, 6) + '***',
  });

  return matchAndRespond(extracted, req);
}

// ── Infer plan name from identifiers when not on card ─────────────────────────
function inferPlanName(
  groupNumber: string,
  payerId: string
): string | undefined {
  const g = (groupNumber || '').toUpperCase();
  const p = (payerId     || '').toUpperCase();
  if (g.includes('VALUE') || p.includes('VALUE')) return 'Standard Silver VALUE';
  if (g.includes('GOLD')  || p.includes('GOLD'))  return 'Gold Plan';
  if (g.includes('SILV')  || p.includes('SILV'))  return 'Silver Plan';
  if (g.includes('BRON')  || p.includes('BRON'))  return 'Bronze Plan';
  if (g.includes('HSA')   || p.includes('HSA'))   return 'HDHP HSA Plan';
  return undefined;
}

// ── Call match-plan and return combined response ───────────────────────────────
async function matchAndRespond(extracted: any, req: NextRequest) {
  try {
    const res = await fetch(`${req.nextUrl.origin}/api/match-plan`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: extracted.companyName,
        planName:    extracted.planName,
        groupNumber: extracted.groupNumber,
        payerId:     extracted.payerId,
        state:       extracted.state || 'TX',
      }),
    });

    if (res.ok) {
      const planData = await res.json() as any;
      if (planData.success) {
        console.log(
          `🎯 Plan matched: ${planData.plan?.name} ` +
          `(${Math.round((planData.confidence || 0) * 100)}% confidence)`
        );
      }
      return NextResponse.json({
        success:         true,
        extracted,
        matchedPlan:     planData.plan    || null,
        matchConfidence: planData.confidence,
        matchType:       planData.matchType || 'unknown',
      });
    }
  } catch (err) {
    console.error('match-plan failed:', err);
  }

  return NextResponse.json({ success: true, extracted, matchedPlan: null });
}
