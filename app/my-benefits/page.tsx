// app/my-benefits/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface PlanData {
  carrier: string;
  plan_name: string;
  plan_type: string;
  deductible_individual: number;
  deductible_family: number;
  oop_max_individual: number;
  oop_max_family: number;
  coinsurance: number;
  copays: {
    primaryCare?: number;
    specialist?: number;
    urgentCare?: number;
    emergency?: number;
    generic?: number;
  };
  features?: {
    referralRequired?: boolean;
    outOfNetworkCovered?: boolean;
    groupNumber?: string;
    payerId?: string;
  };
}

export default function MyBenefitsPage() {
  const searchParams = useSearchParams();
  const planId = searchParams.get('planId');
  const carrier = searchParams.get('carrier');
  
  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (planId || carrier) {
      fetchPlanData();
    } else {
      setLoading(false);
    }
  }, [planId, carrier]);

  const fetchPlanData = async () => {
    try {
      // First try to fetch real plan data from the match-plan API
      if (planId) {
        const response = await fetch('/api/match-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyName: carrier,
            planId: planId
          })
        });
        
        const data = await response.json();
        if (data.success && data.plan) {
          setPlanData(data.plan);
          setLoading(false);
          return;
        }
      }
      
      // If no real data, use carrier-specific templates
      setPlanData(getCarrierPlanTemplate(carrier || 'Unknown', planId));
    } catch (error) {
      console.error('Failed to fetch plan data:', error);
      setPlanData(getCarrierPlanTemplate(carrier || 'Unknown', planId));
    } finally {
      setLoading(false);
    }
  };

  // Get realistic plan templates based on carrier
  const getCarrierPlanTemplate = (carrierName: string, planId?: string | null): PlanData => {
    const isHSA = planId?.toLowerCase().includes('hsa');
    const carrier = carrierName.toLowerCase();
    
    // Carrier-specific realistic templates
    if (carrier.includes('anthem')) {
      return {
        carrier: 'Anthem',
        plan_name: isHSA ? 'Anthem HSA Plan' : 'Anthem PPO',
        plan_type: isHSA ? 'HDHP' : 'PPO',
        deductible_individual: isHSA ? 2800 : 1500,
        deductible_family: isHSA ? 5600 : 3000,
        oop_max_individual: isHSA ? 5600 : 7500,
        oop_max_family: isHSA ? 11200 : 15000,
        coinsurance: 20,
        copays: {
          primaryCare: isHSA ? undefined : 30,
          specialist: isHSA ? undefined : 60,
          urgentCare: isHSA ? undefined : 75,
          emergency: isHSA ? undefined : 350,
          generic: 10
        },
        features: {
          referralRequired: false,
          outOfNetworkCovered: true
        }
      };
    } else if (carrier.includes('blue cross') || carrier.includes('bcbs')) {
      return {
        carrier: 'Blue Cross Blue Shield',
        plan_name: 'BCBS PPO Blue',
        plan_type: 'PPO',
        deductible_individual: 2000,
        deductible_family: 4000,
        oop_max_individual: 6500,
        oop_max_family: 13000,
        coinsurance: 20,
        copays: {
          primaryCare: 25,
          specialist: 50,
          urgentCare: 65,
          emergency: 300,
          generic: 5
        },
        features: {
          referralRequired: false,
          outOfNetworkCovered: true
        }
      };
    } else if (carrier.includes('united') || carrier.includes('uhc')) {
      return {
        carrier: 'UnitedHealthcare',
        plan_name: 'UHC Choice Plus',
        plan_type: 'PPO',
        deductible_individual: 1750,
        deductible_family: 3500,
        oop_max_individual: 7000,
        oop_max_family: 14000,
        coinsurance: 30,
        copays: {
          primaryCare: 35,
          specialist: 70,
          urgentCare: 85,
          emergency: 400,
          generic: 15
        },
        features: {
          referralRequired: false,
          outOfNetworkCovered: true
        }
      };
    } else if (carrier.includes('aetna')) {
      return {
        carrier: 'Aetna',
        plan_name: 'Aetna Open Choice',
        plan_type: 'PPO',
        deductible_individual: 2500,
        deductible_family: 5000,
        oop_max_individual: 6000,
        oop_max_family: 12000,
        coinsurance: 25,
        copays: {
          primaryCare: 30,
          specialist: 60,
          urgentCare: 75,
          emergency: 350,
          generic: 10
        },
        features: {
          referralRequired: false,
          outOfNetworkCovered: true
        }
      };
    }
    
    // Default template
    return {
      carrier: carrierName,
      plan_name: 'Standard PPO Plan',
      plan_type: 'PPO',
      deductible_individual: 3000,
      deductible_family: 6000,
      oop_max_individual: 7000,
      oop_max_family: 14000,
      coinsurance: 20,
      copays: {
        primaryCare: 35,
        specialist: 70,
        urgentCare: 75,
        emergency: 350,
        generic: 15
      },
      features: {
        referralRequired: false,
        outOfNetworkCovered: true
      }
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!planData) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <div className="border rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">No Plan Data Available</h2>
          <p className="text-gray-600 mb-4">Upload your insurance card to see your benefits.</p>
          <Link href="/" className="text-blue-500 hover:text-blue-600">
            ← Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const isHSA = planData?.plan_type === 'HDHP' || planData?.plan_name?.toLowerCase().includes('hsa') || false;

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <Link href="/" className="text-blue-500 hover:text-blue-600 flex items-center gap-2">
          <span>←</span> Back to Cost Estimator
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-8">My Benefits Summary</h1>
      
      {/* Plan Header */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-xl font-semibold mb-2">{planData.carrier}</h2>
            <p className="text-lg text-gray-700">{planData.plan_name}</p>
            <p className="text-sm text-gray-600">{planData.plan_type}</p>
          </div>
          {isHSA && (
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
              HSA Eligible
            </span>
          )}
        </div>
      </div>

      {/* Key Numbers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Annual Deductible</h3>
          <p className="text-2xl font-bold text-gray-900">${planData.deductible_individual?.toLocaleString() || 0}</p>
          <p className="text-sm text-gray-500">Individual</p>
          {planData.deductible_family && (
            <p className="text-sm text-gray-500 mt-1">${planData.deductible_family.toLocaleString()} Family</p>
          )}
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Out-of-Pocket Max</h3>
          <p className="text-2xl font-bold text-gray-900">${planData.oop_max_individual?.toLocaleString() || 0}</p>
          <p className="text-sm text-gray-500">Individual</p>
          {planData.oop_max_family && (
            <p className="text-sm text-gray-500 mt-1">${planData.oop_max_family.toLocaleString()} Family</p>
          )}
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Coinsurance</h3>
          <p className="text-2xl font-bold text-gray-900">{planData.coinsurance || 20}%</p>
          <p className="text-sm text-gray-500">After deductible</p>
        </div>

        <div className="bg-white border rounded-lg p-6 shadow-sm">
          <h3 className="text-sm font-medium text-gray-600 mb-2">Plan Type</h3>
          <p className="text-xl font-bold text-gray-900">{planData.plan_type}</p>
          {planData.features?.referralRequired && (
            <p className="text-sm text-orange-600 mt-1">Referrals required</p>
          )}
        </div>
      </div>

      {/* Common Services */}
      <div className="space-y-6">
        <h2 className="text-2xl font-semibold mb-4">What You Pay for Common Services</h2>
        
        {/* Office Visits */}
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="bg-blue-50 px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">🏥 Doctor Visits</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ServiceItem
                service="Primary Care Visit"
                cost={planData.copays?.primaryCare}
                deductible={!planData.copays?.primaryCare}
                coinsurance={planData.coinsurance}
                note="Annual physical covered 100%"
              />
              <ServiceItem
                service="Specialist Visit"
                cost={planData.copays?.specialist}
                deductible={!planData.copays?.specialist}
                coinsurance={planData.coinsurance}
                note={planData.features?.referralRequired ? "Referral required" : "No referral needed"}
              />
              <ServiceItem
                service="Virtual Visit"
                cost={planData.copays?.primaryCare ? Math.round(planData.copays.primaryCare * 0.7) : undefined}
                deductible={!planData.copays?.primaryCare}
                coinsurance={planData.coinsurance}
                note="24/7 availability"
              />
            </div>
          </div>
        </div>

        {/* Emergency Care */}
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="bg-red-50 px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">🚨 Emergency & Urgent Care</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ServiceItem
                service="Emergency Room"
                cost={planData.copays?.emergency}
                deductible={!planData.copays?.emergency}
                coinsurance={planData.coinsurance}
                note="Copay waived if admitted"
                highlight
              />
              <ServiceItem
                service="Urgent Care"
                cost={planData.copays?.urgentCare}
                deductible={!planData.copays?.urgentCare}
                coinsurance={planData.coinsurance}
                note="No appointment needed"
              />
            </div>
          </div>
        </div>

        {/* Lab & Imaging */}
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="bg-purple-50 px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">🔬 Tests & Imaging</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <ServiceItem
                service="Lab Tests"
                deductible={true}
                coinsurance={planData.coinsurance}
                note="Blood work, cultures"
              />
              <ServiceItem
                service="X-rays"
                deductible={true}
                coinsurance={planData.coinsurance}
                note="Basic imaging"
              />
              <ServiceItem
                service="MRI/CT Scan"
                deductible={true}
                coinsurance={planData.coinsurance}
                note="Prior auth may be required"
              />
            </div>
          </div>
        </div>

        {/* Prescription Drugs */}
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
          <div className="bg-green-50 px-6 py-4 border-b">
            <h3 className="text-lg font-semibold">💊 Prescription Drugs</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <ServiceItem
                service="Generic"
                cost={planData.copays?.generic || 10}
                note="30-day supply"
              />
              <ServiceItem
                service="Preferred Brand"
                cost={40}
                note="Formulary drugs"
              />
              <ServiceItem
                service="Non-Preferred"
                cost={80}
                note="Or 40% coinsurance"
              />
              <ServiceItem
                service="Specialty"
                coinsurance={40}
                note="Prior auth required"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Important Notes */}
      <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
        <h3 className="font-semibold text-amber-900 mb-2">Important Information</h3>
        <ul className="text-sm text-amber-800 space-y-1">
          <li>• This is a summary based on typical {planData.carrier} plans. Your specific benefits may vary.</li>
          <li>• Always verify coverage with your insurance company before receiving care.</li>
          <li>• Costs shown are for in-network providers only.</li>
          {isHSA && <li>• With an HSA plan, you pay the full negotiated rate until you meet your deductible.</li>}
          <li>• Preventive care services are covered at 100% with no deductible.</li>
        </ul>
      </div>
    </div>
  );
}

// Helper component for service items
function ServiceItem({ 
  service, 
  cost, 
  deductible = false, 
  coinsurance, 
  note,
  highlight = false 
}: {
  service: string;
  cost?: number;
  deductible?: boolean;
  coinsurance?: number;
  note?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`${highlight ? 'border-l-4 border-red-500 pl-4' : ''}`}>
      <p className="font-medium text-gray-900">{service}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">
        {cost !== undefined ? `$${cost}` : deductible ? `${coinsurance || 20}%` : 'Covered'}
      </p>
      {deductible && <p className="text-sm text-gray-600">After deductible</p>}
      {note && <p className="text-sm text-gray-500 mt-1">{note}</p>}
    </div>
  );
}