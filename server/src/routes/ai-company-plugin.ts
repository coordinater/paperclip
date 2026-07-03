/**
 * Route mount for `@ai-company/paperclip-plugin-ai-company` HTTP endpoints.
 *
 * Prefix `/api/ai-company/v1/*` per handoff/06 §2.2 (API 层缓冲).
 * v1 契约冻结：加字段允许，改 / 删禁止。
 *
 * 当前 W4 只挂 `POST /skills/install`。后续 W4/M2 增加的端点（campaigns 等）
 * 加到同一个 sub-router 下即可。
 *
 * 分层：
 *   - 本文件：只做 HTTP wiring（auth / actor / zod 校验 / 状态码）
 *   - installSkillHandler（在 ai-company plugin package）：所有 DB / 业务逻辑
 * server 不复制 handler 契约，只调 workspace 导入的实装。
 */

import { Router, type Request, type Response } from "express";
import { z } from "zod";

import type { Db } from "@paperclipai/db";
import { installSkillHandler } from "@ai-company/paperclip-plugin-ai-company/install-skill-handler";
import type {
  D18Score,
  InstallSkillRequest,
  SkillScope,
  SupplyChainTrust,
} from "@ai-company/paperclip-plugin-ai-company/install-skill-types";

import { badRequest, HttpError } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

const d18ScoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]) satisfies z.ZodType<D18Score>;

const supplyChainTrustSchema = z.enum([
  "official",
  "curated",
  "community",
  "anonymous",
]) satisfies z.ZodType<SupplyChainTrust>;

const skillScopeSchema = z.enum(["user", "company"]) satisfies z.ZodType<SkillScope>;

const installSkillBodySchema = z.object({
  companyId: z.string().uuid("companyId must be a UUID"),
  sourceUrl: z.string().min(1),
  d18Score: d18ScoreSchema,
  d18Justification: z.string().min(50, "d18_justification must be ≥ 50 chars"),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be a 64-char hex digest"),
  scope: skillScopeSchema,
  supplyChainTrust: supplyChainTrustSchema,
});

type InstallSkillBody = z.infer<typeof installSkillBodySchema>;

function toRequest(body: InstallSkillBody): InstallSkillRequest {
  return {
    sourceUrl: body.sourceUrl,
    d18Score: body.d18Score,
    d18Justification: body.d18Justification,
    sha256: body.sha256,
    scope: body.scope,
    supplyChainTrust: body.supplyChainTrust,
  };
}

export function aiCompanyPluginRoutes(db: Db) {
  const router = Router();
  const scoped = Router();

  scoped.post(
    "/skills/install",
    validate(installSkillBodySchema),
    async (req: Request, res: Response, next) => {
      try {
        const body = req.body as InstallSkillBody;
        assertCompanyAccess(req, body.companyId);
        const actor = getActorInfo(req);

        // Board 用户以 user 身份写入 audit；agent 以 agent 身份。
        const actorType: "user" | "agent" =
          actor.actorType === "agent" ? "agent" : "user";

        const result = await installSkillHandler(
          {
            db,
            companyId: body.companyId,
            actorType,
            actorId: actor.actorId,
          },
          toRequest(body),
        );

        // handler 契约：所有档均落 approval（pending or approved）；202 Accepted 语义正确
        res.status(202).json(result);
      } catch (err) {
        if (err instanceof HttpError) {
          next(err);
          return;
        }
        // 业务错（sha256 mismatch / D18=1 拒 / justification < 50）走 400
        const message = err instanceof Error ? err.message : String(err);
        next(badRequest(message));
      }
    },
  );

  router.use("/ai-company/v1", scoped);
  return router;
}
