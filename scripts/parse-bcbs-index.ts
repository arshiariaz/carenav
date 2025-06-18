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

function parseBCBSIndex() {
  console.log('🔍 Parsing BCBS Texas index file...\n');

  try {
    const possiblePaths = [
      '2025-05-20_Blue-Cross-and-Blue-Shield-of-Texas_index.json',
      'Blue-Cross-and-Blue-Shield-of-Texas_index.json'
    ];

    let indexPath = '';
    for (const pathPattern of possiblePaths) {
      const fullPath = path.join(process.cwd(), pathPattern);
      if (fs.existsSync(fullPath)) {
        indexPath = fullPath;
        break;
      }
    }

    if (!indexPath) {
      console.log('❌ Index file not found. Looked for:');
      possiblePaths.forEach(p => console.log(`  - ${p}`));
      return;
    }

    console.log(`📁 Found index file: ${path.basename(indexPath)}`);
    const rawData = fs.readFileSync(indexPath, 'utf-8');
    const indexData: BCBSIndex = JSON.parse(rawData);

    // Show basic info
    console.log('📋 Index Information:');
    console.log(`  Entity: ${indexData.reporting_entity_name}`);
    console.log(`  Type: ${indexData.reporting_entity_type}`);
    console.log(`  Reporting structures: ${indexData.reporting_structure.length}\n`);

    // Extract all in-network files with their associated plan info
    interface FileWithPlanInfo {
      file: InNetworkFile;
      plans: ReportingPlan[];
    }

    const allFilesWithPlans: FileWithPlanInfo[] = [];

    indexData.reporting_structure.forEach((structure, structIdx) => {
      const plans = structure.reporting_plans || [];
      const files = structure.in_network_files || [];
      
      console.log(`\n📦 Structure ${structIdx + 1}:`);
      console.log(`  Plans: ${plans.length}`);
      console.log(`  Files: ${files.length}`);
      
      // Show plan details
      if (plans.length > 0 && plans.length <= 5) {
        plans.forEach(plan => {
          console.log(`  - ${plan.plan_name || 'Unknown'} (${plan.plan_id || 'No ID'})`);
          if (plan.plan_market_type) {
            console.log(`    Market: ${plan.plan_market_type}`);
          }
        });
      } else if (plans.length > 5) {
        console.log(`  (Showing first 5 of ${plans.length} plans)`);
        plans.slice(0, 5).forEach(plan => {
          console.log(`  - ${plan.plan_name || 'Unknown'} (${plan.plan_id || 'No ID'})`);
        });
      }
      
      // Add files with their plan associations
      files.forEach(file => {
        allFilesWithPlans.push({ file, plans });
      });
    });

    console.log(`\n📊 Total in-network files found: ${allFilesWithPlans.length}`);

    // Analyze the descriptions to understand the naming pattern
    const uniqueDescriptions = new Set<string>();
    const descriptionSamples: string[] = [];
    
    allFilesWithPlans.forEach(({ file }) => {
      if (file.description) {
        uniqueDescriptions.add(file.description);
        if (descriptionSamples.length < 10) {
          descriptionSamples.push(file.description);
        }
      }
    });

    console.log(`\n📝 Unique file descriptions: ${uniqueDescriptions.size}`);
    console.log('Sample descriptions:');
    descriptionSamples.forEach((desc, idx) => {
      console.log(`  ${idx + 1}. ${desc}`);
    });

    // Look for Texas-specific files or common plan types
    const filtered = allFilesWithPlans.filter(({ file, plans }) => {
      const desc = (file.description || '').toLowerCase();
      const url = (file.location || '').toLowerCase();
      
      // Check if any associated plan mentions Texas
      const hasTexasPlan = plans.some(plan => {
        const planName = (plan.plan_name || '').toLowerCase();
        const planId = (plan.plan_id || '').toLowerCase();
        return planName.includes('tx') || 
               planName.includes('texas') || 
               planId.includes('tx');
      });
      
      // Debug log for first few items
      if (allFilesWithPlans.indexOf({ file, plans }) < 3) {
        console.log('\n🔍 Checking file:', {
          description: file.description?.substring(0, 50) + '...',
          hasTexasPlan,
          plans: plans.map(p => p.plan_name).slice(0, 2)
        });
      }
      
      return (
        hasTexasPlan ||
        desc.includes('tx') ||
        desc.includes('texas') ||
        desc.includes('houston') ||
        desc.includes('ppo') ||
        desc.includes('hmo') ||
        desc.includes('epo') ||
        desc.includes('pos') ||
        desc.includes('blue') ||
        url.includes('tx') ||
        url.includes('texas')
      );
    });

    console.log(`\n🎯 Found ${filtered.length} potentially relevant files`);

    if (filtered.length === 0) {
      // If no filtered results, just show all files
      console.log('\n⚠️  No specific Texas files found. Showing all available files:');
      
      allFilesWithPlans.slice(0, 10).forEach(({ file, plans }, idx) => {
        console.log(`\n${idx + 1}. ${file.description}`);
        console.log(`   URL: ${file.location?.substring(0, 80)}...`);
        if (plans.length > 0) {
          console.log(`   Associated plans: ${plans.map(p => p.plan_name || 'Unknown').join(', ')}`);
        }
      });
      
      if (allFilesWithPlans.length > 10) {
        console.log(`\n... and ${allFilesWithPlans.length - 10} more files`);
      }
    }

    // Generate download script for available files
    const downloadCommands: string[] = [];
    const filesToDownload = filtered.length > 0 ? filtered : allFilesWithPlans.slice(0, 5);
    
    filesToDownload.slice(0, 10).forEach(({ file, plans }, idx) => {
      const filename = `data/bcbs-mrf-${idx + 1}.json.gz`;
      console.log(`\n${idx + 1}. ${file.description}`);
      console.log(`   File: ${path.basename((file.location || '').split('?')[0])}`);
      if (plans.length > 0) {
        console.log(`   Plans: ${plans.slice(0, 3).map(p => p.plan_name).join(', ')}`);
      }
      
      if (file.location) {
        downloadCommands.push(`echo "Downloading ${file.description}..."`);
        downloadCommands.push(`curl -L -o "${filename}" "${file.location}"`);
      }
    });

    if (downloadCommands.length > 0) {
      const script = `#!/bin/bash
# BCBS Texas MRF Download Script
# Generated on ${new Date().toISOString()}

mkdir -p data
echo "📥 Downloading BCBS MRF files..."
echo ""

${downloadCommands.join('\n')}

echo ""
echo "✅ Download complete!"
echo "📝 To extract: gunzip data/*.gz"
`;
      fs.writeFileSync('download-bcbs-mrfs.sh', script);
      console.log('\n✅ Download script saved to: download-bcbs-mrfs.sh');
      console.log('📌 Run: chmod +x download-bcbs-mrfs.sh && ./download-bcbs-mrfs.sh');
    }

    // Save debug info
    const debugInfo = {
      entity: indexData.reporting_entity_name,
      totalStructures: indexData.reporting_structure.length,
      totalFiles: allFilesWithPlans.length,
      sampleFiles: allFilesWithPlans.slice(0, 5).map(({ file, plans }) => ({
        description: file.description,
        location_preview: file.location?.substring(0, 100) + '...',
        associated_plans: plans.map(p => ({ name: p.plan_name, id: p.plan_id }))
      }))
    };
    
    fs.writeFileSync('data/bcbs-index-debug.json', JSON.stringify(debugInfo, null, 2));
    console.log('\n📝 Debug info saved to: data/bcbs-index-debug.json');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the parser
parseBCBSIndex();