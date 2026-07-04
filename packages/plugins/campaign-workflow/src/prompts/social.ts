/**
 * Social sub-issue prompt template.
 *
 * Consumed by an agent + Buffer MCP (M1 W4-D2) to produce N social posts
 * per channel. One prompt call per channel to keep tone tuning tight.
 */

export const SOCIAL_PROMPT_TEMPLATE = `You are writing {count} short social media posts for {channel}.

## Campaign brief
{brief}

## Brand voice
Tone: {brand_voice.tone}
Words to avoid: {brand_voice.vocabulary_dont}

## Channel constraints
{channel_constraints}

## Target audience
{target_audience.persona_summary}

## Output
Emit strict JSON with the shape:
{"posts": [{"body": "...", "hashtags": ["..."]}, ...]}

- Exactly {count} posts.
- Each body must respect the channel character limit.
- Hashtags: 1-3 per post; brand-safe only.
- NO commentary before or after the JSON.
`;

export type SocialChannel = "twitter" | "linkedin" | "instagram" | "threads" | "weibo";

export interface SocialPromptContext {
  brief: string;
  channel: SocialChannel;
  count: number;
  brandVoice: {
    tone: string;
    vocabulary_dont: string[];
  };
  targetAudience: {
    persona_summary: string;
  };
}

const CHANNEL_CONSTRAINTS: Record<SocialChannel, string> = {
  twitter: "- Max 280 characters per post.\n- No line-break-heavy formatting.",
  linkedin:
    "- Max 3000 characters per post.\n- Professional tone.\n- Include one insight paragraph.",
  instagram: "- Max 2200 characters per post.\n- Visual-oriented voice.\n- Emojis allowed.",
  threads: "- Max 500 characters per post.\n- Conversational.",
  weibo: "- Max 2000 characters per post.\n- Chinese-friendly punctuation.",
};

export function renderSocialPrompt(ctx: SocialPromptContext): string {
  return SOCIAL_PROMPT_TEMPLATE
    .replace("{count}", String(ctx.count))
    .replace("{channel}", ctx.channel)
    .replace("{brief}", ctx.brief)
    .replace("{brand_voice.tone}", ctx.brandVoice.tone)
    .replace(
      "{brand_voice.vocabulary_dont}",
      ctx.brandVoice.vocabulary_dont.join(", ") || "(none)",
    )
    .replace("{channel_constraints}", CHANNEL_CONSTRAINTS[ctx.channel])
    .replace("{target_audience.persona_summary}", ctx.targetAudience.persona_summary);
}

export function socialCountForCampaignBrief(channel: SocialChannel): number {
  // Sensible defaults per channel; caller can override
  switch (channel) {
    case "twitter":
    case "threads":
      return 5; // fast-cadence channels
    case "linkedin":
      return 2; // one main + one carousel-style
    case "instagram":
      return 3;
    case "weibo":
      return 3;
  }
}
