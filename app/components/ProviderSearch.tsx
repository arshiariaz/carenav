'use client';

import { useState } from 'react';

interface Provider {
  id: string;
  name: string;
  type: 'urgent_care' | 'er' | 'primary';
  address: string;
  phone: string;
  distance: number;
  estimatedWait: string;
  acceptsInsurance: string[];
  costEstimate: {
    min: number;
    max: number;
  };
}

const MOCK_PROVIDERS: Provider[] = [
  {
    id: '1',
    name: 'CityMD Urgent Care',
    type: 'urgent_care',
    address: '123 Main St, New York, NY',
    phone: '(212) 555-0100',
    distance: 0.5,
    estimatedWait: '30 min',
    acceptsInsurance: ['Blue Cross', 'Aetna', 'UnitedHealth'],
    costEstimate: { min: 75, max: 200 }
  },
  {
    id: '2',
    name: 'CVS MinuteClinic',
    type: 'urgent_care',
    address: '456 Park Ave, New York, NY',
    phone: '(212) 555-0200',
    distance: 1.2,
    estimatedWait: '45 min',
    acceptsInsurance: ['Blue Cross', 'Cigna', 'Humana'],
    costEstimate: { min: 65, max: 150 }
  },
  {
    id: '3',
    name: 'Mount Sinai Emergency Room',
    type: 'er',
    address: '789 Hospital Way, New York, NY',
    phone: '(212) 555-0300',
    distance: 2.3,
    estimatedWait: '3-5 hours',
    acceptsInsurance: ['All major insurance'],
    costEstimate: { min: 500, max: 3000 }
  }
];

interface Props {
  insuranceCompany?: string;
}

export default function ProviderSearch({ insuranceCompany }: Props) {
  const [selectedType, setSelectedType] = useState<string>('all');

  const filteredProviders = MOCK_PROVIDERS.filter(provider => {
    if (selectedType !== 'all' && provider.type !== selectedType) {
      return false;
    }
    if (insuranceCompany && !provider.acceptsInsurance.some(ins =>
      ins.toLowerCase().includes(insuranceCompany.toLowerCase())
    )) {
      return false;
    }
    return true;
  });

  return (
    <div className="mt-8">
      <h2 className="text-2xl font-bold mb-4">Find Care Near You</h2>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSelectedType('all')}
          className={`px-4 py-2 rounded ${selectedType === 'all' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          All
        </button>
        <button
          onClick={() => setSelectedType('urgent_care')}
          className={`px-4 py-2 rounded ${selectedType === 'urgent_care' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          Urgent Care
        </button>
        <button
          onClick={() => setSelectedType('er')}
          className={`px-4 py-2 rounded ${selectedType === 'er' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
        >
          Emergency Room
        </button>
      </div>

      <div className="space-y-4">
        {filteredProviders.map(provider => (
          <div key={provider.id} className="border rounded-lg p-6 hover:shadow-lg transition-shadow">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-xl font-semibold">{provider.name}</h3>
                <p className="text-gray-600">{provider.address}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {provider.distance} miles • Wait: {provider.estimatedWait}
                </p>
                {insuranceCompany && provider.acceptsInsurance.some(ins =>
                  ins.toLowerCase().includes(insuranceCompany.toLowerCase())
                ) && (
                  <p className="text-green-600 text-sm mt-2">
                    ✓ Accepts your insurance
                  </p>
                )}
              </div>

              <div className="text-right">
                <p className="text-2xl font-bold">
                  ${provider.costEstimate.min}-${provider.costEstimate.max}
                </p>
                <p className="text-sm text-gray-500">Estimated cost</p>
              </div>
            </div>

            <div className="mt-4 flex gap-3">
              <a
                href={`tel:${provider.phone}`}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              >
                Call Now
              </a>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(provider.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border border-blue-500 text-blue-500 px-4 py-2 rounded hover:bg-blue-50"
              >
                Get Directions
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
