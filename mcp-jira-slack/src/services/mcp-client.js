/**
 * Shared remote MCP client utilities.
 *
 * Purpose:
 * - Connects to remote MCP servers (Atlassian/Slack) over streamable HTTP.
 * - Lists tools, validates tool availability, calls tools, and normalizes errors.
 * - Provides a consistent response shape for higher-level services.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

function buildHeaders(config) {
  const headers = {};

  if (config.authHeader) {
    headers.Authorization = config.authHeader;
  }

  if (config.appId) {
    headers["X-Slack-App-Id"] = config.appId;
  }

  return headers;
}

function extractTextContent(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const textParts = content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text);

  if (textParts.length > 0) {
    return textParts.join("\n");
  }

  if (result?.structuredContent) {
    return JSON.stringify(result.structuredContent);
  }

  return "";
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractMcpError(result, text) {
  if (result?.isError) {
    return text || "MCP tool returned isError=true";
  }

  const parsedText = typeof text === "string" ? tryParseJson(text) : null;
  if (parsedText?.error === true) {
    return parsedText.message || text;
  }

  const structured = result?.structuredContent;
  if (structured && typeof structured === "object" && structured.error === true) {
    if (typeof structured.message === "string" && structured.message.trim()) {
      return structured.message;
    }
    return JSON.stringify(structured);
  }

  return null;
}

export async function callRemoteMcpTool({
  serverName,
  serverUrl,
  authHeader = "",
  appId = "",
  toolName,
  args
}) {
  if (!serverUrl) {
    throw new Error(`${serverName} MCP URL is missing`);
  }

  if (!toolName) {
    throw new Error(`${serverName} MCP tool name is missing`);
  }

  const client = new Client(
    { name: "jira-slack-mcp-bridge-client", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers: buildHeaders({ authHeader, appId })
    }
  });

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const availableToolNames = tools.tools.map((tool) => tool.name);

    if (!availableToolNames.includes(toolName)) {
      throw new Error(
        `${serverName} MCP tool '${toolName}' was not found. Available tools: ${availableToolNames.join(", ")}`
      );
    }

    const result = await client.callTool({
      name: toolName,
      arguments: args
    });
    const text = extractTextContent(result);
    const mcpError = extractMcpError(result, text);
    if (mcpError) {
      throw new Error(`${serverName} MCP tool '${toolName}' failed: ${mcpError}`);
    }

    return {
      raw: result,
      text,
      structuredContent: result.structuredContent || null
    };
  } finally {
    await transport.close().catch(() => {});
  }
}

export async function listRemoteMcpTools({
  serverName,
  serverUrl,
  authHeader = "",
  appId = ""
}) {
  if (!serverUrl) {
    throw new Error(`${serverName} MCP URL is missing`);
  }

  const client = new Client(
    { name: "jira-slack-mcp-bridge-client", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers: buildHeaders({ authHeader, appId })
    }
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.map((tool) => tool.name);
  } finally {
    await transport.close().catch(() => {});
  }
}

export async function getRemoteMcpToolDetails({
  serverName,
  serverUrl,
  authHeader = "",
  appId = "",
  toolName
}) {
  if (!serverUrl) {
    throw new Error(`${serverName} MCP URL is missing`);
  }

  const client = new Client(
    { name: "jira-slack-mcp-bridge-client", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(serverUrl), {
    requestInit: {
      headers: buildHeaders({ authHeader, appId })
    }
  });

  try {
    await client.connect(transport);
    const result = await client.listTools();
    return result.tools.find((tool) => tool.name === toolName) || null;
  } finally {
    await transport.close().catch(() => {});
  }
}
