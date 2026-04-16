import { getRuntimeConfig } from "../config.js";
import { createJiraTicket } from "../services/jira.js";
import { sendSlackMessage } from "../services/slack.js";

export async function orchestrateTicketCreation({
  summary,
  description,
  issueType = "Task",
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

  const ticket = await createJiraTicket({
    summary,
    description,
    issueType,
    projectKey
  });

  result.jira = ticket;

  const resolvedChannel = slackChannel || config.defaultSlackChannel;
  if (!notifySlack || !resolvedChannel) {
    return result;
  }

  try {
    const message =
      slackMessage ||
      `🎫 Jira Ticket Created: ${ticket.key}\nSummary: ${summary}\nType: ${issueType}`;

    const slackResponse = await sendSlackMessage(resolvedChannel, message);
    result.slack = slackResponse;
  } catch (error) {
    result.warnings.push(
      `Jira ticket was created, but Slack notification failed: ${error.message}`
    );
    console.error("⚠️ Slack notify failed after Jira create:", error.message);
  }

  return result;
}
