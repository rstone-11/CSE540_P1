const fs = require("fs");

function loadAddrs(path = "addresses.local.json") {
  if (!fs.existsSync(path)) {
    throw new Error("Could not find addresses.local.json. Did you run deploy.js?");
  }
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

module.exports = { loadAddrs };
