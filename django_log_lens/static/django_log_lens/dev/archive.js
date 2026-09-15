/**
 * Archive a log source, i.e. ask the server to copy it into the "archive" folder
 * next to it. The archive listing is refreshed with the response.
 * @param {string} source The log source to archive.
 * @returns {Promise<symbol>}
 */
async function archiveSource(source) {
  const ui = Alpine.store("ui");
  ui.isArchiving = true;

  try {
    const response = await fetch(ARCHIVE_API_ENDPOINT, {
      method: "POST",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ source }),
    });

    if (response.status !== 200) {
      logger.error(`Failed to archive log source (status:${response.status})`);
      toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
      return Promise.resolve(CONST.ERROR);
    }

    const data = await response.json();
    ui.archiveEntries = data.entries;
    logger.info(`Archived log source ${source} as ${data.source}`);
    toast(`${CONST.STRINGS.ARCHIVE_SUCCESS_MESSAGE}:\n${data.name}`, "success");
    return Promise.resolve(CONST.SUCCESS);
  } catch (error) {
    logger.error("Caught error while archiving log source:", error);
    toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
    return Promise.resolve(CONST.ERROR);
  } finally {
    ui.isArchiving = false;
  }
}

/**
 * Fetch the list of archived log files from the backend API.
 * @returns {Promise<symbol>}
 */
async function fetchArchiveEntries() {
  const ui = Alpine.store("ui");
  ui.isLoadingArchive = true;

  try {
    const response = await fetch(ARCHIVE_API_ENDPOINT, { method: "GET", redirect: "error" });

    if (response.status !== 200) {
      logger.error(`Failed to fetch archived log files (status:${response.status})`);
      toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
      return Promise.resolve(CONST.ERROR);
    }

    const data = await response.json();
    ui.archiveEntries = data.entries;
    logger.debug("Fetched archived log files:", data.entries.length);
    return Promise.resolve(CONST.SUCCESS);
  } catch (error) {
    logger.error("Caught error while fetching archived log files:", error);
    toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
    return Promise.resolve(CONST.ERROR);
  } finally {
    ui.isLoadingArchive = false;
  }
}

/**
 * Ask the archive API to delete something and apply the response to the store.
 * @param {string} query The query string selecting what to delete.
 * @param {boolean} deletesSelectedLogSource Whether the deletion includes the log source
 *   that is currently loaded in the log view, which is then unloaded.
 * @returns {Promise<symbol>}
 */
async function requestArchiveDeletion(query, deletesSelectedLogSource) {
  const ui = Alpine.store("ui");

  try {
    const response = await fetch(`${ARCHIVE_API_ENDPOINT}?${query}`, {
      method: "DELETE",
      redirect: "error",
      headers: { "X-CSRFToken": getCookie("csrftoken") },
    });

    if (response.status !== 200) {
      logger.error(`Failed to delete archived log file(s) (status:${response.status})`);
      toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
      return Promise.resolve(CONST.ERROR);
    }

    const data = await response.json();
    ui.archiveEntries = data.entries;

    if (deletesSelectedLogSource) {
      ui.logSource = INITIAL_LOG_SOURCE;
      ui.selectedLogSource = CONST.STRINGS.NONE_SELECTED;
    }

    logger.info("Deleted archived log file(s):", data.deleted);
    toast(`${data.deleted.length} ${CONST.STRINGS.ARCHIVE_DELETE_SUCCESS_MESSAGE}`, "success");
    return Promise.resolve(CONST.SUCCESS);
  } catch (error) {
    logger.error("Caught error while deleting archived log file(s):", error);
    toast(CONST.STRINGS.GENERIC_ERROR_MESSAGE_SHORT, "error");
    return Promise.resolve(CONST.ERROR);
  }
}

/**
 * Permanently delete a single archived log file.
 * @param {string} source The archived file to delete.
 * @returns {Promise<symbol>}
 */
function deleteArchivedSource(source) {
  const isSelected = Alpine.store("ui").selectedLogSource === source;
  return requestArchiveDeletion(`source=${encodeURIComponent(source)}`, isSelected);
}

/**
 * Permanently delete every archived log file. The log files they were copied from
 * are not affected.
 * @returns {Promise<symbol>}
 */
function deleteAllArchivedSources() {
  const ui = Alpine.store("ui");
  const isSelected = ui.archiveEntries.some((entry) => entry.source === ui.selectedLogSource);
  return requestArchiveDeletion("all=true", isSelected);
}

/**
 * Load the archive listing whenever the archive tab is opened, so that it also
 * reflects files archived by someone else in the meantime.
 */
function initArchiveTabBehaviour() {
  let wasActive = false;
  Alpine.effect(() => {
    const isActive = Alpine.store("ui").activeTab === "archive";
    if (isActive && !wasActive) {
      fetchArchiveEntries();
    }
    wasActive = isActive;
  });
}

/**
 * Format a file size for display in the archive listing.
 * @param {number} bytes
 * @returns {string} The human readable size.
 */
function formatFileSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const decimals = unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(decimals)} ${units[unitIndex]}`;
}

/**
 * Format a POSIX timestamp as a local date and time.
 * @param {number} timestamp Seconds since the epoch.
 * @returns {string} The formatted timestamp.
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString();
}
