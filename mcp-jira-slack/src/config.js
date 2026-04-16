import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envCandidates = [
  path.join(process.cwd(), ".env"),
  path.join(__dirname, "..", ".env"),
  path.join(__dirname, "..", "..", ".env")
];

const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));

dotenv.config(envPath ? { path: envPath } : undefined);

export function getEnvPath() {
  return envPath;
}

export function getRuntimeConfig() {
  return {
    jiraBaseUrl: process.env.JIRA_BASE_URL,
    jiraProjectKey: process.env.JIRA_PROJECT_KEY,
    jiraEmail: process.env.JIRA_EMAIL,
    jiraApiToken: process.env.JIRA_API_TOKEN,
    slackBotToken: process.env.SLACK_BOT_TOKEN,
    defaultSlackChannel: process.env.DEFAULT_SLACK_CHANNEL,
    orchestrationApiPort: Number(process.env.ORCHESTRATION_API_PORT || 3010),
    orchestrationApiKey: process.env.ORCHESTRATION_API_KEY || ""
  };
}

export function logStartupContext(prefix = "MCP Server") {
  const config = getRuntimeConfig();

  console.error(`🚀 ${prefix} Started...`);
  console.error("ENV CHECK:");
  console.error("JIRA_BASE_URL:", config.jiraBaseUrl);
  console.error("JIRA_PROJECT_KEY:", config.jiraProjectKey);
  console.error("JIRA_EMAIL:", config.jiraEmail);
  console.error("SLACK_CHANNEL:", config.defaultSlackChannel);
  console.error("ENV FILE:", envPath || "not found");
}
