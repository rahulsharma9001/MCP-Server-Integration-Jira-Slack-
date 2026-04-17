import { logStartupContext } from "./src/config.js";
import { startMcpServer } from "./src/mcp-server.js";

logStartupContext("MCP Server");

startMcpServer().catch((error) => {
  console.error("❌ MCP Server failed to start:", error.message);
  process.exit(1);
});
