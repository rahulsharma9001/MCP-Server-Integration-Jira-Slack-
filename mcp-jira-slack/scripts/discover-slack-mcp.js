import { getRuntimeConfig } from "../src/config.js";
import {
  getRemoteMcpToolDetails,
  listRemoteMcpTools
} from "../src/services/mcp-client.js";

async function main() {
  const config = getRuntimeConfig();

  if (!config.slackMcpAuthHeader) {
    throw new Error(
      "Slack MCP authentication is missing. Configure SLACK_MCP_AUTH_HEADER."
    );
  }

  console.log("Discovering Slack MCP setup...");
  console.log(`Server URL: ${config.slackMcpUrl}`);
  console.log(`Configured message tool: ${config.slackMcpSendMessageTool}`);

  const tools = await listRemoteMcpTools({
    serverName: "Slack",
    serverUrl: config.slackMcpUrl,
    authHeader: config.slackMcpAuthHeader,
    appId: config.slackMcpAppId
  });

  console.log("\nAvailable Slack MCP tools:");
  for (const tool of tools) {
    console.log(`- ${tool}`);
  }

  const selectedTool = await getRemoteMcpToolDetails({
    serverName: "Slack",
    serverUrl: config.slackMcpUrl,
    authHeader: config.slackMcpAuthHeader,
    appId: config.slackMcpAppId,
    toolName: config.slackMcpSendMessageTool
  });

  if (!selectedTool) {
    console.log(
      `\nConfigured tool '${config.slackMcpSendMessageTool}' was not found.`
    );
    return;
  }

  console.log(`\n${config.slackMcpSendMessageTool} tool details:`);
  console.log(JSON.stringify(selectedTool, null, 2));

  const props = selectedTool?.inputSchema?.properties || {};
  const required = selectedTool?.inputSchema?.required || [];

  console.log("\nSuggested env mapping based on tool schema:");
  console.log(`SLACK_MCP_SEND_MESSAGE_TOOL=${config.slackMcpSendMessageTool}`);
  if (props.channel || props.channel_id || props.channelId) {
    const channelKey =
      props.channel ? "channel" : props.channel_id ? "channel_id" : "channelId";
    console.log(`SLACK_MCP_CHANNEL_ARG=${channelKey}`);
  }
  if (props.text || props.message || props.content) {
    const textKey =
      props.text ? "text" : props.message ? "message" : "content";
    console.log(`SLACK_MCP_TEXT_ARG=${textKey}`);
  }
  console.log(`Required fields: ${required.join(", ") || "none"}`);
}

main().catch((error) => {
  console.error("❌ Slack MCP discovery failed:", error.message);
  process.exit(1);
});
