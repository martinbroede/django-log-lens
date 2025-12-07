import os
import sys
from pathlib import Path

from django.core.management.utils import get_random_secret_key

try:
    from django_log_lens import LEVEL_PREFIX, LOG_FORMAT, add_handler
    print("Using installed django_log_lens package from environment")
except ImportError:
    # add local django_log_lens from this repository to the path
    sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
    from django_log_lens import LEVEL_PREFIX, LOG_FORMAT, add_handler
    print("Using local django_log_lens package from repository")

BASE_DIR = Path(__file__).resolve().parent.parent

LOG_LENS_DEBUG = True
DEBUG = True

SECRET_KEY = get_random_secret_key() if not DEBUG else "---"

ALLOWED_HOSTS = ["*"] if DEBUG else ["*"]  # adjust for production

INSTALLED_APPS = [
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.staticfiles',

    'django_log_lens'
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'demo.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / "templates"],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'demo.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


AUTH_PASSWORD_VALIDATORS = []  # for demo purposes


LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / "staticfiles"


DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# LOG CONFIG ###########################################################################################################

LOG_FOLDER = BASE_DIR / "logs"  # where logs will be stored

ALLOW_JS_LOGGING = True  # should only be used in development

if not os.path.exists(LOG_FOLDER):
    os.makedirs(LOG_FOLDER)


MY_LOG_FORMAT = "%(name)s %(levelname)s - %(message)s"  # adjust to your needs
MY_LOG_LENS_FORMAT = LEVEL_PREFIX + MY_LOG_FORMAT

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"default": {"format": LOG_FORMAT},
                   "none": {"format": "%(levelname)s %(message)s"},
                   "formatter": {"format": MY_LOG_LENS_FORMAT}},
    "handlers": {
        "clients": {
            "level": "DEBUG",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(LOG_FOLDER / "clients.log"),
            "formatter": "default",
            "maxBytes": 1024 * 10,  # 10 KB for testing purposes
            "backupCount": 9,
        },
        "django": {
            "level": "WARNING",
            "class": "logging.FileHandler",
            "filename": str(LOG_FOLDER / "django.log"),
            "formatter": "formatter",
        },
        "audits": {
            "level": "INFO",
            "class": "demo.handler.CustomFileHandler",
            "filename": str(LOG_FOLDER / "audits.log"),
            "formatter": "none",
            "when": "M",
            "interval": 1,
            "backupCount": 3,
        },
        "resources": {
            "level": "INFO",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(LOG_FOLDER / "resources.log"),
            "formatter": "default",
            "maxBytes": 2000,
            "backupCount": 9,
        },
        "console": {
            "level": "DEBUG",
            "class": "logging.StreamHandler",
            "formatter": "default",
        },
    },
    "loggers": {
        "django_log_lens.client": {"handlers": ["clients", "console"], "level": "DEBUG", "propagate": True},
        "django": {"handlers": ["django", "console"], "level": "WARNING", "propagate": True},
        "audits": {"handlers": ["audits"], "level": "INFO", "propagate": True},
        "resources": {"handlers": ["resources"], "level": "DEBUG", "propagate": True},
        # logger to assert that only file handlers are recognized by django log lens:
        "console-only": {"handlers": ["console"], "level": "DEBUG", "propagate": True},
    }
}

add_handler("demo.handler.CustomFileHandler")
