// app/api/my-plan/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const planId = searchParams.get('planId');
    const carrier = searchParams.get('carrier');
    
    const bigquery = new BigQuery({
      projectId: 'carenav-health',
      keyFilename: './service-account-key.json'
    });
    
    // Build query based on parameters
    let query = `
      SELECT *
      FROM \`carenav-health.insurance_plans.plan_benefits\`
    `;
    
    const conditions = [];
    if (planId) {
      conditions.push(`plan_id = '${planId}'`);
    }
    if (carrier) {
      conditions.push(`LOWER(carrier) LIKE '%${carrier.toLowerCase()}%'`);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ` ORDER BY last_updated DESC LIMIT 1`;
    
    const [rows] = await bigquery.query(query);
    
    if (rows.length === 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'No plan data found' 
      }, { status: 404 });
    }
    
    return NextResponse.json({
      success: true,
      plan: rows[0]
    });
    
  } catch (error) {
    console.error('Failed to fetch plan data:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch plan data',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}