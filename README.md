# SkillSkill

> 当前版本 `0829-0.1.1-rc.2`，适配 DSH `v0.1.1-rc.2`（开发者预览版）。管理 DeepSeek Harness 里的技能（Skills），帮你新建、查看、启停和删除技能。

## 功能

- **技能管理**：在设置页列出所有已安装的技能，一键启用/禁用
- **新建技能**：在对话框输入「新建一个技能：xxx」就能创建，插件自动识别设置项
- **编辑技能**：修改技能内容，配置字段（可标记为敏感，值只显示脱敏）
- **删除技能**：输入 `yes` 确认后删除

## 特点

- 只显示你自己创建的技能（不显示 DSH 自带的）
- 技能设置存在每个技能自己的目录里（`.skillskill.json`）
- 界面风格和其他 ideasir 插件一致

## 部署

从 GitHub 克隆后构建：

```bash
git clone https://github.com/ideasir/dsh-skillskill.git
cd dsh-skillskill
# 构建客户端
node /vol1/1000/DeepSeek/dsh-passpass/node_modules/tsdown/dist/run.mjs
# 复制到 DSH profile
cp -r lib/* /root/.dsh/profiles/web/node_modules/dsh-skillskill/
# 重启 DSH
systemctl restart dsh
```

## 版本

当前版本：`0829-0.1.1-rc.2`
