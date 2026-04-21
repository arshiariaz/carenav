# CareNav

A healthcare navigation platform that helps users understand their insurance coverage, estimate out-of-pocket costs, and find appropriate care providers based on symptoms, plan data, and location.

Live demo: [carenav.vercel.app](https://carenav.vercel.app)

---

## Overview

CareNav walks users through a four-step flow: upload an insurance card, enter a location, describe symptoms, and get a ranked list of nearby providers with cost estimates tailored to their specific plan. The system combines OCR, large language models, semantic search, and a trained cost prediction model to produce estimates that account for plan type, facility type, geographic pricing, and deductible phase.

---

## Features

**Insurance card processing**
- OCR via Mindee API extracts member ID, group number, payer ID, and carrier name
- Extracted data is matched against 20,354 CMS plan records in BigQuery using exact and fuzzy matching
- GPT-4 fallback generates plan details when no match is found

**Symptom triage**
- GPT-4 analyzes free-text symptoms and returns urgency level, recommended care setting, red flags, and CPT codes
- Rule-based fallback handles common symptom patterns when the API is unavailable
- ICD-10 semantic search uses cosine similarity on 1,536-dimensional embeddings across 2,250 codes to retrieve candidate diagnoses

**Cost estimation**
- GradientBoostingRegressor trained on CMS 2024 Physician Fee Schedule
- Features: CPT code base rate, facility type multiplier (ER: 3.5x, Urgent Care: 1.2x, Primary Care: 1.0x), plan type multiplier, state GPCI adjustment
- Validation: R² = 0.92, MAE = $17 on held-out test set
- Deductible phase modeling: HMO/EPO plans show fixed copay; PPO/HDHP plans show both pre- and post-deductible estimates
- Z-score anomaly detection flags providers that are statistical outliers vs. state average

**Provider search**
- Google Places API (New) finds real nearby facilities with ratings, hours, and addresses
- Providers ranked by composite quality score: cost efficiency (40%), patient rating (40%), distance (20%)
- Separate sections for urgent care and emergency rooms with contextual cost warnings

**AI Benefits Advisor**
- RAG architecture: OCR and plan matching pipeline serves as retrieval, GPT-4 generates answers grounded strictly on the retrieved plan JSON
- Answers questions about copays, deductibles, specialist referrals, and coverage limits

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, TypeScript, React 19 |
| UI | Tailwind CSS, Lucide React |
| AI / ML | OpenAI GPT-4, GradientBoostingRegressor (scikit-learn) |
| OCR | Mindee API |
| Provider search | Google Places API (New), CMS NPPES NPI Registry |
| Distance | Google Distance Matrix API, OpenStreetMap/Nominatim fallback |
| Plan data | Google BigQuery (20,354 CMS marketplace plans) |
| Medications | FDA Drug API, CDC treatment guidelines |
| Health centers | HRSA API (Federally Qualified Health Centers) |
| Deployment | Vercel |

---

## Architecture

```
User
 |
 ├── Insurance card upload
 |     └── Mindee OCR --> /api/ocr
 |           └── BigQuery plan match --> /api/match-plan
 |                 └── GPT-4 fallback (plan generation)
 |
 ├── Symptom input
 |     └── GPT-4 triage --> /api/symptom-triage
 |           ├── ICD-10 semantic search (cosine similarity, 2,250 codes)
 |           └── CPT code extraction (ER codes filtered for non-emergency)
 |
 ├── Provider search
 |     └── Google Places API --> /api/provider-costs-local
 |           ├── ML cost prediction (GBR, CMS 2024 PFS)
 |           ├── Facility multiplier + plan type adjustment + state GPCI
 |           └── Quality scoring + anomaly detection
 |
 └── Benefits page
       └── GPT-4 RAG --> /api/ai-advisor
             └── Plan JSON as retrieval context
```

---

## Data

**CMS Physician Fee Schedule (2024)**
Used to train the cost prediction model. ~1,700 records across CPT codes, facility types, and states. Processed via `scripts/train_cost_model.py` and exported to `lib/models/cost_predictions.json`.

**CMS Marketplace Plan Data**
20,354 plans ingested into BigQuery from CMS PUF files via `scripts/ingest_cms_puf.py`. Used for plan matching by carrier, group number, and payer ID.

**ICD-10 Index**
2,250 diagnosis codes with 1,536-dimensional OpenAI embeddings. Built via `scripts/build_icd10_index.py` and stored in `data/icd10_index.json`.

---

## Local Development

**Prerequisites**
- Node.js 18+
- npm

**Install dependencies**
```bash
npm install
```

**Environment variables**

Create a `.env.local` file in the project root:
```
OPENAI_API_KEY=
GOOGLE_PLACES_API_KEY=
MINDEE_API_KEY=
NEXT_PUBLIC_GCP_PROJECT_ID=
GOOGLE_APPLICATION_CREDENTIALS=service-account-key.json
```

The Google Places API key requires the **Places API (New)** to be enabled separately in the GCP console — the legacy Places API will not work.

**Run the development server**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## API Routes

| Route | Description |
|---|---|
| `POST /api/ocr` | Processes insurance card image via Mindee, returns extracted fields |
| `POST /api/match-plan` | Matches OCR output against BigQuery plan database |
| `POST /api/symptom-triage` | GPT-4 symptom analysis, returns urgency, CPT codes, ICD-10 matches |
| `POST /api/provider-costs-local` | Google Places search + ML cost estimation |
| `POST /api/ai-advisor` | RAG-based benefits Q&A grounded on matched plan data |

---

## Known Limitations

- Deductible progress is not tracked — no claims data is linked, so pre/post-deductible cost estimates assume worst case for PPO/HDHP plans
- Plan matching accuracy depends on OCR quality; the GPT-4 fallback uses SBC filing estimates when exact match fails
- Cost estimates reflect predicted negotiated rates derived from CMS Medicare data, not actual insurer-negotiated rates
- Provider network status is inferred from plan type, not verified against real-time insurer network data

---

## License

Private repository. Not licensed for redistribution.
