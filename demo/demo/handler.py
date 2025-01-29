from logging.handlers import TimedRotatingFileHandler


class CustomFileHandler(TimedRotatingFileHandler):
    """
    Handler to test if custom handlers can be registered.
    """
