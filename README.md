[![Downloads](https://static.pepy.tech/badge/django-log-lens)](https://pypi.org/project/django-log-lens/)
[![PyPI](https://img.shields.io/badge/PyPI-django--log--lens-blue)](https://pypi.org/project/django-log-lens/)
[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fmartinbroede%2Fdjango-log-lens%2Fmain%2FVERSION.json&query=version&label=Latest%20Version)](https://raw.githubusercontent.com/martinbroede/django-log-lens/main/VERSION.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

[![Tests](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml/badge.svg?branch=main)](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml)
[![Linter](https://github.com/martinbroede/django-log-lens/actions/workflows/linter.yaml/badge.svg?branch=main)](https://github.com/martinbroede/django-log-lens/actions/workflows/linter.yaml)

[![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-blue)](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml)
[![Django](https://img.shields.io/badge/django-4.1%20%7C%204.2%20%7C%205.0%20%7C%205.1-blue)](https://github.com/martinbroede/django-log-lens/actions/workflows/tests.yaml)

<br/>
<img width="830px" src="https://raw.githubusercontent.com/martinbroede/django-log-lens/main/django_log_lens/static/django_log_lens/logo.svg">
<br/>
<br/>

Django Log Lens is a dependency-free, lightweight, and easy-to-use logging app for Django.
It provides an interface to supervise log data while also serving as a useful tool for debugging.
As a unique feature, it allows clients to send console logs to the server out of the box, working with any frontend framework by simply adding a single line of code to include the required script.

Want to try it out? [&rarr;Get started!](https://github.com/martinbroede/django-log-lens#getting-started)

# Core Features

### Overview of Accessible Handlers and the Corresponding Log Files

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

### Client Logging

Allows clients to send console logs to the server.

```html
<!DOCTYPE html>
<html>
  ...
  <body>
    {% csrf_token %}
    <!-- it's not necessary to render the CSRF token more than once,
    so if you use it anywhere in your template, you can skip the line above -->
    {% include 'js-logger.html' %}
    <!-- include the script to send console logs to the server.
    It will simply override the console methods (debug, info, warn...) in a
    way they behave the same as before but also send the logs to the server.
    Thus, the script does not interfere with your frontend framework and
    can be used out-of-the-box. -->
    ...
  </body>
  <script>
    throw new Error("Hello, Django Log Lens!");
    /* You will find this error, including its stack trace, in a log file
    if you configured django log lens as described below. */
  </script>
</html>
```

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

You can now visit Django Log Lens by navigating to `{% url 'django_log_lens:view' %}` (code for your template) -
 if you configured the URL pattern as shown above, this would be `logs/view`


## FAQ

- > Why is are my logs not colored according to the log level?

  Make sure to set the `LOG_FORMAT` in your `settings.py` as shown in the example above.
- > Can I use my own logging format?

  Basically, yes. Just make sure prefix the loglevel to the log message as shown in the following example:
  ```python
  from django_log_lens import LEVEL_PREFIX

  MY_LOG_FORMAT = "%(levelname)s - %(message)s" # adjust to your needs
  MY_LOG_LENS_FORMAT = LEVEL_PREFIX + MY_LOG_FORMAT
  ```

## Third Party Licenses

This project uses the Dracula theme by Zeno Rocha which is
licensed under the [MIT License](https://raw.githubusercontent.com/dracula/dracula-theme/main/LICENSE)
