'use client';

import { useState } from 'react';

interface SymptomResult {
  urgency: 'emergency' | 'urgent' | 'primary' | 'self_care';
  suggestedCare: string;
  estimatedCosts: {
    type: string;
    cost: { min: number; max: number };
  }[];
  message: string;
}

const SYMPTOM_MAPPINGS: Record<string, SymptomResult> = {
  'chest pain': {
    urgency: 'emergency',
    suggestedCare: 'Emergency Room',
    estimatedCosts: [
      { type: 'ER Visit', cost: { min: 1000, max: 5000 } },
      { type: 'EKG', cost: { min: 200, max: 500 } }
    ],
    message: 'Chest pain can be serious. If severe, call 911 immediately.'
  },
  'flu symptoms': {
    urgency: 'urgent',
    suggestedCare: 'Urgent Care',
    estimatedCosts: [
      { type: 'Office Visit', cost: { min: 75, max: 200 } },
      { type: 'Flu Test', cost: { min: 25, max: 50 } }
    ],
    message: 'Flu symptoms can be treated at urgent care. Rest and fluids help.'
  },
  'sore throat': {
    urgency: 'primary',
    suggestedCare: 'Primary Care or Urgent Care',
    estimatedCosts: [
      { type: 'Office Visit', cost: { min: 65, max: 150 } },
      { type: 'Strep Test', cost: { min: 20, max: 40 } }
    ],
    message: 'Most sore throats resolve on their own. See a doctor if it persists.'
  }
};

export default function SymptomChecker() {
  const [symptom, setSymptom] = useState('');
  const [result, setResult] = useState<SymptomResult | null>(null);

  const checkSymptom = () => {
    const lowerSymptom = symptom.toLowerCase();
    
    // Find matching symptom
    const matchedSymptom = Object.keys(SYMPTOM_MAPPINGS).find(key => 
      lowerSymptom.includes(key)
    );
    
    if (matchedSymptom) {
      setResult(SYMPTOM_MAPPINGS[matchedSymptom]);
    } else {
      // Default response
      setResult({
        urgency: 'primary',
        suggestedCare: 'Primary Care',
        estimatedCosts: [
          { type: 'Office Visit', cost: { min: 100, max: 250 } }
        ],
        message: 'For general symptoms, start with your primary care doctor.'
      });
    }
  };

  return (
    <div className="mt-8 p-6 bg-gray-50 rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Check Your Symptoms</h2>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
          placeholder="Describe your symptoms (e.g., 'sore throat', 'chest pain')"
          className="flex-1 px-4 py-2 border rounded-lg"
          onKeyPress={(e) => e.key === 'Enter' && checkSymptom()}
        />
        <button
          onClick={checkSymptom}
          className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
        >
          Check
        </button>
      </div>

      {result && (
        <div className="mt-6 p-4 bg-white rounded-lg border">
          <div className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mb-3
            ${result.urgency === 'emergency' ? 'bg-red-100 text-red-800' : ''}
            ${result.urgency === 'urgent' ? 'bg-orange-100 text-orange-800' : ''}
            ${result.urgency === 'primary' ? 'bg-blue-100 text-blue-800' : ''}
          `}>
            {result.urgency.toUpperCase()}
          </div>
          
          <h3 className="font-semibold text-lg">
            Suggested: {result.suggestedCare}
          </h3>
          
          <p className="text-gray-600 mt-2">{result.message}</p>
          
          <div className="mt-4">
            <p className="font-semibold mb-2">Estimated Costs:</p>
            {result.estimatedCosts.map((cost, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{cost.type}:</span>
                <span>${cost.cost.min}-${cost.cost.max}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <p className="text-xs text-gray-500 mt-4">
        This is not medical advice. Always consult with a healthcare professional.
      </p>
    </div>
  );
}