// app/api/test-providers/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Simple test to verify API routes are working
  const mockProviders = [
    {
      name: 'Test Urgent Care Center',
      type: 'Urgent Care',
      address: '123 Test St, Houston, TX 77001',
      phone: '(555) 123-4567',
      npi: 'TEST123',
      distance: 2.5,
      driveTime: 10,
      estimatedPatientCost: 125,
      totalCost: 200,
      insurancePays: 75
    },
    {
      name: 'Test Medical Center ER',
      type: 'Emergency Room',
      address: '456 Hospital Blvd, Houston, TX 77002',
      phone: '(555) 987-6543',
      npi: 'TEST456',
      distance: 5.0,
      driveTime: 15,
      estimatedPatientCost: 350,
      totalCost: 1500,
      insurancePays: 1150
    }
  ];

  return NextResponse.json({
    success: true,
    providers: mockProviders,
    stats: {
      min: 125,
      max: 350,
      avg: 237,
      count: 2
    },
    message: 'Test endpoint working correctly'
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log('Test endpoint received:', body);
    
    // Call the actual provider search
    const response = await fetch(`${request.nextUrl.origin}/api/provider-costs-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    return NextResponse.json({
      ...data,
      debugInfo: {
        originalRequest: body,
        apiCalled: '/api/provider-costs-local',
        responseStatus: response.status,
        providerCount: data.providers?.length || 0
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      providers: []
    });
  }
}