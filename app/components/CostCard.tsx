'use client';

interface Props {
  title: string;
  cost: { min: number; max: number; avg: number };
  insurance: string;
}

export default function CostCard({ title, cost, insurance }: Props) {
  return (
    <div className="border rounded-xl p-4 bg-white shadow-md">
      <h3 className="font-semibold text-lg mb-2">{title}</h3>
      <p><strong>Insurance:</strong> {insurance}</p>
      <p><strong>Estimated Cost:</strong> ${cost.min} – ${cost.max}</p>
      <p className="text-gray-500 text-sm">Avg: ${cost.avg}</p>
    </div>
  );
}
