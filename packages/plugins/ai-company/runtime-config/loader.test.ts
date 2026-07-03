import { describe, expect, it } from "vitest";
import {
  listWorkspaceServiceCommandDefinitions,
  matchWorkspaceRuntimeServiceToCommand,
} from "@paperclipai/shared/workspace-commands";
import type { WorkspaceRuntimeService } from "@paperclipai/shared/types/workspace-runtime";
import { loadAiCompanyRuntimeConfig } from "./loader.js";

describe("ai-company workspace-runtime-services.yaml", () => {
  const cfg = loadAiCompanyRuntimeConfig();

  it("parses canonical yaml with expected services", () => {
    const names = cfg.workspaceRuntime.services.map((s) => s.name);
    expect(names).toEqual(["codebase-memory-mcp", "pyrefly-verifier"]);
  });

  it("codebase-memory-mcp is shared lifecycle listening on 9749", () => {
    const svc = cfg.workspaceRuntime.services.find((s) => s.name === "codebase-memory-mcp");
    expect(svc?.lifecycle).toBe("shared");
    expect(svc?.command).toContain("--port 9749");
  });

  it("pyrefly-verifier is ephemeral lifecycle", () => {
    const svc = cfg.workspaceRuntime.services.find((s) => s.name === "pyrefly-verifier");
    expect(svc?.lifecycle).toBe("ephemeral");
    expect(svc?.command).toMatch(/^pyrefly check/);
  });

  it("desiredState is running", () => {
    expect(cfg.desiredState).toBe("running");
  });

  it("serviceStates auto-start codebase-memory-mcp, manual for pyrefly", () => {
    expect(cfg.serviceStates["codebase-memory-mcp"]).toBe("running");
    expect(cfg.serviceStates["pyrefly-verifier"]).toBe("manual");
  });
});

describe("interop with paperclip main-line workspace-commands", () => {
  const cfg = loadAiCompanyRuntimeConfig();
  const workspaceRuntime: Record<string, unknown> = {
    services: cfg.workspaceRuntime.services,
    jobs: cfg.workspaceRuntime.jobs,
  };

  it("listWorkspaceServiceCommandDefinitions resolves both services", () => {
    const defs = listWorkspaceServiceCommandDefinitions(workspaceRuntime);
    expect(defs).toHaveLength(2);
    expect(defs.map((d) => d.name)).toEqual(["codebase-memory-mcp", "pyrefly-verifier"]);
    expect(defs.map((d) => d.kind)).toEqual(["service", "service"]);
    expect(defs[0]?.lifecycle).toBe("shared");
    expect(defs[1]?.lifecycle).toBe("ephemeral");
  });

  it("matchWorkspaceRuntimeServiceToCommand can bind a runtime row back to codebase-memory-mcp", () => {
    const defs = listWorkspaceServiceCommandDefinitions(workspaceRuntime);
    const codebaseCmd = defs.find((d) => d.name === "codebase-memory-mcp")!;

    const fakeRuntimeRow: Pick<WorkspaceRuntimeService, "configIndex" | "serviceName" | "command" | "cwd"> = {
      configIndex: 0,
      serviceName: "codebase-memory-mcp",
      command: codebaseCmd.command,
      cwd: codebaseCmd.cwd,
    };

    const matched = matchWorkspaceRuntimeServiceToCommand(codebaseCmd, [fakeRuntimeRow]);
    expect(matched).toBe(fakeRuntimeRow);
  });

  it("service id slugification is stable across yaml regeneration", () => {
    const defs = listWorkspaceServiceCommandDefinitions(workspaceRuntime);
    expect(defs[0]?.id).toBe("service:codebase-memory-mcp");
    expect(defs[1]?.id).toBe("service:pyrefly-verifier");
  });
});
