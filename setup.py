import json
import sys
from pathlib import Path

import setuptools

if sys.version_info < (3, 9):
    print("Python 3.9 or higher is required.")
    sys.exit(1)

PARENT_FOLDER = Path(__file__).parent

with open(PARENT_FOLDER / "README.md", "r") as f:
    LONG_DESCRIPTION = f.read()

with open(PARENT_FOLDER / "VERSION.json", "r") as f:
    version_json = f.read()
    VERSION = json.loads(version_json)["version"]

setuptools.setup(
    name="django-log-lens",
    version=VERSION,
    author="Martin Broede",
    author_email="martin.broede@gmail.com",
    maintainer="Martin Broede",
    maintainer_email="martin.broede@gmail.com",
    license="MIT",
    description="A lightweight Django app for viewing and managing log data conveniently",
    long_description=LONG_DESCRIPTION,
    long_description_content_type="text/markdown",
    url="https://github.com/martinbroede/django-log-lens",
    packages=['django_log_lens'],
    include_package_data=True,
    python_requires='>=3.9',
    install_requires=["Django>=4.2"],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Framework :: Django",
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
    ],
)
