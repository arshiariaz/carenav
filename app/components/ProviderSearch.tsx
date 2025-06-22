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
  driveTime: number;
  distanceText?: string;
  durationText?: string;
  waitTime: string;
  dataSource?: string;
  usingRealPricing?: boolean;
  npi?: string;
  phone?: string;
  costBreakdown?: any;
  bundleName?: string;
  totalCost?: number;
  priceLevel?: string;
  hasPharmacy?: boolean;
  acceptsWalkIns?: boolean;
  hours?: string;
  specialty?: string;
  medications?: any[];
  networkStatus?: string;
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
  const [allProviders, setAllProviders] = useState<Provider[]>([]); // Store all providers
  const [filteredProviders, setFilteredProviders] = useState<Provider[]>([]); // Store filtered providers
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [error, setError] = useState<string>('');
  const [dataQuality, setDataQuality] = useState<{
    source: string;
    accuracy: string;
    disclaimer: string;
  }>({
    source: 'Estimated',
    accuracy: 'Approximate',
    disclaimer: 'Prices shown are estimates'
  });

  // Effect to filter providers when type changes
  useEffect(() => {
    filterProviders();
  }, [selectedType, allProviders]);

  // Effect to fetch providers when dependencies change
  useEffect(() => {
    if (symptom || matchedPlan) {
      fetchProviders();
    }
  }, [matchedPlan, symptom, symptomAnalysis, userLocation]);

  function filterProviders() {
    if (selectedType === 'all') {
      setFilteredProviders(allProviders);
      return;
    }

    const filtered = allProviders.filter((p: Provider) => {
      if (selectedType === 'urgent_care') {
        return p.type === 'Urgent Care' || 
               p.specialty?.toLowerCase().includes('urgent') ||
               p.name?.toLowerCase().includes('urgent');
      } else if (selectedType === 'er') {
        return p.type === 'Emergency Room' || 
               p.type === 'Hospital' || 
               p.specialty?.toLowerCase().includes('emergency') ||
               p.name?.toLowerCase().includes('emergency');
      } else if (selectedType === 'primary') {
        return p.type === 'Primary Care' || 
               p.type === 'Clinic' ||
               p.specialty?.toLowerCase().includes('primary') ||
               p.specialty?.toLowerCase().includes('family') || 
               p.specialty?.toLowerCase().includes('internal');
      }
      return false;
    });

    setFilteredProviders(filtered);
  }

  async function fetchProviders() {
    console.log('🔍 Starting provider fetch...', { symptom, location: userLocation });
    setLoading(true);
    setError('');
    setAllProviders([]);
    setFilteredProviders([]);
    
    try {
      // Normalize state name to 2-letter code
      const normalizedState = userLocation.state.length === 2 
        ? userLocation.state 
        : userLocation.state === 'Texas' ? 'TX' : userLocation.state.substring(0, 2).toUpperCase();

      // Build CPT codes
      let cptCodes: string[] = [];
      let urgency = 'routine';
      
      if (symptomAnalysis?.cptCodes) {
        cptCodes = symptomAnalysis.cptCodes.map((cpt: any) => cpt.code);
        urgency = symptomAnalysis.urgency;
      } else {
        // Basic symptom to CPT mapping
        const symptomLower = symptom?.toLowerCase() || '';
        if (symptomLower.includes('flu')) {
          cptCodes = ['99213', '87804'];
        } else if (symptomLower.includes('throat') || symptomLower.includes('strep')) {
          cptCodes = ['99213', '87880'];
        } else if (symptomLower.includes('chest') || symptomLower.includes('heart')) {
          cptCodes = ['99284', '71045', '93010'];
          urgency = 'emergency';
        } else if (symptomLower.includes('sprain') || symptomLower.includes('ankle')) {
          cptCodes = ['99213', '73610'];
        } else {
          cptCodes = ['99213']; // Default office visit
        }
      }

      // Call the API
      const response = await fetch('/api/provider-costs-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: matchedPlan?.id || 'unknown',
          symptom: symptom || 'office visit',
          cptCodes,
          urgency,
          city: userLocation.city,
          state: normalizedState, // Use normalized state
          zip: userLocation.zip || '',
          insuranceCompany: insuranceCompany
        })
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data = await response.json();

      console.log('📦 Provider API response:', {
        success: data.success,
        providerCount: data.providers?.length,
        location: data.location,
        searchMetadata: data.searchMetadata
      });
      
      // Log the actual data structure
      console.log('🔍 First provider example:', data.providers?.[0]);
      console.log('📊 Stats received:', data.stats);
      
      if (data.success && data.providers && Array.isArray(data.providers)) {
        // Store all providers
        setAllProviders(data.providers);
        setStats(data.stats);
        
        // Verify state was updated
        console.log('✅ Setting providers in state:', data.providers.length);
        
        // Update data quality indicator
        if (data.searchMetadata?.dataQuality === 'high') {
          setDataQuality({
            source: 'CMS National Provider Registry + Medicare Pricing',
            accuracy: 'High Accuracy',
            disclaimer: `Real providers from CMS database. Costs based on Medicare rates adjusted for ${insuranceCompany || 'commercial'} insurance.`
          });
        } else if (data.usingCMSData) {
          setDataQuality({
            source: 'CMS Medicare Reference Pricing',
            accuracy: 'Good Estimate',
            disclaimer: 'Prices based on Medicare reimbursement rates. Actual costs may vary 20-40%.'
          });
        } else {
          setDataQuality({
            source: 'Industry Averages',
            accuracy: 'Rough Estimate',
            disclaimer: 'Prices based on typical costs. Contact providers for exact pricing.'
          });
        }
        
        console.log('✅ Providers set successfully:', data.providers.length);
      } else if (!data.success && data.message) {
        setError(data.message);
        console.error('API returned error:', data.message);
      } else {
        setError('No providers found in your area');
        console.error('Invalid response structure:', data);
      }
    } catch (error) {
      console.error('❌ Provider fetch error:', error);
      setError(error instanceof Error ? error.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }

  const getAccuracyColor = (accuracy: string) => {
    switch (accuracy) {
      case 'High Accuracy': return 'bg-green-50 border-green-200 text-green-800';
      case 'Good Estimate': return 'bg-blue-50 border-blue-200 text-blue-800';
      default: return 'bg-amber-50 border-amber-200 text-amber-800';
    }
  };

  const getAccuracyIcon = (accuracy: string) => {
    switch (accuracy) {
      case 'High Accuracy': return '✓✓';
      case 'Good Estimate': return '✓';
      default: return '≈';
    }
  };

  // Use filteredProviders for display
  const displayProviders = filteredProviders;

  // Debug logging
  useEffect(() => {
    console.log('🔍 ProviderSearch Debug:', {
      allProvidersCount: allProviders.length,
      filteredProvidersCount: filteredProviders.length,
      selectedType,
      loading,
      error
    });
  }, [allProviders, filteredProviders, selectedType, loading, error]);

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Find Care Near You</h2>
      
      {/* Show instructions if no insurance or symptom */}
      {!insuranceCompany && !symptom && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <p className="text-lg font-medium text-yellow-900 mb-2">
            To see providers and costs:
          </p>
          <ol className="text-left max-w-md mx-auto text-yellow-800">
            <li className="mb-2">1. Upload your insurance card above</li>
            <li>2. Enter your symptoms in the symptom checker</li>
          </ol>
          <p className="text-sm text-yellow-700 mt-4">
            This helps us show accurate costs based on your specific insurance plan
          </p>
        </div>
      )}
      
      {/* Only show providers if we have insurance OR symptoms */}
      {(insuranceCompany || symptom) && (
        <>
          {/* Location indicator */}
          <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <p className="text-sm text-gray-700 flex items-center gap-2">
              <span className="text-lg">📍</span>
              <span>Showing providers near <strong>{userLocation.city}, {userLocation.state}</strong></span>
              {userLocation.zip && <span className="text-gray-500">({userLocation.zip})</span>}
            </p>
          </div>
      
          {/* Price accuracy indicator */}
          {allProviders.length > 0 && (
            <div className={`mb-4 p-3 border rounded-lg ${getAccuracyColor(dataQuality.accuracy)}`}>
              <p className="text-sm flex items-center gap-2">
                <span className="text-lg font-bold">{getAccuracyIcon(dataQuality.accuracy)}</span>
                <span className="font-medium">{dataQuality.source}</span>
                <span className="text-xs ml-auto">{dataQuality.accuracy}</span>
              </p>
              <p className="text-xs mt-1 opacity-90">{dataQuality.disclaimer}</p>
            </div>
          )}

          {/* Filter buttons */}
          <div className="flex gap-2 mb-6 flex-wrap">
            <button
              onClick={() => setSelectedType('all')}
              className={`px-4 py-2 rounded transition-colors ${
                selectedType === 'all' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              All Providers ({allProviders.length})
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
            <button
              onClick={() => setSelectedType('primary')}
              className={`px-4 py-2 rounded transition-colors ${
                selectedType === 'primary' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 hover:bg-gray-300'
              }`}
            >
              Primary Care
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">Finding providers and calculating costs...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {stats && displayProviders.length > 0 && (
                <div className="bg-blue-50 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-900">
                    Showing <strong>{displayProviders.length}</strong> of <strong>{allProviders.length}</strong> providers • 
                    Your estimated cost: <strong>${stats.min === stats.max ? stats.min : `${stats.min} to ${stats.max}`}</strong>
                    {insuranceCompany && ` with ${insuranceCompany}`}
                  </p>
                </div>
              )}
              
              {displayProviders.length === 0 && !loading && !error && (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-gray-600 mb-2">
                    {allProviders.length > 0 
                      ? 'No providers found matching your selected filter.' 
                      : 'No providers found in your area.'}
                  </p>
                  <p className="text-sm text-gray-500">
                    {allProviders.length > 0 
                      ? 'Try selecting "All Providers" or a different filter.'
                      : 'Try adjusting your location or search criteria.'}
                  </p>
                </div>
              )}
              
              {displayProviders.map((provider, idx) => (
                <div key={`provider-${idx}`} className="border rounded-lg p-6 hover:shadow-lg transition-shadow bg-white">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
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
                        {provider.usingRealPricing && (
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-700">
                            Verified Rate
                          </span>
                        )}
                        {provider.networkStatus && (
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            provider.networkStatus === 'In-Network' 
                              ? 'bg-green-100 text-green-700'
                              : provider.networkStatus === 'Out-of-Network'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {provider.networkStatus}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-600 mt-1">{provider.address}</p>
                      <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                        <span>📍 {provider.distanceText || `${provider.distance.toFixed(1)} miles`}</span>
                        <span>🚗 {provider.durationText || `${provider.driveTime} min`}</span>
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
                          💊 On-site pharmacy available
                        </p>
                      )}
                      
                      {provider.npi && (
                        <p className="text-gray-400 text-xs mt-1">
                          NPI: {provider.npi}
                        </p>
                      )}
                    </div>

                    <div className="text-right ml-4">
                      <div className="mb-2">
                        <p className="text-3xl font-bold text-gray-900">
                          ${provider.estimatedPatientCost}
                        </p>
                        <p className="text-xs text-gray-500">{provider.costNote}</p>
                      </div>
                      
                      {provider.totalCost && (
                        <div className="text-sm text-gray-600 border-t pt-2">
                          <p>Total bill: ${provider.totalCost}</p>
                          <p className="text-green-600">Insurance pays: ${provider.insurancePays}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Cost breakdown */}
                  {provider.costBreakdown && (
                    <div className="mt-3">
                      <button
                        onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {expandedIdx === idx ? '▼' : '▶'} See detailed cost breakdown
                      </button>
                      
                      {expandedIdx === idx && (
                        <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm">
                          <div className="font-semibold mb-3 text-gray-900">
                            {provider.bundleName}
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
                              <span>Total Medical Cost:</span>
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
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex gap-3 flex-wrap">
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
                        👟 Walk-ins Welcome
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}