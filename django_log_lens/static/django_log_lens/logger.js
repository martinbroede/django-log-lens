"use strict";

function getCSRFToken() {
  // https://gist.github.com/sirodoht/fb7a6e98d33fc460d4f1eadaff486e7b - thanks!
  const inputElements = document.querySelectorAll("input");
  let csrfToken = "";
  for (let i = 0; i < inputElements.length; ++i) {
    if (inputElements[i].name === "csrfmiddlewaretoken") {
      csrfToken = inputElements[i].value;
      break;
    }
  }
  return csrfToken;
}

function getStackTrace() {
  const stack = new Error().stack.split("\n");
  return stack.slice(3, stack.length).join("\n");
}

const _customLogger = {
  csrfToken: getCSRFToken(),
  isEnabled: true,

  sendLogToServer: function (message, level) {
    if (!_customLogger.isEnabled) {
      return;
    }
    fetch(window.customLoggerAPI, {
      method: "POST",
      headers: { "X-CSRFToken": _customLogger.csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ error_message: message, severity: level }),
    })
      .then((response) => {
        if (response.status >= 400) {
          console.error("Logging Error (in .then block):", response.statusText);
          _customLogger.isEnabled = false;
        }
      })
      .catch((error) => {
        console.error("Logging Error (in .catch block):", error);
        _customLogger.isEnabled = false;
      });
  },

  /**
   * Handles uncaught errors - sends the error to the server.
   * @param {ErrorEvent} errorEvent
   */
  errorHandler: (errorEvent) => {
    _customLogger.log("CRITICAL", [errorEvent.error]);
  },

  mapArgsToMessage: (args) => {
    return Array.from(args)
      .map((arg) => {
        if (arg instanceof Error) {
          return arg.stack ? arg.message + "\n" + arg.stack : arg.message;
        } else if (typeof arg === "object") {
          return JSON.stringify(arg, null, 2);
        } else {
          return String(arg);
        }
      })
      .join(" ");
  },

  log: (logLevel, args, stack) => {
    let logMessage = _customLogger.mapArgsToMessage(args);
    if (stack && !args[0].stack) {
      // if the first argument is an error, we don't want to append the stack trace
      logMessage += "\n" + stack;
    }
    logMessage = logMessage.replaceAll(">", "&gt;").replaceAll("<", "&lt;").replaceAll("=", "&equals;").trim();
    _customLogger.sendLogToServer(logMessage, logLevel);
  },

  logDebug: console.debug,
  logInfo: console.info,
  logLog: console.log,
  logWarning: console.warn,
  logError: console.error,
  logAssertion: console.assert,
};

window.customLogger = _customLogger;

if (!_customLogger.csrfToken) {
  _customLogger.isEnabled = false;
  console.log("Disabling customLogger because CSRF token is missing.");
}

console.debug = function () {
  _customLogger.logDebug(...arguments);
  _customLogger.log("DEBUG", arguments, getStackTrace());
};

console.log = function () {
  _customLogger.logLog(...arguments);
  _customLogger.log("DEBUG", arguments, getStackTrace());
};

console.info = function () {
  _customLogger.logInfo(...arguments);
  _customLogger.log("INFO", arguments, getStackTrace());
};

console.warn = function () {
  _customLogger.logWarning(...arguments);
  _customLogger.log("WARNING", arguments, getStackTrace());
};

console.error = function () {
  _customLogger.logError(...arguments);
  _customLogger.log("ERROR", arguments, getStackTrace());
};

console.assert = function () {
  _customLogger.logAssertion(...arguments);
  if (!arguments[0]) {
    _customLogger.log("ASSERTION FAILED (CRITICAL)", arguments, getStackTrace());
  }
};

window.addEventListener("error", _customLogger.errorHandler);
