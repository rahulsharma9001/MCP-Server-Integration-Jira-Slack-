from __future__ import annotations

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.function_choice_behavior import FunctionChoiceBehavior
from semantic_kernel.connectors.ai.ollama.ollama_prompt_execution_settings import (
    OllamaChatPromptExecutionSettings,
)
from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion, OpenAIChatCompletion
from semantic_kernel.connectors.ai.prompt_execution_settings import PromptExecutionSettings
from semantic_kernel.functions import KernelArguments

from bridge_plugin import JiraSlackBridgePlugin


def load_runtime_env() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    env_path = repo_root / ".env"
    load_dotenv(env_path, override=False)


load_runtime_env()


SYSTEM_PROMPT = """
You are the orchestration layer for a Jira and Slack automation system.

Your job is to:
- understand the user's intent
- decide whether to create Jira, notify Slack, or both
- ask a clarifying follow-up only if the action truly cannot proceed
- use available functions instead of inventing outcomes
- return a concise execution summary with any warnings

Execution policy:
- Create Jira first when the request involves issue tracking.
- Notify Slack only after Jira succeeds, unless the user explicitly asks for Slack only.
- Never fabricate a ticket key or Slack confirmation.
- Prefer the default project key and Slack channel unless the user specifies overrides.
- The default Jira project key and default Slack channel are already configured in the bridge.
- Do not ask about workspace, environment, or project key unless the action truly cannot proceed.
- If a Jira summary is provided without a description, create the ticket with an auto-generated default description.
- If a request is actionable with defaults, call the available functions instead of asking for confirmation.
- Your final response must reflect actual function results, not intended actions.
"""


def build_kernel() -> Kernel:
    kernel = Kernel()
    llm_provider = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

    if llm_provider == "ollama":
        try:
            from semantic_kernel.connectors.ai.ollama import OllamaChatCompletion
        except ModuleNotFoundError as exc:
            raise RuntimeError(
                "Ollama support is not installed in this Python environment. "
                "Activate the virtualenv and run 'pip install -r requirements.txt'."
            ) from exc

        service = OllamaChatCompletion(
            service_id="default",
            ai_model_id=os.getenv("OLLAMA_CHAT_MODEL_ID", "llama3.2"),
            host=os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434"),
        )
    elif llm_provider == "azure-openai":
        service = AzureChatCompletion(
            service_id="default",
            deployment_name=os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT", ""),
            endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
            api_key=os.getenv("AZURE_OPENAI_API_KEY", ""),
        )
    elif llm_provider == "openai":
        service = OpenAIChatCompletion(
            service_id="default",
            api_key=os.getenv("OPENAI_API_KEY", ""),
            ai_model_id=os.getenv("OPENAI_CHAT_MODEL_ID", "gpt-4.1"),
        )
    else:
        raise ValueError(
            "Unsupported LLM_PROVIDER. Use one of: ollama, openai, azure-openai."
        )

    kernel.add_service(service)
    kernel.add_plugin(JiraSlackBridgePlugin(), plugin_name="JiraSlackBridge")
    return kernel


def _strip_slack_followup_clause(user_request: str) -> str:
    # Keep only the Jira-intent segment for extraction (drop "and notify ... Slack ..." tails).
    followup_match = re.search(
        r"\b(?:and|then|once|after)\b[^.?!\n]*\b(?:notify|inform|post|send)\b[^.?!\n]*\bslack\b",
        user_request,
        flags=re.IGNORECASE,
    )
    if followup_match:
        return user_request[: followup_match.start()].strip()
    return user_request.strip()


def _clean_extracted_text(text: str) -> str:
    cleaned = text.strip().strip(" ,.;:!\"'")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned


def _extract_quoted_or_titled_text(user_request: str) -> str | None:
    request = _strip_slack_followup_clause(user_request)

    quoted_patterns = [
        r'"([^"]+)"',
        r"'([^']+)'",
    ]
    for pattern in quoted_patterns:
        match = re.search(pattern, request)
        if match:
            return _clean_extracted_text(match.group(1))

    patterns = [
        r"titled\s+(.+)$",
        r"saying\s+(.+)$",
        r"(?:jira\s+)?(?:bug|task|ticket|issue)\s+(?:for|about|regarding)\s+(.+)$",
        r"create\s+(?:a|an)?\s*(?:jira\s+)?(?:bug|task|ticket|issue)\s+(.+)$",
        r"log\s+(?:a|an)?\s*(?:jira\s+)?(?:bug|task|ticket|issue)\s+(.+)$",
    ]

    for pattern in patterns:
        match = re.search(pattern, request, flags=re.IGNORECASE)
        if match:
            extracted = _clean_extracted_text(match.group(1))
            if extracted:
                return extracted
    return None


def _looks_like_jira_request(user_request: str) -> bool:
    lowered = user_request.lower()
    return "jira" in lowered and any(word in lowered for word in ["create", "bug", "task", "ticket", "issue"])


def _looks_like_slack_only_request(user_request: str) -> bool:
    lowered = user_request.lower()
    return "slack" in lowered and "jira" not in lowered and any(
        phrase in lowered for phrase in ["send a slack message", "notify slack", "post to slack"]
    )


def _issue_type_for_request(user_request: str) -> str:
    lowered = user_request.lower()
    if "bug" in lowered:
        return "Bug"
    if "incident" in lowered:
        return "Incident"
    return "Task"


def try_execute_simple_request(user_request: str) -> str | None:
    plugin = JiraSlackBridgePlugin()
    extracted_text = _extract_quoted_or_titled_text(user_request)

    if _looks_like_jira_request(user_request) and extracted_text:
        raw_result = plugin.create_jira_ticket(
            summary=extracted_text,
            issue_type=_issue_type_for_request(user_request),
            notify_slack="slack" in user_request.lower(),
        )
        payload = json.loads(raw_result)
        jira_key = payload.get("result", {}).get("jira", {}).get("key")
        slack_ok = payload.get("result", {}).get("slack", {}).get("ok")
        warnings = payload.get("result", {}).get("warnings", [])

        lines = [
            "Execution Summary:",
            f"Jira ticket created: {jira_key or 'unknown key'}",
            f"Slack notified: {'yes' if slack_ok else 'no'}",
        ]
        if warnings:
            lines.append(f"Warnings: {' | '.join(warnings)}")
        return "\n".join(lines)

    if _looks_like_slack_only_request(user_request) and extracted_text:
        raw_result = plugin.send_slack_message(channel="", text=extracted_text)
        payload = json.loads(raw_result)
        channel = payload.get("channel", "default channel")
        ok = payload.get("ok", False)
        return "\n".join(
            [
                "Execution Summary:",
                f"Slack message sent: {'yes' if ok else 'no'}",
                f"Channel: {channel}",
            ]
        )

    return None


async def orchestrate(user_request: str) -> str:
    deterministic_result = try_execute_simple_request(user_request)
    if deterministic_result:
        return deterministic_result

    kernel = build_kernel()
    llm_provider = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

    prompt_input = f"{SYSTEM_PROMPT}\n\nUser request:\n{user_request}"
    arguments = KernelArguments(input=prompt_input)

    if llm_provider == "ollama":
        settings = OllamaChatPromptExecutionSettings(
            function_choice_behavior=FunctionChoiceBehavior.Auto(
                filters={"included_plugins": ["JiraSlackBridge"]}
            )
        )
    else:
        settings = PromptExecutionSettings(
            function_choice_behavior=FunctionChoiceBehavior.Auto(
                filters={"included_plugins": ["JiraSlackBridge"]}
            )
        )

    result = await kernel.invoke_prompt(
        prompt_input,
        arguments=arguments,
        settings=settings,
    )

    return str(result)


async def main() -> None:
    if len(sys.argv) > 1:
        user_request = " ".join(sys.argv[1:])
    else:
        user_request = sys.stdin.read().strip()

    if not user_request:
        raise SystemExit("Provide a request as a CLI argument or via stdin.")

    result = await orchestrate(user_request)
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
