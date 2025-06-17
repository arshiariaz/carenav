import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

// Since Mindee doesn't have proper TypeScript types, we'll declare them
const mindee = require('mindee');
const { Client } = mindee;

// Initialize Mindee client
const mindeeClient = new Client({ apiKey: process.env.MINDEE_API_KEY! });

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
    
    // Create input source from buffer
    const inputSource = mindeeClient.docFromBuffer(buffer, file.name);

    // Parse with Mindee InsuranceCard API
    const apiResponse = await mindeeClient.parse(
      mindee.document.InsuranceCardV1,
      inputSource
    );

    // Extract the data - the actual structure from Mindee
    const doc = apiResponse.document;
    const prediction = doc?.inference?.prediction || {};
    
    // Extract fields based on actual Mindee InsuranceCardV1 response
    // Note: Field names might vary, so we'll be defensive
    const extracted = {
      companyName: prediction.company?.value || 
                   prediction.companyName?.value || 
                   prediction.insuranceCompany?.value || 
                   'Unknown',
      memberName: prediction.memberName?.value || 
                  prediction.member_name?.value || 
                  prediction.name?.value || 
                  '',
      memberId: prediction.memberId?.value || 
                prediction.member_id?.value || 
                prediction.memberNumber?.value || 
                '',
      groupNumber: prediction.groupNumber?.value || 
                   prediction.group_number?.value || 
                   prediction.groupId?.value || 
                   '',
      payerId: prediction.payerId?.value || 
               prediction.payer_id?.value || 
               '',
      copays: prediction.copays || [],
      confidence: prediction.company?.confidence || 
                  prediction.companyName?.confidence || 
                  0
    };

    console.log('Mindee OCR Result:', extracted);

    // BigQuery Logging
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
        
      console.log('✅ Logged to BigQuery:', row.insurance);
    } catch (err) {
      console.error('BigQuery insert error:', err);
      // Don't fail the request if logging fails
    }

    return NextResponse.json({ 
      success: true, 
      extracted
    });

  } catch (error: any) {
    console.error('OCR Error:', error);
    console.error('Error details:', error.message);
    
    // Fallback to mock data if OCR fails
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