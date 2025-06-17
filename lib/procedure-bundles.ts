// lib/procedure-bundles.ts

export interface ProcedureBundle {
  name: string;
  description: string;
  components: {
    code: string;
    description: string;
    category: 'facility' | 'physician' | 'lab' | 'imaging' | 'medication';
    typical_cost: number;
    required: boolean;
  }[];
}

// Common procedure bundles based on symptoms
export const procedureBundles: Record<string, ProcedureBundle> = {
  // Urgent Care Visits
  'urgent_care_flu': {
    name: 'Urgent Care - Flu Treatment',
    description: 'Typical urgent care visit for flu symptoms',
    components: [
      { code: '99213', description: 'Urgent care visit (15-20 min)', category: 'physician', typical_cost: 125, required: true },
      { code: '87804', description: 'Rapid flu test', category: 'lab', typical_cost: 45, required: true },
      { code: '87880', description: 'Strep test (if throat symptoms)', category: 'lab', typical_cost: 35, required: false },
      { code: 'J8499', description: 'Tamiflu prescription', category: 'medication', typical_cost: 75, required: false }
    ]
  },
  
  'urgent_care_strep': {
    name: 'Urgent Care - Strep Throat',
    description: 'Urgent care visit for sore throat',
    components: [
      { code: '99213', description: 'Urgent care visit', category: 'physician', typical_cost: 125, required: true },
      { code: '87880', description: 'Rapid strep test', category: 'lab', typical_cost: 35, required: true },
      { code: '87081', description: 'Throat culture', category: 'lab', typical_cost: 45, required: false },
      { code: 'J0696', description: 'Rocephin injection', category: 'medication', typical_cost: 55, required: false }
    ]
  },
  
  'urgent_care_sprain': {
    name: 'Urgent Care - Ankle Sprain',
    description: 'Urgent care visit for ankle injury',
    components: [
      { code: '99213', description: 'Urgent care visit', category: 'physician', typical_cost: 125, required: true },
      { code: '73610', description: 'Ankle X-ray (3 views)', category: 'imaging', typical_cost: 180, required: true },
      { code: '29540', description: 'Ankle strapping/support', category: 'physician', typical_cost: 95, required: false },
      { code: 'A4570', description: 'Ankle brace', category: 'medication', typical_cost: 45, required: false }
    ]
  },
  
  // Emergency Room Visits
  'er_chest_pain': {
    name: 'ER - Chest Pain Evaluation',
    description: 'Emergency room visit for chest pain',
    components: [
      { code: '99284', description: 'ER visit - high complexity', category: 'facility', typical_cost: 1500, required: true },
      { code: '99284', description: 'ER physician fee', category: 'physician', typical_cost: 850, required: true },
      { code: '93010', description: 'EKG', category: 'imaging', typical_cost: 150, required: true },
      { code: '71045', description: 'Chest X-ray', category: 'imaging', typical_cost: 285, required: true },
      { code: '80053', description: 'Comprehensive metabolic panel', category: 'lab', typical_cost: 195, required: true },
      { code: '84443', description: 'Troponin test', category: 'lab', typical_cost: 125, required: true },
      { code: '85025', description: 'Complete blood count', category: 'lab', typical_cost: 75, required: true }
    ]
  },
  
  'er_abdominal_pain': {
    name: 'ER - Abdominal Pain',
    description: 'Emergency room visit for severe abdominal pain',
    components: [
      { code: '99284', description: 'ER visit - high complexity', category: 'facility', typical_cost: 1500, required: true },
      { code: '99284', description: 'ER physician fee', category: 'physician', typical_cost: 850, required: true },
      { code: '74177', description: 'CT abdomen with contrast', category: 'imaging', typical_cost: 1200, required: true },
      { code: '80053', description: 'Comprehensive metabolic panel', category: 'lab', typical_cost: 195, required: true },
      { code: '81001', description: 'Urinalysis', category: 'lab', typical_cost: 35, required: true },
      { code: '85025', description: 'Complete blood count', category: 'lab', typical_cost: 75, required: true }
    ]
  },
  
  // Primary Care Visits
  'primary_care_physical': {
    name: 'Annual Physical Exam',
    description: 'Preventive care annual physical',
    components: [
      { code: '99395', description: 'Preventive visit', category: 'physician', typical_cost: 250, required: true },
      { code: '80053', description: 'Basic metabolic panel', category: 'lab', typical_cost: 95, required: true },
      { code: '80061', description: 'Lipid panel', category: 'lab', typical_cost: 75, required: true },
      { code: '85025', description: 'Complete blood count', category: 'lab', typical_cost: 45, required: true },
      { code: '81001', description: 'Urinalysis', category: 'lab', typical_cost: 25, required: false }
    ]
  },
  
  'primary_care_diabetes': {
    name: 'Diabetes Follow-up',
    description: 'Routine diabetes management visit',
    components: [
      { code: '99214', description: 'Office visit - moderate complexity', category: 'physician', typical_cost: 175, required: true },
      { code: '83036', description: 'Hemoglobin A1C', category: 'lab', typical_cost: 55, required: true },
      { code: '80053', description: 'Basic metabolic panel', category: 'lab', typical_cost: 95, required: true },
      { code: '82947', description: 'Glucose test', category: 'lab', typical_cost: 25, required: false }
    ]
  }
};

// Map symptoms to appropriate bundles
export const symptomToBundles: Record<string, string[]> = {
  'flu': ['urgent_care_flu'],
  'flu symptoms': ['urgent_care_flu'],
  'fever': ['urgent_care_flu'],
  'sore throat': ['urgent_care_strep'],
  'strep': ['urgent_care_strep'],
  'throat pain': ['urgent_care_strep'],
  'sprained ankle': ['urgent_care_sprain'],
  'ankle pain': ['urgent_care_sprain'],
  'twisted ankle': ['urgent_care_sprain'],
  'chest pain': ['er_chest_pain'],
  'heart pain': ['er_chest_pain'],
  'chest pressure': ['er_chest_pain'],
  'stomach pain': ['er_abdominal_pain'],
  'abdominal pain': ['er_abdominal_pain'],
  'severe stomach': ['er_abdominal_pain'],
  'physical': ['primary_care_physical'],
  'annual exam': ['primary_care_physical'],
  'checkup': ['primary_care_physical'],
  'diabetes': ['primary_care_diabetes'],
  'blood sugar': ['primary_care_diabetes']
};

// Calculate total cost for a bundle
export function calculateBundleCost(
  bundle: ProcedureBundle,
  insurancePlan?: any
): {
  totalCost: number;
  patientCost: number;
  insurancePays: number;
  breakdown: {
    category: string;
    items: Array<{
      description: string;
      cost: number;
      patientPays: number;
    }>;
  }[];
} {
  const isHSA = insurancePlan?.id?.includes('hsa');
  const deductibleMet = 0; // In real app, track this
  
  let totalCost = 0;
  let patientCost = 0;
  let insurancePays = 0;
  
  const breakdown: Record<string, any> = {
    facility: { items: [] },
    physician: { items: [] },
    lab: { items: [] },
    imaging: { items: [] },
    medication: { items: [] }
  };
  
  bundle.components.forEach(component => {
    if (!component.required && Math.random() > 0.7) return; // Skip some optional items
    
    const itemCost = component.typical_cost;
    totalCost += itemCost;
    
    let itemPatientCost = itemCost;
    
    if (isHSA) {
      // HSA: Patient pays everything until deductible
      itemPatientCost = itemCost;
    } else {
      // Traditional insurance
      if (component.category === 'physician' && bundle.name.includes('Urgent Care')) {
        itemPatientCost = 30; // Typical urgent care copay
      } else if (component.category === 'physician' && bundle.name.includes('Primary')) {
        itemPatientCost = 25; // Typical PCP copay
      } else if (component.category === 'facility' && bundle.name.includes('ER')) {
        itemPatientCost = 250; // Typical ER copay
      } else if (component.category === 'lab' || component.category === 'imaging') {
        itemPatientCost = itemCost * 0.2; // 20% coinsurance after deductible
      } else if (component.category === 'medication') {
        itemPatientCost = Math.min(itemCost * 0.3, 50); // Generic copay
      }
    }
    
    patientCost += itemPatientCost;
    insurancePays += (itemCost - itemPatientCost);
    
    breakdown[component.category].items.push({
      description: component.description,
      cost: itemCost,
      patientPays: Math.round(itemPatientCost)
    });
  });
  
  // Filter out empty categories
  const finalBreakdown = Object.entries(breakdown)
    .filter(([_, data]) => data.items.length > 0)
    .map(([category, data]) => ({
      category: category.charAt(0).toUpperCase() + category.slice(1),
      items: data.items
    }));
  
  return {
    totalCost: Math.round(totalCost),
    patientCost: Math.round(patientCost),
    insurancePays: Math.round(insurancePays),
    breakdown: finalBreakdown
  };
}

// Get bundle for symptom
export function getBundleForSymptom(symptom: string): ProcedureBundle | null {
  const lowerSymptom = symptom.toLowerCase();
  
  // Find matching bundle
  for (const [key, bundleNames] of Object.entries(symptomToBundles)) {
    if (lowerSymptom.includes(key)) {
      const bundleName = bundleNames[0];
      return procedureBundles[bundleName] || null;
    }
  }
  
  return null;
}