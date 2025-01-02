function getConfig() {
  let config = localStorage.getItem("config") || "{}";
  return JSON.parse(config);
}

function saveConfig(config) {
  localStorage.setItem("config", JSON.stringify(config));
}

// Log config

function getLogConfig() {
  let logConfig = getConfig().logs;
  if (!logConfig) {
    return {
      automatic: true,
      expand: false,
      streams: { "am-core": true },
    };
  }
  return logConfig;
}

function saveLogConfig(logConfig) {
  let config = getConfig();
  config.logs = logConfig;
  saveConfig(config);
}

// Target host functions

function addTargetHost(targetHost) {
  saveTargetHost(crypto.randomUUID(), targetHost);
}

function getTargetHostById(id) {
  return getTargetHosts()[id];
}

function getTargetHosts() {
  return getConfig().targetHosts || {};
}

function saveTargetHosts(targetHosts) {
  let config = getConfig();
  config.targetHosts = targetHosts;
  saveConfig(config);
}

function saveTargetHost(id, targetHost) {
  let targetHosts = getTargetHosts();
  targetHosts[id] = targetHost;
  saveTargetHosts(targetHosts);
}

function deleteTargetHost(id) {
  let targetHosts = getTargetHosts();
  delete targetHosts[id];
  saveTargetHosts(targetHosts);
}

function getTargetHostByHostname(hostname) {
  const targetHosts = getTargetHosts();
  const id = Object.keys(targetHosts).find(
    (key) => targetHosts[key].hostname === hostname
  );
  if (id) {
    return targetHosts[id];
  }
  return null;
}

// module.exports = {
//   getLogConfig,
//   saveLogConfig,
//   addTargetHost,
//   getTargetHostById,
//   getTargetHosts,
//   saveTargetHost,
//   deleteTargetHost,
//   getTargetHostByHostname,
// };
