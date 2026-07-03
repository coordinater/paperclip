/**
 * C8 安全层 middleware — PII 正则 + prompt-injection 启发式检查。
 *
 * 契约锚点：
 *  - handoff/03 §W4.3 W4-D4：outbound 拦截 PII + injection
 *  - handoff/06 §6：secrets 走 ctx.secrets.get，不落盘不入日志
 *  - handoff/06 §2.3：plugin SDK 是稳定契约层，本模块只包装 ctx.http.fetch，不改 SDK
 *
 * 使用方式（与派单说明一致）：
 *   plugin 内所有出站 HTTP 都从本模块的 `safeOutbound(ctx, request)` 走，
 *   不直调 ctx.http.fetch。本模块内部先跑安全检查（PII + injection），
 *   命中则抛 C8SafetyBlockedError，未命中透传到 ctx.http.fetch 并返回 Response。
 *
 * 与手册的偏离（M1 显式记录，见 handoff/03 §W4.7 问题 2 Plan B 精神）：
 *  - 手册原文说"用 claude-code 判 prompt injection"。M1 本文件仅做启发式
 *    关键短语匹配，保持 offline-safe，不引入 claude-code 依赖。
 *  - 拦截仍然为默认开启（blockOnPII / blockOnInjection 默认 true）；
 *    "先做告警版" 的 Plan B 通过传 `blockOnPII: false / blockOnInjection: false`
 *    显式启用，不作为默认路径。
 *  - M2 可将 judgeInjection 替换成调 claude-code judge（见文中 TODO）。
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";

// ---------------------------------------------------------------------------
// PII 检测
// ---------------------------------------------------------------------------

/** 已识别的 PII 类型。 */
export type PIIType = "email" | "id_card" | "credit_card" | "phone";

/** 一条 PII 命中的元数据。不包含高敏原文以外的上下文；调用方决定是否 mask。 */
export interface PIIFinding {
  /** 命中的 PII 类型。 */
  type: PIIType;
  /** 命中的原始字符串（用于抛错时定位，日志里不应写入原文——只写 type + index）。 */
  match: string;
  /** 命中在扫描文本内的 0-based 起始偏移。 */
  index: number;
}

// -- 正则定义 --------------------------------------------------------------

/**
 * 邮箱：RFC-5322 简化版。避免过度激进，容忍常见业务格式。
 * 参考：HTML5 spec 中的邮箱正则的可读简化。
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * 中国大陆手机号：11 位，以 1 开头，第 2 位 3-9。
 * 用 (?<![\d]) 和 (?![\d]) 保证不是嵌在更长数字串里。
 */
const PHONE_CN_RE = /(?<!\d)1[3-9]\d{9}(?!\d)/g;

/**
 * 中国大陆身份证：18 位（末位可为 X/x）或 15 位。
 * 前 6 位行政区代码 + 出生年月日（8 位或 6 位）+ 顺序码。此处不做校验位验证，
 * 目的是过滤而非鉴定；宁多不漏。
 */
const ID_CARD_CN_RE = /(?<!\d)(?:\d{15}|\d{17}[\dXx])(?!\d)/g;

/**
 * 信用卡：13-19 位数字，允许空格 / 短横线分隔。识别到候选后过 Luhn 校验。
 * 支持的前缀（handoff 派单要求）：
 *   - 4 (Visa)
 *   - 5 (Mastercard)
 *   - 34 / 37 (Amex)
 *   - 6011 (Discover)
 *   - 62  (UnionPay)
 * 采用宽正则先抓候选（含分隔符），再纯数字化后判前缀 + Luhn。
 */
const CREDIT_CARD_CANDIDATE_RE = /(?<![\d-])(?:\d[\d -]{11,22}\d)(?![\d-])/g;
const CREDIT_CARD_PREFIXES = ["4", "5", "34", "37", "6011", "62"];

/** Luhn checksum。返回 true 表示通过。 */
function luhnCheck(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum > 0 && sum % 10 === 0;
}

function startsWithAny(s: string, prefixes: string[]): boolean {
  return prefixes.some((p) => s.startsWith(p));
}

/**
 * 扫描文本，返回全部 PII 命中。findings 按 index 升序，跨类型不合并。
 *
 * 设计要点：
 *  - 逐个正则独立扫描；同一位置多类型命中都返回（例如 15 位数字既像身份证
 *    又像信用卡候选，此时保留信用卡候选，仅当 Luhn 通过且前缀命中）。
 *  - 不产生 side effect，也不 mask 原文；调用方（如 safeOutbound）负责
 *    "只把 type + index 写入日志" 的隐私边界。
 */
export function detectPII(text: string): PIIFinding[] {
  if (!text) return [];
  const findings: PIIFinding[] = [];

  // Email
  for (const m of text.matchAll(EMAIL_RE)) {
    if (m.index !== undefined) {
      findings.push({ type: "email", match: m[0], index: m.index });
    }
  }
  // Phone
  for (const m of text.matchAll(PHONE_CN_RE)) {
    if (m.index !== undefined) {
      findings.push({ type: "phone", match: m[0], index: m.index });
    }
  }
  // ID Card
  for (const m of text.matchAll(ID_CARD_CN_RE)) {
    if (m.index !== undefined) {
      findings.push({ type: "id_card", match: m[0], index: m.index });
    }
  }
  // Credit Card (with Luhn + prefix filter)
  for (const m of text.matchAll(CREDIT_CARD_CANDIDATE_RE)) {
    if (m.index === undefined) continue;
    const raw = m[0];
    const digits = raw.replace(/[^\d]/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    if (!startsWithAny(digits, CREDIT_CARD_PREFIXES)) continue;
    if (!luhnCheck(digits)) continue;
    findings.push({ type: "credit_card", match: raw, index: m.index });
  }

  findings.sort((a, b) => a.index - b.index);
  return findings;
}

// ---------------------------------------------------------------------------
// Prompt injection 启发式
// ---------------------------------------------------------------------------

/** 判定结果。M1 只有 low / high 两档。 */
export type InjectionRisk = "low" | "high";

export interface InjectionVerdict {
  risk: InjectionRisk;
  /** 命中的关键短语（risk=high 时非空）。 */
  matched?: string[];
  /** 人类可读原因（risk=high 时非空）。 */
  reason?: string;
}

/**
 * 关键短语列表（≥12 条，中英混合）。
 * TODO(M2): 替换为调 claude-code judge，参考 handoff/03 §W4 W4-D4 原文
 *           ("用 claude-code 判 prompt injection")。
 */
const INJECTION_LITERAL_PHRASES: string[] = [
  // English — 常见 jailbreak / prompt override 模式
  "ignore previous instructions",
  "ignore the above",
  "disregard the above",
  "disregard previous",
  "system prompt",
  "reveal your instructions",
  "you are now",
  "act as if",
  "developer mode",
  "jailbreak",
  "prompt injection",
  "SYSTEM:",
  // 中文 — 派单要求覆盖
  "新的指令",
  "忘记之前",
  "无视上述",
  "忽略上述",
  "忽略之前",
  "扮演",
  "越狱",
];

/** Fake special-token 形态：<|xxx|> 常出现在模型 tokenizer 边界注入。 */
const FAKE_TOKEN_RE = /<\|[^|]{1,64}\|>/;

/**
 * 判断文本是否含 prompt injection。M1 启发式：
 *   1) 对每条关键短语做 case-insensitive 子串匹配；
 *   2) 对 fake-token pattern（<|...|>）做正则匹配。
 * 任一命中即返 high。
 *
 * @returns 判定结果。当 risk=high 时，matched 列出命中短语，reason 说明触发理由。
 */
export async function judgeInjection(text: string): Promise<InjectionVerdict> {
  if (!text) return { risk: "low" };
  const lower = text.toLowerCase();
  const matched: string[] = [];

  for (const phrase of INJECTION_LITERAL_PHRASES) {
    if (lower.includes(phrase.toLowerCase())) {
      matched.push(phrase);
    }
  }
  if (FAKE_TOKEN_RE.test(text)) {
    matched.push("<|fake-token|>");
  }

  if (matched.length === 0) return { risk: "low" };
  return {
    risk: "high",
    matched,
    reason: `Heuristic prompt-injection signal (${matched.length} phrase(s) matched)`,
  };
}

// ---------------------------------------------------------------------------
// safeOutbound 装饰器
// ---------------------------------------------------------------------------

/**
 * safeOutbound 输入。刻意与 SDK 的 PluginHttpClient.fetch(url, init) 对齐，
 * 但把 body 拆到顶层以便扫描。
 */
export interface SafeOutboundRequest {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  /**
   * 请求 body。字符串直接扫描；对象会 JSON.stringify 后扫描。
   * Uint8Array/Blob 类型 M1 不做深扫（仅扫元数据）——见 unsure 列表。
   */
  body?: string | Record<string, unknown> | Uint8Array | null;
  /** 命中 PII 是否 block（默认 true）。false = 仍放行但 logger.warn。 */
  blockOnPII?: boolean;
  /** 命中 injection 是否 block（默认 true）。 */
  blockOnInjection?: boolean;
}

/** safeOutbound 结果：透传 ctx.http.fetch 的 Response。 */
export type SafeOutboundResult = Response;

/**
 * Block 触发时抛出的显式错误类型。plugin 上层可以 `catch(err)` +
 * `err instanceof C8SafetyBlockedError` 判断来源。
 */
export class C8SafetyBlockedError extends Error {
  readonly kind: "pii" | "injection";
  readonly findings: PIIFinding[] | string[];
  readonly url: string;

  constructor(input: {
    kind: "pii" | "injection";
    findings: PIIFinding[] | string[];
    url: string;
    message?: string;
  }) {
    super(
      input.message ??
        `C8 safety layer blocked outbound to ${input.url} (${input.kind})`,
    );
    this.name = "C8SafetyBlockedError";
    this.kind = input.kind;
    this.findings = input.findings;
    this.url = input.url;
    Object.setPrototypeOf(this, C8SafetyBlockedError.prototype);
  }
}

// -- 内部工具 --------------------------------------------------------------

function stringifyForScan(
  body: SafeOutboundRequest["body"],
): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return ""; // M1 不深扫二进制 body
  try {
    return JSON.stringify(body);
  } catch {
    return String(body);
  }
}

function parseUrlQuery(url: string): string {
  const q = url.indexOf("?");
  return q >= 0 ? url.slice(q + 1) : "";
}

function headerValuesForScan(headers: Record<string, string> | undefined): string {
  if (!headers) return "";
  // 只扫 value，不扫 key
  return Object.values(headers).join(" ");
}

/**
 * 只把 finding 的 type + index 摘要写入日志。绝不落 match 原文——
 * 那正是我们要阻断的敏感内容（handoff/06 §6 secrets/PII 不入日志的延伸）。
 */
function summariseForLog(findings: PIIFinding[]): Array<{ type: PIIType; index: number }> {
  return findings.map((f) => ({ type: f.type, index: f.index }));
}

/**
 * 上层 plugin 出站包装。所有 ai-company 内部发外部 HTTP 的地方都应经过本函数，
 * 而不直调 ctx.http.fetch。见文件顶部说明。
 *
 * @param ctx      plugin 运行时上下文（提供 http + logger）
 * @param request  出站请求参数
 * @throws  C8SafetyBlockedError  命中 PII 且 blockOnPII === true，或命中
 *                                injection 且 blockOnInjection === true
 */
export async function safeOutbound(
  ctx: PluginContext,
  request: SafeOutboundRequest,
): Promise<SafeOutboundResult> {
  const {
    url,
    method = "GET",
    headers,
    body,
    blockOnPII = true,
    blockOnInjection = true,
  } = request;

  // 1) 拼扫描 payload：query + header values + body（stringified）
  const scanCorpus = [
    parseUrlQuery(url),
    headerValuesForScan(headers),
    stringifyForScan(body),
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  // 2) PII 扫描
  const piiFindings = detectPII(scanCorpus);
  if (piiFindings.length > 0) {
    if (blockOnPII) {
      ctx.logger.warn("c8.outbound.blocked", {
        url,
        reason: "pii",
        findings: summariseForLog(piiFindings),
      });
      throw new C8SafetyBlockedError({
        kind: "pii",
        findings: piiFindings,
        url,
      });
    }
    // 未 block：告警版路径（handoff/03 §W4.7 问题 2 Plan B）。
    ctx.logger.warn("c8.outbound.pii_allowed", {
      url,
      findings: summariseForLog(piiFindings),
    });
  }

  // 3) Injection 扫描
  const verdict = await judgeInjection(scanCorpus);
  if (verdict.risk === "high") {
    if (blockOnInjection) {
      ctx.logger.warn("c8.outbound.blocked", {
        url,
        reason: "injection",
        matched: verdict.matched,
      });
      throw new C8SafetyBlockedError({
        kind: "injection",
        findings: verdict.matched ?? [],
        url,
      });
    }
    ctx.logger.warn("c8.outbound.injection_allowed", {
      url,
      matched: verdict.matched,
    });
  }

  // 4) 通过 —— 交给 host http client
  ctx.logger.info("c8.outbound.allowed", { url, method });
  const init: Record<string, unknown> = { method };
  if (headers) init.headers = headers;
  if (body != null) {
    if (typeof body === "string" || body instanceof Uint8Array) {
      init.body = body;
    } else {
      init.body = JSON.stringify(body);
      init.headers = { "content-type": "application/json", ...(headers ?? {}) };
    }
  }
  return ctx.http.fetch(url, init as RequestInit);
}
