#!/bin/bash
# BCBS Texas MRF Download Script
# Generated on 2025-06-17T21:58:20.483Z

echo "🚀 Starting BCBS Texas MRF downloads..."

AVAILABLE_GB=$(df . | tail -1 | awk '{print $4/1024/1024}')
echo "💾 Available disk space: ${AVAILABLE_GB}GB"

if (( $(echo "${AVAILABLE_GB} < 50" | bc -l) )); then
  echo "⚠️  Warning: Less than 50GB available. Consider using GCP!"
  read -p "Continue anyway? (y/N): " confirm
  [[ $confirm != [yY] ]] && exit 1
fi

echo "📁 Creating data directory..."
mkdir -p data

# Download only first 3 files for testing
echo "🧪 Downloading first 3 files for testing..."
curl -o "data/bcbs-texas-blue-essentials-1.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-13_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_TX-Kelsey-Cap-Table-9_in-network-rates.json.gz"
curl -o "data/bcbs-texas-blue-essentials-2.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_in-network-rates.json.gz"
curl -o "data/bcbs-texas-blue-essentials-3.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-13_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_TX-Kelsey-Cap-Table-9_in-network-rates.json.gz"

echo "✅ Downloaded first 3 files to data/ directory"
ls -lh data/
echo ""
echo "🔄 Next steps:"
echo "1. gunzip data/*.gz"
echo "2. npx tsx scripts/parse-mrf-enhanced.ts"
