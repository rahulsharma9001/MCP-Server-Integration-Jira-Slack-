import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [
  path.join(process.cwd(), ".env"),
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", "..", ".env")
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));

dotenv.config(envPath ? { path: envPath } : undefined);

export function getEnvPath() {
  return envPath;
}

export function getRuntimeConfig() {
  const atlassianMcpAuthHeader =
    process.env.ATLASSIAN_MCP_AUTH_HEADER ||
    (
      process.env.ATLASSIAN_MCP_EMAIL &&
      process.env.ATLASSIAN_MCP_API_TOKEN
        ? `Basic ${Buffer.from(
            `${process.env.ATLASSIAN_MCP_EMAIL}:${process.env.ATLASSIAN_MCP_API_TOKEN}`
          ).toString("base64")}`
        : ""
    );

  return {
    jiraBaseUrl: process.env.JIRA_BASE_URL,
    jiraProjectKey: process.env.JIRA_PROJECT_KEY,
    jiraEmail: process.env.JIRA_EMAIL,
    jiraApiToken: process.env.JIRA_API_TOKEN,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    defaultSlackChannel: process.env.DEFAULT_SLACK_CHANNEL,
    orchestrationApiPort: Number(process.env.ORCHESTRATION_API_PORT || 3010),
    orchestrationApiKey: process.env.ORCHESTRATION_API_KEY || "",
    integrationMode: process.env.INTEGRATION_MODE || "mcp",
    atlassianMcpUrl: process.env.ATLASSIAN_MCP_URL || "https://mcp.atlassian.com/v1/mcp",
    atlassianMcpAuthHeader,
    atlassianCloudId:
      process.env.ATLASSIAN_CLOUD_ID || process.env.ATLASSIAN_MCP_CLOUD_ID || "",
    atlassianMcpCreateIssueTool:
      process.env.ATLASSIAN_MCP_CREATE_ISSUE_TOOL || "createJiraIssue",
    slackMcpUrl: process.env.SLACK_MCP_URL || "https://mcp.slack.com/mcp",
    slackMcpAuthHeader: process.env.SLACK_MCP_AUTH_HEADER || "",
    slackMcpAppId: process.env.SLACK_MCP_APP_ID || "",
    slackMcpSendMessageTool: process.env.SLACK_MCP_SEND_MESSAGE_TOOL || "send_message"
  };
}

export function logStartupContext(prefix = "MCP Server") {
  const config = getRuntimeConfig();

  console.error(`🚀 ${prefix} Started...`);
  console.error("ENV CHECK:");
  console.error("INTEGRATION_MODE:", config.integrationMode);
  console.error("JIRA_PROJECT_KEY:", config.jiraProjectKey);
  console.error("ATLASSIAN_MCP_URL:", config.atlassianMcpUrl);
  console.error("ATLASSIAN_MCP_TOOL:", config.atlassianMcpCreateIssueTool);
  console.error("ATLASSIAN_MCP_AUTH:", config.atlassianMcpAuthHeader ? "configured" : "missing");
  console.error("ATLASSIAN_CLOUD_ID:", config.atlassianCloudId ? "configured" : "missing");
  console.error("SLACK_CHANNEL:", config.defaultSlackChannel);
  console.error("SLACK_MCP_URL:", config.slackMcpUrl);
  console.error("SLACK_MCP_TOOL:", config.slackMcpSendMessageTool);
  console.error("SLACK_MCP_AUTH:", config.slackMcpAuthHeader ? "configured" : "missing");
  console.error("ENV FILE:", envPath || "not found");
}
