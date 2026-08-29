# dsh-skillskill（SkillSkill）开发日志

## 2026-08-28 — 初始版本完成

### 插件定位
技能管理插件。与其他 ideasir 插件（Look Look / PassPass / MakeMake / veryIM）统一风格：
驼峰命名 SkillSkill + 图标 + 版本 pill + [ideasir][卸载][已最新][智能检测] 4 标签。

### 架构
- 服务端 `src/index.ts`：settings namespace `skillskill`（enabled 开关）
  - webServer 路由：`/list`（开关+技能列表+版本）/ `/save`（写开关 via 官方 settings.update）
  - `/update`（GitHub raw 对比版本）/ `/uninstall`（从 profile 铲除）/ `/env-check`（智能检测 3 项）
  - 工具：`list_skills`（列技能）、`get_skill`（查详情）——enabled 时注册，关闭时注销
  - systemPrompt section：开启时告知模型
- 客户端 `src/client/index.tsx`：looklook 风格完整卡片
  - key = `skillskill`（匹配服务端 namespace）
  - 头部：图标 + SkillSkill + 版本 pill + [ideasir][卸载][已最新/有更新][智能检测] + 箭头
  - 展开：启用开关 + 功能检测结果（点智能检测后）+ 已安装技能列表

### 关键实现细节（与其他插件统一）
- pill 样式：fontSize 12 / lineHeight 18 / fontWeight 500 / borderRadius 999 / padding 2px 10px
- 悬停态：ideasir/智能检测 hover 变品牌色；卸载 hover 底色 error 12%；更新 hover 品牌 10%
- header 是 <button>，内部按钮必须 stopPropagation
- 卸载走 profile package.json（dependencies + bundles 双移除）+ 删 node_modules
- 更新检测：fetch ghfast.top 代理的 GitHub raw package.json 对比 version

### 踩坑记录
1. **cordis.patch.yml 必须是 `- insert:` 数组**，空 `[]` 导致 bundle 不加载（namespace 未注册）
2. **client 声明必须含完整 inject 列表**（slots + dsh-client-* 全家桶），只有 ["slots"] 前端不加载
3. **settings.update 是异步**，save 路由必须 await，否则 list 立即读还是旧值
4. **schema 的 required 不能写在 properties 的 item 上**（`{type:'string', required:true}` 报
   "required is not supported on..."），必须移到对象顶层 `required:['name']`
5. **namespace 迁移**：skill-manager → skillskill，settings.yaml 正则替换即可
6. webServer 路由注册必须在 `ctx.effect()` 内（passpass 同款）

## 2026-08-28（第二版）— 技能管理菜单 + 完整技能操作

### 需求（主任）
1. 插件设置卡片只保留启用/关闭开关，去掉技能列表
2. 开启后 Agent 预设下方新增「技能管理」菜单，关闭移除
3. 技能管理菜单显示定制技能，技能卡片对齐 Agent 预设样式：
   技能名 + 描述 + 底部按钮行（启用/禁用、编辑、设置占位、删除）
4. 禁用技能 → DSH 加载不到（隔离）；启用恢复
5. 编辑 → 弹窗显示技能内容（README/package.json/入口代码）
6. 删除 → 完整删除 + 误点保护（输入 yes 确认）

### 改了什么
**服务端 src/index.ts：**
- 修复 symlink 扫描：isDirectory() 对 symlink 返回 false，改用 lstatSync().isSymbolicLink() + statSync().isDirectory()，扫全 4 个技能
- 新增 /toggle（启用/禁用）：改 profile package.json 的 dsh.profile.bundles 数组
  - 禁用：移除条目 + 记录原索引（.skillskill.json）
  - 启用：按原索引插回
- 新增 /content：读技能 package.json + README/SKILL.md + 入口代码 + 文件列表
- 新增 /delete：confirm==='yes' 才执行；移除 bundles + dependencies + 删 node_modules 目录/symlink
- 排除自身（dsh-skillskill），避免自禁用后无法恢复

**客户端 src/client/index.tsx：**
- SkillSkill 卡片：只保留开关（+图标/版本/4标签/智能检测）
- 技能管理菜单（settings.section）：技能卡片对齐 Agent 预设样式
  - 名称 + 状态 badge（链接/内置 + 已启用/已禁用）+ 描述 + 来源行
  - 底部按钮行：[禁用/启用] [编辑] [设置(占位)] [删除]
- 编辑弹窗：说明文档/package.json/入口代码 三个 tab
- 删除弹窗：输入 yes 才启用确认按钮（误点保护）
- 弹窗：body portal + ESC 关闭 + z-index 2147483000

### 验证（浏览器实测）
- ✅ 4 个技能全显示（symlink 修复）
- ✅ 禁用 dsh-passpass → bundles 移除；启用 → 按原索引插回
- ✅ 编辑弹窗显示技能内容（3 tab）
- ✅ 删除弹窗要求输入 yes，无确认/confirm≠yes 都拒绝
- ✅ 卡片展开只有开关（无技能列表）

## 2026-08-28（第三版）— 技能卡片 hover 高亮 + 点击详情弹窗 + 用户技能体系

### 新增功能
1. **只显示用户创建的技能**：创建时 SKILL.md frontmatter 自动写 `x-user-created: true`，
   scanSkills 只返回有标记的技能（无标记=自动/系统技能不显示）。
2. **底部状态栏**：用户创建技能 N · 未纳入管理 N · 技能目录总计 N。
3. **新建技能按钮**：多步流程（填信息→创建→问是否开启技能设置→扫描候选设置项+理由→勾选保存）。
4. **设置识别**：自动扫描 SKILL.md，识别 API地址/密钥(🔒)/模型名/时间参数，每条附理由。
5. **设置存技能目录**：`~/.dsh/skills/<技能名>/.skillskill.json`，随技能走。
6. **设置按钮**：未开启灰色不可点；开启后可点开填写设置值。
7. **技能卡片 hover**：边框紫色高亮 + 光晕 + 微亮背景 + 手型光标。
8. **点击卡片主体**：放大详情弹窗（名称/类型/状态/路径/设置项(脱敏)/SKILL.md全文/编辑按钮）。

### 踩坑
- frontmatter 正则 `/^[a-zA-Z_]+:/` 匹配不到带横线的 key（x-user-created）→
  必须 `/^[a-zA-Z_][a-zA-Z0-9_-]*:/`，否则 userCreated 永远 false。
- scanSkills 改返回 { skills, total, unmanaged } 后，所有调用点（工具/智能检测）都要解构 .skills。
- ESM 环境不能用 require('node:fs')，renameSync/readdirSync 必须从 import 引入。
- 设置扫描 detectSettingsCandidates 的 URL 变量类型是 unknown，要 String() 转。

## 2026-08-29 — 卡片主题样式对齐其他插件

### 问题
SkillSkill 卡片用的是内联样式 + 硬编码颜色（rgb(53,54,56)、rgba(255,255,255,0.12)），
不跟随 DSH 主题变量，和其他插件（makemake/passpass/veryIM 用 dsh-mm-* 类）外观不一致。

### 修改（客户端 src/client/index.tsx）
1. apply 入口注入统一 dsh-mm-* CSS（与 makemake 完全相同的类定义）
2. SkillManagerCard 卡片结构改为 dsh-mm-* 类：
   - li: dsh-mm-card / dsh-mm-card-open
   - header button: dsh-mm-head
   - 文本区: dsh-mm-head-text / dsh-mm-name-row / dsh-mm-title / dsh-mm-version-badge / dsh-mm-desc
   - 按钮区: dsh-mm-btns / dsh-mm-btn-link / dsh-mm-btn-uninstall / dsh-mm-btn-update
   - 箭头: dsh-mm-chevron
   - 展开区: dsh-mm-body
3. 硬编码颜色全部改为 DSH 主题变量（var(--dsw-alias-*)）

### 效果
卡片外观与其他插件完全统一：跟随主题、hover 边框高亮、展开态变色。
