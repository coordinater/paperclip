import type {
  AdapterModelProfileDefinition,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
import { execute } from "./execute.js";
import { testEnvironment } from "./test-env.js";

export const type = "openhands_local";
export const label = "OpenHands (local · Docker runtime)";

export const models: Array<{ id: string; label: string }> = [];
export const modelProfiles: AdapterModelProfileDefinition[] = [];

export const agentConfigurationDoc = `# openhands_local agent configuration

Adapter: openhands_local

Use when:
- You want Paperclip to run All-Hands-AI/OpenHands as the agent runtime
- You need Docker-sandboxed execution (OpenHands' primary security posture)
- You want event-streaming (agent action / observation / user_message) JSONL captured to Paperclip activity_log
- You want a strong "generalist" agent (not SWE-specialized) as a comparison point vs SWE-agent

Don't use when:
- You want a lightweight baseline (use mini_swe_local · M2 W5-D1)
- Docker is unavailable or heavyweight for your workspace
- OpenHands Python package + Docker image is not installed

Prerequisites:
- Python 3.11+
- Docker (required · OpenHands sandboxes agent tools in Docker containers)
- \`pip install --user openhands-ai\` (see https://docs.all-hands.dev/modules/usage/installation)
- Pull the OpenHands runtime image: \`docker pull ghcr.io/all-hands-ai/runtime:latest\`
- Model provider credentials (\`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\`)

Core fields:
- command (string, optional): defaults to "openhands"; override to \`python -m openhands.core.main\` or absolute path
- cwd (string, optional): absolute working directory (defaults to Paperclip execution workspace cwd)
- model (string, optional): OpenHands model id (e.g. "claude-sonnet-4-5", "gpt-4o"). Passed via \`--llm-model <id>\`.
- taskDescription (string, optional): free-form task text; when omitted the adapter renders \`{{taskBody}}\` from Paperclip context
- maxIterations (number, optional): cap on agent-loop iterations (default 30)
- extraArgs (string[], optional): additional CLI args
- env (object, optional): KEY=VALUE environment variables

Operational fields:
- timeoutSec (number, optional): run timeout in seconds (default 1800)
- graceSec (number, optional): SIGTERM grace period in seconds (default 10)

Event mapping (stdout JSONL → activity_log):
- OpenHands \`agent_action\` event → Paperclip \`agent_tool_call\`
- OpenHands \`observation\` event → Paperclip \`agent_tool_result\`
- OpenHands \`user_message\` event → Paperclip \`agent_question_asked\` (rare · agent typically autonomous)
- Unrecognized → \`agent_event_unknown\` (audit trail preserved)

Notes:
- OpenHands 1.x defaults to JSON event stream (one event per stdout line). Older 0.x versions
  emit a mix — the parser is defensive and skips non-JSON lines silently.
- No skill sync (OpenHands has its own tool ACI · \`listSkills\` / \`syncSkills\` omitted)
- No session resume (each run fresh sessionId · OpenHands trajectories are per-run)
- No-remote-git contract respected (AUTHORING.md): OpenHands runs inside execution workspace cwd
- Docker runtime lifecycle managed by OpenHands itself · the adapter does not spin containers directly
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
          : "openhands";
      return {
        command,
        detectCommand: command,
        installCommand: `if ! command -v ${shellQuote(command)} >/dev/null 2>&1; then pip install --user openhands-ai; fi`,
      };
    },
  };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export { createServerAdapter as createOpenHandsLocalServerAdapter };
