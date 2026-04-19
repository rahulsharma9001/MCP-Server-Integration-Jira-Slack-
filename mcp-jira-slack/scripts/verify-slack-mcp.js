import { getRuntimeConfig } from "../src/config.js";
import { sendSlackMessage } from "../src/services/slack.js";

async function main() {
  const config = getRuntimeConfig();
  const channel = process.argv[2] || config.defaultSlackChannel;
  const text =
    process.argv[3] ||
    `Slack MCP verification message (${new Date().toISOString()})`;

  if (!channel) {
    throw new Error(
      "No Slack channel provided. Pass a channel argument or set DEFAULT_SLACK_CHANNEL."
    );
  }

  if (!config.slackMcpAuthHeader) {
    throw new Error(
      "Slack MCP authentication is missing. Configure SLACK_MCP_AUTH_HEADER."
    );
  }

  console.log("Verifying Slack MCP connectivity...");
  console.log(`Server URL: ${config.slackMcpUrl}`);
  console.log(`Configured message tool: ${config.slackMcpSendMessageTool}`);
  console.log(
    `Argument mapping: ${config.slackMcpChannelArg}, ${config.slackMcpTextArg}`
  );
  console.log(`Channel: ${channel}`);

  const result = await sendSlackMessage(channel, text);

  console.log("\nVerification result:");
  console.log(`Sent: ${result.ok ? "yes" : "no"}`);
  console.log(`Channel: ${result.channel}`);
  console.log(`Raw response: ${result.rawText || "empty"}`);
}

main().catch((error) => {
  console.error("❌ Slack MCP verification failed:", error.message);
  process.exit(1);
});
