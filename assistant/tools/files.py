"""
File-management tools.

Everything here is sandboxed to a single "workspace" folder (by default,
./workspace next to this project) rather than the whole filesystem. That's
deliberate: it's the difference between "the assistant can reorganize a
folder I pointed it at" and "the assistant can touch any file on my PC".

Once you trust it, point ASSISTANT_WORKSPACE (in .env) at a real folder,
like your Downloads directory, and it operates on that instead.
"""

import os
from pathlib import Path

from anthropic import beta_tool


def _workspace() -> Path:
    root = Path(os.environ.get("ASSISTANT_WORKSPACE", "workspace")).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _resolve(relative_path: str) -> Path:
    """Resolve a path the model gave us, refusing anything that escapes the workspace."""
    root = _workspace()
    target = (root / relative_path).resolve()
    if target != root and root not in target.parents:
        raise ValueError(f"'{relative_path}' would land outside the workspace ({root}). Refusing.")
    return target


@beta_tool
def list_files(subfolder: str = ".") -> str:
    """List the files and folders inside the assistant's workspace.

    Args:
        subfolder: Path relative to the workspace root to list. Defaults to the workspace root itself.
    """
    target = _resolve(subfolder)
    if not target.exists():
        return f"'{subfolder}' does not exist in the workspace."
    if not target.is_dir():
        return f"'{subfolder}' is a file, not a folder."

    entries = sorted(target.iterdir(), key=lambda p: p.name.lower())
    if not entries:
        return f"'{subfolder}' is empty."

    lines = []
    for entry in entries:
        if entry.is_dir():
            lines.append(f"dir   {entry.name}")
        else:
            lines.append(f"file  {entry.name}  ({entry.stat().st_size} bytes)")
    return "\n".join(lines)


@beta_tool
def read_text_file(path: str) -> str:
    """Read the contents of a text file inside the assistant's workspace.

    Args:
        path: File path relative to the workspace root.
    """
    target = _resolve(path)
    if not target.exists() or not target.is_file():
        return f"Error: '{path}' is not a file in the workspace."
    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return f"Error: '{path}' doesn't look like a text file (binary content)."


@beta_tool
def write_text_file(path: str, content: str) -> str:
    """Create or overwrite a text file inside the assistant's workspace.

    Args:
        path: File path relative to the workspace root.
        content: The full text content to write.
    """
    target = _resolve(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return f"Wrote {len(content)} characters to '{path}'."


@beta_tool
def move_file(source: str, destination: str) -> str:
    """Move or rename a file within the assistant's workspace.

    Args:
        source: Current path, relative to the workspace root.
        destination: New path, relative to the workspace root.
    """
    src = _resolve(source)
    dst = _resolve(destination)
    if not src.exists() or not src.is_file():
        return f"Error: '{source}' is not a file in the workspace."
    if dst.exists():
        return f"Error: '{destination}' already exists. Pick a different name or delete it first."
    dst.parent.mkdir(parents=True, exist_ok=True)
    src.rename(dst)
    return f"Moved '{source}' → '{destination}'."


@beta_tool
def delete_file(path: str) -> str:
    """Delete a single file inside the assistant's workspace. Cannot delete folders.

    Args:
        path: File path relative to the workspace root.
    """
    target = _resolve(path)
    if not target.exists() or not target.is_file():
        return f"Error: '{path}' is not a file in the workspace."
    target.unlink()
    return f"Deleted '{path}'."
