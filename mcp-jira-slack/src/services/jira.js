/**
 * Jira execution service backed by Atlassian MCP tools.
 *
 * Purpose:
 * - Creates Jira tickets through MCP.
 * - Resolves issues and transitions status through MCP.
 * - Parses and verifies responses so downstream workflow output is trustworthy.
 */
import { getRuntimeConfig } from "../config.js";
import { callRemoteMcpTool } from "./mcp-client.js";

function extractIssueKey(text) {
  const match = text.match(/\b[A-Z][A-Z0-9]+-\d+\b/);
  return match ? match[0] : null;
}

function extractIssueKeys(text) {
  return [...text.matchAll(/\b[A-Z][A-Z0-9]+-\d+\b/g)].map((match) => match[0]);
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeStatusName(status) {
  return status.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeJql(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function flattenValues(node, bucket = []) {
  if (Array.isArray(node)) {
    for (const item of node) {
      flattenValues(item, bucket);
    }
    return bucket;
  }

  if (node && typeof node === "object") {
    bucket.push(node);
    for (const value of Object.values(node)) {
      flattenValues(value, bucket);
    }
  }

  return bucket;
}

function collectTransitions(rawText, structuredContent) {
  const transitions = [];
  const parsedText = rawText ? tryParseJson(rawText) : null;
  const candidates = [];

  if (structuredContent) {
    candidates.push(structuredContent);
  }
  if (parsedText) {
    candidates.push(parsedText);
  }

  for (const candidate of candidates) {
    const nodes = flattenValues(candidate, []);
    for (const node of nodes) {
      if (
        typeof node?.id === "string" &&
        typeof node?.name === "string" &&
        node.name.trim()
      ) {
        transitions.push({ id: node.id, name: node.name });
      }
    }
  }

  const deduped = new Map();
  for (const transition of transitions) {
    const key = `${transition.id}::${transition.name}`;
    deduped.set(key, transition);
  }
  return [...deduped.values()];
}

function collectIssueKeys(rawText, structuredContent) {
  const keys = new Set();
  const parsedText = rawText ? tryParseJson(rawText) : null;
  const candidates = [];

  if (structuredContent) {
    candidates.push(structuredContent);
  }
  if (parsedText) {
    candidates.push(parsedText);
  }

  for (const candidate of candidates) {
    const nodes = flattenValues(candidate, []);
    for (const node of nodes) {
      if (typeof node?.key === "string" && /\b[A-Z][A-Z0-9]+-\d+\b/.test(node.key)) {
        keys.add(node.key);
      }
    }
  }

  if (typeof rawText === "string") {
    for (const key of extractIssueKeys(rawText)) {
      keys.add(key);
    }
  }

  return [...keys];
}

function findStatusName(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (typeof node?.fields?.status?.name === "string") {
    return node.fields.status.name;
  }

  if (typeof node?.status?.name === "string") {
    return node.status.name;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findStatusName(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const value of Object.values(node)) {
    const found = findStatusName(value);
    if (found) {
      return found;
    }
  }

  return null;
}

async function getIssueCurrentStatus(issueKey, config) {
  const issueResult = await callRemoteMcpTool({
    serverName: "Atlassian",
    serverUrl: config.atlassianMcpUrl,
    authHeader: config.atlassianMcpAuthHeader,
    toolName: config.atlassianMcpGetIssueTool,
    args: {
      cloudId: config.atlassianCloudId,
      issueIdOrKey: issueKey
    }
  });

  const parsedText = tryParseJson(issueResult.text);
  const fromStructured = findStatusName(issueResult.structuredContent);
  const fromParsed = findStatusName(parsedText);

  return fromStructured || fromParsed || null;
}

function ensureMcpJiraConfig(config) {
  if (config.integrationMode !== "mcp") {
    throw new Error("Only MCP integration mode is supported in this setup");
  }

  if (!config.atlassianCloudId) {
    throw new Error(
      "ATLASSIAN_CLOUD_ID is missing. Discover it first and add it to the root .env."
    );
  }
}

async function resolveIssueKey({
  issueIdentifier,
  projectKey,
  config
}) {
  const trimmed = issueIdentifier.trim();
  if (!trimmed) {
    throw new Error("issueIdentifier is required");
  }

  if (/^[A-Z][A-Z0-9]+-\d+$/.test(trimmed)) {
    return trimmed;
  }

  const jqlParts = [];
  if (projectKey) {
    jqlParts.push(`project = "${escapeJql(projectKey)}"`);
  }
  jqlParts.push(`summary ~ "${escapeJql(trimmed)}"`);
  const jql = `${jqlParts.join(" AND ")} ORDER BY created DESC`;

  const searchResult = await callRemoteMcpTool({
    serverName: "Atlassian",
    serverUrl: config.atlassianMcpUrl,
    authHeader: config.atlassianMcpAuthHeader,
    toolName: config.atlassianMcpSearchIssuesTool,
    args: {
      cloudId: config.atlassianCloudId,
      jql
    }
  });

  const keys = collectIssueKeys(searchResult.text, searchResult.structuredContent);
  if (!keys.length) {
    throw new Error(
      `Could not find a Jira issue for identifier '${trimmed}'. Try using a Jira key like SCRUM-123.`
    );
  }

  return keys[0];
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

    ensureMcpJiraConfig(config);

    if (!resolvedProjectKey) {
      throw new Error("JIRA_PROJECT_KEY is missing");
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

    const parsed = tryParseJson(mcpResult.text);
    if (parsed?.error === true) {
      throw new Error(parsed.message || "Atlassian MCP returned an error response");
    }

    const issueKey = extractIssueKey(mcpResult.text);
    if (!issueKey) {
      throw new Error(
        `Failed to parse Jira issue key from MCP response: ${mcpResult.text || "empty response"}`
      );
    }

    return {
      key: issueKey,
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

export async function transitionJiraIssueStatus({
  issueIdentifier,
  targetStatus,
  projectKey
}) {
  try {
    const config = getRuntimeConfig();
    const resolvedProjectKey = projectKey || config.jiraProjectKey;

    ensureMcpJiraConfig(config);

    const issueKey = await resolveIssueKey({
      issueIdentifier,
      projectKey: resolvedProjectKey,
      config
    });

    const transitionsResult = await callRemoteMcpTool({
      serverName: "Atlassian",
      serverUrl: config.atlassianMcpUrl,
      authHeader: config.atlassianMcpAuthHeader,
      toolName: config.atlassianMcpGetTransitionsTool,
      args: {
        cloudId: config.atlassianCloudId,
        issueIdOrKey: issueKey
      }
    });

    const transitions = collectTransitions(
      transitionsResult.text,
      transitionsResult.structuredContent
    );
    if (!transitions.length) {
      throw new Error(
        `No Jira transitions were returned for ${issueKey}. Check workflow permissions/status.`
      );
    }

    const normalizedTarget = normalizeStatusName(targetStatus);
    const transition = transitions.find(
      (item) => normalizeStatusName(item.name) === normalizedTarget
    );

    if (!transition) {
      const available = transitions.map((item) => item.name).join(", ");
      throw new Error(
        `Target status '${targetStatus}' is not available for ${issueKey}. Available transitions: ${available}`
      );
    }

    await callRemoteMcpTool({
      serverName: "Atlassian",
      serverUrl: config.atlassianMcpUrl,
      authHeader: config.atlassianMcpAuthHeader,
      toolName: config.atlassianMcpTransitionIssueTool,
      args: {
        cloudId: config.atlassianCloudId,
        issueIdOrKey: issueKey,
        transitionId: transition.id,
        transition: { id: transition.id }
      }
    });

    const currentStatus = await getIssueCurrentStatus(issueKey, config);
    if (!currentStatus) {
      throw new Error(
        `Transition call completed but status could not be verified for ${issueKey}.`
      );
    }

    if (normalizeStatusName(currentStatus) !== normalizedTarget) {
      throw new Error(
        `Transition verification failed for ${issueKey}. Requested '${targetStatus}', current status is '${currentStatus}'.`
      );
    }

    return {
      key: issueKey,
      transition: transition.name,
      currentStatus
    };
  } catch (error) {
    const realError = error.message;
    console.error("❌ Jira Transition FULL Error:", realError);
    throw new Error(
      typeof realError === "object"
        ? JSON.stringify(realError)
        : realError
    );
  }
}
