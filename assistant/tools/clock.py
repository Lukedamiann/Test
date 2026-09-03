from datetime import datetime

from anthropic import beta_tool


@beta_tool
def get_current_datetime() -> str:
    """Get the current local date and time.

    Use this whenever you need to know today's date or the time of day -
    the model has no built-in sense of "now".
    """
    return datetime.now().strftime("%A, %B %d, %Y at %I:%M %p")
