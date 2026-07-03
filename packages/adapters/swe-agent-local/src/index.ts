import type {
  AdapterModelProfileDefinition,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test-env.js";

export const type = "swe_agent_local";
export const label = "SWE-agent (local · NeurIPS 2024)";

export const models: Array<{ id: string; label: string }> = [];
export const modelProfiles: AdapterModelProfileDefinition[] = [];

export const agentConfigurationDoc = `# swe_agent_local agent configuration

Adapter: swe_agent_local

Use when:
- You want Paperclip to run princeton-nlp/SWE-agent (NeurIPS 2024 SWE-bench SOTA at time of publication) as the agent runtime
- You need SWE-agent's Agent-Computer Interface (ACI) semantics — bash / edit_lines / show_file / find / str_replace
- You want the trajectory JSONL streamed into Paperclip activity_log as tool_call / tool_result / question events

Don't use when:
- You want a fast baseline (mini-swe-agent is 100 lines and much cheaper — see mini_swe_local)
- You want session resume (SWE-agent trajectories are per-run; use claude_local for resumable sessions)
- SWE-agent Python package is not installed

Prerequisites:
- Python 3.11+
- Docker (SWE-agent starts a per-instance container for the environment)
- \`pip install --user sweagent\` (see https://princeton-nlp.github.io/SWE-agent/installation/) OR clone princeton-nlp/SWE-agent + set command to \`python -m sweagent.run.run\`
- Model provider credentials (\`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\`)

Core fields:
- command (string, optional): defaults to "sweagent"; override to \`python -m sweagent.run.run\` or an absolute path
- cwd (string, optional): absolute working directory (defaults to Paperclip execution workspace cwd)
- model (string, optional): SWE-agent model id (e.g. "claude-sonnet-4-5", "gpt-4o"). Passed via \`--agent.model.name <id>\`.
- configFile (string, optional): path to a SWE-agent config yaml (\`--config <path>\`)
- problemStatement (string, optional): free-form task description; when omitted the adapter renders \`{{taskBody}}\` from Paperclip context
- extraArgs (string[], optional): additional CLI args appended to the invocation
- env (object, optional): KEY=VALUE environment variables merged into the child process env

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (default 1800 — SWE-agent runs are longer)
- graceSec (number, optional): SIGTERM grace period in seconds (default 10)

Trajectory event mapping (stdout JSONL → activity_log):
- SWE-agent \`action\` event → Paperclip \`agent_tool_call\` (details: cmd, args)
- SWE-agent \`observation\` event → Paperclip \`agent_tool_result\` (details: stdout, exit_code)
- SWE-agent \`human_input\` event → Paperclip \`agent_question_asked\` (details: prompt, choices)
- Unrecognized events → logged verbatim to stdout stream, no activity_log entry

Notes:
- SWE-agent 1.x defaults to JSONL trajectory output; older 0.x versions emit YAML.
  The adapter probes with \`--version\` (see test-env.ts) and warns if the major version is < 1.
- No skill sync — SWE-agent has its own ACI tool set; \`listSkills\` / \`syncSkills\` are omitted.
- No session resume — each run produces a fresh sessionId; SWE-agent trajectories are not designed to be resumed.
- No-remote-git contract respected (\`packages/adapters/AUTHORING.md\`): SWE-agent runs inside execution workspace cwd; all edits are on the local worktree; no git push.
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
          : "sweagent";
      return {
        command,
        detectCommand: command,
        installCommand: `if ! command -v ${shellQuote(command)} >/dev/null 2>&1; then pip install --user sweagent; fi`,
      };
    },
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export { createServerAdapter as createSweAgentLocalServerAdapter };
