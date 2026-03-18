#!/bin/bash

./scripts/minify.sh -s "./django_log_lens/static/django_log_lens/dev" -f "alpinejs.v3.vendor.js main.js formatter.js util.js navigation.js" -d "./django_log_lens/static/django_log_lens/main.generated.js"
./scripts/minify.sh -s "./django_log_lens/static/django_log_lens/dev" -f "pico.v2.vendor.css styles.css" -d "./django_log_lens/static/django_log_lens/styles.generated.css"

rm -rf dist
rm -rf django_log_lens.egg-info

python -m build
