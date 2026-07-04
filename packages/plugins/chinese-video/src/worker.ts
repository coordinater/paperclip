/**
 * chinese-video plugin worker · onWebhook dispatch · M6-01 MVP scaffold.
 */

import { planPiece, type PieceInput } from "./orchestrator.js";

export interface WebhookInput {
  endpointKey: string;
  body?: unknown;
}

export interface WebhookResponse {
  status: number;
  body: unknown;
}

export function dispatchWebhook(input: WebhookInput): WebhookResponse {
  switch (input.endpointKey) {
    case "create-piece":
      return handleCreatePiece(input.body);
    case "publish-piece":
      return handlePublishPiece(input.body);
    default:
      return { status: 404, body: { error: `unknown endpoint: ${input.endpointKey}` } };
  }
}

function handleCreatePiece(body: unknown): WebhookResponse {
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "body must be object" } };
  }
  const b = body as Record<string, unknown>;
  const required = ["topic", "target_platform", "content_type", "tone_preset"];
  for (const k of required) {
    if (!(k in b)) return { status: 400, body: { error: `missing field: ${k}` } };
  }
  const plan = planPiece(b as unknown as PieceInput);
  return {
    status: 202,
    body: {
      piece_id: plan.piece_id,
      steps_count: plan.steps.length,
      shared_memory_scope: plan.shared_memory_scope,
      warnings: plan.warnings,
    },
  };
}

function handlePublishPiece(body: unknown): WebhookResponse {
  if (!body || typeof body !== "object") {
    return { status: 400, body: { error: "body must be object" } };
  }
  const b = body as { piece_id?: string; platform?: string };
  if (!b.piece_id || !b.platform) {
    return { status: 400, body: { error: "missing piece_id or platform" } };
  }
  // Scaffold · real impl calls platform API
  return {
    status: 202,
    body: {
      accepted: true,
      note: `publish-piece scaffold · v0.1 dumps to shared memory · team manual upload · piece_id=${b.piece_id} platform=${b.platform}`,
    },
  };
}
