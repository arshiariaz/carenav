// app/api/ocr/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

// Mock data for different insurance cards
const MOCK_INSURANCE_CARDS = [
  {
    companyName: 'Anthem',
    memberName: 'John Smith',
    memberId: 'ANT123456789',
    groupNumber: 'GRP174227M3A1',
    payerId: 'ANTHEM',
    rxBin: '610014',
    rxGrp: 'ACMEGRP',
    rxPcn: 'CN',
    copays: [
      { service_name: 'primary_care', service_fees: 30 },
      { service_name: 'specialist', service_fees: 60 },
      { service_name: 'urgent_care', service_fees: 75 },
      { service_name: 'emergency_room', service_fees: 350 }
    ],
    confidence: 0.95
  },
  {
    companyName: 'Blue Cross Blue Shield',
    memberName: 'Jane Doe',
    memberId: 'BCBS987654321',
    groupNumber: 'BCBSTX2024S',
    payerId: 'BCBSTX',
    rxBin: '003858',
    rxGrp: 'ASPROD1',
    rxPcn: 'A4',
    copays: [
      { service_name: 'primary_care', service_fees: 25 },
      { service_name: 'specialist', service_fees: 50 },
      { service_name: 'urgent_care', service_fees: 65 },
      { service_name: 'emergency_room', service_fees: 300 }
    ],
    confidence: 0.92
  },
  {
    companyName: 'UnitedHealthcare',
    memberName: 'Robert Johnson',
    memberId: 'UHC456789123',
    groupNumber: 'UHC900125',
    payerId: 'UHC',
    rxBin: '610279',
    rxGrp: 'UHCGRP',
    rxPcn: 'UNITED',
    copays: [
      { service_name: 'primary_care', service_fees: 35 },
      { service_name: 'specialist', service_fees: 70 },
      { service_name: 'urgent_care', service_fees: 85 },
      { service_name: 'emergency_room', service_fees: 400 }
    ],
    confidence: 0.89
  },
  {
    companyName: 'Aetna',
    memberName: 'Sarah Williams',
    memberId: 'AET789456123',
    groupNumber: 'AET2024PPO',
    payerId: 'AETNA',
    rxBin: '610455',
    rxGrp: 'AETGRP',
    rxPcn: 'AETNA',
    copays: [
      { service_name: 'primary_care', service_fees: 30 },
      { service_name: 'specialist', service_fees: 60 },
      { service_name: 'urgent_care', service_fees: 75 },
      { service_name: 'emergency_room', service_fees: 350 }
    ],
    confidence: 0.93
  }
];

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log('🎭 Using mock OCR to save Mindee credits');
    console.log(`File received: ${file.name} (${file.size} bytes)`);

    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Randomly select a mock insurance card
    const randomIndex = Math.floor(Math.random() * MOCK_INSURANCE_CARDS.length);
    const mockCard = MOCK_INSURANCE_CARDS[randomIndex];
    
    // Add some randomization to make it more realistic
    const extracted = {
      ...mockCard,
      memberName: mockCard.memberName || 'Test User',
      confidence: mockCard.confidence + (Math.random() * 0.05 - 0.025) // ±2.5% variance
    };

    console.log('🎭 Mock OCR extracted:', {
      company: extracted.companyName,
      memberId: extracted.memberId.substring(0, 6) + '***'
    });

    // Only log to BigQuery if enabled
    if (process.env.ENABLE_BIGQUERY_LOGGING === 'true') {
      try {
        const bigquery = new BigQuery({
          projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID,
          keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json') 
            ? process.env.GOOGLE_APPLICATION_CREDENTIALS 
            : undefined,
          credentials: !process.env.GOOGLE_APPLICATION_CREDENTIALS?.endsWith('.json')
            ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS || '{}')
            : undefined
        });

        await bigquery
          .dataset('insurance_rates')
          .table('ocr_logs')
          .insert({
            timestamp: new Date().toISOString(),
            insurance: extracted.companyName,
            member_id: extracted.memberId,
            group: extracted.groupNumber,
            confidence: extracted.confidence,
            is_mock: true // Flag this as mock data
          });

        console.log('✅ Mock data logged to BigQuery');
      } catch (err) {
        console.error('BigQuery insert error:', err);
      }
    }

    // Match insurance plan
    try {
      const planMatch = await fetch(`${req.nextUrl.origin}/api/match-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: extracted.companyName,
          groupNumber: extracted.groupNumber,
          payerId: extracted.payerId
        })
      });

      if (planMatch.ok) {
        const planData = await planMatch.json();
        
        if (planData.success) {
          console.log(`🎯 Plan matched: ${planData.plan.name} (${Math.round(planData.confidence * 100)}% confidence)`);
        }
        
        return NextResponse.json({ 
          success: true, 
          extracted,
          matchedPlan: planData.plan || null,
          matchConfidence: planData.confidence,
          matchType: planData.matchType || 'mock',
          isMockData: true // Flag to indicate this is mock data
        });
      }
    } catch (error) {
      console.error('Plan matching error:', error);
    }

    return NextResponse.json({ 
      success: true, 
      extracted,
      isMockData: true
    });

  } catch (error: any) {
    console.error('Mock OCR Error:', error.message);

    // Return a default mock card even on error
    const fallbackCard = MOCK_INSURANCE_CARDS[0];
    
    return NextResponse.json({
      success: false,
      error: 'Processing error, using fallback mock data',
      extracted: fallbackCard,
      isMockData: true
    });
  }
}

/* 
// ORIGINAL MINDEE CODE - PRESERVED FOR FUTURE USE
// Uncomment this and comment out the mock version above to use real OCR

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    console.log('Starting async OCR process...');

    // Convert file to base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64File = buffer.toString('base64');

    // Step 1: Submit document for async processing
    const submitResponse = await fetch(
      'https://api.mindee.net/v1/products/mindee/us_healthcare_cards/v1/predict_async',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.MINDEE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document: `data:${file.type};base64,${base64File}`,
        }),
      }
    );

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      console.error('Mindee submit error:', errorText);
      throw new Error(`Failed to submit document: ${submitResponse.status}`);
    }

    const submitData = await submitResponse.json();
    const jobId = submitData.job?.id;
    
    if (!jobId) {
      console.error('Submit response:', submitData);
      throw new Error('No job ID received from Mindee');
    }

    console.log('Document submitted, job ID:', jobId);

    // Step 2: Poll for results
    let attempts = 0;
    const maxAttempts = 60;
    let result = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusResponse = await fetch(
        `https://api.mindee.net/v1/products/mindee/us_healthcare_cards/v1/documents/queue/${jobId}`,
        {
          headers: {
            'Authorization': `Token ${process.env.MINDEE_API_KEY}`,
          },
        }
      );

      if (!statusResponse.ok) {
        console.error(`Status check failed: ${statusResponse.status}`);
        attempts++;
        continue;
      }

      const statusData = await statusResponse.json();
      console.log(`Poll ${attempts + 1}: Job status = ${statusData.job?.status}`);
      
      if (statusData.job?.status === 'completed') {
        result = statusData;
        console.log('OCR completed successfully!');
        break;
      } else if (statusData.job?.status === 'failed') {
        console.error('Job failed:', statusData.job?.error);
        throw new Error(`OCR job failed: ${statusData.job?.error?.message || 'Unknown error'}`);
      }
      
      attempts++;
    }

    if (!result) {
      console.error('Timeout after', attempts, 'attempts');
      throw new Error('OCR processing timed out - please try again');
    }

    const prediction = result.document?.inference?.prediction || 
                      result.document?.prediction || 
                      {};
    
    const extracted = {
      companyName: prediction.company_name?.value || 'Unknown',
      memberName: prediction.member_name?.value || '',
      memberId: prediction.member_id?.value || '',
      groupNumber: prediction.group_number?.value || '',
      payerId: prediction.payer_id?.value || '',
      rxBin: prediction.rx_bin?.value || '',
      rxGrp: prediction.rx_grp?.value || '',
      rxPcn: prediction.rx_pcn?.value || '',
      copays: prediction.copays || [],
      confidence: prediction.company_name?.confidence || 0,
    };

    // Rest of the original code...
  } catch (error: any) {
    // Original error handling...
  }
}
*/