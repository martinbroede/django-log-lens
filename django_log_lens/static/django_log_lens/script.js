"use strict";
const btnAutoRefresh = document.getElementById("btn-auto-refresh");
const divLogContent = document.getElementById("div-log-content");
const divMessageToast = document.getElementById("div-message-toast");
const divOverlay = document.getElementById("div-overlay");
const divPrompt = document.getElementById("div-prompt");
const divToolbar = document.getElementById("div-toolbar");
const divToolbarExtension = document.getElementById("div-toolbar-extension");
const h3LogfileName = document.getElementById("h3-logfile-name");
const inputPathPrefix = /** @type {HTMLInputElement} */ (document.getElementById("input-path-prefix"));
const inputPathSplitter = /** @type {HTMLInputElement} */ (document.getElementById("input-path-splitter"));
const inputPrompt = /** @type {HTMLInputElement} */ (document.getElementById("input-prompt"));
const pMessageToastText = document.getElementById("p-message-toast-text");
const pPromptText = document.getElementById("p-prompt-text");
const preLineCounter = document.getElementById("pre-line-counter");
const preLogContent = document.getElementById("pre-log-content");
const tableFilePaths = document.getElementById("table-file-paths");
const tdErrorCountElem = document.getElementById("td-number-of-errors");
const tdHandlerName = document.getElementById("td-handler-name");
const tdLineCounter = document.getElementById("td-number-of-lines");
const tdWarningCount = document.getElementById("td-number-of-warnings");

const HTML_ELEMENTS = [
  btnAutoRefresh,
  divLogContent,
  divMessageToast,
  divOverlay,
  divPrompt,
  divToolbar,
  divToolbarExtension,
  h3LogfileName,
  inputPathPrefix,
  inputPathSplitter,
  inputPrompt,
  pMessageToastText,
  pPromptText,
  preLineCounter,
  preLogContent,
  tableFilePaths,
  tdErrorCountElem,
  tdHandlerName,
  tdLineCounter,
  tdWarningCount,
];

for (let elem of HTML_ELEMENTS) {
  console.assert(Boolean(elem), `Element not found.`);
}

const state = {
  currentError: -1,
  errorCounter: 0,
  filePaths: {},
  lastLogDataTimeStamp: -1,
  lastSelectedHandlerName: "",
  timeout: 5000,
  timeOutId: null,
  warningCounter: 0,
};

const preservedState = {
  autoRefreshState: "off",
  pathPrefix: "",
  pathSplitter: "",
  stringSearchValue: "",
  stringReplaceValue: "",
};

let promptCancelCallback = /** @type Function */ ((...args) => {});
let promptConfirmCallback = /** @type Function */ ((...args) => {});

const _bindings = {
  propCounter: 0,
};

/**
 * Binds an element's value to an object's property.
 * @param {HTMLInputElement} elem the HTML element to bind to
 * @param {object} obj the object to bind to
 * @param {string} objProp the name of the property on the object
 * @param {boolean} twoWay whether the binding should be two-way or one-way
 * @param {Function} onChangeCallback the callback function to be called when the property changes
 */
function bindElementValue(elem, obj, objProp, twoWay = false, onChangeCallback = () => {}) {
  if (obj[objProp] === undefined) {
    throw Error("Property '" + objProp + "' does not exist on object.");
  }
  const changerHandler = () => {
    obj[objProp] = elem.value;
    if (!twoWay) {
      onChangeCallback(obj, objProp);
    }
  };
  elem.addEventListener("change", changerHandler);
  if (twoWay) {
    bindBack(obj, objProp, elem);
  }
  function bindBack(obj, objProp, elem) {
    const propId = _bindings.propCounter;
    _bindings.propCounter++;
    if (obj[objProp]) {
      elem.value = obj[objProp];
      _bindings[`_${propId}`] = obj[objProp];
    }
    Object.defineProperty(obj, objProp, {
      get() {
        return _bindings[`_${propId}`];
      },
      set(value) {
        _bindings[`_${propId}`] = value;
        elem.value = value;
        onChangeCallback(obj, objProp);
      },
    });
  }
}

/**
 * Binds an element's attribute to an object's property.
 * @param {HTMLElement} elem the HTML element to bind to
 * @param {string} elemAttr the HTML attribute to bind to
 * @param {object} obj object to bind to
 * @param {string} objProp name of the property on the object
 * @param {boolean} twoWay whether the binding should be two-way or one-way
 * @param {Function} onChangeCallback the callback function to be called when the property changes
 */
function bindElementAttr(elem, elemAttr, obj, objProp, twoWay = false, onChangeCallback = () => {}) {
  if (obj[objProp] === undefined) {
    throw Error("Property '" + objProp + "' does not exist on object.");
  }
  const handler = () => {
    obj[objProp] = elem.getAttribute(elemAttr);
    if (!twoWay) {
      onChangeCallback(obj, objProp);
    }
  };
  if (elem.tagName === "BUTTON") {
    elem.addEventListener("click", handler);
  } else {
    elem.addEventListener("change", handler);
  }
  if (twoWay) {
    bindAttrBack(obj, objProp, elem, elemAttr, onChangeCallback);
  }
}

/**
 * Bind back the object property to the element attribute.
 * @param {object} obj the object to bind to
 * @param {string} objProp the name of the property on the object
 * @param {HTMLElement} elem the HTML element to bind to
 * @param {string} elemAttr the HTML attribute to bind to
 * @param {Function} onChangeCallback the callback function to be called when the property changes
 */
function bindAttrBack(obj, objProp, elem, elemAttr, onChangeCallback) {
  const propId = _bindings.propCounter;
  _bindings.propCounter++;
  if (obj[objProp]) {
    elem.setAttribute(elemAttr, obj[objProp]);
  }
  _bindings[`_${propId}`] = obj[objProp];
  Object.defineProperty(obj, objProp, {
    get() {
      return _bindings[`_${propId}`];
    },
    set(value) {
      _bindings[`_${propId}`] = value;
      elem.setAttribute(elemAttr, value);
      onChangeCallback(obj, objProp);
    },
  });
}

/**
 * Stores the obj[objProp] in the hash so that the page can be restored when refreshed.
 * @param {object} obj the object to be observed
 * @param {string} objProp the property to be stored in the hash
 */
function bindingObserverFn(obj, objProp) {
  window.location.hash = encodeURIComponent(btoa(JSON.stringify({ preservedState })));
  console.debug("Changed property:", objProp, ":", obj[objProp]);
}

/**
 * Sets up the keydown event listeners for the overlay and the window
 * so that the user can confirm or cancel the prompt with the Enter or Escape key.
 * Also sets up the keydown event listener for the window so that the user can refresh the page with F5.
 * @returns {void}
 */
function setUpEventListeners() {
  divOverlay.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      promptOnConfirm();
    } else if (event.key === "Escape") {
      promptOnCancel();
    }
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "F5" && !event.ctrlKey) {
      event.preventDefault();
      fetchLogfile();
    }
  });
}

/**
 * Handles the click event of the refresh button.
 * Toggles the state of the button.
 * @param {HTMLElement} btn The invoking button
 */
function onRefreshBtnClick(btn) {
  if (btn.getAttribute("state") === "on") {
    btn.setAttribute("state", "off");
  } else {
    btn.setAttribute("state", "on");
  }
}

/**
 * Handles the click event of the prompt confirm button.
 * Hides the prompt and calls the confirm callback.
 * @returns {void}
 */
function promptOnConfirm() {
  divOverlay.style.display = "none";
  const input = inputPrompt.value;
  inputPrompt.value = "";
  if (promptConfirmCallback) {
    promptConfirmCallback(input);
  }
}

/**
 * Shows a prompt to the user with the given message.
 * @param {string} message the message to be displayed
 * @param {Function} confirmCallback the callback to be called when the user confirms
 * @param {Function} cancelCallback the callback to be called when the user cancels
 */
function prompt(message, confirmCallback, cancelCallback) {
  pPromptText.innerText = message;
  divOverlay.style.display = "block";
  inputPrompt.focus();
  promptConfirmCallback = confirmCallback;
  promptCancelCallback = cancelCallback;
}

/**
 * Handles the click event of the prompt cancel button.
 * Hides the prompt and calls the cancel callback.
 * @returns {void}
 */
function promptOnCancel() {
  divOverlay.style.display = "none";
  inputPrompt.value = "";
  if (promptCancelCallback) {
    promptCancelCallback();
  }
}

/**
 * Shows a message toast with the given message and color.
 * Uses a default color if none is provided.
 * @param {string} message
 * @param {string=} color
 */
function showMessageToast(message, color) {
  if (color) {
    divMessageToast.style.color = `var(--${color}`;
  } else {
    divMessageToast.style.color = "var(--control-elem-color)";
  }

  pMessageToastText.innerHTML = message.replaceAll("\n", "<br/>");
  divMessageToast.style.display = "flex";
  if (state.timeOutId) {
    clearTimeout(state.timeOutId);
  }
  state.timeOutId = setTimeout(() => {
    divMessageToast.style.display = "none";
  }, state.timeout);
}

/**
 * Toggles the visibility of the toolbar extension.
 * Changes the text of the button accordingly.
 * @param {HTMLElement} btn the invoking button
 */
function toggleToolbarExtensionVisibility(btn) {
  if (divToolbarExtension.style.display === "none") {
    divToolbarExtension.style.display = "block";
    btn.innerText = "Show Less";
    adjustLogContentMargin();
  } else {
    divToolbarExtension.style.display = "none";
    btn.innerText = "Show More";
    adjustLogContentMargin();
  }
}

/**
 * Fetches the timestamp of the log file to check if it has changed.
 * @param {string=} handlerName
 * @returns {void}
 */
function requestLogfileTimestamp(handlerName) {
  handlerName = handlerName || state.lastSelectedHandlerName;
  if (!handlerName) {
    return;
  }
  // @ts-ignore
  fetch(requestLogfileTimestampURL + handlerName)
    .then((response) => response.json())
    .then((data) => {
      if (data.timestamp !== state.lastLogDataTimeStamp && state.lastLogDataTimeStamp !== -1) {
        if (btnAutoRefresh.getAttribute("state") === "on") {
          fetchLogfile();
        } else {
          showMessageToast("Logfile has been changed\nClick refresh for an update", "yellow-color");
        }
      }
    })
    .catch((error) => {
      console.error("Error requesting logfile timestamp:", error);
    });
}

/**
 * Renders the file path table that displays the handler name and the file path and
 * allows the user to load the log file or clear it.
 * @param {object} data the log config as it is stored in the settings.py
 */
function renderFilePathTable(data) {
  for (let prop of Object.keys(data)) {
    const tr = document.createElement("tr");
    const tdHandler = document.createElement("td");
    const tdPath = document.createElement("td");
    const tdLoad = document.createElement("td");
    const tdClear = document.createElement("td");
    tdLoad.innerHTML = "&nbsp;&nbsp;&rarr;&nbsp;&nbsp;";
    tdLoad.onclick = () => {
      const tempProp = prop;
      fetchLogfile(tempProp);
    };
    tdLoad.classList.add("clickable");
    state.lastSelectedHandlerName = prop;
    tdHandler.innerText = prop;
    tdPath.innerText = data[prop];
    tdClear.innerHTML = "&nbsp;&nbsp;&times;&nbsp;&nbsp;";
    tdClear.classList.add("clickable");
    tdClear.onclick = () => {
      const tempProp = prop;
      promptClearLogFile(tempProp);
    };
    tr.appendChild(tdHandler);
    tr.appendChild(tdPath);
    tr.appendChild(tdLoad);
    tr.appendChild(tdClear);
    const rows = tableFilePaths.getElementsByTagName("tr");
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].getElementsByTagName("td")[0].innerText === prop) {
        tableFilePaths.removeChild(rows[i]);
      }
    }
    tableFilePaths.appendChild(tr);
  }
}

/**
 * Fetches the CSRF token from the input elements of the page.
 * See https://gist.github.com/sirodoht/fb7a6e98d33fc460d4f1eadaff486e7b - thanks!
 * @returns {string} - the CSRF token
 */
function getCsrf() {
  const inputElements = document.querySelectorAll("input");
  let csrfToken = "";
  for (let i = 0; i < inputElements.length; ++i) {
    if (inputElements[i].name === "csrfmiddlewaretoken") {
      csrfToken = inputElements[i].value;
      break;
    }
  }
  return csrfToken;
}

/**
 * Fetches the file paths to the log files from the server.
 * In case no file paths are found, a message is displayed to the user
 * that they need to set up a logging configuration in their settings.py.
 * @returns {void}
 */
function fetchFilePaths() {
  showMessageToast("Fetching file paths...");

  // @ts-ignore
  fetch(requestLogFilePathsURL)
    .then((response) => response.json())
    .then((data) => {
      state.filePaths = data;
      if (Object.keys(data).length === 0) {
        showMessageToast(
          "You need to set up a LOGGING configuration\n in your settings.py\n in order to manage your logs here",
          "light-red-color"
        );
        tableFilePaths.style.display = "none";
        return;
      } else {
        tableFilePaths.style.display = "";
        renderFilePathTable(data);
        showMessageToast("Fetched file paths", "green-color");
      }
    })
    .catch((error) => {
      showMessageToast("Error fetching file paths", "light-red-color");
      console.error("Error fetching file paths:", error);
    });
}

/**
 * Shows a prompt to the user to confirm if they want to clear the log file.
 * @param {string} handlerName
 * @returns {void}
 */
function promptClearLogFile(handlerName) {
  const callbackCanceled = () => showMessageToast("Did NOT clear logfile", "light-red-color");
  const callbackConfirmed = (promptText) => {
    if (promptText === handlerName) {
      clearLogFile(handlerName);
    } else callbackCanceled();
  };
  const promptText =
    `Are you sure you want to clear the logs of ${handlerName}?\n` + `If so, type ${handlerName} in the field below.`;
  prompt(promptText, callbackConfirmed, callbackCanceled);
}

/**
 * Clears the log file of the given handler name.
 * @param {string} handlerName
 * @returns {void}
 */
function clearLogFile(handlerName) {
  if (!handlerName) {
    return;
  }
  // @ts-ignore
  fetch(clearLogFileURL + handlerName, {
    method: "DELETE",
    headers: { "X-CSRFToken": getCsrf() },
  })
    .then((response) => {
      if (response.status >= 400) {
        handleFetchLogFileError(response);
      }
      return response.text(); // todo simplify the chain
    })
    .then(() => {
      fetchLogfile();
      showMessageToast(`Cleared logfile of '${handlerName}'`, "green-color");
    })
    .catch((error) => {
      showMessageToast("Error clearing file", "light-red-color");
      console.error("Error clearing file:", error);
    });
}

/**
 * Adjusts the margin of the log content to make space for the toolbar.
 * @returns {void}
 */
function adjustLogContentMargin() {
  divLogContent.style.marginTop = getOffset() + "px";
}

/**
 * Handles the error when fetching the log file.
 * Displays the error message to the user.
 * Updates the log content with the error message.
 * @param {Response} response
 */
function handleFetchLogFileError(response) {
  response.text().then((text) => {
    adjustLogContentMargin();
    preLogContent.innerText = text;
  });
  throw Error("Error fetching log file");
}

/**
 * Fetches the log file of the given handler name.
 * If no handler name is provided, the last selected handler name is used.
 * If no handler name is available, a message is displayed to the user.
 * @param {string=} handlerName
 * @returns {void}
 */
function fetchLogfile(handlerName) {
  showMessageToast("Fetching log file...");
  if (!handlerName) {
    handlerName = state.lastSelectedHandlerName;
    if (!handlerName) {
      showMessageToast("No handler selected", "light-red-color");
      return;
    }
  }
  // @ts-ignore
  fetch(requestLogfileURL + handlerName)
    .then((response) => {
      if (response.status >= 400) {
        handleFetchLogFileError(response);
      }
      return response.json();
    })
    .then((jsonResponse) => {
      let logText = jsonResponse.text;
      if (jsonResponse.timestamp === state.lastLogDataTimeStamp && handlerName === state.lastSelectedHandlerName) {
        showMessageToast("No changes detected", "cyan-color");
        return null;
      }

      state.lastLogDataTimeStamp = jsonResponse.timestamp;
      state.lastSelectedHandlerName = handlerName;
      tdHandlerName.innerText = handlerName;

      adjustLogContentMargin();
      checkLogFileLength(logText);
      showMessageToast("Fetched log file", "green-color");

      setTimeout(() => {
        finalize(logText, handlerName);
      }, 250); // set timeout to allow the toast to be displayed
    })
    .catch((error) => {
      showMessageToast(error.message || "Error fetching log file", "light-red-color");
      console.error("Error fetching log file:", error);
    });
}

/**
 * Finalizes the log text after fetching the log file.
 * - Renders the log text
 * - Updates the line counter
 * - Updates the error and warning counter
 * - Updates the log file name
 * - Scrolls to the bottom of the page
 * @param {string} logText
 * @param {string} handlerName
 * @returns {void}
 */
function finalize(logText, handlerName) {
  const logLines = logText.split("\n");
  preLogContent.innerHTML = renderLogText(logLines);
  tdLineCounter.innerText = String(logLines.length);
  tdErrorCountElem.innerText = String(state.errorCounter);
  tdWarningCount.innerText = String(state.warningCounter);
  h3LogfileName.innerText = state.filePaths[handlerName];
  addLineNumbers(logLines.length);
  window.scrollTo(0, document.body.scrollHeight);
}

/**
 * Adds line numbers to the line counter.
 * @param {number} noOfLines
 */
function addLineNumbers(noOfLines) {
  preLineCounter.innerHTML = "";
  const lineCounterLines = [];
  for (let i = 0; i < noOfLines; i++) {
    lineCounterLines[i] = `<span id='line-${i + 1}' class='line-counter'>`.concat(
      (i + 1).toString().padStart(5, "0"),
      "</span><br />"
    );
  }
  preLineCounter.innerHTML = lineCounterLines.join("");
}

/**
 * Checks if the log file is too large to render.
 * If it is, the log content is cleared and an error is thrown.
 * @param {string} logText the log text to be checked
 * @returns {void}
 */
function checkLogFileLength(logText) {
  const lineCounter = logText.split("\n").length;
  if (lineCounter > 99999) {
    preLineCounter.innerHTML = "";
    preLogContent.innerHTML = "";
    tdErrorCountElem.innerText = "?";
    tdWarningCount.innerText = "?";
    tdLineCounter.innerText = String(lineCounter);
    throw Error("Logfile is too large to render");
  }
}

function renderLine(line, lineCounter) {
  const matchesStringRegex = line.match(/"([^"]+)"/g);
  const matchesLineNumberRegex = line.match(/, line \b\d+\b,/g);
  const containsUrlRegex = /\bhttps?:\/\/[^/]+(\/[^/]+)\b/;

  if (matchesStringRegex && matchesLineNumberRegex) {
    const lineNumber = matchesLineNumberRegex[matchesLineNumberRegex.length - 1]
      .replace(/, line /g, "")
      .replace(/,/g, "");
    let filename = matchesStringRegex[matchesStringRegex.length - 1].replace(/"/g, "");
    line = line.replace(
      /"([^"]+)"/g,
      `"<span class="quoted-text" line_number=${lineNumber} onclick="copyElementToClipboard(this)">$1</span>"`
    );
    line += ` <a  id="a-${lineCounter}" href="javascript:openInVsCode(document.getElementById(\`a-${lineCounter}\`))"
                        title="open in VS Code"
                        file_name="${filename}"
                        line_number="${lineNumber}"> &uarr; </a>`;
  } else if (matchesStringRegex) {
    line = line.replace(/"([^"]+)"/g, '"<span class="quoted-text" onclick="copyElementToClipboard(this)">$1</span>"');
  } else if (containsUrlRegex.test(line)) {
    const urlRegex = /\bhttps?:\/\/[^/]+(\/[^/]+)*\b(?=\))/g;
    const url = line.match(urlRegex) ? line.match(urlRegex)[0] : null;
    line = line.replace(urlRegex, `<span class="url" onclick="copyElementToClipboard(this)">$&</span>`);
    if (url) {
      line += ` <a  id="a-${lineCounter}" href="javascript:openInVsCode(document.getElementById(\`a-${lineCounter}\`))"
                        title="open in VS Code"
                        file_name="${url}"> &uarr; </a>`;
    }
  }

  line = line.replace(/'([^']+)'/g, `'<span class="quoted-text" onclick="copyElementToClipboard(this)">$1</span>'`);
  return line;
}

/**
 * Colors the log lines based on the log level that
 * are extracted from the [LVL:XX] prefix.
 * @param {string} line
 * @returns
 */
function colorLogLevels(line) {
  const prefixPattern = /\[LVL:(\d+)\]/;
  const prefixMatch = line.match(prefixPattern);
  if (prefixMatch) {
    const fullMatch = prefixMatch[0];
    const logLevel = parseInt(prefixMatch[1]);
    if (logLevel >= 50) {
      line = line.replace(fullMatch, `</span><span id="error-${state.errorCounter}" class="critical">`);
      state.errorCounter++;
    } else if (logLevel >= 40) {
      line = line.replace(fullMatch, `</span><span id="error-${state.errorCounter}" class="error">`);
      state.errorCounter++;
    } else if (logLevel >= 30) {
      line = line.replace(fullMatch, `</span><span class="warning">`);
      state.warningCounter++;
    } else if (logLevel >= 20) {
      line = line.replace(fullMatch, `</span><span class="info">`);
    } else {
      line = line.replace(fullMatch, `</span><span class="debug">`);
    }
  }
  return line;
}

/**
 * Renders the log text - highlights errors, warnings, and info messages.
 * Adds line numbers to the log text.
 * @param {string[]} logLines - the log text to be rendered
 * @returns {string} - the formatted log text as HTML
 */
function renderLogText(logLines) {
  let formattedLog = "";
  let lineCounter = 1;

  state.currentError = -1;
  state.errorCounter = 0;
  state.warningCounter = 0;

  for (let i = 0; i < logLines.length; i++) {
    logLines[i] = renderLine(logLines[i], lineCounter) + "<br />";
    logLines[i] = colorLogLevels(logLines[i]);
    lineCounter++;
  }
  formattedLog = logLines.join("");
  return `<span>${formattedLog}</span>`;
}

/**
 * Returns the offset of the toolbar.
 * @returns {number}
 */
function getOffset() {
  return divToolbar.offsetHeight - 1;
}

/**
 * Opens the file in VS Code.
 * The invoking element must have the attributes file_name and line_number.
 * @param {HTMLElement} element - the invoking element
 * @returns {void}
 */
function openInVsCode(element) {
  let fileName = element.getAttribute("file_name");
  const lineNumber = element.getAttribute("line_number");
  fileName = splitPath(fileName);
  fileName = preservedState.stringSearchValue
    ? fileName.replace(preservedState.stringSearchValue, preservedState.stringReplaceValue)
    : fileName;
  const url = lineNumber ? `vscode://file/${fileName}:${lineNumber}` : `vscode://file/${fileName}`;
  window.open(url);
}

/**
 * Splits the path at the splitter and returns the last part.
 * @param {string} path
 * @returns {string} - the last part of the path
 */
function splitPath(path) {
  const prefix = inputPathPrefix.value;
  const splitter = inputPathSplitter.value;
  const splitted = path.split(splitter);
  if (!splitter) {
    return path;
  } else if (splitted.length > 1) {
    return prefix + splitted[splitted.length - 1];
  }
  return splitted[splitted.length - 1];
}

/**
 * Copies the text of the invoking element to the clipboard.
 * If the element has a line_number attribute, it is appended to the text.
 * @param {HTMLElement} HTMLElement - the invoking element
 * @returns {void}
 */
function copyElementToClipboard(HTMLElement) {
  const text = HTMLElement.innerText;
  const tempInput = document.createElement("input");
  tempInput.value = text;
  if (inputPathSplitter) {
    tempInput.value = splitPath(text);
  }
  document.body.appendChild(tempInput);
  if (HTMLElement.hasAttribute("line_number")) {
    tempInput.value += ":" + HTMLElement.getAttribute("line_number");
  }
  tempInput.select();
  document.execCommand("copy");
  showMessageToast(`${tempInput.value}<br/><span class="info">Copied to clipboard</span>`);
  document.body.removeChild(tempInput);
}

/**
 * Scrolls to the line with the given id.
 * @param {string} id
 * @returns {void}
 */
function goToLineWidId(id) {
  const scrollOffset = getOffset();
  try {
    const _id = parseInt(id);
    const line = document.getElementById("line-" + _id);
    line.scrollIntoView();
    window.scroll(0, window.scrollY - scrollOffset);
  } catch {}
}

/**
 * Scrolls start of the error with the given error number.
 * @param {number} errorNo
 * @returns {void}
 */
function goToError(errorNo) {
  const scrollOffset = getOffset();
  const errorElement = document.getElementById(`error-${errorNo}`);
  const errYPos = errorElement.getBoundingClientRect().top;

  if (errYPos + window.scrollY - document.body.scrollHeight > 0) {
    window.scroll(0, document.body.scrollHeight);
  } else {
    errorElement.scrollIntoView();
    window.scroll(0, window.scrollY - scrollOffset);
  }

  errorElement.style.backgroundColor = "var(--highlight-color)";
  setTimeout(() => {
    errorElement.style.backgroundColor = "";
  }, state.timeout);
}

/**
 * Scrolls to the latest error.
 * @returns {void}
 */
function goToLastError() {
  if (state.errorCounter > 0) {
    state.currentError = state.errorCounter - 1;
    goToError(state.currentError);
  }
}

/**
 * Scrolls to the next error in the log file.
 * @returns {void}
 */
function goToNextError() {
  if (state.currentError < state.errorCounter - 1) {
    state.currentError++;
    goToError(state.currentError);
  }
}

/**
 * Scrolls to the previous error in the log file.
 * @returns {void}
 */
function goToPreviousError() {
  if (state.currentError > 0) {
    state.currentError--;
    goToError(state.currentError);
  }
}

/**
 * Sets up the page:
 * - Parses the hash so that the page can be restored to its previous state
 * - Sets up event listeners
 * - Fetches file paths from the server
 * - Requests the timestamp of the log file so that the user can be notified if the log file has changed
 */
function setUpPage() {
  try {
    const hash = decodeURIComponent(window.location.hash.substring(1));
    Object.assign(preservedState, JSON.parse(atob(hash)).preservedState);
  } catch (error) {
    console.debug("Did not parse hash:", error);
  }

  bindElementValue(inputPathPrefix, preservedState, "pathPrefix", true, bindingObserverFn);
  bindElementValue(inputPathSplitter, preservedState, "pathSplitter", true, bindingObserverFn);
  bindElementAttr(btnAutoRefresh, "state", preservedState, "autoRefreshState", true, bindingObserverFn);
  window.onload = () => {
    setUpEventListeners();
    fetchFilePaths();
    setInterval(() => {
      requestLogfileTimestamp();
    }, 2 * state.timeout);
  };
  adjustLogContentMargin();
}

setUpPage();
