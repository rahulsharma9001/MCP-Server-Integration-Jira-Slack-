# 🚀 MCP Jira + Slack Automation Server

This project implements a **Model Context Protocol (MCP) server** that enables AI-driven automation for:

- 🧾 Creating Jira tickets  
- 💬 Sending Slack notifications  
- 🤖 Triggering actions using natural language via MCP clients (e.g., Cursor)  

---

## 🎯 Overview

This system allows you to interact with Jira and Slack using simple natural language commands like:

```
Create a Jira ticket for login bug with description "Login API returning 500 error"
```

The MCP server processes this request and:

1. Creates a Jira ticket  
2. Sends a Slack notification (optional)  
3. Returns the result back to the AI client  

---

## 🏗️ Architecture

```
                         ┌──────────────────────────────┐
                         │          User                │
                         │  (Natural Language Prompt)   │
                         └─────────────┬────────────────┘
                                       │
                                       ▼
                         ┌──────────────────────────────┐
                         │      MCP Client              │
                         │   (Cursor / AI Interface)    │
                         │                              │
                         │ - Parses user intent         │
                         │ - Maps to MCP tools          │
                         └─────────────┬────────────────┘
                                       │
                          (MCP Protocol over STDIO)
                                       │
                                       ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │                     MCP SERVER (Node.js)                           │
        │                                                                    │
        │  ┌──────────────────────────────────────────────────────────────┐  │
        │  │                 Transport Layer                              │  │
        │  │  (StdioServerTransport)                                      │  │
        │  │  - Handles communication with MCP client                     │  │
        │  └──────────────────────────────────────────────────────────────┘  │
        │                                                                    │
        │  ┌──────────────────────────────────────────────────────────────┐  │
        │  │                 Tool Registry Layer                          │  │
        │  │  (ListToolsRequestSchema)                                    │  │
        │  │  - Defines available tools                                   │  │
        │  │    • hello_world                                             │  │
        │  │    • send_slack_message                                      │  │
        │  │    • create_jira_ticket                                      │  │
        │  └──────────────────────────────────────────────────────────────┘  │
        │                                                                    │
        │  ┌──────────────────────────────────────────────────────────────┐  │
        │  │                 Tool Execution Layer                         │  │
        │  │  (CallToolRequestSchema)                                     │  │
        │  │  - Routes incoming tool requests                             │  │
        │  │  - Validates inputs                                          │  │
        │  │  - Calls appropriate service functions                       │  │
        │  └──────────────────────────────────────────────────────────────┘  │
        │                                                                    │
        │  ┌──────────────────────────────────────────────────────────────┐  │
        │  │                 Business Logic Layer                         │  │
        │  │                                                              │  │
        │  │  🔹 Jira Service                                             │  │
        │  │     - Creates tickets via REST API                           │  │
        │  │     - Uses ADF format for description                        │  │
        │  │     - Handles auth (email + API token)                       │  │
        │  │                                                              │  │
        │  │  🔹 Slack Service                                            │  │
        │  │     - Sends messages via chat.postMessage                    │  │
        │  │     - Uses bot token (xoxb)                                  │  │
        │  │     - Normalizes channel format (# or ID)                    │  │
        │  │                                                              │  │
        │  └──────────────────────────────────────────────────────────────┘  │
        │                                                                    │
        │  ┌──────────────────────────────────────────────────────────────┐  │
        │  │                 Configuration Layer                          │  │
        │  │  (.env + dotenv)                                             │  │
        │  │  - Jira credentials                                          │  │
        │  │  - Slack token                                               │  │
        │  │  - Default channel                                           │  │
        │  └──────────────────────────────────────────────────────────────┘  │
        │                                                                    │
        │  ┌──────────────────────────────────────────────────────────────┐  │
        │  │                 Error Handling Layer                         │  │
        │  │  - Captures API errors                                       │  │
        │  │  - Returns structured messages to MCP client                 │  │
        │  │  - Logs detailed debug info                                  │  │
        │  └──────────────────────────────────────────────────────────────┘  │
        └────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                                          │
                                          ▼
        ┌────────────────────────────────────────────────────────────────────┐
        │               Semantic Kernel Orchestrator (Python)                │
        │                                                                    │
        │  - Interprets intent and builds execution flow                     │
        │  - Chooses whether Jira, Slack, or both are needed                 │
        │  - Calls the Node HTTP bridge as a controlled execution layer      │
        └────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
            ┌──────────────────────────────┬──────────────────────────────┐
            │                              │                              │
            ▼                              ▼                              ▼
    ┌────────────────────┐     ┌────────────────────┐        ┌────────────────────┐
    │     Jira API       │     │    Slack API       │        │   External Systems │
    │                    │     │                    │        │   (Future scope)   │
    │ - Create Issues    │     │ - Send Messages    │        │ - Webhooks         │
    │ - Manage Tickets   │     │ - Channel Delivery │        │ - Analytics        │
    └────────────────────┘     └────────────────────┘        └────────────────────┘
```
---

## ⚙️ Tech Stack

- Node.js  
- MCP SDK (@modelcontextprotocol/sdk)  
- Axios  
- Jira REST API  
- Slack Web API  

---

## 📁 Project Structure

```
jira-mcp-server/
├── README.md
├── mcp-jira-slack/
│   ├── server.js
│   ├── http-bridge.js
│   ├── package.json
│   └── src/
│       ├── config.js
│       ├── mcp-server.js
│       ├── services/
│       └── workflows/
└── semantic-orchestrator/
    ├── orchestrator.py
    ├── bridge_plugin.py
    ├── requirements.txt
    └── README.md
```

---

## 🧭 Orchestration Layers

### Existing Node orchestration

The Node MCP server already performs a basic orchestration flow:

1. Receive a tool call
2. Create a Jira ticket
3. Optionally notify Slack
4. Return one combined response

### Semantic Kernel orchestration

The new Semantic Kernel sidecar adds a higher-level orchestration layer:

1. Understand user intent
2. Check whether details are missing
3. Decide which actions should run
4. Call the Node bridge in the right order
5. Return a concise execution summary

For a detailed explanation of the Ollama-based orchestration flow and its benefits, see [semantic-orchestrator/OLLAMA_ORCHESTRATION.md](semantic-orchestrator/OLLAMA_ORCHESTRATION.md).

---

## 🔐 Environment Variables

# Jira
```
JIRA_BASE_URL=https://your-domain.atlassian.net
JIRA_EMAIL=your-email
JIRA_API_TOKEN=your-token
JIRA_PROJECT_KEY=SCRUM
```

---
```
# Slack
SLACK_BOT_TOKEN=xoxb-xxxx
DEFAULT_SLACK_CHANNEL=C12345678
```
---

## 🚀 Run Server
```
node server.js
```

### Run the HTTP bridge for Semantic Kernel

```bash
cd mcp-jira-slack
npm run start:bridge
```

### Run the Semantic Kernel orchestrator

```bash
cd semantic-orchestrator
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python orchestrator.py "Create a Jira bug for login failure and notify Slack"
```
---

# 🧠 MCP Tools (Detailed Explanation)

These tools are exposed by the MCP server and can be invoked using natural language.

---

## 🔹 hello_world

Purpose: Test MCP connectivity

Input:
{ "name": "Rahul" }

Output:
Hello Rahul!

Use Case:
- Debug MCP setup

---

## 🔹 send_slack_message

Purpose: Send message to Slack

Input:
{
  "channel": "C12345678",
  "text": "Hello from MCP!"
}

Processing:
- Uses Slack API (chat.postMessage)
- Requires xoxb bot token

Output:
Message sent to Slack

Notes:
- Bot must be invited
- Use channel ID

---

## 🔹 create_jira_ticket

Purpose: Create Jira ticket + notify Slack

Input:
{
  "summary": "Login bug",
  "description": "Login API returning 500 error"
}

Processing:
- Calls Jira API (/rest/api/3/issue)
- Uses ADF format
- Sends Slack notification

Output:
Jira Ticket Created (e.g., SCRUM-10)

Notes:
- Issue type must exist
- Project key must be correct

---

# 🔍 server.js Explanation

1. MCP Server Initialization  
2. Environment Setup (.env)  
3. Jira API Integration  
4. Slack API Integration  
5. Tool Registration  
6. Tool Execution  
7. Slack Notification  
8. Error Handling  
9. STDIO Transport  

---

## 🧪 Example Flow

Input:
Create Jira ticket

Output:
- Jira created  
- Slack notified  

---

## 🚨 Common Issues

- not_allowed_token_type → use xoxb  
- channel_not_found → use channel ID  
- Slack not sending → invite bot  
- Jira error → fix issue type  
- env not loading → fix path  

---

## 🚀 Future Enhancements

- Jira → Slack webhook  
- Slack slash command  
- AI auto-priority  
- Docker  

---
