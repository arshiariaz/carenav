'use client';
import dynamic from 'next/dynamic';

// Dynamically import to avoid SSR issues with the complex UI
const CareNavComplete = dynamic(() => import('./components/CareNavComplete'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
    </div>
  )
});

export default function Home() {
  return <CareNavComplete />;
}