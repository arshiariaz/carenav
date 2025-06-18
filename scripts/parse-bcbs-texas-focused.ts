import * as fs from 'fs';
import * as path from 'path';

interface InNetworkFile {
  description: string;
  location: string;
}

interface ReportingPlan {
  plan_name?: string;
  plan_id?: string;
  plan_id_type?: string;
  plan_market_type?: string;
}

interface ReportingStructureItem {
  reporting_plans?: ReportingPlan[];
  in_network_files?: InNetworkFile[];
  allowed_amount_file?: any;
}

interface BCBSIndex {
  reporting_entity_name: string;
  reporting_entity_type: string;
  reporting_structure: ReportingStructureItem[];
}

interface FileWithPlanInfo {
  file: InNetworkFile;
  plans: ReportingPlan[];
}

function parseBCBSTexasFiles() {
  console.log('🔍 Parsing BCBS Texas index for Texas-specific files...\n');

  try {
    const indexPath = '2025-05-20_Blue-Cross-and-Blue-Shield-of-Texas_index.json';
    
    if (!fs.existsSync(indexPath)) {
      console.log('❌ Index file not found:', indexPath);
      return;
    }

    console.log(`📁 Loading: ${indexPath}`);
    const rawData = fs.readFileSync(indexPath, 'utf-8');
    const indexData: BCBSIndex = JSON.parse(rawData);

    console.log(`📋 Entity: ${indexData.reporting_entity_name}`);
    console.log(`📊 Total structures: ${indexData.reporting_structure.length}\n`);

    // Extract all files with plans
    const allFilesWithPlans: FileWithPlanInfo[] = [];
    
    indexData.reporting_structure.forEach((structure) => {
      const plans = structure.reporting_plans || [];
      const files = structure.in_network_files || [];
      
      files.forEach(file => {
        allFilesWithPlans.push({ file, plans });
      });
    });

    console.log(`📊 Total files: ${allFilesWithPlans.length}`);

    // Filter for ONLY Texas files
    const texasFiles = allFilesWithPlans.filter(({ file, plans }) => {
      const desc = (file.description || '').toLowerCase();
      const url = (file.location || '').toLowerCase();
      
      // Must have TX or Texas in description or filename
      const isTexasFile = (
        desc.includes(' tx ') ||
        desc.includes('_tx_') ||
        desc.includes('texas') ||
        url.includes('_tx_') ||
        url.includes('-tx-') ||
        url.includes('texas')
      );
      
      // Exclude files from other states
      const isOtherState = (
        desc.includes(' tn ') ||
        desc.includes(' ca ') ||
        desc.includes(' ny ') ||
        desc.includes(' fl ') ||
        desc.includes('tennessee') ||
        desc.includes('california') ||
        desc.includes('new york') ||
        desc.includes('florida')
      );
      
      return isTexasFile && !isOtherState;
    });

    console.log(`🎯 Found ${texasFiles.length} Texas-specific files\n`);

    // Group by plan type to reduce duplicates
    const planGroups = new Map<string, FileWithPlanInfo[]>();
    
    texasFiles.forEach(fileInfo => {
      const desc = fileInfo.file.description;
      
      // Extract plan type from description
      let planType = 'Other';
      if (desc.includes('Blue Essentials')) planType = 'Blue Essentials';
      else if (desc.includes('Blue Advantage')) planType = 'Blue Advantage';
      else if (desc.includes('Blue Choice')) planType = 'Blue Choice';
      else if (desc.includes('MyBlue')) planType = 'MyBlue';
      else if (desc.includes('Blue Select')) planType = 'Blue Select';
      else if (desc.includes('Blue Premier')) planType = 'Blue Premier';
      else if (desc.includes('PPO')) planType = 'PPO Plans';
      else if (desc.includes('HMO')) planType = 'HMO Plans';
      else if (desc.includes('EPO')) planType = 'EPO Plans';
      
      // Check for special tables (like Kelsey Cap Tables)
      if (desc.includes('Kelsey Cap Table')) {
        planType += ' - Kelsey';
      }
      
      if (!planGroups.has(planType)) {
        planGroups.set(planType, []);
      }
      planGroups.get(planType)!.push(fileInfo);
    });

    // Display summary by plan type
    console.log('📊 Texas Files by Plan Type:');
    console.log('=' .repeat(50));
    
    const downloadCommands: string[] = [];
    let fileCounter = 0;
    
    // Sort plan types for consistent output
    const sortedPlanTypes = Array.from(planGroups.keys()).sort();
    
    sortedPlanTypes.forEach(planType => {
      const files = planGroups.get(planType)!;
      console.log(`\n📁 ${planType} (${files.length} files)`);
      
      // Show first 3 files from each plan type
      const samplesToShow = Math.min(3, files.length);
      files.slice(0, samplesToShow).forEach((fileInfo, idx) => {
        fileCounter++;
        const filename = `data/tx-${planType.toLowerCase().replace(/\s+/g, '-')}-${idx + 1}.json.gz`;
        
        console.log(`   ${idx + 1}. ${fileInfo.file.description}`);
        console.log(`      File: ${path.basename(fileInfo.file.location.split('?')[0])}`);
        
        if (fileInfo.plans.length > 0) {
          const planNames = fileInfo.plans
            .slice(0, 3)
            .map(p => p.plan_name || 'Unknown')
            .join(', ');
          console.log(`      Plans: ${planNames}`);
        }
        
        // Add to download commands (limit total downloads)
        if (downloadCommands.length < 20) {
          downloadCommands.push(`echo "📥 Downloading ${planType} file ${idx + 1}..."`);
          downloadCommands.push(`curl -L -o "${filename}" "${fileInfo.file.location}"`);
          downloadCommands.push('');
        }
      });
      
      if (files.length > samplesToShow) {
        console.log(`   ... and ${files.length - samplesToShow} more files`);
      }
    });

    // Find common CPT code files
    console.log('\n\n🎯 Looking for Common Procedure Files:');
    console.log('=' .repeat(50));
    
    const commonProcedureFiles = texasFiles.filter(({ file }) => {
      const desc = file.description.toLowerCase();
      return (
        desc.includes('urgent care') ||
        desc.includes('emergency') ||
        desc.includes('primary care') ||
        desc.includes('specialist') ||
        desc.includes('outpatient') ||
        desc.includes('facility') ||
        desc.includes('professional')
      );
    });
    
    if (commonProcedureFiles.length > 0) {
      console.log(`Found ${commonProcedureFiles.length} files with common procedures`);
      commonProcedureFiles.slice(0, 5).forEach((fileInfo, idx) => {
        console.log(`   ${idx + 1}. ${fileInfo.file.description}`);
      });
    }

    // Generate focused download script
    if (downloadCommands.length > 0) {
      const script = `#!/bin/bash
# BCBS Texas MRF Download Script
# Generated on ${new Date().toISOString()}
# This script downloads a sample of Texas-specific MRF files

mkdir -p data
echo "🏥 BCBS Texas MRF Downloader"
echo "=" 
echo ""

${downloadCommands.join('\n')}

echo "✅ Download complete!"
echo ""
echo "📝 Next steps:"
echo "1. Extract files: gunzip data/tx-*.gz"
echo "2. Parse with: npx tsx scripts/parse-mrf-enhanced.ts"
`;
      
      fs.writeFileSync('download-texas-mrfs.sh', script);
      console.log('\n\n✅ Download script created: download-texas-mrfs.sh');
      console.log('📌 Run: chmod +x download-texas-mrfs.sh && ./download-texas-mrfs.sh');
    }

    // Save Texas-specific file list for reference
    const texasSummary = {
      totalTexasFiles: texasFiles.length,
      planTypes: Object.fromEntries(
        Array.from(planGroups.entries()).map(([type, files]) => [
          type,
          {
            count: files.length,
            sampleDescriptions: files.slice(0, 3).map(f => f.file.description)
          }
        ])
      ),
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync('data/texas-files-summary.json', JSON.stringify(texasSummary, null, 2));
    console.log('\n📊 Summary saved to: data/texas-files-summary.json');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the parser
parseBCBSTexasFiles();