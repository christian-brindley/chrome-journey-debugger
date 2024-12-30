const FETCH_INTERVAL_MS = 10000;

function getLogApiCredentials() {
  return {
    key: "bcd14565b7413adaccff8f2b652194e9",
    secret: "5318748c85d90b9785a7fe03f3178b96b703e84d9a3a323a874e0058458bb18b",
  };
}

function setStatus(status) {
  if (!status) {
    status = "Idle";
  }
  $("#current-status").html(status);
}

async function fetchLog(hostname, logStream, txId, creds) {
  setStatus("Fetching logs");
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
        "x-api-key": creds.key,
        "x-api-secret": creds.secret,
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
  setStatus();
  return logEntries;
}

async function refreshLog(hostname, txId) {
  const logEntries = await fetchLog(
    hostname,
    "am-core",
    txId,
    getLogApiCredentials()
  );

  let sortedEntries = {};

  logEntries.forEach((logEntry) => {
    const entryTxId = logEntry.payload.transactionId.split("/")[0];
    if (!sortedEntries[entryTxId]) {
      sortedEntries[entryTxId] = [];
    }
    sortedEntries[entryTxId].push(logEntry);
  });

  console.log(JSON.stringify(sortedEntries));

  Object.keys(sortedEntries).forEach((entryTxId) => {
    let logDiv = document.getElementById(`log-${entryTxId}`);
    if (logDiv) {
      logDiv.innerHTML = JSON.stringify(sortedEntries[entryTxId], null, 2);
    }
  });

  //   entriesDivId = document.getElementById(entriesDivId);
  //   entriesDivId.innerHTML = JSON.stringify(logEntries, null, 2);
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

function addJourney(hostname, txId) {
  var journeyDiv = document.getElementById(txId);
  if (journeyDiv) {
    return journeyDiv;
  }
  const parentDiv = document.getElementById("journeyRequests");

  journeyDiv = document.createElement("div");
  journeyDiv.id = txId;

  let journeyTitleDiv = document.createElement("div");
  journeyTitleDiv.className = "journey-title";
  journeyTitleDiv.innerHTML = `Transaction ${txId}`;
  journeyDiv.appendChild(journeyTitleDiv);

  journeyDiv.addEventListener("click", function (event) {
    refreshLog(hostname, txId);
  });

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

function addJourneyStep(details) {
  console.log("details", JSON.stringify(details));

  // Request payload
  const jsonPayload = details.request.postData;
  const requestPayload = jsonPayload ? JSON.parse(jsonPayload.text) : null;

  // txId

  const txId = getTxId(details.request);

  // Add to debug pane

  const hostname = new URL(details.request.url).hostname;
  const journeyDiv = addJourney(hostname, txId.base);

  const stepDiv = document.createElement("div");
  stepDiv.id = txId.full;
  stepDiv.textContent = `Step ${txId.request}`;

  //   const requestHeadersDiv = document.createElement("div");

  //   const prettyJSON = syntaxHighlight(
  //     JSON.stringify(details.request.headers, null, 2)
  //   );
  //   const jsonContainer = document.createElement("div");
  //   jsonContainer.className = "json-container";
  //   jsonContainer.innerHTML = prettyJSON;

  //   requestHeadersDiv.innerHTML = syntaxHighlight(
  //     JSON.stringify(details.request.headers),
  //     null,
  //     2
  //   );
  //   requestHeadersDiv.className = "json-container";
  //   stepDiv.append(requestHeadersDiv);

  stepDiv.append(harHeadersToTable(details.request.headers));

  const requestBodyDiv = document.createElement("div");
  requestBodyDiv.className = "json-container";
  requestBodyDiv.innerHTML = JSON.stringify(requestPayload, null, 2);

  stepDiv.append(requestBodyDiv);

  //   const responseHeadersDiv = document.createElement("div");
  //   responseHeadersDiv.textContent = formatHeaders(details.response.headers);
  //   stepDiv.append(responseHeadersDiv);

  details.getContent((content) => {
    const responseBodyDiv = document.createElement("div");

    responseBodyDiv.className = "json-container";
    responseBodyDiv.innerHTML = JSON.stringify(JSON.parse(content), null, 2);
    stepDiv.append(responseBodyDiv);
  });

  const logEntriesDivId = `log-${txId.full}`;
  console.log("====Creating log div", logEntriesDivId);
  const logDiv = document.createElement("div");
  //   logDiv.addEventListener("click", function (event) {
  //     event.preventDefault();
  //     refreshLog(hostname, logEntriesDivId, txId.full);
  //   });
  //   logDiv.innerHTML = `Logs Refresh`;
  stepDiv.append(logDiv);

  const logEntriesDiv = document.createElement("div");
  logEntriesDiv.id = logEntriesDivId;
  logEntriesDiv.className = "json-container";
  stepDiv.append(logEntriesDiv);

  journeyDiv.appendChild(stepDiv);
}

// function addJourneyStepRequest(requestId, payload) {
//   // const stepDiv = document.getElementById(requestId);
//   const payloadDiv = document.createElement("div");
//   payloadDiv.textContent = `Request<br/>${JSON.stringify(payload, null, 2)}`;
//   payloadDiv.id = requestId;
//   requestPayloads[requestId] = payloadDiv;
//   // stepDiv.appendChild(payloadDiv);
// }

// var requests = [];
// var logs = [];

// chrome.webRequest.onBeforeRequest.addListener(
//   (details) => {
//     console.log("Request Id", details.requestId);
//     if (details.method === "POST" && details.requestBody) {
//       console.log("POST Request to:", details.url);

//       const rawBody = new TextDecoder("utf-8").decode(
//         details.requestBody.raw[0].bytes
//       );
//       const jsonData = JSON.parse(rawBody);
//       console.log("Intercepted JSON Payload");
//       console.log(JSON.stringify(jsonData, null, 2));
//       addJourneyStepRequest(details.requestId, jsonData);
//     }
//   },
//   {
//     urls: ["https://*.forgeblocks.com/*/authenticate?*"],
//   },
//   ["requestBody"]
// );

// chrome.webRequest.onCompleted.addListener(
//   (details) => {
//     //if (details.responseHeaders) {
//     console.log("Request completed: ", details);
//   },
//   //},
//   { urls: ["https://*.forgeblocks.com/*/authenticate?*"] }
// );

// const journeyDiv = chrome.webRequest.onBeforeSendHeaders.addListener(
//   (details) => {
//     const hostname = new URL(details.url).hostname;
//     const txIdHeader = details.requestHeaders.find(
//       (header) => header.name.toLowerCase() === "x-forgerock-transactionid"
//     );
//     console.log("Headers Request Id", details.requestId);

//     const journeyTxId = txIdHeader.value;
//     console.log("Starting for txid", journeyTxId);
//     addJourneyStep(journeyTxId, details.requestId);

//     fetchLog(
//       hostname,
//       "am-core",
//       journeyTxId,
//       getLogApiCredentials(),
//       FETCH_INTERVAL_MS
//     );
//   },
//   {
//     urls: ["https://*.forgeblocks.com/*/authenticate?*"],
//   },
//   ["requestHeaders"]
// );

// chrome.runtime.onInstalled.addListener(() => {
//   chrome.contextMenus.create({
//     id: "startCapture",
//     title: "Start Capture",
//     contexts: ["all"],
//   });
// });

// chrome.contextMenus.onClicked.addListener((info, tab) => {
//   if (info.menuItemId === "startCapture") {
//     chrome.sidePanel.open({ tabId: tab.id });
//     chrome.debugger.attach({ tabId: tab.id }, "1.2", function () {
//       chrome.debugger.sendCommand(
//         { tabId: tab.id },
//         "Network.enable",
//         {},
//         function () {
//           if (chrome.runtime.lastError) {
//             console.error(chrome.runtime.lastError);
//           }
//         }
//       );
//     });
//   }
// });

console.log("debugger.js started");
// chrome.debugger.onEvent.addListener(function (source, method, params) {
//   if (method === "Network.responseReceived") {
//     console.log("Response received:", params.response);
//     // Perform your desired action with the response data
//   }
// });

const journeyDiv = document.getElementById("journeyRequests");

chrome.devtools.network.onRequestFinished.addListener(function (details) {
  addJourneyStep(details);
});

function harHeadersToTable(headers) {
  const table = document.createElement("table");

  // Create table header
  //   const thead = document.createElement("thead");
  //   const headerRow = document.createElement("tr");
  //   ["Name", "Value"].forEach((text) => {
  //     const th = document.createElement("th");
  //     th.textContent = text;
  //     headerRow.appendChild(th);
  //   });
  //   thead.appendChild(headerRow);
  //   table.appendChild(thead);

  // Create table body
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

  return table;
}
