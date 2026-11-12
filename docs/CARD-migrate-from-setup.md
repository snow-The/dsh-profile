# 指導卡：從 dsh-setup 遷到 dsh-profile

> 給**已經在用 DSH、但手上是舊 `dsh-setup` 那套**的人。
> 2026-11-12 起，profile 的生成與發布集中到 [`snow-The/dsh-profile`](https://github.com/snow-The/dsh-profile)；
> `dsh-setup` 只剩宿主側工具（體檢、審計、啟動驗證），它的 `setup.ps1` / `setup.sh` **已加退役閘門**，
> 直接跑會被拒（它會把 6666 世代的 `profiles/web` 覆蓋到你機器上）。

## 0. 先分清兩層（九成的誤判來自這裡）

| 層 | 誰決定 | 怎麼升 |
|---|---|---|
| **引擎** | intent 的 `runtime` 欄位 | `npx --yes @deepseek-ai/dsh@<版本>` |
| **profile** | `plugins.intent.json` | `git pull` → `derive --write --out <目錄>` → `pnpm install` |

同世代只換插件 → 只發 profile 就夠。**跨世代 → 兩件都要做，先引擎後 profile。**
世代不對時，插件自己的 `peerDependencies` 會擋下來，報錯只說「某個 bundle peer 不滿足」，看起來像插件壞了。

## 1. 三步遷完

```powershell
# ① 引擎（版本看 dsh-profile 裡 profiles/web/plugins.intent.json 的 runtime）
npx --yes @deepseek-ai/dsh@0.2.2-rc.1 --version

# ② profile
git clone https://github.com/snow-The/dsh-profile
cd dsh-profile
node scripts/derive-profile.mjs --write --profile web --out "$env:USERPROFILE\.dsh\profiles\web"
cd "$env:USERPROFILE\.dsh\profiles\web"
pnpm install

# ③ 起（profile 名是位置參數，不是 --profile web）
dsh --profile web
```

想直接拿現成產物、不動編譯器：`cd profiles/web && pnpm install` 也可以 —— repo 裡的 `profiles/web` 就是產物。

## 2. 五個踩過的坑（每個都實測過，且在本機看不出來）

1. **包里不能有 `prepare`**。pnpm 對 git 依賴會先在臨時目錄跑 `pnpm install` 再跑 `prepare`，
   `prepare: pnpm build` 在那裡必失敗 → `ERR_PNPM_PREPARE_PACKAGE`，整個 profile 裝不下去。
   本機因為 store 裡有「已準備」的副本，症狀完全消失。
2. **構建產物必須入庫**。`main` 指向 `dist/index.js` 卻把 `dist/` 寫進 `.gitignore`，發出去就是空殼。
3. **pnpm 世代決定白名單鍵名**：pnpm 10 → `onlyBuiltDependencies`（字串陣列）；pnpm 11 → `allowBuilds`（map）。
   寫錯不報錯，只是 build script 全被擋。
4. **`derive --out` 會一併同步 `cordis.patch.yml`**（2026-11-12 修）。沒有它 = authorization、權限預設、
   模型路由、主題整層都不在，症狀像「插件沒掛上」。
5. **`latest` 不是引擎版本**。官方 bundle 的 npm `latest` tag 可能停在 alpha（terminal bundle 曾是 `0.2.1-alpha.2`）。
   一律跟 `runtime` 對齊。

## 3. 驗證（兩條都要綠）

```powershell
cd dsh-profile
node scripts/derive-profile.mjs     # 生成物 == 意圖推導結果
node scripts/check-profile.mjs      # 8 條：意圖／產物／掛載 三者自洽
```

全新機器模擬（本機實測）：全新 clone + **空 pnpm store** → 78 個包 / 約 16 秒 → 啟動成功、stderr 空。
空 store 是關鍵：本地複用快取會把上面前兩個坑全部藏起來。

## 4. 回退

遷移前把舊目錄改名（不要刪）：`profiles\web` → `profiles\web.bak-<日期>`。
要回退就停掉新進程、把目錄名換回來、用舊引擎起。舊全局安裝先別 `npm rm -g`，它是你的退路。

## 5. 一句話總結

**意圖在 `plugins.intent.json`（人改這個），產物由 `derive-profile.mjs` 生成（不要手改），
兩者一致性由 `derive:check` + `check-profile` 證明。** 其他都是操作細節。
