const state = {
  errorCounter: 1,
  warningCounter: 1,
};

/**
 * Renders a single line of the log file.
 * Highlights quoted text and URLs.
 * Adds links to open files in VS Code.
 * @param {string} line - the log line to be rendered
 * @param {number} lineCounter - the current line number
 * @returns {string} - the formatted log line as HTML
 */
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
      `"<span class="highlight" line_number=${lineNumber} onclick="copyElementToClipboard(this)">$1</span>"`
    );
    line += ` <a  id="a-${lineCounter}" href="javascript:openInVsCode(document.getElementById(\`a-${lineCounter}\`))"
                        title="open in VS Code"
                        file_name="${filename}"
                        line_number="${lineNumber}"> &uarr; </a>`;
  } else if (matchesStringRegex) {
    line = line.replace(/"([^"]+)"/g, '"<span class="highlight" onclick="copyElementToClipboard(this)">$1</span>"');
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

  line = line.replace(/'([^']+)'/g, `'<span class="highlight" onclick="copyElementToClipboard(this)">$1</span>'`);
  return line;
}

/**
 * Colors the log lines based on the log level that
 * are extracted from the [LVL:XX] prefix.
 * @param {string} line
 * @returns
 */
function colorizeLogLevels(line) {
  const prefixPattern = /\[LVL:(\d+)\]/;
  const prefixMatch = line.match(prefixPattern);

  if (prefixMatch) {
    const fullMatch = prefixMatch[0];
    const logLevel = parseInt(prefixMatch[1]);
    if (logLevel >= 50) {
      line = line.replace(fullMatch, `</span><span id="error-${state.errorCounter}" class="log-critical">`);
      state.errorCounter++;
    } else if (logLevel >= 40) {
      line = line.replace(fullMatch, `</span><span id="error-${state.errorCounter}" class="log-error">`);
      state.errorCounter++;
    } else if (logLevel >= 30) {
      line = line.replace(fullMatch, `</span><span class="log-warning">`);
      state.warningCounter++;
    } else if (logLevel >= 20) {
      line = line.replace(fullMatch, `</span><span class="log-info">`);
    } else {
      line = line.replace(fullMatch, `</span><span class="log-debug">`);
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
function renderLogLines(logLines) {
  let formattedLog = "";
  let lineCounter = 1;

  for (let i = 0; i < logLines.length; i++) {
    logLines[i] = renderLine(logLines[i], lineCounter) + "<br />";
    logLines[i] = colorizeLogLevels(logLines[i]);
    lineCounter++;
  }
  formattedLog = logLines.join("");
  return `<span>${formattedLog}</span>`;
}

/**
 * Renders the entire log file content.
 * @param {string} logFileContent
 * @returns {string} - the formatted log text as HTML
 */
function renderLogFileContent(logFileContent) {
  const logLines = logFileContent.split("\n");
  return renderLogLines(logLines);
}
