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

    return {
      raw: result,
      text: extractTextContent(result),
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
