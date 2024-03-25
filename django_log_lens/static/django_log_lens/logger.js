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

window.customLogger = {

  csrfToken: getCSRFToken(),
  isEnabled: true,
  dateFormatter: (date) => date.toISOString().slice(0, 19).replace("T", " "),
  
  sendLogToServer: function (message, level) {
    if (!customLogger.isEnabled) {
      return;
    }
    fetch(window.customLoggerAPI, {
      method: "POST",
      headers: { "X-CSRFToken": customLogger.csrfToken, "Content-Type": "application/json" },
      body: JSON.stringify({ error_message: message, severity: level }),
    })
      .then((response) => {
        if (response.status >= 400) {
          console.error("Logging Error (in .then block):", response.statusText);
          customLogger.isEnabled = false;
        }
      })
      .catch((error) => {
        console.error("Logging Error (in .catch block):", error);
        customLogger.isEnabled = false;
      });
  },

  errorHandler: (errorEvent) => {
    const date = customLogger.dateFormatter(new Date());
    const displayMessage = errorEvent.error.stack || String(errorEvent.error);
    const errorMessage = `${date} CRITICAL:\nUncaught ErrorEvent\n${displayMessage}`;
    customLogger.sendLogToServer(errorMessage, "CRITICAL");
  },

  log: (logLevel, args, stack) => {
    const message = Array.from(args)
      .map((arg) => {
        if (arg instanceof Error) {
          return "\n" + arg.stack;
        } else if (typeof arg === "object") {
          return JSON.stringify(arg, 2);
        } else {
          return String(arg);
        }
      })
      .join(" ");
    const date = customLogger.dateFormatter(new Date());
    let logMessage = `${date} ${logLevel}:\n${message}`;
    logMessage += stack ? `\n${stack}` : "";
    logMessage = logMessage.replaceAll("\\n", "\n");
    logMessage = logMessage.replaceAll(">", "&gt;").replaceAll("<", "&lt;");
    customLogger.sendLogToServer(logMessage, logLevel);
  },

  logDebug: console.debug,
  logInfo: console.info,
  logLog: console.log,
  logWarning: console.warn,
  logError: console.error,
  logAssertion: console.assert,
};

if (!customLogger.csrfToken) {
  customLogger.isEnabled = false;
  console.log("Disabling customLogger because csrf token is missing.");
}

console.debug = function () {
  customLogger.logDebug(...arguments);
  customLogger.log("DEBUG", arguments, getStackTrace());
};

console.log = function () {
  customLogger.logLog(...arguments);
  customLogger.log("DEBUG", arguments, getStackTrace());
};

console.info = function () {
  customLogger.logInfo(...arguments);
  customLogger.log("INFO", arguments, getStackTrace());
};

console.warn = function () {
  customLogger.logWarning(...arguments);
  customLogger.log("WARNING", arguments, getStackTrace());
};

console.error = function () {
  customLogger.logError(...arguments);
  customLogger.log("ERROR", arguments, getStackTrace());
};

console.assert = function () {
  customLogger.logAssertion(...arguments);
  if (!arguments[0]) {
    customLogger.log("ASSERTION FAILED (CRITICAL)", arguments, getStackTrace());
  }
};

window.addEventListener("error", customLogger.errorHandler);
