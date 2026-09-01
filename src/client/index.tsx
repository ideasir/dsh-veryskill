/**
 * dsh-veryskill — 超级技能插件（客户端）
 *
 * 1. settings.plugin.item —— VerySkill 卡片（图标/版本/4标签 + 启动开关；无技能列表）
 * 2. settings.section —— 「超级技能」菜单（Agent 预设下方，动态注册/移除）
 *    内容：技能卡片对齐 Agent 预设样式（名称+描述+底部按钮行）
 *    按钮：启用/禁用 · 编辑（弹窗）· 设置（占位）· 删除（输入 yes 确认）
 */
import * as React from 'react'

/** Lucide lock 图标（密文字段标记，遵循 UI 规范：24 viewBox stroke-2） */
const LOCK_SVG = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-left:2px"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'

interface Skill {
  name: string
  description: string
  kind: 'directory' | 'flat'
  source: string
  enabled: boolean
  settingsEnabled?: boolean
  category?: string
  shortcut?: string
  plugins?: Array<{ id: string; name?: string; packageId?: string; attachedAt?: string; lastSeenAt?: string }>
}

interface EnvCheckItem { id: string; label: string; ok: boolean; errorReason: string }

const GITHUB_REPO = 'https://github.com/ideasir/dsh-veryskill'

function api(path: string, body?: any): Promise<any> {
  return fetch('/plugins/dsh-veryskill' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json()).catch(() => null)
}

// ── 模块级工具：把文本注入输入框（DSH 双图层 textarea + backdrop，须同步 React tracker） ──
function injectIntoInput(v: string): boolean {
  const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-phase]')
  if (!ta) return false
  try {
    const tracker = (ta as any)._valueTracker
    if (tracker) tracker.setValue('')
    const protoSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    if (protoSetter) {
      protoSetter.call(ta, v)
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    } else {
      ta.value = v
    }
    const syncBackdrop = () => {
      const cont = ta.parentElement
      const backdrop = cont ? [...cont.querySelectorAll('*')].find((el: any) => el.className && String(el.className).includes('backdrop')) : null
      if (backdrop && backdrop.textContent !== v) {
        if (tracker) tracker.setValue('')
        if (protoSetter) {
          protoSetter.call(ta, v)
          ta.dispatchEvent(new Event('input', { bubbles: true }))
        }
      }
    }
    setTimeout(syncBackdrop, 100)
    setTimeout(syncBackdrop, 500)
  } catch {
    ta.value = v
  }
  ta.focus()
  try { ta.setSelectionRange(v.length, v.length) } catch { /* ignore */ }
  return true
}

// 当前技能列表缓存（供 launcher 菜单与快捷键使用，避免频繁请求）
let skillsCache: Skill[] = []
function loadSkills(): Promise<Skill[]> {
  return api('/list').then((d) => {
    if (d?.ok) { skillsCache = d.skills || []; return skillsCache }
    return skillsCache
  })
}

function SkillIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flex: 'none' }}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  )
}

// ── 小图标（Lucide 24x24 2px） ────────────────────────
const Ic = {
  plug: (p: any) => (
    <svg width={p?.size ?? 14} height={p?.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a6 6 0 0 1-6 6" /><path d="M6 8v5c0 1.1.3 2.1.9 3" />
      <path d="M5 11h14" />
    </svg>
  ),
  power: (p: any) => (
    <svg width={p?.size ?? 14} height={p?.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v10" /><path d="M18.4 6.6a9 9 0 1 1-12.77.04" />
    </svg>
  ),
  edit: (p: any) => (
    <svg width={p?.size ?? 14} height={p?.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  ),
  settings: (p: any) => (
    <svg width={p?.size ?? 14} height={p?.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  ),
  trash: (p: any) => (
    <svg width={p?.size ?? 14} height={p?.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  x: (p: any) => (
    <svg width={p?.size ?? 14} height={p?.size ?? 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  ),
}

// ── 弹窗栈：多个弹窗叠加时，ESC 只关闭最上层激活的那个 ──
// 每个 Modal 挂载时把自己的 close 引用入栈（用 ref 保证稳定），卸载时出栈；
// 全局只注册一次 keydown 监听，ESC 时取栈顶执行 —— 叠加弹窗不再一次全关。
const modalCloseStack: Array<React.MutableRefObject<(() => void) | null>> = []
let escListenerInstalled = false
function installEscListener() {
  if (escListenerInstalled) return
  escListenerInstalled = true
  // 捕获阶段监听（window 最先执行），有弹窗时拦截 ESC：
  // 防止事件冒泡到 document 上 DSH 设置面板的 ESC 监听（它会把设置面板整个关掉，
  // 导致超级技能 section 卸载、所有弹窗一起消失）。
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    const top = modalCloseStack[modalCloseStack.length - 1]
    if (!top?.current) return
    e.stopPropagation()  // 只关最上层弹窗，不连设置面板一起关
    e.preventDefault()
    top.current()
  }, true)
}

// ── 弹窗容器（body portal + ESC 关闭栈顶） ────────────────
function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  // 用 ref 包住 onClose：避免内联函数每次渲染变化导致 effect 反复入栈出栈
  const closeRef = React.useRef<(() => void) | null>(onClose)
  closeRef.current = onClose
  React.useEffect(() => {
    modalCloseStack.push(closeRef)
    installEscListener()
    return () => {
      const i = modalCloseStack.indexOf(closeRef)
      if (i >= 0) modalCloseStack.splice(i, 1)
    }
  }, [])
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483000,
        background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: `min(${width}px, 92vw)`, maxHeight: '80vh', overflow: 'auto',
          background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)',
          borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid var(--dsw-alias-border-l1)',
          position: 'sticky', top: 0, background: 'var(--dsw-alias-bg-layer-2)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>{title}</span>
          <button
            type="button" onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', display: 'inline-flex', padding: 4 }}
          ><Ic.x /></button>
        </div>
        <div style={{ padding: '14px 16px' }}>{children}</div>
      </div>
    </div>
  )
}

// ── 删除确认弹窗（输入 yes） ───────────────────────────
function DeleteConfirm({ name, onCancel, onConfirm }: { name: string; onCancel: () => void; onConfirm: () => void }) {
  const [text, setText] = React.useState('')
  const ok = text.trim().toLowerCase() === 'yes'
  return (
    <Modal title={`删除技能 ${name}`} onClose={onCancel} width={460}>
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.6 }}>
        将<strong>完整删除</strong>该技能：移除加载配置与文件（symlink 仅删链接，保留源目录）。此操作不可恢复。
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
        如确认删除，请在下方输入 <code style={{ color: 'var(--dsw-alias-state-error-primary)', fontFamily: 'var(--dsw-font-mono, Menlo, monospace)' }}>yes</code>
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入 yes 确认"
        autoFocus
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)',
          borderRadius: 10, padding: '9px 12px', fontSize: 13,
          color: 'var(--dsw-alias-label-primary)', outline: 'none', marginBottom: 14,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13,
          border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
          color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        }}>取消</button>
        <button type="button" disabled={!ok} onClick={onConfirm} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
          background: ok ? 'var(--dsw-alias-state-error-primary, #ef4444)' : 'rgba(239,68,68,0.35)',
          color: 'var(--dsw-alias-label-primary-inverted, #fff)', cursor: ok ? 'pointer' : 'default',
        }}>确认删除</button>
      </div>
    </Modal>
  )
}

// ── 禁用/启用确认弹窗（展示逻辑说明，确认后再执行） ──
function ToggleConfirm({ name, enabled, onCancel, onConfirm }: { name: string; enabled: boolean; onCancel: () => void; onConfirm: () => void }) {
  const [confirming, setConfirming] = React.useState(false)
  return (
    <Modal title={enabled ? `禁用技能 ${name}` : `启用技能 ${name}`} onClose={onCancel} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {enabled ? (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.7 }}>
              禁用后，DSH 将<strong>不再加载这个技能</strong>：
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.8 }}>
              <li>模型<strong>看不到</strong>也调不到它——它从「可用技能」目录里消失</li>
              <li>技能的文件和设置都保留在磁盘上，<strong>不会删除</strong>，随时可重新启用</li>
              <li>新会话立即生效；当前会话的目录里它仍显示，新建会话后才消失</li>
            </ul>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.7 }}>
              启用后，DSH 将<strong>重新加载这个技能</strong>：
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.8 }}>
              <li>模型<strong>能看到</strong>并正常调用它——它回到「可用技能」目录</li>
              <li>新会话立即生效，无需重启</li>
            </ul>
          </>
        )}
        <p style={{ margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.5 }}>
          💡 如果这个技能有配套插件，请确保它是「永久插件」（安装在 profile 里），不要用动态插件——禁用技能不会影响已安装的插件。
        </p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button type="button" onClick={onCancel} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13,
          border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)',
          color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
        }}>取消</button>
        <button type="button" disabled={confirming} onClick={() => { setConfirming(true); onConfirm() }} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
          background: enabled ? 'var(--dsw-alias-state-error-primary, #ef4444)' : 'var(--dsw-alias-state-success-primary, #22c55e)',
          color: 'var(--dsw-alias-label-primary-inverted, #fff)', cursor: confirming ? 'default' : 'pointer', opacity: confirming ? .6 : 1,
        }}>{confirming ? '处理中…' : (enabled ? '确认禁用' : '确认启用')}</button>
      </div>
    </Modal>
  )
}

// ── 技能详情放大弹窗（点击技能卡片打开） ──────────────
function SkillDetailModal({ name, skill, onClose, onChanged, onEdit }: {
  name: string
  skill: Skill
  onClose: () => void
  onChanged: () => void
  onEdit: (name: string) => void
}) {
  const [detail, setDetail] = React.useState<any>(null)
  const [settings, setSettings] = React.useState<any>(null)
  const [err, setErr] = React.useState('')

  React.useEffect(() => {
    let alive = true
    api(`/content?name=${encodeURIComponent(name)}`).then((d) => {
      if (!alive) return
      if (d?.ok) setDetail(d)
      else setErr(d?.error ?? '读取失败')
    })
    api(`/settings-get?name=${encodeURIComponent(name)}`).then((d) => {
      if (!alive || !d?.ok) return
      setSettings(d.settings || { enabled: false, fields: [] })
    })
    return () => { alive = false }
  }, [name])

  const rowLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-tertiary)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '14px 0 8px' }
  const valueText: React.CSSProperties = { fontSize: 13, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.6 }

  return (
    <Modal title={`技能详情 — ${skill.name}`} onClose={onClose} width={680}>
      {err ? <p style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p> : (
        <>
          {/* 概要信息 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>{skill.name}</span>
              <span style={{ whiteSpace: 'nowrap', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 999, padding: '1px 10px', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' }}>
                {skill.kind === 'directory' ? '目录技能' : '单个技能'}
              </span>
              <span style={{
                whiteSpace: 'nowrap', borderRadius: 999, padding: '1px 10px', fontSize: 12, fontWeight: 500,
                background: skill.enabled ? 'var(--dsw-alias-bg-base)' : 'transparent',
                color: skill.enabled ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
                border: skill.enabled ? 'none' : '1px solid var(--dsw-alias-border-l2)',
              }}>
                {skill.enabled ? '已启用' : '已禁用'}
              </span>
              {settings?.enabled ? (
                <span style={{ whiteSpace: 'nowrap', borderRadius: 999, padding: '1px 10px', fontSize: 12, fontWeight: 500, background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 18%, transparent)', color: 'var(--dsw-alias-brand-primary, #a78bfa)' }}>
                  已开启设置
                </span>
              ) : null}
            </div>

            <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.6 }}>
              {skill.description || '（无描述）'}
            </div>

            <div style={{ fontFamily: 'var(--dsw-font-mono, Menlo, monospace)', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
              {skill.source}
            </div>
          </div>

          {/* 设置项 */}
          {settings?.enabled && settings.fields?.length > 0 ? (
            <>
              <div style={rowLabel}>设置项</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {settings.fields.map((f: any) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', minWidth: 110 }}>
                      {f.label} {f.isSecret ? <span dangerouslySetInnerHTML={{ __html: LOCK_SVG }} /> : ''}
                    </span>
                    <span style={{ fontSize: 13, color: f.isSecret ? 'var(--dsw-alias-label-secondary)' : 'var(--dsw-alias-label-primary)', fontFamily: 'var(--dsw-font-mono, Menlo, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.isSecret && f.value ? '••••••••' : (f.value || '（未填写）')}
                    </span>
                    {f.reason ? <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', marginLeft: 'auto' }}>{f.reason}</span> : null}
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {/* SKILL.md 内容 */}
          <div style={rowLabel}>技能内容</div>
          <pre style={{
            background: 'var(--dsw-alias-bg-layer-3)', border: '1px solid var(--dsw-alias-border-l1)',
            borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.55,
            fontFamily: 'var(--dsw-font-mono, ui-monospace, Menlo, monospace)',
            color: 'var(--dsw-alias-label-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: '36vh', overflow: 'auto', margin: 0,
          }}>
            {detail?.content || '（技能内容为空）'}
          </pre>

          {/* 操作 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => onEdit(skill.name)} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
            }}><Ic.edit size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />编辑内容</button>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
              color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
            }}>关闭</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── 技能设置弹窗（设置存技能目录） ────────────────────
function SkillSettingsModal({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved: () => void }) {
  const [settings, setSettings] = React.useState<any>({ enabled: false, fields: [] })
  const [loading, setLoading] = React.useState(true)
  const [err, setErr] = React.useState('')
  const [capturing, setCapturing] = React.useState(false)

  React.useEffect(() => {
    api(`/settings-get?name=${encodeURIComponent(name)}`).then((d) => {
      if (d?.ok) { setSettings(d.settings || { enabled: false, fields: [] }); setErr('') }
      else setErr(d?.error ?? '读取失败')
      setLoading(false)
    })
  }, [name])

  const changeField = (idx: number, value: string) => {
    setSettings((prev: any) => {
      const fields = [...prev.fields]
      fields[idx] = { ...fields[idx], value }
      return { ...prev, fields }
    })
  }

  const save = () => {
    api('/setup-save', { name, enabled: settings.enabled, category: settings.category, fields: settings.fields.map((f: any) => ({ key: f.key, label: f.label, value: f.value, isSecret: f.isSecret, reason: f.reason })) }).then((d) => {
      if (d?.ok) { onSaved(); onClose() }
      else setErr(d?.error ?? '保存失败')
    })
  }

  // 设置快捷键：点击后进入捕获态，监听下一次组合键，自动识别并保存
  const startCapture = () => {
    setCapturing(true); setErr('')
  }
  const cancelCapture = () => setCapturing(false)

  React.useEffect(() => {
    if (!capturing) return
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      const parts: string[] = []
      if (e.ctrlKey) parts.push('Ctrl')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      if (e.metaKey) parts.push('Meta')
      const k = e.key
      // 修饰键单独按下不算组合
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return
      const keyName = k.length === 1 ? k.toUpperCase() : k
      const combo = [...parts, keyName].join('+')
      setCapturing(false)
      api('/shortcut-save', { name, shortcut: combo }).then((d) => {
        if (d?.ok) {
          setSettings((prev: any) => ({ ...prev, shortcut: combo }))
          onSaved()
        } else setErr(d?.error ?? '保存快捷键失败')
      })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [capturing, name, onSaved])

  return (
    <Modal title={`技能设置 — ${name}`} onClose={onClose} width={560}>
      {loading ? <p style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>加载中…</p>
      : err ? <p style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p> : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
            {settings.enabled
              ? '已开启技能设置，以下参数在技能执行时会以你填写的值生效。'
              : '技能设置未开启 —— 在「设置引导」中开启后，这里才能配置可复用参数。'}
          </p>

          {/* 分类 */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>分类</label>
            <input
              value={settings.category ?? ''}
              onChange={(e) => setSettings((prev: any) => ({ ...prev, category: e.target.value }))}
              placeholder="如：创作、工具、效率（可留空）"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)',
                borderRadius: 10, padding: '8px 12px', fontSize: 13,
                color: 'var(--dsw-alias-label-primary)', outline: 'none',
              }}
            />
          </div>

          {/* 快捷键 */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>快捷键（快速把技能名填入输入框）</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <code style={{
                flex: 1, padding: '8px 12px', borderRadius: 10, fontSize: 13, textAlign: 'center',
                background: 'var(--dsw-alias-bg-layer-1)', border: `1px solid ${capturing ? 'var(--dsw-alias-brand-primary, #7c6cf0)' : 'var(--dsw-alias-border-l2)'}`,
                color: capturing ? 'var(--dsw-alias-brand-primary, #b6aaff)' : 'var(--dsw-alias-label-primary)',
                fontFamily: 'var(--dsw-font-mono, Menlo, monospace)',
              }}>
                {capturing ? '请按下组合键…' : (settings.shortcut ?? '未设置')}
              </code>
              {capturing ? (
                <button type="button" onClick={cancelCapture} style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
                  color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>取消</button>
              ) : (
                <button type="button" onClick={startCapture} style={{
                  padding: '7px 12px', borderRadius: 8, fontSize: 13, border: 'none',
                  background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{settings.shortcut ? '重设' : '设置'}</button>
              )}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
              点击「设置」后按下组合键（如 Ctrl+Shift+1）即自动保存。
            </p>
          </div>

          {settings.enabled && settings.fields.length === 0 ? (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
              此技能暂无设置项。可在创建时或「设置引导」中添加可复用参数。
            </p>
          ) : null}
          {settings.enabled ? settings.fields.map((f: any, idx: number) => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>
                {f.label} {f.isSecret ? '（敏感）' : ''}
              </label>
              <input
                value={f.value}
                onChange={(e) => changeField(idx, e.target.value)}
                type={f.isSecret ? 'password' : 'text'}
                placeholder={f.isSecret ? '••••••••' : '填写值'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)',
                  borderRadius: 10, padding: '8px 12px', fontSize: 13,
                  color: 'var(--dsw-alias-label-primary)', outline: 'none',
                }}
              />
              {f.reason ? <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{f.reason}</p> : null}
            </div>
          )) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
              color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
            }}>取消</button>
            {settings.enabled ? (
              <button type="button" onClick={save} style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
                background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)', cursor: 'pointer',
              }}>保存</button>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  )
}

// ── 创建技能弹窗（多步：信息 → 问是否开设置 → 候选列表+理由 → 勾选 → 收尾清单） ──
function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = React.useState(1)          // 1 填信息 2 问设置 3 选设置项 4 收尾清单
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [content, setContent] = React.useState('')
  const [enableSettings, setEnableSettings] = React.useState(false)
  const [candidates, setCandidates] = React.useState<Array<{ key: string; label: string; reason: string; isSecret?: boolean }>>([])
  const [checked, setChecked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')
  const [createdName, setCreatedName] = React.useState('')
  const [showPlugins, setShowPlugins] = React.useState(false)
  const [showEdit, setShowEdit] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)

  // 步骤2：用户选择是否开启技能设置
  const proceedSetup = (yes: boolean) => {
    setEnableSettings(yes)
    if (yes) {
      // 扫描候选设置项
      setBusy(true)
      api('/setup-scan', { name: createdName }).then((d) => {
        setBusy(false)
        if (d?.ok) {
          const cands = d.candidates || []
          setCandidates(cands)
          setChecked(new Set(cands.map((c: any) => c.key)))
          setStep(3)
        } else setErr(d?.error ?? '扫描失败')
      })
    } else {
      // 不开启设置，直接进入收尾清单
      api('/setup-save', { name: createdName, enabled: false, fields: [] }).then((d) => {
        if (d?.ok) setStep(4)
        else setErr(d?.error ?? '保存失败')
      })
    }
  }

  // 步骤1：创建技能（后端返回规范化 name）
  const create = () => {
    if (!name.trim()) return setErr('技能名不能为空')
    setBusy(true)
    setErr('')
    api('/create', { name, description, content }).then((d) => {
      setBusy(false)
      if (d?.ok) {
        setCreatedName(d.name ?? name.trim())
        setStep(2)   // 进入"是否开启技能设置"引导
      } else setErr(d?.error ?? '创建失败')
    })
  }

  // 步骤3：保存勾选的设置项
  const saveSetup = () => {
    const fields = candidates
      .filter(c => checked.has(c.key))
      .map(c => ({ key: c.key, label: c.label, value: '', isSecret: c.isSecret, reason: c.reason }))
    setBusy(true)
    api('/setup-save', { name: createdName, enabled: true, fields }).then((d) => {
      setBusy(false)
      if (d?.ok) setStep(4)
      else setErr(d?.error ?? '保存失败')
    })
  }

  const toggleCheck = (key: string) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 10, padding: '8px 12px', fontSize: 13,
    color: 'var(--dsw-alias-label-primary)', outline: 'none',
  }

  const stepTitle = step === 1 ? '新建超级技能' : step === 2 ? '开启技能设置？' : step === 3 ? '选择可复用的设置项' : '创建完成 · 收尾'

  return (
    <Modal title={stepTitle} onClose={onClose} width={620}>
      {err ? <p style={{ margin: '0 0 10px', color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p> : null}

      {step === 1 ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>技能名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：视频生成、网站登录" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>技能描述</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这个技能是做什么的" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>技能内容（SKILL.md 正文）</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="技能的使用说明、步骤、指令……"
              rows={6}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
              color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
            }}>取消</button>
            <button type="button" onClick={create} disabled={busy} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            }}>{busy ? '创建中…' : '创建技能'}</button>
          </div>
        </>
      ) : step === 2 ? (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.6 }}>
            技能「{createdName}」创建完成！
            <br />
            <span style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>
              是否开启<strong>技能设置</strong>？开启后会自动扫描技能内容，识别出可复用的参数（如 API 地址、密钥、模型名、时间参数），你可以在设置里填写。
            </span>
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => proceedSetup(false)} disabled={busy} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)', cursor: busy ? 'default' : 'pointer',
            }}>不开，保持纯内容</button>
            <button type="button" onClick={() => proceedSetup(true)} disabled={busy} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            }}>{busy ? '扫描中…' : '开启技能设置'}</button>
          </div>
        </>
      ) : step === 3 ? (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' }}>
            检测到以下内容适合作为可复用设置项，勾选你希望设为设置的参数：
          </p>
          {candidates.length === 0 ? (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
              未检测到明显的可复用参数（如 API 地址、密钥、模型名等）。你也可以直接完成，设置项留空。
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {candidates.map(c => (
                <label key={c.key} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)',
                }}>
                  <input
                    type="checkbox"
                    checked={checked.has(c.key)}
                    onChange={() => toggleCheck(c.key)}
                    style={{ marginTop: 2, accentColor: 'var(--dsw-alias-brand-primary, #7c6cf0)' }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)' }}>
                      {c.label} {c.isSecret ? <span dangerouslySetInnerHTML={{ __html: LOCK_SVG }} /> : ''}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)', lineHeight: 1.5 }}>{c.reason}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => proceedSetup(false)} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
              color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
            }}>跳过设置</button>
            <button type="button" onClick={saveSetup} disabled={busy} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            }}>{busy ? '保存中…' : '完成'}</button>
          </div>
        </>
      ) : (
        <>
          {/* 收尾清单 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{ flex: 'none', fontSize: 20 }}>🎉</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>技能「{createdName}」已创建并规范化</div>
              <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-secondary)' }}>保存于 /root/.dsh/skills/{createdName}/SKILL.md（x-user-created: true，已纳入管理）</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', letterSpacing: '.05em', textTransform: 'uppercase' }}>收尾清单</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)' }}>
              <span style={{ fontSize: 13, color: 'var(--dsw-alias-state-success-primary)', fontWeight: 600 }}>✓</span>
              <span style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>技能内容与描述</span>
              <button type="button" onClick={() => setShowEdit(true)} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' }}>编辑</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)' }}>
              <span style={{ fontSize: 13, color: enableSettings ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-tertiary)', fontWeight: 600 }}>{enableSettings ? '✓' : '○'}</span>
              <span style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>{enableSettings ? `技能设置已开启（${checked.size} 项）` : '技能设置未开启'}</span>
              <button type="button" onClick={() => setShowSettings(true)} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' }}>设置</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)' }}>
              <span style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>○</span>
              <span style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)' }}>配套插件（如需）</span>
              <button type="button" onClick={() => setShowPlugins(true)} style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, fontSize: 12, border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer' }}>关联插件</button>
            </div>
          </div>

          <div style={{ padding: '9px 12px', borderRadius: 10, marginBottom: 14, background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 30%, transparent)', fontSize: 12, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.6 }}>
            💡 技能需要配套插件时，请把它做成<strong>永久插件</strong>（安装进 profile，如 <code style={{ color: 'var(--dsw-alias-brand-primary, #b6aaff)' }}>dsh-agimg</code>），重启后依然生效；不要用动态插件（进程重启即失效）。
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => { onCreated() }} style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)', cursor: 'pointer',
            }}>完成</button>
          </div>
        </>
      )}

      {showPlugins ? <PluginModal name={createdName} onClose={() => setShowPlugins(false)} onChanged={() => { /* 刷新父列表由 onCreated 完成 */ }} /> : null}
      {showEdit ? <EditModal name={createdName} onClose={() => setShowEdit(false)} onSaved={() => { /* 编辑保存后内容即更新 */ }} /> : null}
      {showSettings ? <SkillSettingsModal name={createdName} onClose={() => setShowSettings(false)} onSaved={() => { /* 设置保存后刷新 */ }} /> : null}
    </Modal>
  )
}

// ── 编辑弹窗（SKILL.md 描述+正文，可保存回写） ──────────────
function EditModal({ name, onClose, onSaved }: { name: string; onClose: () => void; onSaved?: () => void }) {
  const [data, setData] = React.useState<any>(null)
  const [description, setDescription] = React.useState('')
  const [body, setBody] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')

  React.useEffect(() => {
    api(`/content?name=${encodeURIComponent(name)}`).then((d) => {
      if (d?.ok) {
        setData(d)
        setDescription(d.meta?.description ?? '')
        setBody(d.body ?? d.content ?? '')
      } else setErr(d?.error ?? '读取失败')
    })
  }, [name])

  const save = () => {
    setBusy(true); setErr('')
    api('/save-content', { name, description, body }).then((d) => {
      setBusy(false)
      if (d?.ok) { onSaved?.(); onClose() }
      else setErr(d?.error ?? '保存失败')
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 10, padding: '8px 12px', fontSize: 13,
    color: 'var(--dsw-alias-label-primary)', outline: 'none',
  }

  return (
    <Modal title={`编辑技能内容 — ${name}`} onClose={onClose} width={760}>
      {err ? <p style={{ margin: '0 0 10px', color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p>
      : !data ? <p style={{ color: 'var(--dsw-alias-label-secondary)', fontSize: 13 }}>加载中…</p> : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', whiteSpace: 'nowrap' }}>技能名（不可改）</span>
            <code style={{ fontSize: 13, color: 'var(--dsw-alias-label-primary)', fontFamily: 'var(--dsw-font-mono, Menlo, monospace)', background: 'var(--dsw-alias-bg-layer-1)', padding: '4px 10px', borderRadius: 8 }}>
              {data.meta?.name ?? name}
            </code>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>
              {data.kind === 'directory' ? '目录技能' : '单个技能'} · {data.files?.length ?? 0} 个文件
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>技能描述（会展示在技能列表与模型目录中）</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 }}>SKILL.md 正文</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={18}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--dsw-font-mono, ui-monospace, Menlo, monospace)', fontSize: 12, lineHeight: 1.6 }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
              color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
            }}>取消</button>
            <button type="button" disabled={busy} onClick={save} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            }}>{busy ? '保存中…' : '保存'}</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── 关联插件弹窗（归属/审计 + 永久插件引导） ────────────
function PluginModal({ name, onClose, onChanged }: { name: string; onClose: () => void; onChanged: () => void }) {
  const [plugins, setPlugins] = React.useState<Array<{ id: string; name?: string; packageId?: string; attachedAt?: string }>>([])
  const [pluginId, setPluginId] = React.useState('')
  const [pluginName, setPluginName] = React.useState('')
  const [busy, setBusy] = React.useState('')
  const [err, setErr] = React.useState('')

  const loadPlugins = React.useCallback(() => {
    api(`/settings-get?name=${encodeURIComponent(name)}`).then((d) => {
      if (d?.ok) setPlugins(d.settings?.plugins ?? [])
    })
  }, [name])

  React.useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const attach = () => {
    const pid = pluginId.trim()
    if (!pid) return setErr('请输入插件标识')
    setBusy(pid); setErr('')
    api('/plugin-attach', { skill: name, pluginId: pid, name: pluginName.trim() || undefined }).then((d) => {
      setBusy('')
      if (d?.ok) { setPluginId(''); setPluginName(''); loadPlugins(); onChanged() }
      else setErr(d?.error ?? '关联失败')
    })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 10, padding: '8px 12px', fontSize: 13,
    color: 'var(--dsw-alias-label-primary)', outline: 'none',
  }

  return (
    <Modal title={`关联插件 — ${name}`} onClose={onClose} width={600}>
      {/* 永久插件强调 */}
      <div style={{
        display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, marginBottom: 12,
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 35%, transparent)',
      }}>
        <span style={{ flex: 'none', fontSize: 16, lineHeight: '20px' }}>🔌</span>
        <span style={{ fontSize: 12.5, color: 'var(--dsw-alias-label-primary)', lineHeight: 1.6 }}>
          <strong>什么是「关联插件」</strong>：每个技能在运行时可能需要一个配套插件来执行实际工作（例如 agnes-image 技能由 <code style={{ color: 'var(--dsw-alias-brand-primary, #b6aaff)' }}>dsh-agimg</code> 插件渲染图片，agnes-video 技能由 <code style={{ color: 'var(--dsw-alias-brand-primary, #b6aaff)' }}>dsh-ovkovk</code> 插件驱动视频生成）。关联就是把配套插件记录到本技能，方便追踪技能由哪些插件驱动。
          <br /><br />
          <strong>配套插件请做成「永久插件」</strong>：把代码放到 <code style={{ color: 'var(--dsw-alias-brand-primary, #b6aaff)' }}>/vol1/1000/DeepSeek/dsh-xxx</code> 并安装进 profile
          （<code style={{ color: 'var(--dsw-alias-brand-primary, #b6aaff)' }}>package.json dependencies + dsh.profile.bundles</code>），重启后依然生效。
          <br />
          <strong style={{ color: 'var(--dsw-alias-state-error-primary, #ef4444)' }}>不要用动态插件</strong>（cordis 临时注册）做配套插件——动态插件在进程重启后会丢失，技能随之失效。
        </span>
      </div>

      {err ? <p style={{ margin: '0 0 10px', color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p> : null}

      {/* 已关联 */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '0 0 8px' }}>
          已关联插件（{plugins.length}）
        </div>
        {plugins.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>尚未关联任何插件。</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {plugins.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--dsw-alias-bg-layer-1)', border: '1px solid var(--dsw-alias-border-l1)' }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--dsw-alias-label-primary)', minWidth: 120 }}>{p.name || p.id}</span>
                <code style={{ fontSize: 11, color: 'var(--dsw-alias-label-secondary)', fontFamily: 'var(--dsw-font-mono, Menlo, monospace)' }}>{p.id}</code>
                {p.packageId ? <span style={{ fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{p.packageId}</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 手动关联：仅当该技能确实用到某个插件时填写 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', letterSpacing: '.05em', textTransform: 'uppercase', margin: '0 0 8px' }}>手动关联</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={pluginId} onChange={(e) => setPluginId(e.target.value)} placeholder="插件标识，如 dsh-agimg / agimg-1" style={inputStyle} />
          <input value={pluginName} onChange={(e) => setPluginName(e.target.value)} placeholder="显示名（可选）" style={{ ...inputStyle, flex: '0 0 30%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onClose} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13,
          border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
          color: 'var(--dsw-alias-label-primary)', cursor: 'pointer',
        }}>关闭</button>
        <button type="button" disabled={!!busy} onClick={attach} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
          background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: 'var(--dsw-alias-label-primary-inverted, #fff)',
          cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
        }}>关联</button>
      </div>
    </Modal>
  )
}

// ── 技能卡片（对齐 Agent 预设样式） ───────────────────
function SkillCard({ skill, onChanged, onEdit }: {
  skill: Skill
  onChanged: () => void
  onEdit: (name: string) => void
}) {
  const [busy, setBusy] = React.useState('')
  const [hovered, setHovered] = React.useState(false)
  const [showDelete, setShowDelete] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const [showPlugins, setShowPlugins] = React.useState(false)
  const [showDetail, setShowDetail] = React.useState(false)
  const [showToggleConfirm, setShowToggleConfirm] = React.useState(false)
  const [notice, setNotice] = React.useState('')
  const noticeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashNotice = (msg: string) => {
    setNotice(msg)
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    noticeTimer.current = setTimeout(() => setNotice(''), 5000)
  }

  React.useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
  }, [])

  const doDelete = () => {
    setBusy('delete')
    api('/delete', { name: skill.name, confirm: 'yes' }).then((r) => {
      setBusy('')
      setShowDelete(false)
      if (r?.ok) onChanged()
      else alert(r?.error ?? '删除失败')
    })
  }
  const doToggle = () => {
    setShowToggleConfirm(false)
    setBusy('toggle')
    api('/toggle', { name: skill.name, enabled: !skill.enabled }).then((r) => {
      setBusy('')
      if (r?.ok) {
        onChanged()
        flashNotice(skill.enabled
          ? `已禁用「${skill.name}」—— 新会话立即生效；当前会话中它仍在目录里，新建会话后消失。`
          : `已启用「${skill.name}」—— 新会话将重新加载该技能。`)
      } else alert(r?.error ?? '操作失败')
    })
  }

  const footBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 8, fontSize: 12,
    border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
    transition: 'background .12s, color .12s, border-color .12s',
  }

  // 悬停效果：鼠标进入时底色/边框加深为强调色，离开恢复原值（内联 style 无法用 :hover 伪类）
  const makeHover = (color: string) => {
    let origBg = '', origBd = ''
    return {
      onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => {
        const el = e.currentTarget
        if (el.disabled) return
        if (!origBg && el.style.background) origBg = el.style.background
        if (!origBd && el.style.borderColor) origBd = el.style.borderColor
        el.style.background = `color-mix(in srgb, ${color} 18%, transparent)`
        el.style.borderColor = `color-mix(in srgb, ${color} 60%, transparent)`
      },
      onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => {
        const el = e.currentTarget
        el.style.background = origBg || 'transparent'
        el.style.borderColor = origBd || 'var(--dsw-alias-border-l2)'
      },
    }
  }

  // 边框颜色：启用=绿、禁用=红；hover 时加深
  const borderColor = skill.enabled
    ? (hovered ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'color-mix(in srgb, var(--dsw-alias-state-success-primary, #22c55e) 55%, transparent)')
    : (hovered ? 'var(--dsw-alias-state-error-primary, #ef4444)' : 'color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 55%, transparent)')
  const shadowColor = skill.enabled ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'
  return (
    <li
      style={{
        border: `1px solid ${borderColor}`,
        boxShadow: hovered ? `0 0 0 1px ${shadowColor}, 0 4px 16px ${shadowColor}` : 'none',
        background: hovered ? 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 5%, transparent)' : 'var(--dsw-alias-bg-layer-1)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        listStyle: 'none', overflow: 'hidden', cursor: 'pointer',
        transition: 'border-color .15s ease, box-shadow .15s ease, background .15s ease',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* 卡片主体：点击 → 详情弹窗 */}
      <div
        style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 8, padding: '14px 16px 12px' }}
        onClick={(e) => {
          e.stopPropagation()
          setShowDetail(true)
        }}
        title="点击查看技能详情"
      >
        {/* 名称行 + 状态 badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: 'var(--dsw-alias-label-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0,
          }} title={skill.name}>
            {skill.name}
          </span>
          <span style={{
            whiteSpace: 'nowrap', border: '1px solid var(--dsw-alias-border-l2)',
            borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 500,
            color: 'var(--dsw-alias-label-secondary)', flex: 'none',
          }}>
            {skill.kind === 'directory' ? '目录技能' : '单个技能'}
          </span>
          {skill.category ? (
            <span style={{
              whiteSpace: 'nowrap', borderRadius: 999, padding: '2px 10px', fontSize: 13, fontWeight: 600,
              background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 16%, transparent)',
              color: 'var(--dsw-alias-brand-primary, #b6aaff)',
              border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 40%, transparent)',
              marginLeft: 'auto', flex: 'none',
            }}>
              {skill.category}
            </span>
          ) : (
            <span style={{ marginLeft: 'auto', flex: 'none' }} />
          )}
          {skill.shortcut ? (
            <kbd style={{
              whiteSpace: 'nowrap', borderRadius: 6, padding: '1px 6px', fontSize: 10,
              border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-tertiary)',
              fontFamily: 'var(--dsw-font-mono, Menlo, monospace)',
            }}>{skill.shortcut}</kbd>
          ) : null}
          <span style={{
            whiteSpace: 'nowrap', borderRadius: 999,
            padding: '1px 8px', fontSize: 11, fontWeight: 500,
            background: skill.enabled ? 'var(--dsw-alias-bg-base)' : 'transparent',
            color: skill.enabled ? 'var(--dsw-alias-label-primary)' : 'var(--dsw-alias-label-secondary)',
            border: skill.enabled ? 'none' : '1px solid var(--dsw-alias-border-l2)',
            flex: 'none',
          }}>
            {skill.enabled ? '已启用' : '已禁用'}
          </span>
        </div>
        {/* 描述 */}
        {skill.description ? (
          <div style={{
            color: 'var(--dsw-alias-label-secondary)', fontSize: 13, lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            minHeight: 42,
          }}>
            {skill.description}
          </div>
        ) : null}
        {/* 关联插件（归属/审计） */}
        {Array.isArray(skill.plugins) && skill.plugins.length > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <button type="button" onClick={(e) => { e.stopPropagation(); setShowPlugins(true) }} title="管理关联插件（推荐永久插件）"
              style={{
                whiteSpace: 'nowrap', borderRadius: 6, padding: '1px 7px', fontSize: 11, fontWeight: 600,
                background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 14%, transparent)',
                color: 'var(--dsw-alias-brand-primary, #b6aaff)',
                border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 35%, transparent)',
                cursor: 'pointer',
              }}>
              🔌 {skill.plugins.length} 个关联插件
            </button>
            {skill.plugins.map((p: any) => (
              <span key={p?.id ?? ''} title={`插件：${p?.name ?? ''}\npluginId：${p?.id ?? ''}`} style={{
                whiteSpace: 'nowrap', borderRadius: 6, padding: '1px 7px', fontSize: 11,
                background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 8%, transparent)',
                color: 'var(--dsw-alias-label-secondary)',
                border: '1px solid var(--dsw-alias-border-l2)',
              }}>
                {p?.id ?? ''}
              </span>
            ))}
          </div>
        ) : null}
        {/* 来源 */}
        <div style={{
          fontFamily: 'var(--dsw-font-mono, Menlo, monospace)', fontSize: 11,
          color: 'var(--dsw-alias-label-tertiary)', marginTop: 'auto',
        }}>
          {skill.source}
        </div>
      </div>

      {/* 底部按钮行：图标在上文字在下，小字 */}
      <div style={{ borderTop: '1px solid var(--dsw-alias-border-l1)', justifyContent: 'flex-end', gap: 2, padding: '5px 6px', display: 'flex', flexWrap: 'wrap' }}>
        <button type="button" disabled={!!busy} {...makeHover(skill.enabled ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'var(--dsw-alias-state-error-primary, #ef4444)')} onClick={(e) => { e.stopPropagation(); setShowToggleConfirm(true) }} title={skill.enabled ? '禁用技能（DSH 将不再加载）' : '启用技能'}
          style={{
            ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px',
            fontSize: 11, opacity: busy === 'toggle' ? .6 : 1,
            // 颜色标志：已启用=成功绿，已禁用=错误红
            color: skill.enabled ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'var(--dsw-alias-state-error-primary, #ef4444)',
            borderColor: busy === 'toggle'
              ? 'var(--dsw-alias-border-l2)'
              : `color-mix(in srgb, ${skill.enabled ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'var(--dsw-alias-state-error-primary, #ef4444)'} 45%, transparent)`,
            background: busy === 'toggle' ? 'transparent' : `color-mix(in srgb, ${skill.enabled ? 'var(--dsw-alias-state-success-primary, #22c55e)' : 'var(--dsw-alias-state-error-primary, #ef4444)'} 12%, transparent)`,
          }}>
          {busy === 'toggle'
            ? <><span className="dsh-sk-spin"><Ic.power size={12} /></span> 处理中…</>
            : <><Ic.power size={12} /> {skill.enabled ? '禁用' : '启用'}</>}
        </button>
        <button type="button" disabled={!!busy} {...makeHover('var(--dsw-alias-brand-primary, #7c6cf0)')} onClick={(e) => { e.stopPropagation(); onEdit(skill.name) }} title="编辑技能内容（描述 + SKILL.md 正文）"
          style={{ ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px', fontSize: 11 }}>
          <Ic.edit size={12} /> 编辑
        </button>
        <button type="button" disabled={!!busy} {...makeHover('var(--dsw-alias-brand-primary, #7c6cf0)')} onClick={(e) => { e.stopPropagation(); setShowPlugins(true) }} title="关联技能配套插件（推荐永久插件）"
          style={{ ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px', fontSize: 11 }}>
          <Ic.plug size={12} /> 插件
        </button>
        <button type="button" disabled={!!busy} {...(skill.settingsEnabled ? makeHover('var(--dsw-alias-brand-primary, #7c6cf0)') : {})} onClick={(e) => { e.stopPropagation(); setShowSettings(true) }} title={skill.settingsEnabled ? '配置技能参数设置' : '技能设置未开启（创建时选择不开设置）'}
          style={{ ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px', fontSize: 11, opacity: skill.settingsEnabled ? 1 : .45, cursor: skill.settingsEnabled ? 'pointer' : 'default' }}>
          <Ic.settings size={12} /> 设置
        </button>
        <button type="button" disabled={!!busy} {...makeHover('var(--dsw-alias-state-error-primary, #ef4444)')} onClick={(e) => { e.stopPropagation(); setShowDelete(true) }} title="删除技能"
          style={{
            ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px', fontSize: 11,
            color: 'var(--dsw-alias-state-error-primary, #ef4444)',
            borderColor: 'color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 40%, transparent)',
          }}>
          <Ic.trash size={12} /> 删除
        </button>
      </div>

      {showToggleConfirm ? (
        <ToggleConfirm name={skill.name} enabled={skill.enabled} onCancel={() => setShowToggleConfirm(false)} onConfirm={doToggle} />
      ) : null}
      {showDelete ? (
        <DeleteConfirm name={skill.name} onCancel={() => setShowDelete(false)} onConfirm={doDelete} />
      ) : null}
      {showSettings ? (
        <SkillSettingsModal name={skill.name} onClose={() => setShowSettings(false)} onSaved={onChanged} />
      ) : null}
      {showPlugins ? (
        <PluginModal name={skill.name} onClose={() => setShowPlugins(false)} onChanged={onChanged} />
      ) : null}
      {showDetail ? (
        <SkillDetailModal name={skill.name} skill={skill} onClose={() => setShowDetail(false)} onChanged={onChanged} onEdit={onEdit} />
      ) : null}
      {notice ? (
        <div style={{
          padding: '7px 12px', fontSize: 12, lineHeight: 1.5,
          color: 'var(--dsw-alias-label-secondary)',
          background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 8%, transparent)',
          borderTop: '1px solid var(--dsw-alias-border-l1)',
        }}>
          {notice}
        </div>
      ) : null}
    </li>
  )
}

// ── 超级技能菜单页（settings.section 内容） ───────────
function SkillManagerSection({ ctx }: { ctx?: any }) {
  const [skills, setSkills] = React.useState<Skill[]>([])
  const [stats, setStats] = React.useState<{ total: number; unmanaged: number; managed: number }>({ total: 0, unmanaged: 0, managed: 0 })
  const [loading, setLoading] = React.useState(true)
  const [editName, setEditName] = React.useState('')
  const [showCreate, setShowCreate] = React.useState(false)
  const [activeCat, setActiveCat] = React.useState('全部')

  const load = React.useCallback(() => {
    setLoading(true)
    api('/list').then((d) => {
      if (d?.ok) {
        setSkills(d.skills || [])
        setStats(d.stats || { total: 0, unmanaged: 0, managed: d.skills?.length ?? 0 })
      }
      setLoading(false)
    })
  }, [])

  React.useEffect(() => { load() }, [load])

  // 点「新建超级技能」→ 当前会话输入框注入提示词（不新建会话/工作区）
  const injectCreatePrompt = () => {
    const PREFIX = '新建一个技能：'
    const done = injectIntoInput(PREFIX)
    closeSettings()
    void done
  }

  // 关闭设置面板（ESC）
  const closeSettings = () => {
    setTimeout(() => {
      try {
        const escDown = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })
        const escUp = new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true })
        document.dispatchEvent(escDown)
        document.dispatchEvent(escUp)
      } catch { /* ignore */ }
    }, 250)
  }

  // 监听发送：用户提交「新建一个技能：xxx」→ 自动创建规范化技能
  React.useEffect(() => {
    let disposed = false
    // 轮询监听：列表变化（新技能创建成功）自动刷新
    const iv = setInterval(() => {
      if (disposed) return
      const pending = window.__veryskillPendingCreate
      if (pending && Date.now() - pending.t > 2000) {
        window.__veryskillPendingCreate = undefined
        load()
      }
    }, 2500)
    return () => { disposed = true; clearInterval(iv) }
  }, [load])

  // 分类列表（去重 + "全部"）
  const categories = React.useMemo(() => {
    const cats = new Set(skills.map(s => (s.category || '').trim()).filter(Boolean))
    return ['全部', ...Array.from(cats).sort()]
  }, [skills])

  // 按当前分类过滤
  const filteredSkills = React.useMemo(() => {
    if (activeCat === '全部') return skills
    return skills.filter(s => (s.category || '').trim() === activeCat)
  }, [skills, activeCat])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>超级技能</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
            管理用户创建的技能 — 启用/禁用、设置、查看内容、删除
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          title="打开创建弹窗（也可在输入框输入「新建一个技能：xxx」快捷创建）"
          style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background .12s, border-color .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-label-dimmed)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-l2)' }}
        >＋ 新建超级技能</button>
      </div>

      {/* 分类标签（顶部横排，主题变量） */}
      {categories.length > 1 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {categories.map(cat => (
            <button key={cat} type="button" onClick={() => setActiveCat(cat)}
              style={{
                whiteSpace: 'nowrap', borderRadius: 999, padding: '4px 12px',
                fontSize: 12, lineHeight: 1.5, border: '1px solid', cursor: 'pointer',
                transition: 'background .12s, color .12s, borderColor .12s',
                background: activeCat === cat
                  ? 'var(--dsw-alias-brand-primary, #7c6cf0)'
                  : 'transparent',
                borderColor: activeCat === cat
                  ? 'var(--dsw-alias-brand-primary, #7c6cf0)'
                  : 'var(--dsw-alias-border-l2)',
                color: activeCat === cat
                  ? 'var(--dsw-alias-label-primary-inverted, #fff)'
                  : 'var(--dsw-alias-label-secondary)',
              }}
              onMouseEnter={(e) => { if (activeCat !== cat) { e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 12%, transparent)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-label-dimmed)' } }}
              onMouseLeave={(e) => { if (activeCat !== cat) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-l2)' } }}
            >{cat}</button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</div>
      ) : skills.length === 0 ? (
        <div style={{
          fontSize: 13, color: 'var(--dsw-alias-label-tertiary)',
          padding: 16, borderRadius: 12, textAlign: 'center',
          border: '1px dashed var(--dsw-alias-border-l2)',
        }}>
          暂无用户创建的技能。点击「新建超级技能」创建你的第一个技能。
        </div>
      ) : (
        <>
          {activeCat !== '全部' ? (
            <div style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>
              {activeCat} · 共 {filteredSkills.length} 个技能
            </div>
          ) : null}
          <ul style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gridAutoRows: '1fr', gap: 12, margin: 0, padding: 0, listStyle: 'none',
          }}>
            {filteredSkills.map(s => (
              <SkillCard key={s.name} skill={s} onChanged={load} onEdit={setEditName} />
            ))}
          </ul>
        </>
      )}

      {/* 底部状态栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-3, var(--dsw-alias-border-l1))',
        border: '1px solid var(--dsw-alias-border-l1)',
        fontSize: 12, color: 'var(--dsw-alias-label-tertiary)',
        marginTop: 8,
      }}>
        <span>用户创建技能：<strong style={{ color: 'var(--dsw-alias-label-primary)' }}>{stats.managed}</strong></span>
        <span style={{ opacity: .5 }}>·</span>
        <span>未纳入管理：<strong style={{ color: stats.unmanaged > 0 ? 'var(--dsw-alias-state-warning-primary, #f59e0b)' : 'var(--dsw-alias-label-primary)' }}>{stats.unmanaged}</strong></span>
        <span style={{ opacity: .5 }}>·</span>
        <span>技能目录总计：<strong style={{ color: 'var(--dsw-alias-label-primary)' }}>{stats.total}</strong></span>
      </div>

      {editName ? <EditModal name={editName} onClose={() => setEditName('')} onSaved={load} /> : null}
      {showCreate ? <CreateSkillModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} /> : null}
    </div>
  )
}

// ── VerySkill 设置卡片（只有开关） ────────────────────
function SkillManagerCard({ onEnabledChange }: { onEnabledChange?: (enabled: boolean) => void }) {
  const [open, setOpen] = React.useState(false)
  const [enabled, setEnabled] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [version, setVersion] = React.useState('')
  const [hasUpdate, setHasUpdate] = React.useState(false)
  const [feedback, setFeedback] = React.useState<string | null>(null)
  const [envItems, setEnvItems] = React.useState<EnvCheckItem[]>([])
  const [envChecking, setEnvChecking] = React.useState(false)
  const [envOpen, setEnvOpen] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    api('/list').then((d) => {
      if (!alive || !d?.ok) return
      setEnabled(!!d.enabled); setVersion(d.version || ''); setLoading(false)
    })
    api('/update').then((d) => { if (!alive || !d?.ok) return; setHasUpdate(!!d.hasUpdate) })
    return () => { alive = false }
  }, [])

  const toggleEnabled = () => {
    const next = !enabled
    setEnabled(next)
    api('/save', { enabled: next }).then((d) => {
      if (d && !d.ok) setEnabled(!next)
      else onEnabledChange?.(next)
    })
  }

  const handleEnvCheck = () => {
    setEnvChecking(true)
    api('/env-check').then((d) => {
      if (d?.ok) { setEnvItems(d.items || []); setEnvOpen(true) }
      else setFeedback(`检测失败：${d?.error ?? '未知错误'}`)
      setEnvChecking(false)
    })
  }

  const pillBase: React.CSSProperties = {
    fontSize: 12, lineHeight: '18px', fontWeight: 500,
    background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 999, padding: '2px 10px',
    whiteSpace: 'nowrap', cursor: 'pointer',
    transition: 'color .12s ease, border-color .12s ease, background .12s ease',
  }

  return (
    <li className={`dsh-mm-card ${open ? 'dsh-mm-card-open' : ''}`} style={{ minWidth: 0 }}>
      <button
        type="button"
        className="dsh-mm-head"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="dsh-mm-head-text">
          <span className="dsh-mm-name-row">
            <span className="dsh-mm-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', color: 'var(--dsw-alias-brand-primary, #7c6cf0)', flexShrink: 0 }}><SkillIcon /></span>
              VerySkill
            </span>
            {version ? <span className="dsh-mm-version-badge">{version}</span> : null}
          </span>
          <span className="dsh-mm-desc" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
            在此可开启和关闭超级技能插件
          </span>
        </span>

        <span className="dsh-mm-btns">
          <a className="dsh-mm-btn-link" href={GITHUB_REPO} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="打开 GitHub 仓库"
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--dsw-alias-brand-primary)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-brand-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-l2)' }}
          >ideasir</a>
          <button type="button" className="dsh-mm-btn-uninstall" onClick={(e) => { e.stopPropagation(); injectIntoInput('卸载当前插件') }} title="卸载插件（点击后会在输入框生成卸载提示词）"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)' }}
          >卸载</button>
          <button type="button" className="dsh-mm-btn-update"
            onClick={(e) => {
              e.stopPropagation()
              if (hasUpdate) {
                injectIntoInput('更新当前插件为最新版本')
              } else api('/update').then((d) => { if (d?.ok) setHasUpdate(!!d.hasUpdate) })
            }}
            title={hasUpdate ? '发现新版本，点击后会在输入框生成更新提示词' : '当前已是最新版本（点击重新检查）'}
            style={{ color: hasUpdate ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-tertiary)', border: `1px solid ${hasUpdate ? 'color-mix(in srgb, var(--dsw-alias-state-success-primary) 45%, transparent)' : 'var(--dsw-alias-border-l2)'}` }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)' }}
          >{hasUpdate ? '有更新' : '已最新'}</button>
          <button type="button" className="dsh-mm-btn-update" onClick={(e) => { e.stopPropagation(); handleEnvCheck() }} disabled={envChecking} title="检测技能环境"
            style={{ color: 'var(--dsw-alias-label-secondary)', cursor: envChecking ? 'default' : 'pointer', opacity: envChecking ? .6 : 1 }}
            onMouseEnter={(e) => { if (envChecking) return; e.currentTarget.style.color = 'var(--dsw-alias-brand-primary)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-brand-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-l2)' }}
          >{envChecking ? '检测中…' : '智能检测'}</button>
          <span className={`dsh-mm-chevron ${open ? 'dsh-mm-chevron-open' : ''}`} style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
            <svg width={14} height={14} viewBox="0 0 14 14" fill="none"><path d="M3.5 5.25L7 8.75L10.5 5.25" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
        </span>
      </button>

      {open ? (
        <div className="dsh-mm-body">
          {feedback !== null ? (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: feedback.startsWith('已卸载') ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }}>
              {feedback}
            </p>
          ) : null}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
            <span style={{ fontSize: 14, color: 'var(--dsw-alias-label-primary)' }}>启用超级技能</span>
            {loading ? (
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</span>
            ) : (
              <button type="button" onClick={toggleEnabled}
                style={{ width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', position: 'relative', background: enabled ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-border-l3)', transition: 'background .18s cubic-bezier(0.4, 0, 0.2, 1)' }}
                aria-label="启用超级技能"
              >
                <span style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: 999, background: 'var(--dsw-alias-label-primary-inverted)', left: enabled ? 23 : 3, transition: 'left .2s cubic-bezier(0.34, 1.56, 0.64, 1)' }} />
              </button>
            )}
          </div>
          {envOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-tertiary)', letterSpacing: '.06em', textTransform: 'uppercase' }}>技能统计</span>
              {envItems.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: 'var(--dsw-alias-brand-primary, #7c6cf0)' }} />
                  <span style={{ fontSize: 13, whiteSpace: 'nowrap', color: 'var(--dsw-alias-label-primary)' }}>{item.label}</span>
                  {!item.ok && item.errorReason ? (
                    <span style={{ fontSize: 12, color: 'var(--dsw-alias-state-error-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.errorReason}</span>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

// ── 注册 ──────────────────────────────────────────────
let sectionDisposer: (() => void) | null = null
let launcherDisposer: (() => void) | null = null
let interceptDisposer: (() => void) | null = null

// 全局：让 TS 认识 window 上的自定义字段
declare global {
  interface Window {
    __veryskillPendingCreate?: { t: number }
  }
}

/** 解析「新建一个技能：xxx」消息 → { name, description, content } */
function parseCreatePrompt(text: string): { name: string; description: string; content: string } | null {
  const m = text.match(/^新建一个技能[：:]\s*(.+)$/s)
  if (!m) return null
  const rest = m[1].trim()
  if (!rest) return { name: 'unnamed-skill', description: '', content: '' }
  // 第一行 = 技能名；后续行 = 内容
  const lines = rest.split('\n')
  const name = lines[0].trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '-').toLowerCase().slice(0, 40) || 'unnamed-skill'
  const content = lines.slice(1).join('\n').trim()
  // 描述取第一句（≤60字）
  const desc = (lines[0].trim().length > 60 ? lines[0].trim().slice(0, 60) : lines[0].trim()) || ''
  return { name, description: desc, content }
}

// ── 输入框工具行图标：超级技能分类菜单（hover 分类展开技能）+ 全局快捷键 ──
function SkillQuickLauncher(_props: any) {
  const [open, setOpen] = React.useState(false)
  const [skills, setSkills] = React.useState<Skill[]>([])
  const [activeCat, setActiveCat] = React.useState('')
  const [menuPos, setMenuPos] = React.useState<{ x: number; y: number } | null>(null)
  const [subPos, setSubPos] = React.useState<{ x: number; y: number } | null>(null)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let alive = true
    const load = () => loadSkills().then((s) => { if (alive) setSkills(s) })
    load()
    const iv = setInterval(load, 8000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  // 点击外部关闭菜单（root 按钮 或 弹出菜单 内部都不算外部）
  React.useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      const t = e.target as Node
      if (rootRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false); setActiveCat(''); setSubPos(null)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  // 全局快捷键：按某个技能设定的快捷键 → 把技能名+空格装进输入框
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return
      const combo = shortcutFromEvent(e)
      if (!combo) return
      const target = skills.find(s => s.shortcut && normalizeShortcut(s.shortcut) === combo && s.enabled)
      if (!target) return
      e.preventDefault(); e.stopPropagation()
      injectIntoInput(target.name + ' ')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [skills])

  // 按分类分组（未分类归入「其他」）
  const groups = React.useMemo(() => {
    const map = new Map<string, Skill[]>()
    for (const s of skills) {
      if (!s.enabled) continue
      const cat = (s.category || '').trim() || '未分类'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(s)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [skills])

  const pickSkill = (s: Skill) => {
    injectIntoInput(s.name + ' ')
    setOpen(false); setActiveCat(''); setSubPos(null)
  }

  // 打开菜单：按钮位置用 getBoundingClientRect 锚定，菜单 fixed 渲染到 body
  const toggle = () => {
    if (open) { setOpen(false); return }
    const r = rootRef.current?.getBoundingClientRect()
    if (!r) return
    // 记录按钮顶部位置：菜单从按钮向上弹出（输入框在页面底部，向下会被挡住）
    setMenuPos({ x: r.left, y: r.top })
    setOpen(true); setActiveCat(''); setSubPos(null)
  }

  // hover 分类：定位二级菜单到分类行右侧
  const hoverCat = (cat: string, e: React.MouseEvent<HTMLDivElement>) => {
    setActiveCat(cat)
    const rr = e.currentTarget.getBoundingClientRect()
    setSubPos({ x: rr.right - 2, y: rr.top - 4 })
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', width: '100%',
    background: 'transparent', border: 'none', color: 'var(--dsw-alias-label-primary)', fontSize: 13,
    cursor: 'pointer', whiteSpace: 'nowrap', textAlign: 'left',
  }

  const activeGroup = activeCat ? groups.find(([cat]) => cat === activeCat) : undefined

  // 一级菜单内容
  const menuEl = (
    <div ref={menuRef} style={{
      position: 'fixed', left: menuPos?.x ?? 0, bottom: window.innerHeight - (menuPos?.y ?? 0) + 6,
      zIndex: 2147483001, width: 150,
      background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: 4,
    }}>
      {groups.length === 0 ? (
        <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>暂无已启用的技能</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {groups.map(([cat, list]) => (
            <div key={cat}
              onMouseEnter={(e) => hoverCat(cat, e)}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                padding: '5px 8px', borderRadius: 6, fontSize: 12, cursor: 'default',
                color: 'var(--dsw-alias-label-secondary)',
                background: activeCat === cat ? 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 12%, transparent)' : 'transparent',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat}</span>
                <span style={{ fontSize: 10, color: 'var(--dsw-alias-label-tertiary)' }}>{list.length} ›</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // 二级菜单内容（hover 分类时出现）
  const subEl = (activeCat && activeGroup && subPos) ? (
    <div style={{
      position: 'fixed', left: subPos.x, top: subPos.y, zIndex: 2147483002, width: 150,
      background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l2)',
      borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.35)', padding: 4,
    }}>
      {activeGroup[1].map(s => (
        <button key={s.name} type="button" onClick={() => pickSkill(s)} style={rowStyle}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 12%, transparent)'; e.currentTarget.style.color = 'var(--dsw-alias-brand-primary, #b6aaff)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--dsw-alias-label-primary)' }}>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
          {s.shortcut ? (
            <kbd style={{
              fontSize: 10, padding: '1px 5px', borderRadius: 4,
              border: '1px solid var(--dsw-alias-border-l1)', color: 'var(--dsw-alias-label-tertiary)',
              fontFamily: 'var(--dsw-font-mono, Menlo, monospace)',
            }}>{s.shortcut}</kbd>
          ) : null}
        </button>
      ))}
    </div>
  ) : null

  return (
    <div ref={rootRef} style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button type="button" onClick={toggle} title="超级技能（按分类选择，可设快捷键）"
        aria-expanded={open}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, borderRadius: 8, border: '1px solid var(--dsw-alias-border-l2)',
          background: open ? 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 18%, transparent)' : 'transparent',
          color: open ? 'var(--dsw-alias-brand-primary, #b6aaff)' : 'var(--dsw-alias-label-secondary)',
          cursor: 'pointer', transition: 'background .12s, color .12s, border-color .12s',
          padding: 0,
        }}
        onMouseEnter={(e) => { if (!open) { e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 12%, transparent)'; e.currentTarget.style.color = 'var(--dsw-alias-brand-primary, #b6aaff)' } }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)' } }}
      >
        <SkillIcon size={14} />
      </button>

      {open && menuPos ? <React.Fragment>{menuEl}{subEl}</React.Fragment> : null}
    </div>
  )
}

// 从键盘事件提取标准化快捷键字符串（如 Ctrl+Shift+1）
function shortcutFromEvent(e: KeyboardEvent): string {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return ''
  const parts: string[] = []
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey) parts.push('Meta')
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key
  parts.push(key)
  return parts.join('+')
}
function normalizeShortcut(s: string): string {
  return s.trim().replace(/\s+/g, '').replace(/\+/g, '+')
}

export function apply(ctx: any) {
  const slots = ctx.slots as any
  const register = slots.register.bind(slots) as (opts: object, comp: unknown) => () => void

  // ── 注入统一卡片 CSS（与 makemake/passpass/veryIM 共用 dsh-mm-* 类） ──
  if (!document.getElementById('dsh-mm-css-veryskill')) {
    const s = document.createElement('style'); s.id = 'dsh-mm-css-veryskill'
    s.textContent = `
.dsh-mm-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;overflow:hidden}
.dsh-mm-card:hover{border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-mm-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-mm-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-radius:12px}
.dsh-mm-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c78ff);outline-offset:-2px}
.dsh-mm-head-text{display:flex;flex-direction:column;gap:2px;min-width:0}
.dsh-mm-name-row{display:flex;align-items:center;gap:6px}
.dsh-mm-title{font-size:14px;line-height:20px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-mm-version-badge{font-size:11px;line-height:16px;font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:0 8px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.dsh-mm-desc{font-size:12px;line-height:17px;color:var(--dsw-alias-label-tertiary)}
.dsh-mm-btns{display:flex;align-items:center;gap:6px;flex-shrink:0}
.dsh-mm-btn-link{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-label-secondary);text-decoration:none;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;white-space:nowrap;transition:color .12s,border-color .12s,background .12s}
.dsh-mm-btn-uninstall{font-size:12px;line-height:18px;font-weight:500;color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-1);border:1px solid color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,transparent);border-radius:999px;padding:2px 10px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s}
.dsh-mm-btn-update{font-size:12px;line-height:18px;font-weight:500;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;padding:2px 10px;cursor:pointer;white-space:nowrap;transition:background .12s,border-color .12s}
.dsh-mm-btn-env{font-size:12px;line-height:18px}
.dsh-mm-chevron{color:var(--dsw-alias-label-tertiary);transition:transform .14s ease-in-out}
.dsh-mm-body{padding:12px 14px;border-top:1px solid var(--dsw-alias-border-l2)}
@keyframes dsh-sk-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.dsh-sk-spin{display:inline-block;animation:dsh-sk-spin .8s linear infinite}
`
    document.head.appendChild(s)
  }

  // ── 全局拦截「新建一个技能：」→ 纯插件创建 + 对话反馈 ──
  // 方案 A'：Enter 拦截（阻止原生发送）→ 插件创建规范化 → api.prompt 发反馈消息
  const setupGlobalIntercept = () => {
    const taSel = () => document.querySelector<HTMLTextAreaElement>('textarea[data-phase]')
    // 1) Enter 拦截
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return
      const ta = taSel()
      if (!ta || document.activeElement !== ta) return
      const text = ta.value
      const parsed = parseCreatePrompt(text)
      if (!parsed) return
      // 阻止原生发送！
      e.preventDefault()
      e.stopPropagation()
      handleCreateSkill(parsed, ta)
    }
    document.addEventListener('keydown', onKeyDown, true)   // capture 阶段拦截

    // 2) 创建 + 反馈
    const handleCreateSkill = (parsed: { name: string; description: string; content: string }, ta: HTMLTextAreaElement) => {
      window.__veryskillPendingCreate = { t: Date.now() }
      const orig = ta.value
      // 输入框临时显示处理中
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      const setVal = (v: string) => {
        if (nativeInputValueSetter) {
          nativeInputValueSetter.call(ta, v)
          ta.dispatchEvent(new Event('input', { bubbles: true }))
        } else ta.value = v
      }
      setVal('⏳ 正在创建技能…')

      void api('/create', { name: parsed.name, description: parsed.description, content: parsed.content }).then(async (d) => {
        if (!d?.ok) {
          setVal(orig)
          alert(`技能创建失败：${d?.error ?? '未知错误'}`)
          return
        }
        // 自动扫描 + 保存设置项
        let fieldCount = 0
        try {
          const s = await api('/setup-scan', { name: parsed.name })
          if (s?.ok && s.candidates?.length) {
            fieldCount = s.candidates.length
            await api('/setup-save', {
              name: parsed.name, enabled: true,
              fields: s.candidates.map((c: any) => ({ key: c.key, label: c.label, value: '', isSecret: c.isSecret, reason: c.reason })),
            })
          }
        } catch { /* ignore */ }
        // 清空输入框 + 往对话发反馈消息（服务端调 session.prompt）
        setVal('')
        const feedbackText = `✅ 技能「${parsed.name}」已创建并规范化。${fieldCount > 0 ? `已自动识别 ${fieldCount} 个可复用设置项（可在 设置 → 超级技能 → 该技能 → 设置 中填写）。` : '未检测到明显设置项，可直接使用。'}后续可在 设置 → 超级技能 中继续收尾：编辑内容、启用/禁用、关联配套插件。若技能需要配套插件，请把插件做成永久插件（安装进 profile），不要用动态插件（重启即失效）。可用 list_skills 查看。`
        void api('/feedback', { text: feedbackText })
      })
    }

    // 返回清理函数（插件卸载时移除监听）
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }

  // ── 统一启停：开关控制 技能菜单 + 输入框图标 + Enter 创建拦截 ──
  // 关闭时这三个 UI 元素全部消失，开启时全部出现（不只管服务端工具）
  const applyEnabledState = (enabled: boolean) => {
    // 1) 技能管理菜单（settings.section）
    if (enabled && !sectionDisposer) {
      sectionDisposer = ctx.slots.inject('settings.section', () => register({
        name: 'settings.section',
        id: 'veryskill-section',
        order: 30,
        label: () => '超级技能',
      }, function SkillManagerSectionEntry() {
        return React.createElement(SkillManagerSection, { ctx })
      }))
    } else if (!enabled && sectionDisposer) {
      try { sectionDisposer() } catch { /* ignore */ }
      sectionDisposer = null
    }
    // 2) 输入框左侧图标（SkillQuickLauncher：分类菜单 + 快捷键）
    if (enabled && !launcherDisposer) {
      launcherDisposer = ctx.slots.inject('conversation.input.left' as any, () => register({
        name: 'conversation.input.left',
        id: 'dsh-veryskill-launcher',
        order: 80,
        label: () => '超级技能',
      } as any, (props: any) => React.createElement(SkillQuickLauncher, { ...props })))
    } else if (!enabled && launcherDisposer) {
      try { launcherDisposer() } catch { /* ignore */ }
      launcherDisposer = null
    }
    // 3) 全局 Enter 拦截（「新建一个技能：」→ 插件创建）
    if (enabled && !interceptDisposer) {
      try { interceptDisposer = setupGlobalIntercept() } catch { interceptDisposer = null }
    } else if (!enabled && interceptDisposer) {
      try { interceptDisposer() } catch { /* ignore */ }
      interceptDisposer = null
    }
  }

  // 启动时按当前开关状态决定三个 UI 元素
  api('/list').then((d) => { applyEnabledState(!!(d && d.ok && d.enabled)) })

  ctx.slots.inject('settings.plugin.item', () => register({
    name: 'settings.plugin.item',
    key: 'veryskill',
    priority: 200,
  }, function SkillManagerPluginCard(props: any) {
    return React.createElement(SkillManagerCard, { ...props, onEnabledChange: applyEnabledState })
  }))
}

export const inject = ['slots']