/** @type {any} */ globalThis.Alpine;

let logRenderer = null;

const LOG_FILE_API_ENDPOINT = document
  .querySelectorAll("script[data-log-file-api-endpoint]")[0]
  .getAttribute("data-log-file-api-endpoint");

const SSE_API_ENDPOINT = document
  .querySelectorAll("script[data-sse-api-endpoint]")[0]
  .getAttribute("data-sse-api-endpoint");

const SEARCH_API_ENDPOINT = document
  .querySelectorAll("script[data-search-api-endpoint]")[0]
  .getAttribute("data-search-api-endpoint");

const ARCHIVE_API_ENDPOINT = document
  .querySelectorAll("script[data-archive-api-endpoint]")[0]
  .getAttribute("data-archive-api-endpoint");

const INITIAL_LOG_SOURCE = { content: "", lines: "" };

const TOAST_EXIT_ANIMATION_MS = 1300;

const CONST = Object.freeze({
  SUCCESS: Symbol("Success"),
  ERROR: Symbol("Error"),
  NOOP: Symbol("No Operation"),
  STRINGS: {
    // reconcile with backend logic when indicated
    MSG_NO_LOG_DATA: "NO LOG DATA AVAILABLE (FILE NOT FOUND)",
    GENERIC_ERROR_MESSAGE:
      "An error occurred while processing your request. Please check the console for more details.",
    GENERIC_ERROR_MESSAGE_SHORT: "An Error Occurred. Please Check Console.",
    REFRESH_SUCCESS_MESSAGE: "Refreshed Contents",
    NONE_SELECTED: "NONE SELECTED",
    NO_MATCHES: "No Matches",
    ARCHIVE_SUCCESS_MESSAGE: "Log Source Archived",
    ARCHIVE_DELETE_SUCCESS_MESSAGE: "Archived File(s) Deleted",
  },
});


/**
 * List of keys in the Alpine.js store to synchronize with localStorage
 * so that user preferences persist across sessions.
 */
const SYNC_WITH_LOCAL_STORAGE_KEYS = [
  "fullWidth",
  "autoRefresh",
  "selectedLogSource",
  "searchTerm",
  "globalSearchTerm",
  "globalSearchCaseSensitive",
  "limitLinesTo",
  "pathPrefix",
  "pathSplitter",
];


/**
 * Initial state for the Alpine.js store managing the UI state.
 */
const INITIAL_STATE = {
  activeTab: getTabFromHash() || "sources",
  archiveEntries: [],
  autoRefresh: localStorage.getItem("autoRefresh") === "true",
  currentErrorIndex: -1,
  errorCount: 0,
  fullWidth: localStorage.getItem("fullWidth") === "true",
  globalSearchCaseSensitive: localStorage.getItem("globalSearchCaseSensitive") === "true",
  globalSearchResults: [],
  globalSearchSummary: "",
  globalSearchTerm: localStorage.getItem("globalSearchTerm") || "",
  hasLoadedLogSourceOnce: false,
  isArchiving: false,
  isLoading: false,
  isLoadingArchive: false,
  isSearching: false,
  limitLinesTo: localStorage.getItem("limitLinesTo") || 1000,
  logSource: INITIAL_LOG_SOURCE,
  pendingJumpToLine: null,
  searchResults: [],
  searchTerm: localStorage.getItem("searchTerm") || "",
  selectedForArchiveDeletion: CONST.STRINGS.NONE_SELECTED,
  selectedForClearing: CONST.STRINGS.NONE_SELECTED,
  selectedLogSource: localStorage.getItem("selectedLogSource") || CONST.STRINGS.NONE_SELECTED,
  pathPrefix: localStorage.getItem("pathPrefix") || "",
  pathSplitter: localStorage.getItem("pathSplitter") || "",
  toast: notificationController,
};
