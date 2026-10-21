import test from "node:test";
import assert from "node:assert/strict";
import { cleanTask, isDate, normalizeParsedTasks, normalizePlan } from "../lib.js";

test("rejects impossible dates and empty tasks", () => {
  assert.equal(isDate("2026-02-30"), false);
  assert.equal(isDate("2026-02-28"), true);
  assert.equal(cleanTask({ title: "   " }), null);
});

test("normalizes AI suggestions and caps their count", () => {
  const tasks = normalizeParsedTasks({ tasks: Array.from({ length: 20 }, (_, index) => ({ title: `Task ${index}`, dueDate: "invalid", priority: "critical", minutes: 1000 })) });
  assert.equal(tasks.length, 12);
  assert.deepEqual(tasks[0], { title: "Task 0", detail: "", dueDate: "", priority: "medium", minutes: 480 });
});

test("daily plan ignores invented and repeated ids and respects budget", () => {
  const tasks = [{ id: "a", title: "A", minutes: 40 }, { id: "b", title: "B", minutes: 50 }, { id: "c", title: "C", minutes: 20 }];
  const plan = normalizePlan({ summary: "计划", items: [{ id: "fake", reason: "" }, { id: "a", reason: "重要" }, { id: "a", reason: "重复" }, { id: "b", reason: "超时" }, { id: "c", reason: "可做" }] }, tasks, 60);
  assert.deepEqual(plan.items.map(item => item.id), ["a", "c"]);
  assert.equal(plan.totalMinutes, 60);
});
