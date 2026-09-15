/**
 * Escape HTML special characters so that raw log text can safely be inserted via x-html.
 * @param {string} text
 * @returns {string} The escaped text.
 */
function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Escape the given log line and wrap every occurrence of the search term in a <mark>.
 * Both the line and the term are escaped first, so the offsets found in the escaped
 * haystack are valid for the escaped text as well.
 * @param {string} text The raw log line.
 * @param {string} term The search term.
 * @param {boolean} caseSensitive Whether the term was matched case-sensitively.
 * @returns {string} Escaped HTML with highlighted matches.
 */
function highlightSearchTerm(text, term, caseSensitive) {
  const escapedText = escapeHtml(text);
  const escapedTerm = escapeHtml(term);
  if (!escapedTerm) {
    return escapedText;
  }

  const haystack = caseSensitive ? escapedText : escapedText.toLowerCase();
  const needle = caseSensitive ? escapedTerm : escapedTerm.toLowerCase();

  if (haystack.length !== escapedText.length || needle.length !== escapedTerm.length) {
    return escapedText; // case folding changed the length: offsets can no longer be trusted
  }

  let highlighted = "";
  let cursor = 0;
  let index = haystack.indexOf(needle, cursor);

  while (index !== -1) {
    highlighted += escapedText.slice(cursor, index);
    highlighted += `<mark>${escapedText.slice(index, index + needle.length)}</mark>`;
    cursor = index + needle.length;
    index = haystack.indexOf(needle, cursor);
  }

  return highlighted + escapedText.slice(cursor);
}

/**
 * Turn a `[line, text]` pair from the search API into a renderable match, reusing the
 * log renderer's level detection so that a match is colored like the log view colors it.
 * @param {[number, string]} match
 * @param {string} term
 * @param {boolean} caseSensitive
 * @param {LogRenderer} levelProbe A renderer instance used only for level detection.
 * @returns {{line: number, levelClass: string, html: string}}
 */
function toSearchMatch(match, term, caseSensitive, levelProbe) {
  const [line, text] = match;
  const levelInfo = levelProbe.extractNumericLevel(text) || levelProbe.extractTextLevel(text);
  const strippedText = levelInfo ? text.replace(levelInfo.stripPrefix, "") : text;

  return {
    line,
    levelClass: levelInfo ? levelInfo.spanClass : "",
    html: highlightSearchTerm(strippedText, term, caseSensitive),
  };
}

/**
 * Build the summary line shown above the search results.
 * @param {object} data The search API response.
 * @returns {string} The summary.
 */
function buildSearchSummary(data) {
  if (data.total_matches === 0) {
    return `No matches for "${data.term}" in ${data.sources_total} log source(s).`;
  }

  const sources = `${data.results.length} of ${data.sources_total} log source(s)`;
  const summary = `${data.total_matches} match(es) for "${data.term}" in ${sources}.`;
  return data.limit_reached ? `${summary} The result limit was reached - refine your search term.` : summary;
}

/**
 * Search all log sources on the server for the current global search term
 * and store the results in the Alpine.js store.
 * @returns {Promise<symbol>}
 */
async function runGlobalSearch() {
  const ui = Alpine.store("ui");
  const term = ui.globalSearchTerm.trim();

  if (!term) {
    toast("Please enter a search term", "error");
    return Promise.resolve(CONST.NOOP);
  }

  const params = new URLSearchParams({
    q: term,
    case_sensitive: String(ui.globalSearchCaseSensitive),
  });

  ui.isSearching = true;

  try {
    const response = await fetch(`${SEARCH_API_ENDPOINT}?${params}`, { method: "GET", redirect: "error" });
    if (response.status !== 200) {
      logger.error(`Failed to search log sources (status:${response.status})`);
      toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
      return Promise.resolve(CONST.ERROR);
    }

    const data = await response.json();
    const levelProbe = new LogRenderer("");

    ui.globalSearchResults = data.results.map((result) => ({
      ...result,
      matches: result.matches.map((match) => toSearchMatch(match, data.term, data.case_sensitive, levelProbe)),
    }));
    ui.globalSearchSummary = buildSearchSummary(data);

    logger.debug("Searched all log sources for term:", data.term, "/ Found results:", data.total_matches);

    if (data.total_matches === 0) {
      toast(CONST.STRINGS.NO_MATCHES, "error");
    } else {
      toast(`${data.total_matches} Match(es)`, "success");
    }

    return Promise.resolve(CONST.SUCCESS);
  } catch (error) {
    logger.error("Caught error while searching log sources:", error);
    toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
    return Promise.resolve(CONST.ERROR);
  } finally {
    ui.isSearching = false;
  }
}

/**
 * Load the log source a search match belongs to and jump to the matching line.
 * @param {string} source The log source the match was found in.
 * @param {number} lineNumber The line number of the match.
 */
function openSearchMatch(source, lineNumber) {
  const ui = Alpine.store("ui");
  pauseAutoRefresh();
  ui.pendingJumpToLine = lineNumber;

  if (ui.selectedLogSource === source) {
    ui.activeTab = "nav";
    applyPendingJumpToLine();
  } else {
    ui.selectedLogSource = source; // triggers a fetch, which applies the pending jump
  }
}

/**
 * Jump to the line stored by openSearchMatch(), if any. Called once the log source has
 * been rendered. Because the requested line may have been cut off by the configured line
 * limit, a missing line is reported as such instead of being treated as an error.
 */
function applyPendingJumpToLine() {
  const ui = Alpine.store("ui");
  const lineNumber = ui.pendingJumpToLine;

  if (!lineNumber) {
    return;
  }
  ui.pendingJumpToLine = null;

  setTimeout(() => {
    if (document.getElementById(`line-counter-${lineNumber}`)) {
      gotoLine(lineNumber);
    } else {
      toast(
        `Line ${lineNumber} is not loaded. The file might have been truncated by the configured line limit or
        it has been rotated in the meantime.`,
        "warning",
        "bottom",
        8000,
      );
    }
  }, 100);
}
