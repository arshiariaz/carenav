// lib/provider-directory-apis.ts
import axios from 'axios';

// Provider Directory API Configuration
export const PROVIDER_DIRECTORY_CONFIGS: Record<string, ProviderDirectoryConfig> = {
  // Open Access APIs (No Auth Required)
  bcbs_capital: {
    name: 'Capital Blue Cross',
    baseUrl: 'https://api.capbluecross.com/fhir/r4',
    requiresAuth: false,
    states: ['PA'],
    resources: {
      practitioner: '/Practitioner',
      practitionerRole: '/PractitionerRole',
      organization: '/Organization',
      insurancePlan: '/InsurancePlan',
      location: '/Location'
    }
  },
  
  bcbs_tennessee: {
    name: 'BCBS Tennessee',
    baseUrl: 'https://api.bcbst.com/fhir/r4',
    requiresAuth: false,
    states: ['TN'],
    resources: {
      practitioner: '/Practitioner',
      practitionerRole: '/PractitionerRole',
      organization: '/Organization',
      insurancePlan: '/InsurancePlan'
    }
  },

  // OAuth Required APIs
  anthem: {
    name: 'Anthem/Elevance',
    baseUrl: 'https://api.anthem.com/v1/fhir',
    authUrl: 'https://api.anthem.com/oauth/token',
    requiresAuth: true,
    authType: 'oauth2_client_credentials',
    states: ['CA', 'CO', 'CT', 'GA', 'IN', 'KY', 'ME', 'MO', 'NV', 'NH', 'NY', 'OH', 'VA', 'WI'],
    sandboxUrl: 'https://api.anthem.com/v1-sandbox/fhir'
  },

  aetna: {
    name: 'Aetna/CVS Health',
    baseUrl: 'https://api.cvshealth.com/provider/fhir',
    sandboxUrl: 'https://api.cvshealth.com/provider/v1-devportal/fhir',
    requiresAuth: true,
    authType: 'oauth2_client_credentials',
    national: true
  },

  cigna: {
    name: 'Cigna',
    baseUrl: 'https://fhir.cigna.com/ProviderDirectory/v1',
    sandboxUrl: 'https://fhir.cigna.com/ProviderDirectory/v1-devportal',
    requiresAuth: true,
    authType: 'api_key',
    national: true
  },

  uhc: {
    name: 'UnitedHealthcare',
    baseUrl: 'TBD_ON_REGISTRATION',
    requiresAuth: true,
    authType: 'oauth2_client_credentials',
    national: true,
    notes: 'Requires registration through Optum developer portal'
  }
};

// Configuration Types
interface ProviderDirectoryConfig {
  name: string;
  baseUrl: string;
  authUrl?: string;
  sandboxUrl?: string;
  requiresAuth: boolean;
  authType?: 'oauth2_client_credentials' | 'api_key';
  states?: string[];
  national?: boolean;
  notes?: string;
  resources?: {
    practitioner?: string;
    practitionerRole?: string;
    organization?: string;
    insurancePlan?: string;
    location?: string;
  };
}

// FHIR Base Types
interface FHIRResource {
  resourceType: string;
  id?: string;
  meta?: {
    versionId?: string;
    lastUpdated?: string;
  };
}

interface FHIRBundle<T = FHIRResource> {
  resourceType: 'Bundle';
  type: string;
  total?: number;
  link?: Array<{
    relation: string;
    url: string;
  }>;
  entry?: Array<{
    fullUrl?: string;
    resource: T;
    search?: {
      mode?: string;
      score?: number;
    };
  }>;
}

interface FHIRReference {
  reference?: string;
  display?: string;
  type?: string;
}

interface FHIRCodeableConcept {
  coding?: Array<{
    system?: string;
    version?: string;
    code?: string;
    display?: string;
  }>;
  text?: string;
}

interface FHIRIdentifier {
  use?: string;
  type?: FHIRCodeableConcept;
  system?: string;
  value?: string;
  period?: {
    start?: string;
    end?: string;
  };
}

interface FHIRHumanName {
  use?: string;
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

interface FHIRContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: string;
  rank?: number;
}

interface FHIRAddress {
  use?: string;
  type?: string;
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

// FHIR Resource Types
interface FHIRPractitioner extends FHIRResource {
  resourceType: 'Practitioner';
  identifier?: FHIRIdentifier[];
  active?: boolean;
  name?: FHIRHumanName[];
  telecom?: FHIRContactPoint[];
  address?: FHIRAddress[];
  gender?: string;
  birthDate?: string;
  photo?: Array<{
    contentType?: string;
    url?: string;
  }>;
  qualification?: Array<{
    identifier?: FHIRIdentifier[];
    code: FHIRCodeableConcept;
    period?: {
      start?: string;
      end?: string;
    };
    issuer?: FHIRReference;
  }>;
}

interface FHIRPractitionerRole extends FHIRResource {
  resourceType: 'PractitionerRole';
  identifier?: FHIRIdentifier[];
  active?: boolean;
  period?: {
    start?: string;
    end?: string;
  };
  practitioner?: FHIRReference;
  organization?: FHIRReference;
  code?: FHIRCodeableConcept[];
  specialty?: FHIRCodeableConcept[];
  location?: FHIRReference[];
  healthcareService?: FHIRReference[];
  telecom?: FHIRContactPoint[];
  availableTime?: Array<{
    daysOfWeek?: string[];
    allDay?: boolean;
    availableStartTime?: string;
    availableEndTime?: string;
  }>;
  notAvailable?: Array<{
    description: string;
    during?: {
      start?: string;
      end?: string;
    };
  }>;
  availabilityExceptions?: string;
  endpoint?: FHIRReference[];
  // Plan-Net specific extension
  network?: FHIRReference[];
}

interface FHIROrganization extends FHIRResource {
  resourceType: 'Organization';
  identifier?: FHIRIdentifier[];
  active?: boolean;
  type?: FHIRCodeableConcept[];
  name?: string;
  alias?: string[];
  telecom?: FHIRContactPoint[];
  address?: FHIRAddress[];
  partOf?: FHIRReference;
  contact?: Array<{
    purpose?: FHIRCodeableConcept;
    name?: FHIRHumanName;
    telecom?: FHIRContactPoint[];
    address?: FHIRAddress;
  }>;
  endpoint?: FHIRReference[];
}

interface FHIRLocation extends FHIRResource {
  resourceType: 'Location';
  identifier?: FHIRIdentifier[];
  status?: string;
  operationalStatus?: FHIRCodeableConcept;
  name?: string;
  alias?: string[];
  description?: string;
  mode?: string;
  type?: FHIRCodeableConcept[];
  telecom?: FHIRContactPoint[];
  address?: FHIRAddress;
  physicalType?: FHIRCodeableConcept;
  position?: {
    longitude: number;
    latitude: number;
    altitude?: number;
  };
  managingOrganization?: FHIRReference;
  partOf?: FHIRReference;
  hoursOfOperation?: Array<{
    daysOfWeek?: string[];
    allDay?: boolean;
    openingTime?: string;
    closingTime?: string;
  }>;
  availabilityExceptions?: string;
  endpoint?: FHIRReference[];
}

interface FHIRInsurancePlan extends FHIRResource {
  resourceType: 'InsurancePlan';
  identifier?: FHIRIdentifier[];
  status?: string;
  type?: FHIRCodeableConcept[];
  name?: string;
  alias?: string[];
  period?: {
    start?: string;
    end?: string;
  };
  ownedBy?: FHIRReference;
  administeredBy?: FHIRReference;
  coverageArea?: FHIRReference[];
  contact?: Array<{
    purpose?: FHIRCodeableConcept;
    name?: FHIRHumanName;
    telecom?: FHIRContactPoint[];
    address?: FHIRAddress;
  }>;
  endpoint?: FHIRReference[];
  network?: FHIRReference[];
  coverage?: Array<{
    type: FHIRCodeableConcept;
    network?: FHIRReference[];
    benefit: Array<{
      type: FHIRCodeableConcept;
      requirement?: string;
      limit?: Array<{
        value?: {
          value?: number;
          unit?: string;
          system?: string;
          code?: string;
        };
        code?: FHIRCodeableConcept;
      }>;
    }>;
  }>;
  plan?: Array<{
    identifier?: FHIRIdentifier[];
    type?: FHIRCodeableConcept;
    coverageArea?: FHIRReference[];
    network?: FHIRReference[];
    generalCost?: Array<{
      type?: FHIRCodeableConcept;
      groupSize?: number;
      cost?: {
        value?: number;
        unit?: string;
        system?: string;
        code?: string;
      };
      comment?: string;
    }>;
    specificCost?: Array<{
      category: FHIRCodeableConcept;
      benefit?: Array<{
        type: FHIRCodeableConcept;
        cost?: Array<{
          type: FHIRCodeableConcept;
          applicability?: FHIRCodeableConcept;
          qualifiers?: FHIRCodeableConcept[];
          value?: {
            value?: number;
            unit?: string;
            system?: string;
            code?: string;
          };
        }>;
      }>;
    }>;
  }>;
}

// API Response Types
interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

interface IdeonResponse {
  plans: Array<{
    id: string;
    name: string;
    carrier: string;
    type: string;
    network_size: number;
  }>;
  last_updated: string;
}

// Provider Directory Service Types
interface ProviderSearchResult {
  insurer: string;
  practitioner: FHIRPractitioner;
  roles: FHIRPractitionerRole[];
  plans: FHIRInsurancePlan[];
}

interface InNetworkCheckResult {
  inNetwork: boolean;
  practitioner?: FHIRPractitioner;
  role?: FHIRPractitionerRole;
  plan?: FHIRInsurancePlan;
}

interface ProviderWithLocation {
  practitioner: FHIRPractitioner;
  role: FHIRPractitionerRole;
  location?: FHIRLocation;
}

// CareNav Format Types
interface CareNavProvider {
  npi?: string;
  name: string;
  specialty: string;
  type: string;
  address: string;
  phone?: string;
  acceptingNewPatients?: boolean;
  networkStatus: string;
  distance?: number;
  driveTime?: number;
}

// Provider Directory Service
export class ProviderDirectoryService {
  private static authTokens: Map<string, { token: string; expires: number }> = new Map();

  /**
   * Get OAuth token for authenticated APIs
   */
  private static async getAuthToken(apiKey: string): Promise<string> {
    const config = PROVIDER_DIRECTORY_CONFIGS[apiKey];
    if (!config.requiresAuth) return '';

    // Check cache
    const cached = this.authTokens.get(apiKey);
    if (cached && cached.expires > Date.now()) {
      return cached.token;
    }

    // Get new token based on auth type
    if (config.authType === 'oauth2_client_credentials') {
      const clientId = process.env[`${apiKey.toUpperCase()}_CLIENT_ID`];
      const clientSecret = process.env[`${apiKey.toUpperCase()}_CLIENT_SECRET`];
      
      if (!clientId || !clientSecret) {
        throw new Error(`Missing credentials for ${apiKey}`);
      }

      const tokenResponse = await axios.post<TokenResponse>(
        config.authUrl!,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
          }
        }
      );

      const token = tokenResponse.data.access_token;
      const expiresIn = tokenResponse.data.expires_in || 3600;
      
      // Cache token
      this.authTokens.set(apiKey, {
        token,
        expires: Date.now() + (expiresIn * 1000) - 60000 // Refresh 1 min early
      });

      return token;
    }

    // API Key auth
    return process.env[`${apiKey.toUpperCase()}_API_KEY`] || '';
  }

  /**
   * Search for providers by NPI across multiple insurers
   */
  static async findProviderByNPI(
    npi: string,
    insurers: string[] = ['bcbs_capital', 'bcbs_tennessee']
  ): Promise<ProviderSearchResult[]> {
    const results: ProviderSearchResult[] = [];

    for (const insurerKey of insurers) {
      const config = PROVIDER_DIRECTORY_CONFIGS[insurerKey];
      if (!config) continue;

      try {
        // Search for practitioner by NPI
        const practitionerUrl = `${config.baseUrl}/Practitioner?identifier=http://hl7.org/fhir/sid/us-npi|${npi}`;
        
        const headers: Record<string, string> = {
          'Accept': 'application/fhir+json'
        };

        if (config.requiresAuth) {
          const token = await this.getAuthToken(insurerKey);
          if (config.authType === 'oauth2_client_credentials') {
            headers['Authorization'] = `Bearer ${token}`;
          } else {
            headers['X-API-Key'] = token;
          }
        }

        const practitionerResponse = await axios.get<FHIRBundle<FHIRPractitioner>>(
          practitionerUrl, 
          { headers }
        );
        
        if (!practitionerResponse.data.entry || practitionerResponse.data.entry.length === 0) {
          continue; // Provider not found in this network
        }

        const practitioner = practitionerResponse.data.entry[0].resource;

        // Get PractitionerRoles for this practitioner
        const rolesUrl = `${config.baseUrl}/PractitionerRole?practitioner=Practitioner/${practitioner.id}`;
        const rolesResponse = await axios.get<FHIRBundle<FHIRPractitionerRole>>(
          rolesUrl, 
          { headers }
        );
        
        const roles = rolesResponse.data.entry?.map(e => e.resource) || [];

        // Extract unique plan references from roles
        const planRefs = new Set<string>();
        roles.forEach((role) => {
          role.network?.forEach(net => {
            if (net.reference?.startsWith('InsurancePlan/')) {
              planRefs.add(net.reference);
            }
          });
        });

        // Fetch insurance plans
        const plans: FHIRInsurancePlan[] = [];
        for (const planRef of planRefs) {
          const planId = planRef.split('/')[1];
          const planUrl = `${config.baseUrl}/InsurancePlan/${planId}`;
          
          try {
            const planResponse = await axios.get<FHIRInsurancePlan>(planUrl, { headers });
            plans.push(planResponse.data);
          } catch (err) {
            console.error(`Failed to fetch plan ${planId}:`, err);
          }
        }

        results.push({
          insurer: config.name,
          practitioner,
          roles,
          plans
        });

      } catch (error) {
        console.error(`Error querying ${insurerKey}:`, error);
      }
    }

    return results;
  }

  /**
   * Check if a provider is in-network for a specific plan
   */
  static async checkInNetwork(
    npi: string,
    planId: string,
    insurer: string
  ): Promise<InNetworkCheckResult> {
    const config = PROVIDER_DIRECTORY_CONFIGS[insurer];
    if (!config) {
      throw new Error(`Unknown insurer: ${insurer}`);
    }

    try {
      // First, find the insurance plan
      const planUrl = `${config.baseUrl}/InsurancePlan?identifier=${planId}`;
      const headers = await this.buildHeaders(insurer);
      
      const planResponse = await axios.get<FHIRBundle<FHIRInsurancePlan>>(planUrl, { headers });
      if (!planResponse.data.entry || planResponse.data.entry.length === 0) {
        return { inNetwork: false };
      }

      const plan = planResponse.data.entry[0].resource;

      // Search for practitioner roles that reference this plan
      const roleUrl = `${config.baseUrl}/PractitionerRole?network=InsurancePlan/${plan.id}`;
      const roleResponse = await axios.get<FHIRBundle<FHIRPractitionerRole>>(roleUrl, { headers });

      // Check if any of the roles belong to the provider with given NPI
      for (const entry of roleResponse.data.entry || []) {
        const role = entry.resource;
        
        if (role.practitioner?.reference) {
          const practId = role.practitioner.reference.split('/')[1];
          const practUrl = `${config.baseUrl}/Practitioner/${practId}`;
          const practResponse = await axios.get<FHIRPractitioner>(practUrl, { headers });
          const practitioner = practResponse.data;
          
          // Check if this practitioner has the matching NPI
          const hasNPI = practitioner.identifier?.some(id => 
            id.system === 'http://hl7.org/fhir/sid/us-npi' && id.value === npi
          );
          
          if (hasNPI) {
            return {
              inNetwork: true,
              practitioner,
              role,
              plan
            };
          }
        }
      }

      return { inNetwork: false };

    } catch (error) {
      console.error(`Error checking in-network status:`, error);
      throw error;
    }
  }

  /**
   * Find all in-network providers for a plan in a given area
   */
  static async findInNetworkProviders(
    planId: string,
    insurer: string,
    city?: string,
    state?: string,
    specialty?: string,
    limit: number = 20
  ): Promise<ProviderWithLocation[]> {
    const config = PROVIDER_DIRECTORY_CONFIGS[insurer];
    if (!config) {
      throw new Error(`Unknown insurer: ${insurer}`);
    }

    try {
      // Build search query
      let searchUrl = `${config.baseUrl}/PractitionerRole?`;
      const params = new URLSearchParams();
      
      // Add plan filter if supported
      params.append('network', `InsurancePlan/${planId}`);
      
      if (specialty) {
        params.append('specialty', specialty);
      }
      
      if (limit) {
        params.append('_count', limit.toString());
      }

      searchUrl += params.toString();

      const headers = await this.buildHeaders(insurer);
      const response = await axios.get<FHIRBundle<FHIRPractitionerRole>>(searchUrl, { headers });

      const results: ProviderWithLocation[] = [];
      for (const entry of response.data.entry || []) {
        const role = entry.resource;
        
        // Fetch practitioner details
        if (role.practitioner?.reference) {
          const practUrl = `${config.baseUrl}/${role.practitioner.reference}`;
          const practResponse = await axios.get<FHIRPractitioner>(practUrl, { headers });
          
          // Fetch location if available
          let location: FHIRLocation | undefined;
          if (role.location?.[0]?.reference) {
            const locUrl = `${config.baseUrl}/${role.location[0].reference}`;
            try {
              const locResponse = await axios.get<FHIRLocation>(locUrl, { headers });
              location = locResponse.data;
              
              // Filter by city/state if provided
              if (city && state) {
                const address = location.address;
                if (address?.city?.toLowerCase() !== city.toLowerCase() ||
                    address?.state !== state) {
                  continue; // Skip this provider
                }
              }
            } catch (err) {
              console.error('Failed to fetch location:', err);
            }
          }

          results.push({
            practitioner: practResponse.data,
            role,
            location
          });
        }
      }

      return results;

    } catch (error) {
      console.error(`Error finding in-network providers:`, error);
      throw error;
    }
  }

  /**
   * Build headers for API requests
   */
  private static async buildHeaders(insurer: string): Promise<Record<string, string>> {
    const config = PROVIDER_DIRECTORY_CONFIGS[insurer];
    const headers: Record<string, string> = {
      'Accept': 'application/fhir+json',
      'Content-Type': 'application/fhir+json'
    };

    if (config.requiresAuth) {
      const token = await this.getAuthToken(insurer);
      if (config.authType === 'oauth2_client_credentials') {
        headers['Authorization'] = `Bearer ${token}`;
      } else if (config.authType === 'api_key') {
        headers['X-API-Key'] = token;
      }
    }

    return headers;
  }
}

// Aggregator Service (for multi-payer queries)
export class MultiPayerDirectoryService {
  /**
   * Check provider network status across multiple insurers
   */
  static async checkProviderNetworks(
    npi: string,
    includeAggregators: boolean = false
  ): Promise<{
    directAPIs: Array<{
      insurer: string;
      inNetwork: boolean;
      plans: Array<{
        id?: string;
        name?: string;
        type?: string;
      }>;
    }>;
    aggregatorData?: {
      source: string;
      plans: any[];
      lastUpdated: string;
    };
  }> {
    // Query direct insurer APIs
    const directResults = await ProviderDirectoryService.findProviderByNPI(
      npi,
      Object.keys(PROVIDER_DIRECTORY_CONFIGS)
    );

    const response: any = {
      directAPIs: directResults.map(r => ({
        insurer: r.insurer,
        inNetwork: r.plans.length > 0,
        plans: r.plans.map(p => ({
          id: p.id,
          name: p.name,
          type: p.type?.[0]?.coding?.[0]?.display
        }))
      }))
    };

    // Query aggregators if enabled
    if (includeAggregators && process.env.IDEON_API_KEY) {
      try {
        const ideonResponse = await axios.get<IdeonResponse>(
          `https://api.ideonapi.com/providers/${npi}/plans`,
          {
            headers: {
              'x-api-key': process.env.IDEON_API_KEY
            }
          }
        );

        response.aggregatorData = {
          source: 'Ideon',
          plans: ideonResponse.data.plans,
          lastUpdated: ideonResponse.data.last_updated
        };
      } catch (error) {
        console.error('Ideon API error:', error);
      }
    }

    return response;
  }
}

// Helper to convert FHIR data to CareNav format
export function convertFHIRToCareNav(
  practitioner: FHIRPractitioner,
  role: FHIRPractitionerRole,
  location?: FHIRLocation
): CareNavProvider {
  const npi = practitioner.identifier?.find(id => 
    id.system === 'http://hl7.org/fhir/sid/us-npi'
  )?.value;

  const name = practitioner.name?.[0];
  const fullName = name ? `${name.given?.join(' ')} ${name.family}` : 'Unknown';

  const specialty = role.specialty?.[0]?.coding?.[0]?.display || 
                   practitioner.qualification?.[0]?.code?.coding?.[0]?.display ||
                   'General Practice';

  return {
    npi,
    name: fullName,
    specialty,
    type: mapSpecialtyToType(specialty),
    address: location?.address ? formatAddress(location.address) : 'Unknown',
    phone: location?.telecom?.find(t => t.system === 'phone')?.value || 
           practitioner.telecom?.find(t => t.system === 'phone')?.value,
    acceptingNewPatients: role.availabilityExceptions === null, // Simplified
    networkStatus: 'In-Network' // If returned by query, they're in-network
  };
}

function mapSpecialtyToType(specialty: string): string {
  const lower = specialty.toLowerCase();
  if (lower.includes('urgent') || lower.includes('walk-in')) return 'Urgent Care';
  if (lower.includes('emergency')) return 'Emergency Room';
  if (lower.includes('family') || lower.includes('internal') || lower.includes('primary')) return 'Primary Care';
  return 'Specialist';
}

function formatAddress(addr: FHIRAddress): string {
  const parts = [
    addr.line?.join(' '),
    addr.city,
    addr.state,
    addr.postalCode
  ].filter(Boolean);
  
  return parts.join(', ');
}