import React, { useState } from 'react';

export default function ProviderNetworkChecker() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'check' | 'search' | 'plans'>('plans');
  
  // Form states
  const [npi, setNpi] = useState('');
  const [planId, setPlanId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const checkNetwork = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/provider-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'CHECK_NETWORK',
          npi,
          planId,
          state: 'TN'
        })
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      setResults({ success: false, error: 'Request failed' });
    }
    setLoading(false);
  };

  const searchProviders = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/provider-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'FIND_PROVIDERS',
          providerName: searchTerm,
          state: 'TN'
        })
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      setResults({ success: false, error: 'Request failed' });
    }
    setLoading(false);
  };

  const getPlans = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/provider-network', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'GET_PLANS',
          state: 'TN'
        })
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      setResults({ success: false, error: 'Request failed' });
    }
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold mb-6">Provider Network API Tester</h2>
        
        {/* Success Banner */}
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-800 font-medium">✅ Connected to BCBS Tennessee FHIR API</p>
          <p className="text-green-600 text-sm mt-1">Real-time provider and plan data available</p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab('plans')}
            className={`pb-2 px-1 ${activeTab === 'plans' 
              ? 'border-b-2 border-blue-500 font-medium' 
              : 'text-gray-600'}`}
          >
            Browse Plans
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`pb-2 px-1 ${activeTab === 'search' 
              ? 'border-b-2 border-blue-500 font-medium' 
              : 'text-gray-600'}`}
          >
            Search Providers
          </button>
          <button
            onClick={() => setActiveTab('check')}
            className={`pb-2 px-1 ${activeTab === 'check' 
              ? 'border-b-2 border-blue-500 font-medium' 
              : 'text-gray-600'}`}
          >
            Check Network Status
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'plans' && (
          <div>
            <p className="text-gray-600 mb-4">
              View all available insurance plans from BCBS Tennessee
            </p>
            <button
              onClick={getPlans}
              disabled={loading}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Get Insurance Plans'}
            </button>
          </div>
        )}

        {activeTab === 'search' && (
          <div>
            <p className="text-gray-600 mb-4">
              Search for providers by name in the BCBS TN network
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Provider name (e.g., Smith)"
                className="flex-1 px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={searchProviders}
                disabled={loading || !searchTerm}
                className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'check' && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Check if a specific provider is in-network for a plan
            </p>
            <input
              type="text"
              value={npi}
              onChange={(e) => setNpi(e.target.value)}
              placeholder="Provider NPI (10 digits)"
              className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              placeholder="Plan ID (e.g., 261908892)"
              className="w-full px-4 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={checkNetwork}
              disabled={loading || !npi || !planId}
              className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Checking...' : 'Check Network Status'}
            </button>
          </div>
        )}

        {/* Results Display */}
        {results && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Results:</h3>
            
            {/* Plans Results */}
            {results.plans && (
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Total Plans: {results.totalPlans}
                </p>
                
                {Object.entries(results.plans).map(([type, plans]: [string, any]) => (
                  plans.length > 0 && (
                    <div key={type} className="border-l-4 border-blue-500 pl-4">
                      <h4 className="font-medium capitalize mb-2">{type} Plans ({plans.length})</h4>
                      <div className="space-y-2">
                        {plans.slice(0, 3).map((plan: any) => (
                          <div key={plan.id} className="text-sm">
                            <p className="font-medium">{plan.name}</p>
                            <p className="text-gray-600">ID: {plan.id}</p>
                          </div>
                        ))}
                        {plans.length > 3 && (
                          <p className="text-sm text-gray-500">
                            ...and {plans.length - 3} more
                          </p>
                        )}
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
            
            {/* Provider Search Results */}
            {results.providers && (
              <div className="space-y-2">
                <p className="text-sm text-gray-600">
                  Found {results.totalResults} providers
                </p>
                {results.providers.map((provider: any) => (
                  <div key={provider.id} className="border-l-4 border-green-500 pl-4">
                    <p className="font-medium">{provider.name}</p>
                    <p className="text-sm text-gray-600">
                      NPI: {provider.npi || 'Not available'} | 
                      Specialty: {provider.specialty || 'Not specified'}
                    </p>
                  </div>
                ))}
              </div>
            )}
            
            {/* Network Check Results */}
            {results.inNetwork !== undefined && (
              <div className={`p-4 rounded ${results.inNetwork ? 'bg-green-100' : 'bg-red-100'}`}>
                <p className="font-medium">
                  {results.inNetwork ? '✅ In-Network' : '❌ Not In-Network'}
                </p>
                {results.provider && (
                  <p className="text-sm mt-1">
                    Provider: {results.provider.name}
                  </p>
                )}
              </div>
            )}
            
            {/* Error Display */}
            {results.error && (
              <p className="text-red-600">{results.error}</p>
            )}
            
            {/* Raw JSON Toggle */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800">
                View Raw Response
              </summary>
              <pre className="mt-2 text-xs bg-gray-900 text-gray-100 p-3 rounded overflow-auto">
                {JSON.stringify(results, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}