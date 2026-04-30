/**
 * Atlassian MCP verification script.
 *
 * Purpose:
 * - Performs a real Jira creation test through Atlassian MCP.
 * - Confirms auth/tool configuration and response parsing.
 * - Used as a direct vendor-integration health check.
 */
import { getRuntimeConfig } from "../src/config.js";
import {
  getRemoteMcpToolDetails,
  listRemoteMcpTools
} from "../src/services/mcp-client.js";
import { createJiraTicket } from "../src/services/jira.js";

async function main() {
  const config = getRuntimeConfig();
  const summary = process.argv[2] || "MCP verification ticket";
  const description =
    process.argv[3] ||
    "Created by the Atlassian MCP verification script in mcp-jira-slack/scripts/verify-atlassian-mcp.js";

  if (config.integrationMode !== "mcp") {
    throw new Error("INTEGRATION_MODE must be set to 'mcp' for Atlassian MCP verification.");
  }

  if (!config.jiraProjectKey) {
    throw new Error("JIRA_PROJECT_KEY is missing.");
  }

  if (!config.atlassianMcpAuthHeader) {
    throw new Error(
      "Atlassian MCP authentication is missing. Configure ATLASSIAN_MCP_EMAIL + ATLASSIAN_MCP_API_TOKEN or ATLASSIAN_MCP_AUTH_HEADER."
    );
  }

  console.log("Verifying Atlassian MCP connectivity...");
  console.log(`Server URL: ${config.atlassianMcpUrl}`);
  console.log(`Configured create tool: ${config.atlassianMcpCreateIssueTool}`);
  console.log(`Project key: ${config.jiraProjectKey}`);
  console.log(`Cloud ID: ${config.atlassianCloudId || "missing"}`);

  const tools = await listRemoteMcpTools({
    serverName: "Atlassian",
    serverUrl: config.atlassianMcpUrl,
    authHeader: config.atlassianMcpAuthHeader
  });

  console.log("\nAvailable Atlassian MCP tools:");
  for (const tool of tools) {
    console.log(`- ${tool}`);
  }

  if (!tools.includes(config.atlassianMcpCreateIssueTool)) {
    throw new Error(
      `Configured tool '${config.atlassianMcpCreateIssueTool}' was not found on the Atlassian MCP server.`
    );
  }

  const createTool = await getRemoteMcpToolDetails({
    serverName: "Atlassian",
    serverUrl: config.atlassianMcpUrl,
    authHeader: config.atlassianMcpAuthHeader,
    toolName: config.atlassianMcpCreateIssueTool
  });

  if (createTool) {
    console.log("\ncreateJiraIssue tool details:");
    console.log(JSON.stringify(createTool, null, 2));
  }

  console.log("\nAttempting Jira issue creation through Atlassian MCP...");
  const result = await createJiraTicket({
    summary,
    description,
    projectKey: config.jiraProjectKey,
    issueType: "Task"
  });

  console.log("\nVerification result:");
  console.log(`Issue key: ${result.key || "not parsed"}`);
  console.log(`Raw response: ${result.rawText || "empty"}`);
}

main().catch((error) => {
  console.error("❌ Atlassian MCP verification failed:", error.message);
  process.exit(1);
});
