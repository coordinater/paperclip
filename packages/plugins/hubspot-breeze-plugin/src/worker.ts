/**
 * HubSpot Breeze plugin worker.
 *
 * Three webhooks:
 *   - `create-contact`   → HubspotClient.createContact
 *   - `upsert-deal`      → HubspotClient.upsertDeal
 *   - `trigger-workflow` → HubspotClient.triggerWorkflow
 */

import { HubspotClient, HubspotHttpError } from "./client.js";
import type {
  CreateContactRequest,
  TriggerWorkflowRequest,
  UpsertDealRequest,
} from "./client.js";
export { default as manifest } from "./manifest.js";
export { HubspotClient, HubspotHttpError } from "./client.js";

export interface WebhookInput {
  endpointKey: string;
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
}
export interface WebhookResponse {
  status: number;
  body?: unknown;
}
export interface HubspotPluginCtx {
  getClient: () => Promise<HubspotClient> | HubspotClient;
  logActivity?: (action: string, details: Record<string, unknown>) => Promise<void>;
}

export async function onWebhook(
  input: WebhookInput,
  ctx: HubspotPluginCtx,
): Promise<WebhookResponse> {
  if (input.method && input.method.toUpperCase() !== "POST") {
    return { status: 405, body: { error: "method_not_allowed", allowed: ["POST"] } };
  }

  try {
    switch (input.endpointKey) {
      case "create-contact":
        return await handleCreateContact(input, ctx);
      case "upsert-deal":
        return await handleUpsertDeal(input, ctx);
      case "trigger-workflow":
        return await handleTriggerWorkflow(input, ctx);
      default:
        return {
          status: 404,
          body: { error: "unknown_endpoint", endpointKey: input.endpointKey },
        };
    }
  } catch (err) {
    if (err instanceof HubspotHttpError) {
      return {
        status: 502,
        body: { error: "hubspot_upstream_error", status: err.status, message: err.message },
      };
    }
    return {
      status: 500,
      body: { error: "internal_error", message: err instanceof Error ? err.message : String(err) },
    };
  }
}

async function handleCreateContact(
  input: WebhookInput,
  ctx: HubspotPluginCtx,
): Promise<WebhookResponse> {
  const parsed = parseCreateContact(input.body);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_body", detail: parsed.error } };

  const client = await ctx.getClient();
  const resp = await client.createContact(parsed.value);
  await ctx.logActivity?.("hubspot_contact_created", {
    contact_id: resp.contact_id,
    email: resp.email,
    idempotent: parsed.value.idempotent === true,
  });
  return { status: 200, body: resp };
}

async function handleUpsertDeal(
  input: WebhookInput,
  ctx: HubspotPluginCtx,
): Promise<WebhookResponse> {
  const parsed = parseUpsertDeal(input.body);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_body", detail: parsed.error } };

  const client = await ctx.getClient();
  const resp = await client.upsertDeal(parsed.value);
  await ctx.logActivity?.("hubspot_deal_upserted", {
    deal_id: resp.deal_id,
    dealname: resp.dealname,
  });
  return { status: 200, body: resp };
}

async function handleTriggerWorkflow(
  input: WebhookInput,
  ctx: HubspotPluginCtx,
): Promise<WebhookResponse> {
  const parsed = parseTriggerWorkflow(input.body);
  if (!parsed.ok) return { status: 400, body: { error: "invalid_body", detail: parsed.error } };

  const client = await ctx.getClient();
  const resp = await client.triggerWorkflow(parsed.value);
  await ctx.logActivity?.("hubspot_workflow_triggered", {
    workflow_id: resp.workflow_id,
    contact_email: resp.contact_email,
  });
  return { status: 200, body: resp };
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseCreateContact(raw: unknown): ParseResult<CreateContactRequest> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const properties = obj.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return { ok: false, error: "properties required" };
  }
  const p = properties as Record<string, unknown>;
  const email = typeof p.email === "string" ? p.email.trim() : "";
  if (!email || !email.includes("@")) return { ok: false, error: "properties.email must be a valid email" };

  const value: CreateContactRequest = {
    properties: {
      email,
      ...(typeof p.firstname === "string" ? { firstname: p.firstname } : {}),
      ...(typeof p.lastname === "string" ? { lastname: p.lastname } : {}),
      ...(typeof p.company === "string" ? { company: p.company } : {}),
      ...(typeof p.jobtitle === "string" ? { jobtitle: p.jobtitle } : {}),
      ...(typeof p.phone === "string" ? { phone: p.phone } : {}),
    },
  };
  if (obj.idempotent === true) value.idempotent = true;
  return { ok: true, value };
}

export function parseUpsertDeal(raw: unknown): ParseResult<UpsertDealRequest> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const dealname = typeof obj.dealname === "string" ? obj.dealname.trim() : "";
  if (!dealname) return { ok: false, error: "dealname required" };

  const value: UpsertDealRequest = { dealname };
  if (typeof obj.amount === "number") value.amount = obj.amount;
  if (typeof obj.pipeline === "string") value.pipeline = obj.pipeline;
  if (typeof obj.dealstage === "string") value.dealstage = obj.dealstage;
  if (Array.isArray(obj.associate_contact_ids)) {
    const ids: string[] = [];
    for (const id of obj.associate_contact_ids) {
      if (typeof id === "string") ids.push(id);
    }
    if (ids.length > 0) value.associate_contact_ids = ids;
  }
  return { ok: true, value };
}

export function parseTriggerWorkflow(raw: unknown): ParseResult<TriggerWorkflowRequest> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  const workflow_id = typeof obj.workflow_id === "string" ? obj.workflow_id.trim() : "";
  const contact_email = typeof obj.contact_email === "string" ? obj.contact_email.trim() : "";
  if (!workflow_id) return { ok: false, error: "workflow_id required" };
  if (!contact_email || !contact_email.includes("@")) {
    return { ok: false, error: "contact_email must be valid email" };
  }
  return { ok: true, value: { workflow_id, contact_email } };
}

export default { onWebhook };
