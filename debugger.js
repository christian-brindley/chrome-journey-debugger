const LOG_FETCH_INTERVAL_MS = 10000;
const LOG_COMPLETE_WINDOW_MS = 2000;
const LOG_END_TIME_GRACE_S = 1;

function setLogStatus(status) {
  if (!status) {
    status = "Idle";
  }
  $("#log-status").html(status);
}

async function fetchLog(hostname, logStream, txId, logApiCredentials, endTime) {
  let pagedResultsCookie = null;
  let logEntries = [];
  while (true) {
    const today = new Date().toISOString().slice(0, 10);
    let url = `https://${hostname}/monitoring/logs?_prettyPrint=false&source=${logStream}&transactionId=${txId}&beginTime=${today}T00:00:00Z&endTime=${endTime}`;

    if (pagedResultsCookie) {
      url += `&_pagedResultsCookie=${pagedResultsCookie}`;
    }
    const response = await fetch(url, {
      headers: {
        "x-api-key": logApiCredentials.key,
        "x-api-secret": logApiCredentials.secret,
      },
    });

    if (response.status !== 200) {
      console.log(
        "Looks like there was a problem. Status Code: " + response.status
      );
      return null;
    }

    const data = await response.json();
    logEntries = logEntries.concat(data.result);
    pagedResultsCookie = data.pagedResultsCookie;
    if (!pagedResultsCookie) {
      break;
    }
  }

  return logEntries;
}

let logRefreshing = false;

async function refreshAllLogs(force) {
  if (logRefreshing) {
    console.log("Already refreshing");
    return;
  }

  logRefreshing = true;
  setLogStatus("Fetching logs");
  let refreshed = false;
  for (const txId of Object.keys(requestHistory)) {
    const request = requestHistory[txId];
    if (logsComplete(request) && !force) {
      continue;
    }
    refreshed = true;
    const targetHost = request.targetHost;
    request.logs = await fetchLog(
      targetHost.hostname,
      "am-everything",
      txId,
      { key: targetHost.logKey, secret: targetHost.logSecret },
      request.endTime
    );
  }
  setLogStatus();
  if (refreshed) {
    displayLogs();
  }
  logRefreshing = false;
}

function getLogFilter() {
  let filter = {};

  filter.level = $("#filter-log-level").val();
  const filterText = $("#filter-log-text").val();
  if (filterText && filterText.length > 0) {
    filter.text = filterText;
  }
  return filter;
}

function searchHighlight(inputText) {
  if (
    !searchState.currentSearchQuery ||
    searchState.currentSearchQuery === ""
  ) {
    return inputText;
  }
  const escapedSearchText = searchState.currentSearchQuery.replaceAll(
    "*",
    "\\*"
  );
  const regex = new RegExp(escapedSearchText, "gi");
  return inputText.replace(regex, (match) => `<mark>${match}</mark>`);
}

function escapeHtml(inputText) {
  return inputText
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;");
}

function nodeCompletionLogs(logs) {
  return logs.filter(
    (logEntry) =>
      logEntry.source === "am-authentication" &&
      logEntry.payload.eventName === "AM-NODE-LOGIN-COMPLETED"
  );
}

function displayLogs() {
  Object.keys(requestHistory).forEach((txId) => {
    const request = requestHistory[txId];
    if (!request.logs) {
      console.error("No logs for txid", txId);
      return;
    }

    $(`#log-${txId}`).html(
      searchHighlight(
        escapeHtml(
          JSON.stringify(filterLogs(request.logs, getLogFilter()), null, 2)
        )
      )
    );

    const continuationIndicator = logsComplete(request) ? "" : "...";

    if (request.logs.length > 0) {
      $(`#log-div-${txId}-title`).html(
        `Logs <b>[${request.logs.length}${continuationIndicator}]</b>`
      );
    }

    const nodeLogs = nodeCompletionLogs(request.logs);
    if (nodeLogs.length > 0) {
      const nodeListDiv = document.getElementById(`node-list-${txId}`);
      if (!nodeListDiv) {
        console.error("Node list div not found");
      } else {
        nodeListDiv.innerHTML = "";
        nodeListDiv.appendChild(nodesTable(nodeLogs));
      }
      $(`#node-div-${txId}-title`).html(
        `Nodes <b>[${nodeLogs.length}${continuationIndicator}]</b>`
      );
    }
  });
}

function filterLogs(logs, filter) {
  if (!filter) {
    return logs;
  }
  let filteredLogs = logs;
  let levels = null;
  if (filter.level) {
    switch (filter.level) {
      case "ERROR":
        levels = ["ERROR"];
        break;
      case "WARN":
        levels = ["WARN", "ERROR"];
        break;
      case "INFO":
        levels = ["INFO", "WARN", "ERROR"];
        break;
      default:
    }

    if (levels) {
      filteredLogs = filteredLogs.filter((logEntry) =>
        levels.includes(logEntry.payload.level)
      );
    }
  }

  if (filter.text) {
    filteredLogs = filteredLogs.filter((logEntry) =>
      JSON.stringify(logEntry).toLowerCase().includes(filter.text.toLowerCase())
    );
  }
  return filteredLogs;
}

function logsComplete(request) {
  if (!request.logs || request.logs.length === 0) {
    return false;
  }

  const lastLogTime = new Date(request.logs[request.logs.length - 1].timestamp);
  const requestEndTime = new Date(request.endTime);

  const timeGap = requestEndTime - lastLogTime;
  return timeGap < LOG_COMPLETE_WINDOW_MS;
}

function getTxId(request) {
  const txIdHeader = request.headers.find(
    (header) => header.name.toLowerCase() === "x-forgerock-transactionid"
  );
  if (!txIdHeader) {
    console.error("No transaction id header");
    return null;
  }
  const txId = txIdHeader.value;

  return {
    full: txId,
    base: txId.substring(0, 36),
    request: txId.substring(37),
  };
}

let requestHistory = {};
let transactionHistory = [];

function addRequest(targetHost, txId) {
  var now = new Date();
  now.setSeconds(now.getSeconds() + LOG_END_TIME_GRACE_S);

  requestHistory[txId.full] = {
    targetHost: targetHost,
    endTime: now.toISOString(),
  };
}

var requestPayloads = {};

function formatHeaders(headers) {
  return "Headers: " + JSON.stringify(headers);
}

function formatBody(body) {
  return "Body: " + JSON.stringify(body);
}

function addCollapsedContainer(parentContainer, container, title, expand) {
  const rightArrow = "&#9654;";
  let expanderSpan = document.createElement("span");
  expanderSpan.className = "expander-arrow";
  expanderSpan.innerHTML = rightArrow;

  let titleDiv = document.createElement("div");
  titleDiv.className = "stage-title";
  titleDiv.appendChild(expanderSpan);
  let titleText = document.createElement("span");
  titleText.innerHTML = title;
  titleText.className = "stage-title-text";
  titleText.id = `${container.id}-title`;
  titleDiv.appendChild(titleText);
  titleDiv.addEventListener("click", () => {
    const isHidden = container.style.display === "none";
    container.style.display = isHidden ? "block" : "none";
    expanderSpan.style.transform = isHidden ? "rotate(90deg)" : "rotate(0deg)";
  });

  if (expand) {
    container.style.display = "block";
    expanderSpan.style.transform = "rotate(90deg)";
  } else {
    container.style.display = "none";
  }
  parentContainer.appendChild(titleDiv);
  parentContainer.appendChild(container);
}

function addStage(targetHost, details) {
  const journeyDiv = document.getElementById("journeyRequests");

  // Request payload
  const jsonPayload = details.request.postData;
  const requestPayload = jsonPayload ? JSON.parse(jsonPayload.text) : null;

  // txId

  const txId = getTxId(details.request);

  if (!transactionHistory.includes(txId.base)) {
    transactionHistory.push(txId.base);

    transactionDiv = document.createElement("div");
    transactionDiv.className = "transaction-header";
    transactionDiv.innerHTML = `Transaction ${txId.base}-*`;
    journeyDiv.appendChild(transactionDiv);
  }

  // Add to debug pane

  addRequest(targetHost, txId);

  const stageDiv = document.createElement("div");
  stageDiv.id = txId.full;

  stageDiv.className = "journey-stage";

  const stageContentDiv = document.createElement("div");
  stageContentDiv.className = "stage-content";

  addCollapsedContainer(
    stageDiv,
    stageContentDiv,
    `Step: ${txId.request}`,
    getLogConfig().expand
  );

  // Request details

  const requestDiv = document.createElement("div");
  const requestDetailsDiv = document.createElement("div");
  requestDetailsDiv.className = "stage-details";

  requestDetailsDiv.appendChild(createHeadersDiv(details.request.headers));

  // Request body

  const requestBodyDiv = document.createElement("div");
  requestBodyDiv.className = "http-body";
  requestBodyDiv.textContent = JSON.stringify(requestPayload, null, 2);
  requestDetailsDiv.appendChild(requestBodyDiv);

  addCollapsedContainer(requestDiv, requestDetailsDiv, "Request");

  stageContentDiv.appendChild(requestDiv);

  // Response details

  const responseDiv = document.createElement("div");
  const responseDetailsDiv = document.createElement("div");
  responseDetailsDiv.className = "stage-details";

  // Response headers

  responseDetailsDiv.appendChild(createHeadersDiv(details.response.headers));

  // Response body

  const responseBodyDivId = `response-body-${txId.full}`;
  const responseBodyDiv = document.createElement("div");
  responseBodyDiv.className = "http-body";
  responseBodyDiv.id = responseBodyDivId;

  responseDetailsDiv.appendChild(responseBodyDiv);

  addCollapsedContainer(responseDiv, responseDetailsDiv, "Response");

  stageContentDiv.appendChild(responseDiv);

  details.getContent((content) => {
    $(`#${responseBodyDivId}`).text(
      JSON.stringify(JSON.parse(content), null, 2)
    );
  });

  // Nodes

  const nodesDiv = document.createElement("div");
  const nodeEntriesDiv = document.createElement("div");
  nodeEntriesDiv.id = `node-list-${txId.full}`;
  nodeEntriesDiv.className = "node-list";
  nodeEntriesDiv.innerText = "...";

  const nodeDetailsDiv = document.createElement("div");
  nodeDetailsDiv.id = `node-div-${txId.full}`;
  nodeDetailsDiv.className = "stage-details";
  nodeDetailsDiv.appendChild(nodeEntriesDiv);

  addCollapsedContainer(nodesDiv, nodeDetailsDiv, "Nodes");
  stageContentDiv.appendChild(nodesDiv);

  // Logs

  const logsDiv = document.createElement("div");
  const logEntriesDiv = document.createElement("div");
  logEntriesDiv.id = `log-${txId.full}`;
  logEntriesDiv.className = "log-data";
  logEntriesDiv.innerText = "...";

  const logDetailsDiv = document.createElement("div");
  logDetailsDiv.id = `log-div-${txId.full}`;
  logDetailsDiv.className = "stage-details";

  logDetailsDiv.appendChild(logEntriesDiv);

  addCollapsedContainer(logsDiv, logDetailsDiv, "Logs", getLogConfig().expand);

  stageContentDiv.appendChild(logsDiv);
  journeyDiv.appendChild(stageDiv);
}

const journeyDiv = document.getElementById("journeyRequests");

function createHeadersDiv(headers) {
  let headersDiv = document.createElement("div");
  headersDiv.className = "http-headers";

  const table = document.createElement("table");

  const tbody = document.createElement("tbody");
  headers.forEach((header) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    nameCell.className = "http-header-name";
    nameCell.textContent = header.name;
    row.appendChild(nameCell);

    const valueCell = document.createElement("td");
    valueCell.className = "http-header-value";
    valueCell.textContent = header.value;
    row.appendChild(valueCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  let headerContentDiv = document.createElement("div");
  headerContentDiv.className = "http-headers-content";
  headersDiv.appendChild(table);

  return headersDiv;
}

function nodesTable(logEntries) {
  let headersDiv = document.createElement("div");

  const table = document.createElement("table");
  table.className = "node-list-table";

  const tbody = document.createElement("tbody");

  // const headerRow = document.createElement("tr");
  // headerRow.className = "node-list-table-header";
  // headerRow.innerHTML =
  //   "<th>Journey</th><th>Node</th><th>Type</th><th>Outcome</th>";
  // tbody.appendChild(headerRow);

  logEntries.forEach((logEntry) => {
    if (
      logEntry.source !== "am-authentication" ||
      logEntry.payload.eventName !== "AM-NODE-LOGIN-COMPLETED"
    ) {
      return;
    }
    const info = logEntry.payload.entries[0].info;
    const row = document.createElement("tr");

    const treeCell = document.createElement("td");
    treeCell.textContent = info.treeName;
    row.appendChild(treeCell);

    const nameCell = document.createElement("td");
    nameCell.textContent = info.displayName;
    row.appendChild(nameCell);

    const typeCell = document.createElement("td");
    typeCell.textContent = info.nodeType;
    row.appendChild(typeCell);

    const outcomeCell = document.createElement("td");
    outcomeCell.textContent = info.nodeOutcome;
    outcomeCell.className = "filler-column";
    row.appendChild(outcomeCell);

    tbody.appendChild(row);
  });
  table.appendChild(tbody);

  return table;
}

chrome.devtools.network.onRequestFinished.addListener(function (
  requestDetails
) {
  const targetUrl = new URL(requestDetails.request.url);
  if (!targetUrl.pathname.endsWith("/authenticate")) {
    return;
  }
  const targetHost = getTargetHostByHostname(targetUrl.hostname);
  if (!targetHost) {
    return;
  }

  addStage(targetHost, requestDetails);
});

document
  .getElementById("log-refresh-button")
  .addEventListener("click", function (event) {
    refreshAllLogs(true);
  });

document
  .getElementById("clear-button")
  .addEventListener("click", function (event) {
    location.reload();
  });

document
  .getElementById("filter-log-level")
  .addEventListener("change", function (event) {
    displayLogs();
  });

document
  .getElementById("filter-log-text")
  .addEventListener("change", function (event) {
    displayLogs();
  });

chrome.runtime.onMessage.addListener((event) => {
  if (event.type === "search") {
    if (event.payload.action === "performSearch") {
      performSearch(event.payload.queryString);
    } else if (event.payload.action === "nextSearchResult") {
      navigateSearch(1);
    } else if (event.payload.action === "previousSearchResult") {
      navigateSearch(-1);
    } else if (event.payload.action === "cancelSearch") {
      cancelSearch();
    }
  }
});

let searchState = {
  currentSearchQuery: null,
  results: null,
  resultsCursor: null,
};

function scrollToSearchResult(result) {
  result.scrollIntoView({ behavior: "instant", block: "center" });
}

function performSearch(query) {
  searchState.currentSearchQuery = query;
  displayLogs();
  searchState.results = document.querySelectorAll("mark");
  searchState.resultsCursor = 0;

  if (searchState.results.length > 0) {
    const firstResult = searchState.results.item(0);
    firstResult.className = "search-result-current";
    scrollToSearchResult(firstResult);
  }
}

function cancelSearch(panel) {
  console.log("Search canceled.");
  searchState.currentSearchQuery = null;
  displayLogs();
}

function navigateSearch(index) {
  if (!searchState.results) {
    return;
  }

  const currentResult = searchState.results.item(searchState.resultsCursor);
  currentResult.className = "search-result";
  searchState.resultsCursor += index;
  if (searchState.resultsCursor < 0) {
    searchState.resultsCursor = searchState.results.length - 1;
  } else if (searchState.resultsCursor === searchState.results.length) {
    searchState.resultsCursor = 0;
  }

  const newResult = searchState.results.item(searchState.resultsCursor);
  newResult.className = "search-result-current";
  scrollToSearchResult(newResult);
}

function autoLog() {
  if (getLogConfig().automatic) {
    refreshAllLogs();
  }

  const refreshInterval = getLogConfig().refreshInterval;
  if (refreshInterval) {
    setTimeout(() => {
      autoLog();
    }, getLogConfig().refreshInterval * 1000);
  }
}

autoLog();
