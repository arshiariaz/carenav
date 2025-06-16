import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Mock data for testing (since we don't have Mindee API key yet)
    const mockExtracted = {
      companyName: 'Blue Cross Blue Shield',
      memberName: 'Test User',
      memberId: 'ABC123456789',
      groupNumber: 'GRP-001',
      payerId: 'BCBS',
      copays: [],
      confidence: 0.95
    };

    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ✅ BigQuery Logging
    try {
      const bigquery = new BigQuery({
        projectId: process.env.NEXT_PUBLIC_GCP_PROJECT_ID,
      });

      const row = {
        timestamp: new Date().toISOString(),
        insurance: mockExtracted.companyName,
        member_id: mockExtracted.memberId,
        group: mockExtracted.groupNumber,
        confidence: mockExtracted.confidence,
      };

      await bigquery
        .dataset('insurance_rates')
        .table('ocr_logs')
        .insert(row);
    } catch (err) {
      console.error('BigQuery insert error:', err);
    }

    return NextResponse.json({ 
      success: true, 
      extracted: mockExtracted 
    });

  } catch (error: any) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to process insurance card' }, 
      { status: 500 }
    );
  }
}
