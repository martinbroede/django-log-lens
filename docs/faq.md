# FAQ

## Why are my logs not colored according to the log level?

Make sure your log format starts with `%(levelname)s` or uses the `LOG_FORMAT` / `LEVEL_PREFIX`
as shown in [Getting Started](getting-started.md).

## Can I use my own logging format?

Yes. Any format starting with `%(levelname)s` is accepted as-is:

```python
MY_LOG_FORMAT = "%(levelname)s - %(message)s"  # adjust to your needs
```

If you prefer not to start the format with the level name, prefix it with `LEVEL_PREFIX`
instead — the resulting `[LVL:<levelno>]` marker is hidden in the log view:

```python
from django_log_lens import LEVEL_PREFIX

MY_LOG_FORMAT = "%(asctime)s - %(message)s"  # adjust to your needs
MY_LOG_LENS_FORMAT = LEVEL_PREFIX + MY_LOG_FORMAT
```

## Which handlers are recognized by Django Log Lens?

The following handlers will be recognized automatically:
`FileHandler`, `RotatingFileHandler`, `TimedRotatingFileHandler`, `WatchedFileHandler`

As a side note, be aware that the `WatchedFileHandler` is inappropriate for use under Windows
as open files cannot be moved or renamed.

## What if I want to use a custom handler?

Assume you have a custom handler called `CustomFileHandler` in the file `myapp/handlers.py`:

```python
from logging.handlers import TimedRotatingFileHandler

class CustomFileHandler(TimedRotatingFileHandler):  # could also inherit from any other handler
    pass  # add your custom logic here
```

Add the following lines to the logging configuration in your `settings.py`:

```python
from django_log_lens import add_handler

# add your custom handler by its fully qualified class name:
add_handler("myapp.handlers.CustomFileHandler")
```

Now, the custom handler will be recognized by Django Log Lens and you can view the logs in the
web interface.

## How does the source code navigation work?

Say, the remote project root is `/web/my-project` and your local project root is
`/home/user/MY-PROJECT`.

- Set the <kbd>Path Prefix</kbd> to `/home/user/MY-PROJECT`
- Set the <kbd>Path Splitter</kbd> to `/my-project`

Now, by clicking on the path
`/web/my-project/django/dvenv/lib/python3.10/site-packages/django/http/request.py:151`,
`/home/user/MY-PROJECT/django/dvenv/lib/python3.10/site-packages/django/http/request.py:151`
will be opened by VS Code instead.
