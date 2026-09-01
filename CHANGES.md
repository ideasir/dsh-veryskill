## 2026-09-01 — 适配 DSH v0.1.2-alpha.3 + 开关 bug 修复

### 变更
- 适配 DSH 0.1.2-alpha.3 的 API 变更：`settingsNamespace()` 已移除，`settings.register/update/mutate` 改为直接接受裸 namespace 字符串
- 清理 `import { settingsNamespace } from '@deepseek-ai/dsh-settings'` 依赖
- **开关 bug 修复**：`defineTool` 的 `output.schema` 中使用了 `required` 字段，0.1.2-alpha.3 不再支持 schema `required` → 开启时 `setToolsEnabled` 抛错 `unsupported JSON schema: schema.required is not supported` → 开关开不了。修复：从 output schema 中移除所有 `required` 字段（共 3 处：list_skills 的 items 和根级、get_skill 的根级），改为 render 函数内空值兜底
- 版本号：`0829-0.1.1-rc.2` → `0901-0.1.2-alpha.3`
- 清理 .bak 备份文件
- 推送至 Gitea 仓库 `https://for.very.im/EVAN/dsh-verySkill`