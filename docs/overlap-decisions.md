# 重複輪子清單（2026-11-12）

判準：**同名 = 一定是問題**（後載入的靜默覆蓋）；**同功能 = 決策問題**（要寫清楚誰負責什麼）。
資料來源：`docs/tool-catalog.md`（官方 75 個工具）vs 我們 173 個工具名（含未掛載的舊插件）。

## 1. 同名：0

官方 75 × 我們 173，**沒有任何一個工具同名**。這點是乾淨的。

**但我上一輪說錯了一句**：`bash` / `pwsh` 的重名不是「官方 vs 我們」，而是**官方 vs 官方**：

| 套件 | 工具名 |
|---|---|
| `@deepseek-ai/dsh-tool-pwsh` | `pwsh` |
| `@deepseek-ai/dsh-tool-pwsh-persistent` | **`pwsh`**（同一名字，狀態跨呼叫保留） |
| `@deepseek-ai/dsh-tool-bash` | `bash` |
| `@deepseek-ai/dsh-tool-bash-persistent` | **`bash`** |

兩個一起掛，只有一個會生效，而且不會有任何錯誤訊息。所以「官方全啟用」真正的風險在**官方自己的兩兩重名**，不是我們。

## 2. 功能重疊：三組，各有判準

| 領域 | 官方 | 我們 | 判準 |
|---|---|---|---|
| **上網取得** | `web_search`、`web_fetch`（2） | `platform_search`、`search_fetch`、`search_open`、`search_github`、`search_hubs`、`search_corpus_*`、`search_deep`、`search_probe`、`search_api`、`search_arxiv`、`search_code`（13） | 官方兩個是**默認路徑**；我們的是**多引擎 + GitHub/HF + 向量語料 + 深網探測**。重疊只發生在「隨便搜一下」——保留兩邊，但 prompt 裡應寫明先試 `web_search`。 |
| **回想過去** | `session_search`、`session_event_read/search/trace`、`session_trace`（5，**未掛**） | `memory_search`、`memory_get`、`memory_save`、`memory_status`、`memory_context`（5） | 不同資料：官方查**原始 session 事件**，我們查**筆記 + 文件索引 + 壓縮摘要**。若哪天掛 session-query，必須寫清楚「查原文用官方、查結論用 memory」。 |
| **把活交給別人** | `team_task_*`（4）、`send_message`、`list_agents`、`wait_agent`、`interrupt_agent`（已掛 agent-team） | `orchestrator_*`（6）、`session_bus_*`（8） | 官方是**同一個 host 內的團隊**；我們是**跨 session／跨機器、durable**（ticket + mailbox）。兩者都在時，先問「對方是不是同一個 team」：是→官方，跨機器／要留紀錄→我們。 |

## 3. 看起來像重疊、其實不是

| 對照 | 差別 |
|---|---|
| `schedule_*` vs `automation_*` | 官方 schedule 是**agent 提醒**（會叫模型）；automation 是**無 LLM 的定時檢查**（不花 token） |
| `terminal_*` vs `ssh_*` | 前者是本機持久 PTY；後者是遠端主機 |
| `present` vs 我們的交付物流程 | 官方 `present` 就是我們在用的那個，沒有第二個 |
| `plugin_manager` vs `plugin_levels_*` | 前者安裝/列舉；後者宣告「這個插件需要什麼、缺什麼」 |
| `office_*`（未掛） vs 我們的 `rlab_ocr`/`office-to-pdf` | 不同管線；需要時再掛 |

## 4. 原始碼層的重複輪子（已退役但還躺在 workspace）

掃描看到 173 個工具名，其中這些**沒有掛載**，但仍存在於 `source/repos/dsh-workspace/plugins/`：

- `dsh-notemap`（24 個 `notemap_*`）——2026-11-08 被 `dsh-memory` 取代
- `dsh-acp-memory`（`memory_remember`、`memory_find_similar`…）——同上
- `dsh-tavernlike`（3 個 `tavern_*`）——研究線，未掛
- `dsh-busyloop-codex`（`codex_*`）——未掛

它們不影響運行（沒掛就不註冊），但會讓「到底有幾個輪子」這個問題永遠算不準。要不要清掉是删除動作，需人決定。

## 5. 決策

1. **shell 只選一種**：現在用無狀態 `pwsh`；要跨呼叫保留狀態就換成 persistent 那組，**不要兩組併掛**。
2. **上網**：官方 `web_search`/`web_fetch` 是默認；我們的 `search_*` 是補強。prompt 分層要寫明。
3. **交接**：同 host 團隊用官方 `team_task_*`；跨機器／要 durable 用 `orchestrator_*` + `session_bus_*` + `work_*`。
4. **全啟用**：仍然不行——不是因為我們重複，而是官方自己就有兩組同名 shell 工具，加上 stagehand vs 我們的 browser、str_replace_editor vs edit、action-cards vs present。
