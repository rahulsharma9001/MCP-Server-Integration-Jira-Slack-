# Ollama Orchestration Guide

This document explains how orchestration works in this project when `Ollama` is used as the LLM provider, and what practical benefits the orchestration layer adds on top of the existing Jira and Slack integrations.

## What Is Being Orchestrated

This project has two execution layers:

1. The Node bridge in `mcp-jira-slack/`, which performs the real side effects:
   - create Jira tickets
   - send Slack messages
2. The Python orchestrator in `semantic-orchestrator/`, which decides what should happen for a natural-language request.

With Ollama enabled, the orchestrator uses a local model instead of a paid cloud model to interpret user requests and choose the right action flow.

## High-Level Flow

The orchestration flow looks like this:

```text
User Request
   |
   v
semantic-orchestrator/orchestrator.py
   |
   +--> Simple request? Execute deterministic path directly
   |       |
   |       v
   |   bridge_plugin.py
   |       |
   |       v
   |   Node HTTP bridge
   |
   +--> More open-ended request? Use Ollama through Semantic Kernel
           |
           v
       bridge_plugin.py
           |
           v
       Node HTTP bridge
           |
           +--> Jira API
           |
           +--> Slack API
```

## Main Files Involved

- `semantic-orchestrator/orchestrator.py`
  This is the main orchestration entry point. It loads environment variables, selects the LLM provider, decides whether a request can be handled deterministically, and otherwise routes the prompt through Semantic Kernel.

- `semantic-orchestrator/bridge_plugin.py`
  This is the controlled execution layer used by the orchestrator. It exposes safe functions for:
  - `create_jira_ticket`
  - `send_slack_message`
  - `get_execution_policy`

- `mcp-jira-slack/http-bridge.js`
  This receives authorized HTTP requests from the Python side and forwards them to the Jira and Slack service code.

- `mcp-jira-slack/src/workflows/ticket-orchestration.js`
  This is where the Node side ensures Jira is created first and Slack is notified after that.

## How Ollama Is Used

When the root `.env` contains:

```bash
LLM_PROVIDER=ollama
OLLAMA_HOST=http://127.0.0.1:11434
OLLAMA_CHAT_MODEL_ID=llama3.2
```

the Python orchestrator creates an `OllamaChatCompletion` service and uses that as the reasoning engine.

This means:

- no OpenAI API quota is required
- no cloud billing is required for prompt execution
- model inference runs through your local Ollama instance

## Why There Is a Deterministic Path

Local models can be weaker than cloud models at function calling. In early testing, the Ollama model sometimes produced a convincing summary like "Jira ticket created" without actually calling Jira or Slack.

To fix that, the orchestrator now has a deterministic execution path for straightforward commands such as:

- `Create a Jira task titled X and notify Slack`
- `Send a Slack message saying Y`

For these simple request shapes, `orchestrator.py` parses the request directly and invokes the bridge plugin immediately. That gives two major improvements:

1. The action really executes.
2. The terminal output is built from the actual bridge response, not from model-generated prose.

This is why the project now feels more reliable with Ollama.

## How a Jira + Slack Request Works

Example request:

```text
Create a Jira task titled Ollama integration test and notify Slack that the ticket was created
```

Execution path:

1. `orchestrator.py` inspects the request.
2. It detects a simple Jira creation request with a title.
3. It calls `JiraSlackBridgePlugin.create_jira_ticket(...)`.
4. `bridge_plugin.py` fills in a default description if one was not provided.
5. The plugin sends an authorized HTTP request to the Node bridge.
6. The Node bridge creates the Jira issue.
7. The Node bridge sends the Slack notification.
8. The bridge returns structured JSON.
9. The orchestrator prints a summary using the real bridge response, including the Jira key when available.

## Defaulting Behavior

The orchestration layer now uses sensible defaults to reduce unnecessary follow-up questions:

- If Jira description is missing but summary is present, a default description is generated automatically.
- If project key is omitted, the configured `JIRA_PROJECT_KEY` is used.
- If Slack channel is omitted, the configured `DEFAULT_SLACK_CHANNEL` is used.
- If issue type is not specified, `Task` is used by default unless the request clearly implies `Bug` or `Incident`.

These defaults are important because they convert many natural requests into executable actions without making the user stop and fill in extra fields.

## Security and Boundaries

The Python orchestrator does not talk to Jira or Slack directly. Instead, it calls the Node bridge using:

- `ORCHESTRATION_BRIDGE_URL`
- `ORCHESTRATION_API_KEY`

That gives the project a cleaner boundary:

- the Python side handles interpretation and orchestration
- the Node side handles side effects and service integrations
- the shared API key limits who can call the bridge

## Benefits After Adding Orchestration

Using orchestration with Ollama gives the project several benefits.

### 1. Natural-language requests become executable workflows

Instead of calling Jira and Slack separately, a single request can drive a multi-step flow:

- create Jira
- notify Slack
- keep the order correct

### 2. Local-model support reduces cost

Because Ollama runs locally, you can test and use the orchestration layer without OpenAI API quota or recurring prompt charges.

### 3. Better defaults reduce friction

The orchestrator can now proceed with:

- default Jira project
- default Slack channel
- auto-generated Jira description

That makes the system easier to use from plain English requests.

### 4. Real execution summaries are now possible

For the deterministic path, the terminal output reflects actual bridge results instead of only model-written summaries. This makes testing and debugging much more trustworthy.

### 5. The architecture is cleaner

The system now has a clearer separation of concerns:

- Python orchestrates
- Node executes
- Jira and Slack remain isolated behind the bridge

That makes the codebase easier to extend later.

### 6. It is easier to add more workflow rules

Because orchestration is centralized, future improvements can be added in one place, such as:

- approval steps before production-impacting actions
- ticket templates by issue type
- retries and fallback handling
- richer summaries with ticket links
- support for additional tools beyond Jira and Slack

## When the LLM Is Still Useful

Even with the deterministic path, Ollama is still useful for requests that are less rigid, for example:

- deciding whether the user wants Jira, Slack, or both
- interpreting more free-form intent
- handling future multi-step workflows that are not simple pattern matches

So the project is not "LLM-free." It is now "LLM-assisted, with deterministic execution for the actions that must be reliable."

## Recommended Usage Pattern

For best results:

1. Use deterministic phrasing for operational requests.
2. Keep the Node bridge running before starting the orchestrator.
3. Confirm `.env` contains the shared orchestration settings.
4. Use Ollama for low-cost local execution.
5. Trust Jira and Slack as the final source of truth for side effects.

## Summary

After adding orchestration with Ollama, this project is no longer just a set of separate Jira and Slack integrations. It is now a small workflow engine that can:

- interpret natural-language requests
- apply defaults intelligently
- execute multi-step actions in the right order
- use a local model instead of a paid API
- return results grounded in real execution data for common request types
