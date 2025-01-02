const FETCH_INTERVAL_MS = 10000;

function setLogStatus(status) {
  if (!status) {
    status = "Idle";
  }
  $("#log-status").html(status);
}

async function fetchLog(hostname, logStream, txId, logApiCredentials) {
  setLogStatus("Fetching");
  let pagedResultsCookie = null;
  let logEntries = [];
  while (true) {
    const today = new Date().toISOString().slice(0, 10);
    let url = `https://${hostname}/monitoring/logs?_prettyPrint=false&source=${logStream}&transactionId=${txId}&beginTime=${today}T00:00:00Z&endTime=${today}T23:59:59Z`;
    console.log("Calling Log API on", url);
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
    console.log("got data", data);
    logEntries = logEntries.concat(data.result);
    pagedResultsCookie = data.pagedResultsCookie;
    if (!pagedResultsCookie) {
      break;
    }
  }
  setLogStatus(logEntries.length);
  return logEntries;
}

async function refreshAllLogs() {
  journeySessions.forEach((journeySession) => {
    const targetHost = journeySession.targetHost;
    refreshLog(targetHost.hostname, journeySession.txId, {
      key: targetHost.logKey,
      secret: targetHost.logSecret,
    });
  });
}

async function refreshLog(hostname, txId, logApiCredentials) {
  const logEntries = await fetchLog(
    hostname,
    "am-core",
    txId,
    logApiCredentials
  );

  let sortedEntries = {};

  logEntries.forEach((logEntry) => {
    const entryTxId = logEntry.payload.transactionId.split("/")[0];
    if (!sortedEntries[entryTxId]) {
      sortedEntries[entryTxId] = [];
    }
    sortedEntries[entryTxId].push(logEntry);
  });

  Object.keys(sortedEntries).forEach((entryTxId) => {
    let logDiv = document.getElementById(`log-${entryTxId}`);
    if (logDiv) {
      logDiv.innerHTML = JSON.stringify(sortedEntries[entryTxId], null, 2);
    }
  });
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

let journeySessions = [];

function addJourneySession(targetHost, txId) {
  var journeyDiv = document.getElementById(txId);
  if (journeyDiv) {
    return journeyDiv;
  }

  journeySessions.push({ targetHost: targetHost, txId: txId });

  const parentDiv = document.getElementById("journeyRequests");

  journeyDiv = document.createElement("div");
  journeyDiv.className = "journey-container";
  journeyDiv.id = txId;

  let journeyTitleDiv = document.createElement("div");
  journeyTitleDiv.className = "journey-title";
  journeyTitleDiv.innerHTML = `Start - ${targetHost.hostname}/${txId}`;
  journeyDiv.appendChild(journeyTitleDiv);

  if (parentDiv) {
    parentDiv.appendChild(journeyDiv);
  } else {
    console.error("Parent div not found!");
  }

  return journeyDiv;
}

var requestPayloads = {};

function formatHeaders(headers) {
  return "Headers: " + JSON.stringify(headers);
}

function formatBody(body) {
  return "Body: " + JSON.stringify(body);
}

function syntaxHighlight(json) {
  return json.replace(
    /(\".*?\")|\b(true|false|null)\b|(-?\d+(\.\d+)?)/g,
    (match) => {
      if (/^\".*\"$/.test(match)) {
        if (/^\".*\":$/.test(match)) {
          return `<span class="json-key">${match}</span>`;
        } else {
          return `<span class="json-string">${match}</span>`;
        }
      }
      if (/true|false/.test(match)) {
        return `<span class="json-boolean">${match}</span>`;
      }
      if (/null/.test(match)) {
        return `<span class="json-null">${match}</span>`;
      }
      return `<span class="json-number">${match}</span>`;
    }
  );
}

function addCollapsedContainer(parentContainer, container, title, expand) {
  const rightArrow = "&#9654;";
  let expanderSpan = document.createElement("span");
  expanderSpan.className = "expander-arrow";
  expanderSpan.innerHTML = rightArrow;

  let titleDiv = document.createElement("div");
  titleDiv.className = "stage-title";
  titleDiv.appendChild(expanderSpan);
  let titleText = document.createTextNode(title);
  titleText.className = "stage-title-text";
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
  // Request payload
  const jsonPayload = details.request.postData;
  const requestPayload = jsonPayload ? JSON.parse(jsonPayload.text) : null;
  // txId

  const txId = getTxId(details.request);

  // Add to debug pane

  const journeyDiv = addJourneySession(targetHost, txId.base);

  const stageDiv = document.createElement("div");
  stageDiv.id = txId.full;

  stageDiv.className = "journey-stage";

  const stageContentDiv = document.createElement("div");
  stageContentDiv.className = "stage-content";

  addCollapsedContainer(stageDiv, stageContentDiv, `Request [${txId.request}]`);

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

  addCollapsedContainer(requestDiv, requestDetailsDiv, "Request details");

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

  addCollapsedContainer(responseDiv, responseDetailsDiv, "Response details");

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
  logEntriesDiv.innerText = "Pending logs";

  addCollapsedContainer(logsDiv, logEntriesDiv, "Logs", getLogConfig().expand);
  journeyDiv.appendChild(stageDiv);
  journeyDiv.appendChild(logsDiv);
  // if (getLogConfig().collapse) {
  //   const logsDiv = document.createElement("div");
  //   addCollapsedContainer(logsDiv, logEntriesDiv, "Logs");
  //   stageContentDiv.appendChild(logsDiv);
  //   journeyDiv.appendChild(stageDiv);
  // } else {
  //   journeyDiv.appendChild(stageDiv);
  //   journeyDiv.appendChild(logEntriesDiv);
}

// const logEntriesDiv = document.createElement("div");
// logEntriesDiv.id = `log-${txId.full}`;
// logEntriesDiv.className = "json-container";
// logsDiv.appendChild(logEntriesDiv);

// let logTitleDiv = document.createElement("div");
// logTitleDiv.className = "logs-title";
// logTitleDiv.innerHTML = `Logs`;
// logsDiv.appendChild(logTitleDiv);

// const logEntriesDiv = document.createElement("div");
// logEntriesDiv.id = `log-${txId.full}`;
// logEntriesDiv.className = "json-container";
// logsDiv.appendChild(logEntriesDiv);

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

  console.log("adding stage", JSON.stringify(targetHost));

  addStage(targetHost, requestDetails);
});

document
  .getElementById("log-refresh-button")
  .addEventListener("click", function (event) {
    refreshAllLogs();
  });

chrome.runtime.onMessage.addListener((event) => {
  console.log("event", JSON.stringify(event));
  if (event.type === "search") {
    if (event.payload.action === "performSearch") {
      performSearch(event.payload.queryString);
      //event.callback({ matches: 16 });
      //event.payload.panel.setSearchResults(16, 0);
    } else if (event.payload.action === "nextResult") {
      navigateSearch(1);
    } else if (event.payload.action === "previousResult") {
      navigateSearch(-1);
    } else if (event.payload.action === "cancelSearch") {
      cancelSearch();
    }
  }
});

// function performSearch(query) {
//   const resultsDiv = document.getElementById("results");

//   if (!query) {
//     resultsDiv.textContent = "No search query provided.";
//     return;
//   }

//   // Highlight and scroll to matches
//   const regex = new RegExp(query, "gi");
//   const matches = [...content.matchAll(regex)];

//   if (matches.length > 0) {
//     let highlightedContent = content.replace(
//       regex,
//       (match) => `<mark>${match}</mark>`
//     );
//     resultsDiv.innerHTML = highlightedContent;

//     // Scroll to the first match
//     const firstMatch = document.querySelector("mark");
//     if (firstMatch) {
//       firstMatch.scrollIntoView({ behavior: "smooth", block: "center" });
//     }
//   } else {
//     resultsDiv.textContent = `No results found for "${query}".`;
//   }
// }

// function performSearch(query) {
//   console.log(`Searching for: "${query}"`);

//   // Add logic to search and display results here
// }

// function cancelSearch() {
//   console.log("Search canceled.");
// }

// function nextSearchResult() {
//   console.log("Search next.");
// }

// function previousSearchResult() {
//   console.log("Search previous.");
// }

function performSearch(queryString, panel) {
  console.log(`Searching for: "${queryString}"`);
  // Add logic to search and display results here
}

function cancelSearch(panel) {
  console.log("Search canceled.");
}

function navigateSearch(index, panel) {
  console.log("Navigate");
}
