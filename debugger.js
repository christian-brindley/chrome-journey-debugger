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
    //console.log("Calling Log API on", url);
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
    //console.log("got data", data);
    logEntries = logEntries.concat(data.result);
    pagedResultsCookie = data.pagedResultsCookie;
    if (!pagedResultsCookie) {
      break;
    }
  }

  return logEntries;
}

let logRefreshing = false;

async function refreshAllLogs() {
  if (logRefreshing) {
    console.log("Already refreshing");
    return;
  }

  logRefreshing = true;
  setLogStatus("Fetching logs");
  let refreshed = false;
  for (const txId of Object.keys(requestHistory)) {
    const request = requestHistory[txId];
    if (logsComplete(request)) {
      continue;
    }
    refreshed = true;
    const targetHost = request.targetHost;
    request.logs = await fetchLog(
      targetHost.hostname,
      "am-core",
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
  const regex = new RegExp(searchState.currentSearchQuery, "gi");
  // const matches = [...inputText.matchAll(regex)];
  // if (matches.length > 0) {
  inputText = inputText.replace(regex, (match) => `<mark>${match}</mark>`);
  // }

  return inputText;
}

function escapeHtml(inputText) {
  return inputText
    .replace("&", "&amp;")
    .replace("<", "&lt;")
    .replace(">", "&gt;");
}

function displayLogs() {
  Object.keys(requestHistory).forEach((txId) => {
    const request = requestHistory[txId];
    $(`#log-${txId}`).html(
      searchHighlight(
        escapeHtml(
          JSON.stringify(filterLogs(request.logs, getLogFilter()), null, 2)
        )
      )
    );
    const continuationIndicator = logsComplete(request) ? "" : "...";
    $(`#log-${txId}-title`).html(
      `Log [${request.logs.length}${continuationIndicator}]`
    );
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
  //console.log("gap", timeGap);
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

  addCollapsedContainer(stageDiv, stageContentDiv, txId.request);

  // Request details

  const requestDiv = document.createElement("div");
  const requestDetailsDiv = document.createElement("div");
  requestDetailsDiv.className = "request-details";

  // Request headers

  const requestHeadersHeaderDiv = document.createElement("div");
  requestHeadersHeaderDiv.innerHTML = "Request headers";
  requestHeadersHeaderDiv.className = "request-section-title";
  requestDetailsDiv.appendChild(requestHeadersHeaderDiv);
  requestDetailsDiv.appendChild(createHeadersDiv(details.request.headers));

  // Request body

  const requestBodyHeaderDiv = document.createElement("div");
  requestBodyHeaderDiv.innerHTML = "Request payload";
  requestBodyHeaderDiv.className = "request-section-title";
  requestDetailsDiv.appendChild(requestBodyHeaderDiv);

  const requestBodyDiv = document.createElement("div");
  requestBodyDiv.className = "json-container";
  requestBodyDiv.textContent = JSON.stringify(requestPayload, null, 2);
  requestDetailsDiv.appendChild(requestBodyDiv);

  addCollapsedContainer(requestDiv, requestDetailsDiv, "Request");

  stageContentDiv.appendChild(requestDiv);

  // Response details

  const responseDiv = document.createElement("div");
  const responseDetailsDiv = document.createElement("div");
  responseDetailsDiv.className = "request-details";

  // Response headers

  const responseHeadersHeaderDiv = document.createElement("div");
  responseHeadersHeaderDiv.innerHTML = "Response headers";
  responseHeadersHeaderDiv.className = "request-section-title";
  responseDetailsDiv.appendChild(responseHeadersHeaderDiv);
  responseDetailsDiv.appendChild(createHeadersDiv(details.response.headers));

  // Response body

  const responseBodyHeaderDiv = document.createElement("div");
  responseBodyHeaderDiv.innerHTML = "Response payload";
  responseBodyHeaderDiv.className = "request-section-title";
  responseDetailsDiv.appendChild(responseBodyHeaderDiv);

  const responseBodyDivId = `response-body-${txId.full}`;
  const responseBodyDiv = document.createElement("div");
  responseBodyDiv.className = "json-container";
  responseBodyDiv.id = responseBodyDivId;

  responseDetailsDiv.appendChild(responseBodyDiv);

  addCollapsedContainer(responseDiv, responseDetailsDiv, "Response");

  stageContentDiv.appendChild(responseDiv);

  details.getContent((content) => {
    $(`#${responseBodyDivId}`).text(
      JSON.stringify(JSON.parse(content), null, 2)
    );
  });

  // Logs

  const logsDiv = document.createElement("div");
  logsDiv.className = "log-container";

  const logEntriesDiv = document.createElement("div");
  logEntriesDiv.id = `log-${txId.full}`;
  logEntriesDiv.className = "json-container";
  logEntriesDiv.innerText = "...";

  addCollapsedContainer(
    logsDiv,
    logEntriesDiv,
    "Log [...]",
    getLogConfig().expand
  );
  journeyDiv.appendChild(stageDiv);
  journeyDiv.appendChild(logsDiv);
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
    nameCell.textContent = header.name;
    row.appendChild(nameCell);

    const valueCell = document.createElement("td");
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

  //console.log("adding stage", JSON.stringify(targetHost));

  addStage(targetHost, requestDetails);
});

document
  .getElementById("log-refresh-button")
  .addEventListener("click", function (event) {
    refreshAllLogs();
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
  console.log("event", JSON.stringify(event));
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

function scrollToCurrentSearchResult() {
  console.log("scrolling to item", searchState.resultsCursor);
  if (searchState.results) {
    searchState.results
      .item(searchState.resultsCursor)
      .scrollIntoView({ behavior: "instant", block: "center" });
  }
}

function performSearch(query) {
  searchState.currentSearchQuery = query;
  displayLogs();
  searchState.results = document.querySelectorAll("mark");
  searchState.resultsCursor = 0;

  scrollToCurrentSearchResult();
}

function cancelSearch(panel) {
  console.log("Search canceled.");
  searchState.currentSearchQuery = null;
  displayLogs();
}

function navigateSearch(index) {
  searchState.resultsCursor += index;
  if (searchState.resultsCursor < 0) {
    searchState.resultsCursor = searchState.results.length - 1;
  } else if (searchState.resultsCursor > searchState.results.length) {
    searchState.resultsCursor = 0;
  }
  scrollToCurrentSearchResult();
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
