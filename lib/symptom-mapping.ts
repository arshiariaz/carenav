// lib/symptom-mapping.ts

export interface SymptomMapping {
  symptom: string;
  keywords: string[];
  urgency: 'emergency' | 'urgent' | 'primary' | 'self_care';
  careSettings: string[];
  cptCodes: {
    code: string;
    description: string;
    probability: number;
  }[];
}

export const symptomMappings: SymptomMapping[] = [
  {
    symptom: 'Flu symptoms',
    keywords: ['flu', 'influenza', 'body aches', 'fever'],
    urgency: 'urgent',
    careSettings: ['Urgent Care', 'Primary Care'],
    cptCodes: [
      { code: '99213', description: 'Office visit', probability: 0.9 },
      { code: '87804', description: 'Flu test', probability: 0.8 }
    ]
  },
  {
    symptom: 'Sore throat',
    keywords: ['throat', 'strep'],
    urgency: 'primary',
    careSettings: ['Primary Care', 'Urgent Care'],
    cptCodes: [
      { code: '99213', description: 'Office visit', probability: 0.95 },
      { code: '87880', description: 'Strep test', probability: 0.7 }
    ]
  },
  {
    symptom: 'Chest pain',
    keywords: ['chest', 'heart'],
    urgency: 'emergency',
    careSettings: ['Emergency Room'],
    cptCodes: [
      { code: '99284', description: 'ER visit', probability: 0.9 },
      { code: '71045', description: 'Chest X-ray', probability: 0.8 }
    ]
  }
];

export function findSymptomMatch(userInput: string): SymptomMapping | null {
  const input = userInput.toLowerCase();
  
  // Try to find a match
  const match = symptomMappings.find(s => 
    s.keywords.some(keyword => input.includes(keyword))
  );
  
  return match || null;
}