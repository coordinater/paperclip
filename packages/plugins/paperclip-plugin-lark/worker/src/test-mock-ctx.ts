/**
 * Test-only mock PluginContext factory. Kept in `src/` (not `test/`) so
 * TypeScript project references pick it up without extra tsconfig plumbing.
 *
 * Only implements the surface actually touched by the plugin — everything
 * else throws with a descriptive error so tests fail loudly if they trip
 * an unmocked SDK call.
 */

import type { PluginContext, ScopeKey } from "@paperclipai/plugin-sdk";

export interface MockPluginContext extends PluginContext {
  __state: Map<string, unknown>;
  __secrets: Map<string, string>;
  __logs: Array<{ level: string; message: string; meta?: Record<string, unknown> }>;
  __activityLog: Array<Record<string, unknown>>;
}

function scopeKeyToString(key: ScopeKey): string {
  const ns = key.namespace ?? "default";
  return `${key.scopeKind}|${key.scopeId ?? ""}|${ns}|${key.stateKey}`;
}

function notImplemented(name: string): never {
  throw new Error(`test-mock-ctx: ${name} is not implemented (unexpected SDK call)`);
}

export function createMockCtx(overrides?: {
  secrets?: Record<string, string>;
  initialState?: Record<string, unknown>;
}): MockPluginContext {
  const state = new Map<string, unknown>();
  const secrets = new Map<string, string>(
    Object.entries(overrides?.secrets ?? {}),
  );
  const logs: MockPluginContext["__logs"] = [];
  const activityLog: MockPluginContext["__activityLog"] = [];

  if (overrides?.initialState) {
    for (const [k, v] of Object.entries(overrides.initialState)) {
      state.set(k, v);
    }
  }

  const ctx: Partial<MockPluginContext> = {
    __state: state,
    __secrets: secrets,
    __logs: logs,
    __activityLog: activityLog,
    manifest: {
      id: "ai-company.paperclip-plugin-lark",
      apiVersion: 1,
      version: "0.0.0-test",
      displayName: "test",
      description: "test",
      author: "test",
      categories: ["connector"],
      capabilities: [],
      entrypoints: { worker: "./dist/worker.js" },
    },
    logger: {
      info: (message, meta) => logs.push({ level: "info", message, meta }),
      warn: (message, meta) => logs.push({ level: "warn", message, meta }),
      error: (message, meta) => logs.push({ level: "error", message, meta }),
      debug: (message, meta) => logs.push({ level: "debug", message, meta }),
    },
    secrets: {
      async resolve(ref: string): Promise<string> {
        const value = secrets.get(ref);
        if (value == null) {
          throw new Error(`test-mock-ctx: secret ${ref} not configured`);
        }
        return value;
      },
    },
    state: {
      async get(input: ScopeKey): Promise<unknown> {
        return state.has(scopeKeyToString(input))
          ? (state.get(scopeKeyToString(input)) as unknown)
          : null;
      },
      async set(input: ScopeKey, value: unknown): Promise<void> {
        state.set(scopeKeyToString(input), value);
      },
      async delete(input: ScopeKey): Promise<void> {
        state.delete(scopeKeyToString(input));
      },
    },
    activity: {
      async log(entry) {
        activityLog.push(entry as Record<string, unknown>);
      },
    },
    // Unused-but-required surface: throw on access
    config: new Proxy({}, { get: () => notImplemented("ctx.config") }) as never,
    localFolders: new Proxy({}, { get: () => notImplemented("ctx.localFolders") }) as never,
    events: new Proxy({}, { get: () => notImplemented("ctx.events") }) as never,
    jobs: new Proxy({}, { get: () => notImplemented("ctx.jobs") }) as never,
    launchers: new Proxy({}, { get: () => notImplemented("ctx.launchers") }) as never,
    db: new Proxy({}, { get: () => notImplemented("ctx.db") }) as never,
    http: new Proxy({}, { get: () => notImplemented("ctx.http") }) as never,
    entities: new Proxy({}, { get: () => notImplemented("ctx.entities") }) as never,
    projects: new Proxy({}, { get: () => notImplemented("ctx.projects") }) as never,
    executionWorkspaces: new Proxy({}, { get: () => notImplemented("ctx.executionWorkspaces") }) as never,
    routines: new Proxy({}, { get: () => notImplemented("ctx.routines") }) as never,
    skills: new Proxy({}, { get: () => notImplemented("ctx.skills") }) as never,
    companies: new Proxy({}, { get: () => notImplemented("ctx.companies") }) as never,
    issues: new Proxy({}, { get: () => notImplemented("ctx.issues") }) as never,
    agents: new Proxy({}, { get: () => notImplemented("ctx.agents") }) as never,
    goals: new Proxy({}, { get: () => notImplemented("ctx.goals") }) as never,
    access: new Proxy({}, { get: () => notImplemented("ctx.access") }) as never,
    authorization: new Proxy({}, { get: () => notImplemented("ctx.authorization") }) as never,
    data: new Proxy({}, { get: () => notImplemented("ctx.data") }) as never,
    actions: new Proxy({}, { get: () => notImplemented("ctx.actions") }) as never,
    streams: new Proxy({}, { get: () => notImplemented("ctx.streams") }) as never,
    tools: new Proxy({}, { get: () => notImplemented("ctx.tools") }) as never,
    metrics: new Proxy({}, { get: () => notImplemented("ctx.metrics") }) as never,
    telemetry: new Proxy({}, { get: () => notImplemented("ctx.telemetry") }) as never,
  };

  return ctx as MockPluginContext;
}
