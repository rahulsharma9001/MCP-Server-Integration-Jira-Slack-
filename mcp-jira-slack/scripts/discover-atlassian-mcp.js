import { getRuntimeConfig } from "../src/config.js";
import {
  callRemoteMcpTool,
  getRemoteMcpToolDetails,
  listRemoteMcpTools
} from "../src/services/mcp-client.js";

async function main() {
  const config = getRuntimeConfig();

  if (!config.atlassianMcpAuthHeader) {
    throw new Error(
      "Atlassian MCP authentication is missing. Configure ATLASSIAN_MCP_EMAIL + ATLASSIAN_MCP_API_TOKEN or ATLASSIAN_MCP_AUTH_HEADER."
    );
  }

  console.log("Discovering Atlassian MCP setup...");
  console.log(`Server URL: ${config.atlassianMcpUrl}`);

  const tools = await listRemoteMcpTools({
    serverName: "Atlassian",
    serverUrl: config.atlassianMcpUrl,
    authHeader: config.atlassianMcpAuthHeader
  });

  console.log("\nAvailable Atlassian MCP tools:");
  for (const tool of tools) {
    console.log(`- ${tool}`);
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

  if (tools.includes("getVisibleJiraProjects")) {
    console.log("\nCalling getVisibleJiraProjects to help discover a usable cloudId...");
    const result = await callRemoteMcpTool({
      serverName: "Atlassian",
      serverUrl: config.atlassianMcpUrl,
      authHeader: config.atlassianMcpAuthHeader,
      toolName: "getVisibleJiraProjects",
      args: {}
    });

    console.log("\ngetVisibleJiraProjects raw response:");
    console.log(result.text || JSON.stringify(result.structuredContent, null, 2));
  } else {
    console.log("\ngetVisibleJiraProjects is not available on this Atlassian MCP connection.");
  }
}

main().catch((error) => {
  console.error("❌ Atlassian MCP discovery failed:", error.message);
  process.exit(1);
});
