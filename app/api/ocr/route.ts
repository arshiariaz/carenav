// app/api/ocr-mock/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    console.log('🎭 Using mock OCR to save Mindee credits');
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock insurance card data
    const mockExtracted = {
      companyName: 'Anthem',
      memberName: 'Test User',
      memberId: 'ANT123456789',
      groupNumber: '174227M3A1',
      payerId: 'ANTHEM',
      rxBin: '610014',
      rxGrp: 'MYGROUP',
      rxPcn: 'CN',
      copays: [
        { service_name: 'primary_care', service_fees: 30 },
        { service_name: 'specialist', service_fees: 60 },
        { service_name: 'urgent_care', service_fees: 75 },
        { service_name: 'emergency_room', service_fees: 350 }
      ],
      confidence: 0.95
    };
    
    console.log('🎭 Mock OCR extracted:', mockExtracted.companyName);

    // Try to match with a plan
    try {
      const planMatch = await fetch(`${req.nextUrl.origin}/api/match-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: mockExtracted.companyName,
          groupNumber: mockExtracted.groupNumber,
          payerId: mockExtracted.payerId
        })
      });

      if (planMatch.ok) {
        const planData = await planMatch.json();
        return NextResponse.json({ 
          success: true, 
          extracted: mockExtracted,
          matchedPlan: planData.plan || null
        });
      }
    } catch (error) {
      console.error('Plan matching error:', error);
    }

    return NextResponse.json({
      success: true,
      extracted: mockExtracted
    });

  } catch (error: any) {
    console.error('Mock OCR Error:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Mock OCR failed',
      extracted: {
        companyName: 'Anthem',
        memberName: 'Test User',
        memberId: 'ANT123456789',
        groupNumber: '174227M3A1',
        payerId: 'ANTHEM'
      }
    });
  }
}