import axios from "axios";
import { getRuntimeConfig } from "../config.js";

export function normalizeSlackChannel(channel) {
  if (!channel) {
    return channel;
  }

  if (channel.startsWith("#") || /^[CDG][A-Z0-9]+$/.test(channel)) {
    return channel;
  }

  return `#${channel}`;
}

export async function sendSlackMessage(channel, text) {
  try {
    const config = getRuntimeConfig();

    if (!config.slackBotToken) {
      throw new Error("SLACK_BOT_TOKEN is missing");
    }

    const normalizedChannel = normalizeSlackChannel(channel);
    const response = await axios.post(
      "https://slack.com/api/chat.postMessage",
      { channel: normalizedChannel, text },
      {
        headers: {
          Authorization: `Bearer ${config.slackBotToken}`,
          "Content-Type": "application/json"
        }
      }
    );

    if (!response.data.ok) {
      throw new Error(response.data.error);
    }

    return response.data;
  } catch (error) {
    const realError = error.response?.data || error.message;
    console.error("❌ Slack FULL Error:", realError);

    throw new Error(
      typeof realError === "object"
        ? JSON.stringify(realError)
        : realError
    );
  }
}
