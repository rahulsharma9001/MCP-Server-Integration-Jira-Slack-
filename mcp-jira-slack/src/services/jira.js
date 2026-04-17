import { getRuntimeConfig } from "../config.js";
import { callRemoteMcpTool } from "./mcp-client.js";

function extractIssueKey(text) {
  const match = text.match(/\b[A-Z][A-Z0-9]+-\d+\b/);
  return match ? match[0] : null;
}

export async function createJiraTicket({
  summary,
  description,
  issueType = "Task",
  projectKey
}) {
  try {
    const config = getRuntimeConfig();
    const resolvedProjectKey = projectKey || config.jiraProjectKey;

    if (config.integrationMode !== "mcp") {
      throw new Error("Only MCP integration mode is supported in this setup");
    }

    if (!resolvedProjectKey) {
      throw new Error("JIRA_PROJECT_KEY is missing");
    }

    if (!config.atlassianCloudId) {
      throw new Error(
        "ATLASSIAN_CLOUD_ID is missing. Discover it first and add it to the root .env."
      );
    }

    const mcpResult = await callRemoteMcpTool({
      serverName: "Atlassian",
      serverUrl: config.atlassianMcpUrl,
      authHeader: config.atlassianMcpAuthHeader,
      toolName: config.atlassianMcpCreateIssueTool,
      args: {
        cloudId: config.atlassianCloudId,
        projectKey: resolvedProjectKey,
        issueTypeName: issueType,
        summary,
        description
      }
    });

    return {
      key: extractIssueKey(mcpResult.text),
      rawText: mcpResult.text,
      structuredContent: mcpResult.structuredContent
    };
  } catch (error) {
    const realError = error.message;
    console.error("❌ Jira FULL Error:", realError);

    throw new Error(
      typeof realError === "object"
        ? JSON.stringify(realError)
        : realError
    );
  }
}
