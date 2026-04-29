/**
 * End-to-end bridge smoke test.
 *
 * Purpose:
 * - Verifies bridge health endpoint.
 * - Executes Slack action and Jira+Slack action through bridge routes.
 * - Quickly confirms the complete Node execution layer is functioning.
 */
import { getRuntimeConfig } from "../src/config.js";

async function main() {
  const config = getRuntimeConfig();
  const bridgeUrl = `http://localhost:${config.orchestrationApiPort}`;
  const headers = {
    "Content-Type": "application/json"
  };

  if (config.orchestrationApiKey) {
    headers["x-api-key"] = config.orchestrationApiKey;
  }

  console.log("Running MCP bridge smoke test...");
  console.log(`Bridge URL: ${bridgeUrl}`);

  const healthRes = await fetch(`${bridgeUrl}/health`, { headers });
  if (!healthRes.ok) {
    throw new Error(`Health check failed with status ${healthRes.status}`);
  }
  const healthJson = await healthRes.json();
  console.log(`Health: ${JSON.stringify(healthJson)}`);

  const slackPayload = {
    channel: config.defaultSlackChannel,
    text: `MCP bridge smoke test (${new Date().toISOString()})`
  };
  const slackRes = await fetch(`${bridgeUrl}/actions/send-slack-message`, {
    method: "POST",
    headers,
    body: JSON.stringify(slackPayload)
  });
  if (!slackRes.ok) {
    const body = await slackRes.text();
    throw new Error(
      `Slack action failed with status ${slackRes.status}: ${body}`
    );
  }
  const slackJson = await slackRes.json();
  console.log(`Slack action: ok=${slackJson.ok}`);

  const jiraPayload = {
    summary: "MCP bridge smoke Jira ticket",
    description: "Created by smoke:mcp-bridge",
    issueType: "Task",
    notifySlack: true
  };
  const jiraRes = await fetch(`${bridgeUrl}/actions/create-jira-ticket`, {
    method: "POST",
    headers,
    body: JSON.stringify(jiraPayload)
  });
  if (!jiraRes.ok) {
    const body = await jiraRes.text();
    throw new Error(`Jira action failed with status ${jiraRes.status}: ${body}`);
  }
  const jiraJson = await jiraRes.json();
  console.log(
    `Jira action: ok=${jiraJson.ok}, key=${jiraJson?.result?.jira?.key || "not parsed"}`
  );

  console.log("Smoke test completed.");
}

main().catch((error) => {
  console.error("❌ smoke:mcp-bridge failed:", error.message);
  process.exit(1);
});
