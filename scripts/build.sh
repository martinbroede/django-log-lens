#!/bin/bash

./run/minify.sh -d "./django_log_lens/static/django_log_lens/dev" -f "alpinejs.v3.vendor.js main.js formatter.js util.js navigation.js" -o "./django_log_lens/static/django_log_lens/main.generated.js"
./run/minify.sh -d "./django_log_lens/static/django_log_lens/dev" -f "pico.v2.vendor.css styles.css" -o "./django_log_lens/static/django_log_lens/styles.generated.css"

rm -rf dist
rm -rf django_log_lens.egg-info

python -m build
