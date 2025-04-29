import os
import sys
from pathlib import Path

try:
    from django_log_lens import LEVEL_PREFIX, LOG_FORMAT, add_handler
except ImportError:
    # add local django_log_lens from this repository to the path
    sys.path.append(str(Path(__file__).resolve().parent.parent.parent))
    from django_log_lens import LEVEL_PREFIX, LOG_FORMAT, add_handler

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = 'django-insecure-^2huk-%dy*cq7s9jp54p2z0vyievlvjf9n@uo6#1_jt%i_z_1l'  # nosec B105

DEBUG = True

ALLOWED_HOSTS = []

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
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
                   "my_formatter": {"format": MY_LOG_LENS_FORMAT}},
    "handlers": {
        "client": {
            "level": "DEBUG",
            "class": "logging.handlers.RotatingFileHandler",
            "filename": str(LOG_FOLDER / "client.log"),
            "formatter": "default",
        },
        "django": {
            "level": "WARNING",
            "class": "logging.FileHandler",
            "filename": str(LOG_FOLDER / "django.log"),
            "formatter": "my_formatter",
        },
        "requests": {
            "level": "WARNING",
            "class": "demo.handler.CustomFileHandler",
            "filename": str(LOG_FOLDER / "requests.log"),
            "formatter": "none",
        },
        "misc": {
            "level": "WARNING",
            "class": "logging.handlers.TimedRotatingFileHandler",
            "filename": str(LOG_FOLDER / "misc.log"),
            "formatter": "none",
        },
        "console": {
            "level": "DEBUG",
            "class": "logging.StreamHandler",
            "formatter": "default",
        },
    },
    "loggers": {
        "django_log_lens.client": {"handlers": ["client"], "level": "DEBUG", "propagate": True},
        "django.request": {"handlers": ["requests"], "level": "INFO", "propagate": True},
        "django": {"handlers": ["django"], "level": "WARNING", "propagate": True},
        "misc": {"handlers": ["misc"], "level": "DEBUG", "propagate": True},
        # logger to assert that only file handlers are recognized by django log lens:
        "test": {"handlers": ["console"], "level": "DEBUG", "propagate": True},
    }
}

add_handler("demo.handler.CustomFileHandler")
