/**
 * Plugin manifest for @ai-company/paperclip-plugin-meridian-http.
 *
 * M2 W7-D3 · Marketing Mix Modeling 科学层 · 手册 §W7.D3.
 *
 * 用途：调 Google Meridian (github.com/google/meridian, 2025 GA) 跑 MMM ——
 * 输入 media spend + revenue time series → 输出 channel ROI + saturation curves.
 * Meridian 是 TensorFlow + Bayesian 库 · 太重不能在 Node 端直跑 · 走 FastAPI wrap.
 *
 * 架构：team 侧 Python 服务（FastAPI wrap `google/meridian`）· 本 TS plugin
 * 通过 HTTP 调用。M2 只做 skeleton + client · 真实 Meridian 训练/推理由 team
 * 补 Python 服务后启用。
 *
 * SDK 契约：webhook `run-mmm` + `get-mmm-report` + `jobs.schedule` cron.
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-meridian-http";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "Meridian MMM",
  description:
    "HTTP client for Google Meridian marketing mix modeling. M2 W7-D3 科学层.",
  author: "ai-company",
  categories: ["automation"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
    "jobs.schedule",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  webhooks: [
    {
      endpointKey: "run-mmm",
      displayName: "Kick off a new MMM run",
      description:
        "POST body `RunMmmRequest` (dataset id / date range / seed). Client forwards to the FastAPI wrapper; response includes run_id. Actual training happens on the Python side; poll `get-mmm-report` for results.",
    },
    {
      endpointKey: "get-mmm-report",
      displayName: "Fetch MMM report",
      description:
        "GET/POST endpoint returning a completed MMM report by run_id, or {status: 'running'} if still training.",
    },
  ],
  jobs: [
    {
      jobKey: "weekly-mmm-refresh",
      displayName: "Refresh MMM weekly",
      description:
        "Cron: kicks a new MMM run every Monday 05:00 UTC to keep channel ROI curves fresh. M2 skeleton — real cadence tunable from company config in M3.",
      schedule: "0 5 * * 1",
    },
  ],
};

export default manifest;
