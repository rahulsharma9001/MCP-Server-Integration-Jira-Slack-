import http from "http";
import { getRuntimeConfig, logStartupContext } from "./src/config.js";
import { orchestrateTicketCreation } from "./src/workflows/ticket-orchestration.js";
import { sendSlackMessage } from "./src/services/slack.js";

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;
    });

    request.on("end", () => {
      if (!rawBody) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(rawBody));
      } catch (error) {
        reject(new Error("Request body must be valid JSON"));
      }
    });

    request.on("error", reject);
  });
}

function isAuthorized(request) {
  const config = getRuntimeConfig();
  if (!config.orchestrationApiKey) {
    return true;
  }

  return request.headers["x-api-key"] === config.orchestrationApiKey;
}

const server = http.createServer(async (request, response) => {
  try {
    if (!isAuthorized(request)) {
      writeJson(response, 401, { error: "Unauthorized" });
      return;
    }

    if (request.method === "GET" && request.url === "/health") {
      writeJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && request.url === "/actions/send-slack-message") {
      const body = await parseJsonBody(request);
      const slackResponse = await sendSlackMessage(body.channel, body.text);

      writeJson(response, 200, {
        ok: true,
        channel: body.channel,
        slackResponse
      });
      return;
    }

    if (request.method === "POST" && request.url === "/actions/create-jira-ticket") {
      const body = await parseJsonBody(request);
      const workflowResult = await orchestrateTicketCreation({
        summary: body.summary,
        description: body.description,
        issueType: body.issueType || "Task",
        projectKey: body.projectKey,
        notifySlack: body.notifySlack !== false,
        slackChannel: body.slackChannel,
        slackMessage: body.slackMessage
      });

      writeJson(response, 200, {
        ok: true,
        result: workflowResult
      });
      return;
    }

    writeJson(response, 404, { error: "Route not found" });
  } catch (error) {
    writeJson(response, 500, {
      ok: false,
      error: error.message
    });
  }
});

const { orchestrationApiPort } = getRuntimeConfig();
server.listen(orchestrationApiPort, () => {
  logStartupContext("Semantic Kernel Bridge");
  console.error(`HTTP bridge listening on port ${orchestrationApiPort}`);
});
