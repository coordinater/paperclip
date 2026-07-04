/**
 * Ads sub-issue prompt template.
 *
 * Consumed by an agent + AdCreative (M1 W4-D3, if installed) to produce
 * N ad copy variants + visual briefs. If AdCreative isn't installed, the
 * output is copy-only; the visual brief can be handed to a human designer.
 */

export const ADS_PROMPT_TEMPLATE = `You are writing {count} ad copy variants for {platform}.

## Campaign brief
{brief}

## Brand voice
Tone: {brand_voice.tone}

## Product positioning
{product_positioning}

## Target audience
{target_audience.persona_summary}
Pain points: {target_audience.pain_points}

## Platform constraints
{platform_constraints}

## Compliance
{compliance_summary}

## Output
Emit strict JSON with the shape:
{"variants": [{"headline": "...", "primary_text": "...", "cta_label": "...", "visual_brief": "..."}, ...]}

- Exactly {count} variants.
- Each variant is a distinct angle (feature / benefit / social proof / urgency / curiosity).
- headline: match platform's headline char limit.
- primary_text: match platform's body char limit.
- cta_label: pick one from ["Learn More", "Sign Up", "Get Started", "Try Free"].
- visual_brief: 1-2 sentences describing the ideal creative for this variant.
- NO commentary before or after the JSON.
`;

export type AdPlatform = "meta" | "google_search" | "google_display" | "linkedin" | "tiktok";

export interface AdsPromptContext {
  brief: string;
  platform: AdPlatform;
  count: number;
  brandVoice: {
    tone: string;
  };
  productPositioning: string;
  targetAudience: {
    persona_summary: string;
    pain_points: string[];
  };
  complianceSummary: string;
}

const PLATFORM_CONSTRAINTS: Record<AdPlatform, string> = {
  meta:
    "- Headline: 40 chars\n- Primary text: 125 chars for feed / 90 chars for reels\n- CTA: pick from Meta's approved list",
  google_search:
    "- Headline: 30 chars (up to 15 headlines per RSA)\n- Description: 90 chars (up to 4 descriptions)",
  google_display:
    "- Short headline: 30 chars\n- Long headline: 90 chars\n- Description: 90 chars",
  linkedin:
    "- Headline: 70 chars\n- Intro text: 150 chars for LinkedIn Ads / 600 chars for message ads",
  tiktok:
    "- Text overlay: 40 chars\n- Description: 100 chars\n- Fast-hook tone required",
};

export function renderAdsPrompt(ctx: AdsPromptContext): string {
  return ADS_PROMPT_TEMPLATE
    .replace("{count}", String(ctx.count))
    .replace("{platform}", ctx.platform)
    .replace("{brief}", ctx.brief)
    .replace("{brand_voice.tone}", ctx.brandVoice.tone)
    .replace("{product_positioning}", ctx.productPositioning)
    .replace("{target_audience.persona_summary}", ctx.targetAudience.persona_summary)
    .replace(
      "{target_audience.pain_points}",
      ctx.targetAudience.pain_points.join("; ") || "(unspecified)",
    )
    .replace("{platform_constraints}", PLATFORM_CONSTRAINTS[ctx.platform])
    .replace("{compliance_summary}", ctx.complianceSummary);
}
