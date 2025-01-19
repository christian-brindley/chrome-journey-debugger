const LOG_FETCH_INTERVAL_MS = 10000;
const LOG_COMPLETE_WINDOW_MS = 2000;
const LOG_END_TIME_GRACE_S = 1;

function setLogStatus(status) {
  if (!status) {
    status = "Idle";
  }
  $("#log-status").html(status);
}

function loadSessionInfo(authenticateUrl, sessionInfoDiv) {
  let sessionUrl = authenticateUrl;
  sessionUrl.search = "_action=getSessionInfo";
  sessionUrl.pathname = sessionUrl.pathname.replace(
    "/authenticate",
    "/sessions"
  );
  fetch(sessionUrl.href, {
    method: "POST",
    headers: {
      "Accept-API-Version": "resource=4.0",
      "Content-Type": "application/json",
    },
  }).then((response) => {
    response.json().then((responseObject) => {
      sessionInfoDiv.textContent = JSON.stringify(responseObject, null, 2);
    });
  });
}

async function fetchLog(hostname, source, txId, logApiCredentials, endTime) {
  let pagedResultsCookie = null;
  let logEntries = [];
  while (true) {
    const today = new Date().toISOString().slice(0, 10);
    let url = `https://${hostname}/monitoring/logs?_prettyPrint=false&source=${source}&transactionId=${txId}&beginTime=${today}T00:00:00Z&endTime=${endTime}`;

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
    //console.log("Already refreshing");
    return;
  }

  logRefreshing = true;
  setLogStatus("Fetching logs");
  try {
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
        getLogConfig().sources.join(","),
        txId,
        { key: targetHost.logKey, secret: targetHost.logSecret },
        request.endTime
      );
    }

    if (refreshed) {
      displayLogs();
    }
  } catch (e) {
    console.error("Exception while refresh logs:", e);
  }
  setLogStatus();
  logRefreshing = false;
}

function getLogFilter() {
  let filter = {};

  filter.level = $("#filter-log-level").val();
  filter.source = $("#filter-log-source").val();
  const filterText = $("#filter-log-text").val();
  if (filterText && filterText.length > 0) {
    filter.text = filterText;
  }
  return filter;
}

function searchHighlight(inputText) {
  const query = getCurrentSearchQuery();
  if (!query || query === "") {
    return inputText;
  }
  const escapedSearchText = query.replaceAll("*", "\\*");
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
      //console.error("No logs for txid", txId);
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
  if (filter.level && filter.level !== "") {
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

  if (filter.source && filter.source !== "") {
    filteredLogs = filteredLogs.filter(
      (logEntry) => logEntry.source === filter.source
    );
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

  // const lastLogTime = new Date(request.logs[request.logs.length - 1].timestamp);
  // const requestEndTime = new Date(request.endTime);

  // const timeGap = requestEndTime - lastLogTime;
  // return timeGap < LOG_COMPLETE_WINDOW_MS;
  return (
    request.logs.find((logEntry) => {
      logEntry.source === "am-access" &&
        logEntry.eventName === "AM-ACCESS-OUTCOME";
    }) !== null
  );
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
    performSearch(false);
  });

  if (expand) {
    container.style.display = "block";
    expanderSpan.style.transform = "rotate(90deg)";
  } else {
    container.style.display = "none";
  }
  parentContainer.appendChild(titleDiv);
  parentContainer.appendChild(container);

  return titleText;
}

function addStage(targetHost, targetUrl, details) {
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

  let title = txId.request;
  if (details.response.status != 200) {
    title = `<span style="color: red">${title}</span>`;
  }

  const requestTitleText = addCollapsedContainer(
    stageDiv,
    stageContentDiv,
    title,
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

  addCollapsedContainer(
    responseDiv,
    responseDetailsDiv,
    `Response (${details.response.status})`
  );

  stageContentDiv.appendChild(responseDiv);

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

  details.getContent((content) => {
    const bodyObject = JSON.parse(content);
    $(`#${responseBodyDivId}`).text(JSON.stringify(bodyObject, null, 2));
    // TODO: handle cookie only session
    if (bodyObject.tokenId) {
      requestTitleText.innerHTML = `<span style="color: green">${requestTitleText.innerHTML}</span>`;

      const sessionDiv = document.createElement("div");
      const sessionInfoDiv = document.createElement("div");
      sessionInfoDiv.id = `session-info-${txId.full}`;
      sessionInfoDiv.className = "session-properties";
      sessionInfoDiv.innerText = "...";

      const sessionDetailsDiv = document.createElement("div");
      sessionDetailsDiv.id = `session-div-${txId.full}`;
      sessionDetailsDiv.className = "session-details";
      sessionDetailsDiv.appendChild(sessionInfoDiv);

      addCollapsedContainer(sessionDiv, sessionDetailsDiv, "Session");
      stageContentDiv.appendChild(sessionDiv);
      loadSessionInfo(targetUrl, sessionInfoDiv);
    }
  });

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

  logEntries.forEach((logEntry) => {
    if (
      logEntry.source !== "am-authentication" ||
      logEntry.payload.eventName !== "AM-NODE-LOGIN-COMPLETED"
    ) {
      return;
    }

    const timestampDate = new Date(logEntry.timestamp);
    const timestamp = `${String(timestampDate.getHours()).padStart(
      2,
      "0"
    )}:${String(timestampDate.getMinutes()).padStart(2, "0")}:${String(
      timestampDate.getSeconds()
    ).padStart(2, "0")}.${String(timestampDate.getMilliseconds()).padStart(
      3,
      "0"
    )}`;

    const info = logEntry.payload.entries[0].info;
    const row = document.createElement("tr");

    const timestampCell = document.createElement("td");
    timestampCell.textContent = timestamp;
    row.appendChild(timestampCell);

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
  addStage(targetHost, targetUrl, requestDetails);
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
  .getElementById("filter-log-source")
  .addEventListener("change", function (event) {
    displayLogs();
  });

document
  .getElementById("filter-log-text")
  .addEventListener("input", function (event) {
    displayLogs();
  });

document
  .getElementById("search-text")
  .addEventListener("input", function (event) {
    performSearch();
  });

document
  .getElementById("search-previous-button")
  .addEventListener("click", function (event) {
    navigateSearch(-1);
  });

document
  .getElementById("search-next-button")
  .addEventListener("click", function (event) {
    navigateSearch(1);
  });

chrome.runtime.onMessage.addListener((event) => {
  if (event.type === "search") {
    if (event.payload.action === "performSearch") {
      $("#search-text").val(event.payload.queryString);
      performSearch();
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
  results: null,
  resultsCursor: null,
};

function scrollToSearchResult(result) {
  result.scrollIntoView({ behavior: "instant", block: "center" });
}

function nextVisibleResult(direction) {
  for (
    let i = 0;
    i < searchState.results.length;
    i++, searchState.resultsCursor += direction
  ) {
    if (searchState.resultsCursor > searchState.results.length) {
      searchState.resultsCursor = 0;
    } else if (searchState.resultsCursor < 0) {
      searchState.resultsCursor = searchState.results.length - 1;
    }
    const result = searchState.results.item(searchState.resultsCursor);
    if ($(result).is(":visible")) {
      return result;
    }
  }
  return null;
}

function getCurrentSearchQuery() {
  return $("#search-text").val();
}

function switchSearchButtons(on) {
  ["previous", "next"].forEach((direction) => {
    const button = document.getElementById(`search-${direction}-button`);
    button.disabled = !on;
    button.className = on ? "button-enabled" : "button-disabled";
  });
}

function showResultsCount() {
  const count = searchState.results.length;
  if (count > 0) {
    switchSearchButtons(true);
    $("#search-location").text(`${searchState.resultsCursor + 1} of ${count}`);
  } else {
    switchSearchButtons(false);
    $("#search-location").text(
      getCurrentSearchQuery().length > 0 ? "No results" : ""
    );
  }
}

function performSearch(refreshOnly) {
  const query = getCurrentSearchQuery();
  displayLogs();
  searchState.results = Array.from(document.querySelectorAll("mark")).filter(
    (node) => $(node).is(":visible")
  );

  searchState.resultsCursor = 0;

  // const firstResult = nextVisibleResult(1);
  if (searchState.results && searchState.results.length > 0) {
    if (refreshOnly) {
      searchState.results[searchState.resultsCursor].className =
        "search-result-current";
    } else {
      searchState.results[0].className = "search-result-current";
      scrollToSearchResult(searchState.results[0]);
    }
  }
  showResultsCount();
}

function cancelSearch(panel) {
  displayLogs();
}

function navigateSearch(index) {
  if (!searchState.results) {
    return;
  }

  const currentResult = searchState.results[searchState.resultsCursor];
  if (currentResult) {
    currentResult.className = "search-result";
  }

  searchState.resultsCursor += index;
  if (searchState.resultsCursor < 0) {
    searchState.resultsCursor = searchState.results.length - 1;
  } else if (searchState.resultsCursor === searchState.results.length) {
    searchState.resultsCursor = 0;
  }

  // const newResult = searchState.results.item(searchState.resultsCursor);

  //const newResult = nextVisibleResult(index);
  const newResult = searchState.results[searchState.resultsCursor];
  if (newResult) {
    newResult.className = "search-result-current";
    scrollToSearchResult(newResult);
    showResultsCount();
  }
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
