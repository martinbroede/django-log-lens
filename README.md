[![Downloads](https://static.pepy.tech/badge/django-log-lens)](https://pypi.org/project/django-log-lens/)
[![PyPI](https://img.shields.io/badge/PyPI-django--log--lens-blue)](https://pypi.org/project/django-log-lens/)
[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com/martinbroede/django-log-lens/main/VERSION.json&query=version&label=Latest%20Version)](https://raw.githubusercontent.com/martinbroede/django-log-lens/main/VERSION.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Published](https://img.shields.io/badge/Published%20on-Django%20Packages-0c3c26)](https://djangopackages.org/packages/p/django-log-lens/)


[![Bandit](https://github.com/martinbroede/django-log-lens/actions/workflows/bandit.yaml/badge.svg?branch=main)](https://github.com/martinbroede/django-log-lens/actions/workflows/bandit.yaml)
[![Linter](https://github.com/martinbroede/django-log-lens/actions/workflows/linter.yaml/badge.svg?branch=main)](https://github.com/martinbroede/django-log-lens/actions/workflows/linter.yaml)
[![Tests](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml/badge.svg?branch=main)](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml)
[![Coverage](https://martinbroede.github.io/django-log-lens/coverage/badge.svg)](https://martinbroede.github.io/django-log-lens/coverage)

[![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13%20%7C%203.14-blue)](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml)
[![Django](https://img.shields.io/badge/django-4.2%20(LTS)%20%7C%205.0%20%7C%205.1%20%7C%205.2%20(LTS)%20%7C%206.0-blue)](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml)

<br/>

<p align="center">
  <img width="500px" src="https://raw.githubusercontent.com/martinbroede/django-log-lens/main/img/logo.svg">
</p>

<br/>

Django Log Lens is a dependency-free logging app for Django.
It provides a management web interface to view, search, download, archive, and clear log files
while also serving as a tool for debugging client- and server-side errors.

Want to try it out? [&rarr;Get started!](https://github.com/martinbroede/django-log-lens#getting-started)

# Features

### Overview of Accessible Handlers and the Corresponding Log Files

The file handlers of your `LOGGING` configuration are listed together with their log files -
there is no separate list of log files to maintain.

![Log Lens Handler Overview](https://raw.githubusercontent.com/martinbroede/django-log-lens/main/docs/demo.handlers.png)

---

### Semantically Highlighted Logs in Your Browser

![Log File Demo](https://raw.githubusercontent.com/martinbroede/django-log-lens/main/docs/demo.logs.png)

---

### Fast Navigation through Log Files

![Log File Navigation Demo](https://raw.githubusercontent.com/martinbroede/django-log-lens/main/docs/demo.navigation.png)

---

### Fast Navigation through Source Code

- Click on a path in the log message to copy it to the clipboard
- Click on the <kbd>&uarr;</kbd> button to open the referenced line in VS Code
- Adjust the <kbd>Path Splitter</kbd> and the <kbd>Path Prefix</kbd> to match your project structure

![Navigate through Source Code](https://raw.githubusercontent.com/martinbroede/django-log-lens/main/docs/demo.vscode.png)

Example:

Say, the remote project root is `/web/my-project` (as in the example above) and your local project root is `/home/user/MY-PROJECT`.

- Set the <kbd>Path Prefix</kbd> to `/home/user/MY-PROJECT`
- Set the <kbd>Path Splitter</kbd> to `/my-project`

**&rarr; Now, by clicking on the path**<br />
`/web/my-project/django/dvenv/lib/python3.10/site-packages/django/http/request.py:151`, <br />
`/home/user/MY-PROJECT/django/dvenv/lib/python3.10/site-packages/django/http/request.py:151` <br />
**will be opened by VS Code instead.**

### Review of Backed-up Log Files

Rotated backup files written by handlers such as `RotatingFileHandler` or
`TimedRotatingFileHandler` (e.g. `debug.log.1` or `debug.log.2024-01-01`) are discovered
automatically and can be viewed and downloaded from a *Backup* dropdown next to their
primary log file.

### Global Search

The *Search* tab searches all log sources server-side for a substring
(optionally case-sensitive). Matches are grouped by log source and can be opened
directly at the matching line in the log view.

### Archive

Log sources can be archived - i.e. copied to an `archive/` folder next to the log file with a
timestamp appended to the file name.
The *Archive* tab lists all archived copies and allows viewing, downloading, and deleting them.

### Client Logging

Allows clients to send console logs to the server.

```html
<html>
  ...
  {% log_js %} <!-- #1 -->
  ...
  <script>
    throw new Error("Hello, Django Log Lens!"); // #2
  </script>
  ...
```
- `#1` - Include the script to send console logs to the server.
   It will simply override the console methods (`debug`, `info`, `warn`, ...) in a way that
   they behave the same as before but also send the logs to the server.
   Thus, the script does not interfere with your frontend framework and can be used
   out-of-the-box.
- `#2` - You will find errors, including their stack trace, in a log file if you set up
   Django Log Lens as described in [Getting Started](getting-started.md).

## Getting Started

### 1. Install `django-log-lens` from PyPI

```
pip install django-log-lens
```

### 2. Add `django_log_lens` to your `INSTALLED_APPS`

```python
# file: settings.py

INSTALLED_APPS = [
    'django_log_lens',
    ...
]
```

### 3. Add URL patterns to your `urls.py`

```python
# file: urls.py
from django.urls import include

urlpatterns = [
    path('logs/', include('django_log_lens.urls')),
    ...
]
```

### 4. Add a `LOGGING` configuration in your `settings.py`

All you need to configure is the `LOG_FOLDER` where your log files are stored which should point to an existing folder.
With your existing logging configuration, you are good to go.
For semantic highlighting of log levels, use a format Log Lens can derive the log level from - one of:

- `django_log_lens.LOG_FORMAT`, or your own format prefixed with `django_log_lens.LEVEL_PREFIX` -
  this adds a `[LVL:<levelno>]` marker to each line which is hidden in the log view
- any format starting with `%(levelname)s` (e.g. `"%(levelname)s %(asctime)s: %(message)s"`) -
  level names like `ERROR` or `WARNING` at the beginning of a line are recognized as well

Follow the instructions from the [official Django documentation](https://docs.djangoproject.com/en/5.0/topics/logging/#configuring-logging) to configure the logging system or use the example below.

```python
# file: settings.py
from django_log_lens import LOG_FORMAT

LOG_FOLDER = BASE_DIR / "logs"

if not os.path.exists(LOG_FOLDER):
    os.makedirs(LOG_FOLDER)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"default": {"format": LOG_FORMAT}},
    "handlers": {
        "log_collector": {
            "level": "WARNING",
            "class": "logging.FileHandler",
            "filename": str(LOG_FOLDER / "collector.log"),
            "formatter": "default",
        },
        "client_logger": {
            "level": "DEBUG",
            "class": "logging.FileHandler",
            "filename": str(LOG_FOLDER / "client.log"),
            "formatter": "default",
        },
    },
    "loggers": {
        "django_log_lens.client": {"handlers": ["client_logger"], "level": "DEBUG", "propagate": True},
        "django" : {"handlers": ["log_collector"], "level": "DEBUG", "propagate": True},
    }
}

ALLOW_JS_LOGGING = DEBUG # it's recommendable not to allow client logging in production
```

### 5. Visit Log Lens

You can now visit Django Log Lens by navigating to `{% url 'log-lens:view' %}` (code for your template) -
 if you configured the URL pattern as shown above, this would be `logs/view/`


## FAQ

- > Why are my logs not colored according to the log level?

  Make sure your log format starts with `%(levelname)s` or uses the `LOG_FORMAT` / `LEVEL_PREFIX`
  as shown in the example above.
- > Can I use my own logging format?

  Yes. Any format starting with `%(levelname)s` is accepted as-is:
  ```python
  MY_LOG_FORMAT = "%(levelname)s - %(message)s" # adjust to your needs
  ```
  If you prefer not to start the format with the level name, prefix it with `LEVEL_PREFIX` instead -
  the resulting `[LVL:<levelno>]` marker is hidden in the log view:
  ```python
  from django_log_lens import LEVEL_PREFIX

  MY_LOG_FORMAT = "%(asctime)s - %(message)s" # adjust to your needs
  MY_LOG_LENS_FORMAT = LEVEL_PREFIX + MY_LOG_FORMAT
  ```
- > Which handlers are recognized by Django Log Lens?

  The following handlers will be recognized automatically:
  `FileHandler`, `RotatingFileHandler`, `TimedRotatingFileHandler`, `WatchedFileHandler`

  As a side note, be aware that the
  `WatchedFileHandler` is inappropriate for use under windows as open files cannot be moved or renamed.

- > What if I want to use a custom handler?

  Assume you have a custom handler called `CustomHandler` in the file `myapp/handlers.py`:

  ```python
  from logging.handlers import TimedRotatingFileHandler
  class CustomFileHandler(TimedRotatingFileHandler): # could also inherit from any other handler
      pass # add your custom logic here
  ```

  Add the following lines to the logging configuration in your `settings.py`:

  ```python
  from django_log_lens import add_handler
  # add your custom handler by its fully qualified class name:
  add_handler("myapp.handlers.CustomFileHandler")
  ```
  Now, the custom handler will be recognized by Django Log Lens and
  you can view the logs in the web interface.

## Third Party Licenses

This project uses the Dracula theme by Zeno Rocha which is
licensed under the [MIT License](https://raw.githubusercontent.com/dracula/dracula-theme/main/LICENSE)
