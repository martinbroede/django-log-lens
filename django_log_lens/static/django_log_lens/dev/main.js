/** @type {any} */ globalThis.Alpine;

const API_ENDPOINT = document
  .querySelectorAll("script[data-log-file-api-endpoint]")[0]
  .getAttribute("data-log-file-api-endpoint");
/** Threshold for number of lines to render immediately */

const REFRESH_SUCCESS_MESSAGE = "Refreshed Contents";

const MSG_NO_LOG_DATA = "NO LOG DATA AVAILABLE (FILE NOT FOUND)"; // reconcile with backend constant

const MISCONFIGURATION = "MISCONFIGURATION"; // reconcile with backend constant

const GENERIC_ERROR_MESSAGE =
  "An error occurred while processing your request. Please check the console for more details.";

const GENERIC_ERROR_MESSAGE_SHORT = "An Error Occurred. Please Check Console.";

const INITIAL_LOG_SOURCE = { content: "", lines: "" };

const NONE_SELECTED = "NONE SELECTED";

/**
 * List of keys in the Alpine.js store to synchronize with localStorage
 * so that user preferences persist across sessions.
 */
const SYNC_WITH_LOCAL_STORAGE_KEYS = [
  "fullWidth",
  "autoRefresh",
  "refreshInterval",
  "selectedLogSource",
  "searchTerm",
  "limitLinesTo",
  "pathPrefix",
  "pathSplitter",
];

/**
 * Initial state for the Alpine.js store managing the UI state.
 */
const INITIAL_STATE = {
  activeTab: getTabFromHash() || "sources",
  autoRefresh: localStorage.getItem("autoRefresh") === "true",
  currentErrorIndex: -1,
  errorCount: 0,
  fullWidth: localStorage.getItem("fullWidth") === "true",
  isInitialLoad: true,
  isLoading: false,
  limitLinesTo: localStorage.getItem("limitLinesTo") || 1000,
  logSource: INITIAL_LOG_SOURCE,
  refreshInterval: localStorage.getItem("refreshInterval") || 30,
  searchResults: [],
  searchTerm: localStorage.getItem("searchTerm") || "",
  selectedForClearing: NONE_SELECTED,
  selectedLogSource: localStorage.getItem("selectedLogSource") || NONE_SELECTED,
  pathPrefix: localStorage.getItem("pathPrefix") || "",
  pathSplitter: localStorage.getItem("pathSplitter") || "",
  toast: {
    items: [],
    push(message, timeout = 2000, type = "success") {
      this.items.push({ message, type });
      setTimeout(() => this.items.shift(), timeout);
    },
  },
};

/**
 * Select a log source to view.
 * When the same file is selected again, switch to the navigation tab.
 * @param {string} logSource
 */
function selectSource(logSource) {
  if (logSource == Alpine.store("ui").selectedLogSource) {
    Alpine.store("ui").activeTab = "nav";
  } else {
    Alpine.store("ui").selectedLogSource = logSource;
  }
}

/**
 * Synchronize properties in Alpine.js store with localStorage.
 * @param {string[]} keys The key to sync.
 */
function syncWithLocalStorage(keys) {
  keys.forEach((key) => {
    Alpine.effect(() => {
      localStorage.setItem(key, Alpine.store("ui")[key]);
    });
  });
}

/**
 * Scroll to the article 'navigation' when the navigation tab is activated.
 */
function initNavScrollBehaviour() {
  Alpine.effect(() => {
    if (Alpine.store("ui").activeTab === "nav") {
      setTimeout(() => {
        const navElement = document.getElementById("div-navigation-buttons");
        navElement.scrollIntoView({ behavior: "smooth" });
      }, 250);
    }
  });
}

/**
 * Extract the tab name from the URL hash.
 * @returns {string|null} The tab name or null if not found.
 */
function getTabFromHash() {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) {
    return hash.slice(2);
  }
  return null;
}

/**
 * Mimic routing by updating the URL hash based on the active tab
 * and updating the active tab based on the URL hash.
 */
function mimicRouting() {
  Alpine.effect(() => {
    const tab = Alpine.store("ui").activeTab;
    window.location.hash = `#/${tab}`;
  });
  window.addEventListener("hashchange", () => {
    const tab = getTabFromHash();
    if (tab) {
      Alpine.store("ui").activeTab = tab;
    }
  });
}

/**
 * Set up Alpine.js store and effects for managing UI state.
 * - activeTab: The currently active tab in the UI.
 * - selectedLogSource: The currently selected log source.
 * - logSource: The content and metadata of the selected log source.
 */
function setUpAlpine() {
  document.addEventListener("alpine:init", () => {
    Alpine.store("ui", INITIAL_STATE);
    syncWithLocalStorage(SYNC_WITH_LOCAL_STORAGE_KEYS);
    addOptionalWordBreaks();
    syncSelectedLogSource();
    mimicRouting();
    initNavScrollBehaviour();
    initAutoRefresh();
    logger.info("Alpine.js initialized.");
  });
}

function initAutoRefresh() {
  let refreshInterval = parseInt(Alpine.store("ui").refreshInterval);
  if (isNaN(refreshInterval) || refreshInterval < 1) {
    refreshInterval = 30;
  }
  setTimeout(() => {
    setTimeout(initAutoRefresh, (refreshInterval * 1000) / 2);
    if (Alpine.store("ui").autoRefresh) {
      fetchLogSourceContent(true);
      logger.debug("Auto-refreshed log source.");
    }
  }, (refreshInterval * 1000) / 2);
}

function invalidateSearchResults() {
  Alpine.store("ui").searchResults.length = 0;
}

/**
 * Wrap the given content in a span so that it is highlighted as an error.
 * @param {string} content
 * @returns {string} The content wrapped in a highlighted span.
 */
function markAsError(content) {
  return `<span class="error">${content}</span>`;
}

/**
 * Sync the selected log source in the Alpine.js store with the backend
 * when it changes.
 */
async function syncSelectedLogSource() {
  Alpine.effect(async () => {
    fetchLogSourceContent();
    addOptionalWordBreaks();
  });
}

/**
 * Fetch the log source content from the backend API
 * @param {boolean} forceReload Wether to force reload the log source content -shows a toast on success.
 * @returns {Promise<void>}
 */
async function fetchLogSourceContent(forceReload = false) {
  const sourceName = Alpine.store("ui").selectedLogSource;
  if (!sourceName || sourceName === NONE_SELECTED) {
    return;
  }

  invalidateSearchResults();
  Alpine.store("ui").isLoading = true;
  const logSource = await getLogFile(sourceName);

  switch (logSource) {
    case MISCONFIGURATION: {
      const err = markAsError(
        MISCONFIGURATION + " - Please review your LOGGING settings<br/>in your settings.py file."
      );
      onAfterFetchLogSourceContent(err);
      return;
    }
    case MSG_NO_LOG_DATA: {
      const err = markAsError(MSG_NO_LOG_DATA);
      toast(MSG_NO_LOG_DATA, 3000, "error");
      onAfterFetchLogSourceContent(err);
      return;
    }
    case GENERIC_ERROR_MESSAGE: {
      const err = markAsError(GENERIC_ERROR_MESSAGE);
      toast(GENERIC_ERROR_MESSAGE_SHORT, 3000, "error");
      onAfterFetchLogSourceContent(err);
      return;
    }
    default: {
      const limitLinesTo = Alpine.store("ui").limitLinesTo;
      const renderer = new LogRenderer(logSource, limitLinesTo);
      renderer.renderLogContent();
      renderer.appendLogContent("bar\nbaz\nfoo\n");
      const content = renderer.getRenderedLogContent();
      const lineNumbers = renderer.generateLineNumbers();
      onAfterFetchLogSourceContent(content, lineNumbers, renderer.errorCounter, forceReload);
      if (forceReload) {
        toast(REFRESH_SUCCESS_MESSAGE, 1000, "success");
      }
    }
  }
}

/**
 *
 * @param {string} content
 * @param {*} lines
 * @param {*} errorCount
 * @param {*} forceReload
 */
function onAfterFetchLogSourceContent(content, lines = "", errorCount = 0, forceReload = false) {
  Alpine.store("ui").logSource = { content, lines };
  Alpine.store("ui").isLoading = false;
  Alpine.store("ui").errorCount = errorCount;
  if (Alpine.store("ui").isInitialLoad) {
    Alpine.store("ui").isInitialLoad = false;
  } else if (!forceReload) {
    Alpine.store("ui").activeTab = "nav";
  }
}

/**
 * Fetches the log source content from the backend API.
 * @param {string} pathToFile The path to the log source on the server.
 */
async function getLogFile(pathToFile) {
  const url = API_ENDPOINT + "/" + encodeURIComponent(pathToFile) + "/";

  if (pathToFile && pathToFile !== NONE_SELECTED) {
    let resp = null;
    return await fetch(url)
      .then((response) => {
        resp = response;
        return response.text();
      })
      .then((logSource) => {
        if (!resp.ok) {
          logger.error(`Failed to fetch log source (${resp.status}):\n${logSource}`);
          return GENERIC_ERROR_MESSAGE;
        }
        return Promise.resolve(logSource);
      })
      .catch((error) => {
        logger.error("Caught error while fetching log source:", error);
        return Promise.resolve(GENERIC_ERROR_MESSAGE);
      });
  } else {
    logger.debug("No log source selected, returning empty content.");
    return Promise.resolve("");
  }
}

/**
 * Clear the specified log source via the provided API URL.
 * @param {string} fileLocation The file location on the server.
 */
function clearLogFile(fileLocation) {
  const url = API_ENDPOINT + "/" + encodeURIComponent(fileLocation) + "/";
  fetch(url, {
    method: "DELETE",
    headers: {
      "X-CSRFToken": getCookie("csrftoken"),
    },
  })
    .then((response) => {
      if (response.ok) {
        logger.info(`Successfully cleared log source via ${fileLocation}`);
        const selectedLogSource = Alpine.store("ui").selectedLogSource;
        if (fileLocation === selectedLogSource) {
          Alpine.store("ui").logSource = INITIAL_LOG_SOURCE;
          Alpine.store("ui").selectedLogSource = NONE_SELECTED;
        }
        logger.debug("Log source cleared successfully.");
        toast("Log Source Cleared", 2000, "success");
      } else {
        toast(GENERIC_ERROR_MESSAGE_SHORT, 3000, "error");
        logger.error(`Failed to clear log source: ${response.status} - ${response.statusText}`);
      }
    })
    .catch((error) => {
      toast(GENERIC_ERROR_MESSAGE_SHORT, 3000, "error");
      logger.error("Caught error while clearing log source:", error);
    });
}

/**
 * Show a toast message.
 * @param {string} message The message to display.
 * @param {number} timeout Duration in milliseconds before the toast disappears.
 * @param {'success' | 'error' } type The type of toast ("success" or "error").
 */
function toast(message, timeout = 2000, type = "success") {
  Alpine.store("ui").toast.push(message, timeout, type);
}

setUpAlpine();
