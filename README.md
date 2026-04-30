# MCP Server Integration: Jira + Slack + Semantic Kernel

## Project Overview
This repository is a practical integration project that combines:
- A Node.js MCP tool server for Jira and Slack operations
- A Node.js HTTP bridge for controlled action execution
- A Python Semantic Kernel orchestrator for natural-language decisioning and tool invocation

The goal is to validate and demonstrate a real orchestration pattern where Semantic Kernel can coordinate operational workflows while MCP-connected services execute the actual side effects.

## Motive / Objective
To find whether semantic kernel is feasible with MCP server integration or not.

## What This Project Solves
- Accepts natural-language operational requests
- Creates Jira tickets through MCP-integrated flows
- Sends Slack notifications based on workflow rules
- Supports deterministic execution for common request patterns
- Falls back to Semantic Kernel reasoning when intent is complex or underspecified

## High-Level Architecture
```text
User Request
   |
   v
Semantic Kernel Orchestrator (Python)
   |
   v
HTTP Bridge (Node.js)
   |
   +--> Jira workflow (via MCP-enabled service path)
   |
   +--> Slack workflow (via MCP-enabled service path)
```

There is also a legacy standalone root MCP server (`index.js`) kept for compatibility/testing.

## Repository Structure
```text
.
├── README.md
├── package.json                      # Legacy root MCP server package
├── index.js                          # Legacy standalone Jira MCP server
├── mcp-jira-slack/
│   ├── server.js                     # MCP stdio server entry point
│   ├── http-bridge.js                # HTTP bridge for orchestrator actions
│   ├── package.json
│   ├── src/
│   │   ├── config.js
│   │   ├── mcp-server.js
│   │   ├── services/
│   │   └── workflows/
│   └── scripts/                      # Discovery/verification/smoke scripts
└── semantic-orchestrator/
    ├── orchestrator.py               # Semantic Kernel runtime
    ├── bridge_plugin.py              # Plugin functions calling bridge endpoints
    ├── requirements.txt
    ├── README.md
    ├── assets/
    └── docs/
```

## Core Components
1. `mcp-jira-slack/server.js`
- Runs MCP server over stdio
- Exposes Jira/Slack tools to MCP clients

2. `mcp-jira-slack/http-bridge.js`
- Exposes HTTP endpoints:
  - `GET /health`
  - `POST /actions/send-slack-message`
  - `POST /actions/create-jira-ticket`
  - `POST /actions/update-jira-status`
- Validates API key (`x-api-key`) when configured

3. `semantic-orchestrator/orchestrator.py`
- Accepts natural-language requests
- Uses deterministic parsing for common requests
- Falls back to Semantic Kernel function-calling when needed
- Produces execution summaries grounded in bridge responses

4. `index.js` (root)
- Legacy direct Jira MCP server (standalone path)

## Tech Stack
- Node.js (ESM)
- Python 3.x
- Semantic Kernel
- MCP SDK (`@modelcontextprotocol/sdk`)
- Jira API integrations
- Slack integrations

## Prerequisites
- Node.js 18+
- Python 3.10+
- Jira and Slack credentials/tokens
- Optional: Ollama (if using local model provider)

## Environment Configuration
Create/update the root `.env` file.

### Bridge and MCP runtime
```bash
ORCHESTRATION_API_PORT=3010
ORCHESTRATION_API_KEY=your-shared-secret

INTEGRATION_MODE=mcp
ATLASSIAN_MCP_URL=https://mcp.atlassian.com/v1/mcp
ATLASSIAN_MCP_CREATE_ISSUE_TOOL=createJiraIssue
ATLASSIAN_MCP_EMAIL=your-email@example.com
ATLASSIAN_MCP_API_TOKEN=your-atlassian-api-token

SLACK_MCP_URL=https://mcp.slack.com/mcp
SLACK_MCP_SEND_MESSAGE_TOOL=slack_send_message
SLACK_MCP_AUTH_HEADER=Bearer your-slack-mcp-access-token
SLACK_MCP_APP_ID=your-slack-app-id
SLACK_MCP_CHANNEL_ARG=channel_id
SLACK_MCP_TEXT_ARG=message
```

### Semantic Kernel provider options
Use one provider block:

```bash
# Option 1: Ollama
LLM_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL_ID=llama3.2
ORCHESTRATION_BRIDGE_URL=http://localhost:3010
ORCHESTRATION_API_KEY=your-shared-secret
```

```bash
# Option 2: OpenAI
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_CHAT_MODEL_ID=gpt-4.1
ORCHESTRATION_BRIDGE_URL=http://localhost:3010
ORCHESTRATION_API_KEY=your-shared-secret
```

```bash
# Option 3: Azure OpenAI
LLM_PROVIDER=azure-openai
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_CHAT_DEPLOYMENT=your-deployment
ORCHESTRATION_BRIDGE_URL=http://localhost:3010
ORCHESTRATION_API_KEY=your-shared-secret
```

### Legacy direct Jira mode (root `index.js`)
```bash
JIRA_HOST=https://your-domain.atlassian.net
# or JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-atlassian-api-token
```

## Installation
From repository root:

```bash
npm install
```

Install Node dependencies for MCP/bridge module:

```bash
cd mcp-jira-slack
npm install
```

Install Python dependencies:

```bash
cd ../semantic-orchestrator
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## How to Run
### 1. Start Node bridge
```bash
cd mcp-jira-slack
npm run start:bridge
```

### 2. (Optional) Start MCP stdio server
```bash
cd mcp-jira-slack
npm run start:mcp
```

### 3. Run Semantic Kernel orchestrator
```bash
cd semantic-orchestrator
python orchestrator.py "Create a Jira bug for login failures and notify Slack"
```

Interactive mode:
```bash
python orchestrator.py --interactive "Create a ticket for checkout timeout"
```

## Utility Scripts
Inside `mcp-jira-slack`:
- `npm run discover:atlassian-mcp`
- `npm run verify:atlassian-mcp`
- `npm run discover:slack-mcp`
- `npm run verify:slack-mcp`
- `npm run smoke:mcp-bridge`

## Typical Execution Flow
1. User gives a natural-language request.
2. Orchestrator first tries deterministic handling.
3. If needed, Semantic Kernel reasoning triggers constrained plugin function calls.
4. Plugin calls Node HTTP bridge endpoints.
5. Bridge executes Jira/Slack workflows.
6. Orchestrator returns execution summary (ticket key, Slack status, warnings).

## Known Notes
- Root `index.js` is a legacy compatibility path, not the main demo flow.
- Main integration path is `semantic-orchestrator` + `mcp-jira-slack/http-bridge.js`.
- Keep secrets only in `.env` and avoid committing tokens.

## Troubleshooting
- 401 from bridge:
  - Verify `ORCHESTRATION_API_KEY` matches request header `x-api-key`.
- Slack message not delivered:
  - Verify Slack auth header/token, app permissions, and channel argument mapping.
- Jira issue creation fails:
  - Verify Atlassian MCP credentials, project key defaults, and issue type mapping.
- Orchestrator cannot execute:
  - Confirm selected `LLM_PROVIDER` variables are fully set.

## Additional Documentation
- `semantic-orchestrator/README.md`
- `semantic-orchestrator/docs/END_TO_END_RUN_GUIDE.md`
- `semantic-orchestrator/docs/COMPONENTS_REFERENCE.md`
- `semantic-orchestrator/docs/OLLAMA_ORCHESTRATION.md`
- `semantic-orchestrator/docs/PHASED_DEVELOPMENT_PLAN.md`

## Status
This project is an active feasibility and integration testbed for Semantic Kernel + MCP-based operational automation.
