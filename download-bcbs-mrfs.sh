#!/bin/bash
# BCBS Texas MRF Download Script
# Generated on 2025-06-17T22:14:06.770Z

mkdir -p data
echo "📥 Downloading BCBS MRF files..."
echo ""

echo "Downloading Blue Essentials TX Kelsey Cap Table 9 in-network file..."
curl -L -o "data/bcbs-mrf-1.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-13_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_TX-Kelsey-Cap-Table-9_in-network-rates.json.gz"
echo "Downloading Blue Essentials in-network file..."
curl -L -o "data/bcbs-mrf-2.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_in-network-rates.json.gz"
echo "Downloading Blue Essentials in-network file..."
curl -L -o "data/bcbs-mrf-3.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_in-network-rates.json.gz"
echo "Downloading Blue Essentials TX Kelsey Cap Table 1 in-network file..."
curl -L -o "data/bcbs-mrf-4.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-13_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_TX-Kelsey-Cap-Table-1_in-network-rates.json.gz"
echo "Downloading Blue Essentials in-network file..."
curl -L -o "data/bcbs-mrf-5.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-18_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_in-network-rates.json.gz"
echo "Downloading Blue Essentials TX Kelsey Cap Table 30 in-network file..."
curl -L -o "data/bcbs-mrf-6.json.gz" "https://app0004702110a5prdnc685.blob.core.windows.net/output/2025-05-13_Blue-Cross-and-Blue-Shield-of-Texas_Blue-Essentials_TX-Kelsey-Cap-Table-30_in-network-rates.json.gz"
echo "Downloading TN Blue Network P in-network file 17 of 420..."
curl -L -o "data/bcbs-mrf-7.json.gz" "https://bcbstx.mrf.bcbs.com/2025-06_890_58B0_in-network-rates_17_of_420.json.gz?&Expires=1753106451&Signature=hGxqSuK2mqnqYBN~8tNnfLlE~kuxRJ1YQE2KHUkNZ5vFVb~-K9YLWNPr8ZYEXV4pPAemi190fU50Y6PEb5xykZu1xs12e5cVkWNgN9NLFCliOdLeZCB7-B-qZGhXeuKSESC5usgEOnwOfEDnY2PNd03F13e2U~yBNjksnHpC9M6yom8iaEfqixZc62D2PPvRiJOuYCeJhD1UVoQ3Ywom9nsgIzQvBoJUUtbMmPkm2y41m46ORDLOm6tp3M85jIjbiuSYWtEGJlkK-8Uw7GhmekHtCElMk5M35rXxws0D4JHbTjKKguNNTn8D63DGtsx6nZeFljg3tSxQgGJOeevNvg__&Key-Pair-Id=K27TQMT39R1C8A"
echo "Downloading TN Blue Network P in-network file 276 of 420..."
curl -L -o "data/bcbs-mrf-8.json.gz" "https://bcbstx.mrf.bcbs.com/2025-06_890_58B0_in-network-rates_276_of_420.json.gz?&Expires=1753106451&Signature=TPs3zAeR9Pu1xg1B3m96uxQWMbJhPRnkLeiT2tu0ypoBSYcMooF5NyAxebI9MQPWUKU5d2PPnGjCFrKoO~Y5YV05KbI5wbYCtwMRgEg~ZBdlWXBKQ3i5U-FoVUBx~LpuWIYh53DrXoxbo7V~a~nEfRm2d6h7FlUZ8XfV9ysUegu0pPfouK0xzgJStRJVBEcT8ox9U6ohNGqFTMtdIMlJc10nZ3nwty-DoVNRn33klZCazXBv1HNQ2yZ3QmmkoL4t-X6J~K-Hb5R735aWr7ZOvfGXNAvdeYZukE4Ol6uQA4zcbIq9Z04YViv~V5eySb~DOarQM2BdOP-EUPRLxDxeqA__&Key-Pair-Id=K27TQMT39R1C8A"
echo "Downloading TN Blue Network P in-network file 266 of 420..."
curl -L -o "data/bcbs-mrf-9.json.gz" "https://bcbstx.mrf.bcbs.com/2025-06_890_58B0_in-network-rates_266_of_420.json.gz?&Expires=1753106451&Signature=15zvy-YAp14X2hOlH-lMi8J7a0iEEsH77R0N0LoxvSWExAnwFGCwPdziRHqqdjay9lxBc5f6O5~KXzL41U4sqOir5XZoVIqz7fGrVajAAmiOX-jjsveQNr7Uudh2eVNMq5shWWDHXvmhC8GMILZnvPTdv0iVk3W6BzedJJrNyM1-FR7vyJeI2E0Sj-zErr~qWcFgwkZI9f9Ymj8TroyHCYqbBji3089FtA3WyXkmTR1R2ii-2BxsttR6FdGt9KPR7DAu-mUfm~3fAgsHNMAkI0sxtsWZUv1sYFZYNJJwWCCLgiKdHoni6cXVoqRyu8V3ePFSvl1uLcVDIvh~OmPB~Q__&Key-Pair-Id=K27TQMT39R1C8A"
echo "Downloading TN Blue Network P in-network file 331 of 420..."
curl -L -o "data/bcbs-mrf-10.json.gz" "https://bcbstx.mrf.bcbs.com/2025-06_890_58B0_in-network-rates_331_of_420.json.gz?&Expires=1753106451&Signature=pQ2kuRRycA~w-sUnkcU35qzJkdEl0T3q6LF4Ux0k~cTdjovxG1Y-2B-LLhpGBXNMsDbmEFN~v4nd226jUWM3OB9jZCs3SwAr8QYQSi4UTsEqL5CnpdO3wpG~0Dyv9rITWf1TR0LCobxvbBCUQQwOXgA-tju37HPGRqYeEJKyzYQtIuLGq~dEtmI-T0j3xJEz-YTYU-U7Yy4XUjwdjyQJCQ0pdE3E3yk3SJtJWrDj0KTqVj3cZISMC9OIh5DoqJla72z1zNvXvLRU835Jp7we~NlWMz13RCIEQfHYBirXRnk235Y2bE8kPYIc8BvkK2vJ5-9HfxHeGx-p1HYO-EKT1Q__&Key-Pair-Id=K27TQMT39R1C8A"

echo ""
echo "✅ Download complete!"
echo "📝 To extract: gunzip data/*.gz"
