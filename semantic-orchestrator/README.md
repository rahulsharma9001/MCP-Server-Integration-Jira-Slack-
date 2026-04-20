# Semantic Kernel Orchestrator

This folder adds a Semantic Kernel sidecar for high-level orchestration.

## Why this is a sidecar

Your existing Jira/Slack implementation is Node.js, while Semantic Kernel is officially supported in Python, C#, and Java. The clean integration is:

- `mcp-jira-slack/server.js`: MCP tool server for AI clients
- `mcp-jira-slack/http-bridge.js`: HTTP bridge for orchestration-safe action calls
- `semantic-orchestrator/orchestrator.py`: Semantic Kernel orchestration layer

## Architecture

```text
User / App
   |
   v
Semantic Kernel Orchestrator (Python)
   |
   v
HTTP Bridge (Node.js)
   |
   +--> Atlassian MCP Server
   |
   +--> Slack MCP Server
```

## What the orchestrator does

- interprets the request
- chooses the right function calls
- enforces execution order
- asks for follow-up when inputs are incomplete
- returns an execution summary

For a deeper explanation of how the Ollama-based orchestration works in this project, see [OLLAMA_ORCHESTRATION.md](/semantic-orchestrator/OLLAMA_ORCHESTRATION.md).

For a step-by-step setup and execution walkthrough, see [END_TO_END_RUN_GUIDE.md](/semantic-orchestrator/END_TO_END_RUN_GUIDE.md).

For a component-by-component explanation of runtime behavior, see [COMPONENTS_REFERENCE.md](/semantic-orchestrator/COMPONENTS_REFERENCE.md).

For the phased roadmap and current source of truth for future development, see [PHASED_DEVELOPMENT_PLAN.md](/semantic-orchestrator/PHASED_DEVELOPMENT_PLAN.md).

## Environment variables

### Node bridge

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

### Semantic Kernel

For Ollama:

```bash
LLM_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL_ID=llama3.2
ORCHESTRATION_BRIDGE_URL=http://localhost:3010
ORCHESTRATION_API_KEY=your-shared-secret
```

For OpenAI:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your-key
OPENAI_CHAT_MODEL_ID=gpt-4.1
ORCHESTRATION_BRIDGE_URL=http://localhost:3010
ORCHESTRATION_API_KEY=your-shared-secret
```

For Azure OpenAI:

```bash
LLM_PROVIDER=azure-openai
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_CHAT_DEPLOYMENT=your-deployment
ORCHESTRATION_BRIDGE_URL=http://localhost:3010
ORCHESTRATION_API_KEY=your-shared-secret
```

## Run flow

1. Start the Node bridge:

```bash
cd mcp-jira-slack
npm run start:bridge
```

2. Create a Python virtual environment and install dependencies:

```bash
cd semantic-orchestrator
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

3. If using Ollama, make sure the local Ollama service is running and pull a model once:

```bash
ollama serve
ollama pull llama3.2
```

4. Run the orchestrator:

```bash
python orchestrator.py "Create a bug ticket for login failures and notify the backend Slack channel"
```

## Recommended next upgrades

- add structured output validation for extracted fields
- add approval steps before production-impacting actions
- add retry and timeout policies per tool
- add a persistence layer for conversation and execution state
- add ticket templates by team, severity, and incident type
