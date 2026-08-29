/**
 * dsh-skillskill — 技能管理插件（客户端）
 *
 * 1. settings.plugin.item —— SkillSkill 卡片（图标/版本/4标签 + 启动开关；无技能列表）
 * 2. settings.section —— 「技能管理」菜单（Agent 预设下方，动态注册/移除）
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
}

interface EnvCheckItem { id: string; label: string; ok: boolean; errorReason: string }

const GITHUB_REPO = 'https://github.com/ideasir/dsh-skillskill'

function api(path: string, body?: any): Promise<any> {
  return fetch('/plugins/dsh-skillskill' + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json()).catch(() => null)
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

// ── 弹窗容器（body portal + ESC 关闭） ────────────────
function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  React.useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
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
          background: 'rgb(43, 44, 46)', border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14, boxShadow: '0 18px 50px rgba(0,0,0,0.5)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          position: 'sticky', top: 0, background: 'rgb(43, 44, 46)',
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'rgb(249, 250, 251)' }}>{title}</span>
          <button
            type="button" onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: 'rgb(173,178,184)', cursor: 'pointer', display: 'inline-flex', padding: 4 }}
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
      <p style={{ margin: '0 0 10px', fontSize: 13, color: 'rgb(220, 225, 230)', lineHeight: 1.6 }}>
        将<strong>完整删除</strong>该技能：移除加载配置与文件（symlink 仅删链接，保留源目录）。此操作不可恢复。
      </p>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgb(173,178,184)' }}>
        如确认删除，请在下方输入 <code style={{ color: 'var(--dsw-alias-state-error-primary)', fontFamily: 'var(--dsw-font-mono, Menlo, monospace)' }}>yes</code>
      </p>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="输入 yes 确认"
        autoFocus
        style={{
          width: '100%', boxSizing: 'border-box',
          background: 'rgb(53,54,56)', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 10, padding: '9px 12px', fontSize: 13,
          color: 'rgb(249,250,251)', outline: 'none', marginBottom: 14,
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancel} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13,
          border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
          color: 'rgb(249,250,251)', cursor: 'pointer',
        }}>取消</button>
        <button type="button" disabled={!ok} onClick={onConfirm} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
          background: ok ? 'var(--dsw-alias-state-error-primary, #ef4444)' : 'rgba(239,68,68,0.35)',
          color: '#fff', cursor: ok ? 'pointer' : 'default',
        }}>确认删除</button>
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
  const valueText: React.CSSProperties = { fontSize: 13, color: 'rgb(210, 215, 220)', lineHeight: 1.6 }

  return (
    <Modal title={`技能详情 — ${skill.name}`} onClose={onClose} width={680}>
      {err ? <p style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p> : (
        <>
          {/* 概要信息 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18, fontWeight: 600, color: 'rgb(249,250,251)' }}>{skill.name}</span>
              <span style={{ whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 999, padding: '1px 10px', fontSize: 12, fontWeight: 500, color: 'rgb(173,178,184)' }}>
                {skill.kind === 'directory' ? '目录技能' : '单个技能'}
              </span>
              <span style={{
                whiteSpace: 'nowrap', borderRadius: 999, padding: '1px 10px', fontSize: 12, fontWeight: 500,
                background: skill.enabled ? 'rgb(249,250,251)' : 'transparent',
                color: skill.enabled ? 'rgb(53,54,56)' : 'rgb(173,178,184)',
                border: skill.enabled ? 'none' : '1px solid rgba(255,255,255,0.14)',
              }}>
                {skill.enabled ? '已启用' : '已禁用'}
              </span>
              {settings?.enabled ? (
                <span style={{ whiteSpace: 'nowrap', borderRadius: 999, padding: '1px 10px', fontSize: 12, fontWeight: 500, background: 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 18%, transparent)', color: 'var(--dsw-alias-brand-primary, #a78bfa)' }}>
                  已开启设置
                </span>
              ) : null}
            </div>

            <div style={{ fontSize: 13, color: 'rgb(173,178,184)', lineHeight: 1.6 }}>
              {skill.description || '（无描述）'}
            </div>

            <div style={{ fontFamily: 'var(--dsw-font-mono, Menlo, monospace)', fontSize: 12, color: 'rgb(130,136,142)' }}>
              {skill.source}
            </div>
          </div>

          {/* 设置项 */}
          {settings?.enabled && settings.fields?.length > 0 ? (
            <>
              <div style={rowLabel}>设置项</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {settings.fields.map((f: any) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'rgb(53,54,56)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'rgb(249,250,251)', minWidth: 110 }}>
                      {f.label} {f.isSecret ? <span dangerouslySetInnerHTML={{ __html: LOCK_SVG }} /> : ''}
                    </span>
                    <span style={{ fontSize: 13, color: f.isSecret ? 'rgb(173,178,184)' : 'rgb(210,215,220)', fontFamily: 'var(--dsw-font-mono, Menlo, monospace)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            background: 'rgb(30,31,33)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.55,
            fontFamily: 'var(--dsw-font-mono, ui-monospace, Menlo, monospace)',
            color: 'rgb(210, 215, 220)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: '36vh', overflow: 'auto', margin: 0,
          }}>
            {detail?.content || '（技能内容为空）'}
          </pre>

          {/* 操作 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button type="button" onClick={() => onEdit(skill.name)} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: 'rgb(173,178,184)', cursor: 'pointer',
            }}><Ic.edit size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />编辑内容</button>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: 'rgb(249,250,251)', cursor: 'pointer',
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
    api('/setup-save', { name, enabled: settings.enabled, fields: settings.fields.map((f: any) => ({ key: f.key, label: f.label, value: f.value, isSecret: f.isSecret, reason: f.reason })) }).then((d) => {
      if (d?.ok) { onSaved(); onClose() }
      else setErr(d?.error ?? '保存失败')
    })
  }

  return (
    <Modal title={`技能设置 — ${name}`} onClose={onClose} width={560}>
      {loading ? <p style={{ color: 'rgb(173,178,184)', fontSize: 13 }}>加载中…</p>
      : err ? <p style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p> : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgb(173,178,184)' }}>
            {settings.enabled
              ? '已开启技能设置，以下参数在技能执行时会以你填写的值生效。'
              : '技能设置未开启 —— 在「设置引导」中开启后，这里才能配置可复用参数。'}
          </p>
          {settings.enabled && settings.fields.length === 0 ? (
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
              此技能暂无设置项。可在创建时或「设置引导」中添加可复用参数。
            </p>
          ) : null}
          {settings.enabled ? settings.fields.map((f: any, idx: number) => (
            <div key={f.key} style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgb(173,178,184)', marginBottom: 4 }}>
                {f.label} {f.isSecret ? '（敏感）' : ''}
              </label>
              <input
                value={f.value}
                onChange={(e) => changeField(idx, e.target.value)}
                type={f.isSecret ? 'password' : 'text'}
                placeholder={f.isSecret ? '••••••••' : '填写值'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgb(53,54,56)', border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 10, padding: '8px 12px', fontSize: 13,
                  color: 'rgb(249,250,251)', outline: 'none',
                }}
              />
              {f.reason ? <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }}>{f.reason}</p> : null}
            </div>
          )) : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: 'rgb(249,250,251)', cursor: 'pointer',
            }}>取消</button>
            {settings.enabled ? (
              <button type="button" onClick={save} style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
                background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: '#fff', cursor: 'pointer',
              }}>保存</button>
            ) : null}
          </div>
        </>
      )}
    </Modal>
  )
}

// ── 创建技能弹窗（多步：信息 → 问是否开设置 → 候选列表+理由 → 勾选） ──
function CreateSkillModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [step, setStep] = React.useState(1)          // 1 填信息 2 问设置 3 选设置项
  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [content, setContent] = React.useState('')
  const [enableSettings, setEnableSettings] = React.useState(false)
  const [candidates, setCandidates] = React.useState<Array<{ key: string; label: string; reason: string; isSecret?: boolean }>>([])
  const [checked, setChecked] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState('')
  const [createdName, setCreatedName] = React.useState('')

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
      // 不开启设置，直接收尾
      api('/setup-save', { name: createdName, enabled: false, fields: [] }).then(() => onCreated())
    }
  }

  // 步骤1：创建技能
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
      if (d?.ok) onCreated()
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
    background: 'rgb(53,54,56)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 10, padding: '8px 12px', fontSize: 13,
    color: 'rgb(249,250,251)', outline: 'none',
  }

  return (
    <Modal title={step === 1 ? '新建技能' : step === 2 ? '开启技能设置？' : '选择可复用的设置项'} onClose={onClose} width={600}>
      {err ? <p style={{ margin: '0 0 10px', color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p> : null}

      {step === 1 ? (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgb(173,178,184)', marginBottom: 4 }}>技能名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：视频生成、网站登录" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgb(173,178,184)', marginBottom: 4 }}>技能描述</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="这个技能是做什么的" style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'rgb(173,178,184)', marginBottom: 4 }}>技能内容（SKILL.md 正文）</label>
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
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: 'rgb(249,250,251)', cursor: 'pointer',
            }}>取消</button>
            <button type="button" onClick={create} disabled={busy} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: '#fff',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            }}>{busy ? '创建中…' : '创建技能'}</button>
          </div>
        </>
      ) : step === 2 ? (
        <>
          <p style={{ margin: '0 0 14px', fontSize: 14, color: 'rgb(249,250,251)', lineHeight: 1.6 }}>
            技能「{createdName}」创建完成！
            <br />
            <span style={{ color: 'rgb(173,178,184)', fontSize: 13 }}>
              是否开启<strong>技能设置</strong>？开启后会自动扫描技能内容，识别出可复用的参数（如 API 地址、密钥、模型名、时间参数），你可以在设置里填写。
            </span>
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={() => proceedSetup(false)} disabled={busy} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: 'rgb(173,178,184)', cursor: busy ? 'default' : 'pointer',
            }}>不开，保持纯内容</button>
            <button type="button" onClick={() => proceedSetup(true)} disabled={busy} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: '#fff',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            }}>{busy ? '扫描中…' : '开启技能设置'}</button>
          </div>
        </>
      ) : (
        <>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgb(173,178,184)' }}>
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
                  background: 'rgb(53,54,56)', border: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <input
                    type="checkbox"
                    checked={checked.has(c.key)}
                    onChange={() => toggleCheck(c.key)}
                    style={{ marginTop: 2, accentColor: 'var(--dsw-alias-brand-primary, #7c6cf0)' }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'rgb(249,250,251)' }}>
                      {c.label} {c.isSecret ? <span dangerouslySetInnerHTML={{ __html: LOCK_SVG }} /> : ''}
                    </span>
                    <span style={{ fontSize: 12, color: 'rgb(173,178,184)', lineHeight: 1.5 }}>{c.reason}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={() => proceedSetup(false)} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13,
              border: '1px solid rgba(255,255,255,0.15)', background: 'transparent',
              color: 'rgb(173,178,184)', cursor: 'pointer',
            }}>跳过设置</button>
            <button type="button" onClick={saveSetup} disabled={busy} style={{
              padding: '7px 14px', borderRadius: 8, fontSize: 13, border: 'none',
              background: 'var(--dsw-alias-brand-primary, #7c6cf0)', color: '#fff',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? .6 : 1,
            }}>{busy ? '保存中…' : '完成'}</button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ── 编辑弹窗（技能内容） ──────────────────────────────
function EditModal({ name, onClose }: { name: string; onClose: () => void }) {
  const [data, setData] = React.useState<any>(null)
  const [tab, setTab] = React.useState<'readme' | 'pkg' | 'entry'>('readme')
  const [err, setErr] = React.useState('')

  React.useEffect(() => {
    api(`/content?name=${encodeURIComponent(name)}`).then((d) => {
      if (d?.ok) setData(d)
      else setErr(d?.error ?? '读取失败')
    })
  }, [name])

  const codeStyle: React.CSSProperties = {
    background: 'rgb(30,31,33)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10, padding: 12, fontSize: 12, lineHeight: 1.55,
    fontFamily: 'var(--dsw-font-mono, ui-monospace, Menlo, monospace)',
    color: 'rgb(210, 215, 220)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    maxHeight: '48vh', overflow: 'auto', margin: 0,
  }

  return (
    <Modal title={`技能内容 — ${name}`} onClose={onClose} width={720}>
      {err ? <p style={{ color: 'var(--dsw-alias-state-error-primary)', fontSize: 13 }}>{err}</p>
      : !data ? <p style={{ color: 'rgb(173,178,184)', fontSize: 13 }}>加载中…</p> : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            {([['readme', '说明文档'], ['pkg', 'package.json'], ['entry', '入口代码']] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setTab(k)} style={{
                padding: '4px 12px', borderRadius: 999, fontSize: 12,
                border: `1px solid ${tab === k ? 'var(--dsw-alias-brand-primary, #7c6cf0)' : 'rgba(255,255,255,0.15)'}`,
                background: tab === k ? 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 15%, transparent)' : 'transparent',
                color: tab === k ? 'var(--dsw-alias-brand-primary, #a78bfa)' : 'rgb(173,178,184)',
                cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
          {tab === 'readme' && (data.readme
            ? <pre style={codeStyle}>{data.readme}</pre>
            : <p style={{ color: 'rgb(173,178,184)', fontSize: 13 }}>该技能没有 README/SKILL.md 说明文档</p>)}
          {tab === 'pkg' && <pre style={codeStyle}>{JSON.stringify(data.pkg, null, 2)}</pre>}
          {tab === 'entry' && (data.entry
            ? <pre style={codeStyle}>{data.entry}</pre>
            : <p style={{ color: 'rgb(173,178,184)', fontSize: 13 }}>未找到入口文件（{data.entryPath || 'lib/index.js'}）</p>)}
          {data.files ? (
            <p style={{ margin: '10px 0 0', fontSize: 12, color: 'rgb(140,146,152)' }}>
              文件：{data.files.join('、')}
            </p>
          ) : null}
        </>
      )}
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
  const [showDetail, setShowDetail] = React.useState(false)

  const toggle = () => {
    setBusy('toggle')
    api('/toggle', { name: skill.name, enabled: !skill.enabled }).then((r) => {
      setBusy('')
      if (r?.ok) onChanged()
      else alert(r?.error ?? '操作失败')
    })
  }
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
    setBusy('toggle')
    api('/toggle', { name: skill.name, enabled: !skill.enabled }).then((r) => {
      setBusy('')
      if (r?.ok) onChanged()
      else alert(r?.error ?? '操作失败')
    })
  }

  const footBtn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '5px 10px', borderRadius: 8, fontSize: 12,
    border: '1px solid rgba(255,255,255,0.12)', background: 'transparent',
    color: 'rgb(200, 205, 210)', cursor: 'pointer',
    transition: 'background .12s, color .12s, border-color .12s',
  }

  return (
    <li
      style={{
        border: `1px solid ${hovered ? 'color-mix(in srgb, var(--dsw-alias-brand-primary, #7c6cf0) 60%, transparent)' : 'rgba(255,255,255,0.12)'}`,
        boxShadow: hovered ? '0 0 0 1px rgba(124,108,240,0.25), 0 4px 16px rgba(124,108,240,0.12)' : 'none',
        background: hovered ? 'rgba(124,108,240,0.05)' : 'rgb(53, 54, 56)',
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
          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.4, color: 'rgb(249, 250, 251)' }}>
            {skill.name}
          </span>
          <span style={{
            whiteSpace: 'nowrap', border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 999, padding: '1px 8px', fontSize: 11, fontWeight: 500,
            color: 'rgb(173,178,184)',
          }}>
            {skill.kind === 'directory' ? '目录技能' : '单个技能'}
          </span>
          <span style={{
            marginLeft: 'auto', whiteSpace: 'nowrap', borderRadius: 999,
            padding: '1px 8px', fontSize: 11, fontWeight: 500,
            background: skill.enabled ? 'rgb(249, 250, 251)' : 'transparent',
            color: skill.enabled ? 'rgb(53, 54, 56)' : 'rgb(173,178,184)',
            border: skill.enabled ? 'none' : '1px solid rgba(255,255,255,0.14)',
          }}>
            {skill.enabled ? '已启用' : '已禁用'}
          </span>
        </div>
        {/* 描述 */}
        {skill.description ? (
          <div style={{
            color: 'rgb(173,178,184)', fontSize: 13, lineHeight: 1.55,
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            minHeight: 42,
          }}>
            {skill.description}
          </div>
        ) : null}
        {/* 来源 */}
        <div style={{
          fontFamily: 'var(--dsw-font-mono, Menlo, monospace)', fontSize: 11,
          color: 'rgb(130, 136, 142)', marginTop: 'auto',
        }}>
          {skill.source}
        </div>
      </div>

      {/* 底部按钮行：图标在上文字在下，小字 */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', justifyContent: 'flex-end', gap: 2, padding: '6px 8px', display: 'flex' }}>
        <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); doToggle() }} title={skill.enabled ? '禁用技能（DSH 将不再加载）' : '启用技能'}
          style={{
            ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px',
            fontSize: 11, opacity: busy === 'toggle' ? .6 : 1,
          }}>
          <Ic.power size={12} /> {busy === 'toggle' ? '处理中…' : skill.enabled ? '禁用' : '启用'}
        </button>
        <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); onEdit(skill.name) }} title="查看技能内容"
          style={{ ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px', fontSize: 11 }}>
          <Ic.edit size={12} /> 编辑
        </button>
        <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); setShowSettings(true) }} title={skill.settingsEnabled ? '配置技能参数设置' : '技能设置未开启（创建时选择不开设置）'}
          style={{ ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px', fontSize: 11, opacity: skill.settingsEnabled ? 1 : .45, cursor: skill.settingsEnabled ? 'pointer' : 'default' }}>
          <Ic.settings size={12} /> 设置
        </button>
        <button type="button" disabled={!!busy} onClick={(e) => { e.stopPropagation(); setShowDelete(true) }} title="删除技能"
          style={{
            ...footBtn, flexDirection: 'column', gap: 2, padding: '4px 8px', fontSize: 11,
            color: 'var(--dsw-alias-state-error-primary, #ef4444)',
            borderColor: 'color-mix(in srgb, var(--dsw-alias-state-error-primary, #ef4444) 40%, transparent)',
          }}>
          <Ic.trash size={12} /> 删除
        </button>
      </div>

      {showDelete ? (
        <DeleteConfirm name={skill.name} onCancel={() => setShowDelete(false)} onConfirm={doDelete} />
      ) : null}
      {showSettings ? (
        <SkillSettingsModal name={skill.name} onClose={() => setShowSettings(false)} onSaved={onChanged} />
      ) : null}
      {showDetail ? (
        <SkillDetailModal name={skill.name} skill={skill} onClose={() => setShowDetail(false)} onChanged={onChanged} onEdit={onEdit} />
      ) : null}
    </li>
  )
}

// ── 技能管理菜单页（settings.section 内容） ───────────
function SkillManagerSection({ ctx }: { ctx?: any }) {
  const [skills, setSkills] = React.useState<Skill[]>([])
  const [stats, setStats] = React.useState<{ total: number; unmanaged: number; managed: number }>({ total: 0, unmanaged: 0, managed: 0 })
  const [loading, setLoading] = React.useState(true)
  const [editName, setEditName] = React.useState('')
  const [showCreate, setShowCreate] = React.useState(false)

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

  // 点「新建技能」→ 当前会话输入框注入提示词（不新建会话/工作区）
  const injectCreatePrompt = () => {
    const PREFIX = '新建一个技能：'
    const done = injectIntoInput(PREFIX)
    closeSettings()
    void done
  }

  // 注入输入框（DSH 双图层：textarea 透明 + backdrop 渲染。必须同步 React tracker 才能让 backdrop 显示）
  const injectIntoInput = (v: string) => {
    const ta = document.querySelector<HTMLTextAreaElement>('textarea[data-phase]')
    if (!ta) return false
    try {
      // 1) 清 React value tracker（否则 setter 被忽略）
      const tracker = (ta as any)._valueTracker
      if (tracker) tracker.setValue('')
      // 2) 原生 setter 设值（React 受控标准方式）
      const protoSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      if (protoSetter) {
        protoSetter.call(ta, v)
        ta.dispatchEvent(new Event('input', { bubbles: true }))
      } else {
        ta.value = v
      }
      // 3) 兜底：确认 backdrop 同步（必要时重设）
      const syncBackdrop = () => {
        const cont = ta.parentElement
        const backdrop = cont ? [...cont.querySelectorAll('*')].find((el: any) => el.className && String(el.className).includes('backdrop')) : null
        if (backdrop && backdrop.textContent !== v) {
          // backdrop 没同步 → 再触发一次（模拟真实输入：先清空再输入）
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
      const pending = window.__skillskillPendingCreate
      if (pending && Date.now() - pending.t > 2000) {
        window.__skillskillPendingCreate = undefined
        load()
      }
    }, 2500)
    return () => { disposed = true; clearInterval(iv) }
  }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--dsw-alias-label-primary)' }}>技能管理</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>
            管理用户创建的技能 — 启用/禁用、设置、查看内容、删除
          </p>
        </div>
        <button
          type="button"
          onClick={injectCreatePrompt}
          style={{
            padding: '5px 12px', borderRadius: 8, fontSize: 13, fontWeight: 500,
            border: '1px solid var(--dsw-alias-border-l2)',
            background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)',
            cursor: 'pointer', flexShrink: 0,
            transition: 'background .12s, border-color .12s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-interactive-bg-hover)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-label-dimmed)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-l2)' }}
        >＋ 新建技能</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</div>
      ) : skills.length === 0 ? (
        <div style={{
          fontSize: 13, color: 'var(--dsw-alias-label-tertiary)',
          padding: 16, borderRadius: 12, textAlign: 'center',
          border: '1px dashed rgba(255,255,255,0.15)',
        }}>
          暂无用户创建的技能。点击「新建技能」创建你的第一个技能。
        </div>
      ) : (
        <ul style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(268px, 1fr))',
          gridAutoRows: '1fr', gap: 12, margin: 0, padding: 0, listStyle: 'none',
        }}>
          {skills.map(s => (
            <SkillCard key={s.name} skill={s} onChanged={load} onEdit={setEditName} />
          ))}
        </ul>
      )}

      {/* 底部状态栏 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 10,
        background: 'var(--dsw-alias-bg-layer-3, rgba(255,255,255,0.04))',
        border: '1px solid rgba(255,255,255,0.08)',
        fontSize: 12, color: 'var(--dsw-alias-label-tertiary)',
        marginTop: 8,
      }}>
        <span>用户创建技能：<strong style={{ color: 'var(--dsw-alias-label-primary)' }}>{stats.managed}</strong></span>
        <span style={{ opacity: .5 }}>·</span>
        <span>未纳入管理：<strong style={{ color: stats.unmanaged > 0 ? 'var(--dsw-alias-state-warning-primary, #f59e0b)' : 'var(--dsw-alias-label-primary)' }}>{stats.unmanaged}</strong></span>
        <span style={{ opacity: .5 }}>·</span>
        <span>技能目录总计：<strong style={{ color: 'var(--dsw-alias-label-primary)' }}>{stats.total}</strong></span>
      </div>

      {editName ? <EditModal name={editName} onClose={() => setEditName('')} /> : null}
      {showCreate ? <CreateSkillModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load() }} /> : null}
    </div>
  )
}

// ── SkillSkill 设置卡片（只有开关） ────────────────────
function SkillManagerCard({ onEnabledChange }: { onEnabledChange?: (enabled: boolean) => void }) {
  const [open, setOpen] = React.useState(false)
  const [enabled, setEnabled] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [version, setVersion] = React.useState('')
  const [hasUpdate, setHasUpdate] = React.useState(false)
  const [uninstalling, setUninstalling] = React.useState(false)
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

  const handleUninstall = () => {
    if (uninstalling) return
    if (!window.confirm('确定卸载 SkillSkill 插件吗？\n\n将从 DSH 中移除插件本体和全部配置。')) return
    setUninstalling(true); setFeedback(null)
    api('/uninstall').then((r) => {
      if (r?.ok) setFeedback('已卸载。请重启 DSH 使生效（插件配置文件中已移除）。')
      else { setFeedback(`卸载失败：${r?.error ?? '未知错误'}`); setUninstalling(false) }
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
              SkillSkill
            </span>
            {version ? <span className="dsh-mm-version-badge">{version}</span> : null}
          </span>
          <span className="dsh-mm-desc" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
            管理 DSH 中已安装的技能插件
          </span>
        </span>

        <span className="dsh-mm-btns">
          <a className="dsh-mm-btn-link" href={GITHUB_REPO} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} title="打开 GitHub 仓库"
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--dsw-alias-brand-primary)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-brand-primary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--dsw-alias-label-secondary)'; e.currentTarget.style.borderColor = 'var(--dsw-alias-border-l2)' }}
          >ideasir</a>
          <button type="button" className="dsh-mm-btn-uninstall" onClick={(e) => { e.stopPropagation(); handleUninstall() }} disabled={uninstalling} title="卸载插件"
            style={{ cursor: uninstalling ? 'default' : 'pointer', opacity: uninstalling ? .6 : 1 }}
            onMouseEnter={(e) => { if (uninstalling) return; e.currentTarget.style.background = 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--dsw-alias-bg-layer-1)' }}
          >{uninstalling ? '卸载中…' : '卸载'}</button>
          <button type="button" className="dsh-mm-btn-update"
            onClick={(e) => {
              e.stopPropagation()
              if (hasUpdate) window.open(GITHUB_REPO, '_blank', 'noreferrer')
              else api('/update').then((d) => { if (d?.ok) setHasUpdate(!!d.hasUpdate) })
            }}
            title={hasUpdate ? '发现新版本，点击前往仓库查看更新' : '当前已是最新版本（点击重新检查）'}
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
            <span style={{ fontSize: 14, color: 'var(--dsw-alias-label-primary)' }}>启用技能管理</span>
            {loading ? (
              <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>加载中…</span>
            ) : (
              <button type="button" onClick={toggleEnabled}
                style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', background: enabled ? '#22c55e' : 'var(--dsw-alias-bg-layer-1)', transition: 'background .2s' }}
                aria-label="启用技能管理"
              >
                <span style={{ position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', left: enabled ? 23 : 3, transition: 'left .2s' }} />
              </button>
            )}
          </div>
          {envOpen ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-tertiary)', letterSpacing: '.06em', textTransform: 'uppercase' }}>功能检测</span>
              {envItems.map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: item.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }} />
                  <span style={{ fontSize: 13, whiteSpace: 'nowrap', color: item.ok ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-state-error-primary)' }}>{item.label}</span>
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

// 全局：让 TS 认识 window 上的自定义字段
declare global {
  interface Window {
    __skillskillPendingCreate?: { t: number }
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

export function apply(ctx: any) {
  const slots = ctx.slots as any
  const register = slots.register.bind(slots) as (opts: object, comp: unknown) => () => void

  // ── 注入统一卡片 CSS（与 makemake/passpass/veryIM 共用 dsh-mm-* 类） ──
  if (!document.getElementById('dsh-mm-css-skillskill')) {
    const s = document.createElement('style'); s.id = 'dsh-mm-css-skillskill'
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
      window.__skillskillPendingCreate = { t: Date.now() }
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
        const feedbackText = `✅ 技能「${parsed.name}」已创建并规范化。${fieldCount > 0 ? `已自动识别 ${fieldCount} 个可复用设置项（可在 设置 → 技能管理 → 该技能 → 设置 中填写）。` : '未检测到明显设置项，可直接使用。'}可用 list_skills 查看。`
        void api('/feedback', { text: feedbackText })
      })
    }

    // 返回清理函数（插件卸载时移除监听）
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }

  // 启动全局拦截（延迟到 DOM 就绪）
  setTimeout(() => {
    try { setupGlobalIntercept() } catch { /* ignore */ }
  }, 1500)

  const ensureSection = (visible: boolean) => {
    if (visible && !sectionDisposer) {
      sectionDisposer = ctx.slots.inject('settings.section', () => register({
        name: 'settings.section',
        id: 'skillskill-section',
        order: 30,
        label: () => '技能管理',
      }, function SkillManagerSectionEntry() {
        return React.createElement(SkillManagerSection, { ctx })
      }))
    } else if (!visible && sectionDisposer) {
      try { sectionDisposer() } catch { /* ignore */ }
      sectionDisposer = null
    }
  }

  api('/list').then((d) => { ensureSection(!!(d && d.ok && d.enabled)) })

  ctx.slots.inject('settings.plugin.item', () => register({
    name: 'settings.plugin.item',
    key: 'skillskill',
    priority: 30,
  }, function SkillManagerPluginCard(props: any) {
    return React.createElement(SkillManagerCard, { ...props, onEnabledChange: ensureSection })
  }))
}

export const inject = ['slots']