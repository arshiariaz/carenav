#!/bin/bash
# BCBS Texas MRF Download Script
# Generated on 2025-06-17T22:16:56.601Z
# This script downloads a sample of Texas-specific MRF files

mkdir -p data
echo "🏥 BCBS Texas MRF Downloader"
echo "=" 
echo ""

echo "📥 Downloading Blue Advantage file 1..."
curl -L -o "data/tx-blue-advantage-1.json.gz" "https://tic.hothprod.magellanhealth.com/BCBTX/INN/Blue-Cross-and-Blue-Shield-of-Texas_Blue-Advantage-HMO_BAV_behavioral-health-services_in-network-rates.json"

echo "📥 Downloading Blue Advantage file 2..."
curl -L -o "data/tx-blue-advantage-2.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Advantage-HMO_in-network-rates.json.gz"

echo "📥 Downloading Blue Advantage file 3..."
curl -L -o "data/tx-blue-advantage-3.json.gz" "https://tic.hothprod.magellanhealth.com/BCBTX/INN/Blue-Cross-and-Blue-Shield-of-Texas_Blue-Advantage-HMO_BAV_behavioral-health-services_in-network-rates.json"

echo "📥 Downloading Blue Choice file 1..."
curl -L -o "data/tx-blue-choice-1.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Choice-PPO_in-network-rates.json.gz"

echo "📥 Downloading Blue Choice file 2..."
curl -L -o "data/tx-blue-choice-2.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Choice-PPO_in-network-rates.json.gz"

echo "📥 Downloading Blue Choice file 3..."
curl -L -o "data/tx-blue-choice-3.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Choice-PPO_in-network-rates.json.gz"

echo "📥 Downloading Blue Essentials file 1..."
curl -L -o "data/tx-blue-essentials-1.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_in-network-rates.json.gz"


echo "✅ Download complete!"
echo ""
echo "📝 Next steps:"
echo "1. Extract files: gunzip data/tx-*.gz"
echo "2. Parse with: npx tsx scripts/parse-mrf-enhanced.ts"
