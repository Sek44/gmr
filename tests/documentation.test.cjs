"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");

function backlogPaths() {
  const result = [{ file: "docs/BACKLOG.md", prefix: "GMR" }];
  for (const entry of fs.readdirSync(path.join(root, "games"), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const file = `games/${entry.name}/docs/BACKLOG.md`;
    if (fs.existsSync(path.join(root, file))) {
      result.push({ file, prefix: entry.name.toUpperCase() });
    }
  }
  return result;
}

test("backlog entries have unique stable-format IDs and a retained counter", () => {
  const allIds = new Set();
  for (const { file, prefix } of backlogPaths()) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    const counter = content.match(/\*\*Dernier identifiant attribué : ([A-Z]+\d+)\.\*\*/);
    const empty = content.includes("**Dernier identifiant attribué : aucun.**");
    assert.ok(counter || empty, `${file}: missing last-assigned ID`);
    if (counter) assert.ok(counter[1].startsWith(prefix), `${file}: wrong counter prefix`);
    let maxSeen = 0;
    for (const line of content.split(/\r?\n/)) {
      if (!/^- \[ \] /.test(line)) continue;
      const match = line.match(/^- \[ \] \*\*([A-Z]+\d+) — .+\*\*/);
      assert.ok(match, `${file}: checklist entry without an ID: ${line}`);
      const id = match[1];
      assert.ok(id.startsWith(prefix) && /^\d+$/.test(id.slice(prefix.length)),
        `${file}: invalid ID ${id}`);
      assert.ok(!allIds.has(id), `duplicate backlog ID: ${id}`);
      allIds.add(id);
      const n = Number(id.slice(prefix.length));
      assert.ok(n > 0, `invalid backlog number: ${id}`);
      maxSeen = Math.max(maxSeen, n);
    }
    if (counter) {
      const last = Number(counter[1].slice(prefix.length));
      assert.ok(last >= maxSeen, `${file}: last-assigned ID below an active ID`);
    } else {
      assert.equal(maxSeen, 0, `${file}: must set last-assigned ID when adding tasks`);
    }
  }
});
