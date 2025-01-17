const VIEWS = {
  DEFAULT: "default",
  ADD_TARGET_HOST: "add-target-host",
  EDIT_TARGET_HOST: "edit-target-host",
  DELETE_TARGET_HOST: "delete-target-host",
};

const LOG_SOURCES = ["am-everything", "idm-everything"];

function attachListeners() {
  $(".dropdown-menu .dropdown-item").on("click", function (e) {
    e.preventDefault();

    var selectedText = $(this).text();

    var action = $(this).data("action");

    if (action === "add-target-host") {
      switchView(VIEWS.ADD_TARGET_HOST);
      return;
    }

    if (action === "delete-target-host") {
      const targetHostId = $(this).data("host");
      const targetHost = getTargetHostById(targetHostId);
      if (!targetHost) {
        return;
      }
      $("#delete-target-id").val(targetHostId);
      $("#delete-target-hostname").val(targetHost.hostname);
      switchView(VIEWS.DELETE_TARGET_HOST);
      return;
    }

    if (action === "edit-target-host") {
      const targetHostId = $(this).data("host");
      const targetHost = getTargetHostById(targetHostId);
      if (!targetHost) {
        return;
      }
      $("#edit-target-id").val(targetHostId);
      $("#edit-target-hostname").val(targetHost.hostname);
      $("#edit-target-log-key").val(targetHost.logKey);
      $("#edit-target-log-secret").val(targetHost.logSecret);
      switchView(VIEWS.EDIT_TARGET_HOST);
      return;
    }
  });
}

$(document).ready(function () {
  loadTargetHosts();
  attachListeners();

  loadLogConfig();

  $("#add-target-host-form").submit(function (event) {
    event.preventDefault();

    const buttonValue = event.originalEvent.submitter.value;
    if (buttonValue === "add") {
      var hostname = $("#new-target-hostname").val();
      var logKey = $("#new-target-log-key").val();
      var logSecret = $("#new-target-log-secret").val();

      if (!hostname || hostname === "") {
        $("#add-target-host-error").html("Hostname required");
        return;
      }

      if (getTargetHostByHostname(hostname)) {
        $("#add-target-host-error").html("This hostname already exists.");
        return;
      }

      addTargetHost({
        hostname: hostname,
        logKey: logKey,
        logSecret: logSecret,
      });
      loadTargetHosts();
      attachListeners();
    }
    $("#new-target-hostname").val("");
    $("#new-target-log-key").val("");
    $("#new-target-log-secret").val("");
    $("#add-target-host-error").html("");
    switchView(VIEWS.DEFAULT);
  });

  $("#edit-target-host-form").submit(function (event) {
    event.preventDefault();

    const buttonValue = event.originalEvent.submitter.value;
    if (buttonValue === "save") {
      var id = $("#edit-target-id").val();
      var hostname = $("#edit-target-hostname").val();
      var logKey = $("#edit-target-log-key").val();
      var logSecret = $("#edit-target-log-secret").val();

      if (!hostname || hostname === "") {
        $("#add-target-host-error").html("Hostname required");
        return;
      }

      const previousHostname = getTargetHostById(id).hostname;
      if (hostname != previousHostname && getTargetHostByHostname(hostname)) {
        if (getTargetHostByHostname(hostname)) {
          $("#edit-target-host-error").html("Another entry has this hostname.");
          return;
        }
      }

      saveTargetHost(id, {
        hostname: hostname,
        logKey: logKey,
        logSecret: logSecret,
      });
      loadTargetHosts();
      attachListeners();
    }
    $("#edit-target-id").val("");
    $("#edit-target-hostname").val("");
    $("#edit-target-log-key").val("");
    $("#edit-target-log-secret").val("");
    $("#edit-target-host-error").html("");
    switchView(VIEWS.DEFAULT);
  });

  $("#delete-target-host-form").submit(function (event) {
    event.preventDefault();

    const buttonValue = event.originalEvent.submitter.value;
    if (buttonValue === "delete") {
      var id = $("#delete-target-id").val();

      deleteTargetHost(id);
      loadTargetHosts();
      attachListeners();
    }
    $("#delete-target-id").val("");
    $("#delete-target-hostname").val("");
    switchView(VIEWS.DEFAULT);
  });

  $("#form-save-log-settings").submit(function (event) {
    event.preventDefault();

    let sources = [];
    LOG_SOURCES.forEach((source) => {
      if ($(`#logs-source-${source}`).is(":checked")) {
        sources.push(source);
      }
    });
    const logConfig = {
      automatic: $("#logs-fetch-automatically").is(":checked"),
      refreshInterval: parseInt($("#logs-refresh-interval").val()),
      expand: $("#logs-expand").is(":checked"),
      sources: sources,
    };
    console.log("log config now", JSON.stringify(logConfig));
    saveLogConfig(logConfig);
  });

  switchView(VIEWS.DEFAULT);
});

function createTargetHostDiv(targetHostId, targetHost) {
  // Create the main container div
  const targetHostDiv = document.createElement("div");
  targetHostDiv.classList.add("target-host");

  // Create the card-actions div
  const cardActionsDiv = document.createElement("div");
  cardActionsDiv.classList.add("card-actions", "float-right");

  // Create the dropdown div
  const dropdownDiv = document.createElement("div");
  dropdownDiv.classList.add("dropdown", "show");

  // Create the anchor for the dropdown toggle
  const dropdownToggle = document.createElement("a");
  dropdownToggle.href = "#";
  dropdownToggle.setAttribute("data-toggle", "dropdown");
  dropdownToggle.setAttribute("data-display", "static");

  // Create the SVG icon
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.classList.add("feather", "feather-more-horizontal", "align-middle");

  // Create circles for the SVG
  const circle1 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle1.setAttribute("cx", "12");
  circle1.setAttribute("cy", "12");
  circle1.setAttribute("r", "1");

  const circle2 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle2.setAttribute("cx", "19");
  circle2.setAttribute("cy", "12");
  circle2.setAttribute("r", "1");

  const circle3 = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "circle"
  );
  circle3.setAttribute("cx", "5");
  circle3.setAttribute("cy", "12");
  circle3.setAttribute("r", "1");

  // Append circles to the SVG
  svg.appendChild(circle1);
  svg.appendChild(circle2);
  svg.appendChild(circle3);

  // Append SVG to the dropdown toggle
  dropdownToggle.appendChild(svg);

  // Create the dropdown menu
  const dropdownMenu = document.createElement("div");
  dropdownMenu.classList.add("dropdown-menu", "dropdown-menu-right");

  // Create the "Edit" dropdown item
  const editItem = document.createElement("a");
  editItem.classList.add("dropdown-item");
  editItem.href = "#";
  editItem.setAttribute("data-action", "edit-target-host");
  editItem.setAttribute("data-host", targetHostId);
  editItem.textContent = "Edit";

  // Create the "Delete" dropdown item
  const deleteItem = document.createElement("a");
  deleteItem.classList.add("dropdown-item");
  deleteItem.href = "#";
  deleteItem.setAttribute("data-action", "delete-target-host");
  deleteItem.setAttribute("data-host", targetHostId);
  deleteItem.textContent = "Delete";

  // Append items to the dropdown menu
  dropdownMenu.appendChild(editItem);
  dropdownMenu.appendChild(deleteItem);

  // Append dropdown toggle and menu to the dropdown div
  dropdownDiv.appendChild(dropdownToggle);
  dropdownDiv.appendChild(dropdownMenu);

  // Append dropdown div to card-actions div
  cardActionsDiv.appendChild(dropdownDiv);

  // Create the hostname div
  const hostnameDiv = document.createElement("div");
  hostnameDiv.textContent = targetHost.hostname;

  // Append card-actions and hostname divs to the main container
  targetHostDiv.appendChild(cardActionsDiv);
  targetHostDiv.appendChild(hostnameDiv);

  return targetHostDiv;
}

function loadTargetHosts() {
  const targetHosts = getTargetHosts();
  const hostsDiv = document.getElementById("target-host-list");
  hostsDiv.innerHTML = "";
  Object.keys(targetHosts).forEach((targetHostId) => {
    hostsDiv.appendChild(
      createTargetHostDiv(targetHostId, targetHosts[targetHostId])
    );
  });
}

function loadLogConfig() {
  const logConfig = getLogConfig();
  $("#logs-fetch-automatically").prop("checked", logConfig.automatic);
  $("#logs-expand").prop("checked", logConfig.expand);
  LOG_SOURCES.forEach((source) => {
    $(`#logs-source-${source}`).prop(
      "checked",
      logConfig.sources.includes(source)
    );
  });
  $("#logs-refresh-interval").val(logConfig.refreshInterval);
}

function switchView(view) {
  $(".view-section").hide();
  $(`#view-section-${view}`).fadeIn("fast");
}
