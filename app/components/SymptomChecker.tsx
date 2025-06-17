'use client';

import { useState } from 'react';

interface Props {
  insurancePlan?: any;
  onSymptomSearch?: (symptom: string, analysis?: SymptomAnalysis) => void;
}

interface SymptomAnalysis {
  urgency: 'emergency' | 'urgent' | 'routine' | 'self_care';
  careSettings: string[];
  cptCodes: Array<{
    code: string;
    description: string;
    probability?: number;
  }>;
  reasoning: string;
  redFlags: string[];
  estimatedDuration: string;
}

export default function SymptomChecker({ insurancePlan, onSymptomSearch }: Props) {
  const [symptom, setSymptom] = useState('');
  const [analysis, setAnalysis] = useState<SymptomAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const analyzeSymptom = async () => {
    if (!symptom.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/symptom-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptom })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setAnalysis(data.analysis);
        // Pass both symptom AND analysis to provider search
        onSymptomSearch?.(symptom, data.analysis);
      } else {
        setError('Unable to analyze symptoms');
      }
    } catch (err) {
      setError('Analysis failed');
      console.error('Symptom analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'emergency': return 'border-red-500 bg-red-50';
      case 'urgent': return 'border-orange-500 bg-orange-50';
      case 'routine': return 'border-blue-500 bg-blue-50';
      case 'self_care': return 'border-green-500 bg-green-50';
      default: return 'border-gray-300 bg-gray-50';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'emergency': return '🚨';
      case 'urgent': return '⚠️';
      case 'routine': return 'ℹ️';
      case 'self_care': return '✅';
      default: return '❓';
    }
  };

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Check Your Symptoms</h2>
      
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && analyzeSymptom()}
          placeholder="Describe your symptoms (e.g., 'sore throat and fever for 2 days')"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={analyzeSymptom}
          disabled={loading || !symptom.trim()}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              Analyzing...
            </div>
          ) : (
            'Check'
          )}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {analysis && (
        <div className={`border-2 rounded-lg p-6 ${getUrgencyColor(analysis.urgency)}`}>
          <div className="flex items-start gap-3 mb-4">
            <span className="text-2xl">{getUrgencyIcon(analysis.urgency)}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-semibold text-lg uppercase tracking-wide">
                  {analysis.urgency.replace('_', ' ')}
                </span>
                {analysis.urgency === 'emergency' && (
                  <span className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                    CALL 911
                  </span>
                )}
              </div>
              
              <p className="text-sm mb-3">
                <strong>Suggested:</strong> {analysis.careSettings.join(' or ')}
              </p>
              
              <p className="text-sm text-gray-700 mb-4">
                {analysis.reasoning}
              </p>

              {analysis.urgency === 'emergency' && (
                <div className="bg-red-100 border border-red-300 rounded p-3 mb-4">
                  <p className="text-red-800 font-semibold text-sm">
                    ⚠️ This may require immediate medical attention. If symptoms are severe, call 911.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="font-semibold mb-2">Estimated Costs:</p>
                  {analysis.cptCodes.map((cpt, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{cpt.description}:</span>
                      <span className="font-medium">
                        {analysis.urgency === 'emergency' ? '$500-$2000' :
                         analysis.urgency === 'urgent' ? '$100-$400' : '$50-$200'}
                      </span>
                    </div>
                  ))}
                </div>
                
                <div>
                  <p className="font-semibold mb-2">Expected Timeline:</p>
                  <p>{analysis.estimatedDuration}</p>
                  
                  {analysis.redFlags.length > 0 && (
                    <div className="mt-3">
                      <p className="font-semibold text-red-700 mb-1">⚠️ Seek immediate care if:</p>
                      <ul className="text-xs text-red-600">
                        {analysis.redFlags.slice(0, 3).map((flag, idx) => (
                          <li key={idx}>• {flag}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              {analysis.cptCodes.length > 0 && (
                <div className="mt-4 p-3 bg-gray-100 rounded text-xs">
                  <p className="font-semibold mb-1">Likely procedures:</p>
                  <p className="text-gray-600">
                    {analysis.cptCodes.map(cpt => `${cpt.code} (${cpt.description})`).join(', ')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500 mt-4">
        This is not medical advice. Always consult with a healthcare professional.
      </p>
    </div>
  );
}