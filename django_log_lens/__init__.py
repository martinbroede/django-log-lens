from .views import file_handling_logger_classes

LEVEL_PREFIX = "[LVL:%(levelno)d]"
LOG_FORMAT = LEVEL_PREFIX + "%(asctime)s %(levelname)s: %(message)s"


def add_file_handling_class(class_name: str) -> None:
    """
    Adds a fully qualified class name to the set of file handling logger classes
    in case a custom file handler is used:
    >>> add_file_handling_class("myapp.logging.MyFileHandler")
    """
    file_handling_logger_classes.add(class_name)
