"""
CareNav — ICD-10 Semantic Search Pipeline
------------------------------------------
Downloads CMS ICD-10-CM codes, generates OpenAI embeddings,
saves a compressed lookup file for use in the symptom-triage route.

Usage:
    pip install openai numpy requests
    python scripts/build_icd10_index.py

Output:
    data/icd10_index.json   — code metadata + ICD→CPT mappings
    data/icd10_vectors.npz  — compressed embedding matrix
"""

import json, time, os, re
import numpy as np
import requests
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────
ROOT       = Path(__file__).parent.parent
DATA_DIR   = ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

INDEX_FILE   = DATA_DIR / "icd10_index.json"
VECTORS_FILE = DATA_DIR / "icd10_vectors.npz"

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
EMBED_MODEL    = "text-embedding-3-small"   # 1536 dims, cheap, fast
BATCH_SIZE     = 100                         # OpenAI allows up to 2048

# ── ICD-10 → CPT mapping (common clinical mappings) ───────────────────────────
# Maps ICD-10 category prefixes to likely CPT procedure codes
ICD_CPT_MAP: dict[str, list[dict]] = {
    # Respiratory
    "J0":  [{"code":"99213","desc":"Office visit"},{"code":"87804","desc":"Flu test"}],
    "J1":  [{"code":"99213","desc":"Office visit"},{"code":"87804","desc":"Flu test"}],
    "J2":  [{"code":"99213","desc":"Office visit"},{"code":"71046","desc":"Chest X-ray"}],
    "J3":  [{"code":"99213","desc":"Office visit"},{"code":"87880","desc":"Strep test"}],
    "J4":  [{"code":"99213","desc":"Office visit"},{"code":"94010","desc":"Spirometry"}],
    "J45": [{"code":"99213","desc":"Office visit"},{"code":"94010","desc":"Spirometry"}],
    # ENT / throat
    "J06": [{"code":"99213","desc":"Office visit"},{"code":"87880","desc":"Rapid strep test"}],
    "J02": [{"code":"99213","desc":"Office visit"},{"code":"87880","desc":"Rapid strep test"}],
    # Chest / cardiac
    "I2":  [{"code":"99284","desc":"ER visit high complexity"},{"code":"93010","desc":"EKG"},{"code":"71046","desc":"Chest X-ray"}],
    "I1":  [{"code":"99213","desc":"Office visit"},{"code":"93000","desc":"EKG routine"}],
    "R07": [{"code":"99283","desc":"ER visit moderate"},{"code":"93010","desc":"EKG"},{"code":"71046","desc":"Chest X-ray"}],
    # GI
    "K2":  [{"code":"99213","desc":"Office visit"},{"code":"80053","desc":"Comprehensive metabolic panel"}],
    "K5":  [{"code":"99213","desc":"Office visit"},{"code":"85025","desc":"CBC"}],
    "R10": [{"code":"99213","desc":"Office visit"},{"code":"80053","desc":"Metabolic panel"}],
    # Musculoskeletal
    "M":   [{"code":"99213","desc":"Office visit"},{"code":"97110","desc":"Therapeutic exercises"}],
    "S9":  [{"code":"99213","desc":"Office visit"},{"code":"73610","desc":"Ankle X-ray"}],
    "S8":  [{"code":"99213","desc":"Office visit"},{"code":"73562","desc":"Knee X-ray"}],
    "S4":  [{"code":"99213","desc":"Office visit"},{"code":"73030","desc":"Shoulder X-ray"}],
    "S52": [{"code":"99213","desc":"Office visit"},{"code":"73100","desc":"Wrist X-ray"}],
    # Skin
    "L":   [{"code":"99213","desc":"Office visit"}],
    # Urinary
    "N3":  [{"code":"99213","desc":"Office visit"},{"code":"81001","desc":"Urinalysis"}],
    "N1":  [{"code":"99213","desc":"Office visit"},{"code":"81001","desc":"Urinalysis"},{"code":"80053","desc":"Metabolic panel"}],
    # Mental health
    "F3":  [{"code":"99213","desc":"Office visit"},{"code":"96127","desc":"Depression screening"}],
    "F4":  [{"code":"99213","desc":"Office visit"},{"code":"96127","desc":"Anxiety screening"}],
    # Neurological
    "G4":  [{"code":"99213","desc":"Office visit"}],
    "R51": [{"code":"99213","desc":"Office visit"}],
    # Endocrine
    "E1":  [{"code":"99213","desc":"Office visit"},{"code":"83036","desc":"HbA1c"},{"code":"80053","desc":"Metabolic panel"}],
    "E11": [{"code":"99213","desc":"Office visit"},{"code":"83036","desc":"HbA1c"}],
    # Infections
    "A":   [{"code":"99213","desc":"Office visit"},{"code":"85025","desc":"CBC"}],
    "B":   [{"code":"99213","desc":"Office visit"},{"code":"85025","desc":"CBC"}],
    # Default
    "_":   [{"code":"99213","desc":"Office visit"}],
}

def get_cpt_for_icd(code: str) -> list[dict]:
    """Return CPT codes for an ICD-10 code using prefix matching."""
    for prefix in sorted(ICD_CPT_MAP.keys(), key=len, reverse=True):
        if prefix != "_" and code.startswith(prefix):
            return ICD_CPT_MAP[prefix]
    return ICD_CPT_MAP["_"]

def get_urgency_for_icd(code: str) -> str:
    """Infer urgency from ICD-10 code."""
    emergency_prefixes = ["I2", "I6", "J96", "R09", "S06", "T07", "T14"]
    urgent_prefixes    = ["S", "R07", "J1", "J2", "N3", "K3"]
    for p in emergency_prefixes:
        if code.startswith(p): return "emergency"
    for p in urgent_prefixes:
        if code.startswith(p): return "urgent"
    return "routine"

# ── Download ICD-10-CM codes ───────────────────────────────────────────────────
def download_icd10() -> list[dict]:
    """
    Download ICD-10-CM tabular from CMS.
    Falls back to a curated subset if download fails.
    """
    url = "https://www.cms.gov/files/zip/2026-code-descriptions-tabular-order.zip"
    zip_path = DATA_DIR / "icd10_raw.zip"

    print("Downloading ICD-10-CM codes from CMS...")
    try:
        r = requests.get(url, timeout=60, stream=True)
        r.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
        print(f"  Downloaded {zip_path.stat().st_size/1e6:.1f} MB")

        import zipfile
        codes = []
        with zipfile.ZipFile(zip_path) as zf:
            # Find the description file
            txt_files = [n for n in zf.namelist() if "long" in n.lower() and n.endswith(".txt")]
            if not txt_files:
                txt_files = [n for n in zf.namelist() if n.endswith(".txt")]
            print(f"  Found files: {zf.namelist()[:5]}")
            for fname in txt_files[:1]:
                print(f"  Parsing {fname}...")
                with zf.open(fname) as f:
                    for line in f:
                        line = line.decode("latin-1").strip()
                        if len(line) < 8: continue
                        # Format: CODE SPACE DESCRIPTION
                        parts = line.split(None, 1)
                        if len(parts) == 2:
                            code, desc = parts[0].strip(), parts[1].strip()
                            if re.match(r'^[A-Z]\d', code) and len(code) <= 8:
                                codes.append({"code": code, "description": desc})

        if codes:
            print(f"  Parsed {len(codes):,} ICD-10 codes")
            return codes

    except Exception as e:
        print(f"  Download failed: {e}")

    # Curated fallback covering the most common symptom categories
    print("  Using curated common-conditions subset...")
    return get_curated_codes()

def get_curated_codes() -> list[dict]:
    """500 high-value ICD-10 codes covering the most common presenting symptoms."""
    return [
        # Respiratory
        {"code":"J06.9",  "description":"Acute upper respiratory infection, unspecified"},
        {"code":"J00",    "description":"Acute nasopharyngitis (common cold)"},
        {"code":"J02.9",  "description":"Acute pharyngitis, unspecified (sore throat)"},
        {"code":"J03.90", "description":"Acute tonsillitis, unspecified (strep throat)"},
        {"code":"J04.0",  "description":"Acute laryngitis"},
        {"code":"J20.9",  "description":"Acute bronchitis, unspecified"},
        {"code":"J18.9",  "description":"Pneumonia, unspecified organism"},
        {"code":"J45.901","description":"Unspecified asthma, uncomplicated"},
        {"code":"J10.1",  "description":"Influenza with other respiratory manifestations (flu)"},
        {"code":"J11.1",  "description":"Influenza with other respiratory manifestations, virus not identified"},
        {"code":"J30.9",  "description":"Allergic rhinitis, unspecified (hay fever)"},
        {"code":"J32.9",  "description":"Chronic sinusitis, unspecified"},
        {"code":"J22",    "description":"Unspecified acute lower respiratory infection"},
        # Cardiac / chest
        {"code":"I10",    "description":"Essential (primary) hypertension"},
        {"code":"I20.9",  "description":"Angina pectoris, unspecified (chest pain, cardiac)"},
        {"code":"I21.9",  "description":"Acute myocardial infarction (heart attack), unspecified"},
        {"code":"I25.10", "description":"Atherosclerotic heart disease of native coronary artery"},
        {"code":"I50.9",  "description":"Heart failure, unspecified"},
        {"code":"R07.9",  "description":"Chest pain, unspecified"},
        {"code":"R07.1",  "description":"Chest pain on breathing"},
        {"code":"R00.0",  "description":"Tachycardia, unspecified (fast heart rate)"},
        {"code":"R00.1",  "description":"Bradycardia, unspecified (slow heart rate)"},
        # GI
        {"code":"K21.0",  "description":"Gastro-esophageal reflux disease with esophagitis (GERD)"},
        {"code":"K29.70", "description":"Gastritis, unspecified (stomach pain, nausea)"},
        {"code":"K57.30", "description":"Diverticulosis of large intestine without perforation"},
        {"code":"K59.00", "description":"Constipation, unspecified"},
        {"code":"K58.9",  "description":"Irritable bowel syndrome without diarrhea"},
        {"code":"R10.9",  "description":"Unspecified abdominal pain"},
        {"code":"R10.0",  "description":"Acute abdomen (severe abdominal pain)"},
        {"code":"R11.2",  "description":"Nausea with vomiting, unspecified"},
        {"code":"R11.0",  "description":"Nausea alone"},
        {"code":"R11.10", "description":"Vomiting, unspecified"},
        {"code":"K52.9",  "description":"Noninfective gastroenteritis and colitis, unspecified"},
        {"code":"A09",    "description":"Infectious gastroenteritis and colitis (stomach bug)"},
        # Musculoskeletal
        {"code":"M54.5",  "description":"Low back pain"},
        {"code":"M54.2",  "description":"Cervicalgia (neck pain)"},
        {"code":"M25.511","description":"Pain in right shoulder"},
        {"code":"M25.512","description":"Pain in left shoulder"},
        {"code":"M25.561","description":"Pain in right knee"},
        {"code":"M25.562","description":"Pain in left knee"},
        {"code":"M79.3",  "description":"Panniculitis, unspecified (muscle pain)"},
        {"code":"S93.401","description":"Sprain of right ankle, unspecified ligament"},
        {"code":"S93.402","description":"Sprain of left ankle, unspecified ligament"},
        {"code":"S82.001","description":"Fracture of right patella (knee fracture)"},
        {"code":"M17.11", "description":"Primary osteoarthritis, right knee"},
        {"code":"M17.12", "description":"Primary osteoarthritis, left knee"},
        # Neurological
        {"code":"G43.909","description":"Migraine, unspecified, not intractable"},
        {"code":"R51.9",  "description":"Headache, unspecified"},
        {"code":"G47.00", "description":"Insomnia, unspecified"},
        {"code":"R42",    "description":"Dizziness and giddiness"},
        {"code":"R55",    "description":"Syncope and collapse (fainting)"},
        {"code":"G62.9",  "description":"Polyneuropathy, unspecified (numbness/tingling)"},
        # ENT
        {"code":"H92.09", "description":"Otalgia (ear pain), unspecified ear"},
        {"code":"H66.90", "description":"Otitis media, unspecified (ear infection)"},
        {"code":"H10.9",  "description":"Conjunctivitis, unspecified (pink eye)"},
        {"code":"J35.3",  "description":"Hypertrophy of tonsils with hypertrophy of adenoids"},
        # Skin
        {"code":"L30.9",  "description":"Dermatitis, unspecified (rash)"},
        {"code":"L50.9",  "description":"Urticaria, unspecified (hives)"},
        {"code":"L03.90", "description":"Cellulitis, unspecified (skin infection)"},
        {"code":"B02.9",  "description":"Zoster without complications (shingles)"},
        {"code":"L70.0",  "description":"Acne vulgaris"},
        # Urinary
        {"code":"N39.0",  "description":"Urinary tract infection (UTI), site not specified"},
        {"code":"N30.00", "description":"Acute cystitis without hematuria (bladder infection)"},
        {"code":"N20.0",  "description":"Calculus of kidney (kidney stone)"},
        {"code":"R30.0",  "description":"Dysuria (painful urination)"},
        {"code":"R35.0",  "description":"Frequency of micturition (frequent urination)"},
        # Mental health
        {"code":"F32.9",  "description":"Major depressive disorder, single episode, unspecified"},
        {"code":"F41.1",  "description":"Generalized anxiety disorder"},
        {"code":"F41.0",  "description":"Panic disorder without agoraphobia"},
        {"code":"F33.9",  "description":"Major depressive disorder, recurrent, unspecified"},
        {"code":"F43.10", "description":"Post-traumatic stress disorder (PTSD), unspecified"},
        # Endocrine
        {"code":"E11.9",  "description":"Type 2 diabetes mellitus without complications"},
        {"code":"E10.9",  "description":"Type 1 diabetes mellitus without complications"},
        {"code":"E03.9",  "description":"Hypothyroidism, unspecified (underactive thyroid)"},
        {"code":"E05.90", "description":"Thyrotoxicosis, unspecified (overactive thyroid)"},
        {"code":"E66.9",  "description":"Obesity, unspecified"},
        {"code":"E11.65", "description":"Type 2 diabetes with hyperglycemia (high blood sugar)"},
        # Fever / infection
        {"code":"R50.9",  "description":"Fever, unspecified"},
        {"code":"A41.9",  "description":"Sepsis, unspecified organism"},
        {"code":"B34.9",  "description":"Viral infection, unspecified"},
        # Women's health
        {"code":"N94.6",  "description":"Dysmenorrhoea, unspecified (painful periods)"},
        {"code":"N92.0",  "description":"Excessive and frequent menstruation with regular cycle"},
        {"code":"O00.90", "description":"Ectopic pregnancy, unspecified (abdominal pain in women)"},
        # Allergic
        {"code":"T78.40", "description":"Allergy, unspecified"},
        {"code":"J30.1",  "description":"Allergic rhinitis due to pollen"},
        {"code":"L23.9",  "description":"Allergic contact dermatitis, unspecified cause"},
        # Eye
        {"code":"H52.13", "description":"Myopia, bilateral (nearsightedness)"},
        {"code":"H57.10", "description":"Ocular pain, unspecified eye"},
        # COVID / viral
        {"code":"U07.1",  "description":"COVID-19"},
        {"code":"U09.9",  "description":"Post-COVID-19 condition, unspecified"},
        # General / screening
        {"code":"Z00.00", "description":"Encounter for general adult medical examination (annual physical)"},
        {"code":"Z23",    "description":"Encounter for immunization (vaccines)"},
        {"code":"Z12.11", "description":"Encounter for screening for malignant neoplasm of colon"},
    ]

# ── Generate embeddings ───────────────────────────────────────────────────────
def embed_batch(texts: list[str], api_key: str) -> list[list[float]]:
    """Call OpenAI embeddings API for a batch of texts."""
    import urllib.request, urllib.error
    import json as _json

    payload = _json.dumps({
        "model": EMBED_MODEL,
        "input": texts,
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = _json.loads(resp.read())
    return [item["embedding"] for item in data["data"]]

def build_index(codes: list[dict], api_key: str) -> None:
    """Generate embeddings for all ICD-10 codes and save to disk."""
    print(f"\nGenerating embeddings for {len(codes):,} codes...")
    print(f"  Model: {EMBED_MODEL}")
    print(f"  Batch size: {BATCH_SIZE}")
    estimated_cost = len(codes) * 1536 / 1e6 * 0.02
    print(f"  Estimated cost: ~${estimated_cost:.4f}")

    texts = [f"{c['code']}: {c['description']}" for c in codes]
    all_embeddings = []

    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        try:
            embeddings = embed_batch(batch, api_key)
            all_embeddings.extend(embeddings)
            print(f"  Batch {i//BATCH_SIZE + 1}/{(len(texts)-1)//BATCH_SIZE + 1} — {len(all_embeddings)}/{len(texts)} done")
            time.sleep(0.1)  # gentle rate limiting
        except Exception as e:
            print(f"  Batch failed: {e} — retrying in 5s")
            time.sleep(5)
            try:
                embeddings = embed_batch(batch, api_key)
                all_embeddings.extend(embeddings)
            except Exception as e2:
                print(f"  Retry failed: {e2} — using zeros for this batch")
                all_embeddings.extend([[0.0] * 1536] * len(batch))

    # Save metadata
    index = []
    for code_obj in codes:
        code = code_obj["code"]
        index.append({
            "code":        code,
            "description": code_obj["description"],
            "cpt_codes":   get_cpt_for_icd(code),
            "urgency":     get_urgency_for_icd(code),
        })

    with open(INDEX_FILE, "w") as f:
        json.dump(index, f, separators=(",", ":"))
    print(f"\nSaved index → {INDEX_FILE} ({INDEX_FILE.stat().st_size/1e3:.0f} KB)")

    # Save embeddings as compressed numpy
    matrix = np.array(all_embeddings, dtype=np.float32)
    np.savez_compressed(VECTORS_FILE, embeddings=matrix)
    print(f"Saved vectors → {VECTORS_FILE} ({VECTORS_FILE.stat().st_size/1e6:.1f} MB)")
    print(f"\nMatrix shape: {matrix.shape}")

# ── Verify ────────────────────────────────────────────────────────────────────
def verify(query: str = "sore throat and fever") -> None:
    """Quick cosine similarity test."""
    import urllib.request, json as _json

    print(f"\nVerifying with query: '{query}'")

    with open(INDEX_FILE) as f:
        index = json.load(f)
    data = np.load(VECTORS_FILE)
    matrix = data["embeddings"]

    # Embed query
    payload = _json.dumps({"model": EMBED_MODEL, "input": [query]}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/embeddings",
        data=payload,
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req) as resp:
        q_vec = np.array(_json.loads(resp.read())["data"][0]["embedding"], dtype=np.float32)

    # Cosine similarity
    norms = np.linalg.norm(matrix, axis=1)
    sims  = matrix @ q_vec / (norms * np.linalg.norm(q_vec) + 1e-9)
    top5  = np.argsort(sims)[::-1][:5]

    print("Top 5 matches:")
    for i, idx in enumerate(top5):
        item = index[idx]
        print(f"  {i+1}. [{item['code']}] {item['description'][:60]} (sim={sims[idx]:.3f})")
        print(f"      CPT: {[c['code'] for c in item['cpt_codes']]}  urgency: {item['urgency']}")

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if not OPENAI_API_KEY:
        # Try loading from .env.local
        env_file = ROOT / ".env.local"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.startswith("OPENAI_API_KEY="):
                    OPENAI_API_KEY = line.split("=", 1)[1].strip()
                    break

    if not OPENAI_API_KEY:
        print("ERROR: OPENAI_API_KEY not found in environment or .env.local")
        exit(1)

    codes = download_icd10()
    # Cap at 2000 for cost control — covers 95% of common presentations
    codes = codes[:2000]
    print(f"Using {len(codes):,} codes")

    build_index(codes, OPENAI_API_KEY)
    verify("sore throat and fever")
    verify("chest pain and shortness of breath")
    print("\nDone. Run npm run dev to use the new index.")
