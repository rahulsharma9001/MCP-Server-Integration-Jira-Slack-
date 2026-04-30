/**
 * Entry point for running the Node MCP server over stdio.
 *
 * Purpose:
 * - Boots the MCP server that exposes tools such as Jira create/update and Slack notify.
 * - Used by MCP clients that communicate through stdio transport.
 */
import { logStartupContext } from "./src/config.js";
import { startMcpServer } from "./src/mcp-server.js";

logStartupContext("MCP Server");

startMcpServer().catch((error) => {
  console.error("❌ MCP Server failed to start:", error.message);
  process.exit(1);
});
