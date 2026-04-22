from __future__ import annotations

import argparse
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
- If the request asks for an operation that has no available function/tool in this runtime, explicitly say it is unsupported.
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
        r"(?:jira\s+)?(?:bug|task|ticket|issue|incident)\s+(?:for|about|regarding)\s+(.+)$",
        r"create\s+(?:a|an)?\s*(?:jira\s+)?(?:bug|task|ticket|issue|incident)\s+(.+)$",
        r"log\s+(?:a|an)?\s*(?:jira\s+)?(?:bug|task|ticket|issue|incident)\s+(.+)$",
    ]

    for pattern in patterns:
        match = re.search(pattern, request, flags=re.IGNORECASE)
        if match:
            extracted = _clean_extracted_text(match.group(1))
            if extracted:
                return extracted
    return None


def _extract_description_instruction(user_request: str) -> str | None:
    patterns = [
        r"(?:add|include|with)\s+(.+?)\s+in(?:to)?\s+the\s+description",
        r"description\s+(?:should|must)\s+(?:include|have)\s+(.+?)(?:[.?!]|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, user_request, flags=re.IGNORECASE)
        if match:
            return _clean_extracted_text(match.group(1))
    return None


def _split_summary_from_instruction_text(extracted_text: str) -> str:
    lowered = extracted_text.lower()
    markers = [
        ", do add ",
        ", add ",
        ", include ",
        " and add ",
        " and include ",
    ]
    for marker in markers:
        idx = lowered.find(marker)
        if idx > 0:
            return _clean_extracted_text(extracted_text[:idx])
    return _clean_extracted_text(extracted_text)


def _build_requested_description(summary: str, instruction: str) -> str:
    lowered = summary.lower()

    if "payment" in lowered:
        realistic_items = [
            "Payment gateway timeout from provider endpoint",
            "Card authorization declined with processor error code",
            "Duplicate charge prevention rule triggered",
            "Currency mismatch between checkout and gateway request",
            "Webhook callback delayed causing status inconsistency",
        ]
    elif "login" in lowered or "auth" in lowered:
        realistic_items = [
            "Invalid credentials reported despite correct password",
            "Session token not issued after successful authentication",
            "MFA verification code validation failed intermittently",
            "SSO callback returned malformed state parameter",
            "Account lockout triggered earlier than configured threshold",
        ]
    else:
        realistic_items = [
            "Intermittent timeout in dependent upstream service",
            "Validation failure for one or more required fields",
            "Unexpected 5xx response from backend endpoint",
            "Data mismatch between request payload and stored record",
            "Retry logic exhausted before successful completion",
        ]

    lines = [
        "Auto-generated from orchestration request.",
        "",
        f"Incident summary: {summary}",
        f"Description request: {instruction}",
        "",
        "Realistic error list:",
    ]
    lines.extend([f"- {item}" for item in realistic_items])
    return "\n".join(lines)


def _looks_like_jira_request(user_request: str) -> bool:
    lowered = user_request.lower()
    jira_terms = ["jira", "bug", "task", "ticket", "issue", "incident"]
    action_terms = ["create", "log", "track", "open", "file"]
    return any(term in lowered for term in jira_terms) and any(
        action in lowered for action in action_terms
    )


def _looks_like_slack_only_request(user_request: str) -> bool:
    lowered = user_request.lower()
    return "slack" in lowered and "jira" not in lowered and any(
        phrase in lowered for phrase in ["send a slack message", "notify slack", "post to slack"]
    )


def _looks_like_status_update_request(user_request: str) -> bool:
    lowered = user_request.lower()
    has_status_intent = any(
        phrase in lowered
        for phrase in [
            "update the status",
            "change the status",
            "move to in progress",
            "transition",
            "set status",
        ]
    )
    has_jira_context = any(term in lowered for term in ["jira", "ticket", "issue", "task", "bug"])
    return has_status_intent and has_jira_context


def _extract_status_update_target(user_request: str) -> str | None:
    patterns = [
        r"\bto\s+['\"]([^'\"]+)['\"]",
        r"\bto\s+([a-zA-Z][a-zA-Z\s-]{1,40})(?:[.?!]|,|\s+and\s+|\s+once\s+|$)",
    ]
    for pattern in patterns:
        match = re.search(pattern, user_request, flags=re.IGNORECASE)
        if match:
            target = _clean_extracted_text(match.group(1))
            if target:
                return target
    return None


def _extract_status_update_issue_identifier(user_request: str) -> str | None:
    key_match = re.search(r"\b([A-Z][A-Z0-9]+-\d+)\b", user_request)
    if key_match:
        return key_match.group(1)

    patterns = [
        r"(?:jira\s+)?(?:task|ticket|issue|bug)\s+['\"]([^'\"]+)['\"]",
        r"(?:jira\s+)?(?:task|ticket|issue|bug)\s+(?:named|titled)\s+['\"]([^'\"]+)['\"]",
    ]
    for pattern in patterns:
        match = re.search(pattern, user_request, flags=re.IGNORECASE)
        if match:
            identifier = _clean_extracted_text(match.group(1))
            if identifier:
                return identifier
    return None


def _issue_type_for_request(user_request: str) -> str:
    lowered = user_request.lower()
    if "bug" in lowered:
        return "Bug"
    if "incident" in lowered:
        # "Incident" is not available in many Jira projects by default.
        # Use "Bug" as a safer mapping for incident-like operational issues.
        return "Bug"
    return "Task"


def try_execute_simple_request(user_request: str) -> str | None:
    plugin = JiraSlackBridgePlugin()
    extracted_text = _extract_quoted_or_titled_text(user_request)
    description_instruction = _extract_description_instruction(user_request)

    if _looks_like_status_update_request(user_request):
        issue_identifier = _extract_status_update_issue_identifier(user_request)
        target_status = _extract_status_update_target(user_request)

        if issue_identifier and target_status:
            try:
                raw_result = plugin.update_jira_status(
                    issue_identifier=issue_identifier,
                    target_status=target_status,
                    notify_slack="slack" in user_request.lower(),
                )
            except Exception as exc:  # noqa: BLE001
                return "\n".join(
                    [
                        "Execution Summary:",
                        "Jira status update failed.",
                        f"Error: {exc}",
                    ]
                )
            payload = json.loads(raw_result)
            jira_key = payload.get("result", {}).get("jira", {}).get("key")
            final_status = payload.get("result", {}).get("jira", {}).get("transition")
            slack_payload = payload.get("result", {}).get("slack")
            slack_ok = (
                slack_payload.get("ok")
                if isinstance(slack_payload, dict)
                else None
            )
            warnings = payload.get("result", {}).get("warnings", [])
            slack_requested = "slack" in user_request.lower()

            lines = [
                "Execution Summary:",
                f"Jira ticket updated: {jira_key or 'unknown key'}",
                f"New status: {final_status or target_status}",
                (
                    f"Slack notified: {'yes' if slack_ok else 'no'}"
                    if slack_requested
                    else "Slack notified: not requested"
                ),
            ]
            if warnings:
                lines.append(f"Warnings: {' | '.join(warnings)}")
            return "\n".join(lines)

        return (
            "Execution Summary:\n"
            "Status update request detected but missing issue identifier or target status.\n"
            "Please provide both, for example: Update Jira task 'API Integration' to 'In Progress'."
        )

    if _looks_like_jira_request(user_request) and extracted_text:
        resolved_summary = _split_summary_from_instruction_text(extracted_text)
        resolved_description = ""
        if description_instruction:
            resolved_description = _build_requested_description(
                summary=resolved_summary,
                instruction=description_instruction,
            )

        try:
            raw_result = plugin.create_jira_ticket(
                summary=resolved_summary,
                description=resolved_description,
                issue_type=_issue_type_for_request(user_request),
                notify_slack="slack" in user_request.lower(),
            )
        except Exception as exc:  # noqa: BLE001
            return "\n".join(
                [
                    "Execution Summary:",
                    "Jira ticket creation failed.",
                    f"Error: {exc}",
                ]
            )
        payload = json.loads(raw_result)
        jira_key = payload.get("result", {}).get("jira", {}).get("key")
        slack_payload = payload.get("result", {}).get("slack")
        slack_ok = (
            slack_payload.get("ok")
            if isinstance(slack_payload, dict)
            else None
        )
        warnings = payload.get("result", {}).get("warnings", [])
        slack_requested = "slack" in user_request.lower()

        lines = [
            "Execution Summary:",
            f"Jira ticket created: {jira_key or 'unknown key'}",
            (
                f"Slack notified: {'yes' if slack_ok else 'no'}"
                if slack_requested
                else "Slack notified: not requested"
            ),
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


def _render_conversation(history: list[tuple[str, str]]) -> str:
    lines: list[str] = []
    for role, text in history:
        speaker = "User" if role == "user" else "Assistant"
        lines.append(f"{speaker}: {text}")
    return "\n".join(lines)


def _looks_like_execution_summary(response_text: str) -> bool:
    text = response_text.strip()
    if not text:
        return False

    # Treat completion as trustworthy only for strict, bridge-grounded summary formats.
    if "Execution Summary:" not in text:
        return False

    has_jira_and_slack = "Jira ticket created:" in text and "Slack notified:" in text
    has_jira_status_update = "Jira ticket updated:" in text and "New status:" in text
    has_slack_only = "Slack message sent:" in text and "Channel:" in text
    has_unsupported = "Unsupported operation:" in text
    return has_jira_and_slack or has_jira_status_update or has_slack_only or has_unsupported


async def orchestrate(
    user_request: str,
    conversation_history: list[tuple[str, str]] | None = None,
    allow_deterministic: bool = True,
) -> str:
    if allow_deterministic:
        deterministic_result = try_execute_simple_request(user_request)
        if deterministic_result:
            return deterministic_result

    kernel = build_kernel()
    llm_provider = os.getenv("LLM_PROVIDER", "ollama").strip().lower()

    if conversation_history:
        transcript = _render_conversation(conversation_history)
        prompt_input = (
            f"{SYSTEM_PROMPT}\n\n"
            "Conversation so far:\n"
            f"{transcript}\n\n"
            "Based on the latest user message, either:\n"
            "- execute the required function(s), or\n"
            "- ask one concise clarifying question if required data is truly missing."
        )
    else:
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


async def run_interactive_session(initial_user_request: str) -> None:
    history: list[tuple[str, str]] = [("user", initial_user_request)]

    response = await orchestrate(
        user_request=initial_user_request,
        conversation_history=history,
        allow_deterministic=True,
    )
    print(response)

    while not _looks_like_execution_summary(response):
        if not sys.stdin.isatty():
            break

        follow_up = input("\nProvide additional input (or type 'exit'): ").strip()
        if not follow_up or follow_up.lower() in {"exit", "quit"}:
            break

        history.append(("assistant", response))
        history.append(("user", follow_up))

        response = await orchestrate(
            user_request=follow_up,
            conversation_history=history,
            allow_deterministic=True,
        )
        print(response)


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Jira + Slack semantic orchestrator"
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Enable a multi-turn clarification loop when the model needs missing inputs.",
    )
    parser.add_argument(
        "request",
        nargs="*",
        help="Natural language request. If omitted, stdin is used.",
    )

    args = parser.parse_args()

    if args.request:
        user_request = " ".join(args.request).strip()
    else:
        user_request = sys.stdin.read().strip()

    if not user_request:
        raise SystemExit("Provide a request as a CLI argument or via stdin.")

    if args.interactive:
        await run_interactive_session(user_request)
        return

    result = await orchestrate(user_request=user_request)
    print(result)


if __name__ == "__main__":
    asyncio.run(main())
