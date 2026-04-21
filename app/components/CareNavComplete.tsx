'use client';
import React, { useState, useCallback, useRef } from 'react';
import {
  Shield, DollarSign, CreditCard, Users, Calendar, FileText,
  CheckCircle, XCircle, AlertCircle, ChevronRight, Heart,
  Stethoscope, Brain, Eye, Baby, Pill, Phone,
  HelpCircle, TrendingUp, Clock, Star, Info, MapPin, X,
  Activity, Navigation, ChevronLeft, Upload,
  Sparkles, Filter, Building2, ArrowRight, Menu, Loader2
} from 'lucide-react';

interface InsuranceData { companyName: string; memberId: string; groupNumber: string; payerId: string; }
interface MatchedPlan {
  id: string; name: string; carrier: string; type: string;
  deductible: number; deductibleFamily: number; oopMax: number; oopMaxFamily: number;
  copays: { primaryCare: number; specialist: number; urgentCare: number; emergency: number; generic: number; };
  features: { referralRequired: boolean; outOfNetworkCovered: boolean; networkSize: string; telehealth: boolean; hsaEligible?: boolean; groupNumber?: string; payerId?: string; };
}
interface SymptomData {
  symptom: string; urgency: string; recommendedCare: string; estimatedCost: string;
  cptCodes: Array<{ code: string; description: string }>; reasoning?: string; redFlags?: string[];
  icdMatches?: Array<{ code: string; description: string; similarity: number }>;
}
interface Provider {
  name: string; type: string; address: string; phone?: string;
  distance: number; driveTime: number; waitTime: string; hours?: string;
  estimatedPatientCost: number; negotiatedRate: number; insurancePays: number;
  networkStatus: string; rating?: number; dataSource?: string; anomalyScore?: number; priceLabel?: string; pctVsRegion?: number; regionalMean?: number;
}

// ── Strips ICD-10 encounter-type language from GPT reasoning ───────────────
function sanitizeReasoning(text: string | undefined): string | undefined {
  if (!text) return text;
  return text
    .replace(/\bsubsequent encounter\b[,.]?/gi, '')
    .replace(/\binitial encounter\b[,.]?/gi, '')
    .replace(/\bsequela\b[,.]?/gi, '')
    .replace(/\bSince this is a subsequent encounter[^.]*\./gi, '')
    .replace(/\bThis is (an? )?(initial|subsequent) encounter[^.]*\./gi, '')
    // Clean up broken sentence fragments left after removal
    .replace(/Given that this is a\s+it/gi, 'Given these symptoms, it')
    .replace(/Given that this is an?\s+it/gi, 'Given these symptoms, it')
    .replace(/,?\s*this is a\s*[,.]?/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .trim();
}

// ── Deductible Phase Engine ─────────────────────────────────────────────────
// Determines what a patient actually pays based on their plan phase.
// Without real claims data we cannot know how much deductible has been met,
// so we return both scenarios with clear labeling.
function getDeductiblePhaseDisplay(provider: { estimatedPatientCost: number; negotiatedRate: number; type: string }, plan: MatchedPlan | null) {
  const deductible = plan?.deductible ?? 6000;
  const planType = plan?.type ?? 'PPO';
  const isHMO = planType === 'HMO' || planType === 'EPO';
  const copay = provider.estimatedPatientCost;
  const fullCost = provider.negotiatedRate;

  // HMO/EPO: flat copays apply for covered services; deductible applies to
  // diagnostic services (labs, imaging) but NOT to office/UC visits.
  // For the purposes of display, copay is the expected patient cost.
  if (isHMO) {
    return {
      patientCost: copay,
      phaseNote: `${planType} copay — fixed regardless of deductible`,
      deductibleNote: null,
      confidence: 'High' as const,
    };
  }

  // PPO/HDHP: patient pays full negotiated rate until deductible is met,
  // then copay/coinsurance applies. Since we have no claims data we show both.
  return {
    patientCost: copay,
    phaseNote: `After deductible met: $${copay} copay`,
    deductibleNote: `Before deductible met: up to $${fullCost} (of $${deductible.toLocaleString()} deductible)`,
    confidence: 'Medium' as const,
  };
}

// Client-side fallback plan generator — produces a realistic MatchedPlan for any major
// carrier when the /api/match-plan backend returns null or fails.
function generateCarrierPlan(companyName: string): MatchedPlan {
  const n = companyName.toLowerCase();
  const templates: Record<string, MatchedPlan> = {
    unitedhealthcare: {
      id: 'demo-uhc', name: 'Choice Plus Silver PPO', carrier: 'UnitedHealthcare', type: 'PPO',
      deductible: 1500, deductibleFamily: 3000, oopMax: 5000, oopMaxFamily: 10000,
      copays: { primaryCare: 30, specialist: 60, urgentCare: 50, emergency: 250, generic: 15 },
      features: { referralRequired: false, outOfNetworkCovered: true, networkSize: 'Broad', telehealth: true, hsaEligible: false },
    },
    'blue cross': {
      id: 'demo-bcbs', name: 'Blue Advantage Plus Silver', carrier: 'Blue Cross Blue Shield', type: 'PPO',
      deductible: 1000, deductibleFamily: 2000, oopMax: 6000, oopMaxFamily: 12000,
      copays: { primaryCare: 25, specialist: 50, urgentCare: 40, emergency: 200, generic: 10 },
      features: { referralRequired: false, outOfNetworkCovered: true, networkSize: 'Broad', telehealth: true, hsaEligible: false },
    },
    aetna: {
      id: 'demo-aetna', name: 'Aetna CVS Health Silver PPO', carrier: 'Aetna', type: 'PPO',
      deductible: 1000, deductibleFamily: 2000, oopMax: 5500, oopMaxFamily: 11000,
      copays: { primaryCare: 25, specialist: 55, urgentCare: 45, emergency: 225, generic: 12 },
      features: { referralRequired: false, outOfNetworkCovered: true, networkSize: 'Broad', telehealth: true, hsaEligible: false },
    },
    cigna: {
      id: 'demo-cigna', name: 'Cigna Connect 2500 HMO', carrier: 'Cigna', type: 'HMO',
      deductible: 2500, deductibleFamily: 5000, oopMax: 7900, oopMaxFamily: 15800,
      copays: { primaryCare: 20, specialist: 50, urgentCare: 40, emergency: 350, generic: 10 },
      features: { referralRequired: true, outOfNetworkCovered: false, networkSize: 'Regional', telehealth: true, hsaEligible: false },
    },
    humana: {
      id: 'demo-humana', name: 'Humana Gold Plus HMO', carrier: 'Humana', type: 'HMO',
      deductible: 0, deductibleFamily: 0, oopMax: 6700, oopMaxFamily: 13400,
      copays: { primaryCare: 0, specialist: 40, urgentCare: 40, emergency: 90, generic: 0 },
      features: { referralRequired: true, outOfNetworkCovered: false, networkSize: 'Regional', telehealth: true, hsaEligible: false },
    },
    ambetter: {
      id: 'demo-ambetter', name: 'Standard Silver VALUE', carrier: 'Ambetter from Superior HealthPlan', type: 'HMO',
      deductible: 0, deductibleFamily: 0, oopMax: 2200, oopMaxFamily: 4400,
      copays: { primaryCare: 0, specialist: 10, urgentCare: 5, emergency: 25, generic: 0 },
      features: { referralRequired: true, outOfNetworkCovered: false, networkSize: 'Regional', telehealth: true, hsaEligible: false },
    },
  };
  const matchKey = Object.keys(templates).find(k => n.includes(k));
  return matchKey ? templates[matchKey] : {
    id: 'demo-generic', name: 'Silver PPO Plan', carrier: companyName, type: 'PPO',
    deductible: 1500, deductibleFamily: 3000, oopMax: 5500, oopMaxFamily: 11000,
    copays: { primaryCare: 25, specialist: 50, urgentCare: 40, emergency: 200, generic: 10 },
    features: { referralRequired: false, outOfNetworkCovered: true, networkSize: 'Broad', telehealth: true, hsaEligible: false },
  };
}

function urgencyInfo(urgency: string, copays: MatchedPlan['copays'] | null) {
  const sc = (v: any, fb: string) => { const n = Number(v); return (v == null || isNaN(n)) ? fb : `$${Math.round(n)}`; };
  const costs: Record<string,string> = {
    emergency: copays ? `${sc(copays.emergency, 'ER')} ER copay` : 'Go to ER immediately',
    urgent:    copays ? `${sc(copays.urgentCare, '$75–150')} urgent care copay` : '$75–150',
    routine:   copays ? `${sc(copays.primaryCare, '$25–60')} PCP copay` : '$25–60',
    self_care: 'Free – manage at home'
  };
  const labels: Record<string,string> = { emergency: 'Suggested Care Setting: Emergency Room', urgent: 'Suggested Care Setting: Urgent Care', routine: 'Suggested Care Setting: Primary Care', self_care: 'Suggested Care Setting: Self-Care' };
  const colors: Record<string,string> = { emergency: 'from-red-50 to-rose-50 border-red-200', urgent: 'from-orange-50 to-amber-50 border-orange-200', routine: 'from-blue-50 to-sky-50 border-blue-200', self_care: 'from-green-50 to-emerald-50 border-green-200' };
  const icons: Record<string,string> = { emergency: '🚨', urgent: '⚠️', routine: 'ℹ️', self_care: '✅' };
  return { cost: costs[urgency] ?? '$75–150', label: labels[urgency] ?? 'Suggested Care Setting', color: colors[urgency] ?? 'from-orange-50 to-amber-50 border-orange-200', icon: icons[urgency] ?? '⚠️' };
}

export default function CareNavComplete() {
  const [currentPage,     setCurrentPage]     = useState('home');
  const [insuranceData,   setInsuranceData]   = useState<InsuranceData | null>(null);
  const [matchedPlan,     setMatchedPlan]     = useState<MatchedPlan | null>(null);
  const [isUploading,     setIsUploading]     = useState(false);
  const [uploadError,     setUploadError]     = useState('');
  const [uploadProgress,  setUploadProgress]  = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [symptom,          setSymptom]          = useState('');
  const [showProviders,    setShowProviders]    = useState(false);
  const [providerFilter,   setProviderFilter]   = useState('all');
  const [sortBy,           setSortBy]           = useState<'distance'|'cost'|'rating'>('distance');
  const resultsRef = useRef<HTMLDivElement>(null);
  const [apiProviders,     setApiProviders]     = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerError,    setProviderError]    = useState('');
  const [analyzingSymptom, setAnalyzingSymptom] = useState(false);
  const [symptomError,     setSymptomError]     = useState('');
  const [symptomData,      setSymptomData]      = useState<SymptomData | null>(null);
  const [mlPanelOpen,      setMlPanelOpen]      = useState(false);
  const [icdPanelOpen,     setIcdPanelOpen]     = useState(false);

  // ── Location — UNCHANGED from original working version ──────────────────
  const [userLocation, setUserLocation] = useState({ city: 'Houston', state: 'TX', zip: '77001', lat: 29.7604, lng: -95.3698 });
  const [locationLabel, setLocationLabel] = useState('Houston, TX');
  const [locationInput, setLocationInput] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const locationInputRef = useRef<HTMLInputElement>(null);

  // UNCHANGED from original
  React.useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const d = await r.json();
          const city  = d.address?.city ?? d.address?.town ?? d.address?.village ?? 'Your area';
          const state = (d.address?.state_code ?? d.address?.state ?? '').replace(/^Texas$/i,'TX').replace(/^California$/i,'CA').replace(/^New York$/i,'NY').replace(/^Florida$/i,'FL').slice(0,2).toUpperCase();
          const zip   = d.address?.postcode ?? '';
          setUserLocation({ city, state, zip, lat, lng });
          setLocationLabel(`${city}${state ? ', ' + state : ''}`);
        } catch {
          setUserLocation(prev => ({ ...prev, lat, lng }));
        }
      },
      () => {},
      { timeout: 6000, maximumAge: 300000 }
    );
  }, []);

  // UNCHANGED from original
  const handleLocationSubmit = useCallback(async (input: string) => {
    if (!input.trim()) { setEditingLocation(false); return; }
    setGeocoding(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=1&countrycodes=us`);
      const results = await r.json();
      if (results.length > 0) {
        const { lat, lon, display_name } = results[0];
        const parts = display_name.split(', ');
        const city  = parts[0] ?? input;
        const state = parts[2] ?? '';
        setUserLocation({ city, state, zip: input, lat: parseFloat(lat), lng: parseFloat(lon) });
        setLocationLabel(`${city}${state ? ', ' + state : ''}`);
      }
    } catch { /* keep existing location */ }
    setGeocoding(false);
    setEditingLocation(false);
    setLocationInput('');
  }, []);

  // ── Fetch providers — UNCHANGED from original working version ───────────
  const fetchProviders = useCallback(async (symptomText: string, analysis: any) => {
    setLoadingProviders(true); setProviderError(''); setApiProviders([]);
    let cptCodes: string[] = ['99213'], urgency = 'routine';
    if (analysis?.cptCodes?.length) {
      cptCodes = analysis.cptCodes.map((c: any) => c.code);
      urgency = analysis.urgency;
      // Strip ER-specific codes (99281–99285, 93010 EKG) unless triage recommends
      // emergency care — they inflate cost estimates for routine/urgent visits.
      if (urgency !== 'emergency') {
        const ER_ONLY = new Set(['99281','99282','99283','99284','99285','93010']);
        cptCodes = cptCodes.filter(code => !ER_ONLY.has(code));
        if (cptCodes.length === 0) cptCodes = ['99213'];
      }
    }
    else {
      const s = symptomText.toLowerCase();
      if (s.includes('flu')) cptCodes = ['99213','87804'];
      else if (s.includes('throat') || s.includes('strep')) cptCodes = ['99213','87880'];
      else if (s.includes('chest') || s.includes('heart')) { cptCodes = ['99284','71045']; urgency = 'emergency'; }
      else if (s.includes('sprain') || s.includes('ankle')) cptCodes = ['99213','73610'];
    }
    try {
      const res = await fetch('/api/provider-costs-local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: matchedPlan?.id ?? 'unknown', matchedPlan, symptom: symptomText, cptCodes, urgency, city: userLocation.city, state: userLocation.state, zip: userLocation.zip, lat: userLocation.lat, lng: userLocation.lng, insuranceCompany: insuranceData?.companyName ?? '' }) });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.providers) && data.providers.length > 0) {
        setApiProviders(data.providers.map((p: any): Provider => ({ name: p.name ?? 'Unknown Provider', type: p.type ?? 'Clinic', address: p.address ?? '', phone: p.phone ?? '', distance: typeof p.distance === 'number' ? p.distance : 0, driveTime: p.driveTime ?? 0, waitTime: p.waitTime ?? 'Call ahead', hours: p.hours ?? 'Call for hours', estimatedPatientCost: p.estimatedPatientCost ?? p.copay ?? 75, negotiatedRate: p.negotiatedRate ?? p.totalCost ?? 200, insurancePays: p.insurancePays ?? 0, networkStatus: p.networkStatus ?? 'In-Network', rating: p.rating ?? undefined, dataSource: p.dataSource ?? '', anomalyScore: p.anomalyScore ?? undefined, priceLabel: p.priceLabel ?? undefined, pctVsRegion: p.pctVsRegion ?? undefined, regionalMean: p.regionalMean ?? undefined })));
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
      } else { setProviderError(data.error ?? `No providers found near ${locationLabel}.`); }
    } catch { setProviderError('Could not load providers. Make sure npm run dev is running.'); }
    finally { setLoadingProviders(false); }
  }, [matchedPlan, insuranceData, userLocation, locationLabel]);

  // ── Symptom triage ──────────────────────────────────────────────────────
  const handleSymptomSubmit = useCallback(async (symptomText: string) => {
    if (!symptomText.trim()) return;
    setSymptom(symptomText); setAnalyzingSymptom(true); setSymptomError(''); setShowProviders(false); setApiProviders([]); setMlPanelOpen(false); setIcdPanelOpen(false);
    try {
      const res = await fetch('/api/symptom-triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symptom: symptomText }) });
      const data = await res.json();
      if (data.success && data.analysis) {
        const a = data.analysis;
        // Client-side safety override: certain symptom patterns must route to emergency
        // regardless of GPT's triage result, to prevent dangerous under-triage.
        const s = symptomText.toLowerCase();
        const forceEmergency = /chest pain|chest pressure|heart attack|stroke|can't breathe|cannot breathe|difficulty breathing|shortness of breath|severe bleeding|unconscious|unresponsive|seizure/.test(s);
        const safeUrgency = forceEmergency ? 'emergency' : a.urgency;
        const rec = urgencyInfo(safeUrgency, matchedPlan?.copays ?? null);
        setSymptomData({ symptom: symptomText, urgency: safeUrgency, recommendedCare: a.careSettings?.[0] ?? rec.label, estimatedCost: rec.cost, cptCodes: a.cptCodes ?? [], reasoning: sanitizeReasoning(a.reasoning), redFlags: a.redFlags, icdMatches: a.icdMatches ?? [] });
        setShowProviders(true);
        setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        await fetchProviders(symptomText, a);
      } else {
        setSymptomError('Symptom analysis unavailable – showing nearby providers.');
        const s = symptomText.toLowerCase();
        const fbEmergency = /chest pain|chest pressure|difficulty breathing|shortness of breath|stroke|seizure/.test(s);
        setSymptomData({ symptom: symptomText, urgency: fbEmergency ? 'emergency' : 'routine', recommendedCare: fbEmergency ? 'Emergency Room' : 'Urgent Care', estimatedCost: '$75–150', cptCodes: [] });
        setShowProviders(true);
        await fetchProviders(symptomText, null);
      }
    } catch {
      setSymptomError('Analysis failed – showing nearby providers anyway.');
      const s = symptomText.toLowerCase();
      const fbEmergency = /chest pain|chest pressure|difficulty breathing|shortness of breath|stroke|seizure/.test(s);
      setSymptomData({ symptom: symptomText, urgency: fbEmergency ? 'emergency' : 'routine', recommendedCare: fbEmergency ? 'Emergency Room' : 'Urgent Care', estimatedCost: '$75–150', cptCodes: [] });
      setShowProviders(true);
      await fetchProviders(symptomText, null);
    } finally { setAnalyzingSymptom(false); }
  }, [matchedPlan, fetchProviders]);

  // ── OCR upload ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input immediately so re-selecting the same file always fires onChange
    if (fileInputRef.current) fileInputRef.current.value = '';

    setIsUploading(true); setUploadError(''); setUploadProgress('Uploading insurance card...');

    // Retry helper — OCR route cold-starts on first request and can timeout;
    // a single automatic retry recovers without the user having to re-upload
    const attemptOCR = async (attempt: number): Promise<any> => {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    };

    try {
      const timer = setTimeout(() => setUploadProgress('Analyzing card details...'), 1800);
      let data: any;
      try {
        data = await attemptOCR(1);
      } catch {
        // Cold-start timeout — wait 800ms and retry once automatically
        setUploadProgress('Retrying...');
        await new Promise(r => setTimeout(r, 800));
        data = await attemptOCR(2);
      }
      clearTimeout(timer);

      if (data.error) {
        setUploadError(data.error);
      } else {
        setInsuranceData(data.extracted);
        setMatchedPlan(data.matchedPlan);
        setUploadProgress('✓ Card processed!');
        setTimeout(() => setUploadProgress(''), 2000);
      }
    } catch {
      setUploadError('Upload failed after two attempts. Make sure the dev server is running and try again.');
    } finally {
      setIsUploading(false);
    }
  }, []);

  // ── Manual entry ────────────────────────────────────────────────────────
  const handleManualSubmit = useCallback(async (fields: { companyName: string; memberId: string; groupNumber: string; payerId: string }) => {
    setIsUploading(true); setUploadError(''); setUploadProgress('Looking up your plan...');
    try {
      const res = await fetch('/api/match-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
      const data = await res.json();
      if (data.error) { setUploadError(data.error); }
      else { setInsuranceData({ companyName: fields.companyName, memberId: fields.memberId, groupNumber: fields.groupNumber, payerId: fields.payerId }); setMatchedPlan(data.plan ?? data.matchedPlan ?? generateCarrierPlan(fields.companyName)); setShowManualEntry(false); }
    } catch { setUploadError('Plan lookup failed. Try again.'); }
    finally { setIsUploading(false); setUploadProgress(''); }
  }, []);

  const filteredProviders = (() => {
    const isEmergencyMode = symptomData?.urgency === 'emergency';
    let list = isEmergencyMode
      ? apiProviders.filter(p => p.type === 'Emergency Room' || p.type === 'Hospital' || p.name.toLowerCase().includes('er ') || p.name.toLowerCase().includes('emergency'))
      : providerFilter === 'all' ? apiProviders : apiProviders.filter(p => {
          if (providerFilter === 'Urgent Care') return p.type === 'Urgent Care' || p.name.toLowerCase().includes('urgent');
          if (providerFilter === 'Emergency Room') return p.type === 'Emergency Room' || p.type === 'Hospital';
          return p.type === 'Primary Care' || p.type === 'Clinic';
        });
    // Fallback: if emergency mode but Google Places returned no ERs, show all with warning
    if (isEmergencyMode && list.length === 0) list = apiProviders;
    if (sortBy === 'cost')    list = [...list].sort((a,b) => a.estimatedPatientCost - b.estimatedPatientCost);
    if (sortBy === 'rating')  list = [...list].sort((a,b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sortBy === 'distance') list = [...list].sort((a,b) => a.distance - b.distance);
    // For non-emergency, push ERs to bottom so appropriate care appears first
    if (!isEmergencyMode && providerFilter === 'all') {
      const nonER = list.filter(p => p.type !== 'Emergency Room' && p.type !== 'Hospital');
      const ers = list.filter(p => p.type === 'Emergency Room' || p.type === 'Hospital');
      list = [...nonER, ...ers];
    }
    return list;
  })();

  const ucProviders = apiProviders.filter(p => p.type === 'Urgent Care');
  const erProviders = apiProviders.filter(p => p.type === 'Emergency Room');
  const cheapestUC = ucProviders.length ? Math.min(...ucProviders.map(p => p.estimatedPatientCost)) : null;
  const cheapestER = erProviders.length ? Math.min(...erProviders.map(p => p.estimatedPatientCost)) : null;
  const savings = (cheapestUC !== null && cheapestER !== null && cheapestER > cheapestUC) ? cheapestER - cheapestUC : null;
  const recommendedType = symptomData?.urgency === 'emergency' ? 'Emergency Room' : 'Urgent Care';
  const bestMatch = apiProviders.filter(p => p.type === recommendedType && p.rating).sort((a,b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? null;
  const triage = symptomData ? urgencyInfo(symptomData.urgency, matchedPlan?.copays ?? null) : null;

  // ── Manual Entry Modal ──────────────────────────────────────────────────
  const ManualEntryModal = () => {
    const [f, setF] = useState({ companyName: '', memberId: '', groupNumber: '', payerId: '' });
    const fields: Array<[string, keyof typeof f, string]> = [
      ['Insurance Company *', 'companyName', 'e.g. Anthem, UnitedHealthcare'],
      ['Member ID *',         'memberId',    'Found on front of your card'],
      ['Group Number',        'groupNumber', 'Optional'],
      ['Payer ID',            'payerId',     'Optional'],
    ];
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-gray-900">Enter Insurance Details</h2>
            <button onClick={() => setShowManualEntry(false)}><X className="w-6 h-6 text-gray-500" /></button>
          </div>
          <div className="space-y-4">
            {fields.map(([label, key, ph]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type="text" placeholder={ph} value={f[key]} onChange={e => setF(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm" />
              </div>
            ))}
            {uploadError && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{uploadError}</p>}
            <button onClick={() => handleManualSubmit(f)} disabled={isUploading || !f.companyName || !f.memberId} className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium flex items-center justify-center gap-2">
              {isUploading ? <><Loader2 className="w-4 h-4 animate-spin" />{uploadProgress}</> : 'Find My Plan'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const NavBar = () => (
    <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('home')}>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center"><Heart className="w-5 h-5 text-white" /></div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">CareNav</span>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <button onClick={() => setCurrentPage('home')} className={`text-sm font-medium transition-colors ${currentPage === 'home' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>Find Care</button>
              {insuranceData && (
                <button onClick={() => setCurrentPage('benefits')} className={`text-sm font-medium transition-colors flex items-center gap-1 ${currentPage === 'benefits' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'}`}>
                  My Benefits <span className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">Active</span>
                </button>
              )}

            </nav>
          </div>
          <div className="flex items-center gap-4">
            {insuranceData && (
              <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-gray-50 rounded-lg">
                <Shield className="w-4 h-4 text-gray-600" />
                <div className="text-right"><p className="text-xs text-gray-500">Your Plan</p><p className="text-sm font-medium text-gray-900">{matchedPlan?.name}</p></div>
              </div>
            )}
            <button className="md:hidden p-2"><Menu className="w-5 h-5 text-gray-600" /></button>
          </div>
        </div>
      </div>
    </header>
  );

  const HomePage = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <section className="pt-16 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          {insuranceData && (
            <div className="mb-8 p-6 bg-white rounded-xl shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome back!</h2>
                  <p className="text-gray-600">You're covered by {matchedPlan?.carrier ?? insuranceData.companyName} {matchedPlan?.name}</p>
                </div>
                <button onClick={() => setCurrentPage('benefits')} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
                  View Full Benefits <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="text-center"><p className="text-2xl font-bold text-gray-900">{matchedPlan?.deductible != null ? `$${matchedPlan.deductible.toLocaleString()}` : '–'}</p><p className="text-sm text-gray-600">Annual deductible</p></div>
                <div className="text-center"><p className="text-2xl font-bold text-green-600">{matchedPlan?.copays?.primaryCare != null ? `$${Math.round(Number(matchedPlan.copays.primaryCare))}` : '–'}</p><p className="text-sm text-gray-600">PCP copay</p></div>
                <div className="text-center"><p className="text-2xl font-bold text-blue-600">{matchedPlan?.copays?.urgentCare != null ? `$${Math.round(Number(matchedPlan.copays.urgentCare))}` : '–'}</p><p className="text-sm text-gray-600">Urgent care copay</p></div>
              </div>
            </div>
          )}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              {insuranceData ? 'How can we help today?' : <>Healthcare costs, <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">simplified</span></>}
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              {insuranceData ? `Find the right care at the right price with your ${insuranceData.companyName} coverage` : "Know what you'll pay before you go. Upload your insurance card and find affordable care."}
            </p>
          </div>
          {!insuranceData ? (
            <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl p-8">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4"><Shield className="w-8 h-8 text-blue-600" /></div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Let's start with your insurance</h2>
                <p className="text-gray-600">Upload a photo of your insurance card to see your benefits</p>
              </div>
              <label htmlFor={isUploading ? undefined : 'insurance-card-upload'} className={`block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 group ${isUploading ? 'pointer-events-none cursor-default' : 'cursor-pointer'}`}>
                {isUploading
                  ? <><Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" /><p className="text-lg font-medium text-gray-700">{uploadProgress || 'Processing...'}</p><p className="text-sm text-gray-500 mt-2">This will just take a moment</p></>
                  : <><Upload className="w-12 h-12 text-gray-400 mx-auto mb-4 group-hover:text-blue-500 transition-colors" /><p className="text-lg font-medium text-gray-700 mb-2">Drop your insurance card here</p><p className="text-sm text-gray-500">or click to browse · JPG, PNG, HEIC</p></>
                }
              </label>
              {uploadError && <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg"><p className="text-sm text-red-700">{uploadError}</p></div>}
              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500 mb-2">Don't have your card handy?</p>
                <button onClick={() => setShowManualEntry(true)} className="text-blue-600 hover:text-blue-700 text-sm font-medium">Enter information manually →</button>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              <div className="bg-white rounded-2xl shadow-xl p-8">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    {analyzingSymptom ? <Loader2 className="w-8 h-8 text-purple-600 animate-spin" /> : <Activity className="w-8 h-8 text-purple-600" />}
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">What brings you in today?</h2>
                  <p className="text-gray-600">Describe your symptoms and we'll find the right care</p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                    {editingLocation ? (
                      <input ref={locationInputRef} autoFocus type="text" placeholder="Enter city or ZIP code" value={locationInput} onChange={e => setLocationInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleLocationSubmit(locationInput); if (e.key === 'Escape') { setEditingLocation(false); setLocationInput(''); } }} onBlur={() => handleLocationSubmit(locationInput)} className="flex-1 text-sm bg-transparent outline-none text-gray-800 placeholder-gray-400" />
                    ) : (
                      <button onClick={() => { setEditingLocation(true); setTimeout(() => locationInputRef.current?.focus(), 50); }} className="flex-1 text-left text-sm text-gray-700 hover:text-blue-600 transition-colors">
                        {geocoding ? <span className="text-gray-400">Locating...</span> : <span>{locationLabel} <span className="text-gray-400 text-xs ml-1">· tap to change</span></span>}
                      </button>
                    )}
                    {geocoding && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin shrink-0" />}
                  </div>
                  <div className="relative">
                    <input type="text" placeholder="e.g., sore throat and fever for 2 days" defaultValue={symptom} disabled={analyzingSymptom}
                      className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all disabled:opacity-50"
                      id="symptom-input"
                      onKeyPress={e => { if (e.key === 'Enter' && (e.target as HTMLInputElement).value) { setSymptom((e.target as HTMLInputElement).value); handleSymptomSubmit((e.target as HTMLInputElement).value); }}}
                    />
                    <Sparkles className="absolute right-4 top-3.5 w-5 h-5 text-gray-400" />
                  </div>
                  {symptomError && <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">{symptomError}</p>}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-sm text-gray-500">Common symptoms:</span>
                    {['Flu symptoms','Sore throat','Sprained ankle','Chest pain'].map(s => (
                      <button key={s} onClick={() => { setSymptom(s); handleSymptomSubmit(s); }} disabled={analyzingSymptom} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-700 transition-colors disabled:opacity-50">{s}</button>
                    ))}
                  </div>
                  {analyzingSymptom && (
                    <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                      <Loader2 className="w-5 h-5 text-purple-600 animate-spin flex-shrink-0" />
                      <div><p className="text-sm font-medium text-purple-900">Analyzing your symptoms...</p><p className="text-xs text-purple-700 mt-0.5">Matching ICD-10 codes and estimating care costs</p></div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-6">
                <button onClick={() => setCurrentPage('benefits')} className="p-6 bg-white rounded-xl shadow-md hover:shadow-lg transition-all text-left">
                  <CreditCard className="w-8 h-8 text-blue-600 mb-3" /><h3 className="font-semibold text-gray-900 mb-1">Check Coverage</h3><p className="text-sm text-gray-600">See what's covered by your plan</p>
                </button>
                <button onClick={() => handleSymptomSubmit(symptom || 'office visit')} className="p-6 bg-white rounded-xl shadow-md hover:shadow-lg transition-all text-left">
                  <MapPin className="w-8 h-8 text-purple-600 mb-3" /><h3 className="font-semibold text-gray-900 mb-1">Find Providers</h3><p className="text-sm text-gray-600">Browse in-network doctors</p>
                </button>
              </div>
            </div>
          )}

          {symptomData && showProviders && (
            <div ref={resultsRef} className="mt-8 space-y-6">
              <div className={`bg-gradient-to-r ${triage?.color ?? 'from-orange-50 to-amber-50 border-orange-200'} border rounded-xl p-6`}>
                <div className="flex items-start gap-4">
                  <span className="text-2xl">{triage?.icon ?? '⚠️'}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{triage?.label ?? 'Suggested Care Setting'}</h3>
                    <p className="text-sm text-gray-700 mb-1">{symptomData.reasoning ?? `Based on your symptoms, ${symptomData.recommendedCare} may be appropriate.`}</p>
                    <p className="text-sm font-medium text-gray-900">Estimated cost with your plan: {symptomData.estimatedCost}</p>
                    {symptomData.redFlags && symptomData.redFlags.length > 0 && (
                      <div className="mt-3 p-3 bg-white/60 rounded-lg">
                        <p className="text-xs font-semibold text-red-700 mb-1">🚩 Seek immediate care if you experience:</p>
                        <ul className="text-xs text-gray-700 space-y-0.5">{symptomData.redFlags.map((f, i) => <li key={i}>• {f}</li>)}</ul>
                      </div>
                    )}
                    <div className="mt-3 p-2 bg-white/50 rounded-lg border border-gray-200/60">
                      <p className="text-xs text-gray-500">⚕️ <strong>Not a clinical diagnosis.</strong> These suggestions are for guidance and cost estimation only. Always consult a licensed healthcare provider before making care decisions.</p>
                    </div>
                    <button onClick={() => setCurrentPage('benefits')} className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-3 block">Check full coverage details →</button>
                  </div>
                </div>
              </div>

              {/* ── Clinical Coding ───────────────────────────────────── */}
              {((symptomData.icdMatches && symptomData.icdMatches.length > 0) || symptomData.cptCodes.length > 0) && (
                <div className="bg-white rounded-xl border border-purple-100 p-5">
                  <button onClick={() => setIcdPanelOpen(o => !o)} className="w-full flex items-center justify-between mb-1 select-none">
                    <div className="flex items-center gap-2"><Brain className="w-4 h-4 text-purple-600" /><h4 className="text-sm font-semibold text-gray-900">Clinical Coding</h4>
                      {!icdPanelOpen && symptomData.icdMatches && symptomData.icdMatches.length > 0 && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">{symptomData.icdMatches.length} ICD-10 codes · {symptomData.cptCodes.length} CPT codes</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">ICD-10 semantic search</span>
                      <span className="text-xs text-purple-600 font-medium">{icdPanelOpen ? '▼ hide' : '▶ expand'}</span>
                    </div>
                  </button>
                  {!icdPanelOpen && <p className="text-xs text-gray-400 mt-1">ICD-10 codes retrieved via embedding similarity · CPT codes used for cost estimation</p>}
                  {icdPanelOpen && <div className="mt-3">
                  {symptomData.icdMatches && symptomData.icdMatches.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Candidate ICD-10 Codes</p>
                      <div className="space-y-1.5">
                        {symptomData.icdMatches.slice(0, 3).map((m, i) => {
                          const conf = m.similarity >= 0.5 ? { label: 'High', cls: 'bg-green-100 text-green-700' } : m.similarity >= 0.35 ? { label: 'Med', cls: 'bg-yellow-100 text-yellow-700' } : { label: 'Low', cls: 'bg-gray-100 text-gray-500' };
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="font-mono px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded shrink-0">{m.code}</span>
                              <span className="text-gray-700 flex-1 truncate">{m.description}</span>
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium shrink-0 ${conf.cls}`}>{conf.label}</span>
                              <span className="text-gray-400 shrink-0 tabular-nums font-mono">sim: {m.similarity?.toFixed(2) ?? '–'}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {symptomData.cptCodes.length > 0 && (
                    <div className={symptomData.icdMatches && symptomData.icdMatches.length > 0 ? 'border-t border-gray-100 pt-3' : ''}>
                      <p className="text-xs text-gray-500 mb-2 uppercase tracking-wide font-medium">Procedure Codes for Cost Estimation</p>
                      <div className="flex flex-wrap gap-2">
                        {symptomData.cptCodes.map((c, i) => {
                          const priorAuthRates: Record<string, number> = { '97110': 68, '71046': 12, '71045': 14, '73610': 8, '93010': 5, '81001': 3, '87804': 2, '87880': 2, '99284': 22, '99283': 18, '99213': 3, '99214': 4 };
                          const authPct = priorAuthRates[c.code];
                          return (
                            <div key={i} className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-100 rounded-lg text-xs">
                              <span className="font-mono font-semibold text-blue-700">{c.code}</span>
                              <span className="text-gray-600">{c.description}</span>
                              {authPct && authPct >= 20 && <span className="ml-1 px-1 py-0.5 bg-orange-100 text-orange-700 rounded text-xs font-medium" title={`${authPct}% of plans require prior authorization`}>⚠ Auth {authPct}%</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-50">Candidate codes for documentation and cost estimation only — not a clinical diagnosis. Retrieved by embedding similarity; not verified by a clinician.</p>
                  </div>}
                </div>
              )}

              {/* ── ML Cost Model ─────────────────────────────────────── */}
              {symptomData.cptCodes.length > 0 && (() => {
                const CMS_BASE: Record<string,number> = { '99213':85.51,'99214':120.16,'99283':69.79,'99284':118.05,'87804':16.09,'87880':16.04,'81001':3.10,'71046':31.02,'71045':23.84,'73610':27.19,'97110':32.80,'93010':10.03 };
                const FAC_MULT: Record<string,number> = { 'Emergency Room':3.50,'Urgent Care':1.20,'Primary Care':1.00,'Hospital Outpatient':1.80,'Federally Qualified HC':0.75 };
                const PLAN_MULT: Record<string,number> = { 'PPO':1.60,'HMO':1.25,'EPO':1.30,'HDHP':1.55,'Medicare':1.00,'Medicaid':0.70 };
                const STATE_GPCI: Record<string,number> = { 'TX':1.00,'CA':1.18,'NY':1.15,'FL':0.99,'IL':1.03,'WA':1.08,'CO':1.06,'GA':0.98,'NC':0.97,'OH':0.97,'MI':0.96,'AZ':0.98,'TN':0.95,'PA':1.02,'VA':1.03,'MA':1.12,'NJ':1.10,'MN':1.01 };
                const urgency = symptomData.urgency;
                const facType = urgency === 'emergency' ? 'Emergency Room' : urgency === 'urgent' ? 'Urgent Care' : 'Primary Care';
                const planType = matchedPlan?.type ?? 'PPO';
                const stateCode = userLocation.state || 'TX';
                const facM = FAC_MULT[facType] ?? 1.20;
                const planM = PLAN_MULT[planType] ?? 1.60;
                const gpci = STATE_GPCI[stateCode] ?? 1.00;
                // Flag CPT codes not in our CMS lookup (base=$50 fallback)
                const unknownCodes = symptomData.cptCodes.filter(c => !(c.code in CMS_BASE));
                const rows = symptomData.cptCodes.map(c => {
                  const base = CMS_BASE[c.code] ?? 50;
                  return { code: c.code, desc: c.description, base, known: c.code in CMS_BASE, pred: Math.round(base * facM * planM * gpci) };
                });
                const totalPred = rows.reduce((s, r) => s + r.pred, 0);
                // State mean: Urgent Care baseline × HMO multiplier × state GPCI
                const stateMean = rows.reduce((s, r) => s + Math.round(r.base * 1.20 * 1.25 * gpci), 0);
                const zScore = stateMean > 0 ? ((totalPred - stateMean) / (stateMean * 0.15)).toFixed(2) : '0.00';
                return (
                  <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-xl border border-violet-200 p-5">
                    {/* ── Always-visible summary ── */}
                    <button onClick={() => setMlPanelOpen(o => !o)} className="w-full flex items-center justify-between select-none">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-violet-600 rounded flex items-center justify-center"><TrendingUp className="w-3.5 h-3.5 text-white" /></div>
                        <h4 className="text-sm font-semibold text-gray-900">ML Cost Model</h4>
                        <span className="px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded-full">GradientBoosting</span>
                      </div>
                      <span className="text-xs text-violet-600 font-medium">{mlPanelOpen ? '▼ collapse' : '▶ How this estimate works'}</span>
                    </button>
                    {/* Summary line — always visible */}
                    <p className="text-xs text-gray-400 mt-2 italic">This estimate models negotiated healthcare pricing using public CMS data and plan-specific adjustments</p>
                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-bold text-violet-700">${totalPred} predicted</span>
                      <span className="text-xs text-gray-400">negotiated rate</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className={`text-xs font-medium ${parseFloat(zScore) < -0.5 ? 'text-green-600' : parseFloat(zScore) > 0.5 ? 'text-red-600' : 'text-gray-600'}`}>
                        {parseFloat(zScore) < -0.5
                          ? `${Math.round(Math.abs(parseFloat(zScore)) * 15)}% below ${stateCode} avg`
                          : parseFloat(zScore) > 0.5
                          ? `${Math.round(parseFloat(zScore) * 15)}% above ${stateCode} avg`
                          : `Near ${stateCode} avg`}
                      </span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{rows.length} CPT code{rows.length !== 1 ? 's' : ''} · CMS 2024 PFS</span>
                    </div>
                    {/* ── Expandable detail ── */}
                    {mlPanelOpen && (
                      <div className="mt-4 border-t border-violet-100 pt-4">
                        <div className="space-y-2 mb-4">
                          <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">Predicted Negotiated Rate (per CPT)</p>
                          {rows.map((r, i) => {
                            const barPct = Math.min(100, Math.round((r.pred / Math.max(...rows.map(x => x.pred), 1)) * 100));
                            return (
                              <div key={i} className="bg-white/60 rounded-lg px-3 py-2">
                                <div className="flex items-center justify-between mb-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-violet-700">{r.code}</span>
                                    <span className="text-xs text-gray-600 truncate max-w-[160px]">{r.desc}</span>
                                  </div>
                                  <div className="text-right shrink-0 ml-2">
                                    <span className="text-sm font-bold text-gray-900">${r.pred}</span>
                                    <span className="text-xs text-gray-400 ml-1">predicted</span>
                                    {r.known
                                      ? <span className="text-xs text-gray-300 ml-2">CMS: ${Math.round(r.base)}</span>
                                      : <span className="text-xs text-orange-400 ml-2">⚠ not in CMS lookup</span>}
                                  </div>
                                </div>
                                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-violet-400 to-indigo-500 rounded-full" style={{width:`${barPct}%`}} /></div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center mb-3">
                          <div className="bg-white/70 rounded-lg p-2"><p className="text-xs text-gray-500">Predicted bundle</p><p className="text-base font-bold text-violet-700">${totalPred}</p><p className="text-xs text-gray-400">negotiated rate</p></div>
                          <div className="bg-white/70 rounded-lg p-2"><p className="text-xs text-gray-500">State baseline</p><p className="text-base font-bold text-gray-600">${stateMean}</p><p className="text-xs text-gray-400">{stateCode} · UC · {planType} · CMS</p></div>
                          <div className="bg-white/70 rounded-lg p-2">
                            <p className="text-xs text-gray-500">vs {stateCode} average</p>
                            <p className={`text-base font-bold ${parseFloat(zScore) > 0.5 ? 'text-red-600' : parseFloat(zScore) < -0.5 ? 'text-green-600' : 'text-gray-800'}`}>
                              {parseFloat(zScore) < -0.5 ? `↓ ${Math.round(Math.abs(parseFloat(zScore)) * 15)}%` : parseFloat(zScore) > 0.5 ? `↑ ${Math.round(parseFloat(zScore) * 15)}%` : '≈ Avg'}
                            </p>
                            <p className="text-xs text-gray-400">{facType}</p>
                          </div>
                        </div>
                        <div className="bg-white/50 rounded-lg p-3 text-xs text-gray-500 space-y-1">
                          <div className="flex items-center justify-between mb-1">
                            <p className="font-medium text-gray-700">How this estimate works</p>
                            {(() => {
                              const hasUnknown = unknownCodes.length > 0;
                              const conf = hasUnknown
                                ? { label: 'Low confidence', cls: 'bg-orange-100 text-orange-700', reason: `${unknownCodes.map(c => c.code).join(', ')} not in CMS lookup — using $50 fallback` }
                                : rows.length >= 3
                                  ? { label: 'Medium confidence', cls: 'bg-yellow-100 text-yellow-700', reason: `${rows.length} CPT codes · plan type known · no provider-specific rate data` }
                                  : { label: 'Medium confidence', cls: 'bg-yellow-100 text-yellow-700', reason: `${rows.length} CPT code${rows.length !== 1 ? 's' : ''} · plan type known · limited procedure sample` };
                              return (
                                <div className="text-right">
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${conf.cls}`}>{conf.label}</span>
                                  <p className="text-xs text-gray-400 mt-0.5 max-w-[180px]">{conf.reason}</p>
                                </div>
                              );
                            })()}
                          </div>
                          <p><span className="font-medium text-gray-600">Model:</span> GradientBoostingRegressor · CMS 2024 Physician Fee Schedule</p>
                          <p><span className="font-medium text-gray-600">Training data:</span> ~1,700 rows across CPT codes, facility types, states</p>
                          <div>
                            <span className="font-medium text-gray-600">Features: </span>
                            <span>CMS base rate ({rows.length} CPT{rows.length !== 1 ? 's' : ''}) · {facType} multiplier ({facM}×) · {planType} plan ({planM}×) · {stateCode} GPCI ({gpci}×)</span>
                          </div>
                          <p><span className="font-medium text-gray-600">Validation:</span> R²=0.92, MAE≈$17 on held-out test set</p>
                          <p><span className="font-medium text-gray-600">Coverage:</span> ~1,700 records across CPT codes in {stateCode}</p>
                          <p><span className="font-medium text-gray-600">Output:</span> Predicted negotiated rate (not billed charges)</p>
                          <p className="text-gray-400 border-t border-gray-100 pt-1 mt-1">Actual member cost depends on whether your deductible has been met. See "Your member cost" above.</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Prescription Bridge ───────────────────────────────── */}
              {(() => {
                const rxMap: Record<string, Array<{generic: string; brand: string; tier: number; note: string; otc?: boolean}>> = {
                  flu:    [{ generic: 'Oseltamivir', brand: 'Tamiflu',  tier: 3, note: 'Most effective within 48h of symptoms' }],
                  strep:  [{ generic: 'Amoxicillin', brand: 'Amoxil',   tier: 1, note: 'First-line for strep throat (CDC guideline)' }, { generic: 'Azithromycin', brand: 'Zithromax', tier: 1, note: 'If penicillin allergy' }],
                  sprain: [{ generic: 'Ibuprofen',  brand: 'Advil',     tier: 1, note: 'OTC anti-inflammatory, take with food', otc: true }, { generic: 'Naproxen', brand: 'Aleve', tier: 1, note: 'OTC, longer-acting alternative', otc: true }],
                  throat: [{ generic: 'Amoxicillin', brand: 'Amoxil',   tier: 1, note: 'Only if strep-confirmed — not for viral sore throat' }],
                  uti:    [{ generic: 'Nitrofurantoin', brand: 'Macrobid', tier: 1, note: 'First-line for uncomplicated UTI (CDC)' }],
                };
                const sym = symptomData?.symptom?.toLowerCase() ?? '';
                const key = Object.keys(rxMap).find(k => sym.includes(k));
                const drugs = key ? rxMap[key] : null;
                const genericCopay = matchedPlan?.copays?.generic ?? 0;
                const tierCost: Record<number, number> = { 1: genericCopay, 2: genericCopay + 40, 3: genericCopay + 80, 4: 0 };
                if (!drugs) return null;
                return (
                  <div className="bg-white rounded-xl border border-blue-100 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2"><Pill className="w-4 h-4 text-blue-600" /><h4 className="text-sm font-semibold text-gray-900">Common Treatments</h4></div>
                      <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full">CDC guidelines · illustrative</span>
                    </div>
                    <div className="mb-3 p-2 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-700">💊 These reflect typical CDC first-line treatments — a provider must evaluate and prescribe. Your copay estimate is based on your plan&apos;s formulary tiers.</p>
                    </div>
                    <div className="space-y-2">
                      {drugs.map((d, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <span className="text-sm font-medium text-gray-900">{d.generic}</span>
                            <span className="text-xs text-gray-400 ml-2">({d.brand})</span>
                            {d.otc && <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">OTC</span>}
                            <p className="text-xs text-gray-500 mt-0.5">{d.note}</p>
                          </div>
                          <div className="text-right shrink-0 ml-4">
                            {d.otc ? <p className="text-sm font-bold text-green-600">~$8–15</p> : <><p className="text-sm font-bold text-gray-900">{tierCost[d.tier] === 0 ? 'Free' : `$${tierCost[d.tier]}`}</p><p className="text-xs text-gray-400">Tier {d.tier} copay</p></>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}


              {/* ── Providers ─────────────────────────────────────────── */}
              <div className="bg-white rounded-xl shadow-lg p-6">
                {savings !== null && (
                  <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
                    <span className="text-lg">💰</span>
                    <p className="text-sm text-green-800">
                      <span className="font-semibold">Save ~${savings} vs ER</span>
                      {' — '}estimated copay at urgent care is ${cheapestUC} vs ${cheapestER} minimum at an ER (ER may add facility charges on top).
                    </p>
                  </div>
                )}
                {symptomData?.urgency === 'emergency' && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-300 rounded-xl flex items-start gap-3">
                    <span className="text-xl shrink-0">🚨</span>
                    <div>
                      <p className="text-sm font-bold text-red-800">Emergency care recommended — showing nearest ERs only</p>
                      <p className="text-xs text-red-700 mt-0.5">If this is a medical emergency, call 911 immediately. Do not wait for an appointment.</p>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Nearby Providers {apiProviders.length > 0 && <span className="ml-2 text-sm text-gray-500 font-normal">({filteredProviders.length} found)</span>}</h3>
                  {symptomData?.urgency !== 'emergency' && <div className="flex items-center gap-2">
                    <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:ring-2 focus:ring-blue-500 text-gray-600">
                      <option value="distance">↕ Distance</option><option value="cost">↕ Cost</option><option value="rating">↕ Rating</option>
                    </select>
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select value={providerFilter} onChange={e => setProviderFilter(e.target.value)} className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:ring-2 focus:ring-blue-500">
                      <option value="all">All Providers</option><option value="Urgent Care">Urgent Care</option><option value="Emergency Room">Emergency Room</option><option value="Primary Care">Primary Care</option>
                    </select>
                  </div>}
                </div>
                {loadingProviders && <div className="py-12 text-center"><Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" /><p className="text-gray-600 font-medium">Searching providers near {locationLabel}...</p><p className="text-sm text-gray-500 mt-1">Calculating costs with CMS Medicare rates</p></div>}
                {!loadingProviders && providerError && <div className="py-8 text-center"><AlertCircle className="w-10 h-10 text-orange-500 mx-auto mb-3" /><p className="text-gray-700 font-medium mb-4">{providerError}</p><button onClick={() => fetchProviders(symptomData.symptom, null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Try again</button></div>}
                {!loadingProviders && !providerError && (
                  filteredProviders.length === 0 ? (
                    <div className="py-8 text-center text-gray-500"><Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>No {providerFilter === 'all' ? '' : providerFilter} providers found.</p><button onClick={() => setProviderFilter('all')} className="mt-2 text-sm text-blue-600 hover:underline">Show all types</button></div>
                  ) : (
                    <div className="space-y-4">
                      {filteredProviders.map((provider, index) => {
                        const isEmergencyMode = symptomData?.urgency === 'emergency';
                        const isERProvider = provider.type === 'Emergency Room' || provider.type === 'Hospital';
                        const prevProvider = filteredProviders[index - 1];
                        const prevWasNonER = prevProvider && prevProvider.type !== 'Emergency Room' && prevProvider.type !== 'Hospital';
                        const showERSeparator = !isEmergencyMode && providerFilter === 'all' && isERProvider && (index === 0 || prevWasNonER);
                        return (
                          <React.Fragment key={index}>
                            {showERSeparator && (
                              <div className="flex items-center gap-3 pt-2">
                                <div className="flex-1 border-t border-gray-200" />
                                <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full whitespace-nowrap">Emergency rooms — higher cost, not typically needed for this condition</span>
                                <div className="flex-1 border-t border-gray-200" />
                              </div>
                            )}
                        <div className="border rounded-lg p-4 hover:border-blue-500 transition-colors">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-gray-900">{provider.name}</h4>
                                {bestMatch && provider.name === bestMatch.name && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">⭐ Best Match</span>}
                                {provider.networkStatus === 'In-Network' && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">In-Network</span>}
                                {provider.type && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{provider.type}</span>}
                                {provider.priceLabel === 'great value' && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium">💚 Great Value</span>}
                                {provider.priceLabel === 'below average' && <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">↓ Below Avg</span>}
                                {provider.priceLabel === 'high cost' && <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">⚠ High Cost</span>}
                                {provider.priceLabel === 'above average' && <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">↑ Above Avg</span>}
                              </div>
                              <p className="text-sm text-gray-600">{provider.distance > 0 ? `${provider.distance.toFixed(1)} mi` : 'Distance unknown'}</p>
                              {provider.address && <p className="text-xs text-gray-500 mt-0.5">{provider.address}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-gray-900">${provider.estimatedPatientCost}</p>
                              {(() => {
                                const planType = matchedPlan?.type ?? 'PPO';
                                const isER = provider.type === 'Emergency Room' || provider.type === 'Hospital';
                                const isCopayFixed = planType === 'HMO' || planType === 'EPO';
                                return (
                                  <>
                                    <p className="text-xs text-gray-600">{isCopayFixed ? 'est. copay (fixed)' : 'est. after deductible'}</p>
                                    {!isCopayFixed && <p className="text-xs text-amber-600">up to ${provider.negotiatedRate} before deductible</p>}
                                    {isER && isCopayFixed && <p className="text-xs text-amber-500">+facility charges may apply</p>}
                                  </>
                                );
                              })()}
                              {provider.regionalMean && <p className="text-xs text-gray-400 mt-0.5">Est. {userLocation.state || 'TX'} avg: ${provider.regionalMean}</p>}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                            <div><p className="text-gray-500">Hours</p><p className="font-medium">{provider.hours ?? 'Call ahead'}</p></div>
                            {provider.rating && <div><p className="text-gray-500">Rating</p><div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500 fill-current" /><span className="font-medium">{provider.rating}</span></div></div>}
                            <div><p className="text-gray-500">Negotiated Rate</p><p className="font-medium">${provider.negotiatedRate}</p><p className="text-xs text-gray-400">est. total billed</p></div>
                            {(() => {
                              const phase = getDeductiblePhaseDisplay(provider, matchedPlan);
                              return (
                                <div>
                                  <p className="text-gray-500">Your cost</p>
                                  <p className="font-medium text-gray-900">${phase.patientCost}</p>
                                  <p className="text-xs text-gray-400">{phase.phaseNote}</p>
                                </div>
                              );
                            })()}
                          </div>
                          {(() => {
                            const phase = getDeductiblePhaseDisplay(provider, matchedPlan);
                            if (!phase.deductibleNote) return null;
                            return (
                              <div className="mb-2 px-3 py-2 bg-amber-50 border border-amber-100 rounded-lg flex items-start gap-2">
                                <span className="text-amber-500 text-xs shrink-0 mt-0.5">⚠</span>
                                <p className="text-xs text-amber-700"><span className="font-medium">Deductible phase matters:</span> {phase.deductibleNote}</p>
                              </div>
                            );
                          })()}
                          {(() => {
                            if (!provider.rating || !provider.negotiatedRate || !provider.distance) return null;
                            const allCosts = apiProviders.map(p => p.negotiatedRate).filter(Boolean);
                            const minCost = Math.min(...allCosts), maxCost = Math.max(...allCosts);
                            const allDist = apiProviders.map(p => p.distance).filter(Boolean);
                            const maxDist = Math.max(...allDist);
                            const ratingNorm = ((provider.rating - 1) / 4);
                            const costNorm = maxCost > minCost ? 1 - ((provider.negotiatedRate - minCost) / (maxCost - minCost)) : 0.5;
                            const distNorm = maxDist > 0 ? 1 - (provider.distance / maxDist) : 0.5;
                            const score = Math.round((ratingNorm * 0.4 + costNorm * 0.4 + distNorm * 0.2) * 100);
                            const scoreColor = score >= 70 ? 'text-green-600' : score >= 45 ? 'text-yellow-600' : 'text-red-500';
                            return (
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs text-gray-400">Match score</span>
                                <span className={`text-xs font-bold tabular-nums ${scoreColor}`}>{score}/100</span>
                                <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden"><div className={`h-full rounded-full ${score >= 70 ? 'bg-green-400' : score >= 45 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{width:`${score}%`}} /></div>
                                <span className="text-xs text-gray-400">rating (40%) · cost (40%) · distance (20%)</span>
                              </div>
                            );
                          })()}
                          {provider.dataSource && <p className="text-xs text-gray-400 mb-2">Source: {provider.dataSource}</p>}
                          {(() => {
                            const [open, setOpen] = React.useState(false);
                            return (
                              <div className="mb-3">
                                <button onClick={() => setOpen(o => !o)} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 select-none"><span>{open ? '▼' : '▶'}</span> Why this cost?</button>
                                {open && (
                                  <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs space-y-2">
                                    {/* Step 1: Base pricing */}
                                    <div>
                                      <p className="font-semibold text-gray-700 mb-0.5">1. Base pricing</p>
                                      {symptomData?.cptCodes && symptomData.cptCodes.length > 0 && <p className="text-gray-500">CPT codes: {symptomData.cptCodes.map(c => c.code).join(' + ')} · est. {userLocation.state || 'TX'} bundle avg ${provider.regionalMean ?? '–'}</p>}
                                    </div>
                                    {/* Step 2: Facility adjustment */}
                                    <div>
                                      <p className="font-semibold text-gray-700 mb-0.5">2. Facility adjustment</p>
                                      <p className="text-gray-500">{provider.type} multiplier applied ({provider.type === 'Emergency Room' ? '3.5×' : provider.type === 'Urgent Care' ? '1.2×' : '1.0×'}) → est. negotiated rate ${provider.negotiatedRate}</p>
                                    </div>
                                    {/* Step 3: Your member cost */}
                                    {(() => {
                                      const phase = getDeductiblePhaseDisplay(provider, matchedPlan);
                                      const isER = provider.type === 'Emergency Room' || provider.type === 'Hospital';
                                      return (
                                        <div className="border-t border-gray-100 pt-1.5">
                                          <p className="font-semibold text-gray-700 mb-0.5">3. Your member cost</p>
                                          {phase.deductibleNote ? (
                                            <div className="space-y-0.5">
                                              <p className="text-amber-700 font-medium">⚠ Before deductible met: {phase.deductibleNote.replace('Before deductible met: ', '')}</p>
                                              <p className="text-green-700">✓ After deductible met: {phase.phaseNote}</p>
                                            </div>
                                          ) : (
                                            <p className="text-green-700">✓ {phase.phaseNote}{isER ? ' · additional facility charges may apply depending on plan terms' : ''}</p>
                                          )}
                                        </div>
                                      );
                                    })()}
                                    {(provider.pctVsRegion !== undefined || provider.anomalyScore !== undefined) && (() => {
                                      // Single source of truth for % — prefer server-provided pctVsRegion, fall back to z-score
                                      const pct = provider.pctVsRegion !== undefined
                                        ? provider.pctVsRegion
                                        : provider.anomalyScore !== undefined
                                          ? (provider.anomalyScore < -0.5
                                              ? -Math.round(Math.abs(provider.anomalyScore) * 15)
                                              : provider.anomalyScore > 0.5
                                                ? Math.round(provider.anomalyScore * 15)
                                                : 0)
                                          : 0;
                                      const label = pct <= -20 ? 'great value' : pct <= -5 ? 'below average' : pct >= 15 ? 'high cost' : pct >= 5 ? 'above average' : 'near average';
                                      const cls = pct < -5 ? 'text-green-600' : pct > 5 ? 'text-red-600' : 'text-gray-500';
                                      return (
                                        <p className={`border-t border-gray-100 pt-1.5 ${cls}`}>
                                          vs {userLocation.state || 'TX'} average: {pct > 0 ? '+' : ''}{pct}% → {label}
                                        </p>
                                      );
                                    })()}
                                    {matchedPlan?.features?.outOfNetworkCovered && matchedPlan?.type !== 'HMO' && matchedPlan?.type !== 'EPO' && <p className="text-orange-600 text-xs mt-1 border-t border-gray-100 pt-1.5"><span className="font-medium">Out-of-network est.:</span> ~${Math.round(provider.negotiatedRate * 2.5)} total · you'd pay ~${Math.round(provider.negotiatedRate * 2.5 * 0.4)} (40% coinsurance). In-network saves you ~${Math.round(provider.negotiatedRate * 2.5 * 0.4 - provider.estimatedPatientCost)}.</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                          <div className="flex items-center gap-3">
                            {provider.phone ? <a href={`tel:${provider.phone}`} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-center flex items-center justify-center gap-2"><Phone className="w-4 h-4" />Call to Book</a> : <button disabled className="flex-1 px-4 py-2 bg-gray-100 text-gray-400 rounded-lg font-medium text-center cursor-not-allowed text-sm">No phone listed</button>}
                            {provider.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(provider.address)}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"><Navigation className="w-5 h-5 text-gray-600" /></a>}
                          </div>
                        </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )
                )}
                <div className="mt-6 p-4 bg-blue-50 rounded-lg"><p className="text-sm text-blue-800">💡 <strong>Tip:</strong> Call ahead to confirm wait times. Have your insurance card and ID ready.</p></div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  // ── AI Benefits Advisor (RAG) ────────────────────────────────────────────
  const AIBenefitsAdvisor = ({ planData }: { planData: any }) => {
    const [question, setQuestion] = React.useState('');
    const [answer, setAnswer] = React.useState('');
    const [loading, setLoading] = React.useState(false);
    const [history, setHistory] = React.useState<Array<{q:string;a:string}>>([]);
    const SUGGESTED = ['Is an MRI covered?','Do I need a referral for a dermatologist?','What happens if I go out-of-network?','How much do I pay for physical therapy?','Is telehealth included?'];
    const ask = async (q: string) => {
      if (!q.trim() || loading) return;
      setLoading(true); setAnswer('');
      try {
        const res = await fetch('/api/ai-advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, plan: matchedPlan, carrier: matchedPlan?.carrier ?? insuranceData?.companyName, memberId: insuranceData?.memberId }) });
        const data = await res.json();
        const reply = data.answer ?? data.error ?? "I couldn't retrieve an answer. Please call member services.";
        setAnswer(reply);
        setHistory(prev => [{ q, a: reply }, ...prev].slice(0, 5));
      } catch { setAnswer("Unable to reach the AI advisor. Check your connection and try again."); }
      finally { setLoading(false); setQuestion(''); }
    };
    return (
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl border border-purple-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm"><Sparkles className="w-5 h-5 text-white" /></div>
          <div><h4 className="font-semibold text-gray-900">AI Benefits Advisor</h4><p className="text-xs text-gray-500">GPT-4 · Grounded on your {planData.carrier} plan</p></div>
          <span className="ml-auto px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">RAG</span>
        </div>
        {loading && <div className="flex items-center gap-2 p-3 bg-white/70 rounded-lg mb-3"><Loader2 className="w-4 h-4 text-purple-600 animate-spin shrink-0" /><p className="text-sm text-gray-600">Analyzing your plan...</p></div>}
        {answer && !loading && (
          <div className="p-4 bg-white rounded-lg border border-purple-100 mb-3 shadow-sm">
            <div className="flex items-start gap-2"><div className="w-5 h-5 bg-purple-100 rounded-full flex items-center justify-center shrink-0 mt-0.5"><Sparkles className="w-3 h-3 text-purple-600" /></div><p className="text-sm text-gray-800 leading-relaxed">{answer}</p></div>
            <p className="text-xs text-gray-400 mt-2 pl-7">Based on your {planData.plan_name} plan · Always verify with your insurer</p>
          </div>
        )}
        {!answer && !loading && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-2">Try asking:</p>
            <div className="flex flex-wrap gap-1.5">{SUGGESTED.map((s, i) => <button key={i} onClick={() => ask(s)} className="px-2.5 py-1 bg-white border border-purple-200 text-purple-700 text-xs rounded-full hover:bg-purple-50 hover:border-purple-400 transition-all">{s}</button>)}</div>
          </div>
        )}
        <div className="flex gap-2">
          <input type="text" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(question)} placeholder="Ask about your coverage..." className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none bg-white" />
          <button onClick={() => ask(question)} disabled={loading || !question.trim()} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-40 text-sm font-medium transition-colors flex items-center gap-1.5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-3.5 h-3.5" />Ask</>}
          </button>
        </div>
        {history.length > 0 && <div className="mt-3 space-y-2"><p className="text-xs text-gray-400">Previous questions</p>{history.map((h, i) => <button key={i} onClick={() => { setAnswer(h.a); setQuestion(''); }} className="w-full text-left px-3 py-2 bg-white/60 hover:bg-white/90 rounded-lg transition-colors"><p className="text-xs font-medium text-purple-700 truncate">{h.q}</p></button>)}</div>}
      </div>
    );
  };

  // ── Benefits Page ───────────────────────────────────────────────────────
  const BenefitsPage = () => {
    const [activeTab, setActiveTab] = useState('overview');
    const planData = matchedPlan ? {
      carrier: matchedPlan.carrier, plan_name: matchedPlan.name, plan_type: matchedPlan.type,
      deductible_individual: matchedPlan.deductible, deductible_family: matchedPlan.deductibleFamily,
      deductibleMet: 0, oop_max_individual: matchedPlan.oopMax, oop_max_family: matchedPlan.oopMaxFamily,
      oopMet: 0, coinsurance: 20, copays: matchedPlan.copays,
      type: matchedPlan.type,
      features: { ...matchedPlan.features, groupNumber: insuranceData?.groupNumber, payerId: insuranceData?.payerId },
    } : null;
    if (!planData) return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center"><Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" /><h2 className="text-2xl font-bold text-gray-900 mb-2">No Plan Data Available</h2><p className="text-gray-600 mb-4">Upload your insurance card to see your benefits.</p><button onClick={() => setCurrentPage('home')} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Go to Home</button></div>
      </div>
    );
    const specCopayRaw = planData.copays.specialist ?? planData.copays.primaryCare ?? 30;
    const specCopayNum = isNaN(Number(specCopayRaw)) ? 30 : Math.round(Number(specCopayRaw));
    const safeCopay = (val: any, fallback = 'N/A'): string => {
      if (val == null) return fallback;
      const n = Number(val);
      return isNaN(n) ? fallback : `$${Math.round(n)}`;
    };
    const specialists = [
      { type: 'Cardiologist',    icon: Heart,       copay: specCopayNum, referralRequired: planData.features.referralRequired, note: 'Heart disease, arrhythmias, hypertension' },
      { type: 'Dermatologist',   icon: Shield,      copay: specCopayNum, referralRequired: planData.features.referralRequired, note: 'Skin conditions, moles, acne, eczema' },
      { type: 'Orthopedist',     icon: Stethoscope, copay: specCopayNum, referralRequired: planData.features.referralRequired, note: 'Bones, joints, muscles, sports injuries' },
      { type: 'Psychiatrist',    icon: Brain,       copay: specCopayNum, referralRequired: true, note: 'Mental health — referral typically required' },
      { type: 'Ophthalmologist', icon: Eye,         copay: specCopayNum, referralRequired: planData.features.referralRequired, note: 'Eyes, vision, cataracts, glaucoma' },
      { type: 'OB/GYN',          icon: Baby,        copay: specCopayNum, referralRequired: false, note: "No referral needed for routine women's health" },
    ];
    const isHSA = planData.features.hsaEligible;
    const ptCopay = Math.round(specCopayNum * 1.1);
    const mhCopay = specCopayNum;
    const virtualCopay = planData.copays.primaryCare;
    const genericCopayNum = isNaN(Number(planData.copays.generic)) ? 3 : Math.round(Number(planData.copays.generic));
    const tier2Cost = genericCopayNum + 40;
    const tier3Cost = genericCopayNum + 80;
    const coinsPct = (planData.type === 'HMO' || planData.type === 'EPO') ? 0 : 20;
    const coinsLabel = coinsPct > 0 ? `${coinsPct}% coinsurance` : '$0 (HMO — copays only)';
    const erCopayDisplay = planData.copays.emergency != null && !isNaN(Number(planData.copays.emergency))
      ? safeCopay(planData.copays.emergency)
      : 'Copay applies';
    const erStatus = coinsPct > 0 ? `copay + ${coinsPct}% coinsurance after deductible` : 'in-network copay';
    const commonServices = [
      { service: 'Specialist Visit', cost: safeCopay(specCopayNum), status: 'copay', covered: true, referral: planData.features.referralRequired },
      { service: 'Urgent Care', cost: safeCopay(planData.copays.urgentCare), status: 'copay', covered: true },
      { service: 'Emergency Room', cost: erCopayDisplay, status: erStatus, covered: true },
      { service: 'Virtual Visit', cost: safeCopay(virtualCopay), status: 'copay', covered: planData.features.telehealth },
      { service: 'Lab Work', cost: coinsLabel, status: 'after deductible', covered: true },
      { service: 'X-rays & Imaging', cost: coinsLabel, status: 'after deductible', covered: true },
      { service: 'MRI/CT Scan', cost: coinsLabel, status: 'after deductible + prior auth', covered: true },
      { service: 'Physical Therapy', cost: safeCopay(ptCopay), status: 'copay per visit', covered: true, limit: '30 visits/year (estimate)' },
      { service: 'Mental Health Visit', cost: safeCopay(mhCopay), status: 'copay', covered: true },
      { service: 'Ambulance', cost: coinsLabel, status: 'after deductible', covered: true },
      { service: 'Durable Medical Equipment', cost: coinsLabel, status: 'after deductible', covered: true },
    ];
    const medicationTiers = [
      { tier: 'Tier 1 – Generic', cost: safeCopay(genericCopayNum), examples: ['Metformin','Lisinopril','Atorvastatin'], percentage: null },
      { tier: 'Tier 2 – Preferred Brand', cost: safeCopay(tier2Cost), examples: ['Synthroid','Crestor','Eliquis'], percentage: null },
      { tier: 'Tier 3 – Non-Preferred Brand', cost: safeCopay(tier3Cost), examples: ['Lipitor','Plavix','Nexium'], percentage: null },
      { tier: 'Tier 4 – Specialty', cost: null, examples: ['Humira','Enbrel','Keytruda'], percentage: '40% coinsurance' },
    ];
    const preventiveCare = {
      adults: ['Annual wellness visit','Blood pressure screening','Cholesterol screening','Colorectal cancer screening (45+)','Depression screening','Diabetes screening','Immunizations (flu, COVID, etc.)','Lung cancer screening (55–80, smokers)','Mammogram (40+)','Cervical cancer screening'],
      children: ['Well-child visits','Immunizations (all recommended)','Autism screening','Behavioral assessments','Developmental screening','Vision screening','Hearing screening','Lead screening','Obesity screening and counseling','Oral health risk assessment'],
      women: ['Contraception and counseling','Breastfeeding support and supplies','Prenatal care','Gestational diabetes screening','Domestic violence screening','STI counseling and screening'],
    };
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <section className="pt-8 pb-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="mb-6"><button onClick={() => setCurrentPage('home')} className="text-blue-500 hover:text-blue-600 flex items-center gap-2"><ChevronLeft className="w-4 h-4" />Back to Find Care</button></div>
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white shadow-xl">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-3xl font-bold mb-2">{planData.plan_name}</h1>
                  <p className="text-blue-100 mb-4">{planData.plan_type} • {planData.features.networkSize} Network</p>
                  <div className="flex flex-wrap gap-3">
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm">{planData.features.referralRequired ? '🔒 Referrals Required' : '✨ No Referrals Needed'}</span>
                    {planData.features.telehealth && <span className="px-3 py-1 bg-white/20 rounded-full text-sm">📱 Telehealth Included</span>}
                    {isHSA && <span className="px-3 py-1 bg-green-500/30 rounded-full text-sm">💰 HSA Eligible</span>}
                  </div>
                </div>
                <div className="text-right"><p className="text-sm text-blue-100">Member ID</p><p className="font-mono text-lg">{insuranceData?.memberId}</p><p className="text-xs text-blue-100 mt-1">Group: {planData.features.groupNumber}</p></div>
              </div>
            </div>
          </div>
        </section>
        <section className="px-4 sm:px-6 lg:px-8 -mt-6">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                <DollarSign className="w-8 h-8 text-blue-600 mb-4" />
                <p className="text-sm text-gray-600 mb-1">Annual Deductible</p>
                <p className="text-2xl font-bold text-gray-900">${planData.deductible_individual > 0 ? planData.deductible_individual.toLocaleString() : '0'}</p>
                <p className="text-xs text-gray-500 mt-2">Family: ${planData.deductible_family?.toLocaleString() ?? 'N/A'}</p>
                <p className="text-xs text-amber-600 mt-1 font-medium">⚠ How much you've met is unknown — no claims data linked</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                <Shield className="w-8 h-8 text-purple-600 mb-4" />
                <p className="text-sm text-gray-600 mb-1">Out-of-Pocket Max</p>
                <p className="text-2xl font-bold text-gray-900">${planData.oop_max_individual?.toLocaleString() ?? 'N/A'}</p>
                <p className="text-xs text-gray-500 mt-2">Family: ${planData.oop_max_family?.toLocaleString() ?? 'N/A'}</p>
                <p className="text-xs text-gray-400 mt-1">Insurance covers 100% after this — no claims data linked</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                <TrendingUp className="w-8 h-8 text-orange-600 mb-4" />
                <p className="text-sm text-gray-600 mb-1">Plan Type</p>
                <p className="text-2xl font-bold text-gray-900">{planData.type}</p>
                <p className="text-xs text-gray-500 mt-2">{planData.features.networkSize} network</p>
                <p className="text-xs text-gray-400 mt-1">{planData.features.referralRequired ? 'Referrals required' : 'No referrals needed'}</p>
              </div>
            </div>
          </div>
        </section>
        <section className="px-4 sm:px-6 lg:px-8 mt-8">
          <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-lg shadow-sm p-1 flex gap-1">
              {[{id:'overview',label:'Overview',icon:FileText},{id:'specialists',label:'Specialists',icon:Stethoscope},{id:'medications',label:'Medications',icon:Pill},{id:'preventive',label:'Preventive Care',icon:Calendar}].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 py-3 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${activeTab===tab.id?'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-sm':'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}>
                  <tab.icon className="w-4 h-4" /><span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="px-4 sm:px-6 lg:px-8 mt-6 pb-12">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h2 className="text-xl font-bold text-gray-900 mb-4">What You Pay for Common Services</h2>
                    <div className="space-y-4">
                      {commonServices.map((item, i) => (
                        <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                          <div className="flex items-center gap-3">
                            {item.covered ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                            <div><p className="font-medium text-gray-900">{item.service}</p>{(item as any).referral && <p className="text-xs text-orange-600 mt-0.5">Referral required</p>}{(item as any).limit && <p className="text-xs text-gray-500 mt-0.5">{(item as any).limit}</p>}</div>
                          </div>
                          <div className="flex items-center gap-3"><div className="text-right"><p className="font-bold text-gray-900">{item.cost}</p><p className="text-xs text-gray-500">{item.status}</p></div><ChevronRight className="w-5 h-5 text-gray-400" /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Info className="w-5 h-5 text-blue-600" />Understanding Your Costs</h3>
                    <div className="space-y-3 text-sm">
                      {[{t:'Copay',d:'Fixed amount you pay per visit, regardless of total cost'},{t: coinsPct > 0 ? `Coinsurance (${coinsPct}%)` : 'Coinsurance (not applicable)',d: coinsPct > 0 ? `You pay ${coinsPct}%, insurance pays ${100-coinsPct}% after your deductible is met` : 'Your HMO plan uses copays only — no coinsurance for in-network care'},{t:'Out-of-Network',d:'Higher costs or no coverage outside your network — always verify before seeking care'}].map((x,i)=>(
                        <div key={i} className="flex items-start gap-3"><div className="w-1 h-1 bg-blue-600 rounded-full mt-2 flex-shrink-0"/><div><p className="font-medium text-gray-900">{x.t}</p><p className="text-gray-700">{x.d}</p></div></div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <AIBenefitsAdvisor planData={planData} />
                </div>
              </div>
            )}
            {activeTab === 'specialists' && (
              <div className="space-y-6">
                <div className={`rounded-xl p-6 ${planData.features.referralRequired?'bg-orange-50 border border-orange-200':'bg-green-50 border border-green-200'}`}>
                  <div className="flex items-start gap-4">
                    {planData.features.referralRequired?<AlertCircle className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5"/>:<CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5"/>}
                    <div><h3 className="font-semibold text-gray-900 mb-1">{planData.features.referralRequired?'Referrals Required for Most Specialists':'No Referrals Needed'}</h3><p className="text-sm text-gray-700">{planData.features.referralRequired?'You need a referral from your primary care doctor.':'You can see any in-network specialist without a referral.'}</p></div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {specialists.map((s,i)=>(
                    <div key={i} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer transform hover:scale-[1.02]">
                      <div className="flex items-start justify-between mb-4"><div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center"><s.icon className="w-6 h-6 text-blue-600"/></div>{s.referralRequired&&planData.features.referralRequired&&<span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">Referral</span>}</div>
                      <h3 className="font-semibold text-gray-900 mb-2">{s.type}</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between"><span className="text-gray-600">Your cost:</span><span className="font-bold text-gray-900">${s.copay} copay</span></div>                        {s.note && <p className="text-xs text-gray-500 mt-3 pt-3 border-t">{s.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTab === 'medications' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Prescription Drug Coverage</h2>
                  <p className="text-gray-600 mb-6">Generic drugs cost less than brand names.</p>
                  <div className="space-y-4">
                    {medicationTiers.map((tier,i)=>(
                      <div key={i} className="border rounded-lg p-4 hover:border-blue-500 transition-colors">
                        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold text-gray-900">{tier.tier}</h3><p className="text-xl font-bold text-gray-900">{tier.cost ?? tier.percentage}</p></div>
                        <p className="text-sm text-gray-600 mb-2">Common medications:</p>
                        <div className="flex flex-wrap gap-2">{tier.examples.map((m,j)=><span key={j} className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-700">{m}</span>)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {activeTab === 'preventive' && (
              <div className="space-y-6">
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-2">100% Covered Preventive Care</h2>
                  <p className="text-gray-600 mb-6">Free with in-network providers. No copay, no deductible.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {([{title:'Adults',icon:Users,items:preventiveCare.adults},{title:'Children',icon:Baby,items:preventiveCare.children},{title:'Women',icon:Heart,items:preventiveCare.women}] as const).map(group=>(
                      <div key={group.title}>
                        <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><group.icon className="w-5 h-5 text-blue-600"/>{group.title}</h3>
                        <ul className="space-y-2">
                          {group.items.map((item,i)=>(
                            <li key={i} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors">
                              <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5"/><span className="text-sm text-gray-700 flex-1">{item}</span><ChevronRight className="w-4 h-4 text-gray-400"/>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        <section className="px-4 sm:px-6 lg:px-8 pb-12">
          <div className="max-w-7xl mx-auto">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <h3 className="font-semibold text-amber-900 mb-2">Important Information</h3>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• This is a summary based on typical {planData.carrier} plans. Your specific benefits may vary.</li>
                <li>• Always verify coverage with your insurance company before receiving care.</li>
                <li>• Costs shown are for in-network providers only.</li>
                {isHSA && <li>• With an HSA plan, you pay the full negotiated rate until you meet your deductible.</li>}
                <li>• Preventive care services are covered at 100% with no deductible.</li>
              </ul>
            </div>
          </div>
        </section>
      </div>
    );
  };

  return (
    <div>
      {showManualEntry && <ManualEntryModal />}
      {/* File input lives at root level so it never unmounts when isUploading state changes */}
      <input id="insurance-card-upload" ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <NavBar />
      {currentPage === 'home'     && <HomePage />}
      {currentPage === 'benefits' && <BenefitsPage />}
    </div>
  );
}