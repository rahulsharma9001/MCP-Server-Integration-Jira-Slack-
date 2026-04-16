import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { normalizeSlackChannel, sendSlackMessage } from "./services/slack.js";
import { orchestrateTicketCreation } from "./workflows/ticket-orchestration.js";

export function createMcpServer() {
  const server = new Server(
    {
      name: "jira-slack-server",
      version: "1.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

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
              description: { type: "string" },
              issueType: { type: "string" },
              projectKey: { type: "string" },
              notifySlack: { type: "boolean" },
              slackChannel: { type: "string" }
            },
            required: ["summary", "description"]
          }
        }
      ]
    };
  });

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
        const workflowResult = await orchestrateTicketCreation({
          summary: args.summary,
          description: args.description,
          issueType: args.issueType || "Task",
          projectKey: args.projectKey,
          notifySlack: args.notifySlack !== false,
          slackChannel: args.slackChannel
        });

        const warningText = workflowResult.warnings.length
          ? ` Warning: ${workflowResult.warnings.join(" | ")}`
          : "";

        return {
          content: [
            {
              type: "text",
              text: `✅ Jira Ticket Created: ${workflowResult.jira.key}.${warningText}`
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

  return server;
}

export async function startMcpServer() {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
