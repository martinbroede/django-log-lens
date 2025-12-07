class LogRenderer {
  /**
   * Initializes the LogRenderer.
   * @param {string} logSourceContent - Full text of the log source
   * @param {number} limitLinesTo - Number of lines to limit the rendering to
   */
  constructor(logSourceContent, limitLinesTo = 1000) {
    this.errorCounter = 0;
    this.logSourceContent = logSourceContent || "";
    this.lines = this.logSourceContent.split("\n");
    this.totalLines = this.lines.length;
    this.firstLine = this.totalLines > limitLinesTo ? this.totalLines - limitLinesTo + 1 : 1;
    this.limitLinesTo = limitLinesTo;
    this.lines = this.lines.slice(-this.limitLinesTo);
    this.totalRenderedLines = this.lines.length;
  }

  _generateRandomId() {
    return Math.random().toString(36).substring(2);
  }

  /**
   * Generate line numbers from 1 to count, each on a new line with span elements
   * that have corresponding IDs. (e.g., id="line-counter-42")
   * @returns {string} Line numbers as a newline-separated string.
   */
  generateLineNumbers() {
    return Array.from(
      { length: Math.min(this.totalLines, this.limitLinesTo) },
      (_, i) => `<span id="line-counter-${i + this.firstLine}">${i + this.firstLine}</span>`
    ).join("\n");
  }

  /**
   * Renders the entire log source content as HTML.
   * @returns {void}
   */
  renderLogContent() {
    this.renderedLines = this.lines.map((line) => this.colorizeLogLevels(this.renderLine(line) + "<br />"));
  }

  /**
   * Appends new log content to the existing rendered lines.
   * @param {string} logContent - New log content to append
   * @returns {void}
   */
  appendLogContent(logContent) {
    const newLines = logContent.split("\n");

    if (logContent) {
      this.renderedLines.pop(); // remove last <br /> if new content is added
      this.totalRenderedLines -= 1;
      this.totalLines -= 1;
    }

    const linesToKeep = Math.max(0, this.limitLinesTo - newLines.length);
    const appendedRenderedLines = newLines.map((line) => this.colorizeLogLevels(this.renderLine(line)) + "<br />");
    this.renderedLines = this.renderedLines.slice(-linesToKeep);
    this.renderedLines.push(...appendedRenderedLines);
    this.totalRenderedLines += newLines.length;
    this.totalLines += newLines.length;
    this.firstLine = this.totalLines > this.limitLinesTo ? this.totalLines - this.limitLinesTo + 1 : 1;
    this.renderedLines = this.renderedLines.slice(-this.limitLinesTo);

    return;
  }

  /**
   * @returns {string} The rendered content as HTML
   */
  getRenderedLogContent() {
    return `<span>${this.renderedLines.join("")}</span>`;
  }

  /**
   * Renders a single line of the log source.
   * Highlights quoted strings, URLs, and adds VS Code links where possible.
   * @param {string} line - The log line
   * @returns {string} The formatted HTML line
   */
  renderLine(line) {
    const regex = {
      singleQuoted: /'([^']+)'/g,
      doubleQuoted: /"([^"]+)"/g,
      traceback: /, line \b\d+\b,/g,
      url: /(https?:\/\/[^\s]+)/g,
    };

    const spanSingleQuoted = `<span class="highlight">'<span onclick="copyElementToClipboard(this)">$1</span>'</span>`;
    const spanDoubleQuoted = `<span class="highlight">"<span onclick="copyElementToClipboard(this)">$1</span>"</span>`;
    const spanUrl = `<span class="highlight" onclick="copyElementToClipboard(this)">$1</span>`;

    const doubleQuoteMatches = line.match(regex.doubleQuoted);
    const tracebackMatches = line.match(regex.traceback);
    const urlMatches = line.match(regex.url);

    if (doubleQuoteMatches && tracebackMatches) {
      const lineNum = tracebackMatches.at(-1).replace(/, line |,/g, "");
      const filename = doubleQuoteMatches.at(-1).replace(/"/g, "");
      line = line.replace(regex.doubleQuoted, spanDoubleQuoted);
      line += this.createVsCodeLink(filename, lineNum);
    } else if (doubleQuoteMatches) {
      line = line.replace(regex.doubleQuoted, spanDoubleQuoted);
    } else if (urlMatches) {
      line = line.replace(regex.url, spanUrl);
    }

    return line.replace(regex.singleQuoted, spanSingleQuoted);
  }

  /**
   * Creates an anchor element that opens a file in VS Code.
   * @param {string} fileName - File path
   * @param {string} [traceLine] - Optional line number in the file
   * @returns {string} HTML string for the link
   */
  createVsCodeLink(fileName, traceLine) {
    const fileAttr = `file_name="${fileName}"`;
    const lineAttr = traceLine ? `line_number="${traceLine}"` : "";
    return `<a class="vscode-link"
    onclick="openInVsCode(this); return false;" title="open in VS Code"
    ${fileAttr} ${lineAttr}>open</a>`;
  }

  /**
   * Applies colorization based on log level markers `[LVL:XX]`.
   * @param {string} line - The log line
   * @returns {string} The colorized HTML line
   */
  colorizeLogLevels(line) {
    const match = line.match(/\[LVL:(\d+)\]/);
    const lineId = this._generateRandomId();
    let contentId = "";
    if (!match) return `<span log-line id="${lineId}">${line}</span>`;

    const [fullMatch, levelStr] = match;
    const level = parseInt(levelStr, 10);

    let spanClass = "";

    if (level >= 50) {
      spanClass = "critical";
      contentId = `error-${this.errorCounter++}`;
    } else if (level >= 40) {
      spanClass = "error";
      contentId = `error-${this.errorCounter++}`;
    } else if (level >= 30) {
      spanClass = "warning";
    } else if (level >= 20) {
      spanClass = "info";
    } else if (level >= 10) {
      spanClass = "debug";
    }

    line = `<span log-line id="${lineId}">${line.replace(fullMatch, "")}</span>`;

    return `</span><span id="${contentId}" class="${spanClass}">${line}`;
  }
}
