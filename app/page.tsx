'use client';
import { useState } from 'react';
import InsuranceCardUpload from './components/InsuranceCardUpload';
import CostCard from './components/CostCard';
import ProviderSearch from './components/ProviderSearch';
import SymptomChecker from './components/SymptomChecker';
import LocationInput from './components/LocationInput'; // unused, remove if unnecessary

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

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">CareNav Health</h1>
        <p className="text-gray-600 mb-8">
          Upload your insurance card to find care you can afford
        </p>

        <InsuranceCardUpload onDataExtracted={handleDataExtracted} />

        {extractedData && (
          <>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <CostCard
                title="Urgent Care Visit"
                cost={{
                  min: matchedPlan?.copays?.urgentCare || 75,
                  max: 200,
                  avg: matchedPlan?.copays?.urgentCare || 125
                }}
                insurance={extractedData.companyName}
              />
              <CostCard
                title="ER Visit"
                cost={{
                  min: matchedPlan?.copays?.emergency || 500,
                  max: 3000,
                  avg: matchedPlan?.copays?.emergency || 1200
                }}
                insurance={extractedData.companyName}
              />
              <CostCard
                title="Primary Care"
                cost={{
                  min: matchedPlan?.copays?.primaryCare || 25,
                  max: 150,
                  avg: matchedPlan?.copays?.primaryCare || 50
                }}
                insurance={extractedData.companyName}
              />
              <CostCard
                title="Specialist Visit"
                cost={{
                  min: matchedPlan?.copays?.specialist || 50,
                  max: 300,
                  avg: matchedPlan?.copays?.specialist || 150
                }}
                insurance={extractedData.companyName}
              />
            </div>
          </>
        )}

        <SymptomChecker
          insurancePlan={matchedPlan}
          onSymptomSearch={handleSymptomSearch}
        />

        <ProviderSearch
          insuranceCompany={extractedData?.companyName}
          matchedPlan={matchedPlan}
          symptom={lastSymptom}
          symptomAnalysis={symptomAnalysis}
        />
      </div>
    </main>
  );
}
