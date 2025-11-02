/** @type {any} */ globalThis.Alpine;

const NONE_SELECTED = "NONE SELECTED";

/**
 * Searches and highlights a specific line number in the log content.
 * @param {number|string} lineNumber
 */
function searchLine(lineNumber) {
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
  const logContainer = document.getElementById("div-pre-wrapper");
  logContainer.scrollTo({ top: logContainer.scrollHeight, behavior: "smooth" });
}

/**
 * Synchronize a property in Alpine.js store with localStorage.
 * @param {string} key The localStorage key to sync with.
 * @param {*} getProperty A function that returns the property to sync.
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

function scrollToNavAfterPress() {
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
    scrollToNavAfterPress();

    Alpine.effect(() => {
      const fileName = Alpine.store("ui").selectedLogFile;
      if (fileName && fileName !== NONE_SELECTED) {
        fetch(`/logs/api/files/${encodeURIComponent(fileName)}/`)
          .then((response) => response.json())
          .then((data) => {
            data.lines = generateLineNumbers(data.content.split("\n").length);
            data.content = renderLogFileContent(data.content);
            Alpine.store("ui").logFile = data;
            console.log("Fetched log file:", fileName);
          });
      } else {
        Alpine.store("ui").logFile = "";
      }
    });
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
