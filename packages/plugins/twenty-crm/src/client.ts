/**
 * Twenty CRM GraphQL client · M4-03 MVP.
 *
 * Twenty exposes a GraphQL-first API · we wrap it with a thin fetchImpl-injected
 * client (Pattern-3 · same as hubspot-breeze). All queries are formatted
 * strings · no codegen dependency for MVP.
 *
 * TODO(team-verify): after Twenty docker-compose up (P1-12) · confirm actual
 * GraphQL schema via introspection · `curl -X POST http://localhost:3001/graphql
 * -d '{"query":"query{__schema{types{name}}}"}'`
 */

export interface TwentyClientConfig {
  apiKey: string;
  endpointUrl: string; // e.g. http://localhost:3001/graphql
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

// ------------------------- Object types (subset) -------------------------

export interface TwentyCompany {
  id: string;
  name: string;
  domainName?: string;
  employees?: number;
}

export interface TwentyPerson {
  id: string;
  name: { firstName: string; lastName: string };
  email?: string;
  jobTitle?: string;
  companyId?: string;
}

export interface TwentyOpportunity {
  id: string;
  name: string;
  stage: "NEW" | "SCREENING" | "MEETING" | "PROPOSAL" | "CUSTOMER";
  amount?: number;
  companyId?: string;
}

export interface TwentyNote {
  id: string;
  title: string;
  body: string;
  targetType: "Company" | "Person" | "Opportunity";
  targetId: string;
}

// ------------------------- Request types -------------------------

export interface CreateCompanyInput {
  name: string;
  domainName?: string;
  employees?: number;
}

export interface CreatePersonInput {
  firstName: string;
  lastName: string;
  email?: string;
  jobTitle?: string;
  companyId?: string;
}

export interface CreateOpportunityInput {
  name: string;
  stage: TwentyOpportunity["stage"];
  amount?: number;
  companyId?: string;
}

export interface CreateNoteInput {
  title: string;
  body: string;
  targetType: TwentyNote["targetType"];
  targetId: string;
}

// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 20_000;

export class TwentyClient {
  private readonly apiKey: string;
  private readonly endpointUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: TwentyClientConfig) {
    if (!config.apiKey) throw new Error("TwentyClient: apiKey required");
    if (!config.endpointUrl) throw new Error("TwentyClient: endpointUrl required");
    this.apiKey = config.apiKey;
    this.endpointUrl = config.endpointUrl;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  // ------------------------- Companies -------------------------

  async createCompany(input: CreateCompanyInput): Promise<TwentyCompany> {
    const mutation = `
      mutation CreateCompany($data: CompanyCreateInput!) {
        createCompany(data: $data) { id name domainName employees }
      }`;
    const data = await this.gql<{ createCompany: TwentyCompany }>(mutation, {
      data: input,
    });
    return data.createCompany;
  }

  async findCompanyByDomain(domain: string): Promise<TwentyCompany | null> {
    const query = `
      query FindCompany($domain: String!) {
        companies(filter: { domainName: { eq: $domain } }, limit: 1) {
          edges { node { id name domainName employees } }
        }
      }`;
    const data = await this.gql<{
      companies: { edges: Array<{ node: TwentyCompany }> };
    }>(query, { domain });
    return data.companies.edges[0]?.node ?? null;
  }

  // ------------------------- Persons -------------------------

  async createPerson(input: CreatePersonInput): Promise<TwentyPerson> {
    const mutation = `
      mutation CreatePerson($data: PersonCreateInput!) {
        createPerson(data: $data) {
          id name { firstName lastName } email jobTitle companyId
        }
      }`;
    const data = await this.gql<{ createPerson: TwentyPerson }>(mutation, {
      data: input,
    });
    return data.createPerson;
  }

  async findPersonByEmail(email: string): Promise<TwentyPerson | null> {
    const query = `
      query FindPerson($email: String!) {
        persons(filter: { email: { eq: $email } }, limit: 1) {
          edges { node { id name { firstName lastName } email jobTitle companyId } }
        }
      }`;
    const data = await this.gql<{
      persons: { edges: Array<{ node: TwentyPerson }> };
    }>(query, { email });
    return data.persons.edges[0]?.node ?? null;
  }

  // ------------------------- Opportunities -------------------------

  async createOpportunity(input: CreateOpportunityInput): Promise<TwentyOpportunity> {
    const mutation = `
      mutation CreateOpportunity($data: OpportunityCreateInput!) {
        createOpportunity(data: $data) {
          id name stage amount companyId
        }
      }`;
    const data = await this.gql<{ createOpportunity: TwentyOpportunity }>(
      mutation,
      { data: input },
    );
    return data.createOpportunity;
  }

  async updateOpportunityStage(
    id: string,
    stage: TwentyOpportunity["stage"],
  ): Promise<TwentyOpportunity> {
    const mutation = `
      mutation UpdateOpportunity($id: ID!, $stage: OpportunityStage!) {
        updateOpportunity(id: $id, data: { stage: $stage }) {
          id name stage amount companyId
        }
      }`;
    const data = await this.gql<{ updateOpportunity: TwentyOpportunity }>(
      mutation,
      { id, stage },
    );
    return data.updateOpportunity;
  }

  // ------------------------- Notes -------------------------

  async createNote(input: CreateNoteInput): Promise<TwentyNote> {
    const mutation = `
      mutation CreateNote($data: NoteCreateInput!) {
        createNote(data: $data) { id title body targetType targetId }
      }`;
    const data = await this.gql<{ createNote: TwentyNote }>(mutation, {
      data: input,
    });
    return data.createNote;
  }

  // ------------------------- Internals -------------------------

  private async gql<T>(
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.endpointUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new TwentyHttpError(`GraphQL HTTP ${res.status}`, res.status);
      }
      const body = (await res.json()) as {
        data?: T;
        errors?: Array<{ message: string }>;
      };
      if (body.errors && body.errors.length > 0) {
        throw new TwentyGraphQLError(
          `GraphQL errors: ${body.errors.map((e) => e.message).join("; ")}`,
        );
      }
      if (!body.data) {
        throw new TwentyGraphQLError("No data in response");
      }
      return body.data;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class TwentyHttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "TwentyHttpError";
  }
}

export class TwentyGraphQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TwentyGraphQLError";
  }
}
