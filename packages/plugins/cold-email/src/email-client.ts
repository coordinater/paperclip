/**
 * Email provider client · M4-02 MVP scaffold.
 *
 * Abstracts SendGrid / SES / SMTP / aliyun / tencent / draft-only behind
 * a common `EmailClient` interface. Pattern-3 · fetchImpl injection for testability.
 *
 * v0.1 default = draft-only (D-M4-07 · no real sends). Real API integrations
 * scaffolded but not fully implemented · TODO(team-verify) for shape confirmation.
 */

import type { EmailChannel } from "./orchestrator.js";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  body_html: string;
  body_text: string;
  headers?: Record<string, string>;
  message_id?: string;
}

export interface SendResult {
  message_id: string;
  provider: EmailChannel;
  status: "queued" | "sent" | "failed" | "draft";
  provider_response?: unknown;
  error?: string;
}

export interface EmailClientConfig {
  channel: EmailChannel;
  apiKey?: string;
  baseUrl?: string;
  senderIdentity?: string; // sender email + optional domain
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class EmailClient {
  private readonly channel: EmailChannel;
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: EmailClientConfig) {
    this.channel = config.channel;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? this.defaultBaseUrl(config.channel);
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async send(message: EmailMessage): Promise<SendResult> {
    switch (this.channel) {
      case "draft-only":
        return this.sendDraftOnly(message);
      case "sendgrid":
        return this.sendViaSendGrid(message);
      case "ses":
        return this.sendViaSes(message);
      case "aliyun":
        return this.sendViaAliyun(message);
      case "tencent":
        return this.sendViaTencent(message);
      case "smtp":
        return this.sendViaSmtp(message);
      default:
        throw new Error(`Unknown email channel: ${this.channel}`);
    }
  }

  // ------------------------- Draft-only (v0.1 default) -------------------------

  private sendDraftOnly(message: EmailMessage): SendResult {
    // No network I/O · just returns a draft placeholder.
    // Team manually dispatches via review UI (D-M4-07).
    return {
      message_id: message.message_id ?? this.generateDraftId(),
      provider: "draft-only",
      status: "draft",
      provider_response: { note: "draft only · manual send required" },
    };
  }

  // ------------------------- SendGrid -------------------------

  private async sendViaSendGrid(message: EmailMessage): Promise<SendResult> {
    // TODO(team-verify): confirm SendGrid v3 API shape · https://docs.sendgrid.com/api-reference/mail-send/mail-send
    // Currently coded to the documented v3 · but team must test after Approval.
    if (!this.apiKey) {
      return { message_id: "", provider: "sendgrid", status: "failed", error: "SENDGRID_API_KEY missing" };
    }
    const url = `${this.baseUrl}/v3/mail/send`;
    const body = {
      personalizations: [{ to: [{ email: message.to }] }],
      from: { email: message.from },
      subject: message.subject,
      content: [
        { type: "text/plain", value: message.body_text },
        { type: "text/html", value: message.body_html },
      ],
      headers: message.headers ?? {},
    };
    const res = await this.doFetch(url, body);
    if (!res.ok) {
      return {
        message_id: "",
        provider: "sendgrid",
        status: "failed",
        error: `HTTP ${res.status}`,
      };
    }
    // SendGrid returns 202 · message id in X-Message-Id header
    return {
      message_id: res.headers.get("x-message-id") ?? this.generateDraftId(),
      provider: "sendgrid",
      status: "queued",
    };
  }

  // ------------------------- AWS SES -------------------------

  private async sendViaSes(message: EmailMessage): Promise<SendResult> {
    // TODO(team-verify): SES uses AWS Signature v4 · requires proper sig · scaffold only
    return {
      message_id: "",
      provider: "ses",
      status: "failed",
      error: "SES scaffold only · AWS Sig v4 signer not implemented (M5+)",
    };
  }

  // ------------------------- 阿里云邮件推送 (Chinese) -------------------------

  private async sendViaAliyun(message: EmailMessage): Promise<SendResult> {
    // TODO(team-verify): 阿里云 DirectMail API shape
    // https://www.aliyun.com/product/directmail
    return {
      message_id: "",
      provider: "aliyun",
      status: "failed",
      error: "Aliyun scaffold only · real integration M5+ after account provisioned",
    };
  }

  // ------------------------- 腾讯邮件推送 (Chinese) -------------------------

  private async sendViaTencent(message: EmailMessage): Promise<SendResult> {
    return {
      message_id: "",
      provider: "tencent",
      status: "failed",
      error: "Tencent scaffold only · real integration M5+",
    };
  }

  // ------------------------- SMTP (self-hosted) -------------------------

  private async sendViaSmtp(message: EmailMessage): Promise<SendResult> {
    return {
      message_id: "",
      provider: "smtp",
      status: "failed",
      error: "SMTP scaffold only · requires nodemailer or similar · M5+",
    };
  }

  // ------------------------- Helpers -------------------------

  private defaultBaseUrl(channel: EmailChannel): string {
    switch (channel) {
      case "sendgrid":
        return "https://api.sendgrid.com";
      case "ses":
        return "https://email.us-east-1.amazonaws.com";
      case "aliyun":
        return "https://dm.aliyuncs.com";
      case "tencent":
        return "https://ses.tencentcloudapi.com";
      default:
        return "";
    }
  }

  private async doFetch(url: string, body: unknown): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey ?? ""}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  private generateDraftId(): string {
    // Deterministic-ish · fine for MVP · not for real production
    return `draft-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }
}
