import { getRuntimeConfig } from "../config.js";
import { sendSlackMessage } from "../services/slack.js";
import { transitionJiraIssueStatus } from "../services/jira.js";

export async function orchestrateStatusUpdate({
  issueIdentifier,
  targetStatus,
  projectKey,
  notifySlack = true,
  slackChannel,
  slackMessage
}) {
  const config = getRuntimeConfig();
  const result = {
    jira: null,
    slack: null,
    warnings: []
  };

  const transitionResult = await transitionJiraIssueStatus({
    issueIdentifier,
    targetStatus,
    projectKey
  });

  result.jira = transitionResult;

  const resolvedChannel = slackChannel || config.defaultSlackChannel;
  if (!notifySlack || !resolvedChannel) {
    return result;
  }

  try {
    const message =
      slackMessage ||
      `🔄 Jira Status Updated: ${transitionResult.key}\nNew status: ${transitionResult.transition}`;
    const slackResponse = await sendSlackMessage(resolvedChannel, message);
    result.slack = slackResponse;
  } catch (error) {
    result.warnings.push(
      `Jira status was updated, but Slack notification failed: ${error.message}`
    );
    console.error("⚠️ Slack notify failed after Jira transition:", error.message);
  }

  return result;
}
