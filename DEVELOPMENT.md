# dsh-veryskill 开发文档

> **UI 规范：** 图标（Lucide 24×24 stroke-2）、主题（CSS 变量）、卡片结构（dsh-mm-*）统一遵循
> `/vol1/1000/DeepSeek/DSH-UI-SPEC.md` —— 所有 ideasir 插件必须遵守，禁止硬编码颜色/非标准图标。

## 1. 项目结构

```text
src/
├── index.ts          # Host 半部：工具注册、webServer 路由、技能管理
└── client/
    └── index.tsx     # Client 半部：插件卡片、技能管理菜单、创建流程
lib/                  # 构建产物（lib/index.js + lib/client.js）
```

运行时使用 `lib/` 构建产物。`src/` 是唯一源码，修改后必须重新构建。

## 2. 构建

```bash
# 构建客户端
node /vol1/1000/DeepSeek/dsh-passpass/node_modules/tsdown/dist/run.mjs
# 部署到 profile
cp lib/client.js /root/.dsh/profiles/web/node_modules/dsh-veryskill/lib/client.js
cp lib/client.js.map /root/.dsh/profiles/web/node_modules/dsh-veryskill/lib/client.js.map
systemctl restart dsh
```

## 3. 关键约定

- 客户端真实入口是 `src/client/index.tsx`（tsdown entry 配置指向它）
- 技能管理只显示用户主动创建（frontmatter `x-user-created: true`）
- 设置存在每个技能自己的目录（`.veryskill.json`）
- 新建技能不弹窗，而是往 DSH 输入框注入提示词「新建一个技能：」
