/**
 * HubSpot Breeze API client (thin fetch wrapper).
 *
 * Uses the CRM v3 API (`https://api.hubapi.com/crm/v3`) as canonical base.
 * Auth is Bearer <HUBSPOT_API_KEY> (Private Apps model).
 *
 * The three endpoints exposed by this plugin's webhook worker each map to
 * one method here — CRM v3 is straightforward enough that we skip Batch
 * endpoints (which would double the surface area) and rely on caller-side
 * fan-out.
 */

export interface HubspotContactProperties {
  email: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  jobtitle?: string;
  phone?: string;
  /** Free-form additional properties merged into HubSpot's properties payload. */
  extra?: Record<string, string>;
}

export interface CreateContactRequest {
  properties: HubspotContactProperties;
  /** If true and a contact with the same email exists, return existing id instead of 409. */
  idempotent?: boolean;
}

export interface HubspotContactResponse {
  contact_id: string;
  hubspot_url: string;
  email: string;
}

export interface UpsertDealRequest {
  dealname: string;
  amount?: number;
  pipeline?: string;
  dealstage?: string;
  associate_contact_ids?: string[];
  properties?: Record<string, string>;
}

export interface HubspotDealResponse {
  deal_id: string;
  hubspot_url: string;
  dealname: string;
}

export interface TriggerWorkflowRequest {
  workflow_id: string;
  contact_email: string;
}

export interface HubspotWorkflowEnrollmentResponse {
  workflow_id: string;
  contact_email: string;
  enrolled_at: string;
}

// ---------------------------------------------------------------------------

const DEFAULT_BASE_URL = "https://api.hubapi.com";
const DEFAULT_TIMEOUT_MS = 20_000;

export interface HubspotClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class HubspotClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: HubspotClientConfig) {
    if (!config.apiKey) throw new Error("HubspotClient: apiKey required");
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  // ------------------------- Contacts -------------------------

  async createContact(req: CreateContactRequest): Promise<HubspotContactResponse> {
    const properties = flattenProperties(req.properties);
    const res = await this.request("POST", "/crm/v3/objects/contacts", {
      properties,
    });

    if (res.status === 409 && req.idempotent) {
      const existing = await this.findContactByEmail(req.properties.email);
      if (existing) return existing;
    }

    if (!res.ok) {
      throw new HubspotHttpError(`create contact returned ${res.status}`, res.status);
    }
    const body = (await res.json()) as { id: string; properties?: Record<string, string> };
    return {
      contact_id: body.id,
      hubspot_url: `${this.baseUrl}/contacts/${body.id}`,
      email: body.properties?.email ?? req.properties.email,
    };
  }

  async findContactByEmail(email: string): Promise<HubspotContactResponse | null> {
    const res = await this.request("POST", "/crm/v3/objects/contacts/search", {
      filterGroups: [
        {
          filters: [{ propertyName: "email", operator: "EQ", value: email }],
        },
      ],
      limit: 1,
    });
    if (!res.ok) {
      throw new HubspotHttpError(`search contacts returned ${res.status}`, res.status);
    }
    const body = (await res.json()) as { results?: Array<{ id: string; properties?: Record<string, string> }> };
    const first = body.results?.[0];
    if (!first) return null;
    return {
      contact_id: first.id,
      hubspot_url: `${this.baseUrl}/contacts/${first.id}`,
      email: first.properties?.email ?? email,
    };
  }

  // ------------------------- Deals -------------------------

  async upsertDeal(req: UpsertDealRequest): Promise<HubspotDealResponse> {
    const properties: Record<string, string> = {
      dealname: req.dealname,
      ...(req.amount !== undefined ? { amount: String(req.amount) } : {}),
      ...(req.pipeline ? { pipeline: req.pipeline } : {}),
      ...(req.dealstage ? { dealstage: req.dealstage } : {}),
      ...(req.properties ?? {}),
    };

    // Try create first
    const res = await this.request("POST", "/crm/v3/objects/deals", { properties });
    if (!res.ok) {
      throw new HubspotHttpError(`create deal returned ${res.status}`, res.status);
    }
    const body = (await res.json()) as { id: string };
    return {
      deal_id: body.id,
      hubspot_url: `${this.baseUrl}/deals/${body.id}`,
      dealname: req.dealname,
    };
  }

  // ------------------------- Workflows -------------------------

  async triggerWorkflow(req: TriggerWorkflowRequest): Promise<HubspotWorkflowEnrollmentResponse> {
    // HubSpot workflows v3 enrollment endpoint: /automation/v2/workflows/:id/enrollments/contacts/:email
    const url = `/automation/v2/workflows/${encodeURIComponent(req.workflow_id)}/enrollments/contacts/${encodeURIComponent(req.contact_email)}`;
    const res = await this.request("POST", url, {});
    if (!res.ok) {
      throw new HubspotHttpError(`enrollment returned ${res.status}`, res.status);
    }
    return {
      workflow_id: req.workflow_id,
      contact_email: req.contact_email,
      enrolled_at: new Date().toISOString(),
    };
  }

  // ------------------------- Internals -------------------------

  private async request(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      authorization: `Bearer ${this.apiKey}`,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class HubspotHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "HubspotHttpError";
  }
}

function flattenProperties(p: HubspotContactProperties): Record<string, string> {
  const out: Record<string, string> = { email: p.email };
  if (p.firstname) out.firstname = p.firstname;
  if (p.lastname) out.lastname = p.lastname;
  if (p.company) out.company = p.company;
  if (p.jobtitle) out.jobtitle = p.jobtitle;
  if (p.phone) out.phone = p.phone;
  if (p.extra) for (const [k, v] of Object.entries(p.extra)) out[k] = v;
  return out;
}
