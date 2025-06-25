'use client';
import { useState } from 'react';
import InsuranceCardUpload from './components/InsuranceCardUpload';
import ProviderSearch from './components/ProviderSearch';
import SymptomChecker from './components/SymptomChecker';
import LocationInput from './components/LocationInput';
import SimpleProviderTest from './components/SimpleProviderTest';

export default function Home() {
  const [extractedData, setExtractedData] = useState<any>(null);
  const [matchedPlan, setMatchedPlan] = useState<any>(null);
  const [lastSymptom, setLastSymptom] = useState<string>('');
  const [symptomAnalysis, setSymptomAnalysis] = useState<any>(null);
  const [userLocation, setUserLocation] = useState({
    city: 'Houston',
    state: 'TX',
    zip: '77001'
  });

  const handleDataExtracted = (data: any, plan?: any) => {
    setExtractedData(data);
    setMatchedPlan(plan);
  };

  const handleSymptomSearch = (symptom: string, analysis?: any) => {
    setLastSymptom(symptom);
    setSymptomAnalysis(analysis);
  };

  const handleLocationChange = (location: { 
    address?: string; 
    city: string; 
    state: string; 
    zip?: string;
    lat?: number;
    lng?: number;
  }) => {
    console.log('📍 Location changed:', location);
    setUserLocation({
      city: location.city,
      state: location.state,
      zip: location.zip || ''
    });
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">CareNav Health</h1>
        <p className="text-gray-600 mb-8">
          Upload your insurance card to find care you can afford
        </p>

        <InsuranceCardUpload onDataExtracted={handleDataExtracted} />

        {extractedData && matchedPlan && (
          <div className="mt-4">
            <a 
              href={`/my-benefits?planId=${matchedPlan.id}&carrier=${extractedData.companyName}`}
              className="inline-block bg-green-500 text-white px-6 py-3 rounded hover:bg-green-600"
            >
              View My Full Benefits →
            </a>
          </div>
        )}

        {extractedData && (
          <div className="mt-8 p-6 bg-blue-50 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Your Insurance Info</h2>
            <div className="space-y-2">
              <p><strong>Insurance:</strong> {extractedData.companyName}</p>
              <p><strong>Member ID:</strong> {extractedData.memberId}</p>
              <p><strong>Group:</strong> {extractedData.groupNumber}</p>
              {matchedPlan && (
                <p className="text-green-600 mt-2">
                  ✓ Matched to {matchedPlan.name} plan
                </p>
              )}
            </div>
          </div>
        )}

        <LocationInput onLocationChange={handleLocationChange} />

        {/* ADD DEBUG COMPONENT HERE */}
        <SimpleProviderTest />

        <SymptomChecker
          insurancePlan={matchedPlan}
          onSymptomSearch={handleSymptomSearch}
        />

        <ProviderSearch
          insuranceCompany={extractedData?.companyName}
          matchedPlan={matchedPlan}
          symptom={lastSymptom || 'office visit'}
          symptomAnalysis={symptomAnalysis}
          userLocation={userLocation}
        />
      </div>
    </main>
  );
}