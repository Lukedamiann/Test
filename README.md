# Personal Assistant

A small, local, tool-calling agent built on the Claude API. You run it on your
own machine, talk to it in plain English, and it decides which of its tools to
call. It ships with file-management tools; you grow it by adding more.

This isn't a chatbot wrapper — it's a real agent loop: Claude reads your
request, decides whether a tool is needed, calls it, reads the result, and
either calls another tool or replies. All of that happens locally; nothing
but the model call itself leaves your machine.

## Setup (Windows)

```powershell
# 1. Create and activate a virtual environment
python -m venv .venv
.venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Add your API key
copy .env.example .env
# then open .env and paste your key from https://console.anthropic.com/settings/keys

# 4. Run it
python -m assistant.main
```

## Example session

```
you> what's in my workspace?
  → list_files({})

assistant> Just welcome.txt right now.

you> read it and make me a todo.txt based on what it suggests
  → read_text_file({'path': 'welcome.txt'})
  → write_text_file({'path': 'todo.txt', 'content': '...'})

assistant> Done — todo.txt now has three starter tasks based on welcome.txt's suggestions.
```

## How it's organized

```
assistant/
  main.py            the REPL + the agent loop (tool_runner from the Claude API)
  tools/
    __init__.py       ALL_TOOLS - the list the agent is given each turn
    files.py          file-management tools, sandboxed to workspace/
    clock.py          get_current_datetime
workspace/            sandbox folder the file tools operate on
```

## Adding a new capability

1. Write a function in a new (or existing) file under `assistant/tools/`.
2. Decorate it with `@beta_tool`, and give it a docstring — that docstring is
   what the model reads to decide when and how to call it, so describe the
   arguments clearly (see `assistant/tools/files.py` for the pattern).
3. Add it to `ALL_TOOLS` in `assistant/tools/__init__.py`.

That's the whole extension point — nothing in `main.py` needs to change.

### Where this can go next

The file tools are sandboxed to `workspace/` on purpose, so the assistant is
safe to try out of the box. Once you trust it:

- Point `ASSISTANT_WORKSPACE` in `.env` at a real folder (e.g. your Downloads
  directory) so the file tools operate on your actual files.
- Add a Canvas tool (Canvas's REST API + a personal access token from
  Account → Settings) to pull assignments directly.
- Add a Google Calendar tool (`google-api-python-client` + OAuth) to read and
  write real events.
- Add a Gmail tool the same way, to send or search email.
- Wire it to Windows Task Scheduler to run unattended on a schedule, instead
  of only when you open a terminal.

Each of those is the same pattern as `files.py`: a decorated function with a
docstring, added to `ALL_TOOLS`.

## Safety notes

- File tools can't write, move, read, or delete anything outside the
  workspace folder — paths that would escape it are rejected.
- The assistant is told to confirm before deleting or overwriting a file
  unless you've clearly already told it to.
- Nothing runs automatically. It only acts when you type something and press
  enter.
