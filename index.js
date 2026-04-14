import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Version3Client } from 'jira.js';
import { z } from 'zod';

function getJiraHost() {
  const host = process.env.JIRA_HOST || process.env.JIRA_BASE_URL;
  return host ? host.replace(/\/+$/, '') : undefined;
}

function getMissingJiraConfig() {
  const missing = [];

  if (!getJiraHost()) {
    missing.push('JIRA_HOST or JIRA_BASE_URL');
  }

  if (!process.env.JIRA_EMAIL) {
    missing.push('JIRA_EMAIL');
  }

  if (!process.env.JIRA_API_TOKEN) {
    missing.push('JIRA_API_TOKEN');
  }

  return missing;
}

let jira;

function getJiraClient() {
  const missing = getMissingJiraConfig();

  if (missing.length > 0) {
    throw new Error(`Missing Jira configuration: ${missing.join(', ')}`);
  }

  if (!jira) {
    jira = new Version3Client({
      host: getJiraHost(),
      authentication: {
        basic: {
          email: process.env.JIRA_EMAIL,
          apiToken: process.env.JIRA_API_TOKEN,
        },
      },
    });
  }

  return jira;
}

// Create the MCP server
const server = new McpServer({
  name: 'jira-mcp',
  version: '1.0.0',
});

// Tool: Get issues by JQL
server.tool(
  'getIssuesByJQL',
  'Fetch Jira issues using a JQL query',
  {
    jql: z.string().describe('JQL string (e.g., project = TEST)'),
    maxResults: z.number().default(50).describe('Limit results'),
  },
  async ({ jql, maxResults }) => {
    const jira = getJiraClient();
    console.error(`Running JQL: ${jql}`);
    const response = await jira.issueSearch.searchForIssuesUsingJql({ jql, maxResults });
    console.error(`Found ${response.issues?.length || 0} issues`);
    return {
      content: [{ type: 'text', text: JSON.stringify(response.issues, null, 2) }],
    };
  }
);

// Tool: Create new Jira issue
server.tool(
  'createIssue',
  'Create a new Jira issue',
  {
    projectKey: z.string().describe('Project key (e.g., TEST)'),
    summary: z.string().describe('Issue title'),
    description: z.string().describe('Issue details'),
    issueType: z.string().default('Task').describe('Type (Task, Bug, etc.)'),
  },
  async ({ projectKey, summary, description, issueType = 'Task' }) => {
    const jira = getJiraClient();
    console.error(`Creating issue in ${projectKey}`);
    const issue = await jira.issues.createIssue({
      fields: {
        project: { key: projectKey },
        summary,
        description,
        issuetype: { name: issueType },
      },
    });
    console.error(`Created issue: ${issue.key}`);
    return {
      content: [{ type: 'text', text: JSON.stringify(issue, null, 2) }],
    };
  }
);

// Start the MCP server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const missing = getMissingJiraConfig();

  if (missing.length > 0) {
    console.error(`Jira MCP Server is running, but configuration is incomplete: ${missing.join(', ')}`);
    return;
  }

  console.error(`Jira MCP Server is running for ${getJiraHost()}`);
}
main().catch((err) => console.error('Error:', err));
