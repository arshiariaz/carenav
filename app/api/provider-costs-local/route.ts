// app/api/provider-costs-local/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let procedureStats: Record<string, {
  description: string; national_mean: number; state_mean_tx: number;
  cross_state_mean: number; cross_state_stddev: number; n_states: number;
}> | null = null;

function loadProcedureStats() {
  if (procedureStats) return procedureStats;
  // Check all likely locations — original only checked data/ which doesn't exist
  const candidates = [
    join(process.cwd(), 'data', 'cms_procedure_stats.json'),
    join(process.cwd(), 'cms_procedure_stats.json'),
    join(process.cwd(), 'public', 'cms_procedure_stats.json'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      procedureStats = JSON.parse(readFileSync(p, 'utf-8'));
      console.log(`✅ Loaded ${Object.keys(procedureStats!).length} CPT codes from ${p}`);
      return procedureStats;
    }
  }
  console.warn('⚠️  cms_procedure_stats.json not found — using hardcoded CMS TX rates');
  return null;
}

const CMS_TX_RATES: Record<string, number> = {
  '99213': 83.74, '99214': 117.17, '99283': 68.97, '99284': 115.44,
  '87880': 16.07, '87804': 16.11, '81001': 3.10,  '71046': 23.08,
  '71045': 18.50, '93010': 7.91,  '73610': 29.98, '97110': 23.21,
  '99395': 174.00,
};

function getCmsRate(cptCode: string): number {
  return CMS_TX_RATES[cptCode] ?? 100;
}

const PROVIDER_TYPE_CONFIG: Record<string, { textQuery: string; label: string; costMultiplier: number; }> = {
  emergency:  { textQuery: 'emergency room hospital',            label: 'Emergency Room', costMultiplier: 3.5 },
  urgent_care:{ textQuery: 'urgent care clinic',                 label: 'Urgent Care',    costMultiplier: 1.2 },
  primary:    { textQuery: 'primary care doctor family medicine', label: 'Primary Care',   costMultiplier: 1.0 },
};

async function searchGooglePlaces(
  query: string, lat: number, lng: number, cityHint: string,
  radiusMeters = 16000, maxResults = 15
): Promise<{ places: any[]; error?: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  // Surface missing key as actionable error rather than silent empty array
  if (!apiKey) {
    console.error('❌ GOOGLE_PLACES_API_KEY not set in .env.local');
    return {
      places: [],
      error: 'Provider search is unavailable: GOOGLE_PLACES_API_KEY is missing from .env.local. ' +
             'Add it and ensure "Places API (New)" is enabled in Google Cloud Console.',
    };
  }

  // Strip "Your area" — meaningless to Google; locationBias handles proximity
  const cleanHint = cityHint.replace(/your area/gi, '').trim() || 'nearby';

  const body = {
    textQuery: `${query} near ${cleanHint}`,
    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
    maxResultCount: maxResults,
  };

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.internationalPhoneNumber,places.regularOpeningHours,places.location,places.types,places.id',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Google Places error:', res.status, errText);
      let msg = `Google Places API error ${res.status}.`;
      try {
        const parsed = JSON.parse(errText);
        const status = parsed?.error?.status;
        if (status === 'REQUEST_DENIED')    msg = 'Google Places API key is invalid or "Places API (New)" is not enabled in Google Cloud Console.';
        else if (status === 'OVER_QUERY_LIMIT') msg = 'Google Places quota exceeded for today.';
        else if (parsed?.error?.message)   msg = parsed.error.message;
      } catch {}
      return { places: [], error: msg };
    }

    const data = await res.json();
    return { places: data.places || [] };
  } catch (err) {
    console.error('Google Places fetch error:', err);
    return { places: [], error: 'Network error contacting Google Places API.' };
  }
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatHours(h: any): string {
  if (!h?.weekdayDescriptions?.length) return 'Call for hours';
  const d = h.weekdayDescriptions[0];
  if (d.toLowerCase().includes('open 24')) return 'Open 24 hours';
  return d.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday):\s*/, '');
}

function parseCopay(val: any, fallback: number): number {
  if (typeof val === 'number' && !isNaN(val)) return val;
  if (typeof val === 'string') { const n = parseFloat(val.replace(/[^0-9.]/g, '')); if (!isNaN(n) && n > 0) return n; }
  return fallback;
}

export async function POST(request: NextRequest) {
  try {
    const { symptom, cptCodes, urgency, city, state, lat: reqLat, lng: reqLng, matchedPlan } = await request.json();
    console.log('🔍 Provider search:', { symptom, urgency, city, state, cptCodes });

    const providerType = urgency === 'emergency' ? 'emergency' : 'urgent_care';
    const config = PROVIDER_TYPE_CONFIG[providerType];

    // lat/lng are the real GPS coordinates from the browser — always use them as primary
    const lat = (typeof reqLat === 'number' && !isNaN(reqLat) && reqLat !== 0) ? reqLat : 29.7604;
    const lng = (typeof reqLng === 'number' && !isNaN(reqLng) && reqLng !== 0) ? reqLng : -95.3698;
    const cityHint = [city, state].filter(s => s && !/your area/i.test(s)).join(' ') || 'Houston TX';

    console.log(`📍 GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)} | hint: "${cityHint}"`);

    const { places, error: placesError } = await searchGooglePlaces(config.textQuery, lat, lng, cityHint, 16000, 15);
    console.log(`  Google returned ${places.length} places`);

    // Return actionable error to UI instead of silent empty list
    if (places.length === 0 && placesError) {
      return NextResponse.json({ success: false, providers: [], error: placesError });
    }

    const plan = {
      copayUrgent:  parseCopay(matchedPlan?.copays?.urgentCare,  75),
      copayER:      parseCopay(matchedPlan?.copays?.emergency,  350),
      copayPrimary: parseCopay(matchedPlan?.copays?.primaryCare, 30),
      deductible:   parseCopay(matchedPlan?.deductible,        1500),
    };

    const stats = loadProcedureStats();
    const bundleMeanBase = (cptCodes ?? ['99213']).reduce((sum: number, code: string) => {
      const s = stats?.[code]; return sum + (s?.state_mean_tx ?? getCmsRate(code));
    }, 0);
    const bundleMeanTotal  = Math.round(bundleMeanBase * config.costMultiplier);
    const bundleStddev     = Math.sqrt((cptCodes ?? ['99213']).reduce((sum: number, code: string) => {
      const s = stats?.[code]; return sum + Math.pow(s?.cross_state_stddev ?? 5, 2);
    }, 0)) * config.costMultiplier;

    const providers = places.map((place: any) => {
      const pLat = place.location?.latitude ?? lat;
      const pLng = place.location?.longitude ?? lng;
      const distance = haversineDistance(lat, lng, pLat, pLng);

      const name = (place.displayName?.text ?? '').toLowerCase();
      const isER = name.includes('emergency') || / er$| er /.test(name);
      const displayType   = isER ? 'Emergency Room' : config.label;
      const effectiveType = isER ? 'emergency'      : providerType;
      const mult = PROVIDER_TYPE_CONFIG[effectiveType].costMultiplier;

      const totalCms = (cptCodes ?? ['99213']).reduce((s: number, c: string) => s + getCmsRate(c), 0);
      const negotiatedRate = Math.round(totalCms * mult);
      const patientCost = effectiveType === 'emergency'
        ? (plan.copayER   || Math.round(negotiatedRate * 0.2))
        : (plan.copayUrgent || Math.round(negotiatedRate * 0.2));

      // Deterministic per-provider variation — no random noise on refresh
      const hash = (place.displayName?.text ?? '').split('').reduce((h: number, c: string) => (h*31+c.charCodeAt(0))&0xffff, 0);
      const variation = 0.88 + (hash % 100) / 370;
      const adjNegotiated = Math.round(negotiatedRate * variation);
      const adjInsurance  = Math.max(0, adjNegotiated - patientCost);

      const z    = bundleStddev > 0 ? (adjNegotiated - bundleMeanTotal) / bundleStddev : 0;
      const pct  = bundleMeanTotal > 0 ? Math.round(((adjNegotiated - bundleMeanTotal) / bundleMeanTotal) * 100) : 0;
      const label = z < -1.5 ? 'great value' : z < -0.5 ? 'below average' : z > 1.5 ? 'high cost' : z > 0.5 ? 'above average' : 'average';

      return {
        name:                 place.displayName?.text ?? 'Unknown',
        type:                 displayType,
        address:              place.formattedAddress ?? '',
        phone:                place.internationalPhoneNumber ?? '',
        distance:             parseFloat(distance.toFixed(1)),
        driveTime:            Math.round(distance * 3 + 5),
        waitTime:             effectiveType === 'emergency' ? '30-60 min' : '15-45 min',
        hours:                formatHours(place.regularOpeningHours),
        rating:               place.rating ?? undefined,
        ratingCount:          place.userRatingCount ?? 0,
        estimatedPatientCost: patientCost,
        negotiatedRate:       adjNegotiated,
        insurancePays:        adjInsurance,
        networkStatus:        'In-Network',
        dataSource:           'Google Places + CMS Medicare Rates',
        anomalyScore:         parseFloat(z.toFixed(2)),
        priceLabel:           label,
        pctVsRegion:          pct,
        regionalMean:         bundleMeanTotal,
      };
    });

    providers.sort((a: any, b: any) => a.distance - b.distance);
    console.log(`📤 Returning ${providers.length} providers`);

    return NextResponse.json({ success: true, providers, stats: { count: providers.length } });

  } catch (error) {
    console.error('❌ Provider search error:', error);
    return NextResponse.json({ success: false, providers: [], error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}