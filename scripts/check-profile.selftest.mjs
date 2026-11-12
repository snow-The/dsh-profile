/**
 * check-profile.selftest.mjs — 對 check-profile 做變異測試：
 * 每個檢查都必須被「弄紅一次」，否則那個檢查只是安慰劑。
 *
 * 作法：把 profiles/ 複製到暫存目錄、套一個變異、用 CHECK_ROOT 指過去跑檢查器，
 * 斷言 exit=1 且**是那一條**紅（不是別的條把錯吞掉）。
 */
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(REPO, 'scripts', 'check-profile.mjs')

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const writeJson = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', 'utf8')

function sandbox() {
  const d = mkdtempSync(path.join(tmpdir(), 'dsh-profile-check-'))
  cpSync(path.join(REPO, 'profiles'), path.join(d, 'profiles'), { recursive: true })
  return d
}
function run(dir) {
  const r = spawnSync(process.execPath, [SCRIPT], { env: { ...process.env, CHECK_ROOT: dir }, encoding: 'utf8' })
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

const cases = [
  {
    id: '1', name: '生成物多了一個意圖沒有的依賴',
    mutate(dir) {
      const p = path.join(dir, 'profiles/web/package.json')
      const j = readJson(p); j.dependencies['dsh-extra-test'] = '1.0.0'; writeJson(p, j)
    },
  },
  {
    id: '2', name: '依賴被裝了但沒掛載',
    mutate(dir) {
      const p = path.join(dir, 'profiles/web/package.json')
      const j = readJson(p); j.dsh.profile.bundles = j.dsh.profile.bundles.filter((b) => b !== '@snow-the/dsh-ssh'); writeJson(p, j)
    },
  },
  {
    id: '3', name: '掛了一個沒有來源的 bundle',
    mutate(dir) {
      const p = path.join(dir, 'profiles/web/package.json')
      const j = readJson(p); j.dsh.profile.bundles.push('@deepseek-ai/no-such-bundle'); writeJson(p, j)
    },
  },
  {
    id: '4', name: '已退役的 @linxin666 回到意圖',
    mutate(dir) {
      const i = path.join(dir, 'profiles/web/plugins.intent.json')
      const j = readJson(i); j.npm['@linxin666/dsh-pet'] = '0.4.15'; writeJson(i, j)
      const p = path.join(dir, 'profiles/web/package.json')
      const k = readJson(p); k.dependencies['@linxin666/dsh-pet'] = '0.4.15'; k.dsh.profile.bundles.push('@linxin666/dsh-pet'); writeJson(p, k)
    },
  },
  {
    id: '5', name: 'pnpm 10 卻寫 v11 的白名單鍵',
    mutate(dir) {
      const p = path.join(dir, 'profiles/web/pnpm-workspace.yaml')
      const t = readFileSync(p, 'utf8').replace(/^onlyBuiltDependencies:\s*$/m, 'allowBuilds:')
      writeFileSync(p, t, 'utf8')
    },
  },
  {
    id: '6', name: '依賴版本變成範圍',
    mutate(dir) {
      const p = path.join(dir, 'profiles/web/package.json')
      const j = readJson(p); j.dependencies['dshmarket'] = '^1.73.12'; writeJson(p, j)
    },
  },
  {
    id: '7', name: 'local 依賴指向不存在的目錄',
    mutate(dir) {
      const i = path.join(dir, 'profiles/web/plugins.intent.json')
      const j = readJson(i); j.local['@snow-the/dsh-memory'] = '~/source/repos/does-not-exist-xyz'; writeJson(i, j)
    },
  },
  {
    id: '8', name: 'patch 檔不是 YAML 陣列',
    mutate(dir) { writeFileSync(path.join(dir, 'profiles/web/cordis.patch.yml'), '{ not: an array }\n', 'utf8') },
  },
]

let failed = 0
for (const c of cases) {
  const dir = sandbox()
  try {
    const base = run(dir)
    if (base.code !== 0) { console.log(`  ✗ [${c.id}] 基準就紅了（變異前的 repo 不是綠的）\n${base.out}`); failed++; continue }
    c.mutate(dir)
    const r = run(dir)
    const hit = r.code === 1 && new RegExp(`✗ \\[${c.id}\\]`).test(r.out)
    if (hit) console.log(`  ✓ [${c.id}] ${c.name} → 紅在正確的地方`)
    else { failed++; console.log(`  ✗ [${c.id}] ${c.name} → 期待 exit=1 且 [${c.id}] 紅，實際:\n${r.out}`) }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

console.log(`\n  變異 ${cases.length - failed}/${cases.length} 條被正確抓到`)
process.exit(failed ? 1 : 0)
