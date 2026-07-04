import { describe, expect, it } from "vitest";
import {
  parseFrontmatter,
  renderSkillMd,
  sanitize,
  slugFromPath,
} from "./convert-cursorrules-to-skills.js";

describe("parseFrontmatter", () => {
  it("parses a canonical .mdc file", () => {
    const src = `---
description: "React best practices for hooks and state management"
globs: "**/*.tsx"
alwaysApply: true
---

# React Rule
Body content here.
`;
    const { frontmatter, body } = parseFrontmatter(src);
    expect(frontmatter.description).toBe("React best practices for hooks and state management");
    expect(frontmatter.globs).toBe('"**/*.tsx"');
    expect(frontmatter.alwaysApply).toBe(true);
    expect(body).toContain("# React Rule");
    expect(body).toContain("Body content here.");
  });

  it("returns empty frontmatter when file has none", () => {
    const src = `# Just a heading\n\nSome body.\n`;
    const { frontmatter, body } = parseFrontmatter(src);
    expect(frontmatter.description).toBeUndefined();
    expect(frontmatter.alwaysApply).toBeUndefined();
    expect(body).toContain("Just a heading");
  });

  it("preserves unknown frontmatter keys in extra", () => {
    const src = `---
description: "x"
customThing: yes
---

body
`;
    const { frontmatter } = parseFrontmatter(src);
    expect(frontmatter.extra.customThing).toBe("yes");
  });

  it("handles alwaysApply true/false variants", () => {
    expect(parseFrontmatter(`---\nalwaysApply: true\n---\n\n`).frontmatter.alwaysApply).toBe(true);
    expect(parseFrontmatter(`---\nalwaysApply: yes\n---\n\n`).frontmatter.alwaysApply).toBe(true);
    expect(parseFrontmatter(`---\nalwaysApply: false\n---\n\n`).frontmatter.alwaysApply).toBe(false);
    expect(parseFrontmatter(`---\nalwaysApply: no\n---\n\n`).frontmatter.alwaysApply).toBe(false);
  });
});

describe("sanitize", () => {
  it("accepts a clean body", () => {
    const r = sanitize("Use hooks. Prefer const. See https://developer.mozilla.org/x.");
    expect(r.ok).toBe(true);
  });

  it("rejects base64-looking payload", () => {
    const long = "A".repeat(300); // 300 A's — matches [A-Za-z0-9+/=_-]{200,}
    const r = sanitize(`Body then: ${long}`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("base64");
  });

  it("rejects untrusted URLs", () => {
    const r = sanitize("Visit https://evil.example.com/rules for more.");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("evil.example.com");
  });

  it("accepts github.com URLs", () => {
    expect(sanitize("See https://github.com/foo/bar for source").ok).toBe(true);
    expect(sanitize("See https://raw.githubusercontent.com/x/y/main/f").ok).toBe(true);
  });

  it("accepts subdomain of trusted host suffix", () => {
    expect(sanitize("Read https://developer.mozilla.org/en-US/docs/Web").ok).toBe(true);
    expect(sanitize("Docs: https://sub.anthropic.com/x").ok).toBe(true);
  });

  it("accepts custom trusted host list", () => {
    const r = sanitize("Ref: https://acme.co/rules", ["acme.co"]);
    expect(r.ok).toBe(true);
  });
});

describe("slugFromPath", () => {
  it("kebab-cases nested paths", () => {
    const slug = slugFromPath(
      "/tmp/root/react/hooks/state-management.mdc",
      "/tmp/root",
    );
    expect(slug).toBe("react-hooks-state-management");
  });

  it("handles single-file paths", () => {
    expect(slugFromPath("/tmp/root/typescript.mdc", "/tmp/root")).toBe("typescript");
  });

  it("normalizes non-alphanumeric characters", () => {
    expect(slugFromPath("/tmp/root/rules_&_tips/x.mdc", "/tmp/root")).toBe(
      "rules-tips-x",
    );
  });

  it("falls back to `unnamed` when the path is all punctuation", () => {
    expect(slugFromPath("/tmp/root/____.mdc", "/tmp/root")).toBe("unnamed");
  });

  it("lower-cases even when the source has caps", () => {
    expect(slugFromPath("/tmp/root/ReactHooks.mdc", "/tmp/root")).toBe("reacthooks");
  });
});

describe("renderSkillMd", () => {
  it("emits canonical Anthropic Skills format", () => {
    const md = renderSkillMd(
      "react-hooks",
      { description: "React best practices", extra: {} },
      "# React Hooks\n\nUse them properly.\n",
    );
    expect(md).toContain("---");
    expect(md).toContain("name: react-hooks");
    expect(md).toContain("description: >");
    expect(md).toContain("React best practices");
    expect(md).toContain("# React Hooks");
  });

  it("falls back to a canned description when frontmatter has none", () => {
    const md = renderSkillMd(
      "unknown-rule",
      { extra: {} },
      "# Rule Body",
    );
    expect(md).toContain("Converted from awesome-cursorrules-zh");
  });

  it("uses the H1 heading as SKILL.md title when body has one", () => {
    const md = renderSkillMd(
      "react-hooks",
      { extra: {} },
      "# React Hooks Best Practices\n\nBody",
    );
    // The title on the first line after front-matter should match H1
    expect(md).toMatch(/# React Hooks Best Practices/);
  });

  it("falls back to slug as title when body has no H1", () => {
    const md = renderSkillMd(
      "no-heading-rule",
      { extra: {} },
      "Just body, no heading",
    );
    expect(md).toMatch(/# no-heading-rule/);
  });

  it("collapses multi-line description into a single YAML block line", () => {
    const md = renderSkillMd(
      "x",
      { description: "line1\nline2\nline3", extra: {} },
      "body",
    );
    expect(md).toContain("line1 line2 line3");
  });
});
