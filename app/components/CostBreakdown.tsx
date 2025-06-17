// components/CostBreakdown.tsx
'use client';

interface Props {
  provider: any;
  isExpanded: boolean;
  onToggle: () => void;
}

export default function CostBreakdown({ provider, isExpanded, onToggle }: Props) {
  if (!provider.costBreakdown) return null;
  
  return (
    <div className="mt-3">
      <button
        onClick={onToggle}
        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
      >
        {isExpanded ? '▼' : '▶'} See cost breakdown
      </button>
      
      {isExpanded && (
        <div className="mt-3 p-4 bg-gray-50 rounded-lg text-sm">
          <div className="font-semibold mb-3 text-gray-900">
            {provider.bundleName}
          </div>
          
          {provider.costBreakdown.map((category: any, idx: number) => (
            <div key={idx} className="mb-3">
              <div className="font-medium text-gray-700 mb-1">
                {category.category}
              </div>
              {category.items.map((item: any, itemIdx: number) => (
                <div key={itemIdx} className="flex justify-between py-1 text-gray-600">
                  <span className="flex-1 pr-2">{item.description}</span>
                  <span className="text-gray-500">${item.cost}</span>
                  <span className="font-medium text-gray-900 ml-4 min-w-[60px] text-right">
                    ${item.patientPays}
                  </span>
                </div>
              ))}
            </div>
          ))}
          
          <div className="border-t pt-2 mt-3">
            <div className="flex justify-between font-semibold">
              <span>Total Cost:</span>
              <span>${provider.totalCost}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Insurance Pays:</span>
              <span>-${provider.insurancePays}</span>
            </div>
            <div className="flex justify-between font-bold text-lg mt-1">
              <span>You Pay:</span>
              <span>${provider.estimatedPatientCost}</span>
            </div>
          </div>
          
          {provider.hasPharmacy && (
            <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-800">
              💊 On-site pharmacy available for immediate prescription filling
            </div>
          )}
        </div>
      )}
    </div>
  );
}