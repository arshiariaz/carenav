'use client';

import { useState } from 'react';
import InsuranceCardUpload from './components/InsuranceCardUpload';
import CostCard from './components/CostCard';

const PROCEDURE_COSTS = {
  urgent_care_visit: { min: 75, max: 200, avg: 125 },
  er_visit: { min: 500, max: 3000, avg: 1200 },
  flu_test: { min: 25, max: 100, avg: 50 },
  xray: { min: 100, max: 500, avg: 250 }
};

export default function Home() {
  const [extractedData, setExtractedData] = useState<any>(null);

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">CareNav Health</h1>
        <p className="text-gray-600 mb-8">
          Upload your insurance card to find care you can afford
        </p>
        
        <InsuranceCardUpload onDataExtracted={setExtractedData} />
        
        {extractedData && (
          <div className="mt-8 p-6 bg-blue-50 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Your Insurance Info</h2>
            <div className="space-y-2">
              <p><strong>Insurance:</strong> {extractedData.companyName}</p>
              <p><strong>Member ID:</strong> {extractedData.memberId}</p>
              <p><strong>Group:</strong> {extractedData.groupNumber}</p>
              <p><strong>Payer ID:</strong> {extractedData.payerId}</p>
              {extractedData.confidence && (
                <p><strong>Confidence:</strong> {(extractedData.confidence * 100).toFixed(1)}%</p>
              )}
            </div>

            {/* Cost Estimates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <CostCard 
                title="Urgent Care Visit"
                cost={PROCEDURE_COSTS.urgent_care_visit}
                insurance={extractedData.companyName}
              />
              <CostCard 
                title="ER Visit"
                cost={PROCEDURE_COSTS.er_visit}
                insurance={extractedData.companyName}
              />
              <CostCard 
                title="Flu Test"
                cost={PROCEDURE_COSTS.flu_test}
                insurance={extractedData.companyName}
              />
              <CostCard 
                title="X-Ray"
                cost={PROCEDURE_COSTS.xray}
                insurance={extractedData.companyName}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
