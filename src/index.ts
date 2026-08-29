/**
 * dsh-skillskill — 技能管理插件（服务端）
 *
 * 技能 = profile node_modules 下的 dsh-* 插件目录（含 symlink）。
 * 启用/禁用 = 增删 profile package.json 的 dsh.profile.bundles 条目（隔离/恢复加载）。
 * 删除 = 移除 bundles 条目 + 删除 node_modules 里的目录/symlink（symlink 只删链接，保留源）。
 * 本插件自身不出现在技能列表（避免自禁用导致无法恢复）。
 */
import { readFileSync, writeFileSync, existsSync, rmSync, renameSync, readdirSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import * as path from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const inject = ['tools', 'settings', 'systemPrompt', 'webServer']

const dshHome = process.env.DSH_HOME ?? '/root/.dsh'
const PROFILE_DIR = path.join(dshHome, 'profiles', 'web')
const NM_DIR = path.join(PROFILE_DIR, 'node_modules')
const PKG_PATH = path.join(PROFILE_DIR, 'package.json')
const STATE_PATH = path.join(dshHome, '.skillskill.json')
const SKILLS_DIR = path.join(dshHome, 'skills')
const SELF = 'dsh-skillskill'
const GITHUB_RAW = 'https://ghfast.top/https://raw.githubusercontent.com/ideasir/dsh-skillskill/main/package.json'
const SETTINGS_FILE = '.skillskill.json'   // 存在技能目录里（设置存技能目录内）

interface Skill {
  name: string          // 技能名（目录名 或 md 文件名）
  description: string
  kind: 'directory' | 'flat'   // 目录技能（SKILL.md）或扁平技能（.md）
  source: string        // 完整路径（目录或 md 文件）
  enabled: boolean      // 是否被禁用（.disabled 后缀）
  userCreated: boolean  // 是否用户主动创建（frontmatter x-user-created: true）
  settingsEnabled: boolean  // 是否开启技能设置
}

interface SkillSettings {
  enabled: boolean       // 是否开启技能设置
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
        name: kind === 'flat' ? name.replace(/\.md$/, '') : name,
        description: front.description || '',
        kind,
        source: full,
        enabled,
        userCreated: isUser,
        settingsEnabled: settings?.enabled ?? false,
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
  try {
    const p = path.join(skillPath, SETTINGS_FILE)
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    return { enabled: !!raw.enabled, fields: Array.isArray(raw.fields) ? raw.fields : [] }
  } catch { return null }
}

/** 写技能设置到技能目录 */
function writeSkillSettings(skillPath: string, settings: SkillSettings): { ok: boolean; error?: string } {
  try {
    writeFileSync(path.join(skillPath, SETTINGS_FILE), JSON.stringify(settings, null, 2), 'utf-8')
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 创建技能：目录技能 + SKILL.md，自动打 x-user-created 标记 */
async function createSkill(name: string, description: string, content: string): Promise<{ ok: boolean; error?: string; path?: string }> {
  const clean = name.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').toLowerCase() || 'unnamed-skill'
  const dir = path.join(SKILLS_DIR, clean)
  if (existsSync(dir)) return { ok: false, error: `技能「${clean}」已存在` }
  try {
    await import('node:fs/promises').then(m => m.mkdir(dir, { recursive: true }))
    const body = content.trim() || `# ${clean}\n\n技能内容。`
    const md = `---\nname: ${clean}\ndescription: ${description || '用户创建的技能'}\nx-user-created: true\n---\n\n${body}\n`
    writeFileSync(path.join(dir, 'SKILL.md'), md, 'utf-8')
    return { ok: true, path: dir }
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
      for (const u0 of [...new Set(urls)].slice(0, 3)) {
        const u = String(u0)
        out.push({ key: 'api_base_url', label: 'API 地址', reason: `检测到接口地址「${u.slice(0, 40)}…」，每次调用都要用到，建议设为可配置项`, });
        break
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

/** 禁用：目录/文件加 .disabled 后缀（DSH 扫描不到 = 隔离） */
function disableSkill(name: string): { ok: boolean; error?: string } {
  try {
    const found = findSkillPath(name)
    if (!found) return { ok: false, error: '技能不存在' }
    if (found.disabled) return { ok: true }   // 已禁用
    const disabledPath = found.path + '.disabled'
    if (existsSync(disabledPath)) rmSync(disabledPath, { recursive: true, force: true })
    renameSync(found.path, disabledPath)
    return { ok: true }
  } catch (e: any) { return { ok: false, error: e?.message } }
}

/** 启用：去掉 .disabled 后缀（DSH 恢复扫描） */
function enableSkill(name: string): { ok: boolean; error?: string } {
  try {
    const found = findSkillPath(name)
    if (!found) return { ok: false, error: '技能不存在' }
    if (!found.disabled) return { ok: true }   // 已启用
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

/** 读技能内容：SKILL.md 全文 + 目录文件列表 */
async function readSkillContent(name: string): Promise<any> {
  try {
    const found = findSkillPath(name)
    if (!found) return { ok: false, error: '技能不存在' }
    const isDir = (await import('node:fs')).statSync(found.path).isDirectory()
    const skillMd = isDir ? path.join(found.path, 'SKILL.md') : found.path
    let content = ''
    if (existsSync(skillMd)) content = (await readFile(skillMd, 'utf-8')).slice(0, 40000)
    return {
      ok: true,
      name,
      kind: isDir ? 'directory' : 'flat',
      content,
      path: skillMd,
      files: isDir ? (await readdir(found.path)).slice(0, 50) : [],
    }
  } catch (e: any) {
    return { ok: false, error: e?.message }
  }
}

export function apply(ctx: any, config: any = {}) {
  const scope = ctx.settings.register(settingsNamespace('skillskill'), Schema.object({
    enabled: Schema.boolean().default(false)
      .description('启用技能管理：开启后设置页出现「技能管理」菜单，模型可通过工具查看技能'),
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
      kind: 'exact', path: '/plugins/dsh-skillskill/list',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const { skills, total, unmanaged } = await scanSkills()
          json(res, { ok: true, enabled: getEnabled(), skills, stats: { total, unmanaged, managed: skills.length }, version: getLocalVersion() })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 保存开关
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/save',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          if (typeof body.enabled === 'boolean') {
            setToolsEnabled(body.enabled)
            const svc = ctx.get?.('settings') ?? ctx.settings
            if (svc?.update) await svc.update(settingsNamespace('skillskill'), { enabled: body.enabled })
            else scope.update({ enabled: body.enabled })
            enabledCache = body.enabled
          }
          json(res, { ok: true })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 启用/禁用技能
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/toggle',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          if (!name || name === SELF) return json(res, { ok: false, error: '无效的技能名' })
          const r = body.enabled ? enableSkill(name) : disableSkill(name)
          json(res, { ...r, restart: true })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 创建技能（自动打 x-user-created 标记）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/create',
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
      kind: 'exact', path: '/plugins/dsh-skillskill/setup-scan',
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

    // 保存技能设置（存技能目录 .skillskill.json）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/setup-save',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const name = String(body.name ?? '')
          const found = findSkillPath(name)
          if (!found) return json(res, { ok: false, error: '技能不存在' })
          const settings: SkillSettings = {
            enabled: !!body.enabled,
            fields: Array.isArray(body.fields) ? body.fields.map((f: any) => ({
              key: String(f.key ?? ''), label: String(f.label ?? f.key ?? ''),
              value: String(f.value ?? ''), isSecret: !!f.isSecret, reason: String(f.reason ?? ''),
            })).filter(f => f.key) : [],
          }
          json(res, writeSkillSettings(found.path, settings))
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 读技能设置
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/settings-get',
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
      kind: 'exact', path: '/plugins/dsh-skillskill/default-preset',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const body = await readBody(req)
          const preset = String(body.preset ?? '')
          if (!['standard', 'cordis', 'code', 'minimal'].includes(preset)) return json(res, { ok: false, error: '无效预设' })
          const svc = ctx.get?.('settings') ?? ctx.settings
          if (svc?.mutate) {
            await svc.mutate(settingsNamespace('agent-presets'), [{ op: 'set', path: ['default'], value: preset }])
          } else if (svc?.update) {
            await svc.update(settingsNamespace('agent-presets'), { default: preset })
          }
          json(res, { ok: true, preset })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 反馈消息：往最新会话发一条系统消息（技能创建结果通知）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/feedback',
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
      kind: 'exact', path: '/plugins/dsh-skillskill/content',
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const name = url.searchParams.get('name') ?? ''
          if (!name || name === SELF) return json(res, { ok: false, error: '无效的技能名' })
          json(res, await readSkillContent(name))
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 删除技能（需 confirm === 'yes'）
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/delete',
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

    // 检查更新
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/update',
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
      kind: 'exact', path: '/plugins/dsh-skillskill/env-check',
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        try {
          const { skills } = await scanSkills()
          const bundles = getBundles()
          const items = [
            { id: 'dir', label: '插件目录', ok: existsSync(NM_DIR), errorReason: existsSync(NM_DIR) ? '' : '未找到 profile 插件目录' },
            { id: 'scan', label: '技能发现', ok: skills.length > 0, errorReason: skills.length > 0 ? '' : '未发现已安装技能' },
            { id: 'bundles', label: '加载清单', ok: bundles.length > 0, errorReason: bundles.length > 0 ? '' : 'bundles 配置为空' },
            { id: 'toggle', label: '技能管理开关', ok: getEnabled(), errorReason: getEnabled() ? '' : '技能管理当前为关闭状态' },
          ]
          json(res, { ok: true, items, version: getLocalVersion() })
        } catch (e: any) { json(res, { ok: false, error: e?.message }, 500) }
      },
    })

    // 卸载本插件
    ctx.webServer.register({
      kind: 'exact', path: '/plugins/dsh-skillskill/uninstall',
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
    toolDisposers.push(ctx.tools.register({
      name: 'list_skills',
      description: '列出 DSH 中已安装的技能插件（名称、描述、版本、启用状态）。',
      parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          skills: { type: 'array', items: {
            type: 'object', additionalProperties: false,
            properties: {
              name: { type: 'string' }, description: { type: 'string' },
              version: { type: 'string' }, enabled: { type: 'boolean' },
            },
            required: ['name', 'description', 'enabled'],
          } },
        }, required: ['skills'] },
        render: (_a: any, v: any) => [
          { type: 'text', text: v.skills.length > 0
            ? v.skills.map((s: any) => `- ${s.name}（${s.enabled ? '启用' : '禁用'}）：${s.description}`).join('\n')
            : '暂无已安装技能。' },
        ] as never,
      },
      async execute() {
        if (!getEnabled()) throw new Error('技能管理已关闭，请在设置页启用。')
        const { skills } = await scanSkills()
        return { skills: skills.map(s => ({ name: s.name, description: s.description, enabled: s.enabled })) }
      },
    }))

    toolDisposers.push(ctx.tools.register({
      name: 'get_skill',
      description: '获取指定技能插件的详细信息（来源路径、是否启用）。',
      parameters: { name: { type: 'string', description: '技能名称' } },
      output: {
        schema: { type: 'object', additionalProperties: false, properties: {
          found: { type: 'boolean' }, name: { type: 'string' }, description: { type: 'string' },
          source: { type: 'string' }, enabled: { type: 'boolean' },
        }, required: ['found'] },
        render: (a: any, v: any) => [
          { type: 'text', text: v.found
            ? `「${v.name}」（${v.enabled ? '启用' : '禁用'}）：${v.description}\n来源：${v.source}`
            : `未找到技能「${(a as any).name}」，可用 list_skills 查看。` },
        ] as never,
      },
      async execute(args: { name: string }) {
        if (!getEnabled()) throw new Error('技能管理已关闭，请在设置页启用。')
        const { skills } = await scanSkills()
        const s = skills.find(x => x.name === args.name)
        if (!s) return { found: false }
        return { found: true, name: s.name, description: s.description, source: s.source, enabled: s.enabled }
      },
    }))
  }

  const setToolsEnabled = (enabled: boolean) => {
    enabledCache = enabled
    if (enabled) registerTools()
    else unregisterTools()
  }

  // ─── 系统提示词 ──────────────────────────────────
  ctx.systemPrompt.section({
    name: 'skillskill',
    order: 200,
    text: () => {
      if (!getEnabled()) return ''
      return [
        '## 技能管理',
        '已开启技能管理。可调用 list_skills 查看所有已安装技能插件（含启用状态），',
        '调用 get_skill 获取单个技能的版本与来源详情。',
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
  setInterval(sync, 5000)
}
