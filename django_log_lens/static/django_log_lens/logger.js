"use strict";

/**
 * Looks for an input element with the name "csrfmiddlewaretoken" and returns its value.
 * @returns {string} CSRF token
 */
function getCSRFToken() {
  // source https://gist.github.com/sirodoht/fb7a6e98d33fc460d4f1eadaff486e7b - thanks!
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

/**
 * Returns the stack trace of the invocating function.
 * @returns {string} Stack trace
 */
function getStackTrace() {
  const stack = (new Error().stack || "").split("\n");
  return stack.slice(3, stack.length).join("\n");
}

/**
 * Copies the console methods so they can be overridden in a way that the original methods are still accessible
 * and the logs can be sent to the server.
 */
const logLensLogger = {
  csrfToken: getCSRFToken(),
  isEnabled: true,

  /**
   * Sends the log message to the server with the given severity level.
   * @param {string} message Log message
   * @param {string} level Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
   * @returns {void}
   */
  sendLogToServer: function (message, level) {
    if (!logLensLogger.isEnabled) {
      return;
    }
    // @ts-ignore
    fetch(LOG_LENS_POST_API, {
      method: "POST",
      headers: { "X-CSRFToken": logLensLogger.csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ error_message: message, severity: level }),
    })
      .then((response) => {
        if (response.status >= 400) {
          console.error(`Error sending log to server (${getStackTrace()})`, response);
          logLensLogger.isEnabled = false;
        }
      })
      .catch((error) => {
        console.error(`Error sending log to server (${getStackTrace()})`, error);
        logLensLogger.isEnabled = false;
      });
  },

  /**
   * Handles uncaught errors - sends the error to the server.
   * @param {ErrorEvent} errorEvent
   */
  errorHandler: (errorEvent) => {
    logLensLogger.log("CRITICAL", [errorEvent.error]);
  },

  /**
   * Maps the arguments to a single string message.
   * @param {IArguments | any[]} args Arguments
   * @returns {string} Mapped message
   */
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

  /**
   * Logs the message to the server.
   * @param {string} logLevel Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
   * @param {IArguments | any[]} args Arguments
   * @param {string=} stack Stack trace
   */
  log: (logLevel, args, stack) => {
    let logMessage = logLensLogger.mapArgsToMessage(args);
    const stackAsProperty = args[0]? args[0].stack : undefined;
    if (stack && !stackAsProperty) {
      // if the first argument is an error, we don't want to append the stack trace
      logMessage += "\n" + stack;
    }
    logMessage = logMessage.replaceAll(">", "&gt;").replaceAll("<", "&lt;").replaceAll("=", "&equals;").trim();
    logLensLogger.sendLogToServer(logMessage, logLevel);
  },

  logDebug: console.debug,
  logInfo: console.info,
  logLog: console.log,
  logWarning: console.warn,
  logError: console.error,
  logAssertion: console.assert,
};

if (!logLensLogger.csrfToken) {
  logLensLogger.isEnabled = false;
  console.log("Disabling customLogger because CSRF token is missing.");
}

console.debug = function () {
  logLensLogger.logDebug(...arguments);
  logLensLogger.log("DEBUG", arguments, getStackTrace());
};

console.log = function () {
  logLensLogger.logLog(...arguments);
  logLensLogger.log("DEBUG", arguments, getStackTrace());
};

console.info = function () {
  logLensLogger.logInfo(...arguments);
  logLensLogger.log("INFO", arguments, getStackTrace());
};

console.warn = function () {
  logLensLogger.logWarning(...arguments);
  logLensLogger.log("WARNING", arguments, getStackTrace());
};

console.error = function () {
  logLensLogger.logError(...arguments);
  logLensLogger.log("ERROR", arguments, getStackTrace());
};

console.assert = function () {
  logLensLogger.logAssertion(...arguments);
  if (!arguments[0]) {
    logLensLogger.log("ASSERTION FAILED (CRITICAL)", arguments, getStackTrace());
  }
};

window.addEventListener("error", logLensLogger.errorHandler);
