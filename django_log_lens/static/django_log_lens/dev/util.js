/**
 * A simple logger with configurable log levels.
 */
const logger = {
  prefix: "[Django Log Lens]",
  level: new URLSearchParams(window.location.search).get("loglevel") || "error",
  SEVERITY: {
    debug: 10,
    log: 20,
    info: 30,
    warn: 40,
    error: 50,
    none: 9999, // No logging
  },
  debug(...args) {
    if (this.SEVERITY[this.level] <= this.SEVERITY.debug) {
      console.debug(this.prefix, ...args);
    }
  },
  log(...args) {
    if (this.SEVERITY[this.level] <= this.SEVERITY.log) {
      console.log(this.prefix, ...args);
    }
  },
  info(...args) {
    if (this.SEVERITY[this.level] <= this.SEVERITY.info) {
      console.info(this.prefix, ...args);
    }
  },
  warn(...args) {
    if (this.SEVERITY[this.level] <= this.SEVERITY.warn) {
      console.warn(this.prefix, ...args);
    }
  },
  error(...args) {
    if (this.SEVERITY[this.level] <= this.SEVERITY.error) {
      console.error(this.prefix, ...args);
    }
  },
  assert(condition, ...args) {
    if (!condition) {
      this.error(...args);
    }
  },
};

/**
 * Returns the value of the specified cookie.
 * @param {string} name
 * @returns {string|null} The cookie value or null if not found.
 */
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i].trim();
      if (cookie.substring(0, name.length + 1) === name + "=") {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}

/**
 * Applies the given prefix and splitter to the given text.
 * @param {string} text
 * @returns {string} The modified text.
 */
function applyStringModifiers(text) {
  const splitter = Alpine.store("ui").pathSplitter;
  const suffix = splitter ? text.split(splitter)[1] : text;
  const prefix = Alpine.store("ui").pathPrefix;
  return suffix ? prefix + suffix : prefix + text;
}

/**
 * Opens a file in VS Code based on attributes of the clicked element.
 * @param {HTMLElement} element
 * @returns {void}
 */
function openInVsCode(element) {
  const fileName = applyStringModifiers(element.getAttribute("file_name"));
  const lineNumber = element.getAttribute("line_number");

  const url = lineNumber ? `vscode://file/${fileName}:${lineNumber}` : `vscode://file/${fileName}`;

  const popup = window.open(url, "_blank");
  setTimeout(() => popup?.close(), 5000);
}

/**
 * Copies text content of an element to the clipboard.
 * @param {HTMLElement} element
 * @returns {void}
 */
function copyElementToClipboard(element) {
  const text = applyStringModifiers(element.textContent);

  navigator.clipboard
    .writeText(text)
    .then(() => {
      toast(`Copied to clipboard:\n${text}`, "success");
    })
    .catch((err) => {
      console.error("Could not copy text:", err);
    });
}

/**
 * Add optional word breaks to file paths in code blocks
 */
function addOptionalWordBreaks() {
  document.querySelectorAll("code").forEach((block) => {
    block.innerHTML = block.innerHTML.replaceAll(/\/(?!<wbr\/>)/g, "/<wbr/>");
  });
}
