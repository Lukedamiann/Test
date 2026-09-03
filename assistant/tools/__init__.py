"""
The assistant's toolbox.

To give the assistant a new capability: write a function in a module in this
package, decorate it with @beta_tool (or @beta_async_tool for async work),
give it a docstring (the model reads it to decide when to call the tool),
then add it to ALL_TOOLS below. Nothing else needs to change - main.py picks
up every tool in this list automatically.
"""

from .files import list_files, read_text_file, write_text_file, move_file, delete_file
from .clock import get_current_datetime

ALL_TOOLS = [
    list_files,
    read_text_file,
    write_text_file,
    move_file,
    delete_file,
    get_current_datetime,
]
