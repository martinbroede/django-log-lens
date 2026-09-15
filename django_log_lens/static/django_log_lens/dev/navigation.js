/**
 * Gets the current search term from the UI store and finds all log lines that match it,
 * storing the matching elements in the searchResults array.
 */
function getSearchResults() {
  const searchTerm = Alpine.store("ui").searchTerm;
  const logFileElem = document.getElementById("pre-log-content");
  const lines = logFileElem.querySelectorAll("span[log-line]");
  const searchResults = Alpine.store("ui").searchResults;
  searchResults.length = 0;
  lines.forEach((lineElem) => {
    lineElem.classList.remove("search-highlight");
    if (searchTerm && lineElem.textContent.toLowerCase().includes(searchTerm.toLowerCase())) {
      searchResults.push(lineElem);
    }
  });
  logger.debug("Searching log source for term:", searchTerm, "/ Found results:", searchResults.length);
}

function onClickSearch() {
  const searchResults = Alpine.store("ui").searchResults;
  if (Alpine.store("ui").searchTerm.trim() === "") {
    toast("Please enter a search term", "error");
    return;
  }
  if (searchResults.length === 0) {
    getSearchResults(); // populate search results
    if (searchResults.length === 0) {
      if (Alpine.store("ui").searchTerm) toast("No matches", "error");
      return;
    }
  }
  pauseAutoRefresh();
  const nextIndex = nextSearchResult();
  toast(`Match #${nextIndex + 1}/${searchResults.length}`, "success", "bottom");
}

/**
 * Jumps to the next search result in the logs, highlighting it and scrolling it into view.
 * @returns The index of the current result
 */
function nextSearchResult() {
  const searchResults = Alpine.store("ui").searchResults;

  const currentIndex = searchResults.findIndex((elem) => elem.classList.contains("search-highlight"));
  let nextIndex = 0;

  if (currentIndex !== -1) {
    searchResults[currentIndex].classList.remove("search-highlight");
    nextIndex = (currentIndex + 1) % searchResults.length;
  }

  const nextElem = searchResults[nextIndex];
  nextElem.classList.add("search-highlight");
  const logWrapper = document.getElementById("div-pre-wrapper");
  logWrapper.scrollTop = nextElem.offsetTop - logWrapper.offsetTop;
  logger.debug(`Navigated to search result ${nextIndex + 1} of ${searchResults.length}`);
  return nextIndex;
}

/**
 * Scrolls to the top of the logs.
 */
function scrollToTop() {
  pauseAutoRefresh();
  document.getElementById("div-pre-wrapper").scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Scrolls to the bottom of the logs.
 */
function scrollToBottom() {
  const logWrapper = document.getElementById("div-pre-wrapper");
  logWrapper.scrollTo({ top: logWrapper.scrollHeight, behavior: "smooth" });
}

/**
 * Return all currently visible error elements in DOM order.
 * @returns {HTMLElement[]}
 */
function getErrorElements() {
  return Array.from(document.querySelectorAll("#pre-log-content span[id^='error-']"));
}

/**
 * Scroll to the next error in the logs.
 */
function gotoNextError() {
  pauseAutoRefresh();
  const uiStore = Alpine.store("ui");
  const errorElements = getErrorElements();
  const errorCount = errorElements.length;

  uiStore.errorCount = errorCount;
  if (errorCount === 0) {
    toast("No errors", "error");
    return;
  }

  uiStore.currentErrorIndex = (uiStore.currentErrorIndex + 1 + errorCount) % errorCount;
  gotoErrorNumber(uiStore.currentErrorIndex, errorElements);
}

/**
 * Scroll to the previous error in the logs.
 */
function gotoPrevError() {
  pauseAutoRefresh();
  const uiStore = Alpine.store("ui");
  const errorElements = getErrorElements();
  const errorCount = errorElements.length;

  uiStore.errorCount = errorCount;
  if (errorCount === 0) {
    toast("No errors", "error");
    return;
  }

  if (uiStore.currentErrorIndex < 0) {
    uiStore.currentErrorIndex = errorCount - 1;
  } else {
    uiStore.currentErrorIndex = (uiStore.currentErrorIndex - 1 + errorCount) % errorCount;
  }
  gotoErrorNumber(uiStore.currentErrorIndex, errorElements);
}

/**
 * Scroll to the latest error in the logs.
 */
function gotoLatestError() {
  pauseAutoRefresh();
  const uiStore = Alpine.store("ui");
  const errorElements = getErrorElements();
  const errorCount = errorElements.length;

  uiStore.errorCount = errorCount;
  if (errorCount === 0) {
    toast("No errors", "error");
    return;
  }

  uiStore.currentErrorIndex = errorCount - 1;
  gotoErrorNumber(uiStore.currentErrorIndex, errorElements);
}

/**
 * Scroll to a specific error number in the logs.
 * @param {number|string} errorNumber
 * @param {HTMLElement[]} [errorElements]
 */
function gotoErrorNumber(errorNumber, errorElements = null) {
  const elements = errorElements || getErrorElements();
  const parsedIndex = Number.parseInt(String(errorNumber), 10);
  if (Number.isNaN(parsedIndex) || elements.length === 0) {
    logger.error("Invalid or missing error number:", errorNumber);
    return;
  }

  const normalizedIndex = ((parsedIndex % elements.length) + elements.length) % elements.length;
  const lineElement = elements[normalizedIndex] || document.getElementById(`error-${normalizedIndex}`);
  const logWrapper = document.getElementById("div-pre-wrapper");
  if (lineElement) {
    Alpine.store("ui").currentErrorIndex = normalizedIndex;
    toast(`Error #${normalizedIndex + 1}/${elements.length}`, "error", "bottom");
    logWrapper.scrollTop = lineElement.offsetTop - logWrapper.offsetTop;
    lineElement.classList.add("search-highlight");
    setTimeout(() => {
      lineElement.classList.remove("search-highlight");
    }, 5000);
  } else {
    logger.error("No such error number:", normalizedIndex);
  }
}

/**
 * Go to a specific line number in the logs.
 * @param {number|string} lineNumber
 */
function gotoLine(lineNumber) {
  const lineElement = document.getElementById(`line-counter-${lineNumber}`);
  const logWrapper = document.getElementById("div-pre-wrapper");
  if (lineElement) {
    pauseAutoRefresh();
    logWrapper.scrollTop = lineElement.offsetTop - logWrapper.offsetTop;
    lineElement.classList.add("highlight");
    setTimeout(() => {
      lineElement.classList.remove("highlight");
    }, 3000);
  } else {
    toast("No such line number", "error");
  }
}
