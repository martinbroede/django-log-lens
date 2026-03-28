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
    toast("Auto-Refresh Paused", "info");
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
 * Check if a log source is currently selected.
 * @returns {boolean} True if a valid log source is selected.
 */
function isValidLogSourceSelected() {
  const sourceName = Alpine.store("ui").selectedLogSource;
  return sourceName && sourceName !== CONST.STRINGS.NONE_SELECTED;
}

/**
 * Handle fetch errors by updating the UI and showing appropriate toast messages.
 * @param {string} errorContent The error message content.
 */
function handleLogSourceFetchError(errorContent) {
  updateLogSourceViewState({
    content: markAsError(errorContent),
    shouldSwitchToNav: true,
  });

  if (errorContent === CONST.STRINGS.MSG_NO_LOG_DATA) {
    toast(CONST.STRINGS.MSG_NO_LOG_DATA, "error");
  } else if (errorContent === CONST.STRINGS.GENERIC_ERROR_MESSAGE) {
    toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
  }
}

/**
 * Render log content and update the UI state.
 * @param {string} logContent The raw log content.
 * @param {boolean} showRefreshToast Whether to show a success toast.
 */
function renderAndUpdateLogSource(logContent, showRefreshToast) {
  const limitLinesTo = Alpine.store("ui").limitLinesTo;
  logRenderer = new LogRenderer(logContent, limitLinesTo);
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
  if (!isValidLogSourceSelected()) {
    return Promise.resolve(CONST.NOOP);
  }

  invalidateSearchResults();
  Alpine.store("ui").isLoading = true;
  const logData = await getLogFile(Alpine.store("ui").selectedLogSource);

  if (!logData.success) {
    handleLogSourceFetchError(logData.content);
    return Promise.resolve(CONST.ERROR);
  }

  renderAndUpdateLogSource(logData.content, showRefreshToast);
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
 * Build the API URL for fetching a log file.
 * @param {string} pathToFile The path to the log source on the server.
 * @param {number} fromLine The line number to start fetching from.
 * @returns {string} The constructed API URL.
 */
function buildLogFileUrl(pathToFile, fromLine = 0) {
  const fromLineParam = fromLine > 0 ? `?from=${fromLine}` : "";
  return `${LOG_FILE_API_ENDPOINT}/${encodeURIComponent(pathToFile)}/${fromLineParam}`;
}

/**
 * Handle the response from a log file fetch, including status validation.
 * @param {Response} response The fetch response object.
 * @param {string} content The response content.
 * @param {object} state Object to store success status.
 * @returns {Promise<string>} The log content or error message.
 */
async function handleLogFileFetchResponse(response, content, state) {
  if (response.status !== 200) {
    logger.error(`Failed to fetch log source (status:${response.status})`);
    state.success = false;
    return Promise.resolve(CONST.STRINGS.GENERIC_ERROR_MESSAGE);
  }
  return Promise.resolve(content);
}

/**
 * Fetches the log source content from the backend API.
 * @param {string} pathToFile The path to the log source on the server.
 * @param {number} fromLine The line number to start fetching from.
 * @return {Promise<{content: string, success: boolean}>} Returns a promise that resolves to the log content including success status.
 */
async function getLogFile(pathToFile, fromLine = 0) {
  if (!pathToFile || pathToFile === CONST.STRINGS.NONE_SELECTED) {
    logger.debug("No log source selected, returning empty content.");
    return Promise.resolve({ content: "", success: true });
  }

  const url = buildLogFileUrl(pathToFile, fromLine);
  let success = true;

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
    });
    const content = await response.text();
    const state = { success };
    const resultContent = await handleLogFileFetchResponse(response, content, state);
    return Promise.resolve({ content: resultContent, success: state.success });
  } catch (error) {
    logger.error("Caught error while fetching log source:", error);
    return Promise.resolve({ content: CONST.STRINGS.GENERIC_ERROR_MESSAGE, success: false });
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

/**
 * Handle SSE rotate event by fetching the entire log source content.
 */
async function handleSSERotateAction() {
  await fetchLogSourceContent();
}

/**
 * Handle SSE append event by fetching new lines and updating the renderer.
 * @param {EventSource} evtSource The EventSource connection.
 * @param {string} source The log source identifier.
 * @returns {Promise<boolean>} True if append succeeded, false otherwise.
 */
async function handleSSEAppendAction(evtSource, source) {
  if (!logRenderer) {
    return false;
  }

  const logData = await getLogFile(source, logRenderer.totalLines);
  if (!logData.success) {
    evtSource.close();
    logger.info("SSE connection closed due to failed log fetch after append.");
    return false;
  }

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
  scrollToBottom();
  return true;
}

/**
 * Handle incoming SSE message and dispatch to appropriate action handler.
 * @param {EventSource} evtSource The EventSource connection.
 * @param {string} data The SSE message data (JSON string).
 */
async function handleSSEMessage(evtSource, data) {
  logger.debug("SSE message received:", data);
  const autoRefresh = Alpine.store("ui").autoRefresh;
  if (!autoRefresh) {
    evtSource.close();
    return;
  }

  try {
    const jsonData = JSON.parse(data);
    const selectedSource = Alpine.store("ui").selectedLogSource;

    if (jsonData.action === "rotate" && jsonData.source === selectedSource) {
      await handleSSERotateAction();
    } else if (jsonData.action === "append" && jsonData.source === selectedSource) {
      await handleSSEAppendAction(evtSource, jsonData.source);
    }
  } catch (err) {
    logger.error("Failed to parse SSE data:", err);
  }
}

/**
 * Set up Server-Sent Events (SSE) connection for auto-refresh functionality.
 * @returns {EventSource} The EventSource connection.
 */
function setUpSSE() {
  const evtSource = new EventSource(SSE_API_ENDPOINT);

  evtSource.onerror = function (e) {
    logger.error("SSE connection error:", e);
    evtSource.close();
  };

  evtSource.onmessage = async function (e) {
    await handleSSEMessage(evtSource, e.data);
  };

  return evtSource;
}

/**
 * Enable auto-refresh by starting SSE connection and fetching latest content.
 * @param {object} refs Object to store the ESE connection reference.
 */
function enableAutoRefresh(refs) {
  toast("Auto-Refresh Enabled");
  refs.evtSource = setUpSSE();
  fetchLogSourceContent(true);
  logger.info("Auto-refresh enabled, SSE connection established.");
}

/**
 * Disable auto-refresh by closing the SSE connection.
 * @param {object} refs Object storing the EventSource connection reference.
 */
function disableAutoRefresh(refs) {
  toast("Auto-Refresh Paused", "info");
  if (refs.evtSource) {
    refs.evtSource.close();
    refs.evtSource = null;
    logger.debug("SSE connection closed.");
  }
}

/**
 * Function to be called when the refresh status changes.
 */
function handleAutoRefreshToggle() {
  const refs = { evtSource: null };
  let isFirstEffectRun = true;
  let previousAutoRefreshValue = Alpine.store("ui").autoRefresh;

  Alpine.effect(() => {
    const autoRefresh = Alpine.store("ui").autoRefresh;

    if (isFirstEffectRun) {
      isFirstEffectRun = false;
      previousAutoRefreshValue = autoRefresh;
      if (autoRefresh) {
        enableAutoRefresh(refs);
      }
      return;
    }

    if (autoRefresh === previousAutoRefreshValue) {
      return;
    }

    if (autoRefresh) {
      enableAutoRefresh(refs);
    } else {
      disableAutoRefresh(refs);
    }

    previousAutoRefreshValue = autoRefresh;
  });
}

setUp();
