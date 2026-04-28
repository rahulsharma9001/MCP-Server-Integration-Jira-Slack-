# Components Reference

This document explains each component in the current architecture and what it does at runtime.

The goal is to make the system easy to understand for contributors who want to debug, extend, or operate it.

## Architecture Snapshot

```text
User Request
   |
   v
Semantic Kernel Orchestrator (Python)
   |
   v
Bridge Plugin (Python)
   |
   v
HTTP Bridge (Node.js)
   |
   +--> Atlassian MCP Server --> Jira Cloud
   |
   +--> Slack MCP Server --> Slack Workspace
```

## Component 1: Semantic Kernel Orchestrator

File:
- `semantic-orchestrator/orchestrator.py`

Responsibility:
- receives natural-language user input
- decides whether the request should trigger Jira, Slack, or both
- either uses deterministic handling for simple request shapes or uses LLM reasoning via Semantic Kernel

Key behavior:
- loads environment from the repo root `.env`
- selects LLM provider from `LLM_PROVIDER` (for this setup, usually `ollama`)
- invokes the bridge plugin for execution

Why it exists:
- keeps orchestration logic separate from side-effect execution
- allows us to improve decision logic without touching API execution code

## Component 2: Bridge Plugin

File:
- `semantic-orchestrator/bridge_plugin.py`

Responsibility:
- acts as a controlled function interface from Semantic Kernel to the Node bridge

Functions exposed:
- `create_jira_ticket(...)`
- `send_slack_message(...)`
- `get_execution_policy()`

Key behavior:
- builds request payloads
- sets `x-api-key` using `ORCHESTRATION_API_KEY`
- sends HTTP calls to the local bridge (`ORCHESTRATION_BRIDGE_URL`)

Why it exists:
- gives Semantic Kernel a clean and safe tool boundary
- avoids direct vendor calls from Python

## Component 3: Node HTTP Bridge

File:
- `mcp-jira-slack/http-bridge.js`

Responsibility:
- local execution gateway between Python orchestration and Node service logic

Endpoints:
- `GET /health`
- `POST /actions/send-slack-message`
- `POST /actions/create-jira-ticket`

Key behavior:
- validates `x-api-key` against `ORCHESTRATION_API_KEY`
- routes actions to workflow/service modules
- returns structured JSON to the orchestrator

Why it exists:
- keeps execution in one stable service entry point
- gives a testable API surface for automation and smoke tests

## Component 4: Node Workflow Layer

File:
- `mcp-jira-slack/src/workflows/ticket-orchestration.js`

Responsibility:
- coordinates multi-step action order

Key behavior:
- creates Jira ticket first
- sends Slack notification after Jira success
- captures warnings when Slack notify fails after Jira create

Why it exists:
- centralizes action ordering and result shaping
- avoids duplicating sequence logic in multiple callers

## Component 5: MCP Client Layer (Node)

File:
- `mcp-jira-slack/src/services/mcp-client.js`

Responsibility:
- generic remote MCP client for calling external MCP servers

Functions:
- `callRemoteMcpTool(...)`
- `listRemoteMcpTools(...)`
- `getRemoteMcpToolDetails(...)`

Key behavior:
- opens Streamable HTTP MCP client transport
- applies auth/app headers
- discovers tool availability
- calls tools with supplied arguments

Why it exists:
- keeps vendor MCP transport logic in one place
- makes Jira and Slack service modules thinner and easier to maintain

## Component 6: Jira MCP Service Adapter

File:
- `mcp-jira-slack/src/services/jira.js`

Responsibility:
- maps internal Jira action requests to Atlassian MCP tool calls

Current mapping:
- tool: `createJiraIssue`
- required args include `cloudId`, `projectKey`, `issueTypeName`, `summary`

Key behavior:
- enforces MCP mode (`INTEGRATION_MODE=mcp`)
- uses `ATLASSIAN_CLOUD_ID`, project key, and issue type mapping
- parses response text for issue key when needed

Why it exists:
- isolates Atlassian-specific MCP schema details from the rest of the app

## Component 7: Slack MCP Service Adapter

File:
- `mcp-jira-slack/src/services/slack.js`

Responsibility:
- maps internal Slack message requests to Slack MCP tool calls

Current validated mapping:
- tool: `slack_send_message`
- args: `channel_id`, `message`

Key behavior:
- enforces MCP mode (`INTEGRATION_MODE=mcp`)
- uses env-driven arg names (`SLACK_MCP_CHANNEL_ARG`, `SLACK_MCP_TEXT_ARG`)
- normalizes channel input format

Why it exists:
- isolates Slack-specific MCP schema/tool changes behind one adapter

## Component 8: Configuration Layer

File:
- `mcp-jira-slack/src/config.js`

Responsibility:
- loads and normalizes runtime configuration from `.env`

Key behavior:
- supports MCP URLs, tool names, auth headers, arg mappings
- derives Atlassian Basic auth header from email + API token when needed
- logs startup context for quick diagnostics

Why it exists:
- central source of truth for environment-driven behavior
- keeps services free of raw env parsing logic

## Component 9: Verification and Smoke Scripts

Folder:
- `mcp-jira-slack/scripts/`

Important scripts:
- `discover-atlassian-mcp.js`
- `verify-atlassian-mcp.js`
- `discover-slack-mcp.js`
- `verify-slack-mcp.js`
- `smoke-mcp-bridge.js`

Responsibility:
- validate tool discovery, auth setup, argument mapping, and basic execution

Why they exist:
- make setup/debug repeatable
- help validate each integration independently before full orchestration tests

## Runtime Flow: What Happens on a Typical Request

Example request:
- `Create a Jira task titled Phase 4 E2E MCP test and notify Slack that it was created`

Execution flow:
1. `orchestrator.py` receives request.
2. It chooses deterministic execution for this simple shape.
3. It calls `bridge_plugin.py`.
4. Plugin sends HTTP request to local bridge.
5. `http-bridge.js` routes to workflow.
6. Workflow calls Jira service adapter.
7. Jira adapter calls Atlassian MCP `createJiraIssue`.
8. Workflow then calls Slack service adapter.
9. Slack adapter calls Slack MCP `slack_send_message`.
10. Result JSON returns to orchestrator and summary is printed.

## Which Component to Check for Common Issues

If Semantic Kernel says action happened but nothing changed:
- check `semantic-orchestrator/orchestrator.py`
- check deterministic vs LLM path decision

If bridge rejects requests:
- check `ORCHESTRATION_API_KEY`
- check `mcp-jira-slack/http-bridge.js`

If Jira call fails:
- check `mcp-jira-slack/src/services/jira.js`
- check Atlassian envs (`ATLASSIAN_MCP_*`)

If Slack call fails:
- check `mcp-jira-slack/src/services/slack.js`
- check Slack envs (`SLACK_MCP_*`)
- confirm tool and arg mapping

If tool not found:
- run discovery scripts in `mcp-jira-slack/scripts/`
- update tool name or arg mapping env vars accordingly

## Operational Summary

The architecture intentionally splits responsibilities:

- Python + Semantic Kernel: orchestration and intent handling
- Node bridge/workflows: action routing and execution sequencing
- MCP adapters: vendor-specific tool contracts
- External MCP servers: Jira/Slack side effects

This separation is what makes the system testable, debuggable, and safer to evolve.
