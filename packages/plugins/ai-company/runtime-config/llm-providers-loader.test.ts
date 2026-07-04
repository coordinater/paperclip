import { describe, expect, it } from "vitest";
import {
  findProvider,
  loadLlmProvidersConfig,
  providerHasModel,
} from "./llm-providers-loader.js";

describe("loadLlmProvidersConfig", () => {
  const cfg = loadLlmProvidersConfig();

  it("loads volcengine_ark as the M2 W8-D2 canonical provider", () => {
    const provider = findProvider(cfg, "volcengine_ark");
    expect(provider).not.toBeNull();
    expect(provider?.endpoint).toBe("https://ark.cn-beijing.volces.com/api/v3");
    expect(provider?.api_key_ref).toBe("company_secrets.volcengine_ark_key");
    expect(provider?.region).toBe("cn-beijing");
  });

  it("volcengine_ark exposes doubao + deepseek + qwen models", () => {
    const provider = findProvider(cfg, "volcengine_ark")!;
    const ids = provider.models.map((m) => m.id);
    expect(ids).toContain("doubao-1.5-pro-256k");
    expect(ids).toContain("doubao-1.5-lite-32k");
    expect(ids).toContain("deepseek-v3-241226");
    expect(ids).toContain("qwen-plus");
  });

  it("volcengine_ark default_model is doubao-1.5-pro-256k", () => {
    const provider = findProvider(cfg, "volcengine_ark")!;
    expect(provider.default_model).toBe("doubao-1.5-pro-256k");
  });

  it("doubao-1.5-pro-256k has 256k context_length", () => {
    const provider = findProvider(cfg, "volcengine_ark")!;
    const model = provider.models.find((m) => m.id === "doubao-1.5-pro-256k");
    expect(model?.context_length).toBe(262144);
    expect(model?.supports_streaming).toBe(true);
  });

  it("providerHasModel narrows correctly", () => {
    const provider = findProvider(cfg, "volcengine_ark")!;
    expect(providerHasModel(provider, "doubao-1.5-pro-256k")).toBe(true);
    expect(providerHasModel(provider, "gpt-9")).toBe(false);
  });

  it("returns null for unknown provider", () => {
    expect(findProvider(cfg, "nonexistent")).toBeNull();
  });

  it("tags include the 'chinese' + 'cost-effective' + 'cn-region' hints", () => {
    const provider = findProvider(cfg, "volcengine_ark")!;
    expect(provider.tags).toEqual(expect.arrayContaining(["chinese", "cost-effective", "cn-region"]));
  });
});
