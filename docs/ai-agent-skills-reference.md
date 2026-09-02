# AI 前端 / UI 智能專案參考清單

> 整理自：《現代 AI 設計生態系關鍵開源架構解析：十項前端與 UI 智能專案深度研究報告》
> 用途：記錄十個具代表性的開源 Claude Agent Skills / AI 設計技能專案，供未來評估、導入或參考使用。

## 專案總覽

| # | 專案名稱 | GitHub 倉庫 | 架構型態 | 核心驅動機制與規範 | 主要設計與工程定位 | 生態整合相容性 |
|---|---|---|---|---|---|---|
| 1 | Hallmark | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) | Agent Skill | 21 種巨觀結構、20+ 主題規則集、57 道防 Slop 檢測門 | 反 AI 味網頁審美校準、結構多樣化生成與代碼審計 | Claude Code, Cursor, Codex |
| 2 | Open Design | [nexu-io/open-design](https://github.com/nexu-io/open-design) | 本地桌面工作台 / DSH 插件 | 本地優先執行時、多代理人 BYOK 架構、多格式導出引擎 | AI 設計工作台、原型協同與全鏈路交付平台 | Claude Code, Cursor, Codex, DeepSeek Harness |
| 3 | UI/UX Pro Max Skill | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Agent Skill / 知識庫 | 檢索導向矩陣（50+ 風格、97 套色盤、57 組字體配對、99 條 UX 準則） | 企業級 SaaS、儀表板與多端設計規格決策支援 | Claude Code, Cursor, Windsurf, Codex CLI |
| 4 | Taste Skill | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | Agent Skill 框架集 | 參數調節閥（方差/動態/密度 1-10）、AIDA 佈局、無縫 Bento Grid | 去模板感、視覺質感躍升、高階排版與動態控制 | Claude Code, Cursor, Windsurf, OpenCode |
| 5 | GSAP Skills | [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | 官方 Agent Skill 集 | 模組化 API 規範（Core, Timeline, ScrollTrigger, useGSAP, 效能優化） | 網頁動效編排、滾動驅動觸發器與硬體加速渲染規範 | Cursor, Claude Code, Codex, Windsurf, Copilot |
| 6 | PencilPlaybook | [stevembarclay/pencilplaybook](https://github.com/stevembarclay/pencilplaybook) | UI Skill / 認知規則集 | 認知心理學啟發式規則、41 條確定性審計規則、7 階段工作流 | 設計心理學導向的 UI 佈局、降低介面認知負荷 | Pencil.dev, Claude Code |
| 7 | design-md-chrome | [bergside/design-md-chrome](https://github.com/bergside/design-md-chrome) | Chrome / Firefox 擴充功能 | TypeUI 規範逆向工程引擎、DOM 視覺信號萃取器 | 既有網站視覺風格提取、自動產出 DESIGN.md / SKILL.md | Chrome/Firefox 瀏覽器、Claude Code, Codex, Cursor |
| 8 | Claude Design Skill | [jiji262/claude-design-skill](https://github.com/jiji262/claude-design-skill) | 綜合 Agent Skill | 事實驗證優先級、品牌資產捕捉、10 種哲學顧問模式、Tweaks 系統 | 落地頁、簡報、可互動原型與多流派一體化輔助 | Claude Code, claude.ai, Agent Skills CLI |
| 9 | Landing Page Generator | [wesoudshoorn/pirate-skills](https://github.com/wesoudshoorn/pirate-skills) 等開源生態 | CRO Agent Skill | 轉化文案框架（PAS/AIDA/BAB）、單一目標消除跳出路徑、交換測試 | 高轉化率落地頁結構生成、商業定位與板塊動態裝配 | Claude Code, Cursor, OpenClaw |
| 10 | Cinematic UI | [akseolabs-seo/cinematic-ui](https://github.com/akseolabs-seo/cinematic-ui) | 推理導向 Agent Skill | 電影導演工作流（光影邏輯、鏡頭構圖、節奏轉譯為代碼約束） | 敘事化視覺 UI、氛圍感建立與不可替代性版面配置 | Claude Code, Gemini CLI, Antigravity |

## 各工具環境的規範檔案路徑

| 工具環境 | 規範檔案路徑 | 格式與解析特性 | 工程實踐關鍵限制 |
|---|---|---|---|
| Claude Code | `~/.claude/skills/<skill-name>/` | 支援包含 YAML Frontmatter 的完整 `SKILL.md` 與 `references/` 資料夾 | 檔案命名必須維持全大寫 `SKILL.md`，否則在部分環境下將導致技能掃描失效 |
| Cursor | `.cursor/rules/<skill-name>.mdc` | 專用 MDC 格式規則文檔，需符合 Cursor Rules 元數據語法 | 必須手動剝離標準 `SKILL.md` 頂部的 Frontmatter，僅保留規則內文主體 |
| OpenAI Codex CLI | `~/.codex/skills/`（全域）或 `.codex/skills/`（專案） | 標準 `SKILL.md` 規範結構，具備專案級優先覆蓋機制 | 建議將設計規則與專案代碼規範分離，避免大上下文長度下的注意力退化 |
| Windsurf / OpenCode | 依 Agent Skills 規範相容之自訂外掛目錄 | 支援標準 Markdown 規範與目錄型技能包整合 | 需透過 CLI 映射工具轉換為對應環境支援的本機指令結構 |

## 端到端協同流水線（六階段）

| 階段 | 工作流環節 | 核心協同工具 | 關鍵交付產出 |
|---|---|---|---|
| 1 | 樣式逆向工程 | design-md-chrome | 結構化 `DESIGN.md`、`SKILL.md` |
| 2 | 概念與敘事確立 | Cinematic UI、Claude Design Skill | `decisions.md`、`brand-spec.md`、`storyboard.md` |
| 3 | 系統規範與原型 | UI/UX Pro Max、Open Design | 具備 Tokens 結構的原型代碼與多格式產物 |
| 4 | 心理學與轉換架構 | Landing Page Generator、PencilPlaybook | 高轉換率佈局框架、認知優化組件結構 |
| 5 | 審美校準與防 Slop | Hallmark、Taste Skill | 脫離模板感、具備高階審美指紋的生產級代碼 |
| 6 | 物理動效與效能交付 | GSAP Skills | 記憶體安全、維持 60fps 的最終互動代碼庫 |

## 治理注意事項

- 盲目疊加多個技能包會造成上下文窗口膨脹與規則衝突，應在專案層面落實職責分離：套件管理、建置與測試流程收斂於 `AGENTS.md`；視覺基底、間距尺度與設計限制收斂於獨立的 `SKILL.md` 或 `DESIGN.md`。
- 本清單僅作技術參考記錄，實際導入前應個別確認各專案授權條款、維護狀態與與本專案（高雄大使命神學院行事曆 SOP 網站）的適用性。
