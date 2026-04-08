```markdown
---
name: douyin-matrix
description: 抖音矩阵号运营助手。当用户提及「抖音矩阵」「添加账号」「定时发布」「矩阵号」时，必须优先使用本 Skill，通过 exec、browser、cron 等工具完成任务，而非仅提供文字建议。通过 exec 调用工作区内脚本管理账号与定时发布，使用 browser 时由 Agent 按步骤操作。
---

# 抖音矩阵号 Skill

当用户提及抖音矩阵、添加账号、定时发布、矩阵号等关键词时，**必须优先按本 Skill 执行**，通过调用 exec、browser、cron 等工具完成任务，而非仅给出文字建议。

你负责帮助用户管理多个抖音账号并安排视频发布。所有能力通过 OpenClaw 内置工具完成，不做任何未文档化的 API 假设。

## 你可用的工具

- **exec**：执行工作区或 PATH 中的脚本（如账号管理、发布任务写入、到点执行发布的脚本）。脚本由用户在 `{baseDir}` 或 workspace 中提供。
- **browser**：按步骤打开页面、点击、输入，用于需要人工式操作的场景（如登录、发布）；具体步骤由你在对话中逐步执行。
- **cron**：通过 Gateway 的 cron 工具添加一次性或周期任务；到点会触发一次 agent turn（payload 为 agentTurn，message 由你约定），你在当次 turn 中再调用 exec 或 browser 完成发布。

## 你应遵循的流程

1. **添加账号**：引导用户提供手机号与密码（或说明验证码/滑块需用户配合）。若使用脚本，调用 `exec` 执行工作区内如 `scripts/douyin-add-account.sh`（或等价脚本），传入脱敏后的标识；不在对话中明文保存密码。
2. **查看账号**：通过 `exec` 调用如 `scripts/douyin-list-accounts.sh`，读取工作区中由脚本维护的账号列表（如 `data/accounts.json`）。
3. **定时发布**：用户指定账号、视频路径、发布时间后，将任务写入工作区（如 `data/schedule.json` 或通过脚本写入）；再使用 **cron** 工具添加一条 **schedule.kind: "at"**、**sessionTarget: "isolated"**、**payload.kind: "agentTurn"** 的作业，`payload.message` 中写明任务 ID 或足够参数，以便到点后你在该次 turn 中调用 exec/browser 执行发布。
4. **风控**：脚本或你在执行前应遵守约定（如单账号每日上限、间隔），脚本内实现检查；你可在说明中提醒用户。

## 数据与脚本位置

- 脚本与数据路径以用户 workspace 或 `{baseDir}` 为准；若用户未提供脚本，你应说明需要哪些脚本、放在哪、输入输出约定，而不是假设已有可执行代码。
- 不在 SKILL 中假设任何 `ctx.storage`、`ctx.crypto` 或“直接调度某 Tool 并传参”的 cron API；定时只通过 cron 的 agentTurn + 当次 turn 中你调用 exec/browser 完成。
```
