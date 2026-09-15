# Getting Started

## 1. Install `django-log-lens` from PyPI

```bash
pip install django-log-lens
```

## 2. Add `django_log_lens` to your `INSTALLED_APPS`

```python
# file: settings.py

INSTALLED_APPS = [
    'django_log_lens',
    ...
]
```

## 3. Add URL patterns to your `urls.py`

```python
# file: urls.py
from django.urls import include

urlpatterns = [
    path('logs/', include('django_log_lens.urls')),
    ...
]
```

## 4. Add a `LOGGING` configuration in your `settings.py`

All you need to configure is the `LOG_FOLDER` where your log files are stored, which should point to an
existing folder. With your existing logging configuration, you are good to go.
For semantic highlighting of log levels, use a format Log Lens can derive the log level from — one of:

- `django_log_lens.LOG_FORMAT`, or your own format prefixed with `django_log_lens.LEVEL_PREFIX` —
  this adds a `[LVL:<levelno>]` marker to each line which is hidden in the log view
- any format starting with `%(levelname)s` (e.g. `"%(levelname)s %(asctime)s: %(message)s"`) —
  level names like `ERROR` or `WARNING` at the beginning of a line are recognized as well

Follow the instructions from the
[official Django documentation](https://docs.djangoproject.com/en/stable/topics/logging/#configuring-logging)
to configure the logging system or use the example below.

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
        "django": {"handlers": ["log_collector"], "level": "DEBUG", "propagate": True},
    }
}

ALLOW_JS_LOGGING = DEBUG  # it's recommendable not to allow client logging in production
```

## 5. Visit Log Lens

You can now visit Django Log Lens by navigating to `{% url 'log-lens:view' %}` (code for your template) —
if you configured the URL pattern as shown above, this would be `logs/view/`.

!!! note
    All views except login, logout, and the client logging endpoint require a superuser account.
