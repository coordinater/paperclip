/**
 * chinese-video plugin manifest · M6-01 MVP scaffold.
 *
 * E1 中文短视频/图文 agent · handbook §M6-01.
 * v0.1 scaffold · 5 项 M3-03 kick-off TODO(user-decision) 定后启动装配.
 * 平台 API 假设(douyin/xhs/weixin video/wechat mp) TODO(team-verify) after account provisioned.
 */
import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "ai-company.paperclip-plugin-chinese-video";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: "0.0.1-alpha.0",
  displayName: "Chinese Short Video Agent (E1)",
  description:
    "中文短视频/图文 agent · 抖音/小红书/微信视频号/公众号 · M6-01 MVP scaffold.",
  author: "ai-company",
  categories: ["agent"],
  capabilities: [
    "webhooks.receive",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "http.outbound",
    "secrets.read-ref",
    "issues.read",
    "issues.write",
  ],
  entrypoints: { worker: "./dist/worker.js" },
  webhooks: [
    {
      endpointKey: "create-piece",
      displayName: "Create a Chinese short video/image piece",
      description:
        "POST body { topic, target_platform, content_type, tone_preset } → orchestrator plans skill chain · returns plan",
    },
    {
      endpointKey: "publish-piece",
      displayName: "Publish a completed piece to platform",
      description:
        "POST body { piece_id, platform } → dispatch to platform worker · scaffold only until team API keys provisioned",
    },
  ],
};

export default manifest;
