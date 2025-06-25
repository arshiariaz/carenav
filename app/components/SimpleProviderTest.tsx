// components/SimpleProviderTest.tsx
'use client';

import { useState } from 'react';

export default function SimpleProviderTest() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [rawData, setRawData] = useState<any>(null);

  const testFetch = async () => {
    setLoading(true);
    console.log('🚀 Starting test fetch...');
    
    try {
      const response = await fetch('/api/provider-costs-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: 'test',
          symptom: 'office visit',
          cptCodes: ['99213'],
          urgency: 'routine',
          city: 'Houston',
          state: 'TX',
          zip: '77001'
        })
      });

      const data = await response.json();
      console.log('📦 Raw response:', data);
      
      setRawData(data);
      
      if (data.providers) {
        setProviders(data.providers);
        console.log('✅ Providers set in state:', data.providers.length);
      }
    } catch (error) {
      console.error('❌ Test fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
      <h3 className="text-lg font-bold mb-4">Simple Provider Test</h3>
      
      <button
        onClick={testFetch}
        disabled={loading}
        className="mb-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
      >
        {loading ? 'Testing...' : 'Test Provider Fetch'}
      </button>
      
      <div className="mb-4">
        <p className="font-semibold">Providers in state: {providers.length}</p>
      </div>
      
      {providers.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-semibold">First 3 providers:</h4>
          {providers.slice(0, 3).map((p, i) => (
            <div key={i} className="p-2 bg-gray-100 rounded">
              <p className="font-medium">{p.name}</p>
              <p className="text-sm">{p.type} - ${p.estimatedPatientCost}</p>
            </div>
          ))}
        </div>
      )}
      
      {rawData && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-gray-600">View raw response</summary>
          <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}