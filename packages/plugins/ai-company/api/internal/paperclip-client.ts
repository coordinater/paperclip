/**
 * paperclip-client — 全项目唯一允许 import PaperClip core route module
 * 或直接 fetch `/api/agents/*`、`/api/issues/*` 等 core prefix 的地方。
 *
 * 契约锚点（handoff/06 §2.2 + 反模式红线 9）：
 *  - 其他所有 ai-company 文件调 core 必须 import 本文件导出的函数
 *  - 一旦上游 route 变动，只在这里改一次，v1 契约岿然不动
 *  - 本文件 review 时须显式对齐 PaperClip 主线的 route commit
 *
 * 这是 skeleton，不是实现。W2-D10 只做架构约束：把"只有这个文件能碰
 * core"这条边界物理化。真实 client 方法（invokeHeartbeat / createApproval /
 * createIssue / assignTask / writeActivityLog 等）在后续施工日填充。
 */

/**
 * PaperClip core client 的最小契约占位。
 *
 * 后续将扩展成具体方法（见 JSDoc 顶部列表）。此处刻意保持空 interface +
 * 一个 stub factory，让下游代码可以先 import 类型 + 依赖 factory 签名，
 * 而不用等真实实现。
 */
export interface PaperclipClient {
  // TODO(W2-D11+): 逐步补齐 core 调用面。第一批候选：
  //   createApproval(input: { type: 'install_skill'; metadata: ... }): Promise<{ id: string }>
  //   writeActivityLog(input: { action: string; metadata: ... }): Promise<void>
  //   createIssue(input: ...): Promise<{ id: string }>
  //   invokeHeartbeat(agentId: string): Promise<void>
}

/**
 * 建 client 的入口。参数以 opaque config 形态传入；实现细节（是走
 * in-process module import 还是 HTTP fetch localhost:3000）由本文件独享。
 */
export function createPaperclipClient(_config: PaperclipClientConfig): PaperclipClient {
  // TODO(W2-D11+): implement per handoff/06 §2.2 内部调用 core 段。
  throw new Error("createPaperclipClient: skeleton only, not yet implemented");
}

export interface PaperclipClientConfig {
  /**
   * 基础 URL。开发时 `http://localhost:3000`，生产由 runtime 注入。
   * 允许为空——in-process 部署下直接走 module import，不经 HTTP。
   */
  baseUrl?: string;
  /**
   * 认证 token 引用。绝不硬编码；走 `{{secret:PAPERCLIP_INTERNAL_TOKEN}}`
   * 或 runtime 提供的 service-account principal（handoff/06 §6）。
   */
  authTokenRef?: string;
}
