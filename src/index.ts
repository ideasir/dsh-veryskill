/**
 * dsh-veryskill — 超级技能插件（服务端）
 *
 * 技能 = profile node_modules 下的 dsh-* 插件目录（含 symlink）。
 * 启用/禁用 = 增删 profile package.json 的 dsh.profile.bundles 条目（隔离/恢复加载）。
 * 删除 = 移除 bundles 条目 + 删除 node_modules 里的目录/symlink（symlink 只删链接，保留源）。
 * 本插件自身不出现在技能列表（避免自禁用导致无法恢复）。
 */
import { readFileSync, writeFileSync, existsSync, rmSync, renameSync, readdirSync, statSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import * as path from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const inject = ['tools', 'settings', 'systemPrompt', 'webServer']

const dshHome = process.env.DSH_HOME ?? '/root/.dsh'
const PROFILE_DIR = path.join(dshHome, 'profiles', 'web')
const NM_DIR = path.join(PROFILE_DIR, 'node_modules')
const PKG_PATH = path.join(PROFILE_DIR, 'package.json')
const STATE_PATH = path.join(dshHome, '.veryskill.json')
const SKILLS_DIR = path.join(dshHome, 'skills')
const SELF = 'dsh-veryskill'
const GITHUB_RAW = 'https://ghfast.top/https://raw.githubusercontent.com/ideasir/dsh-veryskill/main/package.json'
const SETTINGS_FILE = '.veryskill.json'   // 存在技能目录里（设置存技能目录内）

interface Skill {
  name: string          // 技能名（目录名 或 md 文件名）
  description: string
  kind: 'directory' | 'flat'   // 目录技能（SKILL.md）或扁平技能（.md）
  source: string        // 完整路径（目录或 md 文件）
  enabled: boolean      // 是否被禁用（.disabled 后缀）
  userCreated: boolean  // 是否用户主动创建（frontmatter x-user-created: true）
  settingsEnabled: boolean  // 是否开启技能设置
  category?: string     // 技能分类（如：创作、工具、效率）
  shortcut?: string     // 快捷键（如 Ctrl+Shift+1）
  alias?: string        // 别名（显示用，输入框优先显示别名）
  plugins: SkillPluginRef[]  // 关联的动态插件（归属/审计）
}

interface SkillPluginRef {
  id: string            // 动态插件 pluginId（如 verylook-1）
  name: string          // 插件显示名（如 Agnes video renderer）
  packageId?: string    // 最近关联的 Package（可选）
  attachedAt: string    // 归属时间
  lastSeenAt?: string   // 最近一次运行的时间戳（可选）
}

interface SkillSettings {
  enabled: boolean       // 是否开启技能设置
  alias?: string         // 别名（显示用，输入框优先显示别名）
  category?: string      // 技能分类（如：创作、工具、效率）
  shortcut?: string      // 快捷键（如 Ctrl+Shift+1，用于快速把技能名装进输入框）
  plugins: SkillPluginRef[]  // 关联的动态插件归属（自动记录）
  fields: Array<{
    key: string          // 设置项标识
    label: string        // 显示名
    value: string        // 用户填的值
    isSecret?: boolean   // 是否敏感（密钥类）
    reason?: string      // 识别理由
  }>
}

interface State {
  disabled: Record<string, number>   // 保留（兼容旧逻辑，不再需要）
}

function loadState(): State {
  try { return JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as State }
  catch { return { disabled: {} } }
}
function saveState(s: State) {
  try { writeFileSync(STATE_PATH, JSON.stringify(s, null, 2), 'utf-8') } catch { /* ignore */ }
}

function readProfilePkg(): any {
  return JSON.parse(readFileSync(PKG_PATH, 'utf-8'))
}
function writeProfilePkg(pkg: any) {
  writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8')
}
function getBundles(): string[] {
  const pkg = readProfilePkg()
  return Array.isArray(pkg.dsh?.profile?.bundles) ? pkg.dsh.profile.bundles : []
}

/** 扫描 ~/.dsh/skills 下的技能，只返回用户主动创建的（frontmatter 有 x-user-created） */
async function scanSkills(): Promise<{ skills: Skill[]; total: number; unmanaged: number }> {
  await import('node:fs/promises').then(m => m.mkdir(SKILLS_DIR, { recursive: true })).catch(() => {})
  const all: Array<Skill & { isUser: boolean }> = []
  let entries: any[] = []
  try { entries = await readdir(SKILLS_DIR, { withFileTypes: true }) } catch { return { skills: [], total: 0, unmanaged: 0 } }

  for (const entry of entries) {
    const full = path.join(SKILLS_DIR, entry.name)
    // 禁用态：目录或文件带 .disabled 后缀
    let name = entry.name
    let enabled = true
    if (name.endsWith('.disabled')) {
      enabled = false
      name = name.replace(/\.disabled$/, '')
    }
    if (!name || name.startsWith('.')) continue

    try {
      let front: any = null
      let kind: 'directory' | 'flat' = 'flat'
      if (entry.isDirectory()) {
        const skillMd = path.join(full, 'SKILL.md')
        const stat = await import('node:fs').then(m => m.statSync(skillMd, { throwIfNoEntry: false }))
        if (!stat) continue
        front = parseFrontmatter((await readFile(skillMd, 'utf-8')).slice(0, 4000))
        kind = 'directory'
      } else if (entry.isFile() && name.endsWith('.md')) {
        front = parseFrontmatter((await readFile(full, 'utf-8')).slice(0, 4000))
        kind = 'flat'
      } else continue

      const isUser = !!front.userCreated
      const settings = readSkillSettings(full)
      all.push({
        name: kind === 'flat' ? name.replace(/\\.md$/, '') : name,
        description: front.description || '',
        kind,
        source: full,
        enabled,
        userCreated: isUser,
        settingsEnabled: settings?.enabled ?? false,
        alias: settings?.alias,
        category: settings?.category,
        shortcut: settings?.shortcut,
        plugins: settings?.plugins ?? [],
        isUser,
      })
    } catch { /* 跳过无法读取的 */ }
  }

  const total = all.length
  const unmanaged = all.filter(s => !s.isUser).length
  // 只返回用户技能
  const skills = all.filter(s => s.isUser).map(({ isUser, ...rest }) => rest)
  return { skills: skills.sort((a, b) => a.name.localeCompare(b.name)), total, unmanaged }
}

/** 读技能目录里的设置文件（设置存在技能目录内） */
function readSkillSettings(skillPath: string): SkillSettings | null {
  const newPath = path.join(skillPath, SETTINGS_FILE)
  try {
    const p = newPath
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    return {
      enabled: !!raw.enabled,
      alias: raw.alias ? String(raw.alias) : undefined,
      category: raw.category ? String(raw.category) : undefined,
      shortcut: raw.shortcut ? String(raw.shortcut) : undefined,
      plugins: Array.isArray(raw.plugins) ? raw.plugins.map((p: any) => ({
        id: String(p?.id ?? ''),
        name: String(p?.name ?? p?.id ?? ''),
        packageId: p?.packageId ? String(p.packageId) : undefined,
        attachedAt: String(p?.attachedAt ?? ''),
        lastSeenAt: p?.lastSeenAt ? String(p.lastSeenAt) : undefined,
      })).filter((p: SkillPluginRef) => !!p.id) : [],
      fields: Array.isArray(raw.fields) ? raw.fields : [],
    }
  } catch { return null }
}

/** 写技能设置到技能目录 */
function writeSkillSettings(skillPath: string, settings: SkillSettings): { ok: boolean; error?: string } {
  try {
    writeFileSync(path.join(skillPath, SETTINGS_FILE), JSON.stringify(settings, null, 2), 'utf-8')
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 把动态插件归属到某个技能：读写该技能本地 .veryskill.json 的 plugins 数组 */
function attachPluginToSkill(skillPath: string, plugin: { id: string; name?: string; packageId?: string }): { ok: boolean; error?: string } {
  try {
    const existing = readSkillSettings(skillPath) ?? { enabled: false, plugins: [], fields: [] }
    const plugins = existing.plugins.filter(p => p.id !== plugin.id)
    plugins.unshift({
      id: plugin.id,
      name: plugin.name || plugin.id,
      packageId: plugin.packageId || undefined,
      attachedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    })
    return writeSkillSettings(skillPath, { ...existing, plugins })
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 从技能本地文件移除某个动态插件的归属 */
function detachPluginFromSkill(skillPath: string, pluginId: string): { ok: boolean; error?: string } {
  try {
    const existing = readSkillSettings(skillPath) ?? { enabled: false, plugins: [], fields: [] }
    const plugins = existing.plugins.filter(p => p.id !== pluginId)
    return writeSkillSettings(skillPath, { ...existing, plugins })
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 创建技能：目录技能 + SKILL.md，自动打 x-user-created 标记 */
async function createSkill(name: string, description: string, content: string): Promise<{ ok: boolean; error?: string; path?: string; name?: string }> {
  const clean = name.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').toLowerCase() || 'unnamed-skill'
  const dir = path.join(SKILLS_DIR, clean)
  if (existsSync(dir)) return { ok: false, error: `技能「${clean}」已存在` }
  try {
    await import('node:fs/promises').then(m => m.mkdir(dir, { recursive: true }))
    const body = content.trim() || `# ${clean}\n\n技能内容。`
    const md = `---\nname: ${clean}\ndescription: ${description || '用户创建的技能'}\nx-user-created: true\n---\n\n${body}\n`
    writeFileSync(path.join(dir, 'SKILL.md'), md, 'utf-8')
    return { ok: true, path: dir, name: clean }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 把设置/正文保存回 SKILL.md：保留 frontmatter 其它键（name/x-user-created/禁用标记），只更新 description 与正文 */
function saveSkillContent(skillName: string, opts: { description?: string; body: string }): { ok: boolean; error?: string } {
  try {
    const found = findSkillPath(skillName)
    if (!found) return { ok: false, error: '技能不存在' }
    const md = skillMarkdownPath(found.path)
    if (!md) return { ok: false, error: '未找到 SKILL.md' }
    const text = readFileSync(md, 'utf-8')
    const fm = splitFrontmatter(text)
    if (!fm) return { ok: false, error: 'frontmatter 格式异常，无法安全保存' }
    const headLines = fm.head.split('\n')
    const kept: string[] = []
    let sawDescription = false
    for (const line of headLines) {
      if (/^description\s*:/i.test(line)) {
        sawDescription = true
        kept.push(opts.description !== undefined && opts.description !== null
          ? `description: ${JSON.stringify(String(opts.description))}`
          : line)
      } else {
        kept.push(line)
      }
    }
    if ((opts.description !== undefined && opts.description !== null) && !sawDescription) {
      kept.push(`description: ${JSON.stringify(String(opts.description))}`)
    }
    const rebuilt = '---\n' + kept.join('\n') + '\n---\n\n' + String(opts.body ?? '').trim() + '\n'
    if (rebuilt === text) return { ok: true }
    writeFileSync(md, rebuilt, 'utf-8')
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 扫描技能内容，识别哪些内容适合做设置（带理由） */
function detectSettingsCandidates(skillPath: string): Array<{ key: string; label: string; reason: string; isSecret?: boolean }> {
  const out: Array<{ key: string; label: string; reason: string; isSecret?: boolean }> = []
  try {
    const dir = skillPath
    const files = [path.join(dir, 'SKILL.md')]
    // 也扫目录下其他 md
    const entries = readdirSync(dir, { withFileTypes: true })
    for (const e of entries) if (e.isFile() && e.name.endsWith('.md') && e.name !== 'SKILL.md') files.push(path.join(dir, e.name))

    for (const f of files) {
      if (!existsSync(f)) continue
      const text = readFileSync(f, 'utf-8').slice(0, 20000)
      // URL
      const urls = text.match(/https?:\/\/[^\s"'`)\]]+/g) || []
      const firstUrl = urls.length ? String([...new Set(urls)][0]) : ''
      if (firstUrl) {
        out.push({ key: 'api_base_url', label: 'API 地址', reason: `检测到接口地址「${firstUrl.slice(0, 40)}…」，每次调用都要用到，建议设为可配置项`, });
      }
      // 密钥 token
      const keyMatches = text.match(/(?:api[_-]?key|token|secret|password|密钥|apikey)\s*[:=]\s*['"]?([A-Za-z0-9_\-\.]{8,})/gi) || []
      if (keyMatches.length) {
        out.push({ key: 'api_key', label: 'API 密钥', isSecret: true, reason: '检测到密钥/凭据类内容，敏感信息不应写死在技能里，建议设为设置项（脱敏保存）' })
      }
      // 模型名
      if (/(model|模型)\s*[:=]\s*['"]?([\w\.\-]+)/i.test(text)) {
        out.push({ key: 'model', label: '模型名', reason: '检测到模型名，可能希望切换不同模型，建议设为设置项' })
      }
      // 数字参数（timeout/interval/轮询/等待）
      const numMatches = text.match(/(?:timeout|interval|poll|轮询|超时|等待|间隔)\D{0,10}(\d{2,6})/gi) || []
      if (numMatches.length) {
        out.push({ key: 'timeout_ms', label: '超时/轮询时间', reason: '检测到时间/轮询参数，不同环境可能需要调整，建议设为设置项' })
      }
      break // 只扫 SKILL.md（第一个文件），避免重复
    }
  } catch { /* ignore */ }
  return out
}

/** 解析 SKILL.md 的 YAML frontmatter（取 name/description/x-user-created） */
function parseFrontmatter(text: string): { name?: string; description?: string; userCreated?: boolean } {
  const out: { name?: string; description?: string; userCreated?: boolean } = {}
  try {
    const m = text.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!m) return out
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):\s*(.*)$/)
      if (!kv) continue
      const key = kv[1].trim()
      const val = kv[2].trim().replace(/^["']|["']$/g, '')
      if (key === 'name') out.name = val
      if (key === 'description') out.description = val
      if (key === 'x-user-created') out.userCreated = val === 'true' || val === 'TRUE'
    }
  } catch { /* ignore */ }
  return out
}

/** 拆分 frontmatter 的头（key: value 行）和正文（body） */
function splitFrontmatter(text: string): { head: string; rest: string } | null {
  const first = text.indexOf('\n')
  if (first < 0) return null
  if (text.slice(0, first).trim() !== '---') return null
  const close = text.indexOf('\n---', first + 1)
  if (close < 0) return null
  const head = text.slice(first + 1, close).trim()
  const rest = text.slice(close + 4)  // skip "\n---"
  return { head, rest }
}

/** 在 SKILL.md / 扁平 .md 的 frontmatter 写入/清除原生禁用标记（disable-model-invocation / user-invocable） */
function applyInvocationFlags(md: string, disable: boolean): boolean {
  const text = readFileSync(md, 'utf-8')
  const fm = splitFrontmatter(text)
  if (!fm) return false
  const drop = /^\s*(disable-model-invocation|user-invocable)\s*:\s*.*$/gm
  let head = fm.head.replace(drop, '').replace(/^\s*\n/gm, '').trim()
  if (disable) {
    head = (head ? head + '\n' : '') + 'disable-model-invocation: true\nuser-invocable: false'
  }
  const rebuilt = '---\n' + head + '\n---' + fm.rest
  if (rebuilt === text) return true
  writeFileSync(md, rebuilt, 'utf-8')
  return true
}

/** 解析技能路径指向的 md 文件（目录技能取 SKILL.md，扁平技能取自身） */
function skillMarkdownPath(skillPath: string): string | null {
  try {
    const st = statSync(skillPath, { throwIfNoEntry: false })
    if (!st) return null
    if (st.isDirectory()) {
      const md = path.join(skillPath, 'SKILL.md')
      return existsSync(md) ? md : null
    }
    if (st.isFile()) return skillPath
  } catch { /* ignore */ }
  return null
}

function getLocalVersion(): string {
  try {
    return JSON.parse(readFileSync(path.join(NM_DIR, SELF, 'package.json'), 'utf-8')).version ?? 'unknown'
  } catch { return 'unknown' }
}

/** 查找技能真实路径（支持禁用态的 .disabled 后缀） */
function findSkillPath(name: string): { path: string; disabled: boolean } | null {
  const candidates = [
    path.join(SKILLS_DIR, name),
    path.join(SKILLS_DIR, name, 'SKILL.md').replace(/\/SKILL\.md$/, ''),  // 目录技能
  ]
  const dirPath = path.join(SKILLS_DIR, name)
  const dirDisabled = path.join(SKILLS_DIR, name + '.disabled')
  if (existsSync(dirPath)) return { path: dirPath, disabled: false }
  if (existsSync(dirDisabled)) return { path: dirDisabled, disabled: true }
  const filePath = path.join(SKILLS_DIR, name + '.md')
  const fileDisabled = path.join(SKILLS_DIR, name + '.md.disabled')
  if (existsSync(filePath)) return { path: filePath, disabled: false }
  if (existsSync(fileDisabled)) return { path: fileDisabled, disabled: true }
  void candidates
  return null
}

/** 禁用：写入 frontmatter 禁用标记（原生机制，让 DSH 无感知），再加 .disabled 后缀 */
function disableSkill(name: string): { ok: boolean; error?: string } {
  try {
    const found = findSkillPath(name)
    if (!found) return { ok: false, error: '技能不存在' }
    // 写入 frontmatter 禁用标记（原生机制：DSH 从此不感知此技能）
    const md = skillMarkdownPath(found.path)
    if (md) applyInvocationFlags(md, true)
    if (found.disabled) return { ok: true }
    const disabledPath = found.path + '.disabled'
    if (existsSync(disabledPath)) rmSync(disabledPath, { recursive: true, force: true })
    renameSync(found.path, disabledPath)
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 启用：清除 frontmatter 禁用标记，再去掉 .disabled 后缀 */
function enableSkill(name: string): { ok: boolean; error?: string } {
  try {
    const found = findSkillPath(name)
    if (!found) return { ok: false, error: '技能不存在' }
    // 清除 frontmatter 禁用标记（原生机制：恢复 DSH 感知）
    const md = skillMarkdownPath(found.path)
    if (md) applyInvocationFlags(md, false)
    if (!found.disabled) return { ok: true }
    const disabledPath = found.path
    const enabledPath = disabledPath.replace(/\.disabled$/, '')
    if (existsSync(enabledPath)) rmSync(enabledPath, { recursive: true, force: true })
    renameSync(disabledPath, enabledPath)
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 删除：完整删除技能目录或 md 文件 */
function deleteSkill(name: string): { ok: boolean; error?: string } {
  try {
    const found = findSkillPath(name)
    if (!found) return { ok: false, error: '技能不存在' }
    rmSync(found.path, { recursive: true, force: true })
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 读技能内容：SKILL.md 全文 + frontmatter 拆分（body/meta）+ 目录文件列表 */
async function readSkillContent(name: string): Promise<any> {
  try {
    const found = findSkillPath(name)
    if (!found) return { ok: false, error: '技能不存在' }
    const isDir = (await import('node:fs')).statSync(found.path).isDirectory()
    const skillMd = isDir ? path.join(found.path, 'SKILL.md') : found.path
    let content = ''
    if (existsSync(skillMd)) content = (await readFile(skillMd, 'utf-8')).slice(0, 400000)
    const fm = splitFrontmatter(content)
    const front = fm ? parseFrontmatter(content) : null
    return {
      ok: true,
      name,
      kind: isDir ? 'directory' : 'flat',
      content,
      // 编辑用：剥离 frontmatter 的正文 + 元信息
      body: fm ? fm.rest.trim() : content,
      meta: { name: front?.name ?? name, description: front?.description ?? '' },
      path: skillMd,
      files: isDir ? (await readdir(found.path)).slice(0, 50) : [],
    }
  } catch (e: any) {
    return { ok: false, error: e?.message }
  }
}

export function apply(ctx: any, config: any = {}) {
  const scope = ctx.settings.register('veryskill', Schema.object({
    enabled: Schema.boolean().default(false)
      .description('启用超级技能：开启后设置页出现「超级技能」菜单，模型可通过工具查看技能'),
  }).description('管理 DSH 中已安装的技能插件'), { base: config })

  let enabledCache = false
  const getEnabled = () => {
    try {
      const val = scope.get?.() ?? {}
      if (typeof val.enabled === 'boolean') return val.enabled
    } catch { /* ignore */ }
    return enabledCache
  }

  // ─── Web 路由 ───────────────────────────────────────
  const json = (res: ServerResponse, data: any, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(data))
  }
  const readBody = async (req: IncomingMessage): Promise<any> => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')) } catch { return {} }
  }

  ctx.effect(() => {
    // 技能列表 + 开关状态 + 版本
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/list',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const { skills, total, unmanaged } = await scanSkills()
          json(res, { ok: true, enabled: getEnabled(), skills, stats: { total, unmanaged, managed: skills.length }, version: getLocalVersion() })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 保存开关
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/save',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          if (typeof body.enabled === 'boolean') {
            setToolsEnabled(body.enabled)
            const svc = ctx.get?.('settings') ?? ctx.settings
            if (svc?.update) await svc.update('veryskill', { enabled: body.enabled })
            else scope.update({ enabled: body.enabled })
            enabledCache = body.enabled
          }
          json(res, { ok: true })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 启用/禁用技能（级联：同步开关关联插件的 enabled）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/toggle',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          if (!name || name === SELF) return json(res, { ok: false, error: '无效的技能名' })
          const r = body.enabled ? enableSkill(name) : disableSkill(name)
          // 级联：把关联插件的 settings enabled 同步为同一状态（插件需注册同名 namespace 才生效）
          const cascade: Array<{ id: string; ok: boolean; error?: string }> = []
          const found = findSkillPath(name)
          if (found) {
            const settings = readSkillSettings(found.path)
            const svc = ctx.get?.('settings') ?? ctx.settings
            for (const p of settings?.plugins ?? []) {
              // namespace 推导：packageId 形如 dsh-verylook → verylook；否则退回插件 id
              const raw = (p.packageId && !p.packageId.includes('/')) ? p.packageId : p.id
              const ns = raw.replace(/^dsh-/, '')
              try {
                await svc.update(ns, { enabled: !!body.enabled })
                cascade.push({ id: p.id, ok: true })
              } catch (e: any) {
                cascade.push({ id: p.id, ok: false, error: e?.message })
              }
            }
          }
          json(res, { ...r, restart: true, cascade })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 创建技能（自动打 x-user-created 标记）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/create',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          if (!name) return json(res, { ok: false, error: '技能名不能为空' })
          const r = await createSkill(name, String(body.description ?? ''), String(body.content ?? ''))
          json(res, r)
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 扫描技能内容，识别哪些内容适合做设置（带理由）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/setup-scan',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          const found = findSkillPath(name)
          if (!found) return json(res, { ok: false, error: '技能不存在' })
          const candidates = detectSettingsCandidates(found.path)
          json(res, { ok: true, candidates })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 保存技能设置（存技能目录 .veryskill.json）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/setup-save',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          const found = findSkillPath(name)
          if (!found) return json(res, { ok: false, error: '技能不存在' })
          const settings: SkillSettings = {
            enabled: !!body.enabled,
            alias: body.alias ? String(body.alias).trim() : undefined,
            category: body.category ? String(body.category).trim() : undefined,
            shortcut: body.shortcut ? String(body.shortcut).trim() : undefined,
            // 保留已有插件归属，避免 setup-save 覆盖丢失
            plugins: (readSkillSettings(found.path)?.plugins ?? []),
            fields: Array.isArray(body.fields) ? body.fields.map((f: any) => ({
              key: String(f.key ?? ''), label: String(f.label ?? f.key ?? ''),
              value: String(f.value ?? ''), isSecret: !!f.isSecret, reason: String(f.reason ?? ''),
            })).filter(f => f.key) : [],
          }
          json(res, writeSkillSettings(found.path, settings))
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 单独保存快捷键（不覆盖其他设置）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/shortcut-save',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          if (!name) return json(res, { ok: false, error: '技能名不能为空' })
          const found = findSkillPath(name)
          if (!found) return json(res, { ok: false, error: '技能不存在' })
          const existing = readSkillSettings(found.path) ?? { enabled: false, plugins: [], fields: [] }
          const shortcut = body.shortcut ? String(body.shortcut).trim() : undefined
          json(res, writeSkillSettings(found.path, { ...existing, shortcut }))
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 自动归属：把动态插件记录进技能本地文件（创建插件后由外部/会话调用）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/plugin-attach',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.skill ?? '')
          const pluginId = String(body.pluginId ?? '')
          if (!name || !pluginId) return json(res, { ok: false, error: '需要 skill 与 pluginId' })
          const found = findSkillPath(name)
          if (!found) return json(res, { ok: false, error: '技能不存在' })
          const r = attachPluginToSkill(found.path, {
            id: pluginId,
            name: body.name ? String(body.name) : undefined,
            packageId: body.packageId ? String(body.packageId) : undefined,
          })
          json(res, r)
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 解除归属：从技能本地文件移除某个动态插件
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/plugin-detach',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.skill ?? '')
          const pluginId = String(body.pluginId ?? '')
          if (!name || !pluginId) return json(res, { ok: false, error: '需要 skill 与 pluginId' })
          const found = findSkillPath(name)
          if (!found) return json(res, { ok: false, error: '技能不存在' })
          json(res, detachPluginFromSkill(found.path, pluginId))
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 读技能设置
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/settings-get',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const name = url.searchParams.get('name') ?? ''
          const found = findSkillPath(name)
          if (!found) return json(res, { ok: false, error: '技能不存在' })
          json(res, { ok: true, settings: readSkillSettings(found.path) ?? { enabled: false, fields: [] } })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 临时改 agent-presets.default（新建技能时切创造模式用）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/default-preset',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const preset = String(body.preset ?? '')
          if (!['standard', 'cordis', 'code', 'minimal'].includes(preset)) return json(res, { ok: false, error: '无效预设' })
          const svc = ctx.get?.('settings') ?? ctx.settings
          if (svc?.mutate) {
            await svc.mutate('agent-presets', [{ op: 'set', path: ['default'], value: preset }])
          } else if (svc?.update) {
            await svc.update('agent-presets', { default: preset })
          }
          json(res, { ok: true, preset })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 反馈消息：往最新会话发一条系统消息（技能创建结果通知）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/feedback',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const text = String(body.text ?? '')
          if (!text) return json(res, { ok: false, error: '反馈文本不能为空' })
          // 找最新非 blank 会话
          const base = `http://127.0.0.1:3080/api/session.list`
          const listResp = await fetch(base, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'client-request', rpcId: 'sk-feedback-list', method: 'session.list', payload: {} }),
          })
          const listData: any = await listResp.json()
          const items: any[] = listData?.result?.value?.items ?? []
          const target = items
            .filter((s: any) => !s.blank)
            .sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))[0]
          if (!target?.sessionId) return json(res, { ok: false, error: '找不到可用会话' })
          // 发反馈消息
          const promptResp = await fetch('http://127.0.0.1:3080/api/session.prompt', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request', rpcId: 'sk-feedback-prompt',
              method: 'session.prompt',
              payload: { sessionId: target.sessionId, mode: 'queue', content: [{ type: 'text', text }] },
            }),
          })
          const promptData: any = await promptResp.json()
          json(res, { ok: promptData?.result?.ok ?? false, sessionId: target.sessionId })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 技能内容（编辑弹窗）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/content',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const name = url.searchParams.get('name') ?? ''
          if (!name || name === SELF) return json(res, { ok: false, error: '无效的技能名' })
          json(res, await readSkillContent(name))
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 保存技能内容（编辑弹窗：更新 description + 正文，保留 frontmatter 其它键）
    // ⚠️ 路径不能与上方「保存开关」的 /save 重复——DSH webserver 对 exact 路由去重，
    //    重复注册会导致整个 DSH 启动失败（duplicate exact route）。
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/save-content',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          if (!name || name === SELF) return json(res, { ok: false, error: '无效的技能名' })
          const r = saveSkillContent(name, {
            description: body.description !== undefined && body.description !== null ? String(body.description) : undefined,
            body: String(body.body ?? ''),
          })
          json(res, r)
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 删除技能（需 confirm === 'yes'）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/delete',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          if (!name || name === SELF) return json(res, { ok: false, error: '无效的技能名' })
          if (body.confirm !== 'yes') return json(res, { ok: false, error: '未确认删除' })
          json(res, { ...deleteSkill(name), restart: true })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 插件信息（读 profile node_modules 里插件包的 package.json，供关联卡片展示介绍）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/plugin-info',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.searchParams.get('id') ?? ''
          const packageId = url.searchParams.get('packageId') ?? ''
          if (!id) return json(res, { ok: false, error: '缺少插件标识' })
          // 按包名在 node_modules 里找 package.json：永久插件如 dsh-verylook 是 node_modules 目录；
          // 动态插件 id（如 verylook-1）不在 node_modules，则 packageId 兜底或返回空描述
          let pkg: any = null
          for (const c of [...new Set([packageId, id]).values()]) {
            if (!c) continue
            try {
              const p = path.join(NM_DIR, c, 'package.json')
              if (existsSync(p)) { pkg = JSON.parse(readFileSync(p, 'utf-8')); break }
            } catch { /* continue */ }
          }
          if (!pkg) return json(res, { ok: true, id, name: id, description: '', version: '', permanent: false })
          json(res, {
            ok: true,
            id,
            name: pkg.name ?? id,
            description: pkg.description ?? '',
            version: pkg.version ?? '',
            permanent: true,
          })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 检查更新
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/update',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const localVersion = getLocalVersion()
          let remoteVersion = '', hasUpdate = false
          try {
            const resp = await fetch(GITHUB_RAW, { signal: AbortSignal.timeout(8_000) })
            if (resp.ok) {
              remoteVersion = ((await resp.json() as any).version) ?? ''
              hasUpdate = remoteVersion !== '' && remoteVersion !== localVersion
            }
          } catch { /* 网络不可达保守无更新 */ }
          json(res, { ok: true, hasUpdate, remoteVersion, localVersion })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 智能检测
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/env-check',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const { skills } = await scanSkills()
          const categories = new Set<string>()
          for (const s of skills) {
            const cat = (s.category || '').trim()
            if (cat) categories.add(cat)
          }
          const items = [
            { id: 'skills', label: `管理的技能数：${skills.length}`, ok: true, errorReason: '' },
            { id: 'categories', label: `分类数：${categories.size}`, ok: true, errorReason: '' },
          ]
          json(res, { ok: true, items, version: getLocalVersion() })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 卸载本插件
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-veryskill/uninstall',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const pkg = readProfilePkg()
          if (pkg.dependencies?.[SELF]) delete pkg.dependencies[SELF]
          if (Array.isArray(pkg.dsh?.profile?.bundles)) {
            pkg.dsh.profile.bundles = pkg.dsh.profile.bundles.filter((b: string) => b !== SELF)
          }
          writeProfilePkg(pkg)
          const nm = path.join(NM_DIR, SELF)
          if (existsSync(nm)) rmSync(nm, { recursive: true, force: true })
          json(res, { ok: true, restart: true })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })
  })

  // ─── 工具注册 / 注销 ──────────────────────────────
  let toolDisposers: Array<() => void> = []

  const unregisterTools = () => {
    for (const dispose of toolDisposers.splice(0)) {
      try { dispose() } catch { /* ignore */ }
    }
  }

  const registerTools = () => {
    if (toolDisposers.length) return
    toolDisposers.push(ctx.tools.register(defineTool({
      name: 'list_skills',
      description: '列出 DSH 中已安装的技能插件（名称、描述、启用状态）。',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          skills: { type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              name: { type: 'string' }, description: { type: 'string' }, enabled: { type: 'boolean' },
            },
          } },
        } },
        render: (_a: any, v: any) => [
          { type: 'text', text: v.skills.length > 0
            ? v.skills.map((s: any) => `- ${s.name}（${s.enabled ? '启用' : '禁用'}）：${s.description}`).join('\n')
            : '暂无已安装技能。' },
        ] as never,
      },
      async execute() {
        if (!getEnabled()) throw new Error('超级技能已关闭，请在设置页启用。')
        const { skills } = await scanSkills()
        return { skills: skills.map(s => ({ name: s.name, description: s.description, enabled: s.enabled })) }
      },
    })))

    toolDisposers.push(ctx.tools.register(defineTool({
      name: 'get_skill',
      description: '获取指定技能插件的详细信息（来源路径、是否启用）。',
      parameters: { name: { type: 'string', description: '技能名称' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          found: { type: 'boolean' }, name: { type: 'string' }, description: { type: 'string' },
          source: { type: 'string' }, enabled: { type: 'boolean' },
        } },
        render: (a: any, v: any) => [
          { type: 'text', text: v.found
            ? `「${v.name}」（${v.enabled ? '启用' : '禁用'}）：${v.description}\n来源：${v.source}`
            : `未找到技能「${(a as any).name}」，可用 list_skills 查看。` },
        ] as never,
      },
      async execute(args: { name: string }) {
        if (!getEnabled()) throw new Error('超级技能已关闭，请在设置页启用。')
        const { skills } = await scanSkills()
        const s = skills.find(x => x.name === args.name)
        if (!s) return { found: false }
        return { found: true, name: s.name, description: s.description, source: s.source, enabled: s.enabled }
      },
    })))
  }

  const setToolsEnabled = (enabled: boolean) => {
    enabledCache = enabled
    if (enabled) registerTools()
    else unregisterTools()
  }

  // ─── 系统提示词 ──────────────────────────────────
  ctx.systemPrompt.section({
    name: 'veryskill',
    order: 200,
    text: () => {
      if (!getEnabled()) return ''
      return [
        '## 超级技能',
        '已开启超级技能。技能 = ~/.dsh/skills 下带 SKILL.md 的目录（用户创建的技能，frontmatter 带 x-user-created: true）。',
        '可调用 list_skills 查看所有已创建技能（含启用状态），调用 get_skill 获取单个技能的详情。',
        '创建/修改技能在 设置 → 超级技能 页面进行：新建技能、编辑内容、开启设置项、启用/禁用、关联配套插件。',
        '若一个技能需要配套插件（如调用外部 API 渲染器），请把插件做成「永久插件」：把代码放到 /vol1/1000/DeepSeek/dsh-xxx 并安装进 profile（package.json dependencies + dsh.profile.bundles），这样重启后依然生效。',
        '不要用「动态插件」（cordis 临时注册）作为技能的配套插件——动态插件在进程重启后会丢失，技能随之失效。',
      ].join('\n')
    },
  })

  const sync = () => {
    try {
      const val = scope.get?.() ?? {}
      const enabled = !!val.enabled
      if (enabled !== enabledCache) setToolsEnabled(enabled)
    } catch { /* ignore */ }
  }
  sync()
  // 用 ctx.effect 管理轮询，插件停用/卸载时自动清理（原 setInterval 无清理会泄漏）
  ctx.effect(() => {
    const timer = setInterval(sync, 5000)
    return () => clearInterval(timer)
  })
}
