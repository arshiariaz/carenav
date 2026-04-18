// app/api/match-plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Types ──────────────────────────────────────────────────────────────────────
interface CMSPlan {
  plan_id: string;
  state: string;
  issuer_id: string;
  carrier_name: string;
  carrier_key: string;
  plan_name: string;
  plan_variant_name: string;
  standard_component_id: string;
  csr_type: string;
  plan_type: string;
  metal_level: string;
  referral_required: boolean;
  hsa_eligible: boolean;
  national_network: string;
  actuarial_value: string;
  drug_deductible_integrated: string;
  drug_moop_integrated: string;
  out_of_country_coverage: string;
  out_of_service_area_coverage: string;
  wellness_program: string;
  disease_management_programs: string;
  sbc_url: string;
  formulary_url: string;
  brochure_url: string;
  effective_date: string;
  expiration_date: string;
  deductible_individual: number | null;
  deductible_family: number | null;
  moop_individual: number | null;
  moop_family: number | null;
  // Copays
  pcp_copay: number | string | null;
  specialist_copay: number | string | null;
  urgent_care_copay: number | string | null;
  er_copay: number | string | null;
  inpatient_copay: number | string | null;
  rx_tier1_copay: number | string | null;
  rx_tier2_copay: number | string | null;
  rx_tier3_copay: number | string | null;
  rx_tier4_copay: number | string | null;
  mental_health_copay: number | string | null;
  preventive_copay: number | string | null;
  imaging_copay: number | string | null;
  lab_copay: number | string | null;
  rehab_copay: number | string | null;
  snf_copay: number | string | null;
}

interface CMSData {
  metadata: { source: string; generated_at: string; total_plans: number };
  plans: CMSPlan[];
  index_by_carrier: Record<string, string[]>;
  index_by_state_carrier: Record<string, Record<string, string[]>>;
}

// ── Load CMS data once at module level ────────────────────────────────────────
let cmsData: CMSData | null = null;
let planById: Map<string, CMSPlan> | null = null;

function getCMSData(): { data: CMSData; planById: Map<string, CMSPlan> } {
  if (cmsData && planById) return { data: cmsData, planById };

  try {
    const filePath = join(process.cwd(), 'data', 'cms_plans.json');
    const raw = readFileSync(filePath, 'utf-8');
    cmsData = JSON.parse(raw) as CMSData;
    planById = new Map(cmsData.plans.map(p => [p.plan_id, p]));
    console.log(`✅ CMS data loaded: ${cmsData.plans.length} plans`);
  } catch (err) {
    console.error('❌ Failed to load cms_plans.json:', err);
    cmsData = { metadata: { source: '', generated_at: '', total_plans: 0 }, plans: [], index_by_carrier: {}, index_by_state_carrier: {} };
    planById = new Map();
  }

  return { data: cmsData!, planById: planById! };
}

// ── Carrier key normalization (must match Python pipeline) ────────────────────
function toCarrierKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/inc\.|llc|corp\.|from|insurance|health\s*plan|healthplan/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Fuzzy carrier match ────────────────────────────────────────────────────────
// Returns best matching carrier key from the index
function findCarrierKey(
  inputCarrier: string,
  stateCode: string,
  data: CMSData
): string | null {
  const inputKey = toCarrierKey(inputCarrier);
  const stateIndex = data.index_by_state_carrier[stateCode] || {};
  const allKeys = Object.keys(stateIndex);

  // 1. Exact match
  if (stateIndex[inputKey]) return inputKey;

  // 2. Input contains carrier key or vice versa
  for (const ck of allKeys) {
    if (inputKey.includes(ck) || ck.includes(inputKey)) return ck;
  }

  // 3. Word overlap score
  const inputWords = new Set(inputKey.split(' ').filter(w => w.length > 2));
  let bestScore = 0;
  let bestKey: string | null = null;
  for (const ck of allKeys) {
    const ckWords = new Set(ck.split(' ').filter(w => w.length > 2));
    const overlap = [...inputWords].filter(w => ckWords.has(w)).length;
    const score = overlap / Math.max(inputWords.size, ckWords.size);
    if (score > bestScore) { bestScore = score; bestKey = ck; }
  }

  return bestScore >= 0.4 ? bestKey : null;
}

// ── CSR variant selection ──────────────────────────────────────────────────────
// The same base plan exists as 7 CSR variants (-00 through -06)
// We pick the right one based on plan name hints from OCR
function selectCSRVariant(
  candidates: CMSPlan[],
  planNameHint: string
): CMSPlan {
  const hint = planNameHint.toLowerCase();

  // Explicit CSR signals from plan name or member ID prefix
  if (hint.includes('zero cost') || hint.includes('0 cost'))
    return candidates.find(p => p.csr_type?.includes('Zero Cost')) ?? candidates[0];
  if (hint.includes('94%') || hint.includes('value') || hint.includes('csr 94'))
    return candidates.find(p => p.csr_type?.includes('94%')) ?? candidates[0];
  if (hint.includes('87%') || hint.includes('csr 87'))
    return candidates.find(p => p.csr_type?.includes('87%')) ?? candidates[0];
  if (hint.includes('73%') || hint.includes('csr 73'))
    return candidates.find(p => p.csr_type?.includes('73%')) ?? candidates[0];

  // Default: On Exchange standard variant (-01)
  return (
    candidates.find(p => p.csr_type?.includes('On Exchange')) ??
    candidates[0]
  );
}

// ── Plan name match score ──────────────────────────────────────────────────────
function planNameScore(cmsPlanName: string, inputName: string): number {
  const a = cmsPlanName.toLowerCase();
  const b = inputName.toLowerCase();
  if (a === b) return 1.0;
  if (a.includes(b) || b.includes(a)) return 0.8;
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const overlap = [...bWords].filter(w => aWords.has(w) && w.length > 2).length;
  return overlap / Math.max(aWords.size, bWords.size);
}

// ── Format plan for frontend ───────────────────────────────────────────────────
function formatPlan(plan: CMSPlan, matchType: string, confidence: number) {
  return {
    // Identity
    id:             plan.plan_id,
    name:           plan.plan_variant_name || plan.plan_name,
    carrier:        plan.carrier_name,
    type:           plan.plan_type,
    metalLevel:     plan.metal_level,
    csrType:        plan.csr_type,
    summary:        `${plan.carrier_name} ${plan.plan_name} (${plan.metal_level})`,

    // Deductibles
    deductible:           plan.deductible_individual ?? 0,
    deductibleFamily:     plan.deductible_family ?? 0,
    oopMax:               plan.moop_individual ?? 0,
    oopMaxFamily:         plan.moop_family ?? 0,

    // Copays
    copays: {
      primaryCare:  plan.pcp_copay,
      specialist:   plan.specialist_copay,
      urgentCare:   plan.urgent_care_copay,
      emergency:    plan.er_copay,
      inpatient:    plan.inpatient_copay,
      generic:      plan.rx_tier1_copay,
      preferredBrand: plan.rx_tier2_copay,
      nonPreferredBrand: plan.rx_tier3_copay,
      specialty:    plan.rx_tier4_copay,
      mentalHealth: plan.mental_health_copay,
      preventive:   plan.preventive_copay,
      imaging:      plan.imaging_copay,
      lab:          plan.lab_copay,
      rehab:        plan.rehab_copay,
    },

    // Plan features
    features: {
      referralRequired:     plan.referral_required,
      outOfNetworkCovered:  plan.out_of_service_area_coverage === 'Yes',
      outOfCountryCovered:  plan.out_of_country_coverage === 'Yes',
      nationalNetwork:      plan.national_network === 'Yes',
      hsaEligible:          plan.hsa_eligible,
      wellnessProgram:      plan.wellness_program === 'Yes',
      diseaseManagement:    plan.disease_management_programs,
      drugDeductibleIntegrated: plan.drug_deductible_integrated === 'Yes',
    },

    // URLs
    urls: {
      sbc:       plan.sbc_url,
      formulary: plan.formulary_url,
      brochure:  plan.brochure_url,
    },

    // Metadata
    state:          plan.state,
    issuerId:       plan.issuer_id,
    effectiveDate:  plan.effective_date,
    expirationDate: plan.expiration_date,
    actuarialValue: plan.actuarial_value,
    dataSource:     'CMS 2026 Exchange PUF',
    matchType,
    confidence,
  };
}

// ── Main handler ───────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const { companyName, groupNumber, payerId, planName, state } = await request.json();

    console.log('🔍 match-plan request:', { companyName, planName, state });

    const { data, planById: byId } = getCMSData();

    if (data.plans.length === 0) {
      return NextResponse.json({ success: false, error: 'CMS data not loaded' }, { status: 500 });
    }

    // Infer state from location if not provided
    const stateCode = (state || 'TX').toUpperCase();

    // ── 1. Find carrier ──────────────────────────────────────────────────────
    const carrierKey = findCarrierKey(companyName || '', stateCode, data);

    if (!carrierKey) {
      console.log('⚠️ No carrier match for:', companyName);
      return NextResponse.json({
        success: false,
        error: `No plans found for carrier: ${companyName}`,
        message: 'This may be an employer plan not listed on the ACA marketplace.'
      }, { status: 404 });
    }

    // ── 2. Get candidate plans for this carrier in this state ────────────────
    const stateCarrierIds = data.index_by_state_carrier[stateCode]?.[carrierKey] ?? [];
    // Fallback: any state if none found in specified state
    const carrierIds = stateCarrierIds.length > 0
      ? stateCarrierIds
      : (data.index_by_carrier[carrierKey] ?? []);

    const candidates = carrierIds
      .map(id => byId.get(id))
      .filter((p): p is CMSPlan => p !== undefined);

    if (candidates.length === 0) {
      return NextResponse.json({ success: false, error: 'No plans found' }, { status: 404 });
    }

    // ── 3. Match plan name if provided ───────────────────────────────────────
    const inputPlanName = planName || companyName || '';
    let matchedBase: CMSPlan | null = null;
    let nameScore = 0;

    // Group candidates by standard_component_id (base plan, ignoring CSR variants)
    const byBaseId = new Map<string, CMSPlan[]>();
    for (const p of candidates) {
      const baseId = p.standard_component_id || p.plan_id.slice(0, -3);
      byBaseId.set(baseId, [...(byBaseId.get(baseId) ?? []), p]);
    }

    // Find best matching base plan
    let bestGroup: CMSPlan[] = [];
    for (const [, group] of byBaseId) {
      const score = planNameScore(group[0].plan_name, inputPlanName);
      if (score > nameScore) { nameScore = score; bestGroup = group; }
    }

    if (bestGroup.length > 0) {
      matchedBase = selectCSRVariant(bestGroup, inputPlanName);
    } else {
      // Fall back to first on-exchange standard plan
      matchedBase = candidates.find(p => p.csr_type?.includes('On Exchange')) ?? candidates[0];
      nameScore = 0.3;
    }

    const confidence = Math.min(0.95, 0.5 + nameScore * 0.5);
    const matchType  = nameScore >= 0.8 ? 'exact' : nameScore >= 0.5 ? 'fuzzy' : 'carrier_only';

    console.log(`✅ Matched: ${matchedBase.plan_id} (${matchType}, confidence ${confidence.toFixed(2)})`);

    return NextResponse.json({
      success:    true,
      plan:       formatPlan(matchedBase, matchType, confidence),
      matchType,
      confidence,
      message:    `Matched from CMS 2026 Exchange PUF data`,
    });

  } catch (error) {
    console.error('match-plan error:', error);
    return NextResponse.json({
      success: false,
      error: 'Plan matching failed',
      detail: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
