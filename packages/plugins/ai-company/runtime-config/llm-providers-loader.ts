import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import yaml from "js-yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = resolve(HERE, "llm-providers.yaml");

export interface LlmModelSpec {
  id: string;
  displayName?: string;
  context_length?: number;
  supports_streaming?: boolean;
}

export interface LlmProviderSpec {
  name: string;
  displayName?: string;
  endpoint: string;
  api_key_ref: string;
  api_style?: string;
  region?: string;
  models: LlmModelSpec[];
  default_model?: string;
  tags?: string[];
}

export interface LlmProvidersConfig {
  llmProviders: LlmProviderSpec[];
}

export function loadLlmProvidersConfig(path: string = YAML_PATH): LlmProvidersConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = yaml.load(raw) as { llmProviders?: unknown };
  if (!parsed || !Array.isArray(parsed.llmProviders)) {
    throw new Error(`llmProviders array missing in ${path}`);
  }
  const providers: LlmProviderSpec[] = [];
  for (const raw of parsed.llmProviders as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (typeof p.name !== "string" || typeof p.endpoint !== "string" || typeof p.api_key_ref !== "string") {
      continue;
    }
    providers.push({
      name: p.name,
      displayName: typeof p.displayName === "string" ? p.displayName : undefined,
      endpoint: p.endpoint,
      api_key_ref: p.api_key_ref,
      api_style: typeof p.api_style === "string" ? p.api_style : undefined,
      region: typeof p.region === "string" ? p.region : undefined,
      models: normalizeModels(p.models),
      default_model: typeof p.default_model === "string" ? p.default_model : undefined,
      tags: Array.isArray(p.tags) ? (p.tags as unknown[]).filter((t): t is string => typeof t === "string") : undefined,
    });
  }
  return { llmProviders: providers };
}

function normalizeModels(input: unknown): LlmModelSpec[] {
  if (!Array.isArray(input)) return [];
  const out: LlmModelSpec[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== "string" || m.id.length === 0) continue;
    out.push({
      id: m.id,
      displayName: typeof m.displayName === "string" ? m.displayName : undefined,
      context_length: typeof m.context_length === "number" ? m.context_length : undefined,
      supports_streaming: typeof m.supports_streaming === "boolean" ? m.supports_streaming : undefined,
    });
  }
  return out;
}

export function findProvider(cfg: LlmProvidersConfig, name: string): LlmProviderSpec | null {
  return cfg.llmProviders.find((p) => p.name === name) ?? null;
}

export function providerHasModel(provider: LlmProviderSpec, modelId: string): boolean {
  return provider.models.some((m) => m.id === modelId);
}

export const LLM_PROVIDERS_YAML_PATH = YAML_PATH;
