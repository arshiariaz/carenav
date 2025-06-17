import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import * as mindee from 'mindee';

const mindeeClient = new mindee.Client({ apiKey: process.env.MINDEE_API_KEY! });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer for Mindee
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const inputSource = mindeeClient.docFromBuffer(buffer, file.name);

    // REAL MINDEE API CALL
    const apiResponse = await mindeeClient.parse(
      mindee.document.InsuranceCardV1,
      inputSource
    );

    const result = apiResponse.document;
    
    // Extract real data
    const extracted = {
      companyName: result.inference.prediction.company?.value || 'Unknown',
      memberName: result.inference.prediction.memberName?.value || '',
      memberId: result.inference.prediction.memberId?.value || '',
      groupNumber: result.inference.prediction.groupNumber?.value || '',
      payerId: result.inference.prediction.payerId?.value || '',
      copays: result.inference.prediction.copays || [],
      confidence: result.inference.pages[0]?.prediction?.company?.confidence || 0
    };

    // BigQuery Logging (keep your existing code)
    try {
      const bigquery = new BigQuery({
        projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID,
      });

      const row = {
        timestamp: new Date().toISOString(),
        insurance: extracted.companyName,
        member_id: extracted.memberId,
        group: extracted.groupNumber,
        confidence: extracted.confidence,
      };

      await bigquery
        .dataset('insurance_rates')
        .table('ocr_logs')
        .insert(row);
    } catch (err) {
      console.error('BigQuery insert error:', err);
    }

    // Match insurance plan with Pinecone
    const planMatch = await fetch(`${req.nextUrl.origin}/api/match-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyName: extracted.companyName,
        groupNumber: extracted.groupNumber,
        payerId: extracted.payerId
      })
    });

    const planData = await planMatch.json();

    return NextResponse.json({ 
      success: true, 
      extracted,
      matchedPlan: planData.plan || null
    });

  } catch (error: any) {
    console.error('Error:', error);
    
    // Fallback to mock if Mindee fails
    const mockExtracted = {
      companyName: 'Blue Cross Blue Shield',
      memberName: 'Test User',
      memberId: 'ABC123456789',
      groupNumber: 'GRP-001',
      payerId: 'BCBS',
      copays: [],
      confidence: 0.95
    };

    return NextResponse.json({ 
      success: false,
      error: 'OCR processing failed, using mock data',
      extracted: mockExtracted 
    });
  }
}