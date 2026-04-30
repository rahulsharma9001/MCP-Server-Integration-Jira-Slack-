# End-to-End Run Guide

This guide explains how to run the Jira + Slack orchestration flow end to end using the Semantic Kernel sidecar and Ollama.

It is written for someone who wants a clear setup and test path without needing to understand the full codebase first.

## What This Flow Does

At a high level, the system works like this:

1. You give a natural-language request.
2. The Python orchestrator interprets the request.
3. The orchestrator calls the Node HTTP bridge.
4. The bridge performs the real actions:
   - call the Atlassian MCP server for Jira actions
   - call the Slack MCP server for Slack actions
5. The result is returned to the terminal.

## Components Involved

There are three moving parts you need to know about:

- `Ollama`
  Runs the local LLM used by the orchestrator.

- `semantic-orchestrator/`
  The Python sidecar that handles orchestration logic.

- `mcp-jira-slack/`
  The Node service that talks to the Atlassian MCP server and Slack MCP server.

## Before You Start

Make sure you have all of the following available:

- Node.js installed
- Python 3 installed
- Ollama installed
- Atlassian MCP authentication details
- Slack MCP authentication details

You also need a root `.env` file in the project with the required settings.

## Required Environment Variables

The root `.env` should contain the core settings for Jira, Slack, orchestration, and Ollama.

Example:

```bash
# Jira defaults used by orchestration
JIRA_PROJECT_KEY=SCRUM

# Slack defaults used by orchestration
DEFAULT_SLACK_CHANNEL=C12345678

# Orchestration bridge
ORCHESTRATION_API_PORT=3010
ORCHESTRATION_API_KEY=your-shared-secret
ORCHESTRATION_BRIDGE_URL=http://localhost:3010

# MCP-backed execution
INTEGRATION_MODE=mcp

# Atlassian Rovo MCP
ATLASSIAN_MCP_URL=https://mcp.atlassian.com/v1/mcp
ATLASSIAN_MCP_CREATE_ISSUE_TOOL=createJiraIssue
# Use one of the following auth approaches:
# ATLASSIAN_MCP_AUTH_HEADER=Basic base64(email:api_token)
ATLASSIAN_MCP_EMAIL=your-email@example.com
ATLASSIAN_MCP_API_TOKEN=your-atlassian-api-token

# Slack MCP
SLACK_MCP_URL=https://mcp.slack.com/mcp
SLACK_MCP_SEND_MESSAGE_TOOL=slack_send_message
SLACK_MCP_AUTH_HEADER=Bearer your-slack-mcp-access-token
# Optional, depending on your Slack MCP setup:
SLACK_MCP_APP_ID=your-slack-app-id
SLACK_MCP_CHANNEL_ARG=channel_id
SLACK_MCP_TEXT_ARG=message

# Ollama
LLM_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL_ID=llama3.2
```

## One-Time Setup

### 1. Install Node dependencies

From the Node service directory:

```bash
cd /home/nashtech/Desktop/jira-mcp-server/mcp-jira-slack
npm install
```

This installs the packages required for the HTTP bridge and the MCP-backed Jira/Slack execution layer.

### 2. Create the Python virtual environment

From the orchestrator directory:

```bash
cd /home/nashtech/Desktop/jira-mcp-server/semantic-orchestrator
python3 -m venv .venv
source .venv/bin/activate (For Linux)
.venv\Scripts\Activate (For Windows)
pip install -r requirements.txt
```

This installs Semantic Kernel, the Python bridge client, dotenv support, and the Python Ollama package.

### 3. Start Ollama and pull the model

If you have not already downloaded the model, do this once:

```bash
ollama pull llama3.2
```

Then make sure the Ollama service is running:

```bash
ollama serve
```

If Ollama is already running in the background, you do not need to start it again.

## Runtime Startup Order

For the cleanest experience, start the services in this order.

### Step 1. Start the Node HTTP bridge

Open Terminal 1:

```bash
cd /home/nashtech/Desktop/jira-mcp-server/mcp-jira-slack

npm run start:bridge

      OR

node http-bridge.js 
```

Expected behavior:

- the process starts successfully
- the bridge listens on port `3010`
- the bridge reads values from the root `.env`

If you see `EADDRINUSE`, it usually means the bridge is already running in another terminal.

### Step 2. Start or confirm Ollama is running

Open Terminal 2:

```bash
ollama serve
```

If the service is already running, this step may not be needed.

You can also check which models are available:

```bash
ollama list
```

Make sure the model in `.env` matches one of the models shown here.

### Step 3. Activate the Python environment

Open Terminal 3:

```bash
cd /home/nashtech/Desktop/jira-mcp-server/semantic-orchestrator

source .venv/bin/activate (For Linux)

.venv\Scripts\Activate (For Windows)
```

Now the orchestrator commands will use the correct Python environment and installed dependencies.

## Recommended Validation Flow

Run the following tests in order. This makes it easier to identify where a failure is happening.

### Test 1. Check bridge health

From any terminal:

```bash
curl -H "x-api-key: your-shared-secret" http://localhost:3010/health
```

Expected response:

```json
{"ok":true}
```

This confirms:

- the Node bridge is running
- the shared bridge key is correct

### Test 2. Test Slack directly through the bridge

```bash
curl -X POST "http://localhost:3010/actions/send-slack-message" \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-shared-secret" \
  -d '{"channel":"C12345678","text":"Bridge test message"}'
```

Expected result:

- a JSON success response
- the message appears in Slack

This confirms the Slack MCP integration is working independently of the orchestrator.

### Test 3. Test Jira creation directly through the bridge

```bash
curl -X POST "http://localhost:3010/actions/create-jira-ticket" \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-shared-secret" \
  -d '{
    "summary":"Integration test ticket",
    "description":"Created from bridge test",
    "issueType":"Task",
    "notifySlack":true
  }'
```

Expected result:

- a Jira ticket is created
- Slack is notified if `notifySlack` is `true`

This confirms the Jira + Slack MCP-backed bridge flow is working before the LLM is involved.

### Test 4. Test Slack through the orchestrator

From the Python orchestrator terminal:

```bash
python orchestrator.py "Send a Slack message saying the Ollama orchestrator test is working"
```

Expected result:

- the message is sent to the configured default Slack channel
- the terminal prints an execution summary

### Test 5. Test Jira + Slack through the orchestrator

```bash
python orchestrator.py "Create a Jira task titled Ollama integration test and notify Slack that the ticket was created"
```

Expected result:

- a Jira ticket is created in the default project
- Slack receives a notification in the default channel
- the terminal prints a real execution summary using the bridge response

### Test 6. Use interactive clarification mode (new)

If your prompt is ambiguous or missing required details, run the orchestrator in interactive mode:

```bash
python orchestrator.py --interactive "Create a Jira bug for the reported login issue and notify Slack"
```

How this works:

- first, deterministic execution is attempted for common request patterns
- if details are missing, Semantic Kernel + the LLM asks a concise follow-up
- you can provide the missing input in real time in the same terminal session
- once enough information is available, the action is executed and the execution summary is printed

To stop an interactive session, type `exit` when prompted.

## What Happens Internally During Orchestration

For a simple request like:

```text
Create a Jira task titled Ollama integration test and notify Slack that the ticket was created
```

the flow is:

1. `orchestrator.py` reads the user request.
2. It detects that the request is a simple Jira + Slack flow.
3. It uses the deterministic execution path by default or Semantic Kernel's reasoning path approach when needed.
4. It calls `bridge_plugin.py`.
5. The plugin calls the Node HTTP bridge.
6. The Node bridge calls the Atlassian MCP server to create the Jira ticket.
7. The Node bridge calls the Slack MCP server to send the Slack message.
8. The structured response comes back to Python.
9. The terminal prints the result.

This deterministic path exists so that common operational commands execute reliably even when local-model tool calling is inconsistent.

For prompts that require clarification, `--interactive` keeps a short conversation context in memory so the LLM can consume your follow-up answers and continue execution without restarting from scratch.

## Reasoning Mode: How LLM Execution Actually Works

When deterministic execution does not match a request shape, the orchestrator uses Semantic Kernel reasoning mode.

Internal mechanism:

1. `orchestrator.py` sends a prompt with execution policy + user request (+ prior interactive turns).
2. Semantic Kernel invokes the selected provider from `.env`:
   - `LLM_PROVIDER=ollama`
   - `LLM_PROVIDER=openai`
   - `LLM_PROVIDER=azure-openai`
3. Tool-calling is enabled via `FunctionChoiceBehavior.Auto(...)`, restricted to plugin `JiraSlackBridge`.
4. The LLM can only execute actions by calling plugin functions in `bridge_plugin.py`.
5. Plugin functions call Node bridge endpoints:
   - `/actions/create-jira-ticket`
   - `/actions/send-slack-message`
   - `/actions/update-jira-status`
6. Node bridge performs Jira/Slack side effects through Atlassian MCP and Slack MCP.

This means reasoning text alone does not count as execution. Real execution is only confirmed when the bridge call returns successfully and side effects are visible in Jira/Slack.

### Safety and trust behavior

- Deterministic path is attempted first for reliability.
- If the LLM returns a success-looking summary without bridge-grounded execution format, the summary is treated as untrusted.
- The orchestrator then attempts a reasoned follow-through bridge execution using conversation context.
- If that still fails, the CLI asks for an explicit actionable command instead of showing false success.

## MCP-Specific Notes

- The Atlassian MCP tool name defaults to `createJiraIssue`, which matches Atlassian's documented Jira create tool.
- The Slack MCP tool name may vary depending on your Slack MCP configuration. In this validated setup it is `slack_send_message`, and the argument mapping is `channel_id` + `message`.
- The current implementation uses auth headers from `.env`. That keeps the process feasible for backend automation, but it assumes you have already completed any required vendor-side OAuth or token provisioning outside this repo.

## Common Problems and Fixes

### Problem: `.venv/bin/activate: No such file or directory`

Cause:
- the Python virtual environment has not been created yet

Fix:

```bash
cd /home/nashtech/Desktop/jira-mcp-server/semantic-orchestrator
python3 -m venv .venv
source .venv/bin/activate
```

### Problem: `EADDRINUSE: address already in use :::3010`

Cause:
- the bridge is already running on port `3010`

Fix:
- reuse the running bridge
- or stop the existing process and restart cleanly

Useful command:

```bash
lsof -i :3010 -P -n
```

### Problem: `model 'llama3.2' not found`

Cause:
- Ollama is running, but the model has not been downloaded

Fix:

```bash
ollama pull llama3.2
```

### Problem: Slack MCP tool not found

Cause:
- `SLACK_MCP_SEND_MESSAGE_TOOL` does not match the actual Slack MCP server tool name

Fix:
- inspect the error message returned by the bridge
- update `SLACK_MCP_SEND_MESSAGE_TOOL` in `.env` to the actual tool name exposed by your Slack MCP server

### Problem: OpenAI quota errors

Cause:
- `.env` is still configured for `openai`
- or OpenAI settings are still being used instead of Ollama

Fix:
- confirm the root `.env` contains:

```bash
LLM_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL_ID=llama3.2
```

### Problem: The orchestrator says work was done, but nothing happened

Cause:
- local model output can sometimes describe actions without actually executing them

Fix:
- use the current deterministic request shapes
- verify Jira and Slack directly
- make sure you are running the latest orchestrator code with the deterministic execution path

## Tips for New Users

- Keep the root `.env` accurate. Most runtime issues come from configuration mismatches.
- Treat Jira and Slack as the final source of truth for side effects.
- Start by testing the bridge directly before blaming the LLM layer.
- Use simple phrasing for operational requests when possible.
- If you change the Ollama model, make sure `.env` and `ollama list` match exactly.
- If you move to different MCP servers or tool names, update the MCP URL and tool-name env vars before testing.

## Quick Start Summary

If you only want the shortest possible working sequence:

1. Fill in the root `.env`
2. Run `npm install` in `mcp-jira-slack/`
3. Create `.venv` and run `pip install -r requirements.txt` in `semantic-orchestrator/`
4. Run `ollama pull llama3.2`
5. Start `ollama serve`
6. Start `npm run start:bridge`
7. Run:

```bash
python orchestrator.py "Create a Jira task titled Ollama integration test and notify Slack that the ticket was created"
```

For a quick bridge-level confidence check while `npm run start:bridge` is running, you can also run:

```bash
cd /home/nashtech/Desktop/jira-mcp-server/mcp-jira-slack
npm run smoke:mcp-bridge
```

If the Jira ticket is created and Slack receives the notification, the end-to-end setup is working.
