# End-to-End Run Guide

This guide explains how to run the Jira + Slack orchestration flow end to end using the Semantic Kernel sidecar and Ollama.

It is written for someone who wants a clear setup and test path without needing to understand the full codebase first.

## What This Flow Does

At a high level, the system works like this:

1. You give a natural-language request.
2. The Python orchestrator interprets the request.
3. The orchestrator calls the Node HTTP bridge.
4. The bridge performs the real actions:
   - create a Jira ticket
   - send a Slack message
5. The result is returned to the terminal.

## Components Involved

There are three moving parts you need to know about:

- `Ollama`
  Runs the local LLM used by the orchestrator.

- `semantic-orchestrator/`
  The Python sidecar that handles orchestration logic.

- `mcp-jira-slack/`
  The Node service that talks to Jira and Slack.

## Before You Start

Make sure you have all of the following available:

- Node.js installed
- Python 3 installed
- Ollama installed
- valid Jira credentials
- valid Slack bot token

You also need a root `.env` file in the project with the required settings.

## Required Environment Variables

The root `.env` should contain the core settings for Jira, Slack, orchestration, and Ollama.

Example:

```bash
# Jira
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your-jira-api-token
JIRA_PROJECT_KEY=SCRUM

# Slack
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
DEFAULT_SLACK_CHANNEL=C12345678

# Orchestration bridge
ORCHESTRATION_API_PORT=3010
ORCHESTRATION_API_KEY=your-shared-secret
ORCHESTRATION_BRIDGE_URL=http://localhost:3010

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

This installs the packages required for the HTTP bridge and Jira/Slack service integration.

### 2. Create the Python virtual environment

From the orchestrator directory:

```bash
cd /home/nashtech/Desktop/jira-mcp-server/semantic-orchestrator
python3 -m venv .venv
source .venv/bin/activate
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
source .venv/bin/activate
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

This confirms the Slack integration is working independently of the orchestrator.

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

This confirms the Jira + Slack bridge flow is working before the LLM is involved.

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

## What Happens Internally During Orchestration

For a simple request like:

```text
Create a Jira task titled Ollama integration test and notify Slack that the ticket was created
```

the flow is:

1. `orchestrator.py` reads the user request.
2. It detects that the request is a simple Jira + Slack flow.
3. It uses the deterministic execution path.
4. It calls `bridge_plugin.py`.
5. The plugin calls the Node HTTP bridge.
6. The Node bridge creates the Jira ticket.
7. The Node bridge sends the Slack message.
8. The structured response comes back to Python.
9. The terminal prints the result.

This deterministic path exists so that common operational commands execute reliably even when local-model tool calling is inconsistent.

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

If the Jira ticket is created and Slack receives the notification, the end-to-end setup is working.
