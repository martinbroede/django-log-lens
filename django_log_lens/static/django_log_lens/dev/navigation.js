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

function nextSearchResult() {
  const searchResults = Alpine.store("ui").searchResults;

  if (searchResults.length === 0) {
    getSearchResults();
  }

  if (searchResults.length === 0) {
    if (Alpine.store("ui").searchTerm) toast("No results", 1000, "error");
    return;
  }

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
}

/**
 * Scrolls to the top of the logs.
 */
function scrollToTop() {
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
 * Scroll to the next error in the logs.
 */
function gotoNextError() {
  const uiStore = Alpine.store("ui");
  uiStore.currentErrorIndex = (uiStore.currentErrorIndex + 1) % uiStore.errorCount;
  gotoErrorNumber(uiStore.currentErrorIndex);
}

/**
 * Scroll to the previous error in the logs.
 */
function gotoPrevError() {
  const uiStore = Alpine.store("ui");
  uiStore.currentErrorIndex =
    uiStore.currentErrorIndex < 0 ? 0 : (uiStore.currentErrorIndex - 1 + uiStore.errorCount) % uiStore.errorCount;
  gotoErrorNumber(uiStore.currentErrorIndex);
}

/**
 * Scroll to the latest error in the logs.
 */
function gotoLatestError() {
  const uiStore = Alpine.store("ui");
  uiStore.currentErrorIndex = uiStore.errorCount - 1;
  gotoErrorNumber(uiStore.currentErrorIndex);
}

/**
 * Scroll to a specific error number in the logs.
 * @param {number|string} errorNumber
 */
function gotoErrorNumber(errorNumber) {
  const lineElement = document.getElementById(`error-${errorNumber}`);
  const logWrapper = document.getElementById("div-pre-wrapper");
  if (lineElement) {
    logWrapper.scrollTop = lineElement.offsetTop - logWrapper.offsetTop;
    lineElement.classList.add("search-highlight");
    setTimeout(() => {
      lineElement.classList.remove("search-highlight");
    }, 5000);
  } else {
    logger.error("No such error number:", errorNumber);
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
    logWrapper.scrollTop = lineElement.offsetTop - logWrapper.offsetTop;
    lineElement.classList.add("highlight");
    setTimeout(() => {
      lineElement.classList.remove("highlight");
    }, 3000);
  } else {
    toast("No such line number", 1000, "error");
  }
}
