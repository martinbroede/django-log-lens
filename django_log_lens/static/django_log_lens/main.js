/** @type {any} */ globalThis.Alpine;

const NONE_SELECTED = "NONE SELECTED";
const INITIAL_STATE = {
  activeTab: localStorage.getItem("activeTab") || "files",
  selectedLogFile: localStorage.getItem("selectedLogFile") || NONE_SELECTED,
  logFile: {
    timestamp: -1,
    content: "",
    lines: "",
  },
  state: {
    isLoading: false,
    fullWidth: localStorage.getItem("fullWidth") === "true",
  },
};

const logger = {
  prefix: "[Django Log Lens]",
  level: new URLSearchParams(window.location.search).get("loglevel") || "error",
  SEVERITY: {
    debug: 10,
    log: 20,
    info: 30,
    warn: 40,
    error: 50,
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
  }
};


/**
 * Go to a specific line number in the log file display.
 * @param {number|string} lineNumber
 */
function gotoLine(lineNumber) {
  const lineElement = document.getElementById(`line-${lineNumber}`);
  const logWrapper = document.getElementById("div-pre-wrapper");
  if (lineElement) {
    logWrapper.scrollTop = lineElement.offsetTop - logWrapper.offsetTop;
    lineElement.classList.add("highlight");
    setTimeout(() => {
      lineElement.classList.remove("highlight");
    }, 2000);
  }
}

/**
 * Initialize the Alpine.js store with default values.
 */
function initAlpineStore() {
  Alpine.store("ui", {
    ...INITIAL_STATE,
  });
}

/**
 * Scrolls to the top of the logfile content.
 */
function scrollToTop() {
  document.getElementById("div-pre-wrapper").scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Scrolls to the bottom of the logfile content.
 */
function scrollToBottom() {
  const logWrapper = document.getElementById("div-pre-wrapper");
  logWrapper.scrollTo({ top: logWrapper.scrollHeight, behavior: "smooth" });
}

/**
 * Synchronize a property in Alpine.js store with localStorage.
 * @param {string} key The localStorage key to sync with.
 * @param {() => any} getProperty An Alpine.js store function that returns the property to sync.
 */
function syncWithLocalStorage(key, getProperty) {
  Alpine.effect(() => {
    localStorage.setItem(key, getProperty());
  });
}

/**
 * Move to navigation tab after choosing a file.
 */
function closeFileView() {
  Alpine.store("ui").state.isLoading = true;
  setTimeout(() => {
    Alpine.store("ui").activeTab = "nav";
    Alpine.store("ui").state.isLoading = false;
  }, 750);
}

/**
 * Scroll to the article navigation when the navigation tab is activated.
 */
function initScrollBehaviour() {
  Alpine.effect(() => {
    if (Alpine.store("ui").activeTab === "nav") {
      setTimeout(() => {
        const navElement = document.getElementById("article-navigation");
        navElement.scrollIntoView({ behavior: "smooth" });
      }, 250);
    }
  });
}

/**
 * Set up Alpine.js store and effects for managing UI state.
 * - activeTab: The currently active tab in the UI.
 * - selectedLogFile: The currently selected log file.
 * - logFile: The content and metadata of the selected log file.
 */
function setUpAlpine() {
  document.addEventListener("alpine:init", () => {
    initAlpineStore();
    syncWithLocalStorage("fullWidth", () => Alpine.store("ui").state.fullWidth);
    syncWithLocalStorage("activeTab", () => Alpine.store("ui").activeTab);
    syncWithLocalStorage("selectedLogFile", () => Alpine.store("ui").selectedLogFile);
    initScrollBehaviour();

    Alpine.effect(() => {
      const fileName = Alpine.store("ui").selectedLogFile;
      if (fileName && fileName !== NONE_SELECTED) {
        fetch(`/logs/api/files/${encodeURIComponent(fileName)}/`)
          .then((response) => response.json())
          .then((data) => {
            data.lines = generateLineNumbers(data.content.split("\n").length);
            data.content = renderLogFileContent(data.content);
            Alpine.store("ui").logFile = data;
          });
      } else {
        Alpine.store("ui").logFile = "";
      }
    });
    logger.info("Alpine.js initialized.");
  });
}

/**
 * Generate line numbers from 1 to count, each on a new line with span elements
 * that have corresponding IDs. (e.g., id="line-42")
 * @param {number} count
 * @returns {string} Line numbers as a newline-separated string.
 */
function generateLineNumbers(count) {
  return Array.from({ length: count }, (_, i) => `<span id="line-${i + 1}">${i + 1}</span>`).join("\n");
}

setUpAlpine();
