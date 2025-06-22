// lib/types/healthcare.ts
// Define all the interfaces to fix TypeScript errors

export interface Location {
  city: string;
  state: string;
  zip?: string;
  lat?: number;
  lng?: number;
}

export interface InsuranceInfo {
  payerId?: string;
  planId?: string;
  memberId?: string;
  groupNumber?: string;
}

export interface Medication {
  name: string;
  dosage: string;
  quantity: number;
  purpose: string;
  retailPrice?: number;
  goodRxPrice?: number;
  savings?: number;
  pharmacy?: string;
  couponUrl?: string;
  priorAuth?: boolean;
}

export interface Provider {
  // Basic info
  name: string;
  type: string;
  address: string;
  phone?: string;
  npi?: string;
  
  // Location
  distance?: number;
  driveTime?: number;
  city?: string;
  state?: string;
  zip?: string;
  
  // Cost info
  totalCost?: number;
  estimatedPatientCost?: number;
  insurancePays?: number;
  negotiatedRate?: number;
  costNote?: string;
  
  // Additional info
  waitTime?: string;
  hours?: string;
  acceptsWalkIns?: boolean;
  hasPharmacy?: boolean;
  specialty?: string;
  networkStatus?: string;
  dataSource?: string;
  
  // Breakdown info
  costBreakdown?: any;
  bundleName?: string;
  medications?: Medication[];
  potentialSavings?: number;
}

export interface CareFinderRequest {
  action: 'FIND_CARE' | 'GET_ASSISTANCE' | 'CHECK_DRUG';
  symptom?: string;
  location?: Location;
  insuranceInfo?: InsuranceInfo;
  providers?: Provider[];
  medications?: Medication[];
}

export interface CareFinderResponse {
  success: boolean;
  providers?: Provider[];
  summary?: {
    lowestCost: number;
    averageCost: number;
    cmsPricesUsed: number;
    medicationsIncluded: number;
    dataTimestamp: string;
  };
  resources?: any[];
  error?: string;
}