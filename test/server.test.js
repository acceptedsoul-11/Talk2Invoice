import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

let server;
let ollama;
let base;
let mockMode = "good";
let lastChatRequest;

function respond(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

before(async () => {
  ollama = http.createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/api/tags") {
      respond(response, 200, { models: [{ name: "test-model" }] });
      return;
    }
    if (request.method === "POST" && request.url === "/api/chat") {
      let content = "";
      for await (const chunk of request) content += chunk.toString("utf8");
      lastChatRequest = JSON.parse(content);
      const draft = mockMode === "good"
        ? {
            clientName: "Test Client",
            clientEmail: null,
            summary: "Two hours of repair work.",
            dueDays: 14,
            items: [{ description: "Repair work", quantity: 2, unitPrice: 25 }]
          }
        : "{not valid json";
      respond(response, 200, { message: { content: typeof draft === "string" ? draft : JSON.stringify(draft) } });
      return;
    }
    respond(response, 404, { error: "Not found." });
  });
  await new Promise((resolve) => ollama.listen(0, "127.0.0.1", resolve));

  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:" + ollama.address().port;
  process.env.OLLAMA_MODEL = "test-model";
  const { createServer } = await import("../server.js");
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = "http://127.0.0.1:" + server.address().port;
});

after(async () => {
  for (const instance of [server, ollama]) {
    if (instance) await new Promise((resolve, reject) => instance.close((error) => error ? reject(error) : resolve()));
  }
});

test("serves the product shell with browser security headers", async () => {
  const response = await fetch(base + "/");
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Talk2Invoice/);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
});

test("health endpoint reports a compatible Ollama model", async () => {
  const response = await fetch(base + "/api/health");
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, "ok");
  assert.equal(payload.ai, "ready");
  assert.equal(payload.model, "test-model");
});

test("rejects short job notes before contacting a model", async () => {
  const response = await fetch(base + "/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "tap" })
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /more detail/i);
});

test("rejects oversized job descriptions", async () => {
  const response = await fetch(base + "/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "x".repeat(4_001) })
  });
  assert.equal(response.status, 413);
});

test("sends a structured drafting request and returns editable fields", async () => {
  const response = await fetch(base + "/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      description: "Two hours repairing a leaking kitchen tap for Test Client, $25 per hour.",
      currency: "USD",
      language: "English"
    })
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.model, "test-model");
  assert.equal(payload.draft.clientName, "Test Client");
  assert.equal(payload.draft.items[0].quantity, 2);
  assert.equal(payload.draft.items[0].unitPrice, 25);
  assert.match(lastChatRequest.messages[1].content, /\$25 per hour/);
  assert.equal(lastChatRequest.stream, false);
  assert.equal(lastChatRequest.format.type, "object");
});

test("returns an actionable error for invalid model output", async () => {
  mockMode = "bad-json";
  const response = await fetch(base + "/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: "Repair two taps for Test Client." })
  });
  mockMode = "good";
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /valid json/i);
});

test("rejects malformed JSON with a readable message", async () => {
  const response = await fetch(base + "/api/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{"
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /valid json/i);
});

test("does not expose server modules through static paths", async () => {
  const response = await fetch(base + "/server.js");
  assert.equal(response.status, 404);
});
