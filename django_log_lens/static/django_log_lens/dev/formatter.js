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
    this.errorCounter = 0;
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
      this.lines.pop(); // remove last line to avoid duplication on append
      this.totalLines -= 1;
    }

    this.lines.push(...newLines);
    this.lines = this.lines.slice(-this.limitLinesTo);
    this.totalLines += newLines.length;
    this.firstLine = this.totalLines > this.limitLinesTo ? this.totalLines - this.limitLinesTo + 1 : 1;
    this.totalRenderedLines = this.lines.length;
    this.renderLogContent();

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
   * Determines the CSS span class for a synthetic numeric level marker (e.g. `[LVL:40]`)
   * injected by the backend's LOG_FORMAT/LEVEL_PREFIX. The marker itself is meant to be
   * stripped from the visible line since it carries no information for a human reader.
   * @param {string} line - The log line
   * @returns {{spanClass: string, stripPrefix: string}|null} Level info, or null if no marker found.
   */
  extractNumericLevel(line) {
    const numericMatch = line.match(/\[LVL:(\d+)\]/i);
    if (!numericMatch) {
      return null;
    }
    const [fullMatch, levelStr] = numericMatch;
    const level = parseInt(levelStr, 10);

    let spanClass = "";
    if (level >= 50) {
      spanClass = "critical";
    } else if (level >= 40) {
      spanClass = "error";
    } else if (level >= 30) {
      spanClass = "warning";
    } else if (level >= 20) {
      spanClass = "info";
    } else if (level >= 10) {
      spanClass = "debug";
    }

    return { spanClass, stripPrefix: fullMatch };
  }

  /**
   * Determines the CSS span class for a human-readable text level prefix (e.g. `ERROR:` or
   * `[WARN]`). Unlike the numeric marker, the matched text is intentionally left in place
   * (stripPrefix is "") since it's part of the log line itself, not synthetic metadata.
   * @param {string} line - The log line
   * @returns {{spanClass: string, stripPrefix: string}|null} Level info, or null if no prefix found.
   */
  extractTextLevel(line) {
    const textPrefixMatch = line.match(
      /^\s*(?:\[(critical|fatal|error|warning|warn|info|debug|trace)\]|(critical|fatal|error|warning|warn|info|debug|trace))(?=\s|:|-|\]|$)\s*[:\-]?\s*/i
    );
    if (!textPrefixMatch) {
      return null;
    }
    const levelText = (textPrefixMatch[1] || textPrefixMatch[2]).toLowerCase();

    let spanClass = "";
    if (levelText === "critical" || levelText === "fatal") {
      spanClass = "critical";
    } else if (levelText === "error") {
      spanClass = "error";
    } else if (levelText === "warning" || levelText === "warn") {
      spanClass = "warning";
    } else if (levelText === "info") {
      spanClass = "info";
    } else if (levelText === "debug" || levelText === "trace") {
      spanClass = "debug";
    }

    return { spanClass, stripPrefix: "" };
  }

  /**
   * Allocates a unique error-anchor id (e.g. `error-3`) for error/critical levels so that
   * "jump to error" navigation can target this line, incrementing errorCounter as a side effect.
   * @param {string} spanClass
   * @returns {string} The content id, or "" for non-error levels.
   */
  allocateErrorAnchorId(spanClass) {
    if (spanClass !== "critical" && spanClass !== "error") {
      return "";
    }
    const contentId = `error-${this.errorCounter}`;
    this.errorCounter++;
    return contentId;
  }

  /**
   * Applies colorization based on log level markers (`[LVL:XX]` or text prefixes like `ERROR`).
   * @param {string} line - The log line
   * @returns {string} The colorized HTML line
   */
  colorizeLogLevels(line) {
    const lineId = this._generateRandomId();
    const levelInfo = this.extractNumericLevel(line) || this.extractTextLevel(line);

    if (!levelInfo) {
      return `<span log-line id="${lineId}">${line}</span>`;
    }

    const { spanClass, stripPrefix } = levelInfo;
    const contentId = this.allocateErrorAnchorId(spanClass);
    const wrappedLine = `<span log-line id="${lineId}">${line.replace(stripPrefix, "")}</span>`;
    const idAttr = contentId ? ` id="${contentId}"` : "";
    return `</span><span${idAttr} class="${spanClass}">${wrappedLine}`;
  }
}
