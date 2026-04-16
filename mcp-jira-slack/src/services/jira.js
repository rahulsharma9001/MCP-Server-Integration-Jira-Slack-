import axios from "axios";
import { getRuntimeConfig } from "../config.js";

function buildAdfDescription(descriptionText) {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: descriptionText
          }
        ]
      }
    ]
  };
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

    if (!config.jiraBaseUrl || !resolvedProjectKey) {
      throw new Error("Jira env variables missing");
    }

    const response = await axios.post(
      `${config.jiraBaseUrl}/rest/api/3/issue`,
      {
        fields: {
          project: { key: resolvedProjectKey },
          summary,
          description: buildAdfDescription(description),
          issuetype: { name: issueType }
        }
      },
      {
        auth: {
          username: config.jiraEmail,
          password: config.jiraApiToken
        },
        headers: {
          "Content-Type": "application/json"
        }
      }
    );

    return response.data;
  } catch (error) {
    const realError = error.response?.data || error.message;
    console.error("❌ Jira FULL Error:", realError);

    throw new Error(
      typeof realError === "object"
        ? JSON.stringify(realError)
        : realError
    );
  }
}
