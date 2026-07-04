/**
 * Blog sub-issue prompt template.
 *
 * Consumed by a claude-blog / claude-seo agent to produce a blog draft
 * aligned with the brand voice + target audience from plugin_entities.
 */

export const BLOG_PROMPT_TEMPLATE = `You are writing a blog post for a campaign.

## Campaign brief
{brief}

## Brand voice
Tone: {brand_voice.tone}
Words to prefer: {brand_voice.vocabulary_do}
Words to avoid: {brand_voice.vocabulary_dont}
{brand_voice.sample_paragraphs_section}

## Target audience
Segment: {target_audience.segment_name}
Persona: {target_audience.persona_summary}
Pain points: {target_audience.pain_points}
Goals: {target_audience.goals}

## Constraints
- Length: {constraints.target_word_count} words (±10%)
- Headings: 3-5 H2 sections
- CTA: {constraints.cta_text} → {constraints.cta_url}
- Compliance: honor "words to avoid" list; no unsupported claims

## Output
Emit a single markdown document. Front-matter block first:

\`\`\`yaml
---
title: <SEO-friendly title>
description: <150-char meta description>
slug: <kebab-case slug>
keywords: [primary, secondary, ...]
---
\`\`\`

Then the body. Do NOT include commentary before or after.
`;

export interface BlogPromptContext {
  brief: string;
  brandVoice: {
    tone: string;
    vocabulary_do: string[];
    vocabulary_dont: string[];
    sample_paragraphs?: string[];
  };
  targetAudience: {
    segment_name: string;
    persona_summary: string;
    pain_points: string[];
    goals: string[];
  };
  constraints: {
    target_word_count: number;
    cta_text: string;
    cta_url: string;
  };
}

export function renderBlogPrompt(ctx: BlogPromptContext): string {
  const samples = ctx.brandVoice.sample_paragraphs;
  const sampleSection =
    samples && samples.length > 0
      ? `Sample paragraphs (few-shot):\n${samples.map((s) => `> ${s}`).join("\n\n")}`
      : "";

  return BLOG_PROMPT_TEMPLATE
    .replace("{brief}", ctx.brief)
    .replace("{brand_voice.tone}", ctx.brandVoice.tone)
    .replace("{brand_voice.vocabulary_do}", ctx.brandVoice.vocabulary_do.join(", ") || "(none)")
    .replace(
      "{brand_voice.vocabulary_dont}",
      ctx.brandVoice.vocabulary_dont.join(", ") || "(none)",
    )
    .replace("{brand_voice.sample_paragraphs_section}", sampleSection)
    .replace("{target_audience.segment_name}", ctx.targetAudience.segment_name)
    .replace("{target_audience.persona_summary}", ctx.targetAudience.persona_summary)
    .replace(
      "{target_audience.pain_points}",
      ctx.targetAudience.pain_points.join("; ") || "(unspecified)",
    )
    .replace(
      "{target_audience.goals}",
      ctx.targetAudience.goals.join("; ") || "(unspecified)",
    )
    .replace("{constraints.target_word_count}", String(ctx.constraints.target_word_count))
    .replace("{constraints.cta_text}", ctx.constraints.cta_text)
    .replace("{constraints.cta_url}", ctx.constraints.cta_url);
}
