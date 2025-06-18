'use client';

import { useState, useEffect } from 'react';

interface Provider {
  name: string;
  type: string;
  address: string;
  negotiatedRate: number;
  estimatedPatientCost: number;
  insurancePays: number;
  costNote: string;
  distance: number;
  waitTime: string;
  dataSource?: string;
  usingRealPricing?: boolean;
  npi?: string;
  phone?: string;
}

interface Props {
  insuranceCompany?: string;
  matchedPlan?: any;
  symptom?: string;
  symptomAnalysis?: any;
  userLocation?: {
    city: string;
    state: string;
    zip?: string;
  };
}

export default function ProviderSearch({ 
  insuranceCompany, 
  matchedPlan, 
  symptom = 'office visit',
  symptomAnalysis,
  userLocation = { city: 'Houston', state: 'TX' }
}: Props) {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [usingRealData, setUsingRealData] = useState(false);
  const [usingNPIData, setUsingNPIData] = useState(false);

  useEffect(() => {
    if (symptom) {
      fetchProviders();
    }
  }, [selectedType, matchedPlan, symptom, symptomAnalysis]);

  async function fetchProviders() {
    if (!symptom) return;
    
    setLoading(true);
    
    try {
      // Use GPT-4 analysis if available, otherwise fall back to basic mapping
      let cptCodes: string[] = [];
      let urgency = 'routine';
      
      if (symptomAnalysis?.cptCodes) {
        // Use GPT-4 provided CPT codes
        cptCodes = symptomAnalysis.cptCodes.map((cpt: any) => cpt.code);
        urgency = symptomAnalysis.urgency;
        console.log('🧠 Using GPT-4 analysis:', { cptCodes, urgency });
      } else {
        // Fallback to basic mapping
        if (symptom?.toLowerCase().includes('flu')) {
          cptCodes = ['99213', '87804'];
        } else if (symptom?.toLowerCase().includes('throat')) {
          cptCodes = ['99213', '87880'];
        } else if (symptom?.toLowerCase().includes('chest')) {
          cptCodes = ['99284', '71045'];
        } else {
          cptCodes = ['99213'];
        }
        console.log('🔄 Using fallback CPT mapping:', cptCodes);
      }
      
      // First, try to fetch real providers from NPI Registry
      console.log(`🔍 Fetching real providers from NPI Registry in ${userLocation.city}, ${userLocation.state}...`);
      const npiUrl = new URL('/api/providers-npi', window.location.origin);
      npiUrl.searchParams.set('city', userLocation.city);
      npiUrl.searchParams.set('state', userLocation.state);
      npiUrl.searchParams.set('type', selectedType === 'er' ? 'emergency' : selectedType);
      if (userLocation.zip) {
        npiUrl.searchParams.set('zip', userLocation.zip);
      }
      
      const npiResponse = await fetch(npiUrl.toString());
      const npiData = await npiResponse.json();
      
      if (npiData.success && npiData.providers.length > 0) {
        console.log(`✅ Found ${npiData.providers.length} real providers from NPI`);
        setUsingNPIData(true);
        
        // Enrich NPI providers with cost data
        const enrichResponse = await fetch('/api/providers-npi', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            providers: npiData.providers,
            planId: matchedPlan?.id || 'unknown',
            cptCodes
          })
        });
        
        const enrichedData = await enrichResponse.json();
        
        if (enrichedData.success) {
          let filtered = enrichedData.providers;
          
          // Auto-filter by care setting based on GPT-4 urgency
          if (symptomAnalysis?.urgency === 'emergency') {
            setSelectedType('er');
            filtered = filtered.filter((p: Provider) => p.type === 'Emergency Room');
          } else if (symptomAnalysis?.urgency === 'urgent') {
            setSelectedType('urgent_care');
            filtered = filtered.filter((p: Provider) => p.type === 'Urgent Care');
          } else if (selectedType !== 'all') {
            // Only apply manual filter if no auto-filter from urgency
            if (selectedType === 'urgent_care') filtered = filtered.filter((p: Provider) => p.type === 'Urgent Care');
            if (selectedType === 'er') filtered = filtered.filter((p: Provider) => p.type === 'Emergency Room');
          }
          
          setProviders(filtered);
          setStats(enrichedData.stats);
          setUsingRealData(enrichedData.providers.some((p: any) => p.usingRealPricing));
          return;
        }
      }
      
      // Fallback to original provider-costs-local API if NPI fails
      console.log('⚠️ Falling back to local provider data...');
      setUsingNPIData(false);
      
      const response = await fetch('/api/provider-costs-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: matchedPlan?.id || 'unknown',
          symptom,
          cptCodes,
          urgency
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        let filtered = data.providers;
        
        // Auto-filter by care setting based on GPT-4 urgency
        if (symptomAnalysis?.urgency === 'emergency') {
          setSelectedType('er');
          filtered = filtered.filter((p: Provider) => p.type === 'Emergency Room');
        } else if (symptomAnalysis?.urgency === 'urgent') {
          setSelectedType('urgent_care');
          filtered = filtered.filter((p: Provider) => p.type === 'Urgent Care');
        } else if (selectedType !== 'all') {
          // Only apply manual filter if no auto-filter from urgency
          if (selectedType === 'urgent_care') filtered = filtered.filter((p: Provider) => p.type === 'Urgent Care');
          if (selectedType === 'er') filtered = filtered.filter((p: Provider) => p.type === 'Emergency Room');
        }
        
        setProviders(filtered);
        setStats(data.stats);
        setUsingRealData(data.usingRealMRFData || false);
      }
    } catch (error) {
      console.error('Failed to fetch providers:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Find Care Near You</h2>
      
      {usingRealData && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-800 flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span>Prices based on actual BCBS negotiated rates from MRF data</span>
          </p>
        </div>
      )}
      
      {usingNPIData && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800 flex items-center gap-2">
            <span className="text-lg">🏥</span>
            <span>Showing real healthcare providers from NPI registry</span>
          </p>
        </div>
      )}
      
      {matchedPlan?.id?.includes('hsa') && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>HSA Plan Note:</strong> You'll pay the full negotiated rate for services 
            until you meet your ${matchedPlan.deductible?.toLocaleString() || '2,800'} deductible.
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSelectedType('all')}
          className={`px-4 py-2 rounded transition-colors ${
            selectedType === 'all' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          All Providers
        </button>
        <button
          onClick={() => setSelectedType('urgent_care')}
          className={`px-4 py-2 rounded transition-colors ${
            selectedType === 'urgent_care' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          Urgent Care
        </button>
        <button
          onClick={() => setSelectedType('er')}
          className={`px-4 py-2 rounded transition-colors ${
            selectedType === 'er' 
              ? 'bg-blue-500 text-white' 
              : 'bg-gray-200 hover:bg-gray-300'
          }`}
        >
          Emergency Room
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Finding providers...</p>
        </div>
      ) : (
        <div className="space-y-4">
          {stats && (
            <div className="bg-blue-50 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-900">
                Found {stats.count} providers • 
                Costs range from <strong>${stats.min}</strong> to <strong>${stats.max}</strong> 
                {insuranceCompany && ` with ${insuranceCompany}`}
                {stats.dataSource && (
                  <span className="text-xs ml-2 text-blue-700">
                    ({stats.dataSource})
                  </span>
                )}
              </p>
            </div>
          )}
          
          {providers.map((provider: any, idx) => (
            <div key={idx} className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-semibold">{provider.name}</h3>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      provider.type === 'Emergency Room' 
                        ? 'bg-red-100 text-red-700'
                        : provider.type === 'Urgent Care'
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {provider.type}
                    </span>
                    {provider.priceLevel === 'low' && (
                      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">
                        Lower Cost
                      </span>
                    )}
                    {provider.dataSource && provider.dataSource.includes('MRF') && (
                      <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700">
                        Real MRF Data
                      </span>
                    )}
                    {provider.npi && (
                      <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-700">
                        NPI: {provider.npi}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-600">{provider.address}</p>
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                    <span>📍 {provider.distance} miles</span>
                    <span>⏱️ Wait: {provider.waitTime}</span>
                    {provider.hours && <span>🕐 {provider.hours}</span>}
                  </div>
                  
                  {insuranceCompany && (
                    <p className="text-green-600 text-sm mt-2">
                      ✓ Accepts {insuranceCompany}
                    </p>
                  )}
                  
                  {provider.hasPharmacy && (
                    <p className="text-blue-600 text-sm mt-1">
                      💊 On-site pharmacy
                    </p>
                  )}
                  
                  {provider.specialty && (
                    <p className="text-gray-600 text-sm mt-1">
                      🩺 {provider.specialty}
                    </p>
                  )}
                </div>

                <div className="text-right ml-4">
                  <div className="mb-2">
                    {provider.costRange ? (
                      <>
                        <p className="text-2xl font-bold text-gray-900">
                          ${provider.costRange.min} - ${provider.costRange.max}
                        </p>
                        <p className="text-xs text-gray-500">Estimated range</p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl font-bold text-gray-900">
                          ${provider.estimatedPatientCost}
                        </p>
                        <p className="text-xs text-gray-500">{provider.costNote}</p>
                      </>
                    )}
                  </div>
                  
                  {provider.totalCost && (
                    <div className="text-sm text-gray-600 border-t pt-2">
                      <p>Total bill: ${provider.totalCost}</p>
                      <p className="text-green-600">Insurance pays: ${provider.insurancePays}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Cost breakdown button */}
              {provider.costBreakdown && (
                <div className="mt-3">
                  <button
                    onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    {expandedIdx === idx ? '▼' : '▶'} See cost breakdown
                  </button>
                  
                  {expandedIdx === idx && (
                    <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm">
                      <div className="font-semibold mb-3 text-gray-900">
                        {provider.bundleName}
                        {provider.dataSource && (
                          <span className="ml-2 text-xs font-normal text-gray-600">
                            • Source: {provider.dataSource}
                          </span>
                        )}
                      </div>
                      
                      {provider.costBreakdown.map((category: any, catIdx: number) => (
                        <div key={catIdx} className="mb-3">
                          <div className="font-medium text-gray-700 mb-1">
                            {category.category}
                          </div>
                          {category.items.map((item: any, itemIdx: number) => (
                            <div key={itemIdx} className="flex justify-between py-1 text-gray-600">
                              <span className="flex-1 pr-2">{item.description}</span>
                              <span className="text-gray-500">${item.cost}</span>
                              <span className="font-medium text-gray-900 ml-4 min-w-[60px] text-right">
                                ${item.patientPays}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                      
                      <div className="border-t pt-2 mt-3">
                        <div className="flex justify-between font-semibold">
                          <span>Total Cost:</span>
                          <span>${provider.totalCost}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                          <span>Insurance Pays:</span>
                          <span>-${provider.insurancePays}</span>
                        </div>
                        <div className="flex justify-between font-bold text-lg mt-1">
                          <span>You Pay:</span>
                          <span>${provider.estimatedPatientCost}</span>
                        </div>
                      </div>
                      
                      {provider.dataSource && provider.dataSource.includes('MRF') && (
                        <div className="mt-3 p-2 bg-purple-50 rounded text-xs">
                          <p className="text-purple-800">
                            💡 These prices are based on actual negotiated rates from BCBS MRF files.
                            Actual costs may vary based on your specific plan details.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <a
                  href={`tel:${provider.phone || '1-800-DOCTORS'}`}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 transition-colors"
                >
                  📞 Call Now
                </a>
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(provider.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="border border-blue-500 text-blue-500 px-4 py-2 rounded hover:bg-blue-50 transition-colors"
                >
                  🗺️ Get Directions
                </a>
                {provider.acceptsWalkIns && (
                  <span className="border border-gray-300 text-gray-600 px-4 py-2 rounded">
                    👟 Walk-ins OK
                  </span>
                )}
              </div>
            </div>
          ))}
          
          {providers.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              No providers found. Try changing your filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}