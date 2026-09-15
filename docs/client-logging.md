# Client Logging

Django Log Lens allows clients to send console logs to the server.

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

!!! warning
    You should use this only in development mode — otherwise, clients will be able to send
    arbitrary logs to your server (not harmful, but it may clutter your log files).
    The endpoint is only active while `ALLOW_JS_LOGGING = True` is set in your `settings.py`.
