# VerySkill

> 当前版本 `0901-0.1.2-rc.2`，适配 DSH `v0.1.2-alpha.3`。管理 DeepSeek Harness 里的技能（Skills），帮你新建、设置、编辑、启停、删除技能，并关联配套插件。

## 功能

- **技能管理**：在设置页列出所有已创建的技能，一键启用/禁用
- **新建技能**：设置页「新建技能」弹窗，或对话框输入「新建一个技能：xxx」快捷创建；自动识别设置项
- **编辑技能**：修改技能描述与 SKILL.md 正文，保存回写
- **技能设置**：每个技能可开启设置项（API 地址/密钥/模型名/时间参数等），敏感项脱敏保存
- **关联插件**：把配套插件归属到技能，并引导做成永久插件
- **删除技能**：输入 `yes` 确认后删除

## 特点

- 只显示你自己创建的技能（frontmatter 带 `x-user-created: true`，不显示 DSH 自带的）
- 技能设置存在每个技能自己的目录里（`.veryskill.json`）
- 界面风格和其他 ideasir 插件一致

## 规范化流程

创建/维护一个技能的完整流程如下（均在 设置 → 技能管理 完成）：

1. **创建技能**：填名称、描述、内容（SKILL.md 正文）→ 后端自动生成 `~/.dsh/skills/<name>/SKILL.md` 并打 `x-user-created: true`。
2. **收尾清单**（创建完成后弹窗引导）：
   - **开启设置**：自动扫描正文，识别 API 地址/密钥/模型名/时间参数，勾选后生成可填写设置项。
   - **编辑内容**：随时修改描述与 SKILL.md 正文并保存。
   - **启用/禁用**：卡片一键切换。禁用会同时写 `disable-model-invocation: true`（DSH 原生隔离）+ 目录加 `.disabled` 后缀双保险。
   - **关联插件**：技能需要配套插件时，在「插件」弹窗中关联。
3. **配套插件务必做成「永久插件」**：把插件代码放到 `/vol1/1000/DeepSeek/dsh-xxx`，并安装进 profile（`package.json` 的 `dependencies` + `dsh.profile.bundles`），这样进程重启后依然加载。
   - **不要用动态插件**（cordis 临时注册）作为技能配套插件——动态插件在进程重启后会丢失，技能随之失效。
   - 关联插件只记录**该技能真正调用**的配套插件（如 agnes-image → dsh-agimg），手动输入插件标识（如 `dsh-agimg` / `agimg-1`）即可关联。

## 部署

从源码构建并同步到 profile：

```bash
cd /vol1/1000/DeepSeek/dsh-veryskill
# 构建服务端 + 客户端
npx tsc --noEmitOnError false --outDir lib --target ES2022 --module ESNext --moduleResolution bundler --declaration false --esModuleInterop true --skipLibCheck true
npx tsdown
# 同步到 DSH profile 安装目录
cp lib/index.js lib/client.js lib/client.js.map /root/.dsh/profiles/web/node_modules/dsh-veryskill/lib/
# 重启 DSH
bash /root/DSH/restart-dsh.sh
```

## 版本

当前版本：`0901-0.1.2-rc.2`
