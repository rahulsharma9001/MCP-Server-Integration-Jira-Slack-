import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [
  path.join(process.cwd(), ".env"),
  path.join(__dirname, ".env"),
  path.join(__dirname, "..", ".env")
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));

dotenv.config(envPath ? { path: envPath } : undefined);

// --------------------
// 🔷 Startup Logs
// --------------------
console.log("🚀 MCP Server Started...");
console.log("ENV CHECK:");
console.log("JIRA_BASE_URL:", process.env.JIRA_BASE_URL);
console.log("JIRA_PROJECT_KEY:", process.env.JIRA_PROJECT_KEY);
console.log("JIRA_EMAIL:", process.env.JIRA_EMAIL);
console.log("SLACK_CHANNEL:", process.env.DEFAULT_SLACK_CHANNEL);
if (envPath) {
  console.log("ENV FILE:", envPath);
} else {
  console.log("ENV FILE: not found");
}

// --------------------
// 🔷 Initialize Server
// --------------------
const server = new Server(
  {
    name: "jira-slack-server",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// --------------------
// 🔷 Slack Function
// --------------------
function normalizeSlackChannel(channel) {
  if (!channel) {
    return channel;
  }

  if (channel.startsWith("#") || /^[CDG][A-Z0-9]+$/.test(channel)) {
    return channel;
  }

  return `#${channel}`;
}

async function sendSlackMessage(channel, text) {
  try {
    if (!process.env.SLACK_BOT_TOKEN) {
      throw new Error("SLACK_BOT_TOKEN is missing");
    }

    const normalizedChannel = normalizeSlackChannel(channel);
    const response = await axios.post(
      "https://slack.com/api/chat.postMessage",
      { channel: normalizedChannel, text },
      {
        headers: {
          Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.data.ok) {
      throw new Error(response.data.error);
    }

    return response.data;
  } catch (error) {
    const realError = error.response?.data || error.message;
    console.error("❌ Slack FULL Error:", realError);

    throw new Error(
      typeof realError === "object"
        ? JSON.stringify(realError)
        : realError
    );
  }
}

// --------------------
// 🔷 Jira Function
// --------------------
async function createJiraTicket(summary, descriptionText) {
  try {
    // 🔍 Validate env
    if (!process.env.JIRA_BASE_URL || !process.env.JIRA_PROJECT_KEY) {
      throw new Error("Jira env variables missing");
    }

    const response = await axios.post(
      `${process.env.JIRA_BASE_URL}/rest/api/3/issue`,
      {
        fields: {
          project: { key: process.env.JIRA_PROJECT_KEY },
          summary,
          description: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: descriptionText
                  }
                ]
              }
            ]
          },
          issuetype: { name: "Task" } // change to Bug if needed
        }
      },
      {
        auth: {
          username: process.env.JIRA_EMAIL,
          password: process.env.JIRA_API_TOKEN
        },
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return response.data;
  } catch (error) {
    const realError = error.response?.data || error.message;

    console.error("❌ Jira FULL Error:", realError);

    throw new Error(
      typeof realError === "object"
        ? JSON.stringify(realError)
        : realError
    );
  }
}

// --------------------
// 🔷 TOOL LIST
// --------------------
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "hello_world",
        description: "Say hello to a user",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string" }
          },
          required: ["name"]
        }
      },
      {
        name: "send_slack_message",
        description: "Send a message to Slack",
        inputSchema: {
          type: "object",
          properties: {
            channel: { type: "string" },
            text: { type: "string" }
          },
          required: ["channel", "text"]
        }
      },
      {
        name: "create_jira_ticket",
        description: "Create a Jira ticket and notify Slack",
        inputSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            description: { type: "string" }
          },
          required: ["summary", "description"]
        }
      }
    ]
  };
});

// --------------------
// 🔷 TOOL EXECUTION
// --------------------
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "hello_world") {
      return {
        content: [{ type: "text", text: `Hello ${args.name}!` }]
      };
    }

    if (name === "send_slack_message") {
      await sendSlackMessage(args.channel, args.text);

      return {
        content: [
          {
            type: "text",
            text: `✅ Message sent to Slack channel ${normalizeSlackChannel(args.channel)}`
          }
        ]
      };
    }

    if (name === "create_jira_ticket") {
      const ticket = await createJiraTicket(
        args.summary,
        args.description
      );

      let slackWarning = "";

      // 🔔 Notify Slack
      if (process.env.DEFAULT_SLACK_CHANNEL) {
        try {
          await sendSlackMessage(
            process.env.DEFAULT_SLACK_CHANNEL,
            `🎫 Jira Ticket Created: ${ticket.key}\nSummary: ${args.summary}`
          );
        } catch (slackError) {
          slackWarning = ` Warning: Jira ticket was created, but Slack notification failed: ${slackError.message}`;
          console.error("⚠️ Slack notify failed after Jira create:", slackError.message);
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `✅ Jira Ticket Created: ${ticket.key}.${slackWarning}`
          }
        ]
      };
    }

    throw new Error("Unknown tool");
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `❌ Error: ${error.message}`
        }
      ]
    };
  }
});

// --------------------
// 🔷 Start Server
// --------------------
const transport = new StdioServerTransport();
await server.connect(transport);
