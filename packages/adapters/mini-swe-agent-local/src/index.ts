import type {
  AdapterModelProfileDefinition,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test-env.js";

export const type = "mini_swe_local";
export const label = "Mini SWE Agent (local)";

export const models: Array<{ id: string; label: string }> = [];
export const modelProfiles: AdapterModelProfileDefinition[] = [];

export const agentConfigurationDoc = `# mini_swe_local agent configuration

Adapter: mini_swe_local

Use when:
- You want Paperclip to run princeton-nlp/mini-swe-agent (100-line Python reference SWE-bench agent) as the agent runtime
- You need the minimalist "one-tool bash" agent semantics for baseline / research comparisons
- You want a Python-side subprocess (not a Node.js CLI)

Don't use when:
- You want production quality SWE performance (use claude_local or SWE-agent-based adapters)
- mini-swe-agent Python package is not installed on the machine

Prerequisites:
- Python 3.11+ (see .python-version at repo root)
- \`pip install mini-swe-agent\` (or \`python -m pip install mini-swe-agent\` in the target venv)
- \`mini-swe-agent --version\` returns a version string
- Model provider credentials (Anthropic / OpenAI) set via env vars (\`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\`)

Core fields:
- command (string, optional): defaults to "mini-swe-agent"; override to an absolute path or "python -m minisweagent"
- cwd (string, optional): absolute working directory (defaults to Paperclip execution workspace cwd)
- model (string, optional): mini-swe-agent model id (e.g. "claude-sonnet-4-5", "gpt-4o"). Passed via \`--model <id>\`.
- promptTemplate (string, optional): user prompt template, defaults to \`{{taskBody}}\`. Interpolated with taskTitle / taskBody / agentName.
- extraArgs (string[], optional): additional CLI args appended to the invocation
- env (object, optional): KEY=VALUE environment variables merged into the child process env

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (default 600)
- graceSec (number, optional): SIGTERM grace period in seconds (default 5)

Notes:
- mini-swe-agent runs inside the execution workspace cwd; all edits it makes are on the local worktree
- No git remote required (adherence to AUTHORING.md no-remote-git contract)
- No skill sync mechanism — mini-swe-agent has no notion of skills; \`listSkills\` / \`syncSkills\` are omitted
- No session resume (adapter reports a fresh sessionId per run)
- The adapter maps stdin/stdout of the mini-swe-agent process to Paperclip's AdapterExecutionResult contract:
  - stdout / stderr streamed via \`onLog\`
  - exit code + timeout captured in AdapterExecutionResult
`;

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    models,
    modelProfiles,
    supportsLocalAgentJwt: false,
    supportsInstructionsBundle: false,
    instructionsPathKey: "instructionsFilePath",
    requiresMaterializedRuntimeSkills: false,
    agentConfigurationDoc,
    getRuntimeCommandSpec: (config) => {
      const command =
        typeof config.command === "string" && config.command.trim().length > 0
          ? config.command.trim()
          : "mini-swe-agent";
      return {
        command,
        detectCommand: command,
        installCommand: `if ! command -v ${shellQuote(command)} >/dev/null 2>&1; then pip install --user mini-swe-agent; fi`,
      };
    },
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export { createServerAdapter as createMiniSweLocalServerAdapter };
