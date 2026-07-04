/**
 * chinese-video orchestrator · M6-01 MVP scaffold.
 *
 * Pattern-4 · planPiece(input) → PiecePlan · pure function.
 * Platform-aware step chaining. Skills referenced but not implemented:
 * - `content-adaptation` (SKILL M6-01A · content 平台化改写)
 * - `video-synth` (SKILL M6-01B · 图文 → 视频合成 · 用 stable-diffusion / hedra API 之类)
 * - `platform-post` (SKILL M6-01C · 平台发布 · douyin/xhs/weixin API)
 */

export type ChinesePlatform =
  | "douyin"
  | "xiaohongshu"
  | "weixin-video"
  | "weixin-mp"
  | "bilibili"
  | "zhihu";

export type ChineseContentType = "image-text" | "short-video" | "long-video" | "reel";

export type ChineseTonePreset =
  | "professional-hardcore" // ai-company 目标客群 default (M3-03 建议)
  | "casual-friendly"
  | "promotional-emoji"
  | "formal-corporate";

export interface PieceInput {
  topic: string;
  target_platform: ChinesePlatform;
  content_type: ChineseContentType;
  tone_preset: ChineseTonePreset;
  cta_type?: "signup" | "follow" | "share" | "comment" | "none";
  piece_id?: string;
}

export interface PlannedPieceStep {
  kind: "content-adaptation" | "video-synth" | "platform-post";
  title: string;
  body: string;
  depends_on: string[];
  suggested_adapter: string;
  suggested_skills: string[];
}

export interface PiecePlan {
  piece_id: string;
  parent_issue: { title: string; body: string };
  steps: PlannedPieceStep[];
  shared_memory_scope: string; // chinese-video:{piece_id}
  warnings: string[];
}

/**
 * Plan a Chinese short video/image piece production sequence.
 * Deterministic · Pattern-4.
 */
export function planPiece(input: PieceInput): PiecePlan {
  const piece_id = normalizePieceId(input);
  const warnings: string[] = [];

  // Video synth only relevant for video content types
  const needsVideoSynth =
    input.content_type === "short-video" ||
    input.content_type === "long-video" ||
    input.content_type === "reel";

  // Platform-specific caveats
  if (input.target_platform === "douyin" && input.content_type === "long-video") {
    warnings.push("douyin optimises for < 60s · long-video may underperform · consider short-video");
  }
  if (input.target_platform === "bilibili" && input.content_type === "short-video") {
    warnings.push("bilibili audience prefers long-form · short-video may underperform");
  }
  if (input.target_platform === "weixin-video" && !input.cta_type) {
    warnings.push("weixin-video benefits from explicit CTA · consider signup/follow");
  }

  const adaptStep: PlannedPieceStep = {
    kind: "content-adaptation",
    title: `[Piece #1] Adapt content for ${input.target_platform}`,
    body: renderAdaptBody(input),
    depends_on: [],
    suggested_adapter: "claude_local",
    suggested_skills: ["content-adaptation", "wewrite"],
  };

  const synthStep: PlannedPieceStep = {
    kind: "video-synth",
    title: `[Piece #2] Video/image synthesis`,
    body: renderSynthBody(input),
    depends_on: ["content-adaptation"],
    suggested_adapter: "claude_local",
    suggested_skills: ["video-synth"],
  };

  const publishStep: PlannedPieceStep = {
    kind: "platform-post",
    title: `[Piece #3] Publish to ${input.target_platform}`,
    body: renderPublishBody(input),
    depends_on: needsVideoSynth ? ["video-synth"] : ["content-adaptation"],
    suggested_adapter: "routine",
    suggested_skills: ["platform-post"],
  };

  const steps: PlannedPieceStep[] = needsVideoSynth
    ? [adaptStep, synthStep, publishStep]
    : [adaptStep, publishStep];

  return {
    piece_id,
    parent_issue: {
      title: `Chinese Video Piece · ${input.topic} · ${input.target_platform}`,
      body: buildParentBody(input, steps),
    },
    steps,
    shared_memory_scope: `chinese-video:${piece_id}`,
    warnings,
  };
}

function renderAdaptBody(input: PieceInput): string {
  return `## Role: Content adaptation

Adapt the following topic for ${input.target_platform} (${input.content_type}) with tone=${input.tone_preset}.

## Topic
${input.topic}

## Emit
Write to shared memory \`chinese-video:{piece_id}.adapted_content\`:
- shape: { title, body_text, hashtags, cta }
- Use volcengine_ark provider for Chinese completion (M2 W8-D2 已装).
- If tone_preset=professional-hardcore → 少 emoji · 长文 · 技术硬核 (M5-02 建议).`;
}

function renderSynthBody(input: PieceInput): string {
  return `## Role: Video synthesis

Convert adapted content into a ${input.content_type} for ${input.target_platform}.

## TODO(team-verify)
Video synth API choice (M3-03 kick-off decision · 5 项 TODO):
- stable-diffusion + hedra
- runway
- pika
- 剪映 API
- self-hosted ffmpeg + tts

## Read
- shared memory \`chinese-video:{piece_id}.adapted_content\`

## Emit
Write to shared memory \`chinese-video:{piece_id}.rendered_media\`:
- shape: { media_url or local_path, format, duration_sec, thumbnail }`;
}

function renderPublishBody(input: PieceInput): string {
  return `## Role: Platform posting

Publish to ${input.target_platform} · scaffold only until team platform API keys provisioned.

## Platform API assumption (TODO(team-verify) after account signup)
${platformApiNote(input.target_platform)}

## Read
- adapted_content (from step 1)
- rendered_media (from step 2 · if video)

## Emit
- \`piece_published\` event with { platform_post_id, published_at }
- Fallback (v0.1 · no API): dump to shared memory · 团队手动 upload.`;
}

function platformApiNote(platform: ChinesePlatform): string {
  const notes: Record<ChinesePlatform, string> = {
    douyin: "抖音 open platform · https://developer.open-douyin.com · scoped API by content type",
    xiaohongshu: "小红书 open platform · 内部账户 approval 需 1-3 周 · 图文/视频不同 endpoint",
    "weixin-video": "微信视频号 · https://weixin.qq.com/mp · 走公众号绑定视频号 API",
    "weixin-mp": "微信公众号 · https://mp.weixin.qq.com · 素材管理 + 群发 API 已成熟",
    bilibili: "B 站 open platform · https://open.bilibili.com · 长视频 upload API",
    zhihu: "知乎无 open platform · 走 headless browser or manual dump",
  };
  return notes[platform];
}

function buildParentBody(input: PieceInput, steps: PlannedPieceStep[]): string {
  return [
    `## Original request`,
    `Topic: ${input.topic}`,
    `Platform: ${input.target_platform}`,
    `Content type: ${input.content_type}`,
    `Tone: ${input.tone_preset}`,
    `CTA: ${input.cta_type ?? "(none)"}`,
    ``,
    `## Steps`,
    ...steps.map(
      (s) => `- [${s.kind}] ${s.title} (depends_on: ${s.depends_on.join(", ") || "-"})`,
    ),
    ``,
    `## Shared memory`,
    `Scope: chinese-video:{piece_id}`,
  ].join("\n");
}

function normalizePieceId(input: PieceInput): string {
  if (input.piece_id && input.piece_id.trim().length > 0) return input.piece_id.trim();
  const slug = `${input.target_platform}-${input.topic}`
    .toLowerCase()
    .replace(/[^a-z0-9一-龥]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return slug.length > 0 ? `piece-${slug}` : "piece-untitled";
}
