/**
 * Select a log source to view.
 * When the same file is selected again, switch to the navigation tab.
 * @param {string} logSource
 */
function selectSource(logSource) {
  if (logSource === Alpine.store("ui").selectedLogSource) {
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

/*
 * General setup function to initialize Alpine.js store and related behaviors.
 */
function setUp() {
  document.addEventListener("alpine:init", () => {
    Alpine.store("ui", INITIAL_STATE);
    syncWithLocalStorage(SYNC_WITH_LOCAL_STORAGE_KEYS);
    handleAutoRefreshToggle();
    addOptionalWordBreaks();
    syncSelectedLogSource();
    mimicRouting();
    initNavScrollBehaviour();
    logger.info("Alpine.js initialized.");
  });
}

function pauseAutoRefresh() {
  if (Alpine.store("ui").autoRefresh) {
    Alpine.store("ui").autoRefresh = false;
    toast("Auto-Refresh Paused");
  }
}

/**
 * Clear the current search results in the Alpine.js store, typically called
 * when the log content is refreshed or a new log source is selected to ensure
 * that search results are relevant to the currently displayed log content.
 */
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
function syncSelectedLogSource() {
  Alpine.effect(() => {
    fetchLogSourceContent();
    addOptionalWordBreaks();
  });
}

/**
 * Fetch the log source content from the backend API
 * @param {boolean} showRefreshToast Whether to show a success toast after a successful refresh.
 * @returns {Promise<symbol>}
 */
async function fetchLogSourceContent(showRefreshToast = false) {
  const sourceName = Alpine.store("ui").selectedLogSource;
  if (!sourceName || sourceName === CONST.STRINGS.NONE_SELECTED) {
    return Promise.resolve(CONST.NOOP);
  }

  invalidateSearchResults();
  Alpine.store("ui").isLoading = true;
  const logData = await getLogFile(sourceName);

  if (!logData.success) {
    updateLogSourceViewState({
      content: markAsError(logData.content),
      shouldSwitchToNav: true,
    });
    if (logData.content === CONST.STRINGS.MSG_NO_LOG_DATA) {
      toast(CONST.STRINGS.MSG_NO_LOG_DATA, "error");
    } else if (logData.content === CONST.STRINGS.GENERIC_ERROR_MESSAGE) {
      toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
    }
    return Promise.resolve(CONST.ERROR);
  }

  const limitLinesTo = Alpine.store("ui").limitLinesTo;
  logRenderer = new LogRenderer(logData.content, limitLinesTo);
  logRenderer.renderLogContent();
  updateLogSourceViewState({
    content: logRenderer.getRenderedLogContent(),
    lines: logRenderer.generateLineNumbers(),
    errorCount: logRenderer.errorCounter,
    shouldSwitchToNav: !showRefreshToast,
  });
  if (showRefreshToast) {
    toast(CONST.STRINGS.REFRESH_SUCCESS_MESSAGE, "success");
  }
}

/**
 * Apply fetched source data to UI state and optionally switch to the navigation tab.
 * @param {{
 *   content: string,
 *   lines?: string,
 *   errorCount?: number,
 *   shouldSwitchToNav?: boolean,
 * }} params
 */
function updateLogSourceViewState({ content, lines = "", errorCount = 0, shouldSwitchToNav = false }) {
  const ui = Alpine.store("ui");
  const isFirstLoadedSource = !ui.hasLoadedLogSourceOnce;

  ui.logSource = { content, lines };
  ui.isLoading = false;
  ui.errorCount = errorCount;
  ui.hasLoadedLogSourceOnce = true;

  if (!isFirstLoadedSource && shouldSwitchToNav) {
    ui.activeTab = "nav";
  }
}

/**
 * Fetches the log source content from the backend API.
 * @param {string} pathToFile The path to the log source on the server.
 * @param {number} fromLine The line number to start fetching from.
 * @return {Promise<{content: string, success: boolean}>} Returns a promise that resolves to the log content including success status.
 */
async function getLogFile(pathToFile, fromLine = 0) {
  const fromLineParam = fromLine > 0 ? `?from=${fromLine}` : "";
  const url = `${LOG_FILE_API_ENDPOINT}/${encodeURIComponent(pathToFile)}/${fromLineParam}`;

  if (pathToFile && pathToFile !== CONST.STRINGS.NONE_SELECTED) {
    let resp = null;
    let success = true;
    const content = await fetch(url, {
      method: "GET",
      redirect: "error",
    })
      .then((response) => {
        resp = response;
        return response.text();
      })
      .then((content) => {
        if (resp.status != 200) {
          logger.error(`Failed to fetch log source (status:${resp.status})`);
          success = false;
          return Promise.resolve(CONST.STRINGS.GENERIC_ERROR_MESSAGE);
        }
        return Promise.resolve(content);
      })
      .catch((error) => {
        success = false;
        logger.error("Caught error while fetching log source:", error);
        return Promise.resolve(CONST.STRINGS.GENERIC_ERROR_MESSAGE);
      });
    return Promise.resolve({ content, success });
  } else {
    logger.debug("No log source selected, returning empty content.");
    return Promise.resolve({ content: "", success: true });
  }
}

/**
 * Clear the specified log source via the provided API URL.
 * @param {string} fileLocation The file location on the server.
 */
function clearLogFile(fileLocation) {
  const url = LOG_FILE_API_ENDPOINT + "/" + encodeURIComponent(fileLocation) + "/";
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
          Alpine.store("ui").selectedLogSource = CONST.STRINGS.NONE_SELECTED;
        }
        logger.debug("Log source cleared successfully.");
        toast("Log Source Cleared", "success");
      } else {
        toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE, "error");
        logger.error(`Failed to clear log source: ${response.status} - ${response.statusText}`);
      }
    })
    .catch((error) => {
      toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
      logger.error("Caught error while clearing log source:", error);
    });
}

/**
 * Show a toast message.
 * @param {string} message The message to display.
 * @param {'success' | 'error' | 'info' | 'warning' } type The type of toast.
 * @param {'center' | 'bottom'} placement The placement of the toast stack.
 * @param {number} timeout Duration in milliseconds before the toast disappears.
 */
function toast(message, type = "success", placement = "center", timeout = 3000) {
  Alpine.store("ui").toast.push(message, type, placement, timeout);
}

function setUpSSE() {
  const evtSource = new EventSource(SSE_API_ENDPOINT);

  evtSource.onerror = function (e) {
    logger.error("SSE connection error:", e);
    evtSource.close();
  };

  evtSource.onmessage = async function (e) {
    logger.debug("SSE message received:", e.data);
    const autoRefresh = Alpine.store("ui").autoRefresh;
    if (!autoRefresh) {
      evtSource.close();
      return;
    }
    try {
      const jsonData = JSON.parse(e.data);
      if (jsonData.action === "rotate" && jsonData.source === Alpine.store("ui").selectedLogSource) {
        fetchLogSourceContent();
      } else if (
        jsonData.action === "append" &&
        jsonData.source === Alpine.store("ui").selectedLogSource &&
        logRenderer
      ) {
        const logData = await getLogFile(jsonData.source, logRenderer.totalLines);
        if (logData.success) {
          logRenderer.appendLogContent(logData.content);
          const content = logRenderer.getRenderedLogContent();
          const lineNumbers = logRenderer.generateLineNumbers();
          invalidateSearchResults();
          updateLogSourceViewState({
            content,
            lines: lineNumbers,
            errorCount: logRenderer.errorCounter,
            shouldSwitchToNav: false,
          });
        } else {
          evtSource.close();
          logger.info("SSE connection closed due to failed log fetch after append.");
        }
        scrollToBottom();
      }
    } catch (err) {
      logger.error("Failed to parse SSE data:", err);
    }
  };
  return evtSource;
}

/**
 * Function to be called when the refresh status changes.
 */
function handleAutoRefreshToggle() {
  let evtSource = null;
  let isFirstEffectRun = true;
  let previousAutoRefreshValue = Alpine.store("ui").autoRefresh;

  Alpine.effect(() => {
    const autoRefresh = Alpine.store("ui").autoRefresh;

    if (isFirstEffectRun) {
      isFirstEffectRun = false;
      previousAutoRefreshValue = autoRefresh;
      if (autoRefresh) {
        evtSource = setUpSSE();
        fetchLogSourceContent(false);
      }
      return;
    }

    if (autoRefresh === previousAutoRefreshValue) {
      return;
    }

    if (autoRefresh) {
      evtSource = setUpSSE();
      fetchLogSourceContent(true);
      toast("Auto-Refresh Enabled");
      logger.info("Auto-refresh enabled, SSE connection established.");
    } else {
      toast("Auto-Refresh Paused");
      if (evtSource) {
        evtSource.close();
        evtSource = null;
        logger.debug("SSE connection closed.");
      }
    }

    previousAutoRefreshValue = autoRefresh;
  });
}

setUp();
