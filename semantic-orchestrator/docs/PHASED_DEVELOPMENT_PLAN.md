# Phased Development Plan

This document is the source of truth for the remaining development work on this project.

The goal is to build a system that:

- uses `Semantic Kernel` for orchestration
- uses `Ollama` as the local LLM provider
- uses `Atlassian MCP` for Jira actions
- uses `Slack MCP` for Slack actions
- does not directly call Jira REST endpoints or Slack Web API endpoints from application code

This plan is intentionally phased so the project stays feasible and verifiable at each step.

## Final Target Architecture

The target architecture for this project is:

```text
User Request
   |
   v
Semantic Kernel Orchestrator (Python)
   |
   v
Local HTTP Bridge (Node.js)
   |
   +--> Atlassian MCP Server
   |
   +--> Slack MCP Server
```

Important boundary:

- Python is responsible for orchestration and request understanding
- Node is responsible for execution and MCP connectivity
- Jira and Slack are reached only through MCP servers
- direct product REST API calls are not part of the intended runtime architecture

## Guiding Principles

The project should follow these principles while moving through the phases:

- prefer incremental delivery over large unverified rewrites
- keep one clear execution path for operational reliability
- verify each vendor integration independently before relying on orchestration
- keep environment-driven configuration wherever vendor setup can vary
- treat Jira and Slack side effects as the final source of truth during testing

## Current Position

At the time of writing (20 April 2026), the project already has the following in place:

- a working Semantic Kernel sidecar in `semantic-orchestrator/`
- Ollama as the local LLM provider
- a deterministic execution path for simple operational requests
- a local Node HTTP bridge
- a refactored Node service layer executing Jira and Slack through MCP
- end-to-end verification of Atlassian MCP-backed Jira creation
- end-to-end verification of Slack MCP-backed message sending
- semantic-orchestrator execution verified with Jira + Slack MCP-backed flow
- interactive clarification mode in the orchestrator (`python orchestrator.py --interactive ...`) for multi-turn missing-input handling

## Phase 1: Lock the MCP-Only Architecture

### Goal

Make the project architecture clearly MCP-first so that runtime behavior no longer depends on direct Jira or Slack REST calls.

### Why this phase matters

Without a clear boundary, the project can become confusing:

- some paths use MCP
- some paths use direct HTTPS
- orchestration may appear correct while execution still bypasses MCP

This phase removes that architectural ambiguity.

### Scope

- ensure the execution layer uses MCP clients for Jira and Slack operations
- avoid reintroducing direct Jira REST or Slack Web API calls in the main runtime path
- keep the local HTTP bridge as the stable execution entry point for the Python orchestrator
- keep the Semantic Kernel orchestration layer unaware of product-specific REST details

### Main files involved

- `mcp-jira-slack/src/services/mcp-client.js`
- `mcp-jira-slack/src/services/jira.js`
- `mcp-jira-slack/src/services/slack.js`
- `mcp-jira-slack/http-bridge.js`
- `semantic-orchestrator/bridge_plugin.py`
- `semantic-orchestrator/orchestrator.py`

### Exit criteria

- all intended Jira actions flow through Atlassian MCP
- all intended Slack actions flow through Slack MCP
- no direct REST calls remain in the main service path for Jira or Slack execution
- the architecture is documented consistently

### Risks

- hidden legacy code paths may still bypass MCP
- a service may compile but still fail at runtime due to vendor MCP auth or tool-name mismatches

### Status

Completed for the intended runtime path.

Remaining minor cleanup:

- remove or simplify leftover legacy REST-era env fields that are no longer part of the intended architecture
- keep validating that new code paths do not accidentally reintroduce direct vendor API calls

## Phase 2: Complete Atlassian MCP Integration

### Goal

Make Jira issue creation work reliably through the Atlassian MCP server.

### Why Atlassian goes first

Atlassian MCP is the more feasible first vendor integration because:

- the Jira create tool is clearly documented
- the expected MCP endpoint is known
- API token auth is a practical backend-friendly option
- it gives the project one fully working MCP-backed execution path early

### Required configuration

The expected Atlassian env vars are:

```bash
ATLASSIAN_MCP_URL=https://mcp.atlassian.com/v1/mcp
ATLASSIAN_MCP_CREATE_ISSUE_TOOL=createJiraIssue
ATLASSIAN_MCP_EMAIL=your-email@example.com
ATLASSIAN_MCP_API_TOKEN=your-atlassian-api-token
```

Optional alternative:

```bash
ATLASSIAN_MCP_AUTH_HEADER=Basic base64(email:api_token)
```

### Development tasks

- verify Atlassian MCP authentication works from the Node MCP client
- use `npm run verify:atlassian-mcp` from `mcp-jira-slack/` as the primary direct verification command
- confirm the actual response shape for `createJiraIssue`
- improve response parsing so Jira issue keys are extracted reliably
- verify the local bridge can create Jira issues through Atlassian MCP
- verify the deterministic orchestration path can trigger Jira creation through the bridge

### Validation steps

- call Jira creation through the Node bridge directly
- confirm a real Jira issue appears in the target project
- confirm the bridge returns a trustworthy result
- confirm the orchestrator summary reflects actual Jira execution data

### Exit criteria

- a Jira issue can be created through Atlassian MCP from the current bridge
- no direct Jira REST call is needed anywhere in the runtime path
- ticket keys are returned or derived reliably enough for operational use

### Risks

- the organization may not allow API token auth for Atlassian MCP
- the returned tool payload may not include the issue key in a structured form
- tool names or auth requirements may vary with Atlassian changes

### Status

Completed for the current environment.

Current implementation support:

- the bridge is already wired to call Atlassian MCP
- an Atlassian MCP verification script now exists at `mcp-jira-slack/scripts/verify-atlassian-mcp.js`
- Atlassian tool discovery and Jira issue creation are now verified end-to-end through MCP

## Phase 3: Complete Slack MCP Integration

### Goal

Make Slack message sending work reliably through the Slack MCP server.

### Why this phase is separate

Slack MCP is expected to be more configuration-heavy than Atlassian MCP because:

- it requires a registered Slack app
- it uses Slack-specific OAuth/app identity expectations
- the exact remote tool names may need discovery and confirmation

### Required configuration

The current expected env vars are:

```bash
SLACK_MCP_URL=https://mcp.slack.com/mcp
SLACK_MCP_SEND_MESSAGE_TOOL=slack_send_message
SLACK_MCP_AUTH_HEADER=Bearer your-slack-mcp-access-token
SLACK_MCP_APP_ID=your-slack-app-id
SLACK_MCP_CHANNEL_ARG=channel_id
SLACK_MCP_TEXT_ARG=message
```

These may need to be adjusted once the real Slack MCP server response is tested.

### Development tasks

- confirm the Slack MCP auth method used in this project is accepted by Slack
- discover the actual available Slack MCP tool names from the remote server
- update `SLACK_MCP_SEND_MESSAGE_TOOL` if the real tool name differs
- verify message sending from the local Node bridge through Slack MCP
- verify Slack notifications work after Jira creation in the combined workflow

### Validation steps

- call Slack message sending through the Node bridge directly
- confirm a real Slack message appears in the target channel
- verify combined Jira + Slack execution still respects ordering

### Exit criteria

- a Slack message can be sent through Slack MCP from the bridge
- no direct Slack Web API call is needed anywhere in the runtime path
- the combined workflow can create Jira first and notify Slack second

### Risks

- Slack MCP auth may require vendor-specific setup not fully captured in `.env` yet
- the tool name assumption may be wrong
- channel handling or tool schema may differ from the current bridge payload shape

### Status

Completed for the current environment.

Current implementation support:

- Slack MCP discovery script: `npm run discover:slack-mcp`
- Slack MCP verification script: `npm run verify:slack-mcp`
- Slack tool argument mapping is now environment-driven through:
  - `SLACK_MCP_CHANNEL_ARG`
  - `SLACK_MCP_TEXT_ARG`
- verified tool mapping in this environment:
  - `SLACK_MCP_SEND_MESSAGE_TOOL=slack_send_message`
  - `SLACK_MCP_CHANNEL_ARG=channel_id`
  - `SLACK_MCP_TEXT_ARG=message`

## Phase 4: Tighten Semantic Kernel Orchestration

### Goal

Make the orchestration layer cleaner, more predictable, and better aligned with the MCP-backed execution model.

### Why this phase comes after vendor validation

The LLM layer should not be blamed for vendor configuration problems. It is much easier to improve orchestration once Jira MCP and Slack MCP both work independently.

### Development tasks

- keep deterministic execution for simple operational requests
- reserve the LLM path for more open-ended or multi-step intent interpretation
- support interactive follow-up capture in the same CLI session when the LLM needs missing inputs
- improve execution summaries so they are grounded in actual bridge results
- improve failure handling when Jira succeeds but Slack fails
- reduce misleading model-written summaries wherever possible
- refine defaulting behavior for title-only Jira requests and default Slack channels

### Validation steps

- test Slack-only orchestrator requests
- test Jira-only orchestrator requests
- test Jira + Slack orchestrator requests
- test failure scenarios and ensure the output remains trustworthy

### Status

Completed for the current environment.

Current implementation support:

- deterministic path executes operational requests through the bridge
- Jira + Slack MCP-backed orchestration flow verified end-to-end
- output summary reflects actual action results (for deterministic request shapes)
- interactive mode now supports real-time clarification and continuation in one run:
  - command: `python orchestrator.py --interactive "<your request>"`
  - if the model asks follow-up questions, user replies are captured and appended to conversation context
  - orchestration continues until an execution summary is produced or the user exits

### Exit criteria

- the orchestrator chooses appropriate actions consistently
- simple requests execute deterministically
- complex requests still have a safe fallback path
- summaries are based on actual execution data wherever possible

### Risks

- weaker local models may still behave inconsistently in pure tool-calling mode
- overusing LLM freedom can reintroduce false-positive execution summaries

### Status

Can proceed after Atlassian MCP and Slack MCP are both verified independently.

## Phase 5: Documentation Hardening and Operational Readiness

### Goal

Make the project understandable and maintainable for future development and handoff.

### Development tasks

- update docs after real MCP verification is complete
- ensure all env vars are documented with correct sources and examples
- document known vendor-specific setup caveats
- add troubleshooting guidance based on real test outcomes
- document the final architecture and expected runtime order

### Primary docs to keep aligned

- `semantic-orchestrator/README.md`
- `semantic-orchestrator/OLLAMA_ORCHESTRATION.md`
- `semantic-orchestrator/END_TO_END_RUN_GUIDE.md`
- this file: `semantic-orchestrator/PHASED_DEVELOPMENT_PLAN.md`

### Exit criteria

- docs match real runtime behavior
- setup instructions are copy-paste friendly
- the current development priority is obvious to the next contributor

### Status

Ongoing and should be updated after each major vendor integration milestone.

## Decision Rules During Development

Use these rules to avoid confusion while implementing future changes:

### If Jira creation fails

- debug Atlassian MCP first
- do not change Semantic Kernel behavior until direct bridge-to-Atlassian MCP execution is understood

### If Slack sending fails

- debug Slack MCP first
- verify auth and tool name before changing orchestration logic

### If the orchestrator claims success but nothing happened

- treat the summary as untrusted until the bridge response and product side effects are verified
- prioritize deterministic execution for that request shape

### If a request is simple and operational

- prefer deterministic execution over pure model-driven tool selection

### If a request is more open-ended

- allow Semantic Kernel + Ollama to interpret the intent
- keep execution grounded in the bridge/plugin layer

## Immediate Next Steps

The immediate recommended path from this point is:

1. Complete Atlassian MCP verification first
2. Confirm Jira issue creation works through the local bridge
3. Confirm Jira issue keys are parsed or surfaced reliably
4. Then move to Slack MCP verification
5. Only after both work, tighten orchestration behavior further

## Working Definition of Done

The project should be considered aligned with the target objective when all of the following are true:

- Jira actions are executed through Atlassian MCP
- Slack actions are executed through Slack MCP
- Semantic Kernel orchestrates the flow
- Ollama is used as the local LLM
- the Python side does not directly call Jira or Slack product APIs
- the Node side does not directly call Jira REST or Slack Web API in the intended runtime path
- simple operational requests produce real, verifiable side effects
- documentation matches the real architecture

## Ownership Note

When future work is done on this project, this document should be updated if:

- the current phase changes
- a vendor auth assumption changes
- a tool name changes
- a major architectural decision changes
- a risk is retired or a new blocker is discovered

That keeps this file as the development source of truth rather than just a one-time planning note.
