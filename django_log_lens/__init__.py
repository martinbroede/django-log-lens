from .views import file_handlers

LEVEL_PREFIX = "[LVL:%(levelno)d]"
LOG_FORMAT = LEVEL_PREFIX + "%(asctime)s %(levelname)s: %(message)s"


def add_handler(handler_fqcn: str) -> None:
    """
    Adds a file handler so that it can be used in the Django Log Lens app.
    This only necessary if you want to use handlers different from the default ones
    which are `logging.FileHandler`, `logging.handlers.RotatingFileHandler`,
    `logging.handlers.TimedRotatingFileHandler`, and `logging.handlers.WatchedFileHandler`.
    The handler is identified by its fully qualified class name.

    Example:
    >>> add_handler("myapp.handlers.MyFileHandler")
    """
    file_handlers.add(handler_fqcn)
