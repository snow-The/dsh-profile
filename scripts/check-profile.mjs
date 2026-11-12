/**
 * check-profile.mjs — 這個 repo 的自洽檢查（只驗「意圖／產物／掛載」三者，不碰宿主）。
 *
 * 為什麼不搬 dsh-setup 的 check-template：那支驗的是「可部署模板 + 宿主体检 + 審計紀錄」，
 * 需要 setup.ps1 / third-party-gaps.json / patch-rows.json 這些**不在這個 repo 的東西**。
 * 這裡只保留會讓 profile 壞掉的那幾條，並且每一條都要能被 selftest 弄紅。
 *
 * 判準：任何一條失敗 → exit 1（CI 直接用）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.CHECK_ROOT
  ? path.resolve(process.env.CHECK_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PROF_IDX = process.argv.indexOf('--profile')
const PROF = PROF_IDX >= 0 ? String(process.argv[PROF_IDX + 1] ?? '') : 'web'
if (!/^[a-z0-9-]+$/.test(PROF)) { console.error(`  --profile 只接受小寫目錄名，收到 ${JSON.stringify(PROF)}`); process.exit(2) }
const WEB = path.join(ROOT, 'profiles', PROF)
const INTENT = path.join(WEB, 'plugins.intent.json')
const PKG = path.join(WEB, 'package.json')
const WS = path.join(WEB, 'pnpm-workspace.yaml')
const PATCH = path.join(WEB, 'cordis.patch.yml')

const checks = []
const check = (id, desc, fn) => checks.push({ id, desc, fn })
const results = []
function run() {
  let failed = 0
  for (const c of checks) {
    try {
      const detail = c.fn()
      results.push({ id: c.id, ok: true, detail })
    } catch (e) {
      failed++
      results.push({ id: c.id, ok: false, detail: e.message })
    }
  }
  for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} [${r.id}] ${checks.find((c) => c.id === r.id).desc}${r.detail ? `\n      ${r.detail}` : ''}`)
  console.log(`\n  ${results.length - failed} 項通過, ${failed} 項失敗`)
  process.exit(failed ? 1 : 0)
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'))
const intent = readJson(INTENT)
const pkg = readJson(PKG)
const wsText = fs.readFileSync(WS, 'utf8')
const deps = pkg.dependencies ?? {}
const bundles = pkg.dsh?.profile?.bundles ?? []
const aggregates = intent.aggregates ?? {}
const members = new Set(Object.values(aggregates).flat())

// 從「意圖 → 產物」應該出現的依賴集合（npm + github + local）
const intended = new Set([
  ...Object.keys(intent.npm ?? {}),
  ...Object.keys(intent.github ?? {}),
  ...Object.keys(intent.local ?? {}),
])

check('1', '生成的 dependencies 與意圖完全一致（不多不少）', () => {
  const got = new Set(Object.keys(deps))
  const missing = [...intended].filter((n) => !got.has(n))
  const extra = [...got].filter((n) => !intended.has(n))
  if (missing.length || extra.length) throw new Error(`缺少: ${missing.join(', ') || '-'}；多出: ${extra.join(', ') || '-'}`)
  return `${got.size} 個依賴`
})

check('2', '每個依賴都被掛載（bundleOrder 或聚合包成員）', () => {
  const unmounted = [...intended].filter((n) => !bundles.includes(n) && !members.has(n))
  if (unmounted.length) throw new Error(`裝了卻沒掛: ${unmounted.join(', ')}`)
  return `${intended.size} 個依賴全部有歸屬`
})

check('3', 'bundleOrder 的每一條都有來源（宿主層／依賴／聚合包）', () => {
  const host = new Set(intent.hostBundles ?? [])
  const orphan = bundles.filter((b) => !host.has(b) && !intended.has(b) && !aggregates[b])
  if (orphan.length) throw new Error(`掛了卻沒來源: ${orphan.join(', ')}`)
  return `${bundles.length} 條`
})

check('4', '已退役套件不得再出現（@linxin666/*，2026-11-12 移除）', () => {
  const retired = ['@linxin666/']
  const hits = [...intended, ...bundles].filter((n) => retired.some((r) => n.startsWith(r)))
  if (hits.length) throw new Error(`仍在意圖或掛載裡: ${hits.join(', ')}`)
  return '0 條'
})

check('5', 'pnpm 世代與白名單鍵名相符（10→onlyBuiltDependencies，11+→allowBuilds）', () => {
  const pm = String(intent.packageManager ?? '')
  const major = Number((pm.match(/pnpm@(\d+)/) ?? [])[1] ?? 0)
  const hasV10Key = /^onlyBuiltDependencies:\s*$/m.test(wsText)
  const hasV11Key = /^allowBuilds:\s*$/m.test(wsText)
  if (!major) throw new Error(`packageManager 讀不出主版本: ${JSON.stringify(pm)}`)
  if (major >= 11 && !hasV11Key) throw new Error(`pnpm ${major} 需要 allowBuilds: map，實際缺少`)
  if (major < 11 && !hasV10Key) throw new Error(`pnpm ${major} 需要 onlyBuiltDependencies: 陣列，實際缺少`)
  if (major >= 11 && hasV10Key) throw new Error(`pnpm ${major} 不該出現 v10 的 onlyBuiltDependencies（會被忽略）`)
  if (major < 11 && hasV11Key) throw new Error(`pnpm ${major} 不該出現 v11 的 allowBuilds（會被忽略）`)
  return `pnpm ${major} → ${major >= 11 ? 'allowBuilds' : 'onlyBuiltDependencies'}`
})

check('6', 'npm 依賴全部是精確版本（允許 -rc.1 這種預發布）', () => {
  const bad = Object.entries(deps).filter(([, v]) => /^[\^~]/.test(String(v)) || String(v).includes('*'))
  if (bad.length) throw new Error(`範圍版本: ${bad.map(([n, v]) => `${n}@${v}`).join(', ')}`)
  return `${Object.keys(deps).length} 個`
})

check('7', 'local 依賴的目錄存在，且 package.json 的 name 與鍵一致', () => {
  const bad = []
  for (const [name, rel] of Object.entries(intent.local ?? {})) {
    const abs = rel.startsWith('~') ? path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', rel.slice(1)) : path.resolve(ROOT, rel)
    const pj = path.join(abs, 'package.json')
    if (!fs.existsSync(pj)) { bad.push(`${name}: 找不到 ${pj}`); continue }
    const actual = JSON.parse(fs.readFileSync(pj, 'utf8')).name
    if (actual !== name) bad.push(`${name}: 目錄裡的 name 是 ${actual}`)
  }
  if (bad.length) throw new Error(bad.join('; '))
  return `${Object.keys(intent.local ?? {}).length} 個`
})

check('8', 'cordis.patch.yml 是頂層 YAML 陣列（loader 只接受陣列）', () => {
  if (!fs.existsSync(PATCH)) throw new Error('缺少 profiles/web/cordis.patch.yml')
  const lines = fs.readFileSync(PATCH, 'utf8').split(/\r?\n/)
  const first = lines.find((l) => l.trim() && !l.trim().startsWith('#'))
  if (!first) throw new Error('檔案只有註解或空白')
  const t = first.trim()
  if (!t.startsWith('-') && !t.startsWith('[')) throw new Error(`第一條有效內容不是陣列元素: ${JSON.stringify(t.slice(0, 40))}`)
  return `${lines.length} 行`
})

run()
