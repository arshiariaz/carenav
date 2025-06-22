// lib/healthcare-apis.ts
import axios from 'axios';
import { GoogleDistanceService } from './google-distance-service';

// Type definitions to fix all TypeScript errors
interface DrugPrice {
  drugName: string;
  quantity: number;
  dosage?: string;
  retailPrice: number;
  discountPrice: number;
  savings: number;
  pharmacy: string;
  couponUrl?: string;
}

interface DistanceResult {
  distance: string;
  distanceValue: number;
  duration: string;
  durationValue: number;
}

interface CMSPrice {
  code: string;
  price: number;
  description: string;
  medicareRate?: number;
  commercialRate?: number;
}

interface MedicationInfo {
  name: string;
  genericName?: string;
  brandName?: string;
  dosage: string;
  quantity: number;
  purpose: string;
  retailPrice?: number;
  discountPrice?: number;
  priorAuthLikely?: boolean;
}

// Type for API responses
interface APIResponse {
  [key: string]: any;
}

// CMS Price Lookup - Using real CMS data
export class CMSPriceLookup {
  // CMS data.cms.gov API endpoint
  private static CMS_API_URL = 'https://data.cms.gov/data-api/v1/dataset';
  private static MEDICARE_PFS_DATASET = 'af5a8e4a-878e-4d9e-8183-5eb402b3e7dd'; // Medicare Physician Fee Schedule
  
  // Medicare base rates (2024) - multiply by 2.5 for commercial
  private static MEDICARE_RATES: Record<string, number> = {
    // Office visits
    '99201': 46.56,
    '99202': 77.23,
    '99203': 113.75,
    '99204': 171.37,
    '99205': 224.36,
    '99211': 23.03,
    '99212': 57.86,
    '99213': 93.51,
    '99214': 132.93,
    '99215': 183.19,
    
    // Emergency
    '99281': 31.71,
    '99282': 65.84,
    '99283': 152.50,
    '99284': 342.84,
    '99285': 515.99,
    
    // Labs
    '80047': 14.49,
    '80048': 17.78,
    '80053': 19.44,
    '80061': 18.37,
    '81001': 4.53,
    '83036': 13.42,
    '84443': 22.89,
    '85025': 10.94,
    '87804': 36.66,
    '87880': 16.87,
    '87635': 51.00, // COVID test
    
    // Imaging
    '70450': 142.46,
    '71045': 31.71,
    '71046': 39.33,
    '73610': 29.01,
    '74177': 470.74,
    
    // Other
    '90471': 29.44,
    '93000': 9.61,
    '93010': 17.00,
    '96372': 29.28,
    '97110': 31.40
  };
  
  static async getMedicarePrices(cptCodes: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    
    // Try to get from CMS API first
    try {
      // CMS API requires specific query format
      const cptQuery = cptCodes.map(code => `HCPCS_CD=${code}`).join(' OR ');
      const url = `${this.CMS_API_URL}/${this.MEDICARE_PFS_DATASET}/data`;
      
      const response = await axios.get<APIResponse>(url, {
        params: {
          'filter[filter-1][condition][path]': 'HCPCS_CD',
          'filter[filter-1][condition][operator]': 'IN',
          'filter[filter-1][condition][value]': cptCodes.join(','),
          'size': 100
        },
        timeout: 5000
      });
      
      if (response.data && Array.isArray(response.data)) {
        response.data.forEach((item: any) => {
          const code = item.HCPCS_CD;
          const rate = parseFloat(item.NON_FAC_PE_NA) || parseFloat(item.FAC_PE_NA) || 0;
          if (rate > 0) {
            prices.set(code, Math.round(rate * 2.5)); // Commercial rate
          }
        });
      }
    } catch (error) {
      console.log('CMS API unavailable, using static rates');
    }
    
    // Fill in any missing codes with static rates
    cptCodes.forEach(code => {
      if (!prices.has(code)) {
        const baseRate = this.MEDICARE_RATES[code];
        if (baseRate) {
          prices.set(code, Math.round(baseRate * 2.5));
        }
      }
    });
    
    return prices;
  }
}

// FDA Drug Information Service
export class MedicationService {
  private static FDA_API = 'https://api.fda.gov/drug';
  
  static async getMedicationsForSymptom(symptom: string): Promise<MedicationInfo[]> {
    const symptomMedications: Record<string, string[]> = {
      'flu': ['oseltamivir', 'ibuprofen', 'acetaminophen'],
      'strep': ['amoxicillin', 'penicillin', 'azithromycin'],
      'pain': ['ibuprofen', 'acetaminophen', 'naproxen'],
      'infection': ['amoxicillin', 'ciprofloxacin', 'doxycycline'],
      'diabetes': ['metformin', 'glipizide', 'insulin'],
      'hypertension': ['lisinopril', 'amlodipine', 'losartan'],
      'anxiety': ['sertraline', 'escitalopram', 'buspirone'],
      'depression': ['sertraline', 'fluoxetine', 'citalopram'],
      'cold': ['dextromethorphan', 'pseudoephedrine', 'acetaminophen'],
      'allergies': ['cetirizine', 'loratadine', 'diphenhydramine']
    };
    
    const symptomLower = symptom.toLowerCase();
    let medications: string[] = [];
    
    // Find matching medications
    for (const [key, meds] of Object.entries(symptomMedications)) {
      if (symptomLower.includes(key)) {
        medications = meds;
        break;
      }
    }
    
    // Default medications if no match
    if (medications.length === 0) {
      medications = ['ibuprofen', 'acetaminophen'];
    }
    
    // Get medication details from FDA
    const medicationDetails = await Promise.all(
      medications.slice(0, 3).map(async (medName) => {
        try {
          const response = await axios.get<APIResponse>(
            `${this.FDA_API}/label.json`,
            {
              params: {
                search: `openfda.generic_name:"${medName}"`,
                limit: 1
              },
              timeout: 3000
            }
          );
          
          if (response.data?.results && response.data.results[0]) {
            const result = response.data.results[0];
            return {
              name: medName,
              genericName: result.openfda?.generic_name?.[0] || medName,
              brandName: result.openfda?.brand_name?.[0] || medName.charAt(0).toUpperCase() + medName.slice(1),
              dosage: this.extractDosage(result.dosage_and_administration?.[0] || ''),
              quantity: 30,
              purpose: result.indications_and_usage?.[0]?.substring(0, 100) || 'Treatment',
              retailPrice: this.estimateRetailPrice(medName),
              discountPrice: this.estimateDiscountPrice(medName),
              priorAuthLikely: this.checkPriorAuth(medName)
            };
          }
        } catch (error) {
          console.log(`FDA API error for ${medName}, using defaults`);
        }
        
        // Fallback
        return {
          name: medName,
          genericName: medName,
          brandName: medName.charAt(0).toUpperCase() + medName.slice(1),
          dosage: 'As directed',
          quantity: 30,
          purpose: 'Treatment',
          retailPrice: this.estimateRetailPrice(medName),
          discountPrice: this.estimateDiscountPrice(medName),
          priorAuthLikely: false
        };
      })
    );
    
    return medicationDetails;
  }
  
  private static extractDosage(text: string): string {
    const doseMatch = text.match(/\d+\s*mg/i);
    return doseMatch ? doseMatch[0] : 'As directed';
  }
  
  private static estimateRetailPrice(drugName: string): number {
    const prices: Record<string, number> = {
      'oseltamivir': 175,
      'amoxicillin': 25,
      'ibuprofen': 15,
      'acetaminophen': 10,
      'metformin': 45,
      'sertraline': 85,
      'lisinopril': 40,
      'atorvastatin': 120,
      'azithromycin': 45,
      'ciprofloxacin': 35
    };
    return prices[drugName] || 50;
  }
  
  private static estimateDiscountPrice(drugName: string): number {
    const retail = this.estimateRetailPrice(drugName);
    const genericDrugs = ['amoxicillin', 'ibuprofen', 'metformin', 'lisinopril', 'acetaminophen'];
    return genericDrugs.includes(drugName) ? Math.round(retail * 0.15) : Math.round(retail * 0.25);
  }
  
  private static checkPriorAuth(drugName: string): boolean {
    const priorAuthDrugs = ['humira', 'enbrel', 'ozempic', 'mounjaro', 'oseltamivir'];
    return priorAuthDrugs.includes(drugName.toLowerCase());
  }
}

// Google Distance Matrix Integration (with OpenStreetMap fallback)
export class DistanceService {
  private static USE_GOOGLE_API = process.env.NEXT_PUBLIC_USE_DISTANCE_API === 'true';
  private static NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
  private static lastRequestTime = 0;
  private static MIN_DELAY = 1000; // 1 second between requests for OSM
  
  static async calculateDistance(zip1: string, zip2: string): Promise<DistanceResult> {
    // Use Google Distance Matrix API if enabled
    if (this.USE_GOOGLE_API && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      try {
        console.log('📍 Using Google Distance Matrix API');
        const result = await GoogleDistanceService.calculateDistance(
          `${zip1}, USA`,
          `${zip2}, USA`,
          'driving'
        );
        
        return {
          distance: result.distance,
          distanceValue: result.distanceValue,
          duration: result.duration,
          durationValue: result.durationValue
        };
      } catch (error) {
        console.error('Google Distance API failed, falling back to OSM:', error);
      }
    }
    
    // Fallback to OpenStreetMap
    try {
      // Rate limiting for OSM
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.MIN_DELAY) {
        await new Promise(resolve => setTimeout(resolve, this.MIN_DELAY - elapsed));
      }
      this.lastRequestTime = Date.now();
      
      // Get coordinates for both ZIPs
      const [coord1, coord2] = await Promise.all([
        this.getCoordinates(zip1),
        this.getCoordinates(zip2)
      ]);
      
      if (coord1 && coord2) {
        const distance = this.haversineDistance(coord1, coord2);
        const duration = Math.round(distance * 2.5); // Assume 24mph average
        
        return {
          distance: `${distance.toFixed(1)} mi`,
          distanceValue: distance,
          duration: `${duration} min`,
          durationValue: duration
        };
      }
    } catch (error) {
      console.error('Distance calculation error:', error);
    }
    
    // Final fallback calculation
    return this.estimateDistance(zip1, zip2);
  }
  
  /**
   * Calculate distances for multiple providers at once (more efficient)
   */
  static async calculateMultipleDistances(
    userLocation: string,
    providerLocations: Array<{ id: string; address: string; zip?: string }>
  ): Promise<Map<string, DistanceResult>> {
    const results = new Map<string, DistanceResult>();
    
    if (this.USE_GOOGLE_API && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) {
      try {
        console.log(`📍 Calculating distances for ${providerLocations.length} providers`);
        
        // Extract destinations
        const destinations = providerLocations.map(p => 
          p.zip ? `${p.zip}, USA` : p.address
        );
        
        // Use batch API
        const distanceResults = await GoogleDistanceService.calculateMultipleDistances(
          userLocation,
          destinations,
          'driving'
        );
        
        // Map results back to provider IDs
        distanceResults.forEach((result, index) => {
          const providerId = providerLocations[index].id;
          results.set(providerId, {
            distance: result.distance,
            distanceValue: result.distanceValue,
            duration: result.duration,
            durationValue: result.durationValue
          });
        });
        
        return results;
      } catch (error) {
        console.error('Batch distance calculation failed:', error);
      }
    }
    
    // Fallback: calculate individually
    for (const provider of providerLocations) {
      const distance = await this.calculateDistance(
        userLocation,
        provider.zip || provider.address
      );
      results.set(provider.id, distance);
    }
    
    return results;
  }
  
  private static async getCoordinates(zip: string): Promise<{ lat: number; lon: number } | null> {
    try {
      const response = await axios.get<any[]>(`${this.NOMINATIM_URL}/search`, {
        params: {
          postalcode: zip,
          country: 'USA',
          format: 'json',
          limit: 1
        },
        headers: {
          'User-Agent': 'CareNav Health App/1.0'
        },
        timeout: 5000
      });
      
      if (response.data && response.data[0]) {
        return {
          lat: parseFloat(response.data[0].lat),
          lon: parseFloat(response.data[0].lon)
        };
      }
    } catch (error) {
      console.error(`Geocoding error for ZIP ${zip}:`, error);
    }
    
    return null;
  }
  
  private static haversineDistance(coord1: { lat: number; lon: number }, coord2: { lat: number; lon: number }): number {
    const R = 3959; // Earth's radius in miles
    const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
    const dLon = (coord2.lon - coord1.lon) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  private static estimateDistance(zip1: string, zip2: string): DistanceResult {
    const z1 = parseInt(zip1.substring(0, 5)) || 77001;
    const z2 = parseInt(zip2.substring(0, 5)) || 77001;
    const diff = Math.abs(z1 - z2);
    
    let miles = 5;
    if (diff === 0) miles = 0.5 + Math.random() * 2;
    else if (diff < 10) miles = 2 + Math.random() * 3;
    else if (diff < 50) miles = 5 + Math.random() * 5;
    else miles = 10 + Math.random() * 10;
    
    const minutes = Math.round(miles * 2.5);
    
    return {
      distance: `${miles.toFixed(1)} mi`,
      distanceValue: miles,
      duration: `${minutes} min`,
      durationValue: minutes
    };
  }
}

// HRSA Health Centers (FREE)
export class HRSAService {
  private static HRSA_API = 'https://data.hrsa.gov/data/api';
  
  static async findHealthCenters(zip: string, radius: number = 25): Promise<any[]> {
    try {
      const response = await axios.get<APIResponse>(`${this.HRSA_API}/v1/FindHealthCenters`, {
        params: {
          Address: zip,
          Radius: radius,
          IncludeNonApprovedSites: false
        },
        timeout: 5000
      });
      
      if (response.data?.results && Array.isArray(response.data.results)) {
        return response.data.results.map((center: any) => ({
          name: center.name || 'Community Health Center',
          address: `${center.address || ''}, ${center.city || ''}, ${center.state || ''} ${center.zip || ''}`.trim(),
          phone: center.phone || '1-877-464-4772',
          website: center.website || 'https://findahealthcenter.hrsa.gov',
          services: center.services || [],
          hours: center.operatingHours || 'Call for hours',
          slidingScale: true,
          type: 'Federally Qualified Health Center'
        }));
      }
    } catch (error) {
      console.error('HRSA API error:', error);
    }
    
    // Return static FQHC info as fallback
    return [{
      name: 'Community Health Center',
      address: 'Contact HRSA for nearest location',
      phone: '1-877-464-4772',
      website: 'https://findahealthcenter.hrsa.gov',
      slidingScale: true,
      type: 'Federally Qualified Health Center',
      note: 'Sliding scale fees based on income'
    }];
  }
}

// RxNorm API (FREE - NIH)
export class RxNormService {
  private static RXNORM_API = 'https://rxnav.nlm.nih.gov/REST';
  
  static async getDrugInfo(drugName: string): Promise<APIResponse> {
    try {
      const response = await axios.get<APIResponse>(`${this.RXNORM_API}/drugs.json`, {
        params: { name: drugName },
        timeout: 3000
      });
      
      if (response.data?.drugGroup) {
        const drugGroup = response.data.drugGroup as APIResponse;
        const conceptGroups = Array.isArray(drugGroup.conceptGroup) ? drugGroup.conceptGroup : [];
        
        for (const group of conceptGroups) {
          if (group.conceptProperties && Array.isArray(group.conceptProperties) && group.conceptProperties.length > 0) {
            const drug = group.conceptProperties[0];
            return {
              rxcui: drug.rxcui || null,
              name: drug.name || drugName,
              synonym: drug.synonym || null,
              tty: drug.tty || null
            };
          }
        }
      }
    } catch (error) {
      console.error('RxNorm API error:', error);
    }
    
    return { 
      name: drugName,
      rxcui: null,
      synonym: null,
      tty: null
    };
  }
  
  static async getDrugInteractions(rxcui: string): Promise<any[]> {
    if (!rxcui) return [];
    
    try {
      const response = await axios.get<APIResponse>(`${this.RXNORM_API}/interaction/interaction.json`, {
        params: { rxcui },
        timeout: 3000
      });
      
      if (response.data?.interactionTypeGroup && Array.isArray(response.data.interactionTypeGroup)) {
        const group = response.data.interactionTypeGroup[0];
        return group?.interactionType || [];
      }
    } catch (error) {
      console.error('RxNorm interaction check error:', error);
    }
    
    return [];
  }
}

// Financial Assistance Service (FREE resources)
export class FinancialAssistanceService {
  static async findPrograms(zip: string, income?: number, householdSize?: number): Promise<APIResponse> {
    const programs = [
      {
        name: 'Healthcare.gov Marketplace',
        description: 'Health insurance marketplace with subsidies based on income',
        eligibility: 'Income between 100-400% of federal poverty level',
        contact: '1-800-318-2596',
        url: 'https://www.healthcare.gov',
        type: 'Insurance',
        estimatedSavings: income && income < 50000 ? 'Up to $500/month' : 'Varies'
      },
      {
        name: 'Medicaid',
        description: 'Free or low-cost health coverage',
        eligibility: 'Income below 138% of federal poverty level in expansion states',
        contact: 'Contact your state Medicaid office',
        url: 'https://www.medicaid.gov',
        type: 'Insurance',
        estimatedSavings: 'Free or minimal cost'
      },
      {
        name: 'HRSA Health Centers',
        description: 'Federally qualified health centers with sliding fee scale',
        eligibility: 'Open to all, fees based on ability to pay',
        contact: '1-877-464-4772',
        url: 'https://findahealthcenter.hrsa.gov',
        type: 'Primary Care',
        estimatedSavings: 'Pay as low as $20-40 per visit'
      },
      {
        name: 'NeedyMeds',
        description: 'Database of patient assistance programs',
        eligibility: 'Varies by program',
        contact: '1-800-503-6897',
        url: 'https://www.needymeds.org',
        type: 'Prescriptions',
        estimatedSavings: 'Up to 100% on medications'
      },
      {
        name: 'RxAssist',
        description: 'Patient assistance program finder',
        eligibility: 'Usually for uninsured or underinsured',
        contact: 'Visit website',
        url: 'https://www.rxassist.org',
        type: 'Prescriptions',
        estimatedSavings: 'Free or reduced cost medications'
      },
      {
        name: 'GoodRx Gold',
        description: 'Prescription discount program',
        eligibility: 'No restrictions',
        contact: 'Visit website',
        url: 'https://www.goodrx.com/gold',
        type: 'Prescriptions',
        estimatedSavings: 'Up to 90% off prescriptions'
      }
    ];
    
    // Filter programs based on income if provided
    if (income && householdSize) {
      const fpl = this.calculateFPL(householdSize);
      const incomePercent = (income / fpl) * 100;
      
      return {
        programs: programs.filter(p => {
          if (p.name === 'Medicaid' && incomePercent > 138) return false;
          if (p.name === 'Healthcare.gov Marketplace' && (incomePercent < 100 || incomePercent > 400)) return false;
          return true;
        }),
        localResources: [
          {
            name: 'Call 211',
            description: 'Local health and human services',
            phone: '211',
            available247: true,
            text: 'Text your ZIP to 898211'
          }
        ],
        eligibilityInfo: {
          fpl,
          incomePercent,
          medicaidEligible: incomePercent <= 138,
          marketplaceEligible: incomePercent >= 100 && incomePercent <= 400
        }
      };
    }
    
    return {
      programs,
      localResources: [
        {
          name: 'Call 211',
          description: 'Local health and human services directory',
          phone: '211',
          available247: true,
          text: 'Text your ZIP to 898211'
        }
      ]
    };
  }
  
  private static calculateFPL(householdSize: number): number {
    // 2024 Federal Poverty Level
    const baseFPL = 15060;
    const perPerson = 5380;
    return baseFPL + (perPerson * (householdSize - 1));
  }
}

// Symptom Triage Service (Rule-based, no API needed)
export class SymptomTriageService {
  static async analyzeSymptom(symptom: string): Promise<APIResponse> {
    const symptomLower = symptom.toLowerCase();
    
    // Emergency symptoms
    const emergencyKeywords = [
      'chest pain', 'difficulty breathing', 'severe bleeding', 
      'unconscious', 'stroke', 'heart attack', 'severe pain',
      'can\'t breathe', 'choking', 'severe allergic', 'suicidal'
    ];
    
    // Urgent symptoms
    const urgentKeywords = [
      'high fever', 'infection', 'broken', 'fracture', 
      'severe headache', 'abdominal pain', 'cut', 'burn',
      'vomiting blood', 'dehydration', 'sprain', 'concussion'
    ];
    
    const hasEmergency = emergencyKeywords.some(keyword => symptomLower.includes(keyword));
    const hasUrgent = urgentKeywords.some(keyword => symptomLower.includes(keyword));
    
    let urgency = 'routine';
    let recommendedCare = 'Primary Care';
    let cptCodes = [{ code: '99213', description: 'Office visit', probability: 0.8 }];
    
    if (hasEmergency) {
      urgency = 'emergency';
      recommendedCare = 'Emergency Room';
      cptCodes = [
        { code: '99284', description: 'ER visit high complexity', probability: 0.9 },
        { code: '93010', description: 'EKG', probability: 0.7 }
      ];
    } else if (hasUrgent) {
      urgency = 'urgent';
      recommendedCare = 'Urgent Care';
      cptCodes = [
        { code: '99213', description: 'Urgent care visit', probability: 0.9 }
      ];
    }
    
    // Add specific tests based on symptoms
    if (symptomLower.includes('flu') || symptomLower.includes('fever')) {
      cptCodes.push({ code: '87804', description: 'Flu test', probability: 0.8 });
    }
    if (symptomLower.includes('strep') || symptomLower.includes('throat')) {
      cptCodes.push({ code: '87880', description: 'Strep test', probability: 0.7 });
    }
    if (symptomLower.includes('covid') || symptomLower.includes('coronavirus')) {
      cptCodes.push({ code: '87635', description: 'COVID test', probability: 0.9 });
    }
    if (symptomLower.includes('ankle') || symptomLower.includes('wrist') || symptomLower.includes('fracture')) {
      cptCodes.push({ code: '73610', description: 'X-ray', probability: 0.8 });
    }
    if (symptomLower.includes('chest') && !hasEmergency) {
      cptCodes.push({ code: '71045', description: 'Chest X-ray', probability: 0.7 });
    }
    if (symptomLower.includes('diabetes') || symptomLower.includes('blood sugar')) {
      cptCodes.push({ code: '83036', description: 'A1C test', probability: 0.8 });
    }
    
    return {
      urgency,
      careSettings: [recommendedCare],
      cptCodes,
      reasoning: `Based on symptoms: ${symptom}`,
      redFlags: hasEmergency ? ['Seek immediate medical attention'] : [],
      estimatedDuration: hasEmergency ? 'Immediate' : hasUrgent ? '1-2 days' : '3-7 days'
    };
  }
}

// Mock services that need to be available for imports
export const GoodRxService = {
  async getDrugPrices(drugName: string, quantity: number = 30): Promise<DrugPrice> {
    const med = await MedicationService.getMedicationsForSymptom(drugName);
    const medInfo = med[0] || { retailPrice: 50, discountPrice: 15 };
    
    return {
      drugName,
      quantity,
      dosage: medInfo.dosage,
      retailPrice: medInfo.retailPrice || 50,
      discountPrice: medInfo.discountPrice || 15,
      savings: Math.round((1 - (medInfo.discountPrice || 15) / (medInfo.retailPrice || 50)) * 100),
      pharmacy: 'Local Pharmacy',
      couponUrl: 'https://www.singlecare.com'
    };
  },
  getMockPrices(drugName: string, quantity: number): DrugPrice {
    return {
      drugName,
      quantity,
      dosage: 'Standard',
      retailPrice: 50,
      discountPrice: 15,
      savings: 70,
      pharmacy: 'Local Pharmacy',
      couponUrl: undefined
    };
  }
};

export const EligibilityService = {
  verifyEligibility: async () => ({ 
    eligible: true,
    deductible: { individual: { total: 2000, met: 500, remaining: 1500 } }
  })
};

export const MapsService = {
  getDistance: DistanceService.calculateDistance.bind(DistanceService)
};

export const PriorAuthService = {
  checkPriorAuth: async (drugName: string) => ({ 
    required: ['humira', 'enbrel', 'ozempic'].includes(drugName.toLowerCase()),
    alternatives: []
  })
};

export const NetworkStatusService = {
  checkInNetwork: async () => ({ inNetwork: true, tier: 'Tier 1' })
};

// Export all types
export type {
  DrugPrice,
  DistanceResult,
  CMSPrice,
  MedicationInfo
};