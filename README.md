# TaskDraft

一个本地优先的 AI 待办工具：把杂乱想法拆成待办，**先人工确认**，再按今天真正可用的时间生成可执行计划。手动待办功能不需要 API Key。适合想要轻量、无账号、可自行运行工具的人。

## 能做什么

- 手动添加、编辑、完成、删除待办；按状态筛选，记录截止日期、优先级和预计时长。
- 把一段中文或英文想法交给 AI，预览拆解结果后按需加入清单。
- 从未完成待办中生成今日计划；服务端会过滤 AI 编造的任务 ID，并确保总预计时长不超过预算。
- 任务保存在当前浏览器的 `localStorage`，支持 JSON 导出和导入。
- 不需要数据库、账号、构建步骤或第三方前端依赖。Node.js 20+ 即可运行。

## 快速开始

```bash
git clone https://github.com/tuxinlei/taskdraft.git
cd taskdraft
npm start
```

打开 `http://127.0.0.1:3000`。手动待办立即可用。要启用 AI，在启动前设置环境变量：

```bash
export OPENAI_API_KEY="你的 API Key"
export OPENAI_MODEL="gpt-4o-mini"  # 可选
npm start
```

Windows PowerShell 可用 `$env:OPENAI_API_KEY="你的 API Key"`。不要把真实 Key 写进 `.env.example` 或提交到 Git。此项目不自动读取 `.env` 文件；`.gitignore` 仍会排除它，避免意外提交。

> AI 功能会把你输入的想法或未完成任务发送到 OpenAI API，并产生你账号下的 API 费用。请求设置 `store: false`。不要输入敏感信息。手动待办数据不会主动同步；清除浏览器数据会清空本地清单，请定期导出备份。

## 设计原则

1. **人确认后再改清单**：AI 拆解只产生建议，不自动创建待办。
2. **时间预算是硬约束**：AI 选择顺序后，服务端再次检查任务 ID、重复项和预计时长。
3. **最少部署负担**：无数据库和构建工具，只使用 Node.js 标准库；服务仅绑定 `127.0.0.1`。
4. **可迁移数据**：导出的是可读的 JSON；导入前会提示替换当前清单。

## 测试

```bash
npm test
```

测试覆盖日期与 AI 结果清洗、计划预算约束、无 Key 模式、同源限制、Responses API 请求格式。CI 在 push 和 PR 时运行。

## 当前限制与路线图

- 这是单人、本机使用的 MVP。无多设备同步、提醒、重复任务或日历集成。
- AI 功能需要用户自己的 OpenAI API Key；本仓库不提供免费额度。
- 接下来优先收集真实使用反馈，再决定是否加入更细粒度的任务拆分、离线安装和可访问性改进。欢迎带场景提交 issue。

## 参与贡献

欢迎报告可复现的问题、提出真实使用场景或提交 PR。提交前运行 `npm test`，并在 PR 中写明改变了什么、如何验证。不要在 issue、日志或截图中公开 API Key、私人待办内容。

## 许可

[MIT](LICENSE)。OpenAI API 的使用另受其服务条款约束。

---

**English:** TaskDraft is a local-first AI todo app. Capture tasks manually or turn a brain dump into reviewable suggestions, then build a time-boxed daily plan. No database, account, build step, or frontend dependencies. Node.js 20+ and an optional user-provided OpenAI API key are all you need.
