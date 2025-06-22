#!/bin/bash
# Safe cleanup verification script for CareNav

echo "🔍 Verifying file usage in CareNav project..."
echo "================================================"

# Files that are DEFINITELY SAFE to delete based on manual analysis
SAFE_TO_DELETE=(
  # Test pages (not for production)
  "app/network-test/page.tsx"
  "app/test-insurance/page.tsx"
  "app/components/ProviderNetworkChecker.tsx"
  
  # Duplicate/unused versions
  "lib/npi-registry-improved.ts"
  "lib/provider-intelligence.ts"
  "lib/provider-directory-apis.ts"
  
  # Test scripts
  "test-apis.ts"
)

echo ""
echo "✅ SAFE TO DELETE:"
echo "=================="
for file in "${SAFE_TO_DELETE[@]}"; do
  if [ -f "$file" ]; then
    echo "  - $file"
  fi
done

echo ""
echo "🔍 Checking if critical files are actually being used..."
echo "======================================================="

echo ""
echo "Checking healthcare-apis.ts usage:"
grep -r "healthcare-apis" --include="*.ts" --include="*.tsx" app/ lib/ 2>/dev/null | head -5

echo ""
echo "Checking procedure-bundles.ts usage:"
grep -r "procedure-bundles" --include="*.ts" --include="*.tsx" app/ lib/ 2>/dev/null | head -5

echo ""
echo "Checking provider-search-service.ts usage:"
grep -r "provider-search-service" --include="*.ts" --include="*.tsx" app/ lib/ 2>/dev/null | head -5
