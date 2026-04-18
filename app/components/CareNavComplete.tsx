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
}
interface Provider {
  name: string; type: string; address: string; phone?: string;
  distance: number; driveTime: number; waitTime: string; hours?: string;
  estimatedPatientCost: number; negotiatedRate: number; insurancePays: number;
  networkStatus: string; rating?: number; dataSource?: string;
}

function urgencyInfo(urgency: string, copays: MatchedPlan['copays'] | null) {
  const costs: Record<string,string> = { emergency: copays ? `$${copays.emergency} ER copay` : 'Go to ER immediately', urgent: copays ? `$${copays.urgentCare} urgent care copay` : '$75–150', routine: copays ? `$${copays.primaryCare} PCP copay` : '$30–60', self_care: 'Free – manage at home' };
  const labels: Record<string,string> = { emergency: 'Emergency Care Recommended', urgent: 'Urgent Care Recommended', routine: 'Primary Care Recommended', self_care: 'Self-Care Likely Sufficient' };
  const colors: Record<string,string> = { emergency: 'from-red-50 to-rose-50 border-red-200', urgent: 'from-orange-50 to-amber-50 border-orange-200', routine: 'from-blue-50 to-sky-50 border-blue-200', self_care: 'from-green-50 to-emerald-50 border-green-200' };
  const icons: Record<string,string> = { emergency: '🚨', urgent: '⚠️', routine: 'ℹ️', self_care: '✅' };
  return { cost: costs[urgency] ?? '$75–150', label: labels[urgency] ?? 'Care Recommended', color: colors[urgency] ?? 'from-orange-50 to-amber-50 border-orange-200', icon: icons[urgency] ?? '⚠️' };
}

export default function CareNavComplete() {
  // ── Navigation ──────────────────────────────────────────────────────────
  const [currentPage,     setCurrentPage]     = useState('home');
  const [insuranceData,   setInsuranceData]   = useState<InsuranceData | null>(null);
  const [matchedPlan,     setMatchedPlan]     = useState<MatchedPlan | null>(null);

  // ── Upload ──────────────────────────────────────────────────────────────
  const [isUploading,     setIsUploading]     = useState(false);
  const [uploadError,     setUploadError]     = useState('');
  const [uploadProgress,  setUploadProgress]  = useState('');
  const [showManualEntry, setShowManualEntry] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Home page flow — ALL state here so re-renders don't wipe it ─────────
  const [symptom,          setSymptom]          = useState('');
  const [showProviders,    setShowProviders]    = useState(false);
  const [providerFilter,   setProviderFilter]   = useState('all');
  const [apiProviders,     setApiProviders]     = useState<Provider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerError,    setProviderError]    = useState('');
  const [analyzingSymptom, setAnalyzingSymptom] = useState(false);
  const [symptomError,     setSymptomError]     = useState('');
  const [symptomData,      setSymptomData]      = useState<SymptomData | null>(null);

  const userLocation = { city: 'Houston', state: 'TX', zip: '77001' };

  // ── Fetch providers ─────────────────────────────────────────────────────
  const fetchProviders = useCallback(async (symptomText: string, analysis: any) => {
    setLoadingProviders(true); setProviderError(''); setApiProviders([]);
    let cptCodes: string[] = ['99213'], urgency = 'routine';
    if (analysis?.cptCodes?.length) { cptCodes = analysis.cptCodes.map((c: any) => c.code); urgency = analysis.urgency; }
    else {
      const s = symptomText.toLowerCase();
      if (s.includes('flu')) cptCodes = ['99213','87804'];
      else if (s.includes('throat') || s.includes('strep')) cptCodes = ['99213','87880'];
      else if (s.includes('chest') || s.includes('heart')) { cptCodes = ['99284','71045']; urgency = 'emergency'; }
      else if (s.includes('sprain') || s.includes('ankle')) cptCodes = ['99213','73610'];
    }
    try {
      const res = await fetch('/api/provider-costs-local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ planId: matchedPlan?.id ?? 'unknown', symptom: symptomText, cptCodes, urgency, city: userLocation.city, state: userLocation.state, zip: userLocation.zip, insuranceCompany: insuranceData?.companyName ?? '' }) });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.providers) && data.providers.length > 0) {
        setApiProviders(data.providers.map((p: any): Provider => ({ name: p.name ?? 'Unknown Provider', type: p.type ?? 'Clinic', address: p.address ?? '', phone: p.phone ?? '', distance: typeof p.distance === 'number' ? p.distance : 0, driveTime: p.driveTime ?? 0, waitTime: p.waitTime ?? 'Call ahead', hours: p.hours ?? 'Call for hours', estimatedPatientCost: p.estimatedPatientCost ?? p.copay ?? 75, negotiatedRate: p.negotiatedRate ?? p.totalCost ?? 200, insurancePays: p.insurancePays ?? 0, networkStatus: p.networkStatus ?? 'In-Network', rating: p.rating ?? undefined, dataSource: p.dataSource ?? '' })));
      } else { setProviderError(data.error ?? `No providers found near ${userLocation.city}.`); }
    } catch { setProviderError('Could not load providers. Make sure npm run dev is running.'); }
    finally { setLoadingProviders(false); }
  }, [matchedPlan, insuranceData]);

  // ── Symptom triage ──────────────────────────────────────────────────────
  const handleSymptomSubmit = useCallback(async (symptomText: string) => {
    if (!symptomText.trim()) return;
    setSymptom(symptomText); setAnalyzingSymptom(true); setSymptomError(''); setShowProviders(false); setApiProviders([]);
    try {
      const res = await fetch('/api/symptom-triage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symptom: symptomText }) });
      const data = await res.json();
      if (data.success && data.analysis) {
        const a = data.analysis;
        const rec = urgencyInfo(a.urgency, matchedPlan?.copays ?? null);
        setSymptomData({ symptom: symptomText, urgency: a.urgency, recommendedCare: a.careSettings?.[0] ?? rec.label, estimatedCost: rec.cost, cptCodes: a.cptCodes ?? [], reasoning: a.reasoning, redFlags: a.redFlags });
        setShowProviders(true);
        await fetchProviders(symptomText, a);
      } else {
        setSymptomError('Symptom analysis unavailable – showing nearby providers.');
        setSymptomData({ symptom: symptomText, urgency: 'routine', recommendedCare: 'Urgent Care', estimatedCost: '$75–150', cptCodes: [] });
        setShowProviders(true);
        await fetchProviders(symptomText, null);
      }
    } catch {
      setSymptomError('Analysis failed – showing nearby providers anyway.');
      setSymptomData({ symptom: symptomText, urgency: 'routine', recommendedCare: 'Urgent Care', estimatedCost: '$75–150', cptCodes: [] });
      setShowProviders(true);
      await fetchProviders(symptomText, null);
    } finally { setAnalyzingSymptom(false); }
  }, [matchedPlan, fetchProviders]);

  // ── OCR upload ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true); setUploadError(''); setUploadProgress('Uploading insurance card...');
    const fd = new FormData(); fd.append('file', file);
    try {
      const timer = setTimeout(() => setUploadProgress('Analyzing card details...'), 1800);
      const res = await fetch('/api/ocr', { method: 'POST', body: fd });
      clearTimeout(timer);
      const data = await res.json();
      if (data.error) { setUploadError(data.error); }
      else { setInsuranceData(data.extracted); setMatchedPlan(data.matchedPlan); setUploadProgress('✓ Card processed!'); setTimeout(() => setUploadProgress(''), 2000); }
    } catch { setUploadError('Upload failed. Make sure the dev server is running.'); }
    finally { setIsUploading(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  }, []);

  // ── Manual entry ────────────────────────────────────────────────────────
  const handleManualSubmit = useCallback(async (fields: { companyName: string; memberId: string; groupNumber: string; payerId: string }) => {
    setIsUploading(true); setUploadError(''); setUploadProgress('Looking up your plan...');
    try {
      const res = await fetch('/api/match-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
      const data = await res.json();
      if (data.error) { setUploadError(data.error); }
      else { setInsuranceData({ companyName: fields.companyName, memberId: fields.memberId, groupNumber: fields.groupNumber, payerId: fields.payerId }); setMatchedPlan(data.plan ?? data.matchedPlan); setShowManualEntry(false); }
    } catch { setUploadError('Plan lookup failed. Try again.'); }
    finally { setIsUploading(false); setUploadProgress(''); }
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────
  const filteredProviders = providerFilter === 'all' ? apiProviders : apiProviders.filter(p => {
    if (providerFilter === 'Urgent Care') return p.type === 'Urgent Care' || p.name.toLowerCase().includes('urgent');
    if (providerFilter === 'Emergency Room') return p.type === 'Emergency Room' || p.type === 'Hospital';
    return p.type === 'Primary Care' || p.type === 'Clinic';
  });
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

  // ── Nav ─────────────────────────────────────────────────────────────────
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
              <button className="text-sm font-medium text-gray-600 hover:text-gray-900">Claims</button>
              <button className="text-sm font-medium text-gray-600 hover:text-gray-900">Help</button>
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

  // ── Home Page — no local state, reads from parent ───────────────────────
  const HomePage = () => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <section className="pt-16 pb-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">

          {insuranceData && (
            <div className="mb-8 p-6 bg-white rounded-xl shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 mb-1">Welcome back!</h2>
                  <p className="text-gray-600">You're covered by {insuranceData.companyName} {matchedPlan?.name}</p>
                </div>
                <button onClick={() => setCurrentPage('benefits')} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium">
                  View Full Benefits <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="text-center"><p className="text-2xl font-bold text-gray-900">${matchedPlan ? matchedPlan.deductible : '–'}</p><p className="text-sm text-gray-600">Deductible remaining</p></div>
                <div className="text-center"><p className="text-2xl font-bold text-green-600">${matchedPlan?.copays.primaryCare ?? '–'}</p><p className="text-sm text-gray-600">PCP copay</p></div>
                <div className="text-center"><p className="text-2xl font-bold text-blue-600">${matchedPlan?.copays.urgentCare ?? '–'}</p><p className="text-sm text-gray-600">Urgent care copay</p></div>
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
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <div onClick={() => !isUploading && fileInputRef.current?.click()} className={`border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 group ${isUploading ? 'pointer-events-none' : ''}`}>
                {isUploading
                  ? <><Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" /><p className="text-lg font-medium text-gray-700">{uploadProgress || 'Processing...'}</p><p className="text-sm text-gray-500 mt-2">This will just take a moment</p></>
                  : <><Upload className="w-12 h-12 text-gray-400 mx-auto mb-4 group-hover:text-blue-500 transition-colors" /><p className="text-lg font-medium text-gray-700 mb-2">Drop your insurance card here</p><p className="text-sm text-gray-500">or click to browse · JPG, PNG, HEIC</p></>
                }
              </div>
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
                      <div><p className="text-sm font-medium text-purple-900">Analyzing your symptoms...</p><p className="text-xs text-purple-700 mt-0.5">GPT-4 is reviewing urgency and CPT codes</p></div>
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
            <div className="mt-8 space-y-6">
              <div className={`bg-gradient-to-r ${triage?.color ?? 'from-orange-50 to-amber-50 border-orange-200'} border rounded-xl p-6`}>
                <div className="flex items-start gap-4">
                  <span className="text-2xl">{triage?.icon ?? '⚠️'}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{triage?.label ?? 'Care Recommended'}</h3>
                    <p className="text-sm text-gray-700 mb-1">{symptomData.reasoning ?? `Based on your symptoms, ${symptomData.recommendedCare} is recommended.`}</p>
                    <p className="text-sm font-medium text-gray-900">Estimated cost with your plan: {symptomData.estimatedCost}</p>
                    {symptomData.redFlags && symptomData.redFlags.length > 0 && (
                      <div className="mt-3 p-3 bg-white/60 rounded-lg">
                        <p className="text-xs font-semibold text-red-700 mb-1">🚩 Seek immediate care if you experience:</p>
                        <ul className="text-xs text-gray-700 space-y-0.5">{symptomData.redFlags.map((f, i) => <li key={i}>• {f}</li>)}</ul>
                      </div>
                    )}
                    <button onClick={() => setCurrentPage('benefits')} className="text-sm text-blue-600 hover:text-blue-700 font-medium mt-3 block">Check full coverage details →</button>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Nearby Providers {apiProviders.length > 0 && <span className="ml-2 text-sm text-gray-500 font-normal">({apiProviders.length} found)</span>}
                  </h3>
                  <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select value={providerFilter} onChange={e => setProviderFilter(e.target.value)} className="text-sm border border-gray-300 rounded-md px-3 py-1 focus:ring-2 focus:ring-blue-500">
                      <option value="all">All Providers</option>
                      <option value="Urgent Care">Urgent Care</option>
                      <option value="Emergency Room">Emergency Room</option>
                      <option value="Primary Care">Primary Care</option>
                    </select>
                  </div>
                </div>

                {loadingProviders && (
                  <div className="py-12 text-center">
                    <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
                    <p className="text-gray-600 font-medium">Searching NPI Registry near {userLocation.city}...</p>
                    <p className="text-sm text-gray-500 mt-1">Calculating costs with CMS Medicare rates</p>
                  </div>
                )}

                {!loadingProviders && providerError && (
                  <div className="py-8 text-center">
                    <AlertCircle className="w-10 h-10 text-orange-500 mx-auto mb-3" />
                    <p className="text-gray-700 font-medium mb-4">{providerError}</p>
                    <button onClick={() => fetchProviders(symptomData.symptom, null)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">Try again</button>
                  </div>
                )}

                {!loadingProviders && !providerError && (
                  filteredProviders.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">
                      <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p>No {providerFilter === 'all' ? '' : providerFilter} providers found.</p>
                      <button onClick={() => setProviderFilter('all')} className="mt-2 text-sm text-blue-600 hover:underline">Show all types</button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredProviders.map((provider, index) => (
                        <div key={index} className="border rounded-lg p-4 hover:border-blue-500 transition-colors">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium text-gray-900">{provider.name}</h4>
                                {provider.networkStatus === 'In-Network' && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">In-Network</span>}
                                {provider.type && <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{provider.type}</span>}
                              </div>
                              <p className="text-sm text-gray-600">{provider.distance > 0 ? `${provider.distance.toFixed(1)} mi` : 'Distance unknown'}{provider.waitTime ? ` • ${provider.waitTime}` : ''}</p>
                              {provider.address && <p className="text-xs text-gray-500 mt-0.5">{provider.address}</p>}
                            </div>
                            <div className="text-right">
                              <p className="text-xl font-bold text-gray-900">${provider.estimatedPatientCost}</p>
                              <p className="text-xs text-gray-600">Your est. cost</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                            <div><p className="text-gray-500">Hours</p><p className="font-medium">{provider.hours ?? 'Call ahead'}</p></div>
                            {provider.rating && <div><p className="text-gray-500">Rating</p><div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500 fill-current" /><span className="font-medium">{provider.rating}</span></div></div>}
                            <div><p className="text-gray-500">Total Cost</p><p className="font-medium">${provider.negotiatedRate}</p></div>
                            <div><p className="text-gray-500">Insurance Pays</p><p className="font-medium text-green-600">${provider.insurancePays}</p></div>
                          </div>
                          {provider.dataSource && <p className="text-xs text-gray-400 mb-3">Source: {provider.dataSource}</p>}
                          <div className="flex items-center gap-3">
                            <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">Book Now</button>
                            {provider.phone && <a href={`tel:${provider.phone}`} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"><Phone className="w-5 h-5 text-gray-600" /></a>}
                            {provider.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(provider.address)}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"><Navigation className="w-5 h-5 text-gray-600" /></a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-800">💡 <strong>Tip:</strong> Call ahead to confirm wait times. Have your insurance card and ID ready.</p>
                </div>
              </div>
            </div>
          )}

        </div>
      </section>
    </div>
  );

  // ── Benefits Page ───────────────────────────────────────────────────────
  const BenefitsPage = () => {
    const [activeTab, setActiveTab] = useState('overview');
    const [showBookingModal, setShowBookingModal] = useState(false);
    const [selectedService, setSelectedService] = useState<any>(null);
    const [bookingStep, setBookingStep] = useState('select');

    const planData = matchedPlan ? {
      carrier: matchedPlan.carrier, plan_name: matchedPlan.name, plan_type: matchedPlan.type,
      deductible_individual: matchedPlan.deductible, deductible_family: matchedPlan.deductibleFamily,
      deductibleMet: 0, oop_max_individual: matchedPlan.oopMax, oop_max_family: matchedPlan.oopMaxFamily,
      oopMet: 0, coinsurance: 20, copays: matchedPlan.copays,
      features: { ...matchedPlan.features, groupNumber: insuranceData?.groupNumber, payerId: insuranceData?.payerId },
    } : null;

    if (!planData) return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">No Plan Data Available</h2>
          <p className="text-gray-600 mb-4">Upload your insurance card to see your benefits.</p>
          <button onClick={() => setCurrentPage('home')} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Go to Home</button>
        </div>
      </div>
    );

    const specialists = [
      { type: 'Cardiologist',    icon: Heart,       copay: 60, referralRequired: false, waitTime: '2-3 weeks', inNetworkCount: 145 },
      { type: 'Dermatologist',   icon: Shield,      copay: 60, referralRequired: false, waitTime: '3-4 weeks', inNetworkCount:  89 },
      { type: 'Orthopedist',     icon: Stethoscope, copay: 60, referralRequired: false, waitTime: '1-2 weeks', inNetworkCount: 234 },
      { type: 'Psychiatrist',    icon: Brain,       copay: 80, referralRequired: true,  waitTime: '4-6 weeks', inNetworkCount:  67, note: 'Mental health referral required from PCP' },
      { type: 'Ophthalmologist', icon: Eye,         copay: 60, referralRequired: false, waitTime: '2-3 weeks', inNetworkCount: 112 },
      { type: 'OB/GYN',          icon: Baby,        copay: 40, referralRequired: false, waitTime: '1-2 weeks', inNetworkCount: 198, note: 'No referral needed for routine care' },
    ];
    const nearbyProviders = [
      { name: 'Dr. Sarah Johnson, MD',   practice: 'Houston Medical Associates',    distance: '1.2 mi', nextAvailable: 'Tomorrow 2:30 PM',       rating: 4.8, patientCount: '2,847 patients', acceptingNew: true,  languages: ['English','Spanish'] },
      { name: 'Dr. Michael Chen, MD',    practice: 'Memorial Park Family Practice', distance: '2.4 mi', nextAvailable: 'Thu, Jan 25 • 10:00 AM', rating: 4.9, patientCount: '3,102 patients', acceptingNew: true,  languages: ['English','Mandarin','Cantonese'] },
      { name: 'Dr. Maria Rodriguez, MD', practice: 'Westside Health Center',         distance: '3.1 mi', nextAvailable: 'Mon, Jan 29 • 3:00 PM',  rating: 4.7, patientCount: '1,892 patients', acceptingNew: false, languages: ['English','Spanish','Portuguese'] },
    ];
    const commonServices = [
      { service: 'Primary Care Visit',        cost: `$${planData.copays.primaryCare}`, status: 'copay',                         covered: true },
      { service: 'Specialist Visit',          cost: `$${planData.copays.specialist}`,  status: 'copay',                         covered: true, referral: planData.features.referralRequired },
      { service: 'Urgent Care',               cost: `$${planData.copays.urgentCare}`,  status: 'copay',                         covered: true },
      { service: 'Emergency Room',            cost: `$${planData.copays.emergency}`,   status: 'copay + 20%',                   covered: true },
      { service: 'Virtual Visit',             cost: '$10',                             status: 'copay',                         covered: true },
      { service: 'Lab Work',                  cost: '20%',                             status: 'after deductible',              covered: true },
      { service: 'X-rays & Imaging',          cost: '20%',                             status: 'after deductible',              covered: true },
      { service: 'MRI/CT Scan',               cost: '20%',                             status: 'after deductible + prior auth', covered: true },
      { service: 'Physical Therapy',          cost: '$40',                             status: 'copay per visit',               covered: true, limit: '30 visits/year' },
      { service: 'Mental Health Visit',       cost: '$30',                             status: 'copay',                         covered: true },
      { service: 'Ambulance',                 cost: '20%',                             status: 'after deductible',              covered: true },
      { service: 'Durable Medical Equipment', cost: '20%',                             status: 'after deductible',              covered: true },
    ];
    const medicationTiers = [
      { tier: 'Tier 1 – Generic',             cost: `$${planData.copays.generic}`, examples: ['Metformin','Lisinopril','Atorvastatin'], percentage: null },
      { tier: 'Tier 2 – Preferred Brand',     cost: '$40',                         examples: ['Synthroid','Crestor','Eliquis'],         percentage: null },
      { tier: 'Tier 3 – Non-Preferred Brand', cost: '$80',                         examples: ['Lipitor','Plavix','Nexium'],             percentage: null },
      { tier: 'Tier 4 – Specialty',           cost: null,                          examples: ['Humira','Enbrel','Keytruda'],            percentage: '40%' },
    ];
    const preventiveCare = {
      adults:   ['Annual wellness visit','Blood pressure screening','Cholesterol screening','Colorectal cancer screening (45+)','Depression screening','Diabetes screening','Immunizations (flu, COVID, etc.)','Lung cancer screening (55–80, smokers)','Mammogram (40+)','Cervical cancer screening'],
      children: ['Well-child visits','Immunizations (all recommended)','Autism screening','Behavioral assessments','Developmental screening','Vision screening','Hearing screening','Lead screening','Obesity screening and counseling','Oral health risk assessment'],
      women:    ['Contraception and counseling','Breastfeeding support and supplies','Prenatal care','Gestational diabetes screening','Domestic violence screening','STI counseling and screening'],
    };
    const handleServiceClick    = (s: any) => { setSelectedService(s); setShowBookingModal(true); setBookingStep('select'); };
    const handleSpecialistClick = (s: any) => { setSelectedService({ service: s.type, cost: `$${s.copay}`, status: 'copay', referralRequired: s.referralRequired, waitTime: s.waitTime }); setShowBookingModal(true); setBookingStep('select'); };
    const isHSA = planData.features.hsaEligible;

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
                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm">📱 Telehealth Included</span>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                <div className="flex items-center justify-between mb-4"><DollarSign className="w-8 h-8 text-blue-600" /><span className="text-sm text-gray-500">{planData.deductible_individual > 0 ? Math.round((planData.deductibleMet/planData.deductible_individual)*100) : 0}%</span></div>
                <p className="text-sm text-gray-600 mb-1">Annual Deductible</p><p className="text-2xl font-bold text-gray-900">${planData.deductibleMet} / ${planData.deductible_individual}</p>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full" style={{width:`${(planData.deductibleMet/planData.deductible_individual)*100}%`}} /></div>
                <p className="text-xs text-gray-500 mt-2">Family: ${planData.deductible_family}</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                <div className="flex items-center justify-between mb-4"><Shield className="w-8 h-8 text-purple-600" /><span className="text-sm text-gray-500">{planData.oop_max_individual > 0 ? Math.round((planData.oopMet/planData.oop_max_individual)*100) : 0}%</span></div>
                <p className="text-sm text-gray-600 mb-1">Out-of-Pocket Max</p><p className="text-2xl font-bold text-gray-900">${planData.oopMet} / ${planData.oop_max_individual}</p>
                <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-600 rounded-full" style={{width:`${(planData.oopMet/planData.oop_max_individual)*100}%`}} /></div>
                <p className="text-xs text-gray-500 mt-2">Family: ${planData.oop_max_family}</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                <CreditCard className="w-8 h-8 text-green-600 mb-4" /><p className="text-sm text-gray-600 mb-1">Est. Annual Cost</p><p className="text-2xl font-bold text-green-600">${Math.round((planData.copays.primaryCare||0)*3 + (planData.copays.specialist||0)*1.5 + (planData.copays.urgentCare||0)*0.5).toLocaleString()}</p><p className="text-xs text-gray-500 mt-1">Based on avg. utilization</p>
              </div>
              <div className="bg-white rounded-xl shadow-lg p-6 transform hover:scale-105 transition-all duration-200">
                <TrendingUp className="w-8 h-8 text-orange-600 mb-4" /><p className="text-sm text-gray-600 mb-1">Max Out-of-Pocket</p><p className="text-2xl font-bold text-gray-900">${(planData.oop_max_individual||0).toLocaleString()}</p><p className="text-xs text-gray-500 mt-1">Your annual cost ceiling</p>
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
                        <div key={i} className="flex items-center justify-between py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 -mx-6 px-6 transition-colors" onClick={() => handleServiceClick(item)}>
                          <div className="flex items-center gap-3">
                            {item.covered ? <CheckCircle className="w-5 h-5 text-green-500" /> : <XCircle className="w-5 h-5 text-red-500" />}
                            <div><p className="font-medium text-gray-900">{item.service}</p>{item.referral && <p className="text-xs text-orange-600 mt-0.5">Referral required</p>}{item.limit && <p className="text-xs text-gray-500 mt-0.5">{item.limit}</p>}</div>
                          </div>
                          <div className="flex items-center gap-3"><div className="text-right"><p className="font-bold text-gray-900">{item.cost}</p><p className="text-xs text-gray-500">{item.status}</p></div><ChevronRight className="w-5 h-5 text-gray-400" /></div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Info className="w-5 h-5 text-blue-600" />Understanding Your Costs</h3>
                    <div className="space-y-3 text-sm">
                      {[{t:'Copay',d:'Fixed amount you pay per visit'},{t:`Coinsurance (${planData.coinsurance}%)`,d:`You pay ${planData.coinsurance}%, insurance pays ${100-planData.coinsurance}% after deductible`},{t:'Out-of-Network',d:'Higher costs outside your network'}].map((x,i)=>(
                        <div key={i} className="flex items-start gap-3"><div className="w-1 h-1 bg-blue-600 rounded-full mt-2 flex-shrink-0"/><div><p className="font-medium text-gray-900">{x.t}</p><p className="text-gray-700">{x.d}</p></div></div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="space-y-3">
                      {[{icon:CreditCard,label:'View ID Card'},{icon:Phone,label:'Call Member Services'},{icon:FileText,label:'Download EOB'}].map((a,i)=>(
                        <button key={i} className="w-full p-3 bg-gray-50 hover:bg-gray-100 rounded-lg flex items-center justify-between transition-colors">
                          <span className="flex items-center gap-3"><a.icon className="w-5 h-5 text-gray-600"/><span className="font-medium">{a.label}</span></span><ChevronRight className="w-5 h-5 text-gray-400"/>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="bg-purple-50 rounded-xl p-6 border border-purple-200">
                    <HelpCircle className="w-8 h-8 text-purple-600 mb-3"/>
                    <h4 className="font-semibold text-gray-900 mb-2">Need help understanding your benefits?</h4>
                    <p className="text-sm text-gray-700 mb-3">Our AI assistant can answer questions about your coverage.</p>
                    <button className="text-purple-600 hover:text-purple-700 text-sm font-medium">Ask a question →</button>
                  </div>
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
                    <div key={i} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-all cursor-pointer transform hover:scale-[1.02]" onClick={()=>handleSpecialistClick(s)}>
                      <div className="flex items-start justify-between mb-4"><div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-purple-100 rounded-lg flex items-center justify-center"><s.icon className="w-6 h-6 text-blue-600"/></div>{s.referralRequired&&planData.features.referralRequired&&<span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">Referral</span>}</div>
                      <h3 className="font-semibold text-gray-900 mb-2">{s.type}</h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between"><span className="text-gray-600">Your cost:</span><span className="font-bold text-gray-900">${s.copay}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-600">Wait time:</span><span className="text-gray-900">{s.waitTime}</span></div>
                        <div className="flex items-center justify-between"><span className="text-gray-600">In-network:</span><span className="text-green-600 font-medium">{s.inNetworkCount} providers</span></div>
                      </div>
                      {s.note&&<p className="text-xs text-gray-500 mt-3 pt-3 border-t">{s.note}</p>}
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
                        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold text-gray-900">{tier.tier}</h3><p className="text-xl font-bold text-gray-900">{tier.cost??`${tier.percentage} coinsurance`}</p></div>
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
                            <li key={i} className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 -mx-2 px-2 py-1 rounded transition-colors" onClick={()=>handleServiceClick({service:item,cost:'$0',status:'100% covered',preventive:true})}>
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

        {showBookingModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-6 text-white">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-2xl font-bold">Book {selectedService?.service}</h2><p className="text-blue-100 mt-1">Estimated cost: {selectedService?.cost}{selectedService?.preventive&&' (Free – Preventive Care)'}</p></div>
                  <button onClick={()=>setShowBookingModal(false)} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30"><X className="w-6 h-6"/></button>
                </div>
              </div>
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {bookingStep==='select'&&(
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">How would you like to receive care?</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <button onClick={()=>setBookingStep('providers')} className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left">
                        <div className="flex items-start justify-between mb-3"><Stethoscope className="w-8 h-8 text-blue-600"/><span className="text-2xl font-bold text-gray-900">{selectedService?.cost}</span></div>
                        <h4 className="font-semibold text-gray-900 mb-1">In-Person Visit</h4><p className="text-sm text-gray-600">Visit a provider at their office</p>
                      </button>
                      <div className="p-6 border-2 border-gray-200 rounded-xl text-left">
                        <div className="flex items-start justify-between mb-3"><Phone className="w-8 h-8 text-purple-600"/><span className="text-2xl font-bold text-gray-900">$10</span></div>
                        <h4 className="font-semibold text-gray-900 mb-1">Virtual Visit</h4><p className="text-sm text-gray-600">Video call with a provider</p><p className="text-xs text-gray-500 mt-2">Available 24/7</p>
                      </div>
                    </div>
                  </div>
                )}
                {bookingStep==='providers'&&(
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-4">Choose a Provider</h3>
                    <div className="space-y-4">
                      {nearbyProviders.map((p,i)=>(
                        <div key={i} className="border rounded-xl p-4 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer" onClick={()=>setBookingStep('confirm')}>
                          <div className="flex items-start justify-between mb-3"><div><h4 className="font-semibold text-gray-900">{p.name}</h4><p className="text-sm text-gray-600">{p.practice}</p></div><div className="text-right"><div className="flex items-center gap-1 text-sm"><Star className="w-4 h-4 text-yellow-500"/><span className="font-medium">{p.rating}</span></div><p className="text-xs text-gray-500">{p.patientCount}</p></div></div>
                          <div className="grid grid-cols-2 gap-4 text-sm"><div className="flex items-center gap-2 text-gray-600"><MapPin className="w-4 h-4"/><span>{p.distance}</span></div><div className="flex items-center gap-2 text-gray-600"><Clock className="w-4 h-4"/><span className="text-green-600 font-medium">{p.nextAvailable}</span></div></div>
                          <div className="mt-3 pt-3 border-t flex items-center gap-4 text-xs text-gray-500"><span>Languages: {p.languages.join(', ')}</span>{p.acceptingNew?<span className="text-green-600 font-medium">Accepting new patients</span>:<span className="text-red-600 font-medium">Not accepting new patients</span>}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {bookingStep==='confirm'&&(
                  <div>
                    <div className="text-center mb-6"><div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-green-600"/></div><h3 className="text-xl font-bold text-gray-900 mb-2">Appointment Confirmed!</h3><p className="text-gray-600">We've sent confirmation details to your email</p></div>
                    <div className="bg-gray-50 rounded-xl p-6 mb-6"><h4 className="font-semibold text-gray-900 mb-4">Appointment Details</h4><div className="space-y-3 text-sm">{[['Provider','Dr. Sarah Johnson, MD'],['Date & Time','Tomorrow, 2:30 PM'],['Location','Houston Medical Associates'],['Estimated Cost',selectedService?.cost]].map(([l,v],i)=>(<div key={i} className="flex justify-between"><span className="text-gray-600">{l}</span><span className={`font-medium ${l==='Estimated Cost'?'text-green-600':''}`}>{v}</span></div>))}</div></div>
                    <div className="grid grid-cols-2 gap-4"><button className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">Add to Calendar</button><button onClick={()=>setShowBookingModal(false)} className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Done</button></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <section className="px-4 sm:px-6 lg:px-8 pb-12">
          <div className="max-w-7xl mx-auto">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <h3 className="font-semibold text-amber-900 mb-2">Important Information</h3>
              <ul className="text-sm text-amber-800 space-y-1">
                <li>• This is a summary based on typical {planData.carrier} plans. Your specific benefits may vary.</li>
                <li>• Always verify coverage with your insurance company before receiving care.</li>
                <li>• Costs shown are for in-network providers only.</li>
                {isHSA&&<li>• With an HSA plan, you pay the full negotiated rate until you meet your deductible.</li>}
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
      <NavBar />
      {currentPage === 'home'     && <HomePage />}
      {currentPage === 'benefits' && <BenefitsPage />}
    </div>
  );
}