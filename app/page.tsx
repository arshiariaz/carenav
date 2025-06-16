'use client';

import { useState } from 'react';
import InsuranceCardUpload from './components/InsuranceCardUpload';
import CostCard from './components/CostCard';
import ProviderSearch from './components/ProviderSearch';
import SymptomChecker from './components/SymptomChecker';

export default function Home() {
  const [extractedData, setExtractedData] = useState<any>(null);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">CareNav Health</h1>
        <p className="text-gray-600 mb-8">
          Upload your insurance card to find care you can afford
        </p>
        
        {/* Step 1: Upload Insurance Card */}
        <InsuranceCardUpload onDataExtracted={setExtractedData} />
        
        {/* Step 2: Show Insurance Info & Costs */}
        {extractedData && (
          <>
            <div className="mt-8 p-6 bg-blue-50 rounded-lg">
              <h2 className="text-xl font-semibold mb-4">Your Insurance Info</h2>
              <div className="space-y-2">
                <p><strong>Insurance:</strong> {extractedData.companyName}</p>
                <p><strong>Member ID:</strong> {extractedData.memberId}</p>
                <p><strong>Group:</strong> {extractedData.groupNumber}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <CostCard 
                title="Urgent Care Visit" 
                cost={{ min: 75, max: 200, avg: 125 }} 
                insurance={extractedData.companyName}
              />
              <CostCard 
                title="ER Visit" 
                cost={{ min: 500, max: 3000, avg: 1200 }} 
                insurance={extractedData.companyName}
              />
              <CostCard 
                title="Flu Test" 
                cost={{ min: 25, max: 100, avg: 50 }} 
                insurance={extractedData.companyName}
              />
              <CostCard 
                title="X-Ray" 
                cost={{ min: 100, max: 500, avg: 250 }} 
                insurance={extractedData.companyName}
              />
            </div>
          </>
        )}

        {/* Step 3: Symptom Checker */}
        <SymptomChecker />

        {/* Step 4: Find Providers */}
        <ProviderSearch insuranceCompany={extractedData?.companyName} />
      </div>
    </main>
  );
}