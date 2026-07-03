import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import yaml from "js-yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const YAML_PATH = resolve(HERE, "workspace-runtime-services.yaml");

export interface RuntimeServiceSpec {
  name: string;
  command: string;
  cwd: string;
  lifecycle: "shared" | "ephemeral";
}

export interface AiCompanyRuntimeConfig {
  workspaceRuntime: {
    services: RuntimeServiceSpec[];
    jobs: unknown[];
  };
  desiredState: "running" | "stopped" | "manual";
  serviceStates: Record<string, "running" | "stopped" | "manual">;
}

export function loadAiCompanyRuntimeConfig(path: string = YAML_PATH): AiCompanyRuntimeConfig {
  const raw = readFileSync(path, "utf-8");
  const parsed = yaml.load(raw) as { workspaceRuntime: unknown; [k: string]: unknown };

  const wr = (parsed?.workspaceRuntime ?? null) as
    | { services?: unknown; jobs?: unknown; desiredState?: unknown; serviceStates?: unknown }
    | null;
  if (!wr) throw new Error(`workspaceRuntime missing in ${path}`);

  const services = normalizeServices(wr.services);
  const jobs = Array.isArray(wr.jobs) ? wr.jobs : [];
  const desiredState = normalizeDesiredState(wr.desiredState);
  const serviceStates = normalizeServiceStates(wr.serviceStates);

  return {
    workspaceRuntime: { services, jobs },
    desiredState,
    serviceStates,
  };
}

function normalizeServices(input: unknown): RuntimeServiceSpec[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const command = typeof e.command === "string" ? e.command.trim() : "";
    const cwd = typeof e.cwd === "string" ? e.cwd.trim() : "";
    const lifecycle = e.lifecycle === "ephemeral" ? "ephemeral" : "shared";
    if (!name || !command) return [];
    return [{ name, command, cwd, lifecycle }] as const;
  });
}

function normalizeDesiredState(input: unknown): "running" | "stopped" | "manual" {
  return input === "stopped" || input === "manual" ? input : "running";
}

function normalizeServiceStates(input: unknown): Record<string, "running" | "stopped" | "manual"> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: Record<string, "running" | "stopped" | "manual"> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === "running" || v === "stopped" || v === "manual") out[k] = v;
  }
  return out;
}

export const CANONICAL_YAML_PATH = YAML_PATH;
