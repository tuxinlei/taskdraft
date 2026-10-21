import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { cleanTask, isDate, normalizeParsedTasks, normalizePlan, parseSchema, planSchema } from "./lib.js";

const publicFiles = new Map([
  ["/", ["./public/index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["./public/app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["./public/style.css", "text/css; charset=utf-8"]]
]);

function send(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw Object.assign(new Error("需要 JSON 请求"), { status: 415 });
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body) > 30000) throw Object.assign(new Error("内容过长"), { status: 413 });
  }
  try { return JSON.parse(body); }
  catch { throw Object.assign(new Error("JSON 格式无效"), { status: 400 }); }
}

function outputText(response) {
  if (response.status !== "completed") throw new Error("AI 未完成回答，请重试");
  const text = response.output?.flatMap(item => item.type === "message" ? item.content ?? [] : [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("");
  if (!text) throw new Error("AI 没有返回可用结果");
  return text;
}

async function callModel({ key, model, input, schema, name, fetchImpl }) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1200,
      input,
      text: { format: { type: "json_schema", name, strict: true, schema } }
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("OpenAI API Key 无效，请检查环境变量");
    if (response.status === 429) throw new Error("OpenAI API 请求受限，请稍后再试");
    throw new Error(`OpenAI API 返回 ${response.status}`);
  }
  return JSON.parse(outputText(await response.json()));
}

export function createServer({ key = process.env.OPENAI_API_KEY, model = process.env.OPENAI_MODEL || "gpt-4o-mini", fetchImpl = fetch } = {}) {
  return http.createServer(async (req, res) => {
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");
    res.setHeader("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'");
    if (!/^127\.0\.0\.1(?::\d+)?$/.test(req.headers.host || "")) { send(res, 403, { error: "仅允许通过 127.0.0.1 访问" }); return; }
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (req.method === "GET" && publicFiles.has(pathname)) {
      const [relativePath, contentType] = publicFiles.get(pathname);
      try {
        const file = await readFile(fileURLToPath(new URL(relativePath, import.meta.url)));
        res.writeHead(200, { "content-type": contentType, "cache-control": "no-cache" });
        res.end(file);
      } catch { send(res, 500, { error: "页面读取失败" }); }
      return;
    }
    if (pathname === "/api/status" && req.method === "GET") {
      send(res, 200, { aiReady: Boolean(key), model: key ? model : null });
      return;
    }
    if (pathname !== "/api/parse" && pathname !== "/api/plan") { send(res, 404, { error: "未找到页面" }); return; }
    if (req.method !== "POST") { send(res, 405, { error: "仅支持 POST" }); return; }
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`) { send(res, 403, { error: "仅允许本地同源请求" }); return; }
    if (!key) { send(res, 503, { error: "请先设置 OPENAI_API_KEY；手动待办仍可使用" }); return; }

    try {
      const body = await readJson(req);
      const today = isDate(body?.today) ? body.today : new Date().toISOString().slice(0, 10);
      if (pathname === "/api/parse") {
        const note = typeof body?.text === "string" ? body.text.trim() : "";
        if (!note || note.length > 3000) { send(res, 400, { error: "请输入 1 到 3000 字的想法" }); return; }
        const result = await callModel({ key, model, fetchImpl, schema: parseSchema, name: "task_capture", input: [
          { role: "developer", content: "你是待办整理助手。把用户的想法拆成具体可执行的任务，最多 12 条。今天日期由用户消息给出。不要凭空编造截止日期；没有明确日期时 dueDate 为空字符串。minutes 估计为 5-480 的整数；priority 只能是 high、medium、low。输出与用户相同语言。不要执行任务。" },
          { role: "user", content: `今天是 ${today}。请整理以下原始想法：\n${note}` }
        ] });
        send(res, 200, { tasks: normalizeParsedTasks(result) });
        return;
      }

      const budget = Number(body?.minutesAvailable);
      const tasks = Array.isArray(body?.tasks) ? body.tasks.slice(0, 50).map(task => cleanTask(task, { requireId: true })).filter(Boolean) : [];
      if (!Number.isInteger(budget) || budget < 15 || budget > 720 || tasks.length === 0) {
        send(res, 400, { error: "请选择 15–720 分钟，并提供至少一条未完成任务" }); return;
      }
      const result = await callModel({ key, model, fetchImpl, schema: planSchema, name: "daily_plan", input: [
        { role: "developer", content: "你是务实的每日计划助手。今天日期由用户给出。只从用户提供的任务 id 中选任务，考虑明确截止日期、优先级和时间预算。按执行顺序输出，不要编造任务、日期或空闲时间。items 中列出 id 和简短中文理由；summary 是一句中文说明。" },
        { role: "user", content: JSON.stringify({ today, minutesAvailable: budget, tasks }) }
      ] });
      send(res, 200, normalizePlan(result, tasks, budget));
    } catch (error) {
      send(res, error.status || 502, { error: error.status ? error.message : (error.name === "TimeoutError" ? "AI 请求超时，请重试" : error.message || "AI 请求失败") });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须为 1–65535 的整数");
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`TaskDraft 已启动：http://127.0.0.1:${port}`);
    console.log(process.env.OPENAI_API_KEY ? "AI 功能已配置" : "未设置 OPENAI_API_KEY：手动待办可用");
  });
}
