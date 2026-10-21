import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

async function withServer(options, run) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try { await run(url); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test("serves manual mode without exposing an API key", async () => {
  await withServer({ key: "" }, async url => {
    const status = await fetch(`${url}/api/status`).then(response => response.json());
    assert.deepEqual(status, { aiReady: false, model: null });
    const response = await fetch(`${url}/api/parse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "Buy milk" }) });
    assert.equal(response.status, 503);
    const html = await fetch(url).then(response => response.text());
    assert.match(html, /TaskDraft/);
  });
});

test("rejects cross-origin requests before any AI call", async () => {
  let calls = 0;
  await withServer({ key: "secret", fetchImpl: async () => { calls++; throw new Error("should not call"); } }, async url => {
    const response = await fetch(`${url}/api/parse`, { method: "POST", headers: { origin: "https://example.com", "content-type": "application/json" }, body: JSON.stringify({ text: "Buy milk" }) });
    assert.equal(response.status, 403);
    assert.equal(calls, 0);
  });
});

test("parses AI result with strict schema and does not store response", async () => {
  let payload;
  const fetchImpl = async (_url, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ tasks: [{ title: "买咖啡豆", detail: "", dueDate: "", priority: "medium", minutes: 20 }] }) }] }] }) };
  };
  await withServer({ key: "secret", fetchImpl }, async url => {
    const response = await fetch(`${url}/api/parse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "记得买咖啡豆", today: "2026-10-21" }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).tasks[0].title, "买咖啡豆");
  });
  assert.equal(payload.store, false);
  assert.equal(payload.text.format.type, "json_schema");
  assert.equal(payload.text.format.strict, true);
});

test("plan response removes invented ids and over-budget tasks", async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ summary: "今天先处理重要事项", items: [{ id: "not-real", reason: "" }, { id: "one", reason: "重要" }, { id: "two", reason: "超时" }] }) }] }] }) });
  await withServer({ key: "secret", fetchImpl }, async url => {
    const response = await fetch(`${url}/api/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ today: "2026-10-21", minutesAvailable: 60, tasks: [{ id: "one", title: "One", minutes: 45 }, { id: "two", title: "Two", minutes: 30 }] }) });
    assert.equal(response.status, 200);
    const plan = await response.json();
    assert.deepEqual(plan.items.map(item => item.id), ["one"]);
    assert.equal(plan.totalMinutes, 45);
  });
});
