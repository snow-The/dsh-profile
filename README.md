# dsh-profile — DSH profile 的意圖與產物

> 這個 repo **只做一件事**：把「這個 profile 要掛哪些插件、什麼版本、什麼順序」從一份手寫意圖，
> 編譯成 `profiles/web/package.json` 與 `profiles/web/pnpm-workspace.yaml`，並用自檢證明兩者一致。

## 邊界（刻意不做的事）

| 在這裡 | 不在這裡 |
|---|---|
| `profiles/web/plugins.intent.json`（唯一手改的檔） | 宿主安裝／升級／體檢 |
| `scripts/derive-profile.mjs`（意圖 → 產物） | 部署腳本（setup.ps1/sh） |
| 推導的變異自檢、模板一致性檢查 | 一次性審計腳本（audit-*）、patch 復原工具 |
| `profiles/web/cordis.patch.yml`（profile 的 patch 層） | 任何機器專屬路徑、憑證、金鑰 |

歷史上的 `dsh-setup` 混了上面兩邊；2026-11-12 把編譯器抽到這裡，其餘留在原 repo 當歷史
（原 repo 有一份 `MOVED.md` 說明，以及「不要再拿舊 intent 生成 live profile」的警告）。

## 檔案

```
dsh-profile/
├── profiles/web/
│   ├── plugins.intent.json     ← 唯一手改的檔
│   ├── package.json            ← 生成物
│   ├── pnpm-workspace.yaml     ← 生成物（含 onlyBuiltDependencies）
│   └── cordis.patch.yml        ← profile 的 patch 層（手維護）
└── scripts/
    ├── derive-profile.mjs         意圖 → 產物（+ 結構斷言）
    ├── derive-profile.selftest.mjs 變異自檢：每個斷言都要被打紅
    ├── npm-view.mjs               `npm view` 輸出正規化
    ├── check-profile.mjs          意圖／產物／掛載三者自洽（8 條）
    └── check-profile.selftest.mjs 上面 8 條的變異自檢
```


## 兩個 profile

| profile | 內容 | 用途 |
|---|---|---|
| `profiles/web` | 意圖：33 個自研插件（`github:`）+ 6 個 npm；本機部署時 31 個改走 `file:` 工作副本 | 日常工作 |
| `profiles/pure` | **0 依賴**，只掛 4 個宿主層（base / web-app / terminal / agent-team） | 診斷「是 DSH 還是插件」、升級基準、新機器先驗引擎 |

兩者共用同一個編譯器：

```powershell
node scripts/derive-profile.mjs --profile pure --write --out ./profiles/pure
node scripts/derive-profile.mjs --profile pure          # 檢查
node scripts/check-profile.mjs  --profile pure          # 8 條自洽（0 依賴時全部 vacuous-pass，但有驗證意義）
```

**啟動方式**（踩過的坑）：profile 名是位置參數，不是 `--profile <name> web`：

```powershell
dsh --profile pure --no-open --port 35888   # 正確
dsh --profile pure web ...                  # 錯：error: too many arguments … got 1: web
```

`pure` 已在 2026-11-12 冷啟動驗證：port 35888 監聽、stderr 空、URL 正常印出。

## 指令

```powershell
node scripts/derive-profile.mjs --write   # 意圖 → 產物
node scripts/derive-profile.mjs           # 檢查產物是否仍與意圖一致（CI 用）
node scripts/check-profile.mjs            # 意圖／產物／掛載自洽（8 條）
node scripts/derive-profile.selftest.mjs  # 變異自檢：故意改壞意圖，每個斷言都要觸發
node scripts/check-profile.selftest.mjs   # 同上，對 check-profile
```

沒有 `pnpm test` 的必要：這些腳本零依賴，只要 node。

## 兩條容易踩的規則（都是實測踩過的）

1. **pnpm 世代決定白名單鍵名**：`packageManager` 是 `pnpm@10.x` → 寫 `onlyBuiltDependencies`（字串陣列）；
   `pnpm@11+` → 寫 `allowBuilds`（map）。寫錯世代會被**靜默忽略**，build script 全部被擋，
   而 `derive:check` 仍然綠（因為它只驗生成物 vs 意圖）。
2. **`latest` 不是引擎版本**：官方 bundle 的 npm `latest` tag 可能停在 alpha
   （`dsh-experimental-terminal-bundle` 的 latest 是 `0.2.1-alpha.2`，而引擎是 `0.2.2-rc.1`）。
   安裝／釘版本一律跟 `runtime` 對齊，不要讓 dist-tag 決定。

## 與 live profile 的關係

live profile（`~/.dsh/profiles/web`）是這份意圖的**部署結果**：

```powershell
node scripts/derive-profile.mjs --write --prefer-local --out "$env:USERPROFILE\.dsh\profiles\web"
```

`--prefer-local` 讓自研插件用本地工作副本（`file:`），避免把未推送的改動回退成 GitHub 上的舊版。
