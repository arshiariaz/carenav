"""
CareNav — CMS PUF Ingestion Pipeline
Run: python scripts/ingest_cms_puf.py
Inputs:  data/raw/benefits-and-cost-sharing-puf.csv
         data/raw/plan-attributes-puf.csv
Output:  data/cms_plans.json
"""

import json, re
import pandas as pd
from pathlib import Path

ROOT        = Path(__file__).parent.parent
RAW_DIR     = ROOT / "data" / "raw"
OUTPUT_FILE = ROOT / "data" / "cms_plans.json"
OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

BENEFITS_FILE   = RAW_DIR / "benefits-and-cost-sharing-puf.csv"
ATTRIBUTES_FILE = RAW_DIR / "plan-attributes-puf.csv"

BENEFIT_MAP = {
    "Primary Care Visit to Treat an Injury or Illness": "pcp_copay",
    "Specialist Visit":                                  "specialist_copay",
    "Urgent Care Centers or Facilities":                 "urgent_care_copay",
    "Emergency Room Services":                           "er_copay",
    "Inpatient Hospital Services (e.g., Hospital Stay)": "inpatient_copay",
    "Generic Drugs":                                     "rx_tier1_copay",
    "Preferred Brand Drugs":                             "rx_tier2_copay",
    "Non-Preferred Brand Drugs":                         "rx_tier3_copay",
    "Specialty Drugs":                                   "rx_tier4_copay",
    "Mental/Behavioral Health Outpatient Services":      "mental_health_copay",
    "Preventive Care/Screening/Immunization":            "preventive_copay",
    "Imaging (CT/PET Scans, MRIs)":                      "imaging_copay",
    "Laboratory Outpatient and Professional Services":   "lab_copay",
    "Rehabilitation Services":                           "rehab_copay",
    "Skilled Nursing Facility":                          "snf_copay",
}

def parse_dollar(val):
    if pd.isna(val): return None
    s = str(val).strip()
    if s in ("Not Applicable", "Not Covered", ""): return None
    if s in ("No Charge", "$0.00", "$0"): return 0.0
    m = re.search(r"[\d,]+\.?\d*", s.replace("$","").replace(",",""))
    return float(m.group()) if m else None

def parse_coinsurance(val):
    if pd.isna(val): return None
    m = re.search(r"([\d.]+)%", str(val))
    return float(m.group(1)) if m else None

def parse_currency(val):
    if pd.isna(val): return None
    s = str(val).replace("$","").replace(",","").strip()
    m = re.search(r"\d+", s)
    return int(m.group()) if m else None

def carrier_key(name):
    s = name.lower()
    s = re.sub(r"(inc\.|llc|corp\.|from|insurance|health\s*plan|healthplan)", "", s)
    return re.sub(r"\s+", " ", s).strip()

def clean(val):
    try:
        if pd.isna(val): return None
    except Exception:
        pass
    s = str(val).strip()
    return None if s in ("nan","NaN","") else s

# ── Step 1: Plan Attributes ────────────────────────────────────────────────────
print("Loading plan attributes...")
attr_df = pd.read_csv(ATTRIBUTES_FILE, encoding="utf-8-sig", low_memory=False)
attr_df = attr_df[
    (attr_df["BusinessYear"] == 2026) &
    (attr_df["DentalOnlyPlan"] == "No") &
    (attr_df["MarketCoverage"].isin(["Individual","SHOP"]))
].copy()
print(f"  {len(attr_df):,} plan variants")

attr_cols = {
    "StateCode":                               "state",
    "IssuerId":                                "issuer_id",
    "IssuerMarketPlaceMarketingName":          "carrier_name",
    "PlanId":                                  "plan_id",
    "PlanMarketingName":                       "plan_name",
    "PlanVariantMarketingName":                "plan_variant_name",
    "StandardComponentId":                     "standard_component_id",
    "CSRVariationType":                        "csr_type",
    "PlanType":                                "plan_type",
    "MetalLevel":                              "metal_level",
    "IsReferralRequiredForSpecialist":         "referral_required",
    "IsHSAEligible":                           "hsa_eligible",
    "NationalNetwork":                         "national_network",
    "IssuerActuarialValue":                    "actuarial_value",
    "MedicalDrugDeductiblesIntegrated":        "drug_deductible_integrated",
    "MedicalDrugMaximumOutofPocketIntegrated": "drug_moop_integrated",
    # TEHB = Total EHB (medical+drug combined) — populated when integrated
    "TEHBDedInnTier1Individual":               "tehb_ded_individual",
    "TEHBDedInnTier1FamilyPerGroup":           "tehb_ded_family",
    "TEHBInnTier1IndividualMOOP":              "tehb_moop_individual",
    "TEHBInnTier1FamilyPerGroupMOOP":          "tehb_moop_family",
    # MEHB = Medical EHB only — populated when NOT integrated
    "MEHBDedInnTier1Individual":               "mehb_ded_individual",
    "MEHBDedInnTier1FamilyPerGroup":           "mehb_ded_family",
    "MEHBInnTier1IndividualMOOP":              "mehb_moop_individual",
    "MEHBInnTier1FamilyPerGroupMOOP":          "mehb_moop_family",
    # Out of network
    "MEHBDedOutOfNetIndividual":               "deductible_oon_individual",
    "MEHBOutOfNetIndividualMOOP":              "moop_oon_individual",
    # Coverage
    "OutOfCountryCoverage":                    "out_of_country_coverage",
    "OutOfServiceAreaCoverage":                "out_of_service_area_coverage",
    # Programs
    "WellnessProgramOffered":                  "wellness_program",
    "DiseaseManagementProgramsOffered":        "disease_management_programs",
    # URLs
    "URLForSummaryofBenefitsCoverage":         "sbc_url",
    "FormularyURL":                            "formulary_url",
    "PlanBrochure":                            "brochure_url",
    "PlanEffectiveDate":                       "effective_date",
    "PlanExpirationDate":                      "expiration_date",
}

attr_df = attr_df.rename(columns=attr_cols)
keep_cols = [v for v in attr_cols.values() if v in attr_df.columns]
attr_df = attr_df[keep_cols].copy()

raw_currency = ["tehb_ded_individual","tehb_ded_family","tehb_moop_individual","tehb_moop_family",
                "mehb_ded_individual","mehb_ded_family","mehb_moop_individual","mehb_moop_family",
                "deductible_oon_individual","moop_oon_individual"]
for col in raw_currency:
    if col in attr_df.columns:
        attr_df[col] = attr_df[col].apply(parse_currency)

# Coalesce TEHB → MEHB: whichever has a value wins
def coalesce(df, a, b):
    s_a = df[a] if a in df.columns else pd.Series(dtype=float, index=df.index)
    s_b = df[b] if b in df.columns else pd.Series(dtype=float, index=df.index)
    return s_a.combine_first(s_b)

attr_df["deductible_individual"] = coalesce(attr_df, "tehb_ded_individual", "mehb_ded_individual")
attr_df["deductible_family"]     = coalesce(attr_df, "tehb_ded_family",     "mehb_ded_family")
attr_df["moop_individual"]       = coalesce(attr_df, "tehb_moop_individual","mehb_moop_individual")
attr_df["moop_family"]           = coalesce(attr_df, "tehb_moop_family",    "mehb_moop_family")

# Drop the raw TEHB/MEHB split columns — keep only coalesced values
attr_df.drop(columns=[c for c in raw_currency if c in attr_df.columns], inplace=True)

attr_df["referral_required"] = attr_df["referral_required"].apply(lambda x: str(x).strip()=="Yes")
attr_df["hsa_eligible"]      = attr_df["hsa_eligible"].apply(lambda x: str(x).strip()=="Yes")
attr_df["carrier_key"]       = attr_df["carrier_name"].apply(carrier_key)

currency_final = ["deductible_individual","deductible_family","moop_individual",
                  "moop_family","deductible_oon_individual","moop_oon_individual"]

print(f"  {attr_df['carrier_name'].nunique()} carriers, {attr_df['state'].nunique()} states")

# ── Step 2: Benefits ───────────────────────────────────────────────────────────
print("Loading benefits...")
ben_df = pd.read_csv(BENEFITS_FILE, encoding="utf-8-sig", low_memory=False)
ben_df = ben_df[
    (ben_df["BusinessYear"] == 2026) &
    (ben_df["BenefitName"].isin(BENEFIT_MAP.keys()))
].copy()
print(f"  {len(ben_df):,} relevant benefit rows")

print("Pivoting benefits...")
benefit_records = {}
for _, row in ben_df.iterrows():
    pid   = str(row["PlanId"]).strip()
    field = BENEFIT_MAP[row["BenefitName"]]
    copay = parse_dollar(row["CopayInnTier1"])
    coins = parse_coinsurance(row["CoinsInnTier1"])
    if pid not in benefit_records: benefit_records[pid] = {}
    if copay is not None:
        benefit_records[pid][field] = copay
    elif coins is not None and field not in benefit_records[pid]:
        benefit_records[pid][field] = f"{coins}% coinsurance"
print(f"  {len(benefit_records):,} plan variants with benefit data")

# ── Step 3: Join ───────────────────────────────────────────────────────────────
print("Joining...")
plans = []
for _, row in attr_df.iterrows():
    pid  = str(row["plan_id"]).strip()
    base = {}
    for k, v in row.to_dict().items():
        if k in currency_final:
            base[k] = None if pd.isna(v) else int(v)
        elif k in ("referral_required","hsa_eligible"):
            base[k] = bool(v)
        else:
            base[k] = clean(v)
    plans.append({**base, **benefit_records.get(pid, {})})

# ── Step 4: Indexes ────────────────────────────────────────────────────────────
index_by_carrier, index_by_state_carrier = {}, {}
for p in plans:
    ck  = p.get("carrier_key","")
    st  = p.get("state","")
    pid = p.get("plan_id","")
    index_by_carrier.setdefault(ck,[]).append(pid)
    index_by_state_carrier.setdefault(st,{}).setdefault(ck,[]).append(pid)

# ── Step 5: Write ──────────────────────────────────────────────────────────────
output = {
    "metadata": {
        "source": "CMS 2026 Exchange PUF",
        "generated_at": str(pd.Timestamp.now()),
        "total_plans": len(plans),
        "states": sorted(attr_df["state"].unique().tolist()),
        "carriers": sorted(attr_df["carrier_name"].unique().tolist()),
    },
    "plans": plans,
    "index_by_carrier": index_by_carrier,
    "index_by_state_carrier": index_by_state_carrier,
}

with open(OUTPUT_FILE,"w") as f:
    json.dump(output, f, separators=(",",":"), default=str)

size_mb = OUTPUT_FILE.stat().st_size / 1_048_576
print(f"\nWritten → {OUTPUT_FILE}  ({size_mb:.1f} MB, {len(plans):,} plans)")

# ── Step 6: Verify card ────────────────────────────────────────────────────────
print("\nVerification — Ambetter TX Standard Silver VALUE:")
for p in plans:
    if (p.get("state")=="TX"
            and "ambetter" in (p.get("carrier_key") or "")
            and "standard silver value" in (p.get("plan_name") or "").lower()):
        print(f"  {p['plan_id']:30s} CSR: {(p.get('csr_type') or ''):42s} "
              f"PCP:{str(p.get('pcp_copay')):5s} UC:{str(p.get('urgent_care_copay')):5s} "
              f"Ded:{str(p.get('deductible_individual')):6s} MOOP:{str(p.get('moop_individual'))}")

print("\nDone.")
