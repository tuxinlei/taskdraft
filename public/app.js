const STORAGE_KEY = "taskdraft.tasks.v1";
const $ = selector => document.querySelector(selector);
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const priorityName = { high: "重要", medium: "普通", low: "稍后" };
let tasks = loadTasks();
let suggestions = [];
let filter = "open";
let editingId = null;
let messageTimer;

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
  if (!title) return null;
  return {
    id: typeof raw.id === "string" && raw.id.length < 81 && raw.id ? raw.id : crypto.randomUUID(),
    title,
    detail: typeof raw.detail === "string" ? raw.detail.trim().slice(0, 500) : "",
    dueDate: validDate(raw.dueDate) ? raw.dueDate : "",
    priority: Object.hasOwn(priorityName, raw.priority) ? raw.priority : "medium",
    minutes: Number.isInteger(raw.minutes) ? Math.min(480, Math.max(5, raw.minutes)) : 30,
    done: raw.done === true,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString()
  };
}

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return Array.isArray(saved) ? saved.slice(0, 1000).map(normalizeTask).filter(Boolean) : [];
  } catch { return []; }
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); }
  catch { notify("无法保存到浏览器，请先导出数据备份", true); }
  renderTasks();
}

function notify(text, error = false) {
  const element = $("#message");
  element.textContent = text;
  element.classList.toggle("error", error);
  element.hidden = false;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { element.hidden = true; }, 6500);
}

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function renderTasks() {
  const list = $("#task-list");
  list.replaceChildren();
  const shown = tasks.filter(task => filter === "all" || (filter === "done" ? task.done : !task.done));
  const rank = { high: 0, medium: 1, low: 2 };
  shown.sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || "9999").localeCompare(b.dueDate || "9999") || rank[a.priority] - rank[b.priority]);
  $("#task-count").textContent = String(tasks.filter(task => !task.done).length);
  if (!shown.length) { list.append(node("p", "empty-tasks", filter === "open" ? "还没有未完成的待办。先写下一件事吧。" : "这里暂时没有待办。")); return; }
  for (const task of shown) {
    const row = node("div", `task${task.done ? " done" : ""}`);
    const check = node("input");
    check.type = "checkbox";
    check.checked = task.done;
    check.setAttribute("aria-label", `${task.done ? "标为未完成" : "完成"}：${task.title}`);
    check.addEventListener("change", () => { task.done = check.checked; save(); });
    const main = node("div", "task-main");
    main.append(node("div", "task-title", task.title));
    if (task.detail) main.append(node("div", "task-detail", task.detail));
    const meta = node("div", "meta");
    if (task.dueDate) meta.append(node("span", task.dueDate < today() && !task.done ? "urgent" : "", `截止 ${task.dueDate}`));
    meta.append(node("span", task.priority === "high" ? "urgent" : "", priorityName[task.priority]));
    meta.append(node("span", "", `${task.minutes} 分钟`));
    main.append(meta);
    const actions = node("div", "task-actions");
    const edit = node("button", "icon-button", "编辑");
    edit.type = "button";
    edit.setAttribute("aria-label", `编辑 ${task.title}`);
    edit.addEventListener("click", () => editTask(task));
    const remove = node("button", "icon-button", "删除");
    remove.type = "button";
    remove.setAttribute("aria-label", `删除 ${task.title}`);
    remove.addEventListener("click", () => { if (confirm(`删除「${task.title}」？`)) { tasks = tasks.filter(item => item.id !== task.id); save(); } });
    actions.append(edit, remove);
    row.append(check, main, actions);
    list.append(row);
  }
}

function resetForm() {
  editingId = null;
  $("#task-form").reset();
  $("#task-minutes").value = "30";
  $("#save-task").textContent = "添加待办";
  $("#cancel-edit").hidden = true;
}

function editTask(task) {
  editingId = task.id;
  $("#task-title").value = task.title;
  $("#task-detail").value = task.detail;
  $("#task-due").value = task.dueDate;
  $("#task-minutes").value = String(task.minutes);
  $("#task-priority").value = task.priority;
  $("#save-task").textContent = "保存修改";
  $("#cancel-edit").hidden = false;
  $("#task-form").scrollIntoView({ behavior: "smooth", block: "center" });
  $("#task-title").focus();
}

$("#task-form").addEventListener("submit", event => {
  event.preventDefault();
  const raw = {
    title: $("#task-title").value,
    detail: $("#task-detail").value,
    dueDate: $("#task-due").value,
    minutes: Number($("#task-minutes").value),
    priority: $("#task-priority").value
  };
  const cleaned = normalizeTask(raw);
  if (!cleaned) { notify("请填写待办名称", true); return; }
  if (editingId) {
    const task = tasks.find(item => item.id === editingId);
    if (task) Object.assign(task, { title: cleaned.title, detail: cleaned.detail, dueDate: cleaned.dueDate, minutes: cleaned.minutes, priority: cleaned.priority });
    notify("修改已保存");
  } else { tasks.unshift(cleaned); notify("待办已添加"); }
  save();
  resetForm();
});
$("#cancel-edit").addEventListener("click", resetForm);

document.querySelectorAll(".filter").forEach(button => button.addEventListener("click", () => {
  filter = button.dataset.filter;
  document.querySelectorAll(".filter").forEach(item => item.classList.toggle("active", item === button));
  renderTasks();
}));

async function post(path, body) {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

async function busy(button, label, action) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try { await action(); }
  catch (error) { notify(error.message || "操作失败", true); }
  finally { button.disabled = false; button.textContent = original; }
}

function renderSuggestions() {
  const list = $("#suggestion-list");
  list.replaceChildren();
  $("#suggestions").hidden = suggestions.length === 0;
  suggestions.forEach((task, index) => {
    const row = node("label", "suggestion");
    const check = node("input");
    check.type = "checkbox";
    check.checked = true;
    check.dataset.index = String(index);
    const details = node("div");
    details.append(node("strong", "", task.title));
    details.append(node("p", "", [task.dueDate ? `截止 ${task.dueDate}` : "无截止日期", priorityName[task.priority] || "普通", `${task.minutes} 分钟`, task.detail].filter(Boolean).join(" · ")));
    row.append(check, details);
    list.append(row);
  });
}

$("#parse-btn").addEventListener("click", () => busy($("#parse-btn"), "整理中…", async () => {
  const text = $("#brain-dump").value.trim();
  if (!text) { notify("先写下一些想法", true); return; }
  const data = await post("/api/parse", { text, today: today() });
  suggestions = data.tasks.map(normalizeTask).filter(Boolean);
  renderSuggestions();
  notify(suggestions.length ? `整理出 ${suggestions.length} 条建议，请确认后加入` : "没有找到可执行的待办，请换一种写法");
}));

$("#add-suggestions-btn").addEventListener("click", () => {
  const selected = [...document.querySelectorAll("#suggestion-list input:checked")].map(input => suggestions[Number(input.dataset.index)]);
  if (!selected.length) { notify("请先选中至少一条建议", true); return; }
  tasks.unshift(...selected);
  save();
  suggestions = [];
  renderSuggestions();
  $("#brain-dump").value = "";
  notify(`已加入 ${selected.length} 条待办`);
});

$("#plan-btn").addEventListener("click", () => busy($("#plan-btn"), "规划中…", async () => {
  const open = tasks.filter(task => !task.done);
  if (!open.length) { notify("请先添加至少一条未完成待办", true); return; }
  const data = await post("/api/plan", { tasks: open, minutesAvailable: Number($("#minutes-available").value), today: today() });
  const result = $("#plan-result");
  result.replaceChildren();
  result.append(node("p", "plan-summary", data.summary));
  if (!data.items.length) { result.append(node("p", "empty-tasks", "当前任务都超过可用时间。试着把任务拆小，或增加可用时间。")); return; }
  for (const item of data.items) {
    const task = open.find(value => value.id === item.id);
    if (!task) continue;
    const row = node("div", "plan-item");
    const body = node("div");
    body.append(node("strong", "", task.title));
    body.append(node("p", "", `${task.minutes} 分钟${item.reason ? ` · ${item.reason}` : ""}`));
    row.append(body);
    result.append(row);
  }
  result.append(node("div", "plan-total", `计划时长 ${data.totalMinutes} / ${$("#minutes-available").value} 分钟`));
}));

$("#export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ format: "taskdraft-v1", exportedAt: new Date().toISOString(), tasks }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = node("a");
  anchor.href = url;
  anchor.download = `taskdraft-${today()}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$("#import-input").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (file.size > 1_000_000) { notify("文件超过 1 MB", true); return; }
  try {
    const data = JSON.parse(await file.text());
    if (data?.format !== "taskdraft-v1" || !Array.isArray(data.tasks) || data.tasks.length > 1000) throw new Error("不是有效的 TaskDraft 备份");
    const imported = data.tasks.map(normalizeTask).filter(Boolean);
    if (imported.length !== data.tasks.length) throw new Error("备份包含无效待办");
    if (new Set(imported.map(task => task.id)).size !== imported.length) throw new Error("备份包含重复的待办 ID");
    if (!confirm(`导入 ${imported.length} 条待办？这会替换当前浏览器中的清单。`)) return;
    tasks = imported;
    save();
    notify(`已导入 ${imported.length} 条待办`);
  } catch (error) { notify(error.message || "导入失败", true); }
});

fetch("/api/status").then(response => response.json()).then(data => {
  const status = $("#ai-status");
  status.textContent = data.aiReady ? `AI 已就绪 · ${data.model}` : "AI 未配置 · 手动模式可用";
  status.classList.toggle("off", !data.aiReady);
}).catch(() => { $("#ai-status").textContent = "无法连接本地服务"; $("#ai-status").classList.add("off"); });

renderTasks();
