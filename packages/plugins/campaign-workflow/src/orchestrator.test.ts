import { describe, expect, it } from "vitest";
import { planCampaignSync } from "./orchestrator.js";
import type { BrandAssetsSnapshot } from "./orchestrator.js";

const MINIMAL_ASSETS: BrandAssetsSnapshot = {
  brand_voice: {
    tone: "casual",
    vocabulary_do: ["hey"],
    vocabulary_dont: ["utilize"],
  },
  target_audience: {
    segment_name: "SMB founders",
    persona_summary: "First-time founder building an AI SaaS.",
    pain_points: ["fundraising", "cold outbound"],
    goals: ["ship v1", "get 10 paying users"],
  },
  product_info: {
    product_name: "PaperClip",
    one_liner: "Managed AI-agent coworkers",
    key_features: [{ name: "hire", benefit: "spin up agents in seconds" }],
    positioning: "we are the ops layer for AI companies",
    category: "dev-tools",
  },
  compliance_rules: {
    rule_id: "us-truth-in-advertising",
    category: "advertising",
    do_rules: ["disclose paid placement"],
    dont_rules: ["fake user testimonials"],
  },
};

describe("planCampaign · shape and defaults", () => {
  it("produces parent_issue + at least a blog child from just a brief", () => {
    const plan = planCampaignSync(
      { brief: "Launch our v1 to indie hackers" },
      MINIMAL_ASSETS,
    );
    expect(plan.parent_issue.title).toContain("Campaign");
    expect(plan.parent_issue.body).toContain("Launch our v1 to indie hackers");
    const blog = plan.children.find((c) => c.kind === "blog");
    expect(blog).toBeDefined();
    expect(blog?.suggested_skills).toContain("claude-blog");
    expect(blog?.suggested_skills).toContain("claude-seo");
  });

  it("defaults to twitter + linkedin social children when socialChannels omitted", () => {
    const plan = planCampaignSync({ brief: "launch v1" }, MINIMAL_ASSETS);
    const socials = plan.children.filter((c) => c.kind === "social");
    const channels = socials.map((c) => c.metadata.channel);
    expect(channels).toEqual(["twitter", "linkedin"]);
  });

  it("honors explicit socialChannels override", () => {
    const plan = planCampaignSync(
      { brief: "launch v1", socialChannels: ["instagram", "threads"] },
      MINIMAL_ASSETS,
    );
    const channels = plan.children
      .filter((c) => c.kind === "social")
      .map((c) => c.metadata.channel);
    expect(channels).toEqual(["instagram", "threads"]);
  });

  it("skips ads when adPlatforms empty and warns", () => {
    const plan = planCampaignSync({ brief: "launch v1" }, MINIMAL_ASSETS);
    expect(plan.children.filter((c) => c.kind === "ads")).toHaveLength(0);
    expect(plan.warnings).toContain("no ad platforms specified — skipping ads sub-issue");
  });

  it("emits one ads child per adPlatform", () => {
    const plan = planCampaignSync(
      { brief: "launch v1", adPlatforms: ["meta", "google_search"] },
      MINIMAL_ASSETS,
    );
    const ads = plan.children.filter((c) => c.kind === "ads");
    expect(ads).toHaveLength(2);
    expect(ads.map((c) => c.metadata.platform)).toEqual(["meta", "google_search"]);
  });

  it("mints campaign_id from brief when campaignId omitted", () => {
    const plan = planCampaignSync(
      { brief: "Launch our v1 to indie hackers" },
      MINIMAL_ASSETS,
    );
    expect(plan.campaign_id).toBe("campaign-launch-our-v1-to-indie-hackers");
  });

  it("uses explicit campaignId over slugification", () => {
    const plan = planCampaignSync(
      { brief: "long noisy brief that we want to override", campaignId: "spring-2027-launch" },
      MINIMAL_ASSETS,
    );
    expect(plan.campaign_id).toBe("spring-2027-launch");
  });

  it("falls back to campaign-untitled when brief is only punctuation", () => {
    const plan = planCampaignSync({ brief: "!!! ??? ..." }, MINIMAL_ASSETS);
    expect(plan.campaign_id).toBe("campaign-untitled");
  });
});

describe("planCampaign · brand asset fallbacks", () => {
  it("warns when brand_voice missing and uses neutral default", () => {
    const plan = planCampaignSync({ brief: "launch v1" }, { ...MINIMAL_ASSETS, brand_voice: undefined });
    expect(plan.warnings).toContain("no brand_voice asset — using neutral defaults");
    const blog = plan.children.find((c) => c.kind === "blog")!;
    expect(blog.prompt).toContain("Tone: professional");
  });

  it("warns when target_audience missing and uses generic persona", () => {
    const plan = planCampaignSync(
      { brief: "launch v1" },
      { ...MINIMAL_ASSETS, target_audience: undefined },
    );
    expect(plan.warnings).toContain("no target_audience asset — using generic persona");
    const blog = plan.children.find((c) => c.kind === "blog")!;
    expect(blog.prompt).toContain("General audience");
  });

  it("summarizes compliance rules into ads prompt when provided", () => {
    const plan = planCampaignSync(
      { brief: "launch v1", adPlatforms: ["meta"] },
      MINIMAL_ASSETS,
    );
    const ad = plan.children.find((c) => c.kind === "ads")!;
    expect(ad.prompt).toContain("us-truth-in-advertising");
    expect(ad.prompt).toContain("disclose paid placement");
    expect(ad.prompt).toContain("fake user testimonials");
  });

  it("still emits ads when compliance rules missing (with `No compliance rules specified.`)", () => {
    const plan = planCampaignSync(
      { brief: "launch v1", adPlatforms: ["meta"] },
      { ...MINIMAL_ASSETS, compliance_rules: undefined },
    );
    const ad = plan.children.find((c) => c.kind === "ads")!;
    expect(ad.prompt).toContain("No compliance rules specified.");
  });
});

describe("planCampaign · prompt content", () => {
  it("blog prompt includes brand voice + persona + cta", () => {
    const plan = planCampaignSync(
      {
        brief: "launch v1 to indie hackers",
        cta: { text: "Start free trial", url: "https://ai-company.example/signup" },
      },
      MINIMAL_ASSETS,
    );
    const blog = plan.children.find((c) => c.kind === "blog")!;
    expect(blog.prompt).toContain("Tone: casual");
    expect(blog.prompt).toContain("First-time founder");
    expect(blog.prompt).toContain("Start free trial");
    expect(blog.prompt).toContain("https://ai-company.example/signup");
  });

  it("social prompt includes channel constraints", () => {
    const plan = planCampaignSync(
      { brief: "launch v1", socialChannels: ["twitter"] },
      MINIMAL_ASSETS,
    );
    const twitter = plan.children.find(
      (c) => c.kind === "social" && c.metadata.channel === "twitter",
    )!;
    expect(twitter.prompt).toContain("Max 280 characters");
  });

  it("ads prompt includes platform constraints", () => {
    const plan = planCampaignSync(
      { brief: "launch v1", adPlatforms: ["google_search"] },
      MINIMAL_ASSETS,
    );
    const ad = plan.children.find(
      (c) => c.kind === "ads" && c.metadata.platform === "google_search",
    )!;
    expect(ad.prompt).toContain("Headline: 30 chars");
  });
});
