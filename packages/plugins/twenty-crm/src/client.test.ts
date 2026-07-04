import { describe, expect, it, vi } from "vitest";
import { TwentyClient, TwentyGraphQLError, TwentyHttpError } from "./client.js";

const CONFIG = {
  apiKey: "twenty-key",
  endpointUrl: "https://twenty.example.com/graphql",
};

function makeMockFetch(response: { status?: number; body?: unknown }) {
  return vi.fn(async () => {
    const status = response.status ?? 200;
    return new Response(JSON.stringify(response.body ?? {}), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
}

describe("TwentyClient · constructor validation", () => {
  it("throws without apiKey", () => {
    expect(() => new TwentyClient({ apiKey: "", endpointUrl: "u" })).toThrow(
      /apiKey required/,
    );
  });

  it("throws without endpointUrl", () => {
    expect(() => new TwentyClient({ apiKey: "k", endpointUrl: "" })).toThrow(
      /endpointUrl required/,
    );
  });
});

describe("TwentyClient · createCompany", () => {
  it("returns TwentyCompany when GraphQL succeeds", async () => {
    const fakeFetch = makeMockFetch({
      body: {
        data: {
          createCompany: {
            id: "co-1",
            name: "AI Co",
            domainName: "ai.co",
            employees: 5,
          },
        },
      },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const co = await client.createCompany({ name: "AI Co", domainName: "ai.co" });
    expect(co.id).toBe("co-1");
    expect(co.name).toBe("AI Co");
  });

  it("throws TwentyGraphQLError on errors[]", async () => {
    const fakeFetch = makeMockFetch({
      body: { errors: [{ message: "duplicate domain" }] },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    await expect(
      client.createCompany({ name: "AI Co", domainName: "ai.co" }),
    ).rejects.toThrow(TwentyGraphQLError);
  });

  it("throws TwentyHttpError on non-200", async () => {
    const fakeFetch = makeMockFetch({ status: 500 });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    await expect(client.createCompany({ name: "AI Co" })).rejects.toThrow(
      TwentyHttpError,
    );
  });
});

describe("TwentyClient · findCompanyByDomain", () => {
  it("returns first match", async () => {
    const fakeFetch = makeMockFetch({
      body: {
        data: {
          companies: {
            edges: [
              {
                node: {
                  id: "co-1",
                  name: "AI Co",
                  domainName: "ai.co",
                  employees: 5,
                },
              },
            ],
          },
        },
      },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const co = await client.findCompanyByDomain("ai.co");
    expect(co?.id).toBe("co-1");
  });

  it("returns null when no match", async () => {
    const fakeFetch = makeMockFetch({
      body: { data: { companies: { edges: [] } } },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const co = await client.findCompanyByDomain("nowhere.io");
    expect(co).toBeNull();
  });
});

describe("TwentyClient · createPerson", () => {
  it("returns TwentyPerson with nested name", async () => {
    const fakeFetch = makeMockFetch({
      body: {
        data: {
          createPerson: {
            id: "p-1",
            name: { firstName: "Alice", lastName: "Smith" },
            email: "alice@example.com",
            jobTitle: "PM",
            companyId: "co-1",
          },
        },
      },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const p = await client.createPerson({
      firstName: "Alice",
      lastName: "Smith",
      email: "alice@example.com",
    });
    expect(p.name.firstName).toBe("Alice");
  });
});

describe("TwentyClient · Opportunities", () => {
  it("createOpportunity returns object with stage NEW", async () => {
    const fakeFetch = makeMockFetch({
      body: {
        data: {
          createOpportunity: {
            id: "op-1",
            name: "Big Deal",
            stage: "NEW",
            amount: 10000,
            companyId: "co-1",
          },
        },
      },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const op = await client.createOpportunity({ name: "Big Deal", stage: "NEW" });
    expect(op.stage).toBe("NEW");
  });

  it("updateOpportunityStage returns updated stage", async () => {
    const fakeFetch = makeMockFetch({
      body: {
        data: {
          updateOpportunity: {
            id: "op-1",
            name: "Big Deal",
            stage: "MEETING",
            amount: 10000,
          },
        },
      },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const op = await client.updateOpportunityStage("op-1", "MEETING");
    expect(op.stage).toBe("MEETING");
  });
});

describe("TwentyClient · Notes", () => {
  it("createNote returns note with correct target", async () => {
    const fakeFetch = makeMockFetch({
      body: {
        data: {
          createNote: {
            id: "n-1",
            title: "activity_log entry",
            body: "PR merged by AI",
            targetType: "Opportunity",
            targetId: "op-1",
          },
        },
      },
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    const n = await client.createNote({
      title: "activity_log entry",
      body: "PR merged by AI",
      targetType: "Opportunity",
      targetId: "op-1",
    });
    expect(n.targetType).toBe("Opportunity");
  });
});

describe("TwentyClient · GraphQL error handling", () => {
  it("wraps HTTP timeout / abort correctly (defensive path)", async () => {
    const fakeFetch = vi.fn(async () => {
      throw new Error("aborted");
    });
    const client = new TwentyClient({
      ...CONFIG,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });
    await expect(client.createCompany({ name: "X" })).rejects.toThrow();
  });
});
