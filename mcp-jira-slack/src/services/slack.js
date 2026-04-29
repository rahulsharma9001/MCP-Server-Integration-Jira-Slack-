/**
 * Slack execution service backed by Slack MCP tools.
 *
 * Purpose:
 * - Normalizes channel input and maps request arguments using env-driven schema keys.
 * - Sends Slack messages via remote MCP tool calls.
 * - Returns structured success/error info for orchestration workflows.
 */
import { getRuntimeConfig } from "../config.js";
import { callRemoteMcpTool } from "./mcp-client.js";

export function normalizeSlackChannel(channel) {
  if (!channel) {
    return channel;
  }

  if (channel.startsWith("#") || /^[CDG][A-Z0-9]+$/.test(channel)) {
    return channel;
  }

  return `#${channel}`;
}

export async function sendSlackMessage(channel, text) {
  try {
    const config = getRuntimeConfig();

    if (config.integrationMode !== "mcp") {
      throw new Error("Only MCP integration mode is supported in this setup");
    }

    const normalizedChannel = normalizeSlackChannel(channel);
    const toolArgs = {
      [config.slackMcpChannelArg]: normalizedChannel,
      [config.slackMcpTextArg]: text
    };

    const mcpResult = await callRemoteMcpTool({
      serverName: "Slack",
      serverUrl: config.slackMcpUrl,
      authHeader: config.slackMcpAuthHeader,
      appId: config.slackMcpAppId,
      toolName: config.slackMcpSendMessageTool,
      args: toolArgs
    });

    return {
      ok: true,
      channel: normalizedChannel,
      rawText: mcpResult.text,
      structuredContent: mcpResult.structuredContent
    };
  } catch (error) {
    const realError = error.message;
    console.error("❌ Slack FULL Error:", realError);

    throw new Error(
      typeof realError === "object"
        ? JSON.stringify(realError)
        : realError
    );
  }
}
