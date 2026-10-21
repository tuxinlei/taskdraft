export const PRIORITIES = ["high", "medium", "low"];

export function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function cleanTask(raw, { requireId = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const title = typeof raw.title === "string" ? raw.title.trim().slice(0, 120) : "";
  if (!title) return null;
  const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 80) : "";
  if (requireId && !id) return null;
  const detail = typeof raw.detail === "string" ? raw.detail.trim().slice(0, 500) : "";
  const dueDate = isDate(raw.dueDate) ? raw.dueDate : "";
  const priority = PRIORITIES.includes(raw.priority) ? raw.priority : "medium";
  const minutes = Number.isInteger(raw.minutes) ? Math.min(480, Math.max(5, raw.minutes)) : 30;
  return { ...(requireId ? { id } : {}), title, detail, dueDate, priority, minutes };
}

export function normalizeParsedTasks(raw) {
  if (!raw || !Array.isArray(raw.tasks)) return [];
  return raw.tasks.slice(0, 12).map(task => cleanTask(task)).filter(Boolean);
}

export function normalizePlan(raw, tasks, budget) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const used = new Set();
  let remaining = budget;
  const items = [];
  for (const item of Array.isArray(raw?.items) ? raw.items : []) {
    if (!item || typeof item.id !== "string" || used.has(item.id)) continue;
    const task = byId.get(item.id);
    if (!task || task.minutes > remaining) continue;
    used.add(item.id);
    remaining -= task.minutes;
    items.push({ id: item.id, reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 160) : "" });
  }
  return {
    summary: typeof raw?.summary === "string" ? raw.summary.trim().slice(0, 240) : "今日计划",
    items,
    totalMinutes: budget - remaining
  };
}

export const parseSchema = {
  type: "object",
  properties: {
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          dueDate: { type: "string" },
          priority: { type: "string", enum: PRIORITIES },
          minutes: { type: "integer" }
        },
        required: ["title", "detail", "dueDate", "priority", "minutes"],
        additionalProperties: false
      }
    }
  },
  required: ["tasks"],
  additionalProperties: false
};

export const planSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "string" }, reason: { type: "string" } },
        required: ["id", "reason"],
        additionalProperties: false
      }
    }
  },
  required: ["summary", "items"],
  additionalProperties: false
};
