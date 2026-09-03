"""
Luke's personal assistant - a small, local, tool-calling Claude agent.

Run it:
    python -m assistant.main

Talk to it in plain English. It decides which tool to call based on the
tool's docstring - you don't write any routing logic. To add a capability,
see assistant/tools/__init__.py.
"""

import os
import sys

import anthropic
from dotenv import load_dotenv

from assistant.tools import ALL_TOOLS

load_dotenv()

MODEL = "claude-opus-5"

SYSTEM_PROMPT = (
    "You are Luke's personal assistant, running locally on his own computer. "
    "You have a small set of tools today and will gain more over time as he adds them. "
    "Right now you can read, write, move, and delete files inside a sandboxed workspace "
    "folder, and check the current date and time. Be direct and concise - this is a "
    "terminal chat, not a chat app. Confirm before doing anything destructive (deleting "
    "or overwriting a file) unless the user has clearly already told you to go ahead."
)


class Assistant:
    """Wraps the tool-calling loop and keeps conversation history across turns."""

    def __init__(self, client: anthropic.Anthropic):
        self.client = client
        self.messages: list[dict] = []

    def send(self, user_input: str) -> str:
        self.messages.append({"role": "user", "content": user_input})

        last = None
        while True:
            runner = self.client.beta.messages.tool_runner(
                model=MODEL,
                max_tokens=16000,
                system=SYSTEM_PROMPT,
                tools=ALL_TOOLS,
                messages=self.messages,
            )
            last = None
            for message in runner:
                last = message
                self.messages.append({"role": "assistant", "content": message.content})
                for block in message.content:
                    if block.type == "tool_use":
                        print(f"  → {block.name}({block.input})")
                tool_response = runner.generate_tool_call_response()
                if tool_response is not None:
                    self.messages.append(tool_response)

            # A long server-side turn can pause mid-way; the runner won't resume
            # it on its own, so restart with the paused turn already in history.
            if last is not None and last.stop_reason == "pause_turn":
                continue
            break

        if last is None:
            return "(no response)"
        return next((b.text for b in last.content if b.type == "text"), "(no text response)")


def main() -> None:
    if not (os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")):
        print("Missing ANTHROPIC_API_KEY.")
        print("Copy .env.example to .env and add your key from https://console.anthropic.com/settings/keys")
        sys.exit(1)

    client = anthropic.Anthropic()
    assistant = Assistant(client)

    print("Your assistant is ready. Type a task, or 'exit' to quit.\n")
    while True:
        try:
            user_input = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user_input:
            continue
        if user_input.lower() in ("exit", "quit"):
            break

        reply = assistant.send(user_input)
        print(f"\nassistant> {reply}\n")


if __name__ == "__main__":
    main()
