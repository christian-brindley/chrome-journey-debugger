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
  journeyDiv.id = txId;

  let journeyTitleDiv = document.createElement("div");
  journeyTitleDiv.className = "journey-title";
  journeyTitleDiv.innerHTML = `Host [${targetHost.hostname}] Transaction [${txId}]}`;
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

  // stageExpanderSpanId = `${stageDiv.id}-expander`;
  //stageContentDivId = `${stageDiv.id}-content`;

  let stageExpanderSpan = document.createElement("span");
  stageExpanderSpan.className = "expander-arrow";
  stageExpanderSpan.innerHTML = "&#9654;";
  //stageExpanderSpan.id = stageExpanderSpanId;

  let titleDiv = document.createElement("div");
  titleDiv.className = "stage-title";
  titleDiv.appendChild(stageExpanderSpan);
  let titleText = document.createTextNode(`Stage [${txId.request}]`);
  titleText.className = "stage-title-text";
  titleDiv.appendChild(titleText);

  stageDiv.appendChild(titleDiv);

  let stageContentDiv = document.createElement("div");
  stageContentDiv.className = "stage-content";
  stageContentDiv.style.display = "none";
  //stageContentDiv.id = stageContentDivId;
  stageDiv.appendChild(stageContentDiv);

  titleDiv.addEventListener("click", () => {
    //console.log("toggling", stageExpanderSpanId);
    const isHidden = stageContentDiv.style.display === "none";
    stageContentDiv.style.display = isHidden ? "block" : "none";
    stageExpanderSpan.style.transform = isHidden
      ? "rotate(90deg)"
      : "rotate(0deg)";

    // stageExpanderSpan.innerHTML = isHidden ? "&#9660;" : "&#9654;";
    // if (stageDiv.firstChild.style.display === "none") {
    //   stageDiv.firstChild.style.display = "block";
    //   stageExpanderSpan.textContent = "&#9660;";
    // } else {
    //   stageDiv.firstChild.style.display = "none";
    //   stageExpanderSpan.textContent = "&#9654;"; // Change arrow to right
    // }

    // if (isHidden) {
    //   stageContentDiv.style.display = "block";
    //   stageExpanderSpan.innerHTML = "&#9660;";
    // } else {
    //   stageContentDiv.style.display = "hidden";
    //   stageExpanderSpan.innerHTML = "&#9654;";
    // }
  });

  let requestDiv = document.createElement("div");
  stageContentDiv.appendChild(requestDiv);

  let requestTitleDiv = document.createElement("div");
  requestTitleDiv.className = "http-request-title";
  requestTitleDiv.innerHTML = "Request details";
  requestDiv.appendChild(requestTitleDiv);

  requestDiv.appendChild(createHeadersDiv(details.request.headers));

  const requestBodyDiv = document.createElement("div");
  requestBodyDiv.className = "json-container";
  requestBodyDiv.textContent = JSON.stringify(requestPayload, null, 2);
  requestDiv.appendChild(requestBodyDiv);

  let responseDiv = document.createElement("div");
  stageContentDiv.appendChild(responseDiv);

  let responseTitleDiv = document.createElement("div");
  responseTitleDiv.className = "http-request-title";
  responseTitleDiv.innerHTML = "Response details";
  responseDiv.appendChild(responseTitleDiv);

  responseDiv.appendChild(createHeadersDiv(details.response.headers));

  const responseBodyDivId = `response-body-${txId.full}`;
  const responseBodyDiv = document.createElement("div");
  responseBodyDiv.className = "json-container";
  responseBodyDiv.id = responseBodyDivId;
  responseDiv.appendChild(responseBodyDiv);

  let logsDiv = document.createElement("div");
  stageContentDiv.appendChild(logsDiv);

  let logTitleDiv = document.createElement("div");
  logTitleDiv.className = "logs-title";
  logTitleDiv.innerHTML = `Logs`;
  logsDiv.appendChild(logTitleDiv);

  const logEntriesDiv = document.createElement("div");
  logEntriesDiv.id = `log-${txId.full}`;
  logEntriesDiv.className = "json-container";
  logsDiv.appendChild(logEntriesDiv);

  journeyDiv.appendChild(stageDiv);

  details.getContent((content) => {
    $(`#${responseBodyDivId}`).text(
      JSON.stringify(JSON.parse(content), null, 2)
    );
  });
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

  console.log("adding stage", JSON.stringify(targetHost));

  addStage(targetHost, requestDetails);
});

document
  .getElementById("log-refresh-button")
  .addEventListener("click", function (event) {
    refreshAllLogs();
  });
