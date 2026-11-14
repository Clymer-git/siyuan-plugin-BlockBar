/* =============================================================================
 * SiYuan 移动端快捷工具栏 · 外观代码片段（JS）
 * 按钮：标题 / 列表 / 插入图片或文件 / 引述 / 表格 / 页签 / 公式 / 日期时间 / 模板
 * 面板：标题(H1~H6) · 列表(无序·有序·任务) · 引述(引述块 + 5 个提示块)
 *       表格(表格 + 数据库) · 页签(页签块 + 代码块 + HTML 块 + 思维导图)
 *       公式(公式块 + 行级公式) · 日期时间(日期 YYYY-MM-DD + 时间 HH:MM)
 *
 * ── 配色（v7）─────────────────────────────────────────────────────────
 * 工具条与按钮的颜色、透明度不在 JS 里设置，全部交给 CSS，逐项对齐思源自带
 * 键盘工具条（.keyboard / .keyboard__action / .keyboard__split）：
 *   底色 --b3-theme-background；顶线 --b3-theme-surface-lighter
 *   图标色 --b3-theme-on-surface；按下 --b3-list-hover；不可用 opacity .38
 * JS 只写 --sy-mb-offset / --sy-mb-safe 等几何变量与 data-sy-mb-mode 探针。
 *
 * ── 出现时机（v4）────────────────────────────────────────────────────────
 * 仅当软键盘打开时出现，且精确叠在思源自带键盘工具条（#keyboardToolbar）上方：
 *     · 包装 window.showKeyboardToolbar / hideKeyboardToolbar（Android 原生层调用）
 *     · 监听官方派发的 siyuan-mobile-keyboard-change（detail=true/false）
 *     · 监听 siyuan-mobile-keyboard-hiding（Android SDK32+ 收起前派发）
 *     · 视口高度启发式兜底（innerHeight 回落到最大值即视为键盘收起）
 * 键盘收起后本工具条自动隐藏；思源斜杠工具面板展开时（键盘工具条变高）自动让位。
 *
 * ── 写入通道（v4 防崩溃的关键）──────────────────────────────────────────
 * 所有改变块结构的操作（任务列表 / 表格 / 图片 / 模板内容）一律走思源官方
 * 前端通道 protyle.hint.fill(value, protyle, false) —— 与移动端键盘工具条
 * 「斜杠菜单」点击同一函数（app/src/mobile/util/keyboardToolbar.ts:1284）、
 * 同一套本地 DOM 修改 + WebSocket 事务（hint/index.ts #fill），不经过
 * /api/block/updateBlock 与 /api/block/insertBlock。
 * 原因：这两个 HTTP API 处理「段落 → NodeList」「列表项插入」等结构性变更时
 * 会让内核拿到非法块树，触发 transaction panic（nil pointer dereference）。
 * 唯一保留的 HTTP 写入是「叶子块→叶子块」的安全更新：
 *     · 段落/标题互转（updateBlock dom / markdown，v1~v3 验证稳定）
 *     · 空段落 → 图片段落（updateBlock markdown）
 *
 * ── 图标 ────────────────────────────────────────────────────────────────
 * 全部复用思源自带 SVG symbol（与官方斜杠菜单同源，见 keyboardToolbar.ts
 * 的 renderSlashMenu / getSlashItem）：
 *     iconH1 ~ iconH6（标题面板）/ iconList（列表面板按钮）
 *     iconDownload —— 官方「插入资产」（图片或文件）用的就是它
 *     iconCheck（任务列表）/ iconList（无序）/ iconOrderedList（有序）
 *     iconQuote（引述）/ iconTable（表格）/ iconDatabase（数据库）
 *     iconTabs（页签）/ iconCode（代码块）/ iconHTML5（HTML 块）
 *     iconMath（公式块·行级公式）
 *     iconMindmap（思维导图）/ iconMarkdown（模板）
 * 提示块统一用思源内置 symbol iconCallout（官方块菜单插入提示块同款，
 * 见 editor/getIcon.ts 的 NodeCallout → iconCallout），
 * 类型名沿用官方 --b3-callout-* 配色（keyboardToolbar.ts:403-407）。
 * symbol 异步注入，做存在性探测 + 内置绘制图标回退 + 注入后自动重刷。
 *
 * ── v9 性能 ────────────────────────────────────────────────────────────
 * 运行时开销优化（功能与交互不变）：
 * · 底栏全量扫描（遍历 body 全部元素逐个读 rect）改为「脏标记 + 最小间隔」
 *   节流：DOM 变化只标脏，距上次扫描 ≥ CONFIG.autoScanMinMs（默认 2s）才
 *   重扫；键盘打开 / 屏幕旋转 / 调试 refresh() 强制立即重扫。打字期间扫描
 *   频率从每次测量（~60ms 一次）降到 ~2s 一次。
 * · 扫描再分两层：浅层（已知选择器 + body 直接子元素，十几个节点）按
 *   autoScanMinMs 跑；深层（全树 querySelectorAll("*")，大文档上几千个节点）
 *   按 CONFIG.deepScanMinMs（默认 8s）单独放宽，两层结果取更贴底的那个。
 * · 软键盘未打开（且未启用 contentPadding）时跳过底栏测量与变量写入，
 *   MutationObserver 在该状态直接返回 —— 阅读时后台开销归零。
 * · CSS 变量 / z-index 仅在值变化时写入；键盘工具条 rect 只读一次并透传；
 *   inEditor() 缓存 .protyle-wysiwyg；MutationObserver 不再每批次同步读几何。
 * · --sy-mb-stack 只在开启 contentPadding 时才写（它定义在 :root 上，
 *   改动会让整棵树做一次样式失效）。
 * · dialogOpen() 的全树 querySelector 加 300ms TTL 缓存；
 *   selectionchange 用 rAF 合并到每帧最多一次（打字时原本每键触发）。
 * · 扫描内 consider() 复用调用方已取到的 computed style，避免重复
 *   getComputedStyle。
 *
 * ── v8.4（面板双列）─────────────────────────────────────────────────────
 * · 条目数 > 3 行的面板自动改双列（标题 6 项 / 引述 6 项 / 页签 4 项）
 *
 * ── v10（日期时间）──────────────────────────────────────────────────────
 * · 思维导图并入页签面板（HTML 块之后），原按钮位改为「日期时间」面板
 * · 日期 / 时间滚轮选择器：取消 + 显示区（日期带星期，滚动实时跟随）+ 插入
 *   分钟按 CONFIG.timeStepMin（默认 10）分一档；年份范围 ± CONFIG.dateYearSpan
 * · 纯文本写入走 document.execCommand("insertText")（思源自家同款），
 *   不改块结构、不碰 HTTP 块 API
 *
 * ── v10.2（圆柱滚轮）────────────────────────────────────────────────────
 * · 滚轮条目按与选中带的行距做 rotateX / 轻缩放 / 淡出，类 iOS 闹钟滚轮；
 *   滚动时 rAF 每帧重算，松手回吸后自然归位；stage 上下加渐隐遮罩
 *
 * ── 底栏避让 ────────────────────────────────────────────────────────────
 * #keyboardToolbar（键盘工具条）与 #mobileBottomBar（底栏悬浮条）的几何
 * 全部实测（getBoundingClientRect），高度写入 --sy-mb-offset，不写死。
 * ========================================================================== */

/* 由 siyuan-plugin-mobile-toolbar 插件打包：模块作用域即隔离，不再用 IIFE + 全局锁。 */
import {
    SY_ICON, STYLE_KINDS, styleGlyph, BLOCK_ICONS, FALLBACK_ICON, LINE_ATTRS,
    hasSymbol, clearSymbolCache, syIcon, lineIcon, iconHTML,
} from "../adapters/icons";
import {createTableCaret} from "./table-caret";
import {InsertDiagnostics} from "./insert-diagnostics";

const MobileToolbar = (function () {
    "use strict";

    let destroyed = false;      // destroy() 之后不再重新挂钩原生函数
    let mo = null;              // MutationObserver 句柄（destroy 时 disconnect）
    let lastNativeMenuOpen = false;  // v0.8.49：上一次 native .b3-menu 开合状态（用于精准驱动可见性）
    const intervals = [];       // 所有 setInterval 句柄（destroy 时清理）

    /* ======================================================== 配置 ========= */
    /* 工具条「可见按钮数」上限，固定 9。
       9 个正好铺满一行（与系统键盘工具条一致）；超过 9 个不压缩、不丢弃，
       改为横向滑动查看后面的按钮（实现见 updateVisible / updateOverflow）。 */
    const MAX_VISIBLE = 9;

    /* 与思源 Constants.ZWSP 一致的零宽空格 —— 官方斜杠菜单用它做参数分隔
       （keyboardToolbar.ts:371-384 / hint/index.ts:786-844）。 */
    const ZWSP = "\u200b";
    const TASK_PREFIX = "- [ ] ";

    const CONFIG = {
        // 强制在任意环境启用（调试用）。默认只在移动端启用。
        forceEnable: false,
        // 平板上也显示（思源平板端走桌面布局，一般不需要）
        enableOnTablet: false,
        // 仅在文档编辑界面显示；离开编辑器（文件树/大纲/设置）自动收起
        showOnlyInEditor: true,
        // 打开思源对话框时隐藏底栏
        hideOnDialog: true,
        // 思源键盘工具条的「斜杠工具面板」展开（高度 > utilOpenPx）时让位隐藏
        hideWhenUtilOpen: true,
        utilOpenPx: 90,
        // 自动探测「贴底固定条」（不依赖选择器，兜底方案）
        autoDetectBottomBars: true,
        // 底栏扫描（已知选择器 + 全量探测）的最小重扫间隔（ms）。
        // DOM 变化只标记「脏」，到达间隔才真正重扫；键盘打开 / 旋转 / 调试
        // refresh() 会强制立即重扫。置 0 可恢复「每次测量都全量扫」旧行为
        autoScanMinMs: 2000,
        // 深扫描（遍历 body 全部元素）的最小间隔（ms）。浅扫描只走 body 的
        // 直接子元素（十几个节点），开销可忽略；深扫描才是大头，单独放宽到 8s。
        // 置 0 = 每次浅扫描都顺带深扫一次（等同 v8 行为）
        deepScanMinMs: 8000,
        // v0.8.92：等待原生键盘工具条锚点的兜底超时（ms）。
        // 正常路径由 showKeyboardToolbar() hook 立即触发，几乎不会走到这里；
        // 仅用于「旧版本思源 / 用户隐藏了原生工具条」时避免快捷工具条永不出现。
        showAnchorTimeoutMs: 1000,
        // 已知原生底栏选择器（自动探测之外的补充）
        nativeBarSelectors: [
            "#keyboardToolbar",
            "#mobileBottomBar", ".mobile-bottom-bar"
        ],
        // 手动指定安全区高度（px）。0 = 使用 env(safe-area-inset-bottom)
        safeAreaBottomPx: 0,
        // 长按阈值（ms）——图片按钮长按插入任意文件
        longPressMs: 480,
        // 底部面板：按住顶部小横条下滑多少 px 即关闭（快速甩动 24px 内也算）
        sheetDragClosePx: 64,
        // 面板列数：条目数超过 sheetSingleMaxRows 时改用多列（置 1 = 始终单列）
        sheetColumns: 2,
        // 单列排布下最多保留几行；条目数超过这个值才切到 sheetColumns 列
        sheetSingleMaxRows: 3,
        // 插入块后自动把光标移到新块末尾
        focusAfterInsert: true,
        // 执行工具条动作后「守住键盘」：插入是异步的（hint.fill 之后思源还要走一次
        // 事务回写并重渲染整块 DOM），期间 contenteditable 会短暂失去 DOM 焦点，
        // 原生层（Android / 鸿蒙）据此收起软键盘。此开关在动作后的短暂窗口内
        // 复查焦点、必要时原样抢回光标并重申一次软键盘。置 false 可关掉。
        keepKeyboard: true,
        // 为正文底部补充 padding（默认关；正文被挡时置 true，见 CSS 中 body.sy-mb-pad）
        contentPadding: false,
        // 标题面板提供的级别（思源支持 H1~H6）
        headingLevels: [1, 2, 3, 4, 5, 6],
        // 优先使用思源自带 symbol；关闭则直接用内置绘制图标
        useSiyuanIcons: true,
        // v0.8.16：工具栏末尾是否显示「设置入口」齿轮按钮（见 buildButtonItems 末尾）。
        // v0.8.17 起齿轮就是 bar 滚动流里最后一个普通按钮：一同等分、一同横滑，
        // 按钮铺满时向左滑到底才看到它；不改动用户配置的按钮顺序。
        settingsEntry: false,
        // 官方斜杠菜单同款模板值（{C} = Lute.Caret 光标位）
        tableSlash: "| {C} |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |",
        // 页签块（::: tabs）
        tabsSlash: "::: tabs\n@tab\n\n{C}\n\n@tab\n\n:::\n",
        // 思维导图 = 列表块 + IAL 属性（Constants.CUSTOM_SY_LIST_MINDMAP）
        mindmapSlash: '- {C}\n{: custom-sy-list-mindmap="1"}',
        // 引述块："> " + 光标
        quoteSlash: "> {C}",
        // 代码块：官方斜杠值就是 "```"，hint/index.ts 会补上语言与光标再做高亮
        codeSlash: "```",
        // HTML 块：官方斜杠值就是 "<div>"（keyboardToolbar.ts:412）；
        // hint/index.ts 对 "<div>" 有特判，直接生成 NodeHTMLBlock 并拉起官方渲染
        htmlSlash: "<div>",
        // 公式块：官方斜杠值 "$$"（hint/index.ts 对 "$$" 有 showRender 特判）
        mathSlash: "$$",
        // 数据库：官方斜杠菜单同款空 AV 块（keyboardToolbar.ts:377）
        databaseSlash: '<div data-type="NodeAttributeView" data-av-type="table"></div>',
        // 提示块（GFM alert）：{T} = NOTE/TIP/IMPORTANT/WARNING/CAUTION，{C} = 光标位
        calloutSlash: "> [!{T}]\n> {C}",
        // 资源上传目录（相对 data/）
        assetsDirPath: "/assets/",
        // 模板目录（相对工作区 data/），仅在无法调用思源模板面板时使用
        templatesDir: "/data/templates",
        // 模板递归扫描层数
        templatesDepth: 1,
        // 工具条图标「可见上限」（v0.3）。固定 9 个：与系统键盘工具条一致。
        // 9 个铺满整行；超过 9 个的按钮不压缩、也不丢弃，改为横向滑动查看。
        maxIcons: MAX_VISIBLE,
        // 日期滚轮的年份范围：当前年 ± dateYearSpan
        dateYearSpan: 10,
        // 时间滚轮的分钟步长（分钟）：10 → 00 / 10 / 20 / 30 / 40 / 50
        timeStepMin: 10,
        // 自定义按钮列表（v0.2）。null = 用内置默认 DEFAULT_BUTTONS，行为与旧版完全一致
        buttons: null,
        /* ---------------------------------------------- 官方斜杠值（插入组） --------
           逐字抄自 app/src/mobile/util/keyboardToolbar.ts:369-431（移动端键盘工具条的
           「斜杠块面板」），也就是截图里那一整块「块功能面板」。这些值交给
           protyle.hint.fill(value, protyle, false) 后由 hint/index.ts 分派：
             · ZWSP 系列 → 打开模板面板 / 挂件面板 / 资源菜单 / 新建文档 / AI 等专用面板
             · "(( " 与 "{{" → 把 hint 切到引用 / 嵌入模式（调用后不能还原 splitChar）
             · "emoji"   → 打开官方表情面板
             · 其余      → 走通用块 DOM 插入分支（含 "```" "$$" "<div>" "---" 的特判）
           —— 新增项（0.5.0）------------------------------------------------ */
        // 模板 / 挂件 / 资源（官方斜杠菜单第一行）
        templateSlash: ZWSP,
        widgetSlash: ZWSP + 1,
        assetsSlash: ZWSP + 2,
        // 引用 / 嵌入块（keepHintSplit：调用后保留 (( / {{ 模式，否则一输入就跳回斜杠菜单）
        refSlash: "((",
        embedSlash: "{{",
        // AI 编写 / 新建子文档并引用
        aiWritingSlash: ZWSP + 5,
        newSubDocRefSlash: ZWSP + 6,
        // 插图链接类（keyboardToolbar.ts:385-389）
        iframeSlash: '<iframe sandbox="allow-forms allow-presentation allow-same-origin ' +
            'allow-scripts allow-modals allow-popups allow-storage-access-by-user-activation" ' +
            'src="" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
        imgUrlSlash: "![]()",
        videoUrlSlash: '<video controls="controls" src=""></video>',
        audioUrlSlash: '<audio controls="controls" src=""></audio>',
        emojiSlash: "emoji",
        // 分割线（keyboardToolbar.ts:410）
        lineSlash: "---",
        // 图表语言（keyboardToolbar.ts:416-422）：全部是「代码块 + 语言」，
        // hint/index.ts:1047 命中 ` ``` ` 分支后由 processRender 拉起对应渲染器
        staffSlash: "```abc\n```",
        chartSlash: "```echarts\n```",
        flowchartSlash: "```flowchart\n```",
        graphvizSlash: "```graphviz\n```",
        mermaidSlash: "```mermaid\n```",
        umlSlash: "```plantuml\n```",
        // 内置样式（keyboardToolbar.ts:426-430）：hint/index.ts:858 直接把 ZWSP 后面的
        // 声明写进当前块的 style 属性；{K} = info / success / warning / error
        styleSlash: "style" + ZWSP +
            "color: var(--b3-card-{K}-color);background-color: var(--b3-card-{K}-background);",
        clearStyleSlash: "style" + ZWSP
    };

    /* 提示块（GFM alert）的类型 / 配色变量 / 显示名，逐项抄自
       keyboardToolbar.ts:403-407 与 protyle/wysiwyg/callout.ts:151-159。
       图标统一用思源内置 symbol iconCallout（官方块菜单插入提示块同款）。 */
    const CALLOUTS = [
        { type: "NOTE",      color: "var(--b3-callout-note)",      name: "Note" },
        { type: "TIP",       color: "var(--b3-callout-tip)",       name: "Tip" },
        { type: "IMPORTANT", color: "var(--b3-callout-important)", name: "Important" },
        { type: "WARNING",   color: "var(--b3-callout-warning)",   name: "Warning" },
        { type: "CAUTION",   color: "var(--b3-callout-caution)",   name: "Caution" }
    ];


    /* 取思源界面语言文案，取不到时用中文兜底 */
    function lang(key, fb) {
        try {
            const dict = window.siyuan && window.siyuan.languages;
            return (dict && dict[key]) || fb;
        } catch (e) { return fb; }
    }

    /* ==================================================== 状态 ============ */
    let bar = null;
    let sheet = null;
    /* v0.8.16：工具栏末尾「设置入口」齿轮按钮的标题（按钮本体在 buildButtonItems 末尾追加） */
    const SETTINGS_ENTRY_TITLE = "工具栏设置";
    let lastBlockId = null;
    let touchMode = false;
    let forceHidden = false;
    let modeProbe = "";          // 上次参与亮度探测的背景色值
    let measureTimers = [];
    let pendingMeasure = new Map();   // delay -> timer，v0.8.87 合并去重
    const MAX_PENDING_MEASURES = 8;
    let lastMeasure = 0;
    let deepScanTimer: any = 0;        // 首帧之后再补深扫描
    let kbOpenedAt = 0;               // 键盘打开时刻，用于首帧深扫保护
    /* v0.8.88：一次物理键盘弹出里原生会连续派发多个状态信号，实测日志每次
       激活出现两对 perf.show.begin/end（间隔 200~240ms），即 true→false→true。
       false 统一走 200ms 确认窗口，窗口内恢复 true 就撤销；明确的
       keyboard-hiding 事件走 immediate 立即隐藏。 */
    let kbHideTimer: any = 0;
    const KB_HIDE_CONFIRM_MS = 200;
    const KB_SETTLE_MS = 400;         // 键盘打开后的视口渐变期
    /* v0.8.92：等待原生键盘工具条出现再叠加。
       安卓 Utils.showKeyboardAndToolbar() 在键盘可见后 postDelayed 288ms
       才调 showKeyboardToolbar()；AndroidBug5497Workaround 的
       setOnApplyWindowInsetsListener 却在键盘动画前就把 WebView 按目标
       高度布局。中间这段空窗里 visualViewport 已缩小、#keyboardToolbar
       仍是 fn__none —— 旧逻辑此刻用旧 offset 显示，等原生工具条就位
       再从屏幕底部跳到键盘上方，即用户看到的「瞬间移位」。 */
    let pendingShow = false;
    let showAnchorTimer: any = 0;
    let showAnchorAt = 0;
    let kbSignal = null;         // null = 未知；true/false 来自官方函数与事件
    let maxViewportH = 0;        // 键盘收起时的视口高度基准
    let lastBlockIdAt = 0;
    let wysCache = null;         // .protyle-wysiwyg 缓存，断链后自动重查
    const origToolbarFns = {};

    /* v9 底栏扫描缓存：全树扫描开销大，改为「脏标记 + 最小间隔」节流 */
    let scanDirty = true;        // DOM 已变化，扫描结果待刷新
    let scanForce = false;       // 强制立即重扫（键盘打开 / 旋转 / 调试）
    let scanAt = 0;              // 上次浅扫描时间戳
    let deepScanAt = 0;          // 上次深扫描时间戳
    /* 扫描结果分两层缓存：浅层（已知选择器 + body 直接子元素）/ 深层（全树）。
       只缓存命中的元素，每次测量重读一次它的 rect（1 次读取，成本可忽略），
       这样元素被移除 / 变形后不会按旧值继续避让。 */
    let scanHitS = null;
    let scanHitD = null;
    /* 对话框探测缓存：querySelector 是全树查询，加 300ms TTL */
    let dialogHit = false, dialogAt = 0;

    /* ==================================================== 环境判断 ========== */
    const isAndroidApp = typeof window.JSAndroid !== "undefined";      // MainActivity 注入
    const isSiyuanMobile = !!(window.siyuan && window.siyuan.mobile);
    const uaMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent || "");

    function isMobileEnv() {
        if (CONFIG.forceEnable) return true;
        if (!isAndroidApp && !isSiyuanMobile && !uaMobile) return false;
        const tablet = Math.min(window.screen.width, window.screen.height) >= 600 ||
                       window.matchMedia("(min-width: 768px)").matches;
        if (tablet && !CONFIG.enableOnTablet && !isAndroidApp) return false;
        return true;
    }

    /* ==================================================== 小工具 =========== */
    function ce(tag, cls?, html?) {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (html != null) el.innerHTML = html;
        return el;
    }

    function sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    function viewportH() {
        return (window.visualViewport && window.visualViewport.height) || window.innerHeight;
    }

    function viewportW() {
        return (window.visualViewport && window.visualViewport.width) || window.innerWidth;
    }

    /* ---------------------------------------------------- 内核 API -------- */
    async function api(url, payload) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload || {})
        });
        const json = await res.json();
        if (json.code !== 0) {
            throw new Error(json.msg || url);
        }
        return json.data;
    }

    function toast(msg, isErr?) {
        try {
            fetch(isErr ? "/api/notification/pushErrMsg" : "/api/notification/pushMsg", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ msg: String(msg), timeout: 2600 })
            }).catch(() => {});
        } catch (e) { /* ignore */ }
    }

    /* ============================================ protyle / 官方写入通道 == */
    function getProtyle() {
        try {
            const m = window.siyuan && window.siyuan.mobile;
            if (m && m.editor && m.editor.protyle) return m.editor.protyle;
        } catch (e) { /* ignore */ }
        return null;
    }

    /* ── 光标真正所在的那个 Protyle ────────────────────────────────────────
       思源 3.8.4 起，表格单元格由独立的 lite Protyle 就地编辑。它的块事务只在
       单元格内应用并交回宿主表格；文档 Protyle 则把事务直接发给内核。若把单元格
       内部块当作文档编辑器的 previousID，内核无法定位，块便会落到表格下方。

       插件入口在 Protyle.prototype.init **完成后**登记实例，再按 wysiwyg.element
       反查。getAllEditor() 不含单元格 lite 实例，只保留为其它编辑器的兜底。
       行级公式不走 hint.fill，但 v0.8.83 起也统一由 protyleForInsertion()
       选择目标编辑器，避免在单元格里把行内标记事务打给文档 Protyle。 */
    const protyleByWys = new Map();     // wysiwyg.element -> protyle
    /* 与思源 protyle/lite/mobileToolbar.ts 的 activeEditor 对齐：真实编辑器的
       激活状态不随 TABLE 焦点或 TH 假选区立即丢失。工具条按下时再保存一份
       Protyle + Range，供 touchend 的块插入使用。 */
    let activeProtyle = null;
    let pressInsertionContext = null;

    function connectedProtyle(protyle) {
        try {
            return !!(protyle && protyle.wysiwyg && protyle.wysiwyg.element &&
                protyle.wysiwyg.element.isConnected &&
                (!protyle.element || !protyle.element.closest || !protyle.element.closest("[inert]")));
        } catch (e) {
            return false;
        }
    }

    function rangeBelongs(protyle, range) {
        try {
            const root = protyle && protyle.wysiwyg && protyle.wysiwyg.element;
            return !!(root && range && range.startContainer && range.endContainer &&
                range.startContainer.isConnected && range.endContainer.isConnected &&
                root.contains(range.startContainer) && root.contains(range.endContainer));
        } catch (e) {
            return false;
        }
    }

    function cloneRange(range) {
        try { return range && typeof range.cloneRange === "function" ? range.cloneRange() : range; }
        catch (e) { return null; }
    }

    function currentSelectionRange() {
        try {
            const sel = window.getSelection();
            return sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        } catch (e) {
            return null;
        }
    }

    function tableReanchorNode(anchor) {
        const probe = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
        if (!probe || !probe.closest) return false;
        /* lite 内部的真光标不是表格重锚；除此之外，落在 NodeTable 内的 TH/TABLE
           等位置只代表外层表格获得焦点，不能据此判定用户要退出单元格。 */
        return !probe.closest(".table__cell-editor") &&
            !!probe.closest('[data-type="NodeTable"][data-node-id]');
    }

    function activateProtyleFromTarget(target, eventType) {
        try {
            const el = target && (target.nodeType === 1 ? target : target.parentElement);
            if (!el || !el.closest) return null;
            /* 插件的键盘守卫可能把焦点临时放到 TABLE / wysiwyg 根。原生编辑器
               会把这当成激活文档，但在这里它是已知的守卫副作用，不能覆盖 lite。
               真实用户 pointerdown 表格仍走下面正常激活，不受此限制。 */
            if (eventType === "focusin" &&
                (TABLE_CONTAINER_TAGS[el.tagName] ||
                    (el.classList && el.classList.contains("protyle-wysiwyg")))) return null;
            const root = el.closest(".protyle-wysiwyg");
            const protyle = root && protyleByWys.get(root);
            if (!connectedProtyle(protyle)) return null;
            if (activeProtyle !== protyle) {
                activeProtyle = protyle;
                pressInsertionContext = null;
                InsertDiagnostics.trace("editor.activate", {
                    eventType: eventType,
                    protyle: InsertDiagnostics.protyle(protyle)
                });
            }
            return protyle;
        } catch (e) {
            return null;
        }
    }

    function rememberActiveRange() {
        const protyle = connectedProtyle(activeProtyle) ? activeProtyle : null;
        const range = currentSelectionRange();
        if (!protyle || !rangeBelongs(protyle, range) || !protyle.toolbar) return false;
        protyle.toolbar.range = cloneRange(range);
        return true;
    }

    /* 必须在 armOnPress() 之前调用。之后的焦点守卫/原生 blur 可能把选区重锚
       到 TH，但这里保存的仍是用户刚刚实际编辑的编辑器与 Range。 */
    function captureInsertionContext(source) {
        const base = getProtyle();
        const anchor = caretAnchorNode();
        const caret = caretProtyle();
        let target = caret || base;
        if (tableReanchorNode(anchor) && connectedProtyle(activeProtyle) && activeProtyle !== base) {
            target = activeProtyle;
        } else if (connectedProtyle(activeProtyle) && activeProtyle !== base && anchor) {
            /* 当前仍在 lite 内时，active 必须确实包含锚点，避免把上一格带到新格。 */
            const inCell = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
            if (inCell && inCell.closest && inCell.closest(".table__cell-editor") &&
                activeProtyle.wysiwyg.element.contains(anchor)) target = activeProtyle;
        }
        if (!connectedProtyle(target)) target = base;
        let range = null;
        const candidates = [currentSelectionRange(), target && target.toolbar && target.toolbar.range, lastRange];
        for (let i = 0; i < candidates.length; i++) {
            if (rangeBelongs(target, candidates[i])) { range = cloneRange(candidates[i]); break; }
        }
        if (target && target.toolbar && range) target.toolbar.range = cloneRange(range);
        pressInsertionContext = target ? {protyle: target, range: range, at: Date.now()} : null;
        InsertDiagnostics.trace("press.capture", {
            source: source,
            target: InsertDiagnostics.protyle(target),
            rangeReady: !!range,
            selection: InsertDiagnostics.selection()
        });
    }

    /* ── 保住单元格 lite 编辑器（v0.8.82：3.8.9 真机日志 + 实装 bundle 实证）──
       思源 protyle/render/tableCellRichEditor.ts 在单元格编辑期间注册了
       **document 捕获阶段**的 pointerdown：

           if (belongsToEditor(event.target)) return;   // 放行
           ... finish();                                // 否则立刻销毁编辑器

       belongsToEditor() 只放行 host / hintElement / lite toolbar，以及
           target.closest("#keyboardToolbar, #commonMenu, .b3-dialog, ...")
       原生「＋」块面板挂在 #keyboardToolbar 内，点它不会触发 finish()；
       本插件工具条是 body 下的独立浮层 #syMobileToolbar（不在白名单），
       所以手指刚按下，finish() 就先执行：fragment.destroy() + host.remove()。
       日志 0007 里 active 的 lite 已经是 connected:false，而 press.capture
       只能拿到文档编辑器 —— 这就是 v0.8.77~v0.8.81 四次修复都无效的原因：
       实例登记、activeEditor、Range 保存全都没错，只是编辑器在按下瞬间
       已经被思源拆掉了，fillCommand 根本没有可投的实例。

       做法：在 window 捕获阶段（一定早于思源的 document 捕获监听）给本次
       按下的插件浮层临时加 .b3-dialog 标记，让原生代码判定「仍属于单元格
       编辑器」从而跳过 finish()；本次事件派发结束后立刻移除。标记只存活
       一次事件派发，CSS 里已用 ID+class 抵消 .b3-dialog 的顶层布局属性，
       不改变任何事件流程、不拦截任何其它监听器。 */
    const NATIVE_CELL_OWNER_MARK = "b3-dialog";
    const NATIVE_CELL_UI_SELECTOR =
        "#syMobileToolbar, #syMobileToolbarSheet, #syMobileToolbarPicker";
    let nativeCellOwnerRoot = null;
    let nativeCellOwnerTimer: any = 0;

    function releaseNativeCellOwner() {
        if (nativeCellOwnerTimer) {
            clearTimeout(nativeCellOwnerTimer);
            nativeCellOwnerTimer = 0;
        }
        if (nativeCellOwnerRoot) {
            nativeCellOwnerRoot.classList.remove(NATIVE_CELL_OWNER_MARK);
            nativeCellOwnerRoot = null;
        }
    }

    function markNativeCellOwner(ev) {
        if (!bar || destroyed) return;
        const target = ev && ev.target;
        if (!target || !target.closest) return;
        const root = target.closest(NATIVE_CELL_UI_SELECTOR);
        if (!root) return;
        releaseNativeCellOwner();
        root.classList.add(NATIVE_CELL_OWNER_MARK);
        nativeCellOwnerRoot = root;
        InsertDiagnostics.trace("cell.guard.mark", {
            root: InsertDiagnostics.node(root),
            selection: InsertDiagnostics.selection(),
            active: InsertDiagnostics.protyle(activeProtyle),
            registrySize: protyleByWys.size
        });
        /* setTimeout(0) 而不是微任务：微任务可能在同一个事件派发的两个监听器
           之间就执行，那样标记会在原生 belongsToEditor() 读到之前被抹掉。 */
        nativeCellOwnerTimer = setTimeout(releaseNativeCellOwner, 0);
    }

    function registerProtyle(protyle) {
        try {
            if (!protyle || !protyle.wysiwyg || !protyle.wysiwyg.element) {
                InsertDiagnostics.trace("register.skip", {
                    reason: "wysiwyg-not-ready",
                    hasProtyle: !!protyle,
                    lite: !!(protyle && protyle.lite)
                });
                return;
            }
            const node = protyle.wysiwyg.element;
            protyleByWys.set(node, protyle);
            InsertDiagnostics.trace("register.ok", {
                protyle: InsertDiagnostics.protyle(protyle),
                registrySize: protyleByWys.size
            });
            /* 防泄漏：登记表超过 64 条时清掉已脱离文档的（切文档 / 关单元格） */
            if (protyleByWys.size > 64) {
                protyleByWys.forEach((p, el) => {
                    if (!el || el.isConnected === false) protyleByWys.delete(el);
                });
            }
        } catch (e) {
            InsertDiagnostics.error("register.error", e);
        }
    }

    /* getAllEditor() 的兜底通道（老版本 / 其它场景）：它返回的可能是 Editor 模型
       （带 .protyle），也可能直接是 Protyle，这里两种都认。 */
    let editorsProvider = null;
    function setEditorsProvider(fn) {
        editorsProvider = typeof fn === "function" ? fn : null;
    }

    /* getAllEditor() 在 3.8.x 返回的是带 .protyle 的 Editor 模型，
       老版本 / 直接传 Protyle 的场合也一并兼容 */
    function protyleOfEditor(entry) {
        if (!entry) return null;
        if (entry.wysiwyg && entry.wysiwyg.element) return entry;
        if (entry.protyle && entry.protyle.wysiwyg && entry.protyle.wysiwyg.element) return entry.protyle;
        return null;
    }

    /* 光标锚点：优先当前 selection；工具条自己的浮层（公式面板等）打开时
       selection 可能被收走，退回文档 protyle 记着的 range —— 两条都不可用才返回 null。 */
    function caretAnchorNode() {
        try {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
                const node = sel.getRangeAt(0).startContainer;
                const el = node && (node.nodeType === 1 ? node : node.parentElement);
                if (el && el.isConnected && el.closest && el.closest(".protyle-wysiwyg")) return node;
            }
        } catch (e) { /* ignore */ }
        const base = getProtyle();
        const r = base && base.toolbar ? base.toolbar.range : null;
        if (r && r.startContainer && r.startContainer.isConnected) return r.startContainer;
        return null;
    }

    /* 这个 protyle 能不能承接 hint.fill：带 wysiwyg / toolbar / hint.fill 才算数，
       文档编辑器自己（base）不参与比较，避免把自己「换」成自己。 */
    function usableProtyle(p, base) {
        return !!p && p !== base && p.wysiwyg && p.wysiwyg.element &&
            p.toolbar && p.hint && typeof p.hint.fill === "function";
    }

    /* 光标落在 lite（单元格 / 嵌入块）编辑器里时返回那个 Protyle，否则返回文档 Protyle。
       顺序：① 锚点最近的 .protyle-wysiwyg 直接查登记表（命中即返回，主路径）
             ② 登记表里挑最内层包含锚点的实例（结构差异时的兜底）
             ③ getAllEditor()（老版本 / 未登记场景）
             ④ 都不成立 → 文档 Protyle，行为与改动前完全一致。 */
    function caretProtyle() {
        const base = getProtyle();
        try {
            const anchor = caretAnchorNode();
            if (!anchor) return base;
            const probe = anchor.nodeType === 1 ? anchor : anchor.parentElement;
            if (!probe || !probe.closest) return base;
            /* 光标就在文档编辑器自己的 .protyle 里（最常见的段落编辑）→ 一律不换人 */
            const hostProtyleEl = probe.closest(".protyle");
            if (base && base.element && hostProtyleEl && hostProtyleEl === base.element) return base;

            /* ① 主路径：最近的 .protyle-wysiwyg 就是光标真正归属的那一层 */
            const nearestWys = probe.closest(".protyle-wysiwyg");
            const baseWys = base && base.wysiwyg ? base.wysiwyg.element : null;
            if (nearestWys && nearestWys !== baseWys) {
                const hit = protyleByWys.get(nearestWys);
                if (usableProtyle(hit, base)) return hit;
            }

            /* ② 兜底：登记表里最内层、包含锚点的实例（单元格 wysiwyg 一定是最内层那个） */
            let best = null;
            let bestDepth = -1;
            protyleByWys.forEach((p, node) => {
                if (!node || node.isConnected === false || !node.contains(anchor)) return;
                if (!usableProtyle(p, base)) return;
                let depth = 0;
                let cur = node;
                while (cur) { depth++; cur = cur.parentElement; }
                if (depth > bestDepth) { best = p; bestDepth = depth; }
            });
            if (best) return best;

            /* ③ getAllEditor() 兜底（旧版本 / 插件未注入登记钩子时） */
            if (!editorsProvider) return base;
            let editors = null;
            try { editors = editorsProvider(); } catch (e) { return base; }
            if (!editors || !editors.length) return base;
            best = null;
            bestDepth = -1;
            for (let i = 0; i < editors.length; i++) {
                const p = protyleOfEditor(editors[i]);
                if (!p || !p.wysiwyg || !p.wysiwyg.element.contains(anchor)) continue;
                if (!usableProtyle(p, base)) continue;
                let depth = 0;
                let node = p.wysiwyg.element;
                while (node) { depth++; node = node.parentElement; }
                if (depth > bestDepth) { best = p; bestDepth = depth; }
            }
            return best || base;
        } catch (e) {
            return base;
        }
    }

    /* 所有块插入共用的目标解析，顺序与原生移动工具栏保持一致：
       ① 当前选区仍位于 lite 时直接使用它；② TH/TABLE 重锚时使用按压前/最后激活
       的 lite；③ 普通正文仍使用文档 Protyle。任何 lite 目标无法恢复自己的 Range
       都返回 null，禁止退回文档把块写到表格下方。 */
    function protyleForInsertion() {
        const base = getProtyle();
        const pressed = pressInsertionContext;
        pressInsertionContext = null;
        const anchor = caretAnchorNode();
        const probe = anchor && (anchor.nodeType === 1 ? anchor : anchor.parentElement);
        const inCell = !!(probe && probe.closest &&
            probe.closest('.table__cell-editor, .protyle[data-protyle-lite="true"]'));
        const caret = caretProtyle();
        let target = base;
        let source = "document";
        let preferredRange = null;

        InsertDiagnostics.trace("insert.target.begin", {
            base: InsertDiagnostics.protyle(base),
            selection: InsertDiagnostics.selection(),
            registrySize: protyleByWys.size,
            hasPressContext: !!pressed,
            active: InsertDiagnostics.protyle(activeProtyle)
        });

        if (caret && caret !== base) {
            target = caret;
            source = "caret";
        } else if (tableReanchorNode(anchor)) {
            if (connectedProtyle(pressed && pressed.protyle) && pressed.protyle !== base) {
                target = pressed.protyle;
                source = "press";
            } else if (connectedProtyle(activeProtyle) && activeProtyle !== base) {
                target = activeProtyle;
                source = "active";
            }
        } else if (inCell && connectedProtyle(pressed && pressed.protyle) &&
            pressed.protyle.wysiwyg.element.contains(anchor)) {
            target = pressed.protyle;
            source = "press-cell";
        }

        /* 当前真选区位于 lite，却没能解析到该 lite 时绝不交给文档。
           TH/TABLE 重锚不在这里拦截：那正是 press/active 恢复路径要处理的情况。 */
        if (inCell && target === base) target = null;
        if (target !== base && !connectedProtyle(target)) target = null;
        /* v0.8.82 安全闸：按压时确实抓到过 lite，但插入前它已经被引擎销毁
           （说明原生 finish() 仍被触发，守卫没生效）。此时退回文档 Protyle
           恰恰就是「块插到表格下方」那条错误路径，宁可中止并留下诊断。 */
        if (target === base && pressed && pressed.protyle && pressed.protyle.lite &&
            !connectedProtyle(pressed.protyle) && tableReanchorNode(anchor)) {
            InsertDiagnostics.trace("cell.guard.lost", {
                reason: "lite-destroyed-before-insert",
                pressed: InsertDiagnostics.protyle(pressed.protyle),
                selection: InsertDiagnostics.selection()
            });
            target = null;
        }
        if (pressed && target === pressed.protyle) preferredRange = pressed.range;
        if (target) {
            const ok = ensureRange(target, preferredRange);
            if (!ok && target !== base) target = null;
        }

        if (!target) {
            InsertDiagnostics.trace("insert.target.blocked", {
                reason: inCell || tableReanchorNode(anchor) ? "cell-range-unresolved" : "protyle-unresolved",
                anchor: InsertDiagnostics.node(anchor),
                active: InsertDiagnostics.protyle(activeProtyle),
                registrySize: protyleByWys.size
            });
            return null;
        }
        InsertDiagnostics.trace(target === base ? "insert.target.document" : "insert.target.lite", {
            source: source,
            rangeReady: rangeBelongs(target, target.toolbar && target.toolbar.range),
            active: InsertDiagnostics.protyle(target),
            anchor: InsertDiagnostics.node(anchor)
        });
        return target;
    }

    /* Lute.Caret：lute 会把它渲染成 <wbr>，思源再用 focusByWbr 定位光标 */
    function luteCaret() {
        try {
            if (window.Lute && typeof window.Lute.Caret === "string") return window.Lute.Caret;
        } catch (e) { /* ignore */ }
        return ZWSP;
    }

    function hasCaret(v) {
        const caret = luteCaret();
        return !!caret && String(v == null ? "" : v).indexOf(caret) >= 0;
    }

    /* ── 光标位补齐（v0.8.3 关键修复）────────────────────────────────────────
       思源「插入块」的官方斜杠项，**每一项的值都以 Lute.Caret 结尾**
       （keyboardToolbar.ts:393-430、protyle/hint/extend.ts:87+ 全部如此），
       这不是装饰，是保命用的：

         hint.fill() 在插入时会把当前块整块换掉
         （nodeElement.insertAdjacentHTML("afterend") + 删掉旧块），
         插入完成后，唯一把「光标 + 焦点」接回来的语句是分支末尾那句
         focusByWbr(nodeElement, range)（protyle/hint/index.ts:1075），
         而 focusByWbr（protyle/util/selection.ts:1024）第一件事是
             const wbrElements = element.querySelectorAll("wbr");
             if (wbrElements.length === 0) { return; }   ← 直接返回，什么都不做
         新块里的 <wbr> 正是 Lute.Caret 渲染出来的。

       所以：**值里没有光标位 = 插入后焦点没人接**，document.activeElement 掉回
       body，原生层（Android hideKeyboard / 官方 activeBlur）立刻收键盘；
       我们 200/480ms 那次复查再把键盘叫回来 —— 用户看到的就是
       「键盘先关、再开」这一下闪烁。

       内置动作一直是好的，就因为 slash() 里带了 Lute.Caret；
       而「快捷短语」只有用户自己写了 {C} 才有 —— 没写就掉进这个坑。
       这里补成和官方项完全同构：有 {C} 就尊重它指定的落点，没有就补在末尾。 */
    function ensureCaret(v) {
        const s = String(v == null ? "" : v);
        if (!s || hasCaret(s)) return s;
        const caret = luteCaret();
        /* 收尾是代码围栏时，光标位要放在围栏**里面**（官方代码项就是
           "```" + lang + Caret + "\\n```"，见 hint/index.ts:885）：
           补在围栏后面会多出一个空段落。 */
        const m = /\n[ \t]*```[ \t]*$/.exec(s);
        if (m && m.index > 0) return s.slice(0, m.index) + caret + s.slice(m.index);
        return s + caret;
    }

    function blockEl(id) {
        return id ? document.querySelector('[data-node-id="' + id + '"]') : null;
    }

    function blockIdOf(node) {
        if (!node) return null;
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || !el.closest) return null;
        const b = el.closest("[data-node-id]");
        return b ? b.getAttribute("data-node-id") : null;
    }

    function blockIdFromSelection() {
        const sel = window.getSelection();
        if (sel && sel.rangeCount) {
            return blockIdOf(sel.getRangeAt(0).startContainer);
        }
        return null;
    }

    function getActiveBlockId() {
        const fromFocus = blockIdOf(document.activeElement);
        if (fromFocus) {
            lastBlockId = fromFocus;
            lastBlockIdAt = Date.now();
            return lastBlockId;
        }
        const fromSel = blockIdFromSelection();
        if (fromSel) {
            lastBlockId = fromSel;
            lastBlockIdAt = Date.now();
            return lastBlockId;
        }
        if (lastBlockId && blockEl(lastBlockId)) {
            return lastBlockId;
        }
        const wys = getWys();
        if (wys) {
            const all = wys.querySelectorAll("[data-node-id]");
            if (all.length) {
                lastBlockId = all[all.length - 1].getAttribute("data-node-id");
                lastBlockIdAt = Date.now();
                return lastBlockId;
            }
        }
        return null;
    }

    function getDocId() {
        const p = getProtyle();
        if (p && p.block && p.block.rootID) return p.block.rootID;
        const title = document.querySelector(".protyle-wysiwyg .protyle-title[data-node-id]") ||
                      document.querySelector(".protyle-title[data-node-id]");
        if (title) return title.getAttribute("data-node-id");
        return getActiveBlockId();
    }

    function requireId() {
        const id = getActiveBlockId();
        if (!id) {
            toast("请先把光标放到文档中");
        }
        return id;
    }

    function isBlockEmpty(el) {
        if (!el) return false;
        const ceEl = el.querySelector('[contenteditable="true"]') || el;
        const txt = (ceEl.textContent || "").replace(/[\u200b\s]/g, "");
        return txt === "" || ceEl.innerHTML === "<wbr>" || ceEl.innerHTML === "<br>";
    }

    /* 把 protyle.toolbar.range 恢复到最近编辑过的块末尾（元素必须在当前编辑器内） */
    function restoreRange(protyle) {
        const id = getActiveBlockId();
        if (!id) return false;
        const el = blockEl(id);
        if (!el || !el.isConnected || !protyle.wysiwyg || !protyle.wysiwyg.element ||
            !protyle.wysiwyg.element.contains(el)) return false;
        const ceEl = el.querySelector('[contenteditable="true"]') ||
                     (el.firstElementChild ? el.firstElementChild.querySelector('[contenteditable="true"]') : null);
        if (!ceEl) return false;
        try {
            const range = document.createRange();
            range.selectNodeContents(ceEl);
            range.collapse(false);
            protyle.toolbar.range = range;
            return true;
        } catch (e) {
            return false;
        }
    }

    /* 保证 protyle.toolbar.range 有效且两端都落在**目标**编辑器内。
       与原生 getEditorFocusRange() 相同，不再接受「任意 .protyle-wysiwyg」。
       preferredRange 是工具条按下时保存的真实 Range；当前 selection 已重锚到 TH
       时会自动跳过它，继续使用 lite 自己保存的 toolbar.range。 */
    function ensureRange(protyle, preferredRange?) {
        if (!protyle || !protyle.toolbar) return false;
        const candidates = [preferredRange, currentSelectionRange(), protyle.toolbar.range, lastRange];
        for (let i = 0; i < candidates.length; i++) {
            const range = candidates[i];
            if (!rangeBelongs(protyle, range)) continue;
            protyle.toolbar.range = cloneRange(range) || range;
            return true;
        }
        return restoreRange(protyle);
    }

    /* ================================================== v0.8.25 诊断埋点 ====
       用途：定位「横滑 / 点表格按钮 → 键盘关掉再打开」到底是谁干的。

       埋的三个出口，都来自思源源码：
       ① 原生桥接 JSAndroid/JSHarmony 的 hideKeyboard / showKeyboard
          —— 这是「键盘收起 / 唤起」的唯一最终出口，activeBlur() 就调它
             （mobile/util/keyboardToolbar.ts:735-739）。抓到它就抓到了真凶。
       ② console.warn("activeBlur blocked by lock (remaining: Xms)")
          —— activeBlur 被键盘锁挡住时思源自己打的（keyboardToolbar.ts:731）。
             有这条 = 锁生效；没这条却出现了 ① = 锁断了。
       ③ window resize → 思源判断「窗口变高 = 键盘塌了」且 activeElement 不可输入
          时会直接 activeBlur()（keyboardToolbar.ts:783-808）。横滑若引起高度抖动，
          就是这条在收键盘。

       默认关闭；打开后写环形缓冲，并把关键事件（键盘收 / 开）用 toast 顶到屏幕上，
       方便直接截图。定位到问题后整段删掉即可。 */
    /* v0.8.28 日志实证：焦点掉落后 caretEditable() 会返回 **TABLE[ce]**
       （<table> 元素本身也带 contenteditable）。把焦点放在整张表上后果很坏：
       ① 光标被丢到表格开头；② Android 原生把「输入点换了个地方」当成一次
       收起，键盘照样被收。
       只把「整块容器」排除掉 —— TD / TH **本身就是合法输入点**（思源部分场景
       单元格直接可编辑，测试环境也是），不能一并排除，否则会退化成「找不到输入点、
       干脆不 focus」，比原来更糟。
       ⚠️ 必须放在这里（文件前部）：引擎初始化时 installFocusGuard 就要用到它，
       const 有 TDZ，放在后面会在初始化那一刻抛错（实测 6 条断言挂掉）。 */
    const TABLE_CONTAINER_TAGS = {
        TABLE: 1, TBODY: 1, THEAD: 1, TFOOT: 1, TR: 1,
        COLGROUP: 1, COL: 1, CAPTION: 1
    };

    /* v0.8.29：最近一次见到的输入点。焦点掉的时候常常**连选区一起没了**，
       这时若无这份记忆就彻底救不回来（日志里成片的「续锁失败：找不到可编辑元素」）。
       ⚠️ 必须放在文件前部 —— caretEditable 在引擎初始化期间就会被调用。 */
    let lastEditable = null;
    /* v0.8.35：连「区间」一起记。日志实证（+2877 focusout → +2944 光标在 TH）：
       原生 blur 单元格的同一时刻会把选区**重锚到表格容器开头**，只救焦点不还原
       区间 = 光标永远停在左上第一格，插入/删除行列全打在表头那列。
       与 lastEditable 同源更新（rememberEditable 选区优先），永不单独过期。 */
    let lastRange = null;
    /* 把选区还原到记住的区间。返回 false = 区间已随块重渲染失效（节点被连根换掉），
       调用方改走 placeCaret / table-caret 等兜底。 */
    function restoreLastRange() {
        if (!lastRange) return false;
        try {
            const sc = lastRange.startContainer, ec = lastRange.endContainer;
            if (!sc || !ec || sc.isConnected === false || ec.isConnected === false) return false;
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(lastRange);
            return true;
        } catch (e) { return false; }
    }
    /* caretEditable() 这次是从哪一路找到人的：active / selection / table-caret /
       memory / heuristic / none。只为日志与断言用 —— v0.8.30 就是靠它发现
       「记忆明明有，却走了启发式那条路、结果救回到表头」。 */
    let caretSource = "none";
    /* 主动收键盘（跳设置页那类）之后的这段时间内，焦点守卫一律让路 */
    let focusGuardUntil = 0;
    /* v0.8.85：公式块 / 行级公式插入后的「IME 交接窗口」。
       math-keyboard 的面板是后注入 math-field 的，mathSessionLive() 在面板刚打开
       的几百毫秒里为假；这段时间 BlockBar 的键盘守卫会误判成「没有公式会话」，
       把系统 IME 叫回来与公式键盘层叠。用一个显式窗口补上这段空窗，窗口结束后
       仍回到 mathSessionLive() 的 DOM 硬判据。 */
    const MATH_HANDOFF_MS = 1500;
    let mathHandoffUntil = 0;
    function mathHandoffActive() { return Date.now() < mathHandoffUntil; }
    /* v0.8.36：「用户自己要把键盘收掉」的两个信号 —— 这两种情况下焦点掉落**不许救**，
       否则键盘永远关不掉（v0.8.35 实测：主动折叠键盘被守卫重新拉出来，
       连官方快捷工具栏的收起键都失效）：
       ① lastOutsideTouchAt —— 刚摸过工具条/浮层以外的地方（点段落、点空白、
          点官方工具栏的收起键），随后的 focusout 是这次触摸的意图；
       ② kbHidingAt —— 刚收到 keyboard-hiding / keyboard-change=false（系统返回键、
          原生收起、官方工具条收起），随后的 focusout 是收键盘的副作用，
          不是横滑前那种「无故掉落」。
       两者只在「非保护窗口、没摸工具条」时生效 —— 表格动作 / 横滑期间该怎么救还怎么救。 */
    let lastOutsideTouchAt = 0;
    let kbHidingAt = 0;
    /* v0.8.50：原生层调用 hideKeyboardToolbar(true) 的时刻（APP 自带键盘工具条折叠键、
       系统收键盘回调都走这条 JS 桥）。与 kbHidingAt 同源但更靠前——折叠键可能在派发
       keyboard-hiding 之前就叫它，甚至根本不派发 hiding 事件；而原生层触摸不会经过插件
       的 touchstart 监听（lastOutsideTouchAt 抓不到，v0.8.47 门控失灵）。所以这里单独
       记一个时间戳，合入 genuineKeyboardDismiss()，让 focusout 守卫 / rescue / 否决分支
       都把它当「用户真收」让路。blip（落库重渲染）也会走这条 call，靠 cmdBlipUntil 排除。 */
    let lastNativeHideAt = 0;
    /* v0.8.48：命令 / 动作落库重渲染（blip）窗口 —— 期间任何键盘收起都当作 blip 护住，
       不让用户「点软键盘收起键」的真收意图误伤。由 keepKeyboardAlive(显式 ms) 在命令
       执行与每次 re-render 救回时续期（见 keepKeyboardAlive 注释）。 */
    let cmdBlipUntil = 0;
    /* v0.8.90：「真的要收键盘」的强让路闩锁。安卓 3.8.9 的
       Utils.hideKeyboardAndToolbar() 在收键盘前统一派发 keyboard-hiding；
       前端落库重渲染的 blip 不经过安卓层、不会派发它，因此这是比
       genuineKeyboardDismiss() 更可靠的用户意图信号（后者会被
       cmdBlipUntil 的 800ms 窗口或 panning 排除掉）。闩锁期间所有
       「把键盘叫回来」的通道都必须让路；键盘真打开时由 setKb(true) 解除。 */
    let userHideUntil = 0;
    function userHideActive() { return Date.now() < userHideUntil; }
    /* 横滑工具条是否正在进行（模块级，供 genuineKeyboardDismiss 判断是否仍处横滑，
       护住 v0.8.24/25/31 横滑修复）。 */
    let panning = false;
    /* v0.8.37：「点进表格」的时间戳（与 lastOutsideTouchAt 同一次触摸、同一个
       Date.now() 值）。思源表格在「未激活」状态下单元格还不是 contenteditable，
       第一次点进去时原生 hit-test 命中的不是输入点 → IMM 先把键盘收掉，
       等思源把表格激活、重建单元格 DOM 再把焦点放进去（实测延迟可达 1.7s），
       键盘再弹一次 = 用户看到的「第一次点表格键盘刷新」。
       修法走官方原生通道：hideKeyboardToolbar(true) 时若最近一次触摸是点进
       表格，就 return 2 请原生别收（restoreRecentAndroidTableCellSelectAll
       同款通道）。**不动焦点、不动选区** —— 这次点按自己会落光标，
       抢焦点 = v0.8.31 的「守卫抢光标」重演。 */
    let lastTableTapAt = 0;
    /* v0.8.38：「点在编辑器内容（段落/单元格）上」的时间戳。
       与 lastOutsideTouchAt 严格分流：点内容 = 移动光标意图（caret-moved-skip
       的唯一合法证据）；点编辑器外 / 编辑器内空白 = 可能是收键盘意图
       （outside-touch-skip 的闩锁）。以前只记一个 lastOutsideTouchAt，
       点表格也算「外面」→ 点完表格 600ms 内摸工具条，守卫把原生 blur 当成
       「用户要收键盘」不救 → 键盘塌了又弹（点完表格再摸工具条，键盘闪一下）。 */
    let lastEditorTapAt = 0;
    /* v0.8.69 / v0.8.70：表格结构手势（列宽线、加行加列手柄、框选线）。
       元素来自思源 3.8.8 移动端表格控件 protyle/util/tableControl.ts：
         · 列宽线 = .protyle-table-control__width（内部走 startColumnResize）
         · 加行/加列 = 同类 .protyle-table-control__handle
         · 桌面端鼠标手柄是 .table__resize，触屏分支已不再使用，一并兼容
       startColumnResize 第一步就是 blurTouchEditor()：
           document.activeElement.blur();  →  window.dispatchEvent("siyuan-mobile-table-action")
       而 keyboardToolbar.ts 监听该事件后调 activeBlur(true)（键盘 + 键盘工具条一起收）。
       也就是说**点下即收键盘，且发生在 pointerdown 里**，比 touchstart 还早。
       旧版插件此刻会：① 记 lastTableTapAt → hideKeyboardToolbar(true) 被 return 2 否决
       （2 = 请原生把键盘叫回来）；② focusout 守卫立刻聚焦 + showKeyboard()；
       ③ 保护窗口内继续上锁。三者相加 = 用户看到的「点一下就闪」。
       修法：在 **pointerdown 捕获阶段**（早于思源自己的处理器）把这手势标成
       「允许收键盘」，按住期间 + 松手后 1.2s 宽限内，守卫 / 救援 / 否决一律让路。 */
    const TABLE_STRUCTURE_SEL = ".protyle-table-control__handle, .protyle-table-control__add, " +
        ".table__resize, .table__select";
    /* v0.8.71：点「分隔线」本身并不一定点在手柄上。思源 tableTouch.activateColumnBoundary
       的判定是「click 落在单元格左/右边缘 ≤8px」→ 激活列宽调整、生成手柄。
       这一步同样会 blur 收键盘（冷启动第一次尤其明显），旧规则只认手柄元素，
       于是第一次点没被豁免：守卫把焦点救回 → 表格控件重绘 → 刚激活的「线」又消失，
       得多点几次才稳定。这里把手势判定扩到「单元格左/右边缘 10px 带」。 */
    function nearColumnBoundary(t, x) {
        if (!t || t.nodeType !== 1 || !t.closest || typeof x !== "number") return false;
        const cell = t.closest("td, th");
        if (!cell) return false;
        let r = null;
        try { r = cell.getBoundingClientRect(); } catch (e) { return false; }
        if (!r || !r.width) return false;
        return Math.min(Math.abs(r.left - x), Math.abs(r.right - x)) <= 10;
    }
    /* v0.8.72：几何判定太脆（命中物可能是单元格里的 <p>/<br>、表格本身，
       或者不同机型边缘宽度不同）。改成「点在表格块里」整体放行：
       表格内的点按本来就意味着用户在选行/选列/调宽，键盘该由思源决定收不收，
       插件不该在此时抢焦点或否决原生收键盘。 */
    function inTableBlock(t) {
        if (!t || t.nodeType !== 1 || !t.closest) return false;
        return !!(t.closest("table") || t.closest('[data-type="NodeTable"]'));
    }
    let tableResizeAt = 0;
    let tableResizeHold = false;
    function markTableStructureGesture() {
        tableResizeHold = true;
        tableResizeAt = Date.now();
        /* 不许走「点表格 → 否决原生收键盘」那条老分支 */
        lastTableTapAt = 0;
        /* 这次触摸的意图就是收键盘（outside-touch-skip 的闩锁） */
        lastOutsideTouchAt = Date.now();
        /* 撤掉续锁窗口：否则 keepKeyboardAlive 的定时器会一直把键盘锁回来 */
        try { cancelKeyboardAlive(); } catch (e) { /* ignore */ }
    }
    function inTableResizeGesture() {
        if (tableResizeHold) {
            /* 兜底：万一 WebView 吞掉 pointerup/touchend，hold 不能永久生效 ——
               拖拽中每次移动都会续期，8s 没有新动作就当手势已结束。 */
            if (tableResizeAt && Date.now() - tableResizeAt > 8000) {
                tableResizeHold = false;
                return false;
            }
            return true;
        }
        return !!tableResizeAt && Date.now() - tableResizeAt < 1200;
    }

    /* ── v0.8.28：焦点守卫（真·修法） ────────────────────────────────────
       日志实证 —— 键盘**不是**被 activeBlur() 收的：整段日志里一次 KB-HIDE
       都没有（activeBlur 最终必然走那个桥接，我们的钩子不可能漏）。
       真实顺序是：
         +3408ms focusout ← DIV[ce](表格内) related=null   ← 焦点掉了，没有新目标
         +3478ms keyboard-hiding                            ← 原生开始收键盘
         +3496ms innerHeight 473 → 812                      ← 键盘真塌了
         +3516ms innerHeight 812 → 473                      ← 被我们救回来又弹起
       也就是：**焦点一掉，原生 WebView 见没有输入点就自己收键盘**，
       与 activeBlur、与那把 500ms 的锁都没关系 —— 所以前面几版全打偏了。
       修法因此改成「焦点不许掉」：
       ① 保护窗口内 / 正摸着工具条时，拦掉针对可编辑元素的 blur()；
       ② 万一还是掉了（focusout），同一个微任务里立刻救回同一个元素。 */
    let barTouching = false;
    let barTouchTimer: any = 0;
    let focusGuardInstalled = false;
    function installFocusGuard() {
        if (focusGuardInstalled) return;
        focusGuardInstalled = true;
        /* v0.8.69：列宽拖拽期间允许 blur —— 否则原生收键盘的最后一步被闸门挡掉 */
        /* v0.8.71：思源官方浮层（公式编辑面板）开着时一律不拦 blur。
           面板里的 math-field 是 contenteditable，被这里拦下就永远失不了焦，
           MathLive 的「失焦 → 重建 → 再聚焦」链路随之断掉 —— 用户看到的是
           「虚拟键盘按了没反应，折叠一下再打开才有效」。 */
        const guardOn = () => (kbProtected() || barTouching) && !inTableResizeGesture() &&
            !mathSessionLive() && !mathHandoffActive();
        /* ① 拦 blur —— 顺带记一笔，方便日志里确认「是不是有人 blur 了它」 */
        if (!(HTMLElement.prototype.blur as any).__syGuard) {
            const origBlur = HTMLElement.prototype.blur;
            const guarded = function () {
                if (guardOn() && isEditableEl(this)) {
                    return;                       // 焦点不许掉
                }
                return origBlur.apply(this, arguments);
            };
            (guarded as any).__syGuard = true;
            try { HTMLElement.prototype.blur = guarded; } catch (e) { /* ignore */ }
        }
        /* ② focusout 兜底 —— v0.8.29 放宽成**无条件**救回。
           日志实证：焦点是在用户摸到工具条**之前 34ms** 自己掉的
           （+3813 focusout → +3847 bar touchstart），那时既不在保护窗口、
           也没人摸工具条，guardOn() 为假 → 旧版直接放弃 → 键盘必收。
           所以改成：只要焦点从可编辑元素掉了，就在同一个微任务里救回；
           只有下面几种「用户确实改道了」的情况才让路。 */
        document.addEventListener("focusout", (ev) => {
            const t = ev.target;
            if (!isEditableEl(t)) return;
            const gone = t.isConnected === false;
            Promise.resolve().then(() => {
                if (Date.now() < focusGuardUntil) return;        // 主动收键盘 / 跳设置页
                /* v0.8.69：手指正按在表格列宽线上（触控调宽）= 用户要收起键盘，
                   别再叫回来 —— 与思源 Android 端一致。 */
                if (inTableResizeGesture()) return;
                /* v0.8.71：思源官方浮层（行级/块级公式编辑面板）开着 = 用户正在
                   面板里编辑，焦点掉落是面板自己重建 math-field 的副作用。
                   守卫在这里救回，等于把焦点从面板抢回编辑器：面板还在屏上，
                   却再也收不到按键 —— 这正是「按虚拟键盘没反应」的直接成因。
                   整场会话让路，等思源自己跑完 closeSubElement 把值写回块里。 */
                if (mathSessionLive()) return;
                /* v0.8.49：官方块功能面板（native .b3-menu）开着时，键盘不许被守卫强制叫回。
                   用户点键盘工具条「＋」打开 APP 自身块功能面板，编辑焦点会掉；若守卫照常
                   救回并 showKeyboard()，IME 会被重新叫起、遮挡面板。插件自己的浮层
                   （#syMobileToolbarSheet）用的是 .sy-mb-panel 而非 .b3-menu，不会误判。 */
                if (nativeMenuOpen()) return;
                if (ownOverlayOpen() && !kbProtected()) return;  // 自己的浮层开着（表格命令保护窗口内仍要救回）
                /* v0.8.36：relatedTarget 有人接手 = 焦点正在「移交」，绝不是「掉落」。
                   用户点表格外段落（related=DIV[ce]）、点自家/官方浮层按钮
                   （related=BUTTON）都属此类 —— 微任务里 activeElement 还没切过去，
                   旧版按「掉回 body」救回 = 把用户刚点走的光标拽回表格
                   （v0.8.35 日志 +11422 related=DIV[ce] → +11425 救回 TH：
                   「点不出表格」的根因）。relatedTarget 是同步证据，没有竞态。 */
                if (ev.relatedTarget && ev.relatedTarget.nodeType === 1) {
                    return;
                }
                /* v0.8.46：用户主动点编辑器以外收键盘 —— 即便身处保护窗口（用过一次命令后
                   1800ms / 横滑尾巴），也必须让路，否则键盘关不掉、关了又弹。
                   blip（落库重渲染导致的键盘假收）不会触发 lastOutsideTouchAt（用户没摸页面），
                   故不影响表格命令 / 横滑修复；该信号只在「用户真正点页面别处」时出现。 */
                if (lastOutsideTouchAt && Date.now() - lastOutsideTouchAt < 600) {
                    return;
                }
                /* v0.8.48：用户点软键盘自身收起键 = 真收意图，放键盘收掉（即便身处保护窗口）。
                   genuineKeyboardDismiss 已排除横滑中 / blip 窗口，故不影响横滑 / 表格命令修复。 */
                if (genuineKeyboardDismiss()) {
                    return;
                }
                /* v0.8.36：kbHidingAt（系统隐藏信号）只在非保护窗口用作收键盘意图 ——
                   保护窗口内它会被 blip 一起带出来，不能据此不救（否则表格动作刷新重演）。 */
                if (!kbProtected() && !barTouching) {
                    if (kbHidingAt && Date.now() - kbHidingAt < 1200) {
                        return;
                    }
                }
                const ae = document.activeElement;
                if (isEditableEl(ae) && !TABLE_CONTAINER_TAGS[ae.tagName]) return;   // 已有人接住
                if (ae && ae.nodeType === 1 &&
                    (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" ||
                        (ae.closest && ae.closest(".b3-dialog")))) return;           // 用户改道
                /* ⚠️ 只救「焦点掉到 body」这一种。
                   v0.8.29 无条件救回会误伤：用户主动点文档别处（非输入元素）时
                   焦点也落到了 body 之外的某个元素上，此时若强行叫回键盘 = 键盘
                   关不掉。真凶的特征是 related=null **且** 焦点彻底回落 body，
                   也就是「本来该有人接手却没人接」—— 那才救。
                   v0.8.34：TABLE/TBODY/TR 等容器元素作为 active 通常是**守卫自己
                   救回的副作用**（focusout 兜底 focus 了 lastEditable，但若
                   lastEditable 已过期，fallback caretEditable 可能返回容器本身），
                   不是用户改道 —— 用户点单元格落到 TD/TH，点表格空白落到 body，
                   不会主动点 TABLE。容器 active 时若也 return，会和救回动作形成
                   自反馈循环：救回 TABLE → TABLE 又 focusout(related=null) →
                   见 ae=TABLE 非改道又 return → 焦点真掉 body → 键盘收。
                   所以容器元素视同「没人接手」，继续往下救。 */
                if (ae && ae !== document.body && ae !== document.documentElement &&
                    !TABLE_CONTAINER_TAGS[ae.tagName]) {
                    return;
                }
                /* ⚠️ v0.8.31 最要紧的一条：**用户点了另一个单元格时别抢光标**。
                   点新格的那一瞬间，选区**已经**在新格了，而焦点还短暂停在旧格
                   （移动端 focus 有几十毫秒滞后，甚至先掉到 body）。守卫若按
                   记忆里的旧格把光标拽回去，插入/删除行列就全打在错的格上 ——
                   这正是「光标变换位置、表格命令全错」的成因。
                   所以：选区若还活着、且落在**别的**可编辑元素里，
                   说明用户已经改道了（点了新格），立刻让路。
                   v0.8.35：selCe 是 TABLE/TBODY/TR 等**容器**时绝不能算「用户改道」
                   —— 日志实证（+2877 focusout → +2910 caret-moved-skip：光标已被
                   用户移到 TABLE[ce]）：原生 blur 单元格的同一时刻会把选区**重锚
                   到表格容器**，那不是用户点的，是 blur 的副作用。把容器当选区
                   位置 = 该救不救 → 焦点真掉 body → 键盘塌 → 横滑必现键盘刷新。 */
                try {
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount) {
                        const node = sel.getRangeAt(0).startContainer;
                        const selEl = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
                        /* v0.8.36：realEditableUp 取代 closest 属性选择器 —— 表格里
                           属性挂在 TABLE/根上，closest 会把「继承 ce 的单元格」
                           误判成容器而错过让路，或把重锚假位置当成用户改道。 */
                        const selCe = realEditableUp(selEl);
                        if (selCe && selCe !== t && !selCe.contains(t) && !t.contains(selCe)) {
                            /* v0.8.38：「选区落在别的可编辑元素」**本身不足以**证明用户
                               改道 —— 摸工具条时的原生 blur 会把选区重锚到**另一个单元格
                               的 TD**（不是容器，是真实可编辑格，v0.8.35 的容器排除挡不住），
                               日志实证：+4015 focusout ← DIV[ce] related=null →
                               +4056 caret-moved-skip TD → +4092 keyboard-hiding →
                               +4121 键盘塌了又弹。区分方法：用户改道一定伴随一次
                               「点在编辑器内容上」（lastEditorTapAt，点单元格 B 的
                               touchstart）；原生 blur 重锚时用户摸的是工具条，没有这个
                               点按。无点按证据 = 重锚假位置，照救。 */
                            if (lastEditorTapAt && Date.now() - lastEditorTapAt < 500) {
                                rememberEditable();
                                return;
                            }
                        }
                    }
                } catch (e) { /* ignore */ }
                /* v0.8.35：救回目标三级优先 ——
                   ① 被 blur 的元素本身（realInputIn(t)）：它刚才还持有焦点，
                      是「用户在哪」定义级的答案，比任何猜测都准；
                   ② lastEditable（rememberEditable 选区优先记下的那个）；
                   ③ caretEditable() 启发式兜底（最后手段）。
                   并且**焦点 + 区间一起还原**（restoreLastRange）：日志实证原生
                   blur 的同一时刻会把选区重锚到表格容器开头，只 focus 不还原区间
                   = 光标永远停在左上第一格，插入/删除行列全打在表头那列。
                   区间已随块重渲染失效时 restoreLastRange 返回 false，退回
                   refocusKeepCaret 的「保现有区间、丢了补末尾」逻辑。 */
                let target = null;
                /* v0.8.36：t 是 TABLE 容器 / wysiwyg 根时**绝不** realInputIn 它 ——
                   那返回的是第一个单元格 TH（+8629 restored[memory] → TH 的根因：
                   落库重渲染 focusout ← TABLE，t 还在 DOM 里，realInputIn(TABLE)
                   直接把救回目标定成表头）。容器 t 交给 lastEditable → caretEditable
                   的 table-caret（按块 id + 行列找回新节点）去精确还原。 */
                if (!gone && !TABLE_CONTAINER_TAGS[t.tagName] &&
                    !(t.classList && t.classList.contains("protyle-wysiwyg"))) {
                    target = t;
                }
                if (!target && lastEditable && lastEditable.isConnected) target = lastEditable;
                if (target) {
                    /* TD/TH 自身可能不可聚焦（继承 ce）：focus 落到内部 ce 元素 */
                    let focusEl = target;
                    if (focusEl.tagName === "TD" || focusEl.tagName === "TH") {
                        try {
                            const inner = focusEl.querySelector('[contenteditable="true"]');
                            if (inner) focusEl = inner;
                        } catch (e) { /* ignore */ }
                    }
                    try { focusEl.focus({ preventScroll: true }); }
                    catch (e) { try { focusEl.focus(); } catch (e2) { /* ignore */ } }
                    const kept = restoreLastRange();
                    showKeyboard();
                    return;
                }
                /* lastEditable 也没有（插件刚加载还没编辑过）才退到 caretEditable */
                const ce = caretEditable();
                if (!ce) {
                    return;
                }
                /* refocusKeepCaret 返回 true = 原区间还在、一个字都没挪；
                   false = 区间也丢了，补了末尾光标。日志要写准，便于比对。
                   带上 caretSource —— 它能直接告出这次是从哪一路找到人的。 */
                const keptCaret = refocusKeepCaret(ce);
                showKeyboard();
            });
        }, true);
        /* 平时就把输入点记下来，等焦点 + 选区一起掉光时才捞得回来 */
        document.addEventListener("focusin", () => { rememberEditable(); }, true);
        document.addEventListener("selectionchange", () => { rememberEditable(); }, true);
        /* v0.8.36：记下「工具条/浮层以外的最后一次触摸」—— 点段落、点空白、
           点官方工具栏的收起键都算。随后 600ms 内的 focusout 是这次触摸的意图
           （移光标 / 收键盘），守卫不许救（见 outside-touch-skip）。
           捕获阶段 + 触摸伊始就记，保证早于任何 focusout。 */
        document.addEventListener("touchstart", (ev) => {
            const t = ev.target;
            if (t && t.nodeType === 1 && t.closest &&
                (t.closest("#syMobileToolbar") || t.closest("#syMobileToolbarSheet") ||
                    t.closest("#syMobileToolbarPicker") || t.closest(".sy-mb-diag"))) {
                return;
            }
            const now = Date.now();
            /* v0.8.69/70：按住表格结构控件（列宽线 / 加行加列手柄）= 触控调整，
               思源会主动收键盘。pointerdown 里已经标过一次，这里补一道
               （老 WebView 可能只派发 touch 事件），并顺手把「点表格」记账清掉，
               否则原生 hideKeyboardToolbar(true) 会被 return 2 否决。 */
            const touchX = ev.touches && ev.touches[0] ? ev.touches[0].clientX : undefined;
            if (t && t.nodeType === 1 && t.closest &&
                (t.closest(TABLE_STRUCTURE_SEL) || nearColumnBoundary(t, touchX) || inTableBlock(t))) {
                markTableStructureGesture();
                return;
            }
            /* v0.8.38：内容 / 非内容严格分流 ——
               · 点在编辑器内容（段落/单元格，realEditableUp 找得到输入点）
                 = 移动光标意图 → 记 lastEditorTapAt（caret-moved-skip 的证据），
                 **不记** lastOutsideTouchAt —— 否则点完表格 600ms 内摸工具条，
                 守卫会把原生 blur 误判成「收键盘意图」不救（摸工具条键盘刷新）；
               · 点编辑器以外 / 编辑器内空白（realEditableUp 为空）
                 = 可能是收键盘意图 → 记 lastOutsideTouchAt（outside-touch-skip）。
               lastTableTapAt 只看位置（点在 table 元素里就记，与 ce 状态无关 ——
               未激活表格单元格不是 ce，走 realEditableUp 会漏），点别处即清零
               （不是比时间戳：两次触摸同毫秒时比较会失灵）。 */
            const inTable = t && t.nodeType === 1 && t.closest &&
                t.closest(".protyle-wysiwyg table");
            lastTableTapAt = inTable ? now : 0;
            if (t && t.nodeType === 1 && realEditableUp(t)) {
                lastEditorTapAt = now;
            } else {
                lastOutsideTouchAt = now;
            }
        }, true);
        /* v0.8.69：列宽拖拽结束 —— 松手后留 1.2s 宽限。
           思源 onmouseup 里会 updateTransaction 落库，整块表格重渲染会再掉一次焦点，
           那次也不许救（用户此刻就是要键盘收着调宽）。 */
        const endTableResize = () => {
            if (!tableResizeHold) return;
            tableResizeHold = false;
            tableResizeAt = Date.now();
        };
        document.addEventListener("touchend", endTableResize, true);
        document.addEventListener("touchcancel", endTableResize, true);
        document.addEventListener("mouseup", endTableResize, true);
        document.addEventListener("pointerup", endTableResize, true);
        document.addEventListener("pointercancel", endTableResize, true);
        /* 拖拽中续期：只有 hold 生效时才写，开销可忽略 */
        document.addEventListener("touchmove", () => {
            if (tableResizeHold) tableResizeAt = Date.now();
        }, { passive: true, capture: true });
        /* v0.8.70：**捕获阶段、早于思源** —— tableControl.startColumnResize 在
           pointerdown 里同步 blur 当前单元格；这里晚一步，焦点就已经掉完了。 */
        document.addEventListener("pointerdown", (ev) => {
            const t = ev.target;
            if (!t || t.nodeType !== 1 || !t.closest) return;
            if (t.closest(TABLE_STRUCTURE_SEL) || nearColumnBoundary(t, ev.clientX) || inTableBlock(t)) {
                markTableStructureGesture();
            }
        }, { capture: true, passive: true });
        /* 思源 blurTouchEditor 结束时会派发该事件（随即 activeBlur(true) 收键盘），
           兜底再标一次；重复调用只是刷新时间戳，无副作用。 */
        window.addEventListener("siyuan-mobile-table-action", () => markTableStructureGesture());
    }

    /* 重申一次软键盘。与思源官方的 callMobileAppShowKeyboard() 同一条桥接
       （mobile/util/mobileAppUtil.ts:11）：Android 走 JSAndroid，鸿蒙走 JSHarmony。
       官方那版还会顺手 armKeyboardLock()（500ms 内禁止 activeBlur 关键盘），
       但那两个模块函数没有挂到 window 上，插件拿不到；不过只要我们调用
       contenteditable.focus()，思源自己打的 HTMLElement.prototype.focus 补丁
       就会替我们上锁（mobile/index.ts:141-158）。 */
    function showKeyboard() {
            if (window.JSAndroid && window.JSAndroid.showKeyboard) {
                try { window.JSAndroid.showKeyboard(); } catch (e) { /* ignore */ }
            } else if (window.JSHarmony && window.JSHarmony.showKeyboard) {
                try { window.JSHarmony.showKeyboard(); } catch (e) { /* ignore */ }
            }
    }

    /* 收起软键盘（与 showKeyboard 成对的桥接，callMobileAppHideKeyboard）。
       用于「设置」这类要跳去全屏界面的按钮：编辑器仍保有焦点
       （工具条 touchstart/touchend 拦了默认行为，IME 不会自动收起），
       不收的话键盘会盖在设置页上。所以先 blur 编辑器，再走原生桥接强制
       收键盘；并同步补一发「键盘收起」信号，让本工具条立即让位
       （原生桥接未必会回派 JS 事件）。动作 / 快捷短语要保键盘，故这路
       只在设置按钮里触发。 */
    function hideKeyboard() {
        /* 主动收键盘（跳设置页那类）：必须撤销保护窗口并放开焦点守卫，
           否则①「受保护时立刻把键盘叫回来」的兜底会跟这次主动收起打架；
           ② blur 会被守卫拦掉，设置页就被键盘盖住了。 */
        cancelKeyboardAlive();
        barTouching = false;
        focusGuardUntil = Date.now() + 1500;    // 焦点守卫让路，否则设置页会被键盘盖住
        if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
        const ae = document.activeElement;
        if (ae && ae.nodeType === 1 && typeof ae.blur === "function") {
            try { ae.blur(); } catch (e) { /* ignore */ }
        }
            if (window.JSAndroid && typeof window.JSAndroid.hideKeyboard === "function") {
                try { window.JSAndroid.hideKeyboard(); } catch (e) { /* ignore */ }
            } else if (window.JSHarmony && typeof window.JSHarmony.hideKeyboard === "function") {
                try { window.JSHarmony.hideKeyboard(); } catch (e) { /* ignore */ }
            }
        try {
            window.dispatchEvent(new CustomEvent("siyuan-mobile-keyboard-hiding"));
            window.dispatchEvent(new CustomEvent("siyuan-mobile-keyboard-change", { detail: false }));
        } catch (e) { /* ignore */ }
    }

    /* ================================================== 守住键盘 ========= */
    /* 为什么需要这一段 ────────────────────────────────────────────────────
       工具条按钮「影响移动端键盘」有两个独立成因，都要堵：
       ① 我们的工具条挂在 document.body 下，不在官方 .keyboard 容器里，
          所以思源移动端的 document 级触摸管线（mobile/util/touch.ts 的
          handleTouchStart/handleTouchEnd）会把「点工具条」当成一次页面手势
          去处理（关面板 / 设 touchRange / 长按多选…）。→ 见 bindButton 的
          stopPropagation。
       ② 插入动作是异步的：fillSlash() 只是把改动交给思源，真正的重渲染发生在
          内核事务回包之后（wysiwyg/transaction.ts）。这一瞬间被聚焦的
          contenteditable 被换掉，document.activeElement 落回 body，原生层
          立刻收起软键盘。官方的键盘工具条靠 focus 补丁拿到 500ms 的
          keyboardLock 保护期，我们直接调桥接则绕过了它。
          → 这里在动作后的一个短窗口内复查焦点：还在编辑器里就什么都不做，
            确实掉了才把焦点抢回来（并原样恢复光标区间，绝不把光标赶到块首/尾）。
       ──────────────────────────────────────────────────────────────────── */

    let kbHoldToken = 0;

    /* 从 protyle.toolbar.range（或最近编辑过的块）找出应当获得焦点的 contenteditable */
    function editableForFocus(protyle) {
        const r = protyle && protyle.toolbar ? protyle.toolbar.range : null;
        if (r && r.startContainer && r.startContainer.isConnected) {
            const node = r.startContainer.nodeType === 1
                ? r.startContainer : r.startContainer.parentElement;
            const ce = node && node.isConnected ? (node.isContentEditable ? node : node.closest('[contenteditable="true"]')) : null;
            if (ce && ce.isConnected) return ce;
        }
        const id = getActiveBlockId();
        const el = id ? blockEl(id) : null;
        if (el && el.isConnected) {
            const ce = el.querySelector('[contenteditable="true"]') ||
                (el.firstElementChild ? el.firstElementChild.querySelector('[contenteditable="true"]') : null);
            if (ce) return ce;
        }
        return null;
    }

    /* 聚焦 contenteditable，并尽量保住原有光标（不把光标赶到块首 / 块尾） */
    function refocusKeepCaret(ce) {
        const sel = window.getSelection();
        let saved = null;
        try {
            if (sel && sel.rangeCount) {
                const r = sel.getRangeAt(0);
                if (r.startContainer && r.startContainer.isConnected && ce.contains(r.startContainer)) {
                    saved = r.cloneRange();
                }
            }
        } catch (e) { /* ignore */ }
        try { ce.focus({ preventScroll: true }); } catch (e) { try { ce.focus(); } catch (e2) { /* ignore */ } }
        if (saved) {
            try { sel.removeAllRanges(); sel.addRange(saved); } catch (e) { /* ignore */ }
            return true;
        }
        /* v0.8.30：选区已经丢了（焦点掉时一起没的），上面只 focus 不放区间的话，
           光标会落在元素开头 —— 原生层看到「有焦点但没有输入点」照样会收键盘。
           这里补一个**末尾**的折叠光标，让它有一个确定的落点。
           只在确实没区间时补，绝不覆盖思源自己算好的位置。 */
        try {
            if (sel) {
                const r = document.createRange();
                r.selectNodeContents(ce);
                r.collapse(false);
                sel.removeAllRanges();
                sel.addRange(r);
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    /* fill() 返回后**同步**接一次焦点（v0.8.3）。
       为什么必须在同一个任务里做：真正负责接焦点的是 fill() 末尾的 focusByWbr()，
       而它在新块里找不到 <wbr> 时会直接 return（selection.ts:1026）。这一刻焦点
       已经掉到 body，原生层随即收键盘 —— 事后 200/480ms 的复查（holdKeyboard）
       只能把键盘再叫回来，于是出现「先关再开」的闪烁。
       这里在同一个任务内就接回去，不给 WebView「失焦」的窗口；
       focus() 还会触发思源给 HTMLElement.prototype.focus 打的补丁
       （mobile/index.ts:141-158 → callMobileAppShowKeyboard）。
       只在「焦点确实已经离开编辑器」时动手 —— 正常插入（focusByWbr 生效）
       一律不碰，绝不干扰思源自己算好的光标位置。 */
    function rescueFocus(protyle) {
        if (!protyle || !protyle.wysiwyg || !protyle.wysiwyg.element) return false;
        const wys = protyle.wysiwyg.element;
        const active = document.activeElement;
        if (active && active !== document.body && active.nodeType === 1 &&
            active.isContentEditable && wys.contains(active)) {
            return false;   // fill() 自己已经接回来了
        }
        if (ownOverlayOpen()) return false;
        /* v0.8.71：思源官方浮层（公式编辑面板）已经打开时不再抢焦点 ——
           fillSlash("$$") 之后思源会 showRender 打开面板，这里再 refocus 编辑器
           等于把焦点从刚打开的面板抢走，面板留在屏上却收不到按键。 */
        if (mathSessionLive()) return false;
        const ce = editableForFocus(protyle);
        if (!ce) return false;
        refocusKeepCaret(ce);
        return true;
    }

    /* 自己的浮层（面板 / 选择器）打开时不要抢焦点，否则会把用户的下一步操作打掉 */
    function ownOverlayOpen() {
        const ids = ["syMobileToolbarSheet", "syMobileToolbarPicker"];
        for (let i = 0; i < ids.length; i++) {
            const el = document.getElementById(ids[i]);
            if (el && el.classList && !el.classList.contains("fn__none") &&
                el.style.display !== "none" && el.getBoundingClientRect().height > 0) {
                return true;
            }
        }
        return false;
    }

    /* 动作之后守住键盘：0 / 60 / 200 / 480ms 各复查一次（覆盖内核事务回包的窗口） */
    function holdKeyboard() {
        if (!CONFIG.keepKeyboard || mathHandoffActive()) return;
        const token = ++kbHoldToken;
        [0, 60, 200, 480].forEach((delay, i) => {
            setTimeout(() => {
                if (destroyed || token !== kbHoldToken) return;
                /* v0.8.71：思源官方浮层（公式编辑面板）开着时不救键盘 ——
                   救回就是抢焦点 + 叫 IME，既打断面板会话又与虚拟键盘层叠。 */
                if (mathSessionLive()) return;
                const protyle = getProtyle();
                if (!protyle || !protyle.wysiwyg || !protyle.wysiwyg.element) return;
                const wys = protyle.wysiwyg.element;
                const scope = protyle.element && protyle.element.contains ? protyle.element : wys;
                const active = document.activeElement;
                if (active && active.nodeType === 1 && active.isContentEditable &&
                    scope.contains(active)) {
                    /* v0.8.25：焦点还在编辑器里也必须**续锁**。
                       以前这里只在后半段补一次 showKeyboard()，而 showKeyboard()
                       是直接调原生桥接、**不会** arm 键盘锁（这点和思源的
                       callMobileAppShowKeyboard 不同）—— 于是 200ms 之后锁就断了，
                       等到落库的重渲染把单元格换掉时，activeBlur 畅通无阻。
                       现在改成 refocusKeepCaret(active)：存区间 → focus → 原样还原，
                       一个字符都不挪，同时把锁续上（思源的 focus 补丁会 arm）。 */
                    refocusKeepCaret(active);
                    if (i >= 2) showKeyboard();
                    return;
                }
                // 焦点落到了真实输入框 / 弹窗上（设置页等）：用户已经改道，别抢
                if (active && active.nodeType === 1 &&
                    (active.tagName === "INPUT" || active.tagName === "TEXTAREA" ||
                        (active.closest && active.closest(".b3-dialog")))) {
                    return;
                }
                if (ownOverlayOpen()) return;
                const ce = editableForFocus(protyle);
                if (!ce) return;
                refocusKeepCaret(ce);
                showKeyboard();
            }, delay);
        });
    }

    /* 动手打开官方浮层之前，先给自己上一把「键盘锁」（v0.8.21）。
       为什么需要 ——
       官方块菜单在移动端会主动收键盘：键盘工具条的 block 按钮
       （mobile/util/keyboardToolbar.ts:1073）与 protyle.gutter.renderMenu
       （protyle/gutter/index.ts:1448）都调用 activeBlur()。而 activeBlur 开头有一道闸门：
           if (Date.now() < keyboardLockUntil) return;   // keyboardToolbar.ts:728-733
       这把锁由 mobileAppUtil.armKeyboardLock() 上，而 armKeyboardLock 是思源给
       HTMLElement.prototype.focus 打的补丁在「聚焦可输入元素」时顺带调用的
       （mobile/index.ts:141-158 → callMobileAppShowKeyboard → armKeyboardLock，锁 500ms）。
       所以：只要在派发菜单之前先 focus 一下当前编辑器，紧接着的 activeBlur 会被
       直接挡回去 —— 键盘不收起、焦点不掉，工具条也就不会闪一下再回来。
       （插件自己的 showKeyboard() 直接调原生桥接，绕过了这个补丁、不 arm 锁 ——
       这正是快捷工具条当年必须靠 rescueFocus / holdKeyboard 兜底的原因。） */
    /* ---------------------------------------------------------------------
       ⚠️ v0.8.22 事故复盘（务必别改回去）：
       上一版这里写的是 editableForFocus(protyle) —— 它找的是
       「protyle.toolbar.range 所在块 → 该块里第一个 contenteditable」，
       实在不行再拿「最近编辑过的块」里的第一个。对快捷工具栏够用，对**表格**是灾难：

         · 插件的工具栏按钮 touchstart 里 preventDefault 了，编辑器的焦点其实没掉，
           光标还在原来那个单元格里，而 protyle.toolbar.range 在移动端并不一定跟着走；
         · 于是 editableForFocus 很容易指到**别的块**（表格块里是第一个单元格，
           更糟的是用 getActiveBlockId 兜底时可能指到文档标题）；
         · 紧接着的 ce.focus() 一按，光标就被搬到那个块上 —— 用户什么都还没做，
           光标已经离开原来的单元格了；
         · 后面官方块菜单是按「当前选区所在块」渲染的（menus/protyle.ts:881
           hasClosestByTag(range.startContainer, "TD")），选区既然不在单元格里，
           表格那一整组菜单项根本不会出现 → 插件找不到目标项 →
           弹「没能打开表格菜单，请确认光标在表格内」，表格按钮**全部失效**。
           （而且因为光标停在标题这类「不在 .protyle-wysiwyg 里」的元素上，
            canInput 为假 → 连键盘锁都没上成，activeBlur 照样收键盘 → 「点一下键盘就关」。）

       正解：**只碰光标自己所在的那个 contenteditable**，一个字节都不许挪。
       focus() 对已聚焦元素是空操作，但思源给 HTMLElement.prototype.focus 打的补丁
       照跑（mobile/index.ts:141-158 → callMobileAppShowKeyboard → armKeyboardLock），
       键盘锁照样上；配合 refocusKeepCaret 的「存区间 → focus → 原样还原」，
       选区与光标位置全程不变。 */
    function realInputIn(el) {
        if (!el || el.nodeType !== 1) return null;
        if (!TABLE_CONTAINER_TAGS[el.tagName]) return el;
        /* 落在整块容器上了：优先用记住的那个格子，其次用容器里第一个可编辑元素 */
        let remembered = null;
        try { remembered = tableCaretCell(); } catch (e) { /* ignore */ }
        if (remembered) return remembered;
        try {
            const inner = el.querySelectorAll('[contenteditable="true"]');
            for (let i = 0; i < inner.length; i++) {
                if (!TABLE_CONTAINER_TAGS[inner[i].tagName]) return inner[i];
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    /* v0.8.36：从 el 向上找「真正的输入点」—— 最深的那个**非容器**可编辑祖先。
       为什么不再用 closest('[contenteditable="true"]') —— 移动端表格里单元格的
       contenteditable 多半是**继承**来的（属性挂在 TABLE 或 wysiwyg 根上），
       closest 属性选择器会一路冲到 TABLE 容器甚至 wysiwyg 根：
         · 命中 TABLE → realInputIn 返回**第一个单元格 TH**，无视活在 TD 里的
           选区（v0.8.35 日志 +8591 续锁[active] → focus TH，表格命令全打表头）；
         · 命中 wysiwyg 根 → 把「重锚到文档根」的假位置当成真光标（+8629 光标在
           DIV.protyle-wysiwyg —— 那是重渲染后选区被重锚的产物，不是用户位置）。
       行走规则：容器（TABLE/TBODY/TR…）继续向上穿；命中 wysiwyg 根 = 重锚
       假位置，返回 null 让调用方走 table-caret / 记忆兜底；TD/TH 继承 ce
       （自身无属性但在 ce 祖先内）也算合法输入点。 */
    function realEditableUp(el) {
        let n = el;
        while (n && n.nodeType === 1) {
            if (TABLE_CONTAINER_TAGS[n.tagName]) { n = n.parentElement; continue; }
            if (n.classList && n.classList.contains("protyle-wysiwyg")) return null;
            if (isEditableEl(n)) return n;
            if ((n.tagName === "TD" || n.tagName === "TH") &&
                n.closest && n.closest('[contenteditable="true"]')) return n;
            n = n.parentElement;
        }
        return null;
    }

    function caretEditable() {
        caretSource = "active";
        /* ① 真正持有焦点的那个 —— 最准，focus 一次也不会移动光标。
           v0.8.36：active 是 TABLE 容器时**绝不** realInputIn 它 —— 那返回的是
           第一个单元格 TH（表头），而无视活在别的格里的选区。容器/根 active
           视同「焦点掉了」，落到 ② 用选区说话。 */
        const active = document.activeElement;
        if (active && active.nodeType === 1 && isEditableEl(active) &&
            !TABLE_CONTAINER_TAGS[active.tagName] &&
            !(active.classList && active.classList.contains("protyle-wysiwyg"))) {
            caretSource = "active";
            return active;
        }
        /* ② 焦点掉了（回落 body / 停在容器上）时，用光标区间所在的那个 */
        try {
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
                const node = sel.getRangeAt(0).startContainer;
                const el = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
                const ce = realEditableUp(el);
                if (ce) { caretSource = "selection"; return ce; }
            }
        } catch (e) { /* ignore */ }
        /* ②b v0.8.25：表格动作后整块被重渲染的那一瞬间，①②都会落空
           （旧节点连同选区一起没了）。此时按「块 id + 行列」找回原来的格子，
           比直接掉到 ③ 的启发式精确得多 —— ③ 会把光标搬到别的块。 */
        if (kbProtected()) {
            const tc = realInputIn(tableCaretCell());
            if (tc) { caretSource = "table-caret"; return tc; }
        }
        /* ②c v0.8.30：**记忆优先于启发式**。
           日志实证：焦点掉的是 DIV[ce]（正文单元格），结果救回到了 TH[ce]（表头）——
           因为启发式 editableForFocus 只会找「块里第一个 contenteditable」，在表格里
           那就是表头。更糟的是原生的判断依据是「输入点有没有变」：把焦点搬到另一个
           元素（哪怕是同一张表里的另一个格），原生照样当成"输入点换了地方"而收键盘，
           于是救回了也白救 —— 焦点必须回到**原来那一个**。
           lastEditable 就是「原来那一个」的真身，必须抢在启发式前面用。 */
        if (lastEditable && lastEditable.isConnected) { caretSource = "memory"; return lastEditable; }
        /* ③ 都没有（选区也丢了）才退回启发式；这一步有挪动光标的可能，只作最后兜底 */
        const protyle = getProtyle();
        const heur = realInputIn(protyle ? editableForFocus(protyle) : null);
        if (heur) { caretSource = "heuristic"; return heur; }
        caretSource = "none";
        return null;
    }

    /* 记住最近一次见到的输入点（focusin / selectionchange / 续锁成功时更新）
       ⚠️ 这里**只能**认「真正持有焦点的 / 光标区间所在的」，绝不能调 caretEditable()
       —— 它内部有启发式兜底（会找出块里第一个 contenteditable，在表格里就是表头），
       拿它的返回值去记忆，等于把错的位置当成"原位置"记下来（v0.8.30 实测踩到）。
       ⚠️ lastEditable 的声明在上面（文件前部）：caretEditable 在引擎初始化期间
       就会被调用，const/let 有 TDZ，放这里会在那一刻抛错。 */
    function rememberEditable() {
        try {
            let ce = null;
            /* ⚠️ v0.8.31：**选区优先于焦点**。
               点另一个单元格时，选区**立刻**到了新格，而焦点还停在旧格
               （移动端上 focus 有几十毫秒的滞后）。以前这里优先认
               activeElement，于是把**旧格**记成了"原位置"—— 守卫一触发就把
               光标拽回旧格，插入/删除行列全打在错的格子上。
               选区才是用户意图的第一手证据，焦点可能滞后。 */
            const sel = window.getSelection();
            if (sel && sel.rangeCount) {
                const node = sel.getRangeAt(0).startContainer;
                const el = node ? (node.nodeType === 1 ? node : node.parentElement) : null;
                /* v0.8.36：realEditableUp 取代 closest('[contenteditable="true"]') ——
                   后者在表格里会命中 TABLE 容器 / wysiwyg 根（属性挂在它们上面、
                   单元格只是继承 ce），于是 ce=null、记忆整段落空：
                   [memory] 路径被跳过 → fallback caretEditable ① realInputIn(TABLE)
                   → 返回第一个单元格 TH —— v0.8.35 日志 +8591 表格命令打表头的根因。 */
                ce = realEditableUp(el);
            }
            if (!ce) {
                const active = document.activeElement;
                if (isEditableEl(active) && !TABLE_CONTAINER_TAGS[active.tagName] &&
                    !(active.classList && active.classList.contains("protyle-wysiwyg"))) {
                    ce = active;
                }
            }
            if (ce && ce.isConnected) {
                lastEditable = ce;
                rememberTableCaret(ce);
                /* v0.8.35：区间与元素同源记忆。只在「从选区找到人」时更新
                   （activeElement 兜底那路没有活选区，sel.rangeCount=0 自然跳过）。
                   原生 blur 会把选区重锚到容器开头 —— 那一刻 ce=null 不会走到这，
                   所以这里记下的永远是用户真实编辑位置，不会被重锚污染。 */
                try {
                    if (sel && sel.rangeCount) lastRange = sel.getRangeAt(0).cloneRange();
                } catch (e) { /* ignore */ }
            }
        } catch (e) { /* ignore */ }
    }

    function isEditableEl(el) {
        if (!el || el.nodeType !== 1) return false;
        if (el.isContentEditable === true) return true;
        try { return el.getAttribute("contenteditable") === "true"; } catch (e) { return false; }
    }

    function armKeyboardGuard(force) {
        /* v0.8.71：思源官方浮层（公式编辑面板）开着时不续锁，并把续锁窗口就地关掉。
           续锁的意义是「挡住 activeBlur，别让键盘塌」；而面板场景恰恰**需要**
           activeBlur 跑完 —— 只有它放行，hideElements(["util"]) → closeSubElement →
           subElementCloseCB 才会把 textarea.value 写回 renderElement[data-content]。
           锁不断档，这条链就永远走不到，块里留下的是 finish() 提交的旧值。

           v0.8.74：force=true 时**跳过这条让路**。用于「用户刚点开本插件自己的面板、
           还没选任何东西」这一刻 —— 此时公式会话一定还没开始（用户正是因为还没选到
           行级公式才在看面板），让路只会让思源的 activeBlur 把输入法收掉，用户看到
           的就是「打开面板，输入法键盘先没了」。
           一次性：面板项的点击/续锁 step 仍走原判据，公式会话一开始立刻恢复让路。 */
        if (!force && (siyuanPanelOpen() || mathHandoffActive())) { kbAliveUntil = 0; return; }
        /* v0.8.32：续锁只能 re-arm，绝不能挪光标。
           续锁的目的只是让 keyboardLockUntil 不断档，锁由思源给
           HTMLElement.prototype.focus 打的补丁 arm；focus 同一个元素是 no-op，
           但补丁照跑，锁照上 —— 光标一个字节都不会挪。
           横滑期间这一条尤其关键：日志实测横滑开始时 active=TABLE[ce]（整张表
           整体），续锁若调 caretEditable() 走 [heuristic] 找到 TH（表头），
           refocusKeepCaret 一按就把输入点搬到表头 → 原生重新同步键盘 = 用户
           看到的「键盘刷新」。所以这里**优先 focus activeElement 本身**，
           只有当 active 不是 contenteditable（回落 body）时才退而求其次。
           v0.8.35：[self] 只认**真正的输入点**，active 是 TABLE/TBODY/TR 等容器
           时不再 re-arm —— 日志实证（+2917 续锁[self] → re-arm TABLE）此刻选区
           已被原生 blur 重锚到表格开头，re-arm 容器焦点保住了键盘却把光标留在
           表头第一格，紧跟着的表格命令全打错列。容器 active 视同「焦点掉了」，
           落到 [memory] 焦点 + 区间一起还原。 */
        const active = document.activeElement;
        if (active && active.nodeType === 1 && active.isContentEditable &&
            !TABLE_CONTAINER_TAGS[active.tagName] &&
            !(active.classList && active.classList.contains("protyle-wysiwyg"))) {
            try { active.focus({ preventScroll: true }); }
            catch (e) { try { active.focus(); } catch (e2) { /* ignore */ } }
            return;
        }
        /* v0.8.34：[memory] 路径**去掉 kbProtected() 守卫**。
           v0.8.33 带守卫的副作用（日志实证）：动作执行前调 armKeyboardGuard()，
           此刻 keepKeyboardAlive(1800) 还没生效，kbProtected() 仍为 false
           → [memory] 被跳过 → 走 fallback caretEditable()
           → [selection] 找到 TH（表头，selection 此刻常短暂落在表头文本节点上）
           → refocusKeepCaret(TH) 把光标搬到表头 → 原生见输入点变了收键盘 =
           用户看到的「键盘刷新」。
           修法：去掉守卫，只要 lastEditable 存在且 connected 就 focus 它（只 focus、
           不调 refocusKeepCaret、不挪选区）。安全性：armKeyboardGuard 只在续锁
           场景被调（keepKeyboardAlive step / armGuardThrottled /
           rescueKeyboardIfProtected），这些场景都**需要**保键盘，focus lastEditable
           是对的；用户主动点别处时（不在保护窗口、没触发续锁）根本不会调到这里，
           由 focusout 守卫判断要不要救。focus 同元素是 no-op，但思源给
           HTMLElement.prototype.focus 打的补丁照跑、锁照上、光标一个字节都不挪。 */
        if (lastEditable && lastEditable.isConnected) {
            /* v0.8.36：记忆是 TD/TH（继承 ce，自身可能不可聚焦）时，focus 落到
               它内部真正持 contenteditable 的元素上；区间由 restoreLastRange 还原，
               光标位置不受影响。 */
            let focusEl = lastEditable;
            if (focusEl.tagName === "TD" || focusEl.tagName === "TH") {
                try {
                    const inner = focusEl.querySelector('[contenteditable="true"]');
                    if (inner) focusEl = inner;
                } catch (e) { /* ignore */ }
            }
            try { focusEl.focus({ preventScroll: true }); }
            catch (e) { try { focusEl.focus(); } catch (e2) { /* ignore */ } }
            /* v0.8.35：焦点 + 区间一起还原。原生 blur 已把选区重锚到表格开头
               （日志 +2944：光标在 TH），只 focus 不还原 = 表格命令照样打第一列。
               区间随块重渲染失效时 restoreLastRange 返回 false，此时不挪选区，
               交给后续的 table-caret / focusout 兜底。 */
            const kept = restoreLastRange();
            return;
        }
        /* 真没记忆了（一般发生在插件初始化后还没编辑过）才走 caretEditable fallback。
           v0.8.36：带上 mem 状态 —— 记忆是 null 还是断连，日志里一眼可辨。 */
        const ce = caretEditable();
        if (!ce) return;
        refocusKeepCaret(ce);
    }

    /* ── v0.8.25：给键盘锁「续期」 ────────────────────────────────────────
       之前每一版都只在某个瞬间「上一次锁」，而锁的寿命只有 500ms：
           keyboardLockUntil = Date.now() + 500;   // mobileAppUtil.ts:8
       表格动作的真实链路却长得多 ——
           本地改 DOM → HTTP 落库 (/api/block/updateBlock) → 内核事务
           → WebSocket 回包 → 前端把**整个表格块重渲染**
       重渲染会把当前单元格连根换掉，document.activeElement 落回 body；
       这一刻只要 activeBlur() 被调到（它在移动端是「键盘 + 键盘工具条」
       一起收的那个开关），两者同时消失，随后焦点被救回来、又一起出现
       —— 就是用户看到的「关掉再打开」。
       这条链耗时不可控（网络往返 + 内核 + 重渲染），500ms 盖不住。
       所以正解不是「上一次锁」，而是**在整个窗口内反复上锁**，
       让 keyboardLockUntil 永不断档，activeBlur 每次都被闸门挡回去。
       间隔 300ms < 500ms 寿命，保证衔接得上。 */
    let kbAliveUntil = 0;
    let kbAliveTimer: any = 0;
    function keepKeyboardAlive(ms, immediate?, forceOnce?) {
        /* v0.8.71：思源官方浮层（公式编辑面板）开着时不起续锁 —— 理由见
           armKeyboardGuard 顶部。这里必须从入口就断掉，否则 step 会每 300ms
           把 kbAliveUntil 重新拉起来（step 里也有同样的判据，双保险）。
           v0.8.73：让路本身是对的，但**必须留痕** —— 这条早退是静默的，
           现场只能看到「键盘没了」，看不出是「本该让路」还是「判据误判」。
           现在每次跳过都广播一条 sy-mb:kb，由数学键盘插件转进诊断时间线。
           v0.8.74：forceOnce=true 跳过这次让路，只用于「本插件自己的面板刚弹出、
           用户还没选任何一项」的第一次武装。step 里仍判 sy，公式会话一开就让路。 */
        if (!forceOnce && (siyuanPanelOpen() || mathHandoffActive())) {
            kbAliveUntil = 0;
            kbDiag("hold-skip sy=1 ms=" + ms);
            return;
        }
        /* v0.8.48：显式续锁（命令执行 / 横滑 / 动作救回）时标记 blip 窗口 ——
           期间键盘收起当作 re-render 假收护住；非显式调用（定时器 step）不续期，
           避免保护窗口被无限拉长、挡住用户真收意图。 */
        if (ms != null) cmdBlipUntil = Date.now() + 800;
        const until = Date.now() + (ms == null ? 1200 : ms);
        if (until > kbAliveUntil) kbAliveUntil = until;
        if (immediate) { try { armKeyboardGuard(forceOnce); } catch (e) { /* ignore */ } }
        if (kbAliveTimer) return;            // 已经在跑，只是把截止时间往后延
        const step = () => {
            kbAliveTimer = 0;
            if (destroyed) { kbAliveUntil = 0; return; }
            /* v0.8.71：会话期间面板一旦打开，立即结束续锁窗口（不等自然到期）。
               v0.8.74：判据与武装入口统一到 mathSessionLive() —— 只看 DOM 里
               有没有 math-field，不再因为焦点抖动把整段保护提前掐断。 */
            if (mathSessionLive() || mathHandoffActive()) { kbAliveUntil = 0; return; }
            /* v0.8.90：用户真收键盘，续锁立即结束，别在 300ms 后重新聚焦 */
            if (userHideActive()) { kbAliveUntil = 0; return; }
            if (Date.now() >= kbAliveUntil) { kbAliveUntil = 0; return; }
            /* v0.8.46：保护窗口内若用户主动收键盘（点编辑器以外），续锁不再强行聚焦，
               让键盘真正关掉 —— 否则用过一次命令后关不掉 / 关了又弹。
               blip（落库重渲染假收）不会触发 lastOutsideTouchAt，不受影响。 */
            if (lastOutsideTouchAt && Date.now() - lastOutsideTouchAt < 600) { kbAliveUntil = 0; return; }
            /* v0.8.48：用户点软键盘自身收起键（genuineKeyboardDismiss）也停止续锁，
               让保护窗口真正结束 —— 否则用过一次命令后关不掉键盘。 */
            if (genuineKeyboardDismiss()) { kbAliveUntil = 0; return; }
            /* v0.8.69：列宽拖拽期间不再上锁，让原生把键盘收干净。 */
            if (inTableResizeGesture()) { kbAliveUntil = 0; return; }
            /* v0.8.75：走到这里说明 mathSessionLive() 为假（上面已 early-return），
               即「没有公式会话在跑」。那就没有让路的理由 —— 直接强制打锁，
               否则 siyuanPanelOpen() 那句软判据又会把锁放掉，面板期间键盘照收。 */
            try { armKeyboardGuard(true); } catch (e) { /* ignore */ }
            kbAliveTimer = setTimeout(step, 300);
        };
        kbAliveTimer = setTimeout(step, 300);
    }

    /* 当前是否处在「键盘受保护」窗口内 —— 供键盘收起信号判断是否要立刻救回 */
    function kbProtected() { return Date.now() < kbAliveUntil; }

    /* 主动收键盘时调用：撤销保护窗口 */
    function cancelKeyboardAlive() {
        kbAliveUntil = 0;
        if (kbAliveTimer) { clearTimeout(kbAliveTimer); kbAliveTimer = 0; }
    }

    /* v0.8.72：此刻系统键盘是否已经开着。
       面板 / 滚轮选择器都是「先弹出来、再选一项」的两步操作，选之前不该把键盘
       收掉 —— 现场反馈「点工具栏打开面板，键盘就先被关了，我还没点到里面的
       功能」。只有本来就有键盘（焦点在可编辑元素上，或思源键盘工具条还在）
       才值得保；没键盘时硬保会凭空把 IME 叫出来。 */
    function keyboardUpNow() {
        try {
            const ae = document.activeElement;
            if (ae && ae !== document.body && ae !== document.documentElement &&
                (isEditableEl(ae) || ae.tagName === "TEXTAREA" || ae.tagName === "INPUT")) {
                return true;
            }
        } catch (e) { /* ignore */ }
        try {
            const kbar = document.getElementById("keyboardToolbar");
            if (kbar && !kbar.classList.contains("fn__none")) return true;
        } catch (e) { /* ignore */ }
        /* v0.8.76：视口仍被顶矮是「系统输入法还在」的硬证据。
           真机日志里失败那几次，点工具条时 activeElement 已提前掉回 body，
           keyboardToolbar 也可能先一步隐藏，但视口仍是 473（无 IME 时 812）。
           旧判据在这一刻返回 false，armOnPress 直接早退，随后输入法被收走。
           公式虚拟键盘不会改变视口高度，所以这条不会把它误认成系统 IME。 */
        try {
            const vh = viewportH();
            if (maxViewportH > 0 && maxViewportH - vh > 120) return true;
        } catch (e) { /* ignore */ }
        return false;
    }

    /* 跨插件诊断出口（v0.8.73）。
       面板里「到底有没有守住键盘、被谁挡住的」只有本插件知道，而现场日志是
       数学键盘插件那份。用一个中性事件名把决策广播出去，那边监听并转进同一条
       时间线 —— 没有安装数学键盘时无人监听，零副作用。 */
    function kbDiag(msg) {
        try {
            document.dispatchEvent(new CustomEvent("sy-mb:kb", { detail: msg }));
        } catch (e) { /* ignore */ }
    }

    /* 官方斜杠值里只有 "$$" 会打开公式编辑面板（hint/index.ts 的 showRender 分支）。
       其余块插入不改键盘归属，仍走原来的 rescueFocus + holdKeyboard。 */
    function isMathBlockInsert(value) {
        return String(value == null ? "" : value).trim() === CONFIG.mathSlash;
    }

    /* v0.8.85：把系统 IME 的控制权交给公式键盘插件。
       冲突链（两个插件都没有控制级握手，全靠 DOM 推断）：
         ① armOnPress() 在按下工具条时开了 3000ms 保护窗口并续锁；
         ② fillSlash() 原本对所有块都 rescueFocus + holdKeyboard；
         ③ 公式面板刚打开、math-field 尚未注入时 mathSessionLive() 为假；
         ④ 于是 hideKeyboardToolbar 包装返回 2 请原生 showSoftKeyboard()，
            或 holdKeyboard() 直接 showKeyboard() —— 系统 IME 被叫回来，
            与公式键盘上下同屏；math-keyboard 的 collapse() 又有 2500ms 节流，
            不会立刻重试收起，现场就是「输入法键盘没有及时关闭」。
       这里主动撤销保护窗口、放开焦点守卫并广播握手事件（第二步供
       math-keyboard 监听后立刻 collapse）。**不主动调 hideKeyboard()**：
       math-keyboard 的 collapse() 带完整会话保护，BlockBar 直接收 IME
       可能触发思源 closeSubElement 把空公式误删。 */
    function yieldKeyboardToMathSession(source) {
        mathHandoffUntil = Date.now() + MATH_HANDOFF_MS;
        cancelKeyboardAlive();
        barTouching = false;
        if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
        focusGuardUntil = Math.max(focusGuardUntil, mathHandoffUntil);
        cmdBlipUntil = 0;
        lastTableTapAt = 0;
        kbDiag("math-handoff " + source);
        try {
            document.dispatchEvent(new CustomEvent("sy-mb:math-session-start", {
                detail: {source: source, at: Date.now(), holdMs: MATH_HANDOFF_MS}
            }));
        } catch (e) { /* ignore */ }
        InsertDiagnostics.trace("math.handoff", {
            source: source,
            holdMs: MATH_HANDOFF_MS,
            selection: InsertDiagnostics.selection()
        });
    }

    /* v0.8.73：按下按钮那一刻键盘是否开着。
       打开面板时「键盘是不是本来就在」必须**在按下瞬间**取，不能等到面板
       display:block 之后再看 —— 那时思源可能已经 activeBlur 过，activeElement
       掉回 body，keyboardUpNow() 变成 false，续锁被整段跳过，
       用户看到的就是「点工具栏打开面板，输入法键盘先没了」。 */
    let kbAtPress = false;
    let kbAtPressAt = 0;
    function noteKbAtPress() {
        try { kbAtPress = keyboardUpNow(); } catch (e) { kbAtPress = false; }
        kbAtPressAt = Date.now();
    }
    function kbWasUp() {
        if (keyboardUpNow()) return true;
        return !!kbAtPress && (Date.now() - kbAtPressAt < 2500);
    }

    /* v0.8.48 / v0.8.50：识别「用户主动收键盘」这一**真收意图**，区别于落库重渲染的
       blip。真收有两条来源，任一近期成立即可：
       · 软键盘自身收起键 / 系统返回键 → 触发 siyuan-mobile-keyboard-hiding /
         keyboard-change(false) → kbHidingAt 置位（v0.8.48）；
       · APP 自带键盘工具条的折叠键 → 原生层直接调 hideKeyboardToolbar(true)（JS 桥），
         可能早于 / 不派发 hiding 事件，但会被 hookNativeToolbar 拦到并置 lastNativeHideAt
         （v0.8.50）。原生层触摸不经过插件 touchstart 监听，lastOutsideTouchAt 抓不到。
       两路任一近期 + 已过 blip 窗口(cmdBlipUntil) + 非横滑中(panning) = 真收意图，
       四处救回逻辑都让路。blip（落库重渲染）也走 hideKeyboardToolbar 调用，靠 cmdBlipUntil
       排除；横滑进行中靠 panning 排除 —— 护住 v0.8.24/25/31 横滑修复与 v0.8.37/40 表格命令修复。 */
    function genuineKeyboardDismiss() {
        const recentHide = (kbHidingAt && Date.now() - kbHidingAt < 1200) ||
                           (lastNativeHideAt && Date.now() - lastNativeHideAt < 400);
        if (!recentHide) return false;
        if (panning) return false;
        if (Date.now() < cmdBlipUntil) return false;
        return true;
    }

    /* 受保护窗口内收到「键盘正在收起」：立刻把键盘叫回来并续锁。
       用户在表格上操作时不该看到键盘闪一下，这一步是最后一道兜底。 */
    function rescueKeyboardIfProtected() {
        /* v0.8.90：真收意图优先于一切保护，避免 showKeyboard() 把 IME 叫回 */
        if (userHideActive()) return;
        if (!kbProtected()) return;
        /* v0.8.71：思源官方浮层（公式编辑面板）开着时不救 —— 这里会 arm 续锁 +
           叫 IME，等于把刚让出去的会话又抢回来，与虚拟键盘叠成一坨。 */
        if (mathSessionLive()) return;
        /* v0.8.46：保护窗口内若用户主动收键盘（点编辑器以外），别再叫回来 ——
           否则「用过一次命令后」关不掉键盘。blip 不会触发 lastOutsideTouchAt，不受影响。 */
        if (lastOutsideTouchAt && Date.now() - lastOutsideTouchAt < 600) return;
        /* v0.8.48：用户点软键盘自身收起键 = 真收意图，别再叫回来（genuineKeyboardDismiss）。 */
        if (genuineKeyboardDismiss()) return;
        /* v0.8.69：表格列宽拖拽（触控调宽）—— 与原生一致地让键盘收着。 */
        if (inTableResizeGesture()) return;
        try {
            armKeyboardGuard(true);   // 上面已排除公式会话，这里不需要再让路
            showKeyboard();
            keepKeyboardAlive(600, false, true);
        } catch (e) { /* ignore */ }
    }

    /* v0.8.24：横滑工具条期间**持续**给键盘上锁。
       为什么需要 —— 移动端「软键盘 + 键盘工具条」是联动的：编辑器一失焦，思源就把
       两者同时收起（我们的工具条也跟着隐藏），焦点回来后又一起出现，用户看到的就是
       「在表格工具条上左右滑一下，工具条和键盘一起关掉、再打开」。
       谁在收？activeBlur()（mobile/util/keyboardToolbar.ts），而它开头有一道闸门：
           if (Date.now() < keyboardLockUntil) return;   // keyboardToolbar.ts:728-733
       这把锁由「聚焦可输入元素」触发（思源给 HTMLElement.prototype.focus 打的补丁
       → callMobileAppShowKeyboard → armKeyboardLock，锁 500ms）。
       所以滑动过程中反复 focus 一次「光标自己所在的那个可编辑容器」（caretEditable，
       一个字符都不挪），锁就一直有效，activeBlur 被挡回去 —— 键盘与工具条全程不动。
       节流到 400ms（锁本身 500ms），避免过于频繁地调原生桥接。 */
    let kbGuardLast = 0;
    function armGuardThrottled(force?) {
        /* v0.8.25：改成「把保护窗口往后延」而不是「隔 400ms 戳一下」——
           戳一下只保证那一刻有锁，戳完 500ms 就断；延窗口才能让锁不断档。 */
        kbGuardLast = Date.now();
        keepKeyboardAlive(900, !!force);
    }

    /* 表格动作之后的收尾（v0.8.21）：与快捷工具条同一套 —— 先同步把焦点接回来
       （不给 WebView「失焦」的窗口），再交给 0/60/200/480ms 的延迟复查兜底。
       表格动作有两条会把焦点弄丢的通路：
       · 菜单类 —— 官方回调 focusByRange 之后，内核事务回包会重渲染整个表格块；
       · 列宽 / 视图选择 —— 落库（updateBlock / setBlockAttrs）后思源同样会重渲染该块。 */
    function holdTableKeyboard() {
        const protyle = getProtyle();
        if (protyle) rescueFocus(protyle);
        holdKeyboard();
    }

    /* ================================================== 官方斜杠通道 ====== */
    /* 普通块优先使用 protyle.hint.fillCommand(value, protyle, false)，与本地
       思源 keyboardToolbar.ts:1719 的原生功能块面板一致；旧版没有 fillCommand
       时回退到 fill(value, protyle, false)。updateRange=false 很关键：Range
       已由 ensureRange 按目标编辑器恢复，不能再从 TH/TABLE 假选区刷新。 */
    /* keepHintSplit = true 时（只有 "(( " 与 "{{" 用）不还原 hint.splitChar / lastIndex：
       这两个值的 fill 分支会把 hint 切到引用 / 嵌入模式并打开对应的搜索面板，
       之后用户继续输入时正是靠 splitChar 才能继续过滤、点选时才能走 BLOCK_HINT_KEYS 分支。
       一还原就变成「面板打开了，但一输入就跳回斜杠菜单、点选也插不进引用」。 */
    function fillSlash(value, keepHintSplit?) {
        /* 标题、列表、引述、代码、公式等所有块统一走这里；光标在单元格时
           必须使用单元格自己的 lite Protyle，不能只给公式块做特例。 */
        const protyle = protyleForInsertion();
        if (!protyle || !protyle.hint || typeof protyle.hint.fill !== "function") {
            InsertDiagnostics.trace("fill.abort", {reason: "protyle-or-hint-unavailable", value: InsertDiagnostics.value(value)});
            return false;
        }
        if (!ensureRange(protyle)) {
            InsertDiagnostics.trace("fill.abort", {reason: "range-unavailable", value: InsertDiagnostics.value(value)});
            return false;
        }

        // 前置校验与官方 fill 内部的 hasClosestBlock 对齐：
        // 光标必须落在当前编辑器的某个块内，否则官方会静默返回
        const sc = protyle.toolbar.range.startContainer;
        if (!sc || !sc.isConnected) {
            InsertDiagnostics.trace("fill.abort", {reason: "range-node-disconnected", value: InsertDiagnostics.value(value)});
            return false;
        }
        const host = sc.nodeType === 1 ? sc : sc.parentElement;
        if (!host || !host.closest || !host.closest(".protyle-wysiwyg [data-node-id]")) {
            InsertDiagnostics.trace("fill.abort", {reason: "no-closest-block", value: InsertDiagnostics.value(value), host: InsertDiagnostics.node(host)});
            return false;
        }
        InsertDiagnostics.trace("fill.before", {
            value: InsertDiagnostics.value(value),
            method: !keepHintSplit && typeof (protyle.hint as any).fillCommand === "function" ? "fillCommand" : "fill",
            target: InsertDiagnostics.protyle(protyle),
            closestBlock: InsertDiagnostics.node(host.closest(".protyle-wysiwyg [data-node-id]"))
        });

        let fillMethod = "fill";
        try {
            const hint: any = protyle.hint;
            const oldSplit = hint.splitChar;
            const oldIndex = hint.lastIndex;
            const oldSource = hint.source;
            hint.splitChar = "/";
            hint.lastIndex = -1;
            hint.source = "";
            try {
                if (!keepHintSplit && typeof hint.fillCommand === "function") {
                    /* 原生移动功能块面板入口（keyboardToolbar.ts:1719）。
                       updateRange=false：使用上面恢复到目标编辑器的 toolbar.range，
                       不能让 fill 再从当前 TH/TABLE 假选区刷新 Range。 */
                    fillMethod = "fillCommand";
                    hint.fillCommand(value, protyle, false);
                } else {
                    hint.fill(value, protyle, false);
                }
            } finally {
                /* v0.8.82：原生 fillCommand 会把 hint.source / splitChar / lastIndex
                   设为 "hint" / "/" / -1 并**保留**（keyboardToolbar.ts:1719 →
                   hint/index.ts:1057）。单元格 lite 的候选面板依赖这份状态，
                   回填旧值会让它和原生「＋」面板行为不一致。文档编辑器仍按
                   原逻辑还原，已验证的普通插入不受影响。 */
                if (!keepHintSplit && !(fillMethod === "fillCommand" && protyle.lite)) {
                    hint.splitChar = oldSplit;
                    hint.lastIndex = oldIndex;
                    hint.source = oldSource;
                }
            }
            InsertDiagnostics.trace("fill.return", {
                value: InsertDiagnostics.value(value),
                method: fillMethod,
                target: InsertDiagnostics.protyle(protyle)
            });
            InsertDiagnostics.watchDom(protyle, value);
            if (isMathBlockInsert(value)) {
                /* 公式块会打开思源公式面板 / 公式键盘，系统 IME 必须让出。 */
                yieldKeyboardToMathSession("math-block");
            } else {
                /* 先同步把焦点接回来（见 rescueFocus），再交给延迟复查兜底 */
                rescueFocus(protyle);
                holdKeyboard();
            }
            return true;
        } catch (e) {
            InsertDiagnostics.error("fill.error", e, {value: InsertDiagnostics.value(value)});
            return false;
        }
    }

    /* 通过 hint 的「#」通道走官方 insertHTML（hint/index.ts:852 分支）：
       insertHTML(protyle.lute.SpinBlockDOM(value), protyle, false, isMobile())
       多块内容也能正确进入事务，用于模板内容的兜底插入。 */
    function insertViaHintHTML(content) {
        const protyle = protyleForInsertion();
        if (!protyle || !protyle.hint || typeof protyle.hint.fill !== "function") return false;
        if (!protyle.lute || typeof protyle.lute.Md2BlockDOM !== "function") return false;
        if (!ensureRange(protyle)) return false;
        let dom;
        try {
            dom = protyle.lute.Md2BlockDOM(String(content));
        } catch (e) {
            return false;
        }
        if (!dom) return false;
        try {
            const hint: any = protyle.hint;
            const oldSplit = hint.splitChar;
            const oldIndex = hint.lastIndex;
            const oldSource = hint.source;
            hint.splitChar = "#";
            hint.lastIndex = -1;
            hint.source = "";
            try {
                hint.fill(dom, protyle, false);
            } finally {
                hint.splitChar = oldSplit;
                hint.lastIndex = oldIndex;
                hint.source = oldSource;
            }
            rescueFocus(protyle);
            holdKeyboard();
            return true;
        } catch (e) {
            return false;
        }
    }

    function focusEditable(ceEl) {
        if (!CONFIG.focusAfterInsert || !ceEl) return;
        try {
            ceEl.focus();
            const range = document.createRange();
            range.selectNodeContents(ceEl);
            range.collapse(false);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            showKeyboard();
        } catch (e) { /* ignore */ }
    }

    async function focusBlockEnd(id) {
        if (!CONFIG.focusAfterInsert || !id) return;
        await sleep(220);
        const el = blockEl(id);
        if (!el) return;
        focusEditable(el.querySelector('[contenteditable="true"]'));
        lastBlockId = id;
    }

    /* ================================================== 块操作原语 ======== */
    /* 仅保留「叶子块→叶子块」的 HTTP 更新（段落↔标题、空段落→图片段落），
       结构性变更一律走 fillSlash / insertViaHintHTML，避免内核 panic。 */
    function stripMarkers(md) {
        return String(md || "").replace(
            /^\s{0,3}(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?)+/,
            ""
        );
    }

    async function getKramdown(id) {
        const d = await api("/api/block/getBlockKramdown", { id: id });
        return (d && d.kramdown) || "";
    }

    async function updateMarkdown(id, md) {
        return api("/api/block/updateBlock", { id: id, dataType: "markdown", data: md });
    }

    async function updateDOM(id, html) {
        return api("/api/block/updateBlock", { id: id, dataType: "dom", data: html });
    }

    /* ================================================== 动作：标题 ========= */
    async function actionHeading(level) {
        const id = requireId();
        if (!id) return;
        const el = blockEl(id);
        const type = el && el.getAttribute("data-type");
        const md = new Array(level + 1).join("#") + " ";

        // 段落 / 标题（叶子块→叶子块，安全）
        if (el && (type === "NodeParagraph" || type === "NodeHeading")) {
            // 非空叶子块：直接改 DOM 属性，内容零损耗（v1~v3 验证稳定）
            if (!isBlockEmpty(el)) {
                try {
                    const clone = el.cloneNode(true);
                    clone.setAttribute("data-type", "NodeHeading");
                    clone.setAttribute("data-subtype", "h" + level);
                    clone.setAttribute("class", "h" + level);
                    clone.removeAttribute("data-marker");
                    await updateDOM(id, clone.outerHTML);
                    lastBlockId = id;
                    return;
                } catch (e) { /* 回退 */ }
            }
            // 空段落：优先官方斜杠通道（就地转换）；失败再走 markdown 往返
            if (fillSlash(md + luteCaret())) return;
            try {
                const kram = await getKramdown(id);
                const body = stripMarkers(kram);
                await updateMarkdown(id, md + (body || ZWSP));
                lastBlockId = id;
            } catch (e) {
                toast("转换失败：" + (e.message || e), true);
            }
            return;
        }

        // 其它块类型：官方通道在当前块后插入新标题（与斜杠菜单行为一致）
        if (fillSlash(md + luteCaret())) return;
        toast("请在文档内容的段落或标题上使用标题按钮", true);
    }

    /* ============================================== 动作：任务列表 ========= */
    /* 全程走官方斜杠通道（hint.fill）：
       · 空段落 → 就地转为任务项（hint/index.ts:1018 分支）
       · 非空块 → 在其后续接一个新任务项（hint/index.ts:1069 分支）
       · 列表项内 → 官方自动处理 li>list 结构（#17890 修复）
       不再调用 updateBlock/insertBlock —— 那是之前内核崩溃的根源。 */
    async function actionTask() {
        if (fillSlash(TASK_PREFIX + luteCaret())) return;
        toast("请先点击文档内容，再使用任务列表", true);
    }

    /* ========================================= 动作：无序 / 有序列表 ====== */
    /* 与官方斜杠菜单完全同参（keyboardToolbar.ts renderSlashMenu）：
         无序列表 → "- " + Lute.Caret，图标 iconList
         有序列表 → "1. " + Lute.Caret，图标 iconOrderedList
       同样走 hint.fill，不改块结构 API，因此不会触发内核 panic。 */
    async function actionList(ordered) {
        const prefix = ordered ? "1. " : "- ";
        if (fillSlash(prefix + luteCaret())) return;
        toast("请先点击文档内容，再使用列表", true);
    }

    /* ============================================== 动作：标题面板 ========= */
    /* 一个按钮收纳 H1~H6：点开底部面板选级别，再走原有的 actionHeading。 */
    async function actionHeadingPanel() {
        const levels = (CONFIG.headingLevels && CONFIG.headingLevels.length)
            ? CONFIG.headingLevels : [1, 2, 3, 4, 5, 6];
        const items = levels.map((lv) => ({
            name: lang("heading" + lv, "H" + lv),
            icon: iconHTML("h" + lv),
            level: lv
        }));
        const picked = await showSheet(items);
        if (!picked || !picked.level) return;
        return actionHeading(picked.level);
    }

    /* ============================================== 动作：列表面板 ========= */
    /* 无序 / 有序 / 任务三项合并，插入值与官方斜杠菜单逐字一致。 */
    async function actionListPanel() {
        const items = [
            { name: lang("list", "无序列表"), icon: iconHTML("ul"), act: () => actionList(false) },
            { name: lang("ordered-list", "有序列表"), icon: iconHTML("ol"), act: () => actionList(true) },
            { name: lang("check", "任务列表"), icon: iconHTML("task"), act: actionTask }
        ];
        const picked = await showSheet(items);
        if (!picked || !picked.act) return;
        return picked.act();
    }

    /* 把模板值里的 {C} 换成 Lute.Caret，{T} 等占位符按 extras 替换 */
    function slash(tpl, extras?) {
        let v = String(tpl).replace("{C}", luteCaret());
        if (extras) {
            Object.keys(extras).forEach((k) => {
                v = v.split("{" + k + "}").join(extras[k]);
            });
        }
        return v;
    }

    /* ================================================ 动作：引述 ========== */
    /* 官方斜杠菜单："> " + Lute.Caret，图标 iconQuote */
    async function actionQuote() {
        if (fillSlash(slash(CONFIG.quoteSlash))) return;
        toast("请先点击文档内容，再插入引述", true);
    }

    /* ============================================== 动作：提示块 ========== */
    /* GFM alert，与官方斜杠菜单逐字一致（keyboardToolbar.ts:403-407）：
         "> [!NOTE]\n> ⌶" · "> [!TIP]\n> ⌶" · "> [!IMPORTANT]\n> ⌶"
         "> [!WARNING]\n> ⌶" · "> [!CAUTION]\n> ⌶" */
    async function actionCallout(type) {
        if (fillSlash(slash(CONFIG.calloutSlash, { T: type }))) return;
        toast("请先点击文档内容，再插入提示块", true);
    }

    /* ============================================ 动作：引述面板 ========== */
    /* 引述块 + 提示块 note / tip / important / warning / caution。
       提示块用思源内置 iconCallout，类型名用官方 --b3-callout-* 彩色标签。 */
    async function actionQuotePanel() {
        const cn = lang("callout", "提示块");
        const items = [{
            name: lang("quote", "引述块"),
            icon: iconHTML("quote"),
            act: actionQuote
        }].concat(CALLOUTS.map((c) => ({
            // 官方文案：提示块 - <span style="color: var(--b3-callout-note)">Note</span>
            name: cn + " - " + c.name,
            html: cn + ' - <span style="color: ' + c.color + '">' + c.name + "</span>",
            icon: iconHTML("callout"),
            act: () => actionCallout(c.type)
        })));
        const picked = await showSheet(items);
        if (!picked || !picked.act) return;
        return picked.act();
    }

    /* ================================================ 动作：表格 ========== */
    /* 同任务列表：官方斜杠通道。空段落就地生成表格，光标落在首格；
       非空块在其后插入新表格。 */
    async function actionTable() {
        if (fillSlash(slash(CONFIG.tableSlash))) return;
        toast("请先点击文档内容，再插入表格", true);
    }

    /* ============================================== 动作：数据库 ========== */
    /* 官方斜杠菜单同款空 AV 块（keyboardToolbar.ts:377） */
    async function actionDatabase() {
        if (fillSlash(CONFIG.databaseSlash)) return;
        toast("请先点击文档内容，再插入数据库", true);
    }

    /* ============================================== 动作：表格面板 ========= */
    async function actionTablePanel() {
        const items = [
            { name: lang("table", "表格"), icon: iconHTML("table"), act: actionTable },
            { name: lang("database", "数据库"), icon: iconHTML("database"), act: actionDatabase }
        ];
        const picked = await showSheet(items);
        if (!picked || !picked.act) return;
        return picked.act();
    }

    /* ================================================ 动作：页签 ========== */
    /* 官方斜杠菜单：::: tabs … @tab … :::，图标 iconTabs */
    async function actionTabs() {
        if (fillSlash(slash(CONFIG.tabsSlash))) return;
        toast("请先点击文档内容，再插入页签", true);
    }

    /* ============================================== 动作：代码块 ========== */
    /* 官方斜杠值就是 "```"；hint/index.ts 会补语言与光标，并触发 highlightRender */
    async function actionCode() {
        if (fillSlash(CONFIG.codeSlash)) return;
        toast("请先点击文档内容，再插入代码块", true);
    }

    /* ============================================== 动作：HTML 块 ========== */
    /* 官方斜杠值 "<div>"（keyboardToolbar.ts:412）。hint/index.ts 对 "<div>" 有
       特判：直接生成 NodeHTMLBlock（data-subtype="block"），再 showRender +
       processRender 拉起官方 HTML 编辑框（与 "$$"、"```" 同一分支）。 */
    async function actionHtml() {
        if (fillSlash(CONFIG.htmlSlash)) return;
        toast("请先点击文档内容，再插入 HTML 块", true);
    }

    /* ============================================== 动作：页签面板 ========= */
    async function actionTabsPanel() {
        const items = [
            { name: lang("tab", "页签块"), icon: iconHTML("tabs"), act: actionTabs },
            { name: lang("code", "代码块"), icon: iconHTML("code"), act: actionCode },
            { name: lang("htmlBlock", "HTML 块"), icon: iconHTML("html"), act: actionHtml },
            { name: lang("mindmap", "思维导图"), icon: iconHTML("mindmap"), act: actionMindmap }
        ];
        const picked = await showSheet(items);
        if (!picked || !picked.act) return;
        return picked.act();
    }

    /* ============================================== 动作：公式块 ========== */
    /* 官方斜杠值 "$$"（keyboardToolbar.ts:411）。hint/index.ts 对 "$$" 有
       showRender + processRender 特判，会拉起官方公式编辑框。
       与其它块一样由 fillSlash 统一选择光标所属的 Protyle。 */
    async function actionMath() {
        if (fillSlash(CONFIG.mathSlash)) return;
        toast("请先点击文档内容，再插入公式块", true);
    }

    /* ========================================== 动作：行级公式块 ========== */
    /* 行级公式不是斜杠项，官方走键盘工具条的 inline 动作
       （keyboardToolbar.ts:1010-1013 → protyle/toolbar/InlineMath.ts）：
           protyle.toolbar.setInlineMark(protyle, "inline-math", "range", {type:"inline-math"})
       优先点击官方工具条上的按钮（与官方同一条路径），取不到再直接调 setInlineMark。 */
    /* v0.8.71：插入行级公式后不再**同步**叫 IME。
       思源的路径是 setInlineMark → toolbar.showRender → 面板出现并聚焦 textarea，
       聚焦会走 HTMLElement.prototype.focus 的补丁（mobile/index.ts:141-158 →
       callMobileAppShowKeyboard）把 IME 叫出来 —— 正常流程里这一句本就多余；
       而它多出来的代价是面板刚出现就被 IME 顶掉半屏，与公式键盘叠成一坨。
       兜底保留：260ms 后若思源确实没把面板打开（旧路径 / 无公式插件），再补一次。 */
    function keyboardAfterMathInsert() {
        setTimeout(() => {
            if (destroyed) return;
            if (siyuanPanelOpen() || mathSessionLive() || mathHandoffActive()) return;
            showKeyboard();
        }, 260);
    }

    async function actionInlineMath() {
        /* v0.8.83：与块插入统一走「光标真正所属的 Protyle」。
           旧实现固定用 getProtyle()（文档编辑器）：单元格里点行级公式时，
           toolbar.range 已被重锚到 TH/TABLE，文档层的 setInlineMark 会拿整个
           NodeTable 当「行内块」生成非法事务 —— 用户实测会让思源内核崩溃。
           原生 keyboardToolbar.ts:1842 用的是 getCurrentEditor()（单元格里即
           lite protyle）的 toolbar.element 按钮，按钮闭包捕获的也是那个 protyle，
           所以这里只需把取 Protyle 的方式对齐，其余两条路径保持不变。 */
        const protyle = protyleForInsertion();
        InsertDiagnostics.trace("inline-math.target", {
            target: InsertDiagnostics.protyle(protyle),
            selection: InsertDiagnostics.selection()
        });
        if (!protyle || !ensureRange(protyle)) {
            InsertDiagnostics.trace("inline-math.abort", {
                reason: protyle ? "range-unavailable" : "protyle-unresolved"
            });
            toast("请先点击文档内容，再插入行级公式", true);
            return;
        }
        try {
            const tbar = protyle.toolbar;
            const btn = tbar && tbar.element && tbar.element.querySelector('[data-type="inline-math"]');
            if (btn) {
                btn.dispatchEvent(new CustomEvent("click"));
                yieldKeyboardToMathSession("inline-math");
                keyboardAfterMathInsert();
                return;
            }
        } catch (e) { /* 回退到直接调用 */ }
        try {
            const tbar = protyle.toolbar;
            if (tbar && typeof tbar.setInlineMark === "function") {
                tbar.setInlineMark(protyle, "inline-math", "range", { type: "inline-math" });
                yieldKeyboardToMathSession("inline-math");
                keyboardAfterMathInsert();
                return;
            }
        } catch (e) { /* ignore */ }
        toast("请先点击文档内容，再插入行级公式", true);
    }

    /* ============================================== 动作：公式面板 ========= */
    async function actionMathPanel() {
        const items = [
            { name: lang("math", "公式块"), icon: iconHTML("math"), act: actionMath },
            { name: lang("inline-math", "行级公式"), icon: iconHTML("math"), act: actionInlineMath }
        ];
        const picked = await showSheet(items);
        if (!picked || !picked.act) return;
        return picked.act();
    }

    /* ============================================ 动作：思维导图 ========== */
    /* 官方斜杠菜单：- Caret 换行 + {: custom-sy-list-mindmap="1"}，图标 iconMindmap */
    async function actionMindmap() {
        if (fillSlash(slash(CONFIG.mindmapSlash))) return;
        toast("请先点击文档内容，再插入思维导图", true);
    }

    /* ========================================== 动作：官方斜杠条目（0.5.0）==== */
    /* 把官方斜杠菜单「块功能面板」除超级块以外的条目补齐（对齐思源自带面板截图）。
       每一项的值都与 keyboardToolbar.ts:369-431 逐字一致，统一走 fillSlash ——
       与官方斜杠菜单同一条「本地改 DOM + WebSocket 事务」通道，不碰 HTTP 块 API。 */
    async function actionSlash(value, tip, keepHintSplit?) {
        if (fillSlash(value, keepHintSplit)) return;
        toast(tip, true);
    }

    // 挂件 / 资源 / 引用 / 嵌入块 / AI 编写 / 新建子文档并引用
    async function actionWidget() {
        return actionSlash(CONFIG.widgetSlash, "请先点击文档内容，再插入挂件");
    }
    async function actionAssets() {
        return actionSlash(CONFIG.assetsSlash, "请先点击文档内容，再打开资源");
    }
    async function actionRef() {
        return actionSlash(CONFIG.refSlash, "请先点击文档内容，再插入引用", true);
    }
    async function actionEmbed() {
        return actionSlash(CONFIG.embedSlash, "请先点击文档内容，再插入嵌入块", true);
    }
    async function actionAiWriting() {
        return actionSlash(CONFIG.aiWritingSlash, "请先点击文档内容，再使用 AI 编写");
    }
    async function actionNewSubDocRef() {
        return actionSlash(CONFIG.newSubDocRefSlash, "请先点击文档内容，再新建子文档并引用");
    }

    // 链接类插图
    async function actionIframe() {
        return actionSlash(CONFIG.iframeSlash, "请先点击文档内容，再插入 Iframe 链接");
    }
    async function actionImgUrl() {
        return actionSlash(CONFIG.imgUrlSlash, "请先点击文档内容，再插入图片链接");
    }
    async function actionVideoUrl() {
        return actionSlash(CONFIG.videoUrlSlash, "请先点击文档内容，再插入视频链接");
    }
    async function actionAudioUrl() {
        return actionSlash(CONFIG.audioUrlSlash, "请先点击文档内容，再插入音频链接");
    }
    async function actionEmoji() {
        return actionSlash(CONFIG.emojiSlash, "请先点击文档内容，再插入表情");
    }

    // 分割线
    async function actionLine() {
        return actionSlash(CONFIG.lineSlash, "请先点击文档内容，再插入分割线");
    }

    // 图表语言（全部是「代码块 + 语言」，由官方 processRender 拉起渲染器）
    async function actionStaff() {
        return actionSlash(CONFIG.staffSlash, "请先点击文档内容，再插入五线谱");
    }
    async function actionChart() {
        return actionSlash(CONFIG.chartSlash, "请先点击文档内容，再插入图表");
    }
    async function actionFlowchart() {
        return actionSlash(CONFIG.flowchartSlash, "请先点击文档内容，再插入 Flow Chart");
    }
    async function actionGraphviz() {
        return actionSlash(CONFIG.graphvizSlash, "请先点击文档内容，再插入 Graph");
    }
    async function actionMermaid() {
        return actionSlash(CONFIG.mermaidSlash, "请先点击文档内容，再插入 Mermaid");
    }
    async function actionUml() {
        return actionSlash(CONFIG.umlSlash, "请先点击文档内容，再插入 UML");
    }

    /* 内置样式（信息 / 成功 / 警告 / 错误 / 清除）：
       hint/index.ts:858 把 ZWSP 后面的声明原样写进当前块的 style 属性。 */
    async function actionStyle(kind) {
        const clear = kind === "clear";
        const value = clear ? CONFIG.clearStyleSlash : CONFIG.styleSlash.split("{K}").join(kind);
        return actionSlash(value, clear
            ? "请先点击文档内容，再清除字体样式"
            : "请先点击文档内容，再应用样式");
    }

    /* ============================================ 动作：超级块（0.5.0）====== */
    /* 官方斜杠菜单没有超级块，所以走思源自己的块标菜单通道：
       gutter.turnsIntoOne(...).click() → turnsIntoOneTransaction，
       就是长按块标选「合并为超级块」时执行的同一个函数（gutter/index.ts:1175-1199）。
       布局命名按官方：level "col" = 横向（子块左右排），"row" = 纵向（子块上下排）。
       取到当前块 + 它后面紧邻的同级块（若存在）一起合并，这样一次就能得到两个子块。 */
    async function actionSuperBlock(layout) {
        const protyle = getProtyle();
        const id = requireId();
        const el = id ? blockEl(id) : null;
        if (!protyle || !el || !el.isConnected) {
            toast("请先点击文档内容，再插入超级块", true);
            return;
        }
        const gutter: any = protyle.gutter;
        if (!gutter || typeof gutter.turnsIntoOne !== "function") {
            toast("当前思源版本不支持超级块，请长按块标使用「合并为超级块」", true);
            return;
        }
        const picks = [el];
        const next = el.nextElementSibling;
        if (next && next.hasAttribute && next.hasAttribute("data-node-id") &&
            next.parentElement === el.parentElement) {
            picks.push(next);
        }
        try {
            const item = gutter.turnsIntoOne({
                menuId: layout === "col" ? "hLayout" : "vLayout",
                label: layout === "col" ? "横向超级块" : "纵向超级块",
                protyle: protyle,
                selectsElement: picks,
                type: "BlocksMergeSuperBlock",
                level: layout
            });
            if (item && typeof item.click === "function") {
                item.click();
                showKeyboard();
                return;
            }
        } catch (e) { /* 落到提示 */ }
        toast("创建超级块失败，请长按块标使用「合并为超级块」", true);
    }

    /* ====================================== 动作：插入图片 or 文件 ========= */
    /* 单按钮二选一：短按弹出「图片 / 文件」，长按直接走图片（快捷路径）。
       图片走系统照片选择器（accept 含 application/x-siyuan-image-picker，
       见 MainActivity#requestsSiyuanImagePicker）；文件走任意文件选择器。 */
    async function actionAsset() {
        const picked = await showSheet([
            { name: lang("insertImage", "图片"), icon: iconHTML("image"), kind: "image" },
            { name: lang("insertAsset", "文件"), icon: iconHTML("file"), kind: "file" }
        ]);
        if (!picked || !picked.kind) return;
        return actionInsert(picked.kind);
    }

    function pickFiles(kind) {
        return new Promise<any>((resolve) => {
            const input = document.createElement("input");
            input.type = "file";
            // photo = 直接拉起相机（capture="user"），与官方 Android 端「拍照并插入」一致；
            // 其余情况允许多选
            if (kind === "photo") input.setAttribute("capture", "user");
            else input.multiple = true;
            // application/x-siyuan-image-picker 会让 MainActivity 走系统照片选择器
            input.accept = kind === "file" ? "*/*" : "image/*,application/x-siyuan-image-picker";
            input.style.position = "fixed";
            input.style.left = "-9999px";
            input.style.opacity = "0";
            let done = false;
            input.addEventListener("change", () => {
                done = true;
                const files = Array.prototype.slice.call(input.files || []);
                resolve(files);
                setTimeout(() => input.remove(), 1000);
            });
            document.body.appendChild(input);
            input.click();
            setTimeout(() => {
                if (!done && input.parentNode) input.remove();
            }, 120000);
        });
    }

    async function uploadAssets(files) {
        const fd = new FormData();
        fd.append("assetsDirPath", CONFIG.assetsDirPath);
        files.forEach((f) => fd.append("file[]", f, f.name));
        const res = await fetch("/api/asset/upload", { method: "POST", body: fd });
        const json = await res.json();
        if (json.code !== 0) throw new Error(json.msg || "upload failed");
        return json.data || {};
    }

    /* 多个资源合并为单个段落（软换行），保证 lute 只生成一个块，
       官方 hint.fill 的插入事务才能完整覆盖 */
    function toMarkdown(succMap) {
        const lines = [];
        Object.keys(succMap || {}).forEach((name) => {
            const p = succMap[name];
            if (!p) return;
            lines.push(/\.(png|jpe?g|gif|webp|svg|bmp|avif|heic)$/i.test(p)
                ? "![" + name + "](" + p + ")"
                : "[" + name + "](" + p + ")");
        });
        return lines.join("\n");
    }

    async function actionInsert(kind) {
        const id = requireId();
        if (!id) return;
        try {
            const files = await pickFiles(kind);
            if (!files.length) return;
            setBusy(true);
            const data = await uploadAssets(files);
            if (data.errFiles && data.errFiles.length) {
                toast("部分文件上传失败：" + data.errFiles.join("、"), true);
            }
            const md = toMarkdown(data.succMap);
            if (!md) return;

            // 官方通道：空段落就地替换 / 非空块在其后插入
            if (fillSlash(md)) return;

            // 兜底：仅当当前块是空段落时用 updateBlock（段落→段落，安全）
            const el = blockEl(id);
            const type = el && el.getAttribute("data-type");
            if (type === "NodeParagraph" && isBlockEmpty(el)) {
                await updateMarkdown(id, md);
                await focusBlockEnd(id);
            } else {
                toast("插入失败：请把光标放进文档内容后重试", true);
            }
        } catch (e) {
            toast("插入失败：" + (e.message || e), true);
        } finally {
            setBusy(false);
        }
    }

    /* ================================================ 动作：模板 ========== */
    /* 官方通道：hint.fill(ZWSP) → hint/index.ts:890 分支 →
       protyle.toolbar.showTpl(protyle, nodeElement, range)，与官方斜杠菜单
       「模板」完全一致（含 .action / Sprig 渲染）。 */
    function actionTemplate() {
        if (fillSlash(ZWSP)) return;
        return actionTemplateFallback();
    }

    async function listTemplates(dir?, depth?) {
        dir = dir || CONFIG.templatesDir;
        depth = depth || 0;
        let items = [];
        try {
            items = (await api("/api/file/readDir", { path: dir })) || [];
        } catch (e) {
            return [];
        }
        const out = [];
        for (let i = 0; i < items.length; i++) {
            const it = items[i];
            if (it.isDir) {
                if (depth < CONFIG.templatesDepth) {
                    out.push.apply(out, await listTemplates(dir + "/" + it.name, depth + 1));
                }
            } else if (/\.md$/i.test(it.name)) {
                out.push({
                    name: it.name.replace(/\.md$/i, ""),
                    path: dir + "/" + it.name
                });
            }
        }
        return out;
    }

    async function renderTemplate(relPath, docId) {
        const ws = (window.siyuan && window.siyuan.config && window.siyuan.config.system &&
                    (window.siyuan.config.system.workspaceDir || (window.siyuan as any).config.system.workspacePath)) || "";
        const candidates = [];
        if (ws) {
            candidates.push(String(ws).replace(/[\\/]+$/, "") + "/" + String(relPath).replace(/^\/+/, ""));
        }
        candidates.push(String(relPath).replace(/^\/+/, ""));
        candidates.push(relPath);

        for (let i = 0; i < candidates.length; i++) {
            try {
                const d = await api("/api/template/render", { id: docId, path: candidates[i] });
                if (d && typeof d.content === "string") return d.content;
            } catch (e) { /* 换下一个候选路径 */ }
        }

        // 兜底：直接读取模板原文（不做 .action / Sprig 渲染）
        try {
            const res = await fetch("/api/file/getFile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: relPath })
            });
            const txt = await res.text();
            try {
                const j = JSON.parse(txt);
                if (j && j.content != null) return String(j.content);
                if (j && typeof j.data === "string") return j.data;
            } catch (e) { /* 纯文本 */ }
            return txt;
        } catch (e) {
            throw new Error("模板渲染失败");
        }
    }

    async function actionTemplateFallback() {
        const id = requireId();
        if (!id) return;
        try {
            const list = await listTemplates();
            if (!list.length) {
                toast("未找到模板（" + CONFIG.templatesDir + "）", true);
                return;
            }
            const picked = await showSheet(list);
            if (!picked) return;
            setBusy(true);
            const content = await renderTemplate(picked.path, getDocId() || id);
            if (!content) {
                toast("模板内容为空", true);
                return;
            }
            // 官方 insertHTML 通道（多块内容安全）
            if (insertViaHintHTML(content)) return;
            // 最后兜底：空段落 + 单段落模板 → updateBlock（段落→段落，安全）
            const el = blockEl(id);
            const ok = el && el.getAttribute("data-type") === "NodeParagraph" &&
                       isBlockEmpty(el) && !/\n\s*\n/.test(content);
            if (ok) {
                await updateMarkdown(id, content);
                await focusBlockEnd(id);
                return;
            }
            toast("当前环境不支持插入模板", true);
        } catch (e) {
            toast("模板插入失败：" + (e.message || e), true);
        } finally {
            setBusy(false);
        }
    }

    /* ================================================= 底部面板 ============ */
    /* 三种关闭方式：点条目 / 点遮罩 / 按住顶部小横条下滑。
       下滑关闭只改 panel 的 transform，不触发 focus/blur，所以软键盘不会被收起。 */
    let sheetCloser = null;
    /* v0.8.98：面板是快捷工具条的「伴生物」—— 键盘收起、工具条隐藏时，
       面板/选择器必须一起关闭，不能独自留在屏幕上。
       showSheet() 与 showWheelPicker() 共用 sheetCloser，一处覆盖两种面板。 */
    function closeCompanionPanels() {
        if (!sheetCloser) return;
        /* v0.8.99：与用户主动关闭区分开 —— 这条是「键盘收起把面板一起带走」 */
        InsertDiagnostics.perf.note("perf.panel", { act: "close-by-keyboard" });
        const closer = sheetCloser;
        sheetCloser = null;
        /* 打开面板时记下的「守住键盘」标志必须一并清掉：close() 里的
           keepKeyboardAlive(900) 会把刚收起的 IME 又唤回来。 */
        sheetHeldKb = false;
        pickerHeldKb = false;
        try { closer(null); } catch (e) { /* ignore */ }
    }
    let sheetHeldKb = false;   // v0.8.72：打开面板时键盘本来是开着的 → 面板期间守住它
    let pickerHeldKb = false;  // v0.8.72：同上，滚轮选择器期间
    let pickerEl = null;   // 日期 / 时间滚轮选择面板（v10）

    function bindSheetDrag(sheetEl) {
        const panel = sheetEl.querySelector(".sy-mb-panel");
        const zone = sheetEl.querySelector(".sy-mb-grip-zone");
        if (!panel || !zone) return;
        if (zone.getAttribute("data-sy-drag") === "1") return;
        zone.setAttribute("data-sy-drag", "1");

        let startY = 0, dy = 0, dragging = false, startAt = 0;

        function finish() {
            if (!dragging) return;
            dragging = false;
            const dist = dy;
            const quick = dist > 24 && (Date.now() - startAt) < 260;  // 快速甩一下也算
            dy = 0;
            panel.style.transition = "";
            panel.style.transform = "";
            if (dist >= CONFIG.sheetDragClosePx || quick) {
                const c = sheetCloser;
                sheetCloser = null;
                if (c) c(null);
            }
        }

        zone.addEventListener("touchstart", (ev) => {
            const t = ev.touches && ev.touches[0];
            if (!t) return;
            startY = t.clientY; dy = 0; dragging = true; startAt = Date.now();
            panel.style.transition = "none";
            // v0.8.39：拖拽握把按下也武装守卫 + 阻止默认，避免编辑器失焦收键盘
            barTouching = true;
            if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
            if (ev.cancelable) ev.preventDefault();
        }, { passive: false });

        zone.addEventListener("touchmove", (ev) => {
            if (!dragging) return;
            const t = ev.touches && ev.touches[0];
            if (!t) return;
            dy = Math.max(0, t.clientY - startY);
            panel.style.transform = "translateY(" + dy + "px)";
            // 只阻止页面滚动；不影响当前输入焦点
            if (ev.cancelable) ev.preventDefault();
        }, { passive: false });

        zone.addEventListener("touchend", finish);
        zone.addEventListener("touchcancel", finish);

        // 桌面端（鼠标）同样可以拖
        let mouseDown = false;
        zone.addEventListener("mousedown", (ev) => {
            mouseDown = true;
            startY = ev.clientY; dy = 0; startAt = Date.now();
            panel.style.transition = "none";
            ev.preventDefault();
        });
        window.addEventListener("mousemove", (ev) => {
            if (!mouseDown) return;
            dy = Math.max(0, ev.clientY - startY);
            panel.style.transform = "translateY(" + dy + "px)";
        });
        window.addEventListener("mouseup", () => {
            if (!mouseDown) return;
            mouseDown = false;
            finish();
        });
    }

    /* 点选判定（v8.2）：面板列表滑动（位移 > 10px）视为滚动，抬手不选中；
       只有位移 ≤ 10px 的真正点击才触发条目。touchend 与 click 双保险，
       个别 WebView 滚动后仍补发 click，也会被 moved 标记拦下。 */
    const SHEET_TAP_PX = 10;

    function bindSheetTap(row, onTap) {
        let startX = 0, startY = 0, moved = false;
        row.addEventListener("touchstart", (ev) => {
            sealEvent(ev);
            const t = ev.touches && ev.touches[0];
            if (!t) return;
            startX = t.clientX;
            startY = t.clientY;
            moved = false;
            /* v0.8.39：面板/弹选内部的子项点按发生在浮层里、不走工具条 bar 的
               sealBarTouches，所以过去没有「阻止默认 + 武装守卫」。结果点子项时
               编辑器失焦 → 原生收键盘 → act() 执行后重聚焦 → 键盘又弹。
               这里镜像 bindButton：preventDefault 保住焦点，并武装 barTouching
               守卫覆盖 act() 执行窗口（尾巴留 900ms，同 sealBarTouches）。 */
            barTouching = true;
            if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
            if (ev.cancelable) ev.preventDefault();
        }, { passive: false });
        row.addEventListener("touchmove", (ev) => {
            const t = ev.touches && ev.touches[0];
            if (!t) return;
            if (Math.abs(t.clientX - startX) > SHEET_TAP_PX ||
                Math.abs(t.clientY - startY) > SHEET_TAP_PX) {
                moved = true;
            }
        }, { passive: true });
        row.addEventListener("touchend", (ev) => {
            sealEvent(ev);
            if (moved) return;
            if (ev.cancelable) ev.preventDefault();
            onTap();
        }, { passive: false });
        row.addEventListener("click", (ev) => {
            sealEvent(ev);
            if (moved) return;
            onTap();
        });
    }

    /* 面板不带标题（v8.2 移除左上角面板名，24px 高度直接还给列表）。 */
    function showSheet(items) {
        return new Promise<any>((resolve) => {
            /* v0.8.100：快速连点不同按钮时，上一张面板的 Promise 会永远挂起、
               sheetCloser 被覆盖、keepKeyboardAlive(20000) 反复叠加（实测连点
               18 次＝18 层续锁，键盘保护窗口被无限延长）。这里先把上一张按
               「用户放下旧面板」关掉，让它 resolve(null)、释放续锁。 */
            if (sheetCloser) {
                const prev = sheetCloser;
                sheetCloser = null;
                sheetHeldKb = false;
                pickerHeldKb = false;
                try { prev(null); } catch (e) { /* ignore */ }
            }
            const panel = sheet.querySelector(".sy-mb-panel");
            const listEl = sheet.querySelector(".sy-mb-list");
            panel.style.transition = "";
            panel.style.transform = "";
            listEl.innerHTML = "";
            // 排布（v8.4）：条目数超过 CONFIG.sheetSingleMaxRows（默认 3 行）改用多列
            const cols = (CONFIG.sheetColumns > 1 && items.length > CONFIG.sheetSingleMaxRows)
                ? CONFIG.sheetColumns : 1;
            if (cols > 1) {
                listEl.classList.add("sy-mb-list--grid");
                listEl.style.setProperty("--sy-mb-cols", String(cols));
            } else {
                listEl.classList.remove("sy-mb-list--grid");
                listEl.style.removeProperty("--sy-mb-cols");
            }
            if (!items.length) {
                listEl.appendChild(ce("div", "sy-mb-empty", "暂无内容"));
            }
            items.forEach((it) => {
                const row = ce("div", "sy-mb-item", "");
                if (it.icon) {
                    row.appendChild(ce("span", "sy-mb-item-icon", it.icon));
                }
                const label = ce("span", "sy-mb-item-text");
                // name 是纯文本；html 用于官方同款的彩色标签（提示块 - Note）
                if (it.html) { label.innerHTML = it.html; } else { label.textContent = it.name; }
                row.appendChild(label);
                if (it.path) row.setAttribute("data-path", it.path);
                bindSheetTap(row, () => close(it));
                listEl.appendChild(row);
            });

            const mask = sheet.querySelector(".sy-mb-mask");
            const onMask = (ev) => { sealEvent(ev); close(null); };
            // 触屏：按下即 preventDefault，避免焦点跑掉把软键盘一起收了
            const onMaskTouch = (ev) => {
                sealEvent(ev);
                if (ev.cancelable) ev.preventDefault();
                close(null);
            };
            mask.addEventListener("click", onMask);
            // v0.8.39：mask 按下也武装守卫 + 阻止默认，关面板时软键盘别塌
            const onMaskTouchStart = (ev) => {
                sealEvent(ev);
                barTouching = true;
                if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
                if (ev.cancelable) ev.preventDefault();
            };
            mask.addEventListener("touchstart", onMaskTouchStart, { passive: false });
            mask.addEventListener("touchend", onMaskTouch, { passive: false });

            function close(val) {
                mask.removeEventListener("click", onMask);
                mask.removeEventListener("touchend", onMaskTouch);
                sheetCloser = null;
                /* v0.8.51：面板/选择器关闭时必须撤销「焦点守卫」状态。
                   面板浮层里的 mask / 子项 / 握把触摸会置 barTouching=true 护住焦点，
                   但它们**不**走工具条 bar 的 sealBarTouches（那里才有 900ms 重置计时器），
                   所以 barTouching 关面板后一直卡在 true → 焦点守卫（blur 守卫）恒真 →
                   HTMLElement.prototype.blur 对可编辑元素变空操作。而思源「关键盘」
                   （键盘工具条折叠键）与「点 ＋ 打开块功能面板」都靠 blur 编辑器
                   来交还焦点，blur 被吞掉后编辑器焦点不掉、IME 立刻回弹 =
                   ① 折叠键关不掉键盘（关了又弹）；② ＋ 面板被键盘遮挡。
                   工具条本身无此路径（它不打开面板），故不中招。这里在关闭瞬间
                   显式复位，让 blur 守卫恢复正常——面板内交互期间仍由上面的
                   barTouching=true 护住，互不影响。 */
                barTouching = false;
                if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
                sheet.classList.remove("sy-mb-open");
                InsertDiagnostics.perf.note("perf.panel", { act: "close", panel: "sheet" });
                panel.style.transition = "";
                panel.style.transform = "";
                /* v0.8.99：关面板后 300ms 内卸载插件时 sheet 已被置 null，
                   这里必须防御 —— 否则定时器回调抛错（测试现场复现过）。 */
                /* v0.8.100：切换面板时这条 300ms 延时可能落在新面板打开之后，
                   若直接隐藏会闪一下。只有当前确实没有面板在展开时才隐藏。 */
                setTimeout(() => {
                    if (sheet && !sheet.classList.contains("sy-mb-open")) {
                        sheet.style.display = "none";
                    }
                }, 300);
                /* v0.8.72：面板这一屏的键盘保护到此结束，只留一个很短的过渡窗口
                   （盖住关面板那一下的失焦 + 落库重渲染），随后交给插入流程自己续锁。 */
                if (sheetHeldKb) {
                    sheetHeldKb = false;
                    try { keepKeyboardAlive(900); } catch (e) { /* ignore */ }
                }
                resolve(val);
            }

            sheetCloser = close;
            bindSheetDrag(sheet);

            /* v0.8.73：键盘守护必须在面板显示**之前**武装。
               原来的顺序是先 display:block、再 keyboardUpNow() —— 而这时思源
               可能已经 activeBlur 过，activeElement 掉回 body，keyboardUpNow()
               返回 false，整段续锁被跳过，于是「面板一弹出、输入法键盘先没了，
               只剩面板」。现在改成：按下瞬间的状态 + 现在是否还在，任一为真就守；
               而且先 armKeyboardGuard()（必要时补一发 showKeyboard）再显示。 */
            sheetHeldKb = kbWasUp();
            if (sheetHeldKb) {
                /* v0.8.74：判据从「siyuanPanelOpen()」换成「公式会话真有 math-field」。
                   两次现场栽的都是同一件事 —— 把一个**可能为真**的软判据当成让路条件，
                   于是用户的输入法键盘在「还没选任何功能」的这一刻被交了出去。
                   此处的裁决只问 DOM：可见浮层里真有 math-field 吗？
                     · 有 → 公式会话在跑，键盘归数学键盘插件，本插件不插手；
                     · 没有 → 用户只是在看面板，一个字都还没选，键盘必须留住。 */
                if (!mathSessionLive()) {
                    try { armKeyboardGuard(true); } catch (e) { /* ignore */ }
                    try { if (!keyboardUpNow()) showKeyboard(); } catch (e) { /* ignore */ }
                    try { keepKeyboardAlive(20000, true, true); } catch (e) { /* ignore */ }
                } else {
                    sheetHeldKb = false;
                }
            }
            kbDiag("sheet open held=" + (sheetHeldKb ? 1 : 0) +
                " up=" + (keyboardUpNow() ? 1 : 0) +
                " sy=" + (siyuanPanelOpen() ? 1 : 0) +
                " mf=" + (mathSessionLive() ? 1 : 0));

            sheet.style.display = "block";
            InsertDiagnostics.perf.note("perf.panel", {
                act: "open", panel: "sheet", heldKb: !!sheetHeldKb
            });
            requestAnimationFrame(() => sheet.classList.add("sy-mb-open"));
        });
    }

    /* ============================================ 日期 / 时间滚轮选择 ===== */
    /* v10：写入通道 = document.execCommand("insertText") —— 思源自家同款
       （protyle/toolbar/index.ts:1404 的 Tab、protyle/header/Title.ts 的标题改名），
       走标准 input 事件管道 → wysiwyg 输入处理 → 事务同步。
       纯文本只落在叶子块内容里，不改块结构，不碰 HTTP 块 API。 */
    const WEEK_CN = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

    function pad2(n) { return (n < 10 ? "0" : "") + n; }

    function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

    let pickerRange = null;

    /* 打开选择器前把光标区间存下来：滚轮面板期间不抢焦点，
       点「插入」时再恢复区间并写入 */
    function captureRange(tip) {
        const protyle = getProtyle();
        if (!protyle || !ensureRange(protyle) || !protyle.toolbar.range) {
            toast(tip, true);
            return null;
        }
        return protyle.toolbar.range.cloneRange();
    }

    function insertPlainText(text, range, tip) {
        try {
            if (!range || !range.startContainer || !range.startContainer.isConnected) {
                toast(tip, true);
                return false;
            }
            const host = range.startContainer.nodeType === 1
                ? range.startContainer : range.startContainer.parentElement;
            const editable = host && host.closest ? host.closest('[contenteditable="true"]') : null;
            if (editable && editable.focus) {
                try { editable.focus({ preventScroll: true }); } catch (e) { editable.focus(); }
            }
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            const ok = document.execCommand("insertText", false, text);
            if (!ok) throw new Error("execCommand failed");
            holdKeyboard();
            return true;
        } catch (e) {
            toast(tip, true);
            return false;
        }
    }

    /* 单列滚轮：scroll-snap 吸附 + 停止后回吸；点击条目直接选中（滑动不算）。
       ITEM_H 必须与 CSS 的 .sy-wheel-item 高度保持一致。 */
    function buildWheel(col, values, initIdx, onChange) {
        const ITEM_H = 40;
        const TILT_PER_ROW = 15;   // v10.2：每偏离选中带一行的 rotateX 角度（度）
        let vals = values.slice();
        let idx = Math.max(0, Math.min(vals.length - 1, initIdx || 0));
        let els = [];
        let raf: any = 0, still: any = 0;

        /* v10.2：类 iOS 圆柱滚轮。条目与选中带的行距 d（0 = 正处带中）→
           rotateX（上下两端像圆柱面一样向后弯）、轻微缩放、随距离淡出。
           内容上下各有 80px 垫层且视口高 200px，故 d = k - scrollTop / ITEM_H。
           只写 style，不触发布局；超出 3 行直接透明并还原 transform。 */
        function paintFx() {
            const scroll = col.scrollTop;
            for (let k = 0; k < els.length; k++) {
                const d = k - scroll / ITEM_H;
                const ad = Math.abs(d);
                const st = els[k].style;
                if (ad >= 3) {
                    if (st.opacity !== "0") { st.opacity = "0"; st.transform = "none"; }
                    continue;
                }
                st.opacity = Math.max(0, 1 - ad * 0.35).toFixed(3);
                st.transform = "perspective(700px) rotateX(" +
                    Math.max(-38, Math.min(38, -d * TILT_PER_ROW)).toFixed(2) + "deg) scale(" +
                    (1 - Math.min(ad * ad * 0.02, 0.15)).toFixed(3) + ")";
            }
        }

        function paint() {
            els.forEach((el, k) => el.classList.toggle("sel", k === idx));
            paintFx();
            if (onChange) onChange(idx);
        }
        function measure() {
            const i = Math.max(0, Math.min(vals.length - 1, Math.round(col.scrollTop / ITEM_H)));
            if (i !== idx) { idx = i; paint(); }
        }
        function fill(list) {
            vals = list.slice();
            idx = Math.max(0, Math.min(vals.length - 1, idx));
            col.innerHTML = "";
            const mkPad = () => {
                const p = document.createElement("div");
                p.className = "sy-wheel-pad";
                col.appendChild(p);
            };
            mkPad();
            els = vals.map((v) => {
                const it = document.createElement("div");
                it.className = "sy-wheel-item";
                it.textContent = v;
                col.appendChild(it);
                return it;
            });
            mkPad();
            els.forEach((el, k) => {
                let sy = 0, moved = false;
                el.addEventListener("touchstart", (ev) => {
                    const t = ev.touches && ev.touches[0];
                    sy = t ? t.clientY : 0;
                    moved = false;
                }, { passive: true });
                el.addEventListener("touchmove", (ev) => {
                    const t = ev.touches && ev.touches[0];
                    if (t && Math.abs(t.clientY - sy) > 10) moved = true;
                }, { passive: true });
                el.addEventListener("click", () => {
                    if (moved) return;
                    idx = k;
                    paint();
                    col.scrollTo({ top: idx * ITEM_H, behavior: "smooth" });
                });
            });
            col.scrollTop = idx * ITEM_H;
        }

        col.addEventListener("scroll", () => {
            if (!raf) raf = requestAnimationFrame(() => { raf = 0; paintFx(); measure(); });
            clearTimeout(still);
            still = setTimeout(() => {
                const top = idx * ITEM_H;
                if (Math.abs(col.scrollTop - top) > 2) {
                    col.scrollTo({ top: top, behavior: "smooth" });
                }
            }, 160);
        }, { passive: true });

        fill(vals);
        return {
            get: () => idx,
            sync: () => { col.scrollTop = idx * ITEM_H; paint(); },
            rebuild: (list) => { fill(list); paint(); }
        };
    }

    /* 通用滚轮选择面板：头部 [取消 | 显示区 | 插入]，下面若干列滚轮。
       config: {
         columns: [{ values, init }]        每列取值与初始下标
         display(wheels) -> html            头部显示区（日期带星期，滚动实时跟随）
         value(wheels)   -> string          点「插入」写入文档的纯文本
         onChange(idx, colIndex, wheels)    任一列变动（日列随年月重建）
       } */
    function showWheelPicker(config) {
        return new Promise<any>((resolve) => {
            const mask = pickerEl.querySelector(".sy-mb-mask");
            const panel = pickerEl.querySelector(".sy-mb-panel");
            const display = pickerEl.querySelector(".sy-picker-display");
            const stage = pickerEl.querySelector(".sy-picker-stage");
            const btnCancel = pickerEl.querySelector(".sy-picker-cancel");
            const btnOk = pickerEl.querySelector(".sy-picker-ok");

            const wheels = [];
            let ready = false;

            function refresh() {
                if (ready && config.display) display.innerHTML = config.display(wheels);
            }

            stage.querySelectorAll(".sy-wheel").forEach((n) => n.remove());
            config.columns.forEach((c, ci) => {
                const col = document.createElement("div");
                col.className = "sy-wheel";
                stage.appendChild(col);
                wheels.push(buildWheel(col, c.values, c.init, (i) => {
                    if (!ready) return;
                    if (config.onChange) config.onChange(i, ci, wheels);
                    refresh();
                }));
            });

            function close(val) {
                pickerEl.classList.remove("sy-mb-open");
                InsertDiagnostics.perf.note("perf.panel", { act: "close", panel: "picker" });
                panel.style.transition = "";
                panel.style.transform = "";
                btnCancel.onclick = null; btnCancel.ontouchend = null;
                btnOk.onclick = null; btnOk.ontouchend = null;
                mask.onclick = null; mask.ontouchend = null;
                sheetCloser = null;
                /* v0.8.51：与 showSheet.close 同口径——拖拽握把（bindSheetDrag）会置
                   barTouching=true 护住焦点，但 picker 关闭出口不重置它，会像面板那样
                   卡死 blur 守卫、导致原生折叠键 / ＋ 面板异常。这里一并复位。 */
                barTouching = false;
                if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
                setTimeout(() => {
                    if (pickerEl && !pickerEl.classList.contains("sy-mb-open")) {
                        pickerEl.style.display = "none";
                    }
                }, 300);
                /* v0.8.72：与选择面板同口径 —— 滚轮可能滚很久，期间键盘别塌。 */
                if (pickerHeldKb) {
                    pickerHeldKb = false;
                    try { keepKeyboardAlive(900); } catch (e) { /* ignore */ }
                }
                resolve(val);
            }

            const cancel = () => close(null);
            const confirm = () => close(config.value ? config.value(wheels) : null);
            btnCancel.onclick = (ev) => { sealEvent(ev); cancel(); };
            btnCancel.ontouchend = (ev) => { sealEvent(ev); if (ev.cancelable) ev.preventDefault(); cancel(); };
            btnOk.onclick = (ev) => { sealEvent(ev); confirm(); };
            btnOk.ontouchend = (ev) => { sealEvent(ev); if (ev.cancelable) ev.preventDefault(); confirm(); };
            mask.onclick = (ev) => { sealEvent(ev); cancel(); };
            mask.ontouchend = (ev) => { sealEvent(ev); if (ev.cancelable) ev.preventDefault(); cancel(); };
            sheetCloser = close;   // 小横条下滑关闭走同一出口

            /* v0.8.73：与选择面板同口径 —— 显示之前先守住键盘。
               滚轮选择期间也守住（本来就是开着的才守）。 */
            pickerHeldKb = kbWasUp();
            if (pickerHeldKb) {
                if (!mathSessionLive()) {
                    try { armKeyboardGuard(true); } catch (e) { /* ignore */ }
                    try { if (!keyboardUpNow()) showKeyboard(); } catch (e) { /* ignore */ }
                    try { keepKeyboardAlive(20000, true, true); } catch (e) { /* ignore */ }
                } else {
                    pickerHeldKb = false;
                }
            }
            kbDiag("picker open held=" + (pickerHeldKb ? 1 : 0) +
                " up=" + (keyboardUpNow() ? 1 : 0) +
                " sy=" + (siyuanPanelOpen() ? 1 : 0) +
                " mf=" + (mathSessionLive() ? 1 : 0));

            pickerEl.style.display = "block";
            InsertDiagnostics.perf.note("perf.panel", {
                act: "open", panel: "picker", heldKb: !!pickerHeldKb
            });
            ready = true;
            refresh();
            requestAnimationFrame(() => {
                pickerEl.classList.add("sy-mb-open");
                wheels.forEach((w) => w.sync());
            });
        });
    }

    /* ========================================== 动作：日期时间面板 ========= */
    async function actionDatetimePanel() {
        const picked = await showSheet([
            { name: lang("date", "日期"), icon: iconHTML("date"), act: actionPickDate },
            { name: lang("time", "时间"), icon: iconHTML("time"), act: actionPickTime }
        ]);
        if (!picked || !picked.act) return;
        return picked.act();
    }

    async function actionPickDate() {
        const range = captureRange("请先点击文档内容，再插入日期");
        if (!range) return;
        const now = new Date();
        const y0 = now.getFullYear();
        const years = [];
        for (let y = y0 - CONFIG.dateYearSpan; y <= y0 + CONFIG.dateYearSpan; y++) years.push(String(y));
        const months = [];
        for (let m = 1; m <= 12; m++) months.push(pad2(m));
        const daysFor = (y, m) => {
            const list = [];
            for (let d = 1; d <= daysInMonth(y, m); d++) list.push(pad2(d));
            return list;
        };

        const text = await showWheelPicker({
            columns: [
                { values: years, init: Math.max(0, years.indexOf(String(y0))) },
                { values: months, init: now.getMonth() },
                { values: daysFor(y0, now.getMonth() + 1), init: now.getDate() - 1 }
            ],
            onChange: (i, ci, wheels) => {
                // 年或月变了 → 按当月天数重建「日」列（越界自动收口）
                if (ci === 0 || ci === 1) {
                    const y = +years[wheels[0].get()];
                    const m = wheels[1].get() + 1;
                    wheels[2].rebuild(daysFor(y, m));
                }
            },
            display: (wheels) => {
                const y = +years[wheels[0].get()];
                const m = wheels[1].get() + 1;
                const d = wheels[2].get() + 1;
                const wd = WEEK_CN[new Date(y, m - 1, d).getDay()];
                const off = wd === "星期六" || wd === "星期日";
                return y + "-" + pad2(m) + "-" + pad2(d) +
                    ' <span class="sy-picker-week' + (off ? " sy-picker-week--off" : "") +
                    '">' + wd + "</span>";
            },
            value: (wheels) => {
                const y = +years[wheels[0].get()];
                const m = wheels[1].get() + 1;
                const d = wheels[2].get() + 1;
                return y + "-" + pad2(m) + "-" + pad2(d);
            }
        });
        if (!text) return;
        insertPlainText(text, range, "插入日期失败，请重试");
    }

    async function actionPickTime() {
        const range = captureRange("请先点击文档内容，再插入时间");
        if (!range) return;
        const now = new Date();
        const step = Math.max(1, CONFIG.timeStepMin || 10);
        const hours = [];
        for (let h = 0; h < 24; h++) hours.push(pad2(h));
        const mins = [];
        for (let m = 0; m < 60; m += step) mins.push(pad2(m));

        const text = await showWheelPicker({
            columns: [
                { values: hours, init: now.getHours() },
                { values: mins, init: Math.min(mins.length - 1, Math.floor(now.getMinutes() / step)) }
            ],
            display: (wheels) => hours[wheels[0].get()] + ":" + mins[wheels[1].get()],
            value: (wheels) => hours[wheels[0].get()] + ":" + mins[wheels[1].get()]
        });
        if (!text) return;
        insertPlainText(text, range, "插入时间失败，请重试");
    }

    /* ============================================ 原生底栏避让 ============ */
    function visibleLike(el, cs) {
        const s = cs || getComputedStyle(el);   // cs 由调用方传入可省掉一次 getComputedStyle
        if (s.display === "none" || s.visibility === "hidden") return false;
        if (parseFloat(s.opacity || "1") < 0.15) return false;
        return true;
    }

    /* 思源键盘工具条状态：open = 正在显示；util = 斜杠工具面板展开（变高） */
    function keyboardBarState() {
        const kb = document.getElementById("keyboardToolbar");
        if (!kb || kb.classList.contains("fn__none")) {
            return { open: false, util: false, el: kb, top: 0, stack: 0 };
        }
        const vw = viewportW();
        const r = kb.getBoundingClientRect();
        if (r.height <= 0 || r.width < vw * 0.5) {
            return { open: false, util: false, el: kb, top: 0, stack: 0 };
        }
        return {
            open: true,
            util: r.height > CONFIG.utilOpenPx,
            el: kb,
            top: r.top,   // v9：rect 只读这一次，供 detectBottomBars 复用
            stack: Math.max(0, Math.round(viewportH() - r.top))
        };
    }

    /* v9：底栏检测拆成两段。
       · 键盘工具条是定位基准，每次测量都直接读取（一次 getElementById + rect，开销小）；
       · 其余底栏（已知选择器 + 全量几何探测）开销大，抽出为 runBottomScan，
         结果缓存 + 「脏标记 + 最小间隔」节流：DOM 变化只标脏，到达
         CONFIG.autoScanMinMs 才真正重扫；键盘打开 / 旋转 / 调试 refresh() 强制立即扫。
         打字期间 DOM 高频变化，原先每次测量都全树扫一遍，现在 ~2s 才扫一次。 */
    function detectBottomBars() {
        const vh = viewportH();
        const vw = viewportW();
        let top = vh;
        let hit = null;
        let kbZ = 0;

        // 键盘工具条优先：它贴着软键盘上沿，是本工具条的定位基准
        const kbState = keyboardBarState();
        if (kbState.open && kbState.el) {
            if (kbState.top < top) { top = kbState.top; hit = kbState.el; }
            try { kbZ = parseInt(getComputedStyle(kbState.el).zIndex, 10) || 0; } catch (e) { /* ignore */ }
        }

        const now = Date.now();
        if (scanForce || (scanDirty && now - scanAt >= CONFIG.autoScanMinMs)) {
            // 深扫描（全树）只在强制刷新时、或距上次 ≥ deepScanMinMs 时才跑
            const deep = CONFIG.autoDetectBottomBars &&
                         (scanForce || now - deepScanAt >= CONFIG.deepScanMinMs) &&
                         (kbOpenedAt === 0 || now - kbOpenedAt >= 300);
            if (InsertDiagnostics.perf.isEnabled()) {
                InsertDiagnostics.perf.timed("scan", () => runBottomScan(vh, vw, deep));
            } else {
                runBottomScan(vh, vw, deep);
            }
            scanAt = now;
            if (deep) deepScanAt = now;
            scanDirty = false;
            scanForce = false;
        }
        /* v0.8.91：原生键盘工具条是唯一可信的定位基准。它可见时，自动探测
           的缓存元素最多只能在它上方再让 24px，绝不允许把 top 一路推到内容区
           —— 那正是「工具条被顶到图片块上方」的直接原因。基准缺失时
           （旧版本 / 原生工具条隐藏）保留原来的自动探测作为兜底。 */
        const trustedTop = kbState.open && kbState.el ? kbState.top : -Infinity;
        const topFloor = trustedTop - 24;
        // 复用上一轮的命中元素：重读一次 rect，仍贴底才继续避让
        const reuse = (el) => {
            if (!el || !el.isConnected) return;
            /* 编辑器内容树里的元素（图片块、图片浮层、拖拽手柄…）不是原生底栏 */
            if (el.closest && el.closest(".protyle-wysiwyg")) return;
            const r = el.getBoundingClientRect();
            if (r.height < 20 || r.height > vh * 0.4) return;
            if (r.width < vw * 0.5 || r.bottom < vh - 18) return;
            if (r.top < top && r.top >= topFloor) { top = r.top; hit = el; }
        };
        reuse(scanHitS);
        reuse(scanHitD);

        return {
            height: Math.max(0, Math.round(vh - top)),
            el: hit, kbZ: kbZ, kbOpen: kbState.open, kb: kbState
        };
    }

    /* 底栏扫描：已知选择器 + 贴底固定条几何探测，结果写入对应层级的缓存。
       分两层的理由：document.body.children 通常只有十几个节点，每次扫都不心疼；
       querySelectorAll("*") 在大文档上是几千个节点、几千次 getBoundingClientRect，
       才是真正的大头，所以按 deepScanMinMs 单独放宽（deep=false 时不跑）。 */
    function runBottomScan(vh, vw, deep) {
        let topS = Infinity, hitS = null;   // 浅层结果
        let topD = Infinity, hitD = null;   // 深层结果

        const consider = (el, cs, shallow) => {
            if (!el || el === bar || (bar && bar.contains(el)) || el.contains(bar)) return;
            if (sheet && (el === sheet || sheet.contains(el))) return;
            /* v0.8.91：键盘弹出遮挡图片块时思源会滚动文档，图片块 / 图片浮层 /
               resize handle 里的 absolute 元素会刚好满足下面这套「宽 ≥ 半屏、
               高 20~40%vh、贴底」的几何判据，被误判成原生底栏并缓存，把
               --sy-mb-offset 算大一个图片块高度。编辑器内容树一律不参与避让。 */
            if (el.closest && el.closest(".protyle-wysiwyg")) return;
            if (!visibleLike(el, cs)) return;
            const r = el.getBoundingClientRect();
            if (r.height < 20) return;
            if (r.height > vh * 0.4) return;
            if (r.width < vw * 0.5) return;
            if (r.bottom < vh - 18) return;      // 必须贴底
            if (r.top < vh * 0.4) return;        // 不能是近似全屏的面板
            if (shallow) { if (r.top < topS) { topS = r.top; hitS = el; } }
            else         { if (r.top < topD) { topD = r.top; hitD = el; } }
        };

        // ① 已知选择器（键盘工具条 / 移动端悬浮底栏……）：命中率最高，成本最低
        CONFIG.nativeBarSelectors.forEach((sel) => {
            try {
                document.querySelectorAll(sel).forEach((el) => consider(el, null, true));
            } catch (e) { /* ignore */ }
        });

        // ② 浅层：body 直接子元素 —— 常见的贴底固定条基本都挂在这一层
        const kids = document.body.children;
        for (let i = 0; i < kids.length; i++) {
            const el = kids[i];
            // 先用几何信息快速淘汰，避免对大量节点调用 getComputedStyle
            const r = el.getBoundingClientRect();
            if (r.height < 20 || r.height > vh * 0.4) continue;
            if (r.width < vw * 0.5) continue;
            if (r.bottom < vh - 18) continue;
            if (r.top < vh * 0.4) continue;
            const cs = getComputedStyle(el);
            if (cs.position !== "fixed" && cs.position !== "sticky" && cs.position !== "absolute") continue;
            consider(el, cs, true);
        }

        InsertDiagnostics.perf.scan(false, kids.length);
        // ③ 深层：全树兜底，按 deepScanMinMs 放宽
        if (deep) {
            const all = document.body.querySelectorAll("*");
            InsertDiagnostics.perf.scan(true, all.length);
            for (let i = 0; i < all.length; i++) {
                const el = all[i];
                const r = el.getBoundingClientRect();
                if (r.height < 20 || r.height > vh * 0.4) continue;
                if (r.width < vw * 0.5) continue;
                if (r.bottom < vh - 18) continue;
                if (r.top < vh * 0.4) continue;
                const cs = getComputedStyle(el);
                if (cs.position !== "fixed" && cs.position !== "sticky" && cs.position !== "absolute") continue;
                consider(el, cs, false);
            }
            // 只缓存命中元素；几何每次测量重读，避免按失效的缓存值避让
            scanHitD = hitD;
        }
        scanHitS = hitS;
    }

    /* 视口高度启发式：keyboardVisible 的兜底判定（innerHeight 回落到
       历史最大值 = 键盘收起；低于最大值 120px 以上 = 键盘展开） */
    function kbViewportHeuristic() {
        const vh = viewportH();
        if (!maxViewportH) maxViewportH = vh;
        if (vh > maxViewportH) maxViewportH = vh;
        /* v0.8.88：键盘弹出时视口高度渐变，这 ~400ms 内 120px 阈值会在
           true/false 间来回穿越。过渡期只允许启发式「补一个 true」，
           不允许改回 false —— 真正的收起由 keyboard-change / keyboard-hiding 负责。 */
        const settling = kbOpenedAt > 0 && Date.now() - kbOpenedAt < KB_SETTLE_MS;
        if (maxViewportH - vh > 120) {
            setKb(true);
        } else if (!settling && vh >= maxViewportH - 8) {
            setKb(false);
        }
    }

    function applyKbHidden() {
        kbSignal = false;
        pendingShow = false;
        closeCompanionPanels();   // v0.8.98：工具条要消失了，伴生面板一起收起
        if (showAnchorTimer) { clearTimeout(showAnchorTimer); showAnchorTimer = 0; }
        if (deepScanTimer) { clearTimeout(deepScanTimer); deepScanTimer = 0; }
        kbOpenedAt = 0;
        InsertDiagnostics.perf.end("keyboard-closed");
        updateVisibility(null, true);   // kbSignal 已 false → 立即隐藏
        scheduleMeasure([0, 60, 240]);
    }

    /* v0.8.88：setKb 的四个写入源（keyboard-change / keyboard-hiding /
       包装的 show|hideKeyboardToolbar / kbViewportHeuristic）在一次弹出中
       会互相打架。快路径把每个信号同步映射到 class，于是抖动变成
       「显示→隐藏→再显示」，滑入动画被打断重启 —— 低配机上即跳动感。 */
    function setKb(v, immediate?) {
        /* v0.8.99：每次信号翻转都留痕。200ms 隐藏确认窗口 + 续锁互相扰动时，
           日志里能直接看出「谁在什么时候把 kbSignal 翻掉/翻回来」。 */
        if (InsertDiagnostics.perf.isEnabled() && v !== kbSignal) {
            InsertDiagnostics.perf.note("perf.kb", {
                to: v ? "on" : "off",
                from: kbSignal === null ? "init" : (kbSignal ? "on" : "off"),
                immediate: !!immediate,
                pending: !!pendingShow
            });
        }
        if (v) {
            userHideUntil = 0;   // v0.8.90：键盘真打开，解除收起让路闩锁
            /* 抖动恢复：撤销待确认隐藏；本来就在显示态则完全不做，
               避免重复 updateVisibility 与重复触发滑入动画。 */
            if (kbHideTimer) { clearTimeout(kbHideTimer); kbHideTimer = 0; }
            if (kbSignal === true) return;
            kbSignal = true;
            InsertDiagnostics.perf.begin("keyboard-open");
            scanDirty = true;
            kbOpenedAt = Date.now();
            /* 深扫描推迟到首帧之后：它只花 ~12ms，但不必占用工具条出现的那一帧 */
            if (deepScanTimer) { clearTimeout(deepScanTimer); deepScanTimer = 0; }
            deepScanTimer = setTimeout(() => {
                deepScanTimer = 0;
                scanForce = true;
                scheduleMeasure([0]);
            }, 350);
            /* v0.8.92：原生键盘工具条是本工具条唯一可信的定位锚点。
               它已可见 → 立即显示；尚未出现 → 保持隐藏并等待锚点，
               绝不在「键盘已缩高、原生工具条还是 fn__none」的空窗里
               用旧 --sy-mb-offset 抢先显示（那必然产生一次瞬间移位）。 */
            if (keyboardBarState().open) {
                updateVisibility(null, true);
            } else {
                pendingShow = true;
                showAnchorAt = Date.now();
                updateVisibility(null, false);   // 完整判据：kb.open=false → 隐藏
                if (showAnchorTimer) clearTimeout(showAnchorTimer);
                showAnchorTimer = setTimeout(() => revealWithNativeAnchor("timeout"),
                    CONFIG.showAnchorTimeoutMs);
            }
            scheduleMeasure([0, 60, 240]);
            return;
        }
        /* v0.8.92：收键盘即取消锚点等待 */
        pendingShow = false;
        if (showAnchorTimer) { clearTimeout(showAnchorTimer); showAnchorTimer = 0; }
        if (kbSignal !== true) {
            /* 已是隐藏态：只撤销尚未到期的确认，保持幂等 */
            if (kbHideTimer) { clearTimeout(kbHideTimer); kbHideTimer = 0; }
            return;
        }
        if (immediate) {
            if (kbHideTimer) { clearTimeout(kbHideTimer); kbHideTimer = 0; }
            applyKbHidden();
            return;
        }
        /* 延迟确认：窗口内若再收到 true，setKb(true) 会清掉这个定时器，
           工具条全程保持显示，一次激活只做一次滑入动画。
           多个 false 信号（事件 + 视口启发式）只认第一个，不重置窗口，
           否则连续派发会把真正收起的时间不断往后推。 */
        if (kbHideTimer) return;
        kbHideTimer = setTimeout(() => {
            kbHideTimer = 0;
            if (kbSignal === true) applyKbHidden();
        }, KB_HIDE_CONFIRM_MS);
    }

    let lastOffsetVal = "";   // v9：变量值未变就不写，避免重复样式失效与过渡重放
    let lastSafeVal = "";
    let lastStackVal = "";
    let lastZVal = "";
    let lastPanelZVal = "";   // v0.8.98：面板容器层级（= 原生键盘工具条 z - 1）

    /* v0.8.92：offset 写入独立成函数，锚点到达时可同步校准一次，
       不必等 applyMeasure() 的定时器队列。 */
    function writeBottomOffset(res) {
        const off = res.height + "px";
        if (off !== lastOffsetVal) {
            lastOffsetVal = off;
            bar.style.setProperty("--sy-mb-offset", off);
            /* v0.8.98：面板/选择器容器是 body 下的兄弟层，读不到写在 bar 上的
               变量（CSS 头部 v0.8.16 就记过这个坑）。同步写一份到 :root，
               面板内容避让与遮罩透明区才能按实测值准确计算。 */
            document.documentElement.style.setProperty("--sy-mb-offset", off);
            /* v0.8.91：只在值变化时写，避免刷屏；记录基准与命中元素 */
            InsertDiagnostics.perf.note("perf.offset", {
                px: res.height,
                vh: Math.round(viewportH()),
                kbTop: Math.round(res.kb.top || 0),
                kbOpen: !!res.kb.open,
                hit: InsertDiagnostics.node(res.el)
            });
        }
        return off;
    }

    function revealWithNativeAnchor(reason, res?) {
        if (!pendingShow) return;
        pendingShow = false;
        if (showAnchorTimer) { clearTimeout(showAnchorTimer); showAnchorTimer = 0; }
        const state = res || detectBottomBars();
        writeBottomOffset(state);      // 先校准位置，再允许出现 → 一次到位
        InsertDiagnostics.perf.note("perf.anchor", {
            reason: reason,
            waitMs: Math.round(Date.now() - showAnchorAt),
            offsetPx: state.height,
            kbOpen: !!state.kb.open
        });
        updateVisibility(null, true);
    }

    function applyMeasure() {
        if (!bar) return;
        kbViewportHeuristic();

        // 软键盘未打开且无需正文让位时，工具条必然处于隐藏态：
        // 跳过昂贵的底栏测量与变量写入，只同步可见性（键盘收起也靠这里隐藏）
        if (kbSignal !== true && !CONFIG.contentPadding) {
            updateVisibility();
            return;
        }

        const res = detectBottomBars();
        const safe = CONFIG.safeAreaBottomPx || 0;
        const off = writeBottomOffset(res);
        const safeVal = safe ? safe + "px" : "env(safe-area-inset-bottom, 0px)";
        if (safeVal !== lastSafeVal) {
            lastSafeVal = safeVal;
            bar.style.setProperty("--sy-mb-safe", safeVal);
            document.documentElement.style.setProperty("--sy-mb-safe", safeVal);
        }
        // --sy-mb-stack 定义在 :root 上，改它会让整棵树做一次样式失效；
        // 只有 body.sy-mb-pad（contentPadding）会用到它，不开就完全不写
        if (CONFIG.contentPadding && off !== lastStackVal) {
            lastStackVal = off;
            document.documentElement.style.setProperty("--sy-mb-stack", off);
        }
        // 层级跟随键盘工具条，保证永远叠在其上层
        if (res.kbZ) {
            const z = String(res.kbZ + 1);
            if (z !== lastZVal) {
                lastZVal = z;
                bar.style.zIndex = z;
            }
            /* v0.8.98：面板容器必须比原生键盘工具条再低一层。
               容器原先写死 z-index:240，而原生工具条是 ++window.siyuan.zIndex
               的动态值 —— 思源刚启动时它可能只有几十，面板白底就会把整条
               `+ ¶ ≋ ↶ ↷ ^ ∨` 盖成白色（v0.8.96 的现场）。
               这里按实测 kbZ 反推：面板 kbZ-1 < 原生工具条 kbZ < 快捷工具条 kbZ+1，
               面板白底才有资格当「工具条背后的背景板」。 */
            const pz = String(Math.max(1, res.kbZ - 1));
            if (pz !== lastPanelZVal) {
                lastPanelZVal = pz;
                document.documentElement.style.setProperty("--sy-mb-panel-z", pz);
            }
        }
        /* v0.8.87：键盘已打开、但原生 #keyboardToolbar 尚未可见的过渡期
           （实测约 0.5s）里，不能用 kb.open=false 把快路径刚显示的工具条
           再收回去 —— 那等于回到旧延迟，还多一次「显示→隐藏→再显示」闪烁。
           这段窗口改用 fast 判据（仍检查对话框 / 块菜单等明确不该显示的场景），
           位置照常校准；原生工具条一旦可见就自动回到完整判据。 */
        const kbPending = kbSignal === true && !res.kb.open;
        if (pendingShow) {
            if (res.kb.open) {
                revealWithNativeAnchor("measure", res);
            } else {
                /* 原生锚点未到：保持隐藏，不能用 fast 判据提前显示 */
                updateVisibility(res.kb, false);
            }
        } else {
            updateVisibility(res.kb, kbPending);
        }
    }

    /* v0.8.87：原先每次调用都清空整个队列再重建，键盘弹出期间
       visualViewport.resize 连帧 + MutationObserver 变更会把 0ms 任务反复打掉
       （实测一次激活取消 16~18 个），显示因此被推迟到事件风暴结束。
       改为按 delay 合并去重：已排队的延迟不重复添加，也不取消已有任务。 */
    function scheduleMeasure(delays?) {
        InsertDiagnostics.perf.bump("scheduleCalls");
        const wanted = delays || [0, 90, 280, 620];
        let added = 0;
        wanted.forEach((d) => {
            if (pendingMeasure.has(d)) return;
            if (pendingMeasure.size >= MAX_PENDING_MEASURES) return;
            const timer = setTimeout(() => {
                pendingMeasure.delete(d);
                const idx = measureTimers.indexOf(timer);
                if (idx >= 0) measureTimers.splice(idx, 1);
                const now = Date.now();
                if (now - lastMeasure < 60) {
                    InsertDiagnostics.perf.bump("applySkipped");
                    return;
                }
                lastMeasure = now;
                InsertDiagnostics.perf.bump("applyCount");
                applyMeasure();
            }, d);
            pendingMeasure.set(d, timer);
            measureTimers.push(timer);
            added++;
        });
        InsertDiagnostics.perf.bump("scheduleAdded", added);
    }

    /* 包装思源自带的键盘工具条函数 —— 直接来自 Android 原生层的调用约定 */
    function hookNativeToolbar() {
        if (destroyed) return;
        ["showKeyboardToolbar", "hideKeyboardToolbar"].forEach((name) => {
            if (origToolbarFns[name] || typeof window[name] !== "function") return;
            origToolbarFns[name] = window[name];
            window[name] = function () {
                /* v0.8.50：原生层（APP 自带键盘工具条折叠键 / 系统收键盘回调）调
                   hideKeyboardToolbar(true) 时，先记下时刻——折叠键可能早于或不派发
                   keyboard-hiding 事件，这里单独记时间戳合入 genuineKeyboardDismiss()，
                   让 focusout 守卫 / rescue / 否决分支把它当「用户真收」让路。show 分支
                   不会触发收键盘重开，故只记 hide。 */
                if (name === "hideKeyboardToolbar") lastNativeHideAt = Date.now();
                /* v0.8.35：hideKeyboardToolbar(preserveSelection=true) 是原生层
                   「键盘被系统收起」的 JS 回调（siyuan-android Utils.java
                   hideKeyboardAndToolbar → javascript:hideKeyboardToolbar(true)），
                   返回值决定原生下一步：
                       2 → 原生立刻 showSoftKeyboard() 把键盘叫回来
                           （官方 restoreRecentAndroidTableCellSelectAll 用的就是
                           这条通道，但它只覆盖整格全选）；
                       1 → 保留选区与焦点不再清理；0 → blur + 收定键盘。
                   日志实证：手指落在工具条上的同一时刻，原生会把编辑器焦点 blur 掉
                   （focusout 比 touchstart 还早 ~39ms，JS 拦不住）→ IMM 收键盘。
                   所以**只要键盘是在「正摸着工具条 / 续锁窗口内」被系统收的**，
                   就原位恢复焦点 + 区间并返回 2，请原生把键盘叫回 ——
                   这是横滑键盘刷新的最后一道兜底（focusout 救回是快车道，这条是
                   官方原生通道，两层并存）。
                   用户主动点空白处收键盘（barTouching=false、不在续锁窗口）、
                   思源 activeBlur 主动收（preserveSelection=false）都透传，绝不拦
                   —— 否则键盘会关不掉。 */
                if (name === "hideKeyboardToolbar" && arguments[0] &&
                    (barTouching || kbProtected()) &&
                    /* v0.8.90：安卓 Utils.java:384 把返回值 "2" 解释为
                       showSoftKeyboard() —— 折叠键一旦被否决就会「收起又立马打开」。
                       真收闩锁期间一律透传，不再返回 2。 */
                    !userHideActive() &&
                    /* v0.8.46：保护窗口内用户主动点编辑器以外收键盘 —— 别否决，否则
                       用过一次命令后键盘关不掉 / 关了又弹。blip（落库重渲染假收）不会
                       触发 lastOutsideTouchAt（用户没摸页面），故不影响横滑 / 表格命令修复。 */
                    !(lastOutsideTouchAt && Date.now() - lastOutsideTouchAt < 600) &&
                    /* v0.8.48：用户点软键盘自身收起键（genuineKeyboardDismiss）也是真收
                       意图，即便在保护窗口也别否决 —— 否则键盘关不掉。横滑中 / blip 窗口内
                       仍否决（genuineKeyboardDismiss 已排除）。 */
                    !genuineKeyboardDismiss() &&
                    /* v0.8.49：官方块功能面板（native .b3-menu）开着时不否决收键盘，
                       否则 IME 被叫回遮挡面板。该场景与 barTouching/kbProtected 互不重叠。 */
                    !nativeMenuOpen() &&
                    /* v0.8.71：思源官方浮层（公式编辑面板）开着时绝不否决 ——
                       返回 2 会让原生 showSoftKeyboard() 把 IME 叫回来，与公式键盘
                       叠成一坨；而且面板场景需要键盘收干净，会话才走得完。 */
                    !mathSessionLive() && !mathHandoffActive() &&
                    /* v0.8.69：表格列宽拖拽要收键盘（触控调宽），否决通道关掉。 */
                    !inTableResizeGesture()) {
                    /* 工具条 / 浮层交互：lastEditable 通常仍连通，原地 focus + 还原区间。 */
                    if (lastEditable && lastEditable.isConnected) {
                        try { lastEditable.focus({ preventScroll: true }); }
                        catch (e) { try { lastEditable.focus(); } catch (e2) { /* ignore */ } }
                        restoreLastRange();
                        return 2;
                    }
                    /* 表格命令落库重渲染窗口（kbProtected）：旧单元格已被整块重渲染
                       连根换掉，lastEditable 已脱离 DOM，不能再靠它原地救。
                       改用 tableCaretCell() 按「块 id + 行/列索引」从**新** DOM 找回
                       目标单元格并聚焦 —— 键盘不必先收再弹。面板（容器）子项点表格
                       命令也走这条：面板浮层开着时焦点救回被 ownOverlayOpen 拦过，
                       lastEditable 来不及更新到新单元格，原生收键盘若先到一拍就会因为
                       isConnected=false 漏过否决（v0.8.39 面板用例复现）。 */
                    if (kbProtected()) {
                        const c = tableCaretCell();
                        if (c) {
                            let focusEl = c;
                            if (focusEl.tagName === "TD" || focusEl.tagName === "TH") {
                                try {
                                    const inner = focusEl.querySelector('[contenteditable="true"]');
                                    if (inner) focusEl = inner;
                                } catch (e) { /* ignore */ }
                            }
                            try { focusEl.focus({ preventScroll: true }); }
                            catch (e) { try { focusEl.focus(); } catch (e2) { /* ignore */ } }
                            placeCaretIn(c);
                            return 2;
                        }
                    }
                }
                /* v0.8.37：「第一次点进表格」的误收否决。
                   表格未激活时单元格不是 contenteditable，原生 hit-test 判无输入点
                   → IMM 收键盘；等思源激活表格、重建 DOM、放入焦点（实测可慢 1.7s）
                   键盘再弹 = 键盘刷新。此处只 return 2 否决这次收键盘，
                   **不碰焦点与选区**（点按自己会落光标，抢了就是 v0.8.31 重演）。
                   条件：最近一次触摸就是点进表格（点别处时已清零）且未超窗。
                   用户在 600ms 窗口内又点表格外 / 按返回键收键盘：
                   前者 lastTableTapAt 已清零 → 否决自动失效；后者是下一次
                   hide 调用、大概率已出窗，即便在窗内也只续命 600ms。
                   v0.8.38：排在工具条交互的原位恢复分支**之后** —— 点表格后立刻
                   摸工具条时，原位恢复（焦点 + 区间一起还原）比单纯否决更彻底。 */
                if (name === "hideKeyboardToolbar" && arguments[0] &&
                    !inTableResizeGesture() &&
                    /* v0.8.71：公式编辑面板开着时不否决（同上，别把 IME 叫回来）。
                       v0.8.74：判据统一到 mathSessionLive()（只看 DOM 有没有 math-field）。 */
                    !mathSessionLive() && !mathHandoffActive() &&
                    lastTableTapAt && Date.now() - lastTableTapAt < 600) {
                    return 2;
                }
                const ret = origToolbarFns[name].apply(this, arguments);
                setKb(name === "showKeyboardToolbar");
                /* v0.8.92：showKeyboardToolbarElement() 已 remove fn__none 且
                   updateKeyboardToolbarPosition() 完成，此刻位置确定 —— 这是
                   比轮询 kb.open 更早、更准的锚点，立即校准叠加显示。 */
                if (name === "showKeyboardToolbar" && pendingShow) {
                    revealWithNativeAnchor("native");
                }
                scheduleMeasure();
                return ret;
            };
        });
    }

    // 这两个全局函数由思源前端稍后定义，注入窗口期可能抓不到，重试一段时间
    function hookNativeToolbarWithRetry(times) {
        hookNativeToolbar();
        if (times > 0) {
            setTimeout(() => hookNativeToolbarWithRetry(times - 1), 700);
        }
    }

    /* ============================================== 显示 / 隐藏 =========== */
    /* 编辑器主区缓存：inEditor() 每次测量都会调用，
       反复 querySelector(".protyle-wysiwyg") 是全树遍历，改为缓存 + 断链重查 */
    function getWys() {
        if (wysCache && wysCache.isConnected) return wysCache;
        wysCache = document.querySelector(".protyle-wysiwyg");
        return wysCache;
    }

    /* v0.8.94：焦点是否落在「文档编辑器以外的输入控件」。
       搜索面板、插件设置输入框、思源其它输入区域都属此类。
       只做 activeElement 属性读取，无全树查询，可放进每次可见性测量。 */
    function focusInForeignInput(wys) {
        const ae = document.activeElement;
        if (!ae || ae.nodeType !== 1 || wys.contains(ae)) return false;
        const tag = ae.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
        /* isContentEditable 会继承到子元素；排除 body / html 这类非编辑宿主 */
        return (ae as any).isContentEditable === true &&
            ae !== document.body && ae !== document.documentElement;
    }

    function inEditor() {
        const wys = getWys();
        if (!wys) return false;
        if (wys.offsetParent === null && getComputedStyle(wys).position !== "fixed") return false;
        const r = wys.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0)) return false;
        /* v0.8.94：旧实现到此就 return true，只证明「页面里存在一个可见编辑器」。
           搜索面板 / 插件设置输入框打开时，背后的 protyle 依然可见，工具条
           因此被误放行到非编辑界面。补判焦点归属：编辑器外的输入控件拿到
           焦点时明确拒绝；焦点在编辑器内、或短暂落到 body / 工具条按钮时
           仍放行，避免工具条按压造成的 blur 让自己闪烁。 */
        if (focusInForeignInput(wys)) return false;
        return true;
    }

    /* querySelector(".b3-dialog…") 是全树查询，而每次测量都要问一次。
       对话框不会凭空出现，加 300ms TTL 缓存：最坏情况是晚 ≤300ms 才隐藏。 */
    /* v0.8.100：判断「思源对话框开着」时必须排除插件自己的三个浮层。
       v0.8.82 为了保住表格单元格 lite 编辑器，会在 pointerdown 时给
       #syMobileToolbar / Sheet / Picker 临时加 .b3-dialog 标记；标记还在的
       那一瞬间这个判据会命中自己 → wanted=false → 工具条隐藏，而 dialogHit
       还有 300ms 缓存，标记移除后要等缓存过期才恢复。表现就是「面板开着
       快速切换按钮时工具条偶发刷新」（日志 0025 隐藏 → 0027 恢复，间隔 456ms，
       且 kbSignal / kbOpen 全为 true，说明不是键盘或锚点问题）。 */
    const DIALOG_OTHERS_SELECTOR =
        ".b3-dialog--open:not(#syMobileToolbar):not(#syMobileToolbarSheet):not(#syMobileToolbarPicker)," +
        ".b3-dialog:not(#syMobileToolbar):not(#syMobileToolbarSheet):not(#syMobileToolbarPicker)";

    function dialogOpen() {
        if (!CONFIG.hideOnDialog) return false;
        const now = Date.now();
        if (now - dialogAt < 300) return dialogHit;
        dialogAt = now;
        const d = document.querySelector(DIALOG_OTHERS_SELECTOR);
        dialogHit = !!d && d.getBoundingClientRect().height > 0;
        return dialogHit;
    }

    /* v0.8.87：fast=true 用于「键盘打开/关闭信号刚到」的同步快路径。
       实测日志 delayMs≈500ms，而全树扫描只占 12ms —— 瓶颈是显示被绑在
       applyMeasure() 末尾、且必须等 kb.open（原生 #keyboardToolbar 可见）。
       快路径跳过 kb.open / kb.util，只保留「确实不该显示」的判据，复用上一帧
       的 --sy-mb-offset 定位；后续 applyMeasure() 按完整判据校准与隐藏。 */
    function updateVisibility(kbState?, fast?) {
        if (!bar) return;
        let wanted = !forceHidden && kbSignal === true;
        if (wanted && !fast) {
            const kb = kbState || keyboardBarState();   // 复用测量时已取的状态
            wanted = !!kb.open && !(CONFIG.hideWhenUtilOpen && kb.util);
        }
        if (wanted) {
            wanted = (!CONFIG.showOnlyInEditor || inEditor()) &&
                !dialogOpen() &&
                /* v0.8.49：官方块功能面板（native .b3-menu）开着时收起工具条，避免遮挡面板 */
                !nativeMenuOpen();
        }
        const wasHidden = bar.classList.contains("sy-mb-hidden");
        if (wasHidden === wanted) {
            bar.classList.toggle("sy-mb-hidden", !wanted);
            /* v0.8.99：显示状态每翻转一次就留痕，并带上当时的判据。
               专治「面板开着快速切换按钮 → 工具条偶发刷新」这类现场：
               旧日志只在 hidden→shown 且会话未结束时写一条，反向切换完全静默。 */
            if (InsertDiagnostics.perf.isEnabled()) {
                InsertDiagnostics.perf.note("perf.vis", {
                    from: wasHidden ? "hidden" : "shown",
                    to: wanted ? "shown" : "hidden",
                    fast: !!fast,
                    kbSignal: kbSignal === true,
                    kbOpen: kbState ? !!kbState.open : null,
                    pending: !!pendingShow,
                    forceHidden: !!forceHidden,
                    /* v0.8.100：判据明细。只在真正翻转时求值（低频），
                       下一次再有「无故隐藏」可以直接看出是哪一个翻的。 */
                    inEditor: CONFIG.showOnlyInEditor ? inEditor() : null,
                    dialog: dialogOpen(),
                    menu: nativeMenuOpen(),
                    util: kbState ? !!kbState.util : null
                });
            }
        }
        if (wasHidden && wanted) InsertDiagnostics.perf.end("shown");
        /* v0.8.56：隐藏前清掉横滑残留的边缘橡皮筋（作用在按钮上的 --sy-mb-rubber 变量）。
           .sy-mb-hidden 的 translateY 在 bar 上，与按钮偏移互不干扰，这里只做清理。 */
        if (!wanted) {
            bar.classList.remove("sy-mb-rubber-out");
            bar.style.setProperty("--sy-mb-rubber", "");
        }
    }

    function setBusy(busy) {
        if (!bar) return;
        bar.querySelectorAll(".sy-mb-btn").forEach((b) => b.classList.toggle("sy-mb-busy", !!busy));
    }

    /* ============================================== 日间 / 夜间 =========== */
    function luminance(colorStr) {
        const m = String(colorStr || "").match(/rgba?\(([^)]+)\)/);
        if (!m) return 255;
        const p = m[1].split(",").map((v) => parseFloat(v));
        const a = p.length > 3 ? p[3] : 1;
        if (a < 0.5) return 255;
        return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    }

    function syncMode() {
        if (!bar) return;
        let mode;
        const cfgMode = window.siyuan && window.siyuan.config && window.siyuan.config.appearance
            ? window.siyuan.config.appearance.mode : undefined;
        if (cfgMode === 1) mode = "dark";
        else if (cfgMode === 0) mode = "light";
        else {
            // 主题未暴露 mode 时，实测背景亮度（对任何第三方主题都成立）
            const bg = getComputedStyle(document.documentElement)
                .getPropertyValue("--b3-theme-background").trim();
            if (bg === modeProbe) return;   // 变量没变就不重复探测
            modeProbe = bg;
            if (!bg) return;
            const probe = ce("div");
            probe.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;background:" + bg;
            document.body.appendChild(probe);
            const real = getComputedStyle(probe).backgroundColor;
            probe.remove();
            mode = luminance(real) < 128 ? "dark" : "light";
        }
        const attr = bar.getAttribute("data-sy-mb-mode");
        if (mode && mode !== attr) {
            bar.setAttribute("data-sy-mb-mode", mode);
        }
    }

    /* ========================================== 自定义按钮（v0.3） ======== */
    /* 按钮由配置驱动：
         CONFIG.buttons = null → 用 DEFAULT_BUTTONS（九个内置按钮，与旧版完全等价）
         CONFIG.buttons = []   → 空工具条（全部交给用户在设置面板里拼）
       每个按钮：{ id, name, type, icon, tip?, enabled?, ... }
         type = panel    → 点开弹出子面板，子按钮在 children[] 里配置（关键新增）
              | builtin   → 调用内置动作（builtinId 可为叶子动作或面板预设）
              | popup    → 弹出短语列表选择后插入（options[]）；只有一条时直接插入
       panel 类型的 children[] 结构同上（不含 panel 自身，避免嵌套面板叠加）。
       注：v0.8.4 起不再有 shortcut 类型 —— 思源移动端没有快捷键体系，派发组合键不会有响应。
       注：v0.8.5 起移除 template（单段固定文字）类型 —— 只含一条选项的 popup（快捷短语）
       即可承担同样的「直接插入一段文字」需求，不必再单列一种类型。
    */
    /* 面板预设：把原「*Panel 内置动作」的面板内容抽成可编辑的子按钮列表。
       自定义按钮选「面板」类型时，默认带这套 children；用户可在设置里增删改。
       叶子动作 id 与 ACTIONS / ACTION_NAMES 保持一致。 */
    /* 面板条目显示名：只认「规范动作名」，不再把 "H1" 这类占位短名当名称。
       设置页预览与实际弹出的面板共用 itemLabel（见下），保证所见即所得。 */
    const HEADING_NAMES = ["", "一级标题", "二级标题", "三级标题", "四级标题", "五级标题", "六级标题"];

    /* 旧版默认写死的占位短名（v0.4 headingPanel 的 "H1".."H6"、旧页签面板的「思维导图」）。
       这些名字是当年自动生成的官方名，不是用户起的自定义名 —— itemLabel 一律让位给
       规范动作名（一级标题 / 思维导图块…）；设置页 officialKid 也据此把这类子项
       按「官方动作行」展示并清掉占位名（v0.8.7，用户反馈标题面板 / 页签面板没统一）。 */
    const LEGACY_KID_NAMES = {
        h1: "H1", h2: "H2", h3: "H3", h4: "H4", h5: "H5", h6: "H6",
        mindmap: "思维导图"
    };

    /* 面板子按钮的紧凑写法：id / 显示名 / 内置动作 id / 思源图标 id */
    function pItem(id, name, builtinId, icon) {
        return { id: id, name: name, type: "builtin", builtinId: builtinId, icon: icon, enabled: true };
    }

    const PANEL_PRESETS = {
        /* 标题（H1 ~ H6） */
        headingPanel: [1, 2, 3, 4, 5, 6].map((lv) =>
            pItem("h" + lv, HEADING_NAMES[lv], "h" + lv, "iconH" + lv)),

        /* 列表：无序 / 有序 / 任务 / 思维导图块（对齐思源斜杠面板） */
        listPanel: [
            pItem("ul", "无序列表", "ul", "iconList"),
            pItem("ol", "有序列表", "ol", "iconOrderedList"),
            pItem("task", "任务列表", "task", "iconCheck"),
            pItem("mindmap", "思维导图块", "mindmap", "iconMindmap")
        ],

        /* 插入：思源块功能面板「插入类」全部 16 项 + 日期 / 时间 / 日期时间。
           顺序与官方斜杠面板逐行对齐（keyboardToolbar.ts:369-389）。 */
        insertPanel: [
            pItem("template", "模板", "template", "iconMarkdown"),
            pItem("widget", "挂件", "widget", "iconBoth"),
            pItem("assets", "资源", "assets", "iconImage"),
            pItem("ref", "引用", "ref", "iconRef"),
            pItem("embed", "嵌入块", "embed", "iconSQL"),
            pItem("ai", "AI 编写", "aiWriting", "iconSparkles"),
            pItem("database", "数据库", "database", "iconDatabase"),
            pItem("subDoc", "新建子文档并引用", "newSubDocRef", "iconFile"),
            pItem("image", "插入图片", "image", "iconImage"),
            pItem("photo", "拍照并插入", "photo", "iconCamera"),
            pItem("asset", "插入图片或文件", "asset", "iconDownload"),
            pItem("iframe", "插入 Iframe 链接", "iframe", "iconGlobe"),
            pItem("imgUrl", "插入图片链接", "imgUrl", "iconImage"),
            pItem("videoUrl", "插入视频链接", "videoUrl", "iconVideo"),
            pItem("audioUrl", "插入音频链接", "audioUrl", "iconRecord"),
            pItem("emoji", "表情", "emoji", "iconEmoji"),
            pItem("date", "插入日期", "date", "iconCalendar"),
            pItem("time", "插入时间", "time", "iconClock"),
            pItem("datetimePanel", "日期时间", "datetimePanel", "iconCalendarClock")
        ],

        /* 引述：引述块 + 提示块 Note / Tip / Important / Warning / Caution */
        quotePanel: [
            pItem("quote", "引述块", "quote", "iconQuote")
        ].concat(CALLOUTS.map((c) => pItem(
            "callout-" + c.type,
            "提示块 " + c.name,
            "callout" + c.type[0] + c.type.slice(1).toLowerCase(),
            "iconCallout"))),

        /* 表格：表格 / 数据库 */
        tablePanel: [
            pItem("table", "表格", "table", "iconTable"),
            pItem("database", "数据库", "database", "iconDatabase")
        ],

        /* 块：超级块 / 页签块 / 思维导图块 / 代码块 / 分割线 / HTML 块 */
        blockPanel: [
            pItem("sbCol", "横向超级块", "superBlockCol", "iconSplitLR"),
            pItem("sbRow", "纵向超级块", "superBlockRow", "iconSplitTB"),
            pItem("tabs", "页签块", "tabs", "iconTabs"),
            pItem("mindmap", "思维导图块", "mindmap", "iconMindmap"),
            pItem("code", "代码块", "code", "iconCode"),
            pItem("line", "分割线", "line", "iconLine"),
            pItem("html", "HTML 块", "html", "iconHTML5")
        ],

        /* 页签（沿用 v0.3 的预设，老配置里内置的 `tabsPanel` 依然可用） */
        tabsPanel: [
            pItem("tabs", "页签块", "tabs", "iconTabs"),
            pItem("code", "代码块", "code", "iconCode"),
            pItem("html", "HTML 块", "html", "iconHTML5"),
            pItem("mindmap", "思维导图块", "mindmap", "iconMindmap")
        ],

        /* 图表：五线谱 / 图表 / Flow Chart / Graph / Mermaid / UML
           （官方斜杠面板第五组，全部是「代码块 + 语言」） */
        diagramPanel: [
            pItem("staff", "五线谱", "staff", "iconCode"),
            pItem("chart", "图表", "chart", "iconLayoutGrid"),
            pItem("flowchart", "Flow Chart", "flowchart", "iconSplitTB"),
            pItem("graphviz", "Graph", "graphviz", "iconListTree"),
            pItem("mermaid", "Mermaid", "mermaid", "iconAtom"),
            pItem("uml", "UML", "uml", "iconTerminal")
        ],

        /* 样式：信息 / 成功 / 警告 / 错误 / 清除字体样式 */
        stylePanel: [
            pItem("styleInfo", "信息样式", "styleInfo", "style:info"),
            pItem("styleSuccess", "成功样式", "styleSuccess", "style:success"),
            pItem("styleWarning", "警告样式", "styleWarning", "style:warning"),
            pItem("styleError", "错误样式", "styleError", "style:error"),
            pItem("styleClear", "清除样式", "styleClear", "style:clear")
        ],

        /* 公式：公式块 / 行级公式 */
        mathPanel: [
            pItem("math", "公式块", "math", "iconMath"),
            pItem("inlineMath", "行级公式", "inlineMath", "iconMath")
        ]
    };

    /* 面板预设 id → 中文名（设置面板下拉分组用） */
    const PANEL_PRESET_NAMES = {
        headingPanel: "标题", listPanel: "列表", insertPanel: "插入",
        quotePanel: "引述", tablePanel: "表格", blockPanel: "块",
        tabsPanel: "页签", diagramPanel: "图表", stylePanel: "样式",
        mathPanel: "公式"
    };

    /* v0.3 起工具条按钮改「面板」结构：面板类按钮用 type:"panel" + children
       描述面板内的子按钮，所有内容可在设置页增删改。
       ── 0.5.0 ───────────────────────────────────────────────────────────────
       默认 9 个按钮重排为「覆盖思源块功能面板」的九宫格：标题 / 列表 / 插入 /
       引述 / 表格 / 块 / 样式 / 公式 / 图表。
       其中「插入」面板已含模板、日期、时间、日期时间，所以原来独立的
       模板 / 日期时间按钮不再单独占位；老用户配置不受影响（保存过的按钮照旧生效），
       需要时也可以在设置里把 `模板`、`日期时间` 再加回工具条。 */
    const DEFAULT_BUTTONS = [
        { id: "heading",  name: "标题", type: "panel", icon: "iconH1", enabled: true,
          children: PANEL_PRESETS.headingPanel.map((b) => Object.assign({}, b)) },
        { id: "list",     name: "列表", type: "panel", icon: "iconList", enabled: true,
          children: PANEL_PRESETS.listPanel.map((b) => Object.assign({}, b)) },
        { id: "insert",   name: "插入", type: "panel", icon: "iconDownload", enabled: true,
          children: PANEL_PRESETS.insertPanel.map((b) => Object.assign({}, b)) },
        { id: "quote",    name: "引述", type: "panel", icon: "iconQuote", enabled: true,
          children: PANEL_PRESETS.quotePanel.map((b) => Object.assign({}, b)) },
        { id: "table",    name: "表格", type: "panel", icon: "iconTable", enabled: true,
          children: PANEL_PRESETS.tablePanel.map((b) => Object.assign({}, b)) },
        { id: "block",    name: "块",   type: "panel", icon: "iconSuper", enabled: true,
          children: PANEL_PRESETS.blockPanel.map((b) => Object.assign({}, b)) },
        { id: "style",    name: "样式", type: "panel", icon: "style:info", enabled: true,
          children: PANEL_PRESETS.stylePanel.map((b) => Object.assign({}, b)) },
        { id: "math",     name: "公式", type: "panel", icon: "iconMath", enabled: true,
          children: PANEL_PRESETS.mathPanel.map((b) => Object.assign({}, b)) },
        { id: "diagram",  name: "图表", type: "panel", icon: "iconLayoutGrid", enabled: true,
          children: PANEL_PRESETS.diagramPanel.map((b) => Object.assign({}, b)) }
    ];

    /* ==================================================================== 迁移
       0.5.0 是一次「动作库补全」：面板从 6 个扩到 10 个，旧默认里的
       插入（单个「插入图片或文件」按钮）/ 页签 / 日期时间 / 模板 被
       插入（19 项面板）/ 块 / 样式 / 图表 取代。
       下面这段负责把老用户平滑带过来，规则刻意保守：
         ① 若存下来的按钮与 v0.4.x 默认九按钮「指纹完全一致」——说明用户从没动过，
            直接换成新的默认九面板；
         ② 若用户自己改过（增删 / 改名 / 换图标 / 调顺序），一律不碰，
            只对「子项与旧内置预设逐项一致」的面板补全子项（当前只有
            列表面板：无序 / 有序 / 任务 → 追加 思维导图块）。
       两种情况都幂等：跑过一次后指纹不再匹配，不会反复迁移。 */
    const LEGACY_PRESET_CHILD_IDS = {
        headingPanel: ["h1", "h2", "h3", "h4", "h5", "h6"],
        listPanel: ["ul", "ol", "task"],
        quotePanel: ["quote", "callout-NOTE", "callout-TIP", "callout-IMPORTANT", "callout-WARNING", "callout-CAUTION"],
        tablePanel: ["table", "database"],
        tabsPanel: ["tabs", "code", "html", "mindmap"],
        mathPanel: ["math", "inlineMath"]
    };

    /* 反查表：旧内置面板的「子项 id 序列」 → 预设名。
       按子项序列反查而不是按按钮 id，是因为老配置里按钮 id 是短名
       （list / tabs / math），和预设名（listPanel / tabsPanel …）并不一致。 */
    const LEGACY_PRESET_BY_CHILDREN = {};
    Object.keys(LEGACY_PRESET_CHILD_IDS).forEach((k) => {
        LEGACY_PRESET_BY_CHILDREN[LEGACY_PRESET_CHILD_IDS[k].join(",")] = k;
    });

    /* v0.4.x 默认九按钮的指纹（id|名称|类型|图标|子项 id 序列）。
       名称也进指纹：用户只要改过任何一个名字（例如把「页签」改成「我的面板」），
       就说明他动过配置，绝不做整体替换。 */
    const LEGACY_DEFAULT_SIG = [
        "heading|标题|panel|iconH1|h1,h2,h3,h4,h5,h6",
        "list|列表|panel|iconList|ul,ol,task",
        "asset|插入|builtin|iconDownload|",
        "quote|引述|panel|iconQuote|quote,callout-NOTE,callout-TIP,callout-IMPORTANT,callout-WARNING,callout-CAUTION",
        "table|表格|panel|iconTable|table,database",
        "tabs|页签|panel|iconTabs|tabs,code,html,mindmap",
        "math|公式|panel|iconMath|math,inlineMath",
        "datetime|日期时间|builtin|iconCalendarClock|",
        "template|模板|builtin|iconMarkdown|"
    ].join(";");

    function buttonSig(def) {
        if (!def) return "";
        const kids = def.type === "panel" && Array.isArray(def.children)
            ? def.children.map((c) => (c && c.id) || "").join(",")
            : "";
        return [def.id, def.name || "", def.type, def.icon, kids].join("|");
    }

    function cloneButtons(list) {
        return (list || []).map((b) => JSON.parse(JSON.stringify(b)));
    }

    /* 返回 { buttons, migrated }：migrated 取值 "" | "default" | "panel" */
    function migrateButtons(list) {
        if (!Array.isArray(list) || !list.length) {
            return { buttons: cloneButtons(DEFAULT_BUTTONS), migrated: "default" };
        }
        if (list.map(buttonSig).join(";") === LEGACY_DEFAULT_SIG) {
            return { buttons: cloneButtons(DEFAULT_BUTTONS), migrated: "default" };
        }
        let touched = false;
        const out = list.map((def) => {
            if (!def || def.type !== "panel" || !Array.isArray(def.children)) return def;
            const ids = def.children.map((c) => (c && c.id) || "").join(",");
            const key = LEGACY_PRESET_BY_CHILDREN[ids];
            if (!key || !PANEL_PRESETS[key]) return def;
            const next = cloneButtons(PANEL_PRESETS[key]);
            if (next.map((c) => c.id).join(",") === ids) return def;   // 子项没变化，保持原对象引用
            touched = true;
            return Object.assign({}, def, { children: next });
        });
        return { buttons: touched ? out : list, migrated: touched ? "panel" : "" };
    }

    /* 内置动作注册表：自定义按钮的 builtinId 从这里取值。
       查不到时会再走 panelPresetAction()（面板预设 id → 打开对应面板），
       所以 `insertPanel` / `blockPanel` / `diagramPanel` / `stylePanel`
       这几个新面板不必在这里重复登记。 */
    const ACTIONS = {
        // 面板类
        headingPanel: actionHeadingPanel,
        listPanel: actionListPanel,
        quotePanel: actionQuotePanel,
        tablePanel: actionTablePanel,
        tabsPanel: actionTabsPanel,
        mathPanel: actionMathPanel,
        datetimePanel: actionDatetimePanel,
        asset: actionAsset,
        template: actionTemplate,
        // 直接动作（跳过面板）
        h1: () => actionHeading(1), h2: () => actionHeading(2), h3: () => actionHeading(3),
        h4: () => actionHeading(4), h5: () => actionHeading(5), h6: () => actionHeading(6),
        task: actionTask,
        ul: () => actionList(false),
        ol: () => actionList(true),
        quote: actionQuote,
        calloutNote: () => actionCallout("NOTE"),
        calloutTip: () => actionCallout("TIP"),
        calloutImportant: () => actionCallout("IMPORTANT"),
        calloutWarning: () => actionCallout("WARNING"),
        calloutCaution: () => actionCallout("CAUTION"),
        table: actionTable,
        database: actionDatabase,
        tabs: actionTabs,
        code: actionCode,
        html: actionHtml,
        mindmap: actionMindmap,
        math: actionMath,
        inlineMath: actionInlineMath,
        date: actionPickDate,
        time: actionPickTime,
        image: () => actionInsert("image"),
        file: () => actionInsert("file"),
        photo: () => actionInsert("photo"),
        /* —— 0.5.0：官方斜杠菜单「块功能面板」剩余条目 —— */
        widget: actionWidget,
        assets: actionAssets,
        ref: actionRef,
        embed: actionEmbed,
        aiWriting: actionAiWriting,
        newSubDocRef: actionNewSubDocRef,
        iframe: actionIframe,
        imgUrl: actionImgUrl,
        videoUrl: actionVideoUrl,
        audioUrl: actionAudioUrl,
        emoji: actionEmoji,
        line: actionLine,
        staff: actionStaff,
        chart: actionChart,
        flowchart: actionFlowchart,
        graphviz: actionGraphviz,
        mermaid: actionMermaid,
        uml: actionUml,
        styleInfo: () => actionStyle("info"),
        styleSuccess: () => actionStyle("success"),
        styleWarning: () => actionStyle("warning"),
        styleError: () => actionStyle("error"),
        styleClear: () => actionStyle("clear"),
        superBlockCol: () => actionSuperBlock("col"),
        superBlockRow: () => actionSuperBlock("row")
    };

    /* 内置动作 id → 显示名（按钮提示文案 + 设置面板下拉）
       —— 面板预设 id 留在这里，builtinOptions() 才能把它们分到「弹出子菜单」组。 */
    const ACTION_NAMES = {
        headingPanel: "标题（选择 H1~H6）", listPanel: "列表（无序 / 有序 / 任务 / 导图）",
        insertPanel: "插入（模板 / 挂件 / 资源 / 引用 / 嵌入块 / AI / 数据库 …）",
        blockPanel: "块（超级块 / 页签 / 思维导图 / 代码 / 分割线 / HTML）",
        diagramPanel: "图表（五线谱 / 图表 / Flow Chart / Graph / Mermaid / UML）",
        stylePanel: "样式（信息 / 成功 / 警告 / 错误 / 清除）",
        asset: "插入图片或文件", quotePanel: "引述（引述块 / 提示块）",
        tablePanel: "表格（表格 / 数据库）", tabsPanel: "页签（页签 / 代码 / HTML / 导图）",
        mathPanel: "公式（公式块 / 行级公式）", datetimePanel: "日期时间",
        template: "插入模板",
        h1: "一级标题", h2: "二级标题", h3: "三级标题",
        h4: "四级标题", h5: "五级标题", h6: "六级标题",
        task: "任务列表", ul: "无序列表", ol: "有序列表",
        quote: "引述块", calloutNote: "提示块 Note", calloutTip: "提示块 Tip",
        calloutImportant: "提示块 Important", calloutWarning: "提示块 Warning",
        calloutCaution: "提示块 Caution",
        table: "插入表格", database: "插入数据库",
        tabs: "页签块", code: "代码块", html: "HTML 块", mindmap: "思维导图块",
        math: "公式块", inlineMath: "行级公式",
        date: "插入日期", time: "插入时间",
        image: "插入图片", file: "插入文件", photo: "拍照并插入",
        /* —— 0.5.0 新增 —— */
        widget: "挂件", assets: "资源", ref: "引用", embed: "嵌入块",
        aiWriting: "AI 编写", newSubDocRef: "新建子文档并引用",
        iframe: "插入 Iframe 链接", imgUrl: "插入图片链接",
        videoUrl: "插入视频链接", audioUrl: "插入音频链接", emoji: "表情",
        line: "分割线", staff: "五线谱", chart: "图表",
        flowchart: "Flow Chart", graphviz: "Graph", mermaid: "Mermaid", uml: "UML",
        styleInfo: "信息样式", styleSuccess: "成功样式", styleWarning: "警告样式",
        styleError: "错误样式", styleClear: "清除字体样式",
        superBlockCol: "横向超级块", superBlockRow: "纵向超级块"

    };

    /* 动作库里用到的全部图标（spec + 中文名）。
       ── 与「动作」同源 ──────────────────────────────────────────────────────
       直接遍历 ①十个面板预设的全部子项 ②默认按钮，所以这份清单就是
       「动作能选的图标」的全集，设置页的图标选择器直接吃它，
       不会再有「动作里有这个图标、按钮图标列表里却找不到」的情况。
       刻意**不做** symbol 存在性过滤 —— 动作库里有三类图标天生没有 symbol：
         · 内置样式色块（style:info / success / warning / error / clear）
         · 页签块 iconTabs、思维导图块 iconMindmap（思源 litheness 里没有）
         · 日期时间 iconCalendarClock（思源只有单独的日历 / 时钟）
       它们都由引擎内置的线条 / 色块图标渲染，照样能选、能用。 */
    function actionIcons() {
        const out = [];
        const used = Object.create(null);
        /* BLOCK_ICONS 里的中文名更准（如 iconImage = 图片，而不是某个动作别名） */
        const labelOf = Object.create(null);
        BLOCK_ICONS.forEach((b) => { if (!labelOf[b.id]) labelOf[b.id] = b.label; });
        const push = (spec, label) => {
            const id = String(spec === undefined || spec === null ? "" : spec).trim();
            if (!id || used[id]) return;
            used[id] = true;
            out.push({ id: id, label: labelOf[id] || label || "" });
        };
        Object.keys(PANEL_PRESETS).forEach((key) => {
            (PANEL_PRESETS[key] || []).forEach((c) => {
                push(c.icon, ACTION_NAMES[c.builtinId] || c.name);
            });
        });
        DEFAULT_BUTTONS.forEach((b) => push(b.icon, b.name));
        return out;
    }

    /* 设置面板用的内置动作下拉项：叶子动作 + 面板预设两组 */
    function builtinOptions() {
        const leaf = [];
        const panel = [];
        Object.keys(ACTION_NAMES).forEach((k) => {
            if (PANEL_PRESETS[k]) panel.push({ value: k, label: ACTION_NAMES[k] });
            else leaf.push({ value: k, label: ACTION_NAMES[k] });
        });
        return { leaf, panel };
    }

    /* 「设置」类别：把思源移动端**主菜单抽屉**（左侧汉堡抽屉：导航 / 创建 / 数据管理 /
       设置板块）里的条目登记为可自由添加的按钮，插件组（扩展 / 第三方插件）不收录。
       —— v0.8.13 纠偏：此前按桌面端设置页 tab 凭空推了 17 项，与真机菜单对不上；
       现在以官方移动端源码 mainMenu.ts（MOBILE_MAIN_MENU_GROUPS + getSettingTabDefs）
       为准，value = 菜单条目的官方 DOM id（App 启动时 #menu 整体渲染，点击委托在容器上）。
       这份静态注册表只承担两件事：① 给选择器提供 label / icon 兜底；② 真机 #menu
       不可解析时兜底出完整清单。运行时选项清单以 liveSettingGroups() 枚举真实 DOM 为准，
       不同宿主版本的菜单差异（增删条目、改名）自动对齐，不会出现「选了打不开」的项。 */
    const SETTING_ITEMS = [
        { value: "menuDocuments",  label: "文档树",       icon: "iconFiles",        group: "导航" },
        { value: "menuTabs",       label: "多页签",       icon: "iconLayoutGrid",   group: "导航" },
        { value: "menuOutline",    label: "大纲",         icon: "iconOutline",      group: "导航" },
        { value: "menuBookmark",   label: "书签",         icon: "iconBookmark",     group: "导航" },
        { value: "menuTag",        label: "标签",         icon: "iconTag",          group: "导航" },
        { value: "menuBacklink",   label: "反向链接",     icon: "iconLink",         group: "导航" },
        { value: "menuInbox",      label: "收件箱",       icon: "iconInbox",        group: "导航" },
        { value: "menuRecent",     label: "最近文档",     icon: "iconRecentDocs",   group: "导航" },
        { value: "menuSearch",     label: "搜索",         icon: "iconSearch",       group: "导航" },
        { value: "menuAgentChat",  label: "智能体对话",   icon: "iconSparkles",     group: "导航" },
        { value: "menuCommand",    label: "命令面板",     icon: "iconTerminal",     group: "导航" },
        { value: "menuTemplateManager", label: "模板管理", icon: "iconMarkdown",    group: "导航" },
        { value: "menuCard",       label: "闪卡",         icon: "iconRiffCard",     group: "导航" },
        { value: "menuLock",       label: "锁屏",         icon: "iconLock",         group: "导航" },
        { value: "menuSafeQuit",   label: "安全退出",     icon: "iconQuit",         group: "导航" },
        { value: "menuNewDoc",     label: "新建文档",     icon: "iconAddDoc",       group: "创建" },
        { value: "menuNewDaily",   label: "日记",         icon: "iconCalendar",     group: "创建" },
        { value: "menuNewNotebook",    label: "新建笔记本",     icon: "iconNewNoteBook", group: "创建" },
        { value: "menuNewEncryptedNotebook", label: "新建加密笔记本", icon: "iconLock", group: "创建" },
        { value: "menuSyncNow",    label: "立即同步",     icon: "iconCloudSucc",    group: "数据管理" },
        { value: "menuHistory",    label: "数据历史",     icon: "iconHistory",      group: "数据管理" },
        { value: "menuImport",     label: "数据迁移",     icon: "iconDatabaseBackup", group: "数据管理" },
        { value: "menuConfigEditor",          label: "编辑器",   icon: "iconEdit",          group: "设置" },
        { value: "menuConfigFile",            label: "文档树",   icon: "iconFiles",         group: "设置" },
        { value: "menuConfigAppearance",      label: "外观",     icon: "iconTheme",         group: "设置" },
        { value: "menuConfigBazaar",          label: "集市",     icon: "iconBazaar",        group: "设置" },
        { value: "menuConfigFlashcard",       label: "闪卡",     icon: "iconRiffCard",      group: "设置" },
        { value: "menuConfigAi",              label: "人工智能", icon: "iconSparkles",      group: "设置" },
        { value: "menuConfigSecretsVariables", label: "密钥变量", icon: "iconSquareAsterisk", group: "设置" },
        { value: "menuConfigAssets",          label: "资源",     icon: "iconImage",         group: "设置" },
        { value: "menuConfigExport",          label: "导出",     icon: "iconUpload",        group: "设置" },
        { value: "menuConfigSearch",          label: "搜索",     icon: "iconSearch",        group: "设置" },
        { value: "menuConfigSync",            label: "账号与同步", icon: "iconCloud",       group: "设置" },
        { value: "menuConfigAccess",          label: "授权",     icon: "iconLock",          group: "设置" },
        { value: "menuConfigApp",             label: "通用",     icon: "iconLayoutGrid",    group: "设置" },
        { value: "menuConfigAbout",           label: "关于",     icon: "iconInfo",          group: "设置" },
        { value: "menuHelp",       label: "使用指南",     icon: "iconHelp",         group: "设置" },
        { value: "menuFeedback",   label: "问题反馈",     icon: "iconFeedback",     group: "设置" }
    ];
    const settingLabels = {};
    const settingIcons = {};
    SETTING_ITEMS.forEach((x) => { settingLabels[x.value] = x.label; settingIcons[x.value] = x.icon; });

    /* 菜单条目 id → 思源全局命令 id（execSettingCommand 的第②级降级用）。
       这些命令在官方 global.ts 的移动端分支 / 公共分支里都有注册。 */
    const SETTING_COMMANDS = {
        menuDocuments: "fileTree",
        menuOutline: "outline",
        menuBookmark: "bookmark",
        menuTag: "tag",
        menuBacklink: "backlinks",
        menuInbox: "inbox",
        menuRecent: "recentDocs",
        menuSearch: "globalSearch",
        menuCard: "riffCard",
        menuLock: "lockScreen",
        menuNewDoc: "newFile",
        menuNewDaily: "dailyNote",
        menuSyncNow: "syncNow",
        menuHistory: "dataHistory"
    };

    /* 注册表按 group 分组兜底（#menu 不可解析时的选项清单） */
    function fallbackSettingGroups() {
        const byGroup = {};
        SETTING_ITEMS.forEach((x) => {
            (byGroup[x.group] = byGroup[x.group] || []).push({ value: x.value, label: x.label, icon: x.icon });
        });
        return Object.keys(byGroup).map((g) => ({ title: g, items: byGroup[g] }));
    }

    /* 真机枚举：直接解析思源已渲染的主菜单 #menu，返回 [{ title, items:[{value,label,icon}] }]。
       返回 null 表示 #menu 不存在或结构不认识（调用方走注册表兜底）。
       - 插件组（组内含 menuPlugin 或插件停靠条目）整组不收录——插件不考虑；
       - fn__none（当前版本隐藏的条目）不收录——列出来也打不开；
       - label / icon 优先取注册表（文案更稳），没有再用 DOM 里的实际值（对齐宿主 i18n 语言）。 */
    function liveSettingGroups() {
        if (typeof document === "undefined") return null;
        const menu = document.getElementById("menu");
        if (!menu) return null;
        const groups = [];
        menu.querySelectorAll(".b3-menu__group").forEach((gEl) => {
            if (gEl.querySelector("#menuPlugin") || gEl.querySelector("[data-type=\"mobile-plugin-dock\"]")) return;
            const titleEl = gEl.querySelector(".b3-menu__group-title");
            const title = titleEl ? String(titleEl.textContent || "").trim() : "";
            const items = [];
            gEl.querySelectorAll(".b3-menu__item").forEach((el) => {
                if (el.classList.contains("fn__none")) return;
                if (el.getAttribute("data-type") === "mobile-plugin-dock") return;
                if (!el.id) return;
                const use = el.querySelector("use");
                const domIcon = use ? String(use.getAttribute("xlink:href") || use.getAttribute("href") || "").replace(/^#/, "") : "";
                const labelEl = el.querySelector(".b3-menu__label");
                const domLabel = String((labelEl ? labelEl.textContent : el.textContent) || "").trim();
                items.push({
                    value: el.id,
                    label: settingLabels[el.id] || domLabel || el.id,
                    icon: settingIcons[el.id] || domIcon
                });
            });
            if (items.length) groups.push({ title: title, items: items });
        });
        return groups.length ? groups : null;
    }

    /* 设置页「设置」网格项（分组版）：[{ title, items:[{ value, label, icon }] }]。
       真机优先枚举主菜单 DOM；拿不到再退回静态注册表，保证任何环境都有可选清单。 */
    function settingGroups() {
        return liveSettingGroups() || fallbackSettingGroups();
    }

    /* 设置页「设置」扁平清单：与 settingGroups 同源拍平，供校验等消费 */
    function settingOptions() {
        const all = [];
        settingGroups().forEach((g) => (g.items || []).forEach((o) => all.push(o)));
        return all;
    }

    /* 执行一个「设置」按钮：多级降级，绝不静默无反应。
       ① 首选：对主菜单里的官方条目元素派发一个**冒泡 click**——移动端 #menu 在 App 启动时
          就整体渲染、点击委托在容器上，这一步会原样走思源官方处理（打开对应设置页签 /
          打开面板 / 执行动作），跨版本最稳；
       ② 降级：条目不在 DOM 里时，若它有对应的全局命令（SETTING_COMMANDS）走命令系统；
       ③ 再降级：menuConfigXxx（设置页签）还原出 tab id 走 openSetting 命令；
       ④ 兜底：明确提示。 */
    function execSettingCommand(settingId) {
        const id = String(settingId || "");
        if (!id) return;
        /* 设置是跳去全屏界面的按钮，不需要保键盘；先把软键盘收了，
           否则 IME 会盖在设置页上、键盘工具条也跟着漂浮。动作 / 快捷短语
           走插入路径、自动保键盘，不受影响。 */
        hideKeyboard();
        const reg = SETTING_ITEMS.filter((x) => x.value === id)[0] || null;
        const label = (reg && reg.label) || settingLabels[id] || id || "设置";
        if (typeof document !== "undefined") {
            const el = document.getElementById(id);
            if (el) {
                try {
                    let ev = null;
                    try { ev = new MouseEvent("click", { bubbles: true, cancelable: true }); }
                    catch (e) { ev = new CustomEvent("click", { bubbles: true, cancelable: true }); }
                    el.dispatchEvent(ev);
                    return;
                } catch (e) { /* 派发失败，继续降级 */ }
            }
        }
        const sy: any = (typeof window !== "undefined") ? window.siyuan : null;
        const cmds = sy && sy.commands;
        const cmd = SETTING_COMMANDS[id];
        if (cmd && cmds && typeof cmds.execCommand === "function") {
            try { if (cmds.execCommand(cmd) !== false) return; } catch (e) { /* 忽略 */ }
        }
        if (/^menuConfig/.test(id) && cmds && typeof cmds.execCommand === "function") {
            try { if (cmds.execCommand("openSetting", id.slice(10).toLowerCase()) !== false) return; } catch (e) { /* 忽略 */ }
        }
        toast("无法打开「" + label + "」", true);
    }

    /* ============================================ 官方块菜单检测 ======
       用户点 APP 自带键盘工具条「＋」打开的「块功能选择面板」就是原生 .b3-menu；
       它开着时本插件的底栏要让位（否则两层菜单叠在键盘上方）。
       插件自己的浮层用 .sy-mb-panel，不是 .b3-menu，故此判定不会误伤自身面板。 */
    function menuRoot() {
        try {
            const sy = window.siyuan;
            if (sy && sy.menus && sy.menus.menu && sy.menus.menu.element) return sy.menus.menu.element;
        } catch (e) { /* ignore */ }
        return document.getElementById("commonMenu");
    }

    /* ── v0.8.71：思源官方浮层让路开关 ──────────────────────────────────
       `.protyle-util` 是思源所有内联编辑浮层的单例容器（protyle/toolbar/index.ts
       的 showRender 创建，关闭只加 fn__none）。移动端「行级公式 / 公式块」编辑
       面板就走它，会话生命周期完全归思源管：
           textarea 输入 → dispatch input → closeSubElement →
           subElementCloseCB 把 textarea.value 写回 renderElement[data-content]

       而本插件的四套键盘守卫会从四个方向把这条链路掐断（日志与对照实测）：
         ① 续锁（armKeyboardGuard / keepKeyboardAlive）让 keyboardLockUntil
            永不断档 → keyboardToolbar.ts:728 的 activeBlur 闸门挡住
            hideElements(["util"]) → closeSubElement 永不执行 → 只剩
            tableCellRichEditor.finish() 用旧值 commit 一次（会话半死）；
         ② HTMLElement.prototype.blur 拦截把面板里 math-field 的 blur 挡回去
            → math-field 失去重建/重新聚焦的机会 → 按键进不去；
         ③ focusout 守卫把焦点从面板拽回编辑器 → 用户按的是虚拟键盘，
            字符却打进了别的块（「按了没反应」）；
         ④ hideKeyboardToolbar 返回 2 → 原生 showSoftKeyboard() 把 IME 叫回来
            → 与公式键盘叠成一坨。

       对照实测：禁用本插件后同样的操作可以正常输入。故浮层可见期间全线让路，
       不与思源的会话争焦点。BlockBar 自己的浮层是 #syMobileToolbarSheet /
       #syMobileToolbarPicker（.sy-mb-panel），不在 .protyle-util 里，不受影响。 */
    function siyuanPanelOpen() {
        let list = null;
        try { list = document.querySelectorAll(".protyle-util"); } catch (e) { return false; }
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            if (!el.isConnected) continue;
            /* ① 思源关闭浮层只加 fn__none（.fn__none{display:none!important}），
                  这是唯一可靠的开关位 —— 容器本身单例复用、不销毁。 */
            if (el.classList && el.classList.contains("fn__none")) continue;
            /* ② 真可见：display:none 的元素 rect 全 0，一并排除掉了 */
            if (!el.getBoundingClientRect || el.getBoundingClientRect().height <= 0) continue;
            /* ③ 只认「编辑会话真的在跑」这一种浮层。
                  .protyle-util 是思源所有内联浮层的单例容器（显示 = 去掉 fn__none），
                  所以判据只能是「此刻正在编辑」的活证据，不能是「容器里留下过什么」。
                  v0.8.71 栽在「有没有输入控件」上，v0.8.72 栽在「关闭回调还挂着」，
                  两次都是**永久性误判** —— 一旦恒为 true，本插件整套键盘守卫
                  （续锁 / blur 守卫 / IME 让路）就全线失效，现场表现都是同一句：
                  「一开始用着还正常，后面点开面板输入法键盘就被提前收掉了」。 */
            /* v0.8.73：判据收敛成两条「此刻为真」的事实。
               v0.8.72 的 b) 条件（subElement === el 且 subElementCloseCB 挂着）
               会**长期为真**：数学键盘插件的 close-hold 会在思源收尾置空之后再把
               关闭回调挂回来，于是「公式会话早就结束、回调却还在」→ 本函数恒为
               true → 整套键盘守卫（续锁 / blur 守卫 / IME 让路）从此全线失效。
               现场表现正是用户反馈的那句「一开始用着还正常，后面点开面板
               输入法键盘就被提前收掉了」。
               改用两条硬事实：
                 a) 容器里有 math-field —— 数学键盘每次会话都注入，cleanup 必移除；
                 b) 焦点此刻就在这个容器里 —— 思源原生内联面板要 textarea 拿到
                    焦点才叫「在编辑」，会话一结束焦点就回编辑器，条件自然转假。 */
            if (el.querySelector("math-field")) return true;
            const ae = document.activeElement;
            if (ae && ae !== document.body && ae !== document.documentElement &&
                el.contains(ae)) {
                return true;
            }
        }
        return false;
    }



    /* v0.8.74：「公式会话真的在跑」的**硬证据** —— 可见的 .protyle-util 里存在
       math-field。数学键盘插件每次会话都注入它、cleanup 必移除，所以这条只为真。
       与 siyuanPanelOpen() 的区别在于**不掺焦点**：焦点在工具条按钮上一晃就丢，
       而 DOM 元素不会。用它来裁决「本插件要不要替用户守住输入法键盘」——
       只有公式会话真的活着（键盘归数学插件管）才让路。 */
    function mathSessionLive() {
        let list = null;
        try { list = document.querySelectorAll(".protyle-util"); } catch (e) { return false; }
        for (let i = 0; i < list.length; i++) {
            const el = list[i];
            if (!el.isConnected) continue;
            if (el.classList && el.classList.contains("fn__none")) continue;
            if (!el.getBoundingClientRect || el.getBoundingClientRect().height <= 0) continue;
            if (el.querySelector("math-field")) return true;
        }
        return false;
    }



    /* 判定三要素：连入 DOM + 可见（高度 > 0）+ 确有菜单项 ——
       避免空菜单 / 隐藏态（思源常驻容器但 display:none）误触发。 */
    function nativeMenuOpen() {
        const root = menuRoot();
        if (!root || !root.isConnected) return false;
        if (root.getBoundingClientRect && root.getBoundingClientRect().height <= 0) return false;
        return !!root.querySelector(".b3-menu__item");
    }

    /* ============================================ 表格光标记忆 ======
       表格工具栏已移除（思源 3.8.8 起原生表格能力已足够，见 README「版本要求」），
       但**「光标在单元格里不丢」必须保留** —— 那是本插件核心的键盘守卫行为：
       内核重渲染表格块后 document.activeElement 会掉回 body，键盘随即收起。
       实现见 engine/table-caret.ts（按「块 id + 行/列索引」记位置，重渲染后找回）。 */
    const {placeCaretIn, rememberTableCaret, tableCaretCell} = createTableCaret();


    function buttonActionOf(def) {
        if (!def) return null;
        switch (def.type) {
            case "panel":    return () => actionPanel(def);
            case "builtin":  return ACTIONS[def.builtinId] || panelPresetAction(def.builtinId);
            case "popup":    return () => runPopupSelect(def);
            case "setting":  return () => execSettingCommand(def.settingId);
            default: return null;
        }
    }

    /* builtinId 指向某个面板预设（如 headingPanel）时，回退成打开对应面板 */
    function panelPresetAction(id) {
        if (PANEL_PRESETS[id]) return () => actionPanel({ panelId: id });
        return null;
    }

    function defaultChildName(child) {
        if (child.type === "popup") return (child.options || []).map((o) => o.name || o.value).join("/") || "快捷短语";
        return "按钮";
    }

    /* 面板条目的显示文案 —— 设置页预览与实际弹出的面板共用这一套规则，
       这样「设置里看到的」就等于「点开后弹出的」，不会两处对不上。
       优先级：长按提示 tip → 自定义名称 → 动作规范名（ACTION_NAMES）→ 兜底名。
       例外：旧默认里写死的占位短名（headingPanel 的 "H1".."H6"、旧页签面板的
       「思维导图」，见 LEGACY_KID_NAMES）一律让位给规范动作名，避免设置页与
       实际面板显示不一致。 */
    function itemLabel(child) {
        if (!child) return "";
        const tip = String(child.tip == null ? "" : child.tip).trim();
        if (tip) return tip;
        const raw = String(child.name == null ? "" : child.name).trim();
        if (child.type === "builtin") {
            const canon = ACTION_NAMES[child.builtinId] || "";
            if (raw && LEGACY_KID_NAMES[child.builtinId] !== raw) return raw;
            return canon || raw || defaultChildName(child);
        }
        return raw || defaultChildName(child);
    }

    /* 把一个子按钮定义翻译成 showSheet 的条目（含 act 回调） */
    function childItemOf(child) {
        const act = buttonActionOf(child);
        const title = itemLabel(child);
        const ic = buttonIconOf(child.icon);
        const item: any = {
            name: title,
            icon: ic.html,
            act: act ? () => Promise.resolve(act()).catch((e) => toast(String((e && e.message) || e), true)) : null
        };
        // 提示块子项：按官方键盘工具条的样式，把类型名染成对应 --b3-callout-* 颜色
        const m = /^callout-(NOTE|TIP|IMPORTANT|WARNING|CAUTION)$/.exec(String(child.id || ""));
        if (m) {
            const meta = CALLOUTS.filter((x) => x.type === m[1])[0];
            if (meta) {
                item.html = lang("callout", "提示块") + " - " +
                    '<span style="color: ' + meta.color + '">' + meta.name + "</span>";
            }
        }
        return item;
    }

    /* 面板类型按钮：点击后弹出由 children 构成的选项面板 */
    async function actionPanel(def) {
        const children = (def.children && def.children.length)
            ? def.children
            : PANEL_PRESETS[def.panelId];
        if (!children || !children.length) {
            toast("该面板还没有配置任何按钮", true);
            return;
        }
        const items = children
            .filter((c) => c && c.enabled !== false)
            .map(childItemOf);
        const picked = await showSheet(items);
        if (picked && typeof picked.act === "function") return picked.act();
    }

    /* 模板占位符 → 实际值。
       {C} 与内置动作共用 slash() 的规则（换成 Lute.Caret 光标位）——
       此前这里漏了这一步，设置里填的 {C} 会被原样当成文字插进去。 */
    function fillTokens(tpl) {
        const d = new Date();
        const p2 = (n) => (n < 10 ? "0" : "") + n;
        return String(tpl == null ? "" : tpl)
            .replace(/\{\{date\}\}/g, d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()))
            .replace(/\{\{time\}\}/g, p2(d.getHours()) + ":" + p2(d.getMinutes()))
            .replace(/\{\{datetime\}\}/g,
                d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) +
                " " + p2(d.getHours()) + ":" + p2(d.getMinutes()))
            .replace(/\{\{clipboard\}\}/g, "")
            .replace(/\{C\}/g, luteCaret());
    }

    /* 插入短语内容：走 hint.fill（与官方斜杠菜单同通道），支持 markdown 与 {C} 光标位。
       注意 ensureCaret()：值里必须带光标位，否则插入后思源没人接焦点、
       原生层会收键盘（用户看到「键盘先关再开」）。原因见 ensureCaret 的长注释。
       供「快捷短语（popup）」复用 —— 单条选项的 popup 与多条的都走这里。 */
    async function insertCustomTemplate(text) {
        const value = ensureCaret(fillTokens(text));
        if (!value) {
            toast("内容为空，请先在插件设置里填写", true);
            return;
        }
        /* 失败时给个反馈：fillSlash 只在「光标不在任何块内」时返回 false，
           此时原先是一声不响什么也不做，用户会以为按钮坏了 */
        if (!fillSlash(value)) {
            toast("请先把光标放到文档内容里，再点这个按钮", true);
        }
    }

    /* 弹出短语列表选择：options = [{ name, value }]，选中后当作模板插入。
       只有一条选项时直接插入，省掉「弹一下再选」的多余一步（这也让「快捷短语」能完整
       替代原「内容」类型：单段固定文字不必再单列一种类型）。 */
    async function runPopupSelect(def) {
        const options = (def.options || []).filter((o) => o && (o.value != null));
        if (!options.length) {
            toast("选项未配置", true);
            return;
        }
        if (options.length === 1) {
            await insertCustomTemplate(options[0].value);
            return;
        }
        const picked = await showSheet(options.map((o) => ({
            name: o.name || o.value, value: o.value
        })));
        if (!picked) return;
        await insertCustomTemplate(picked.value);
    }

    /* 图标规格 → { symbolId, key } / { style } / null。
       ── 0.5.0 关键修复 ────────────────────────────────────────────────────────
       四种写法都要能吃下，历史配置才不会退化成文字：
         · "iconH1"       思源 symbol id（图标选择器写入的形态，0.2 起）
         · "#iconH1"      带 # 前缀的等价写法
         · "heading" / "h1" / "list" / "math" / "tabs" / "datetime" / "template" …
                          0.1.x 老配置把「动作键名」当图标存 —— 这正是
                          「工具栏图标显示成文字」的根因：这些值既不是 symbol id，
                          也不匹配 iconXxx，于是掉进文本兜底分支被渲染成
                          <span class="sy-mb-glyph">heading</span>。
                          现在先在 SY_ICON 里查一次键名，直接还原成正确图标。
         · "style:info" 等内置样式色块（见 styleGlyph）
       返回 null 表示这不是一个能识别的图标（调用方按文本字形渲染）。 */
    function resolveIconSpec(raw) {
        if (!raw) return null;
        const m = /^style:(info|success|warning|error|clear)$/.exec(raw);
        if (m) return { style: m[1] };
        const id = raw.charAt(0) === "#" ? raw.slice(1) : raw;
        if (Object.prototype.hasOwnProperty.call(SY_ICON, id)) {
            return { symbolId: SY_ICON[id], key: id };
        }
        if (/^H[1-6]$/.test(id)) {
            const k = id.toLowerCase();
            return { symbolId: SY_ICON[k], key: k };
        }
        if (/^icon[A-Za-z0-9]+$/.test(id)) {
            // 任意思源 symbol id（图标选择器 / 主题自带的图标都能选到）；
            // 顺手反查一下它是不是某个内置键，是的话 skey 能让重建逻辑继续接管
            let key = "";
            Object.keys(SY_ICON).some((k) => {
                if (SY_ICON[k] === id) { key = k; return true; }
                return false;
            });
            return { symbolId: id, key: key };
        }
        return null;
    }

    /* 按钮图标：思源 symbol / 内置样式色块 / 文本字形（emoji、单字）。
       返回 { html, skey }：skey 非空表示该图标能在 symbol 注入后自动换真图标。 */
    function buttonIconOf(spec) {
        const raw = String(spec || "").trim();
        if (!raw) return { html: lineIcon(FALLBACK_ICON.list), skey: "list" };

        const hit = resolveIconSpec(raw);
        if (hit && hit.style) {
            return { html: styleGlyph(hit.style), skey: "" };
        }
        if (hit) {
            if (CONFIG.useSiyuanIcons && hasSymbol(hit.symbolId)) {
                return { html: syIcon(hit.symbolId), skey: hit.key };
            }
            /* v0.8.15：SY_ICON 表外的 iconXxx（设置类的 iconBazaar、图标选择器自选等）
               也要能「symbol 注入后自动换真」—— 用 symbolId 本身当 skey。
               否则启动期 symbol 尚未注入时渲染成 fallback，且 data-sy-icon 为空，
               rebuildIcons 的重试永远跳过它 —— 真实踩坑：集市图标重启 APP 后变列表图标。 */
            return { html: lineIcon(FALLBACK_ICON[hit.key] || FALLBACK_ICON.list),
                     skey: hit.key || hit.symbolId };
        }
        // 非 symbol：按文本字形渲染（emoji / 单字 / 用户自己填的文字）
        const esc = raw.replace(/[&<>"]/g, (c) => (
            { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
        ));
        return { html: '<span class="sy-mb-glyph">' + esc + "</span>", skey: "" };
    }

    function buttonTitle(def) {
        if (def.tip && def.tip.trim()) return def.tip;
        if (def.type === "builtin") return ACTION_NAMES[def.builtinId] || def.name || "";
        if (def.type === "setting") return (settingLabels[def.settingId] || def.name) || "";
        return def.name || "";
    }

    /* 当前生效的一套按钮：只有快捷工具栏一套（表格工具栏已移除）。 */
    function activeList() {
        return Array.isArray(CONFIG.buttons) ? CONFIG.buttons : DEFAULT_BUTTONS;
    }

    /* 把配置里的按钮定义翻译成工具条 item */
    function buildButtonItems() {
        const list = activeList();
        const items = [];
        list.forEach((def) => {
            if (!def || def.enabled === false) return;
            /* v0.8.9：新建按钮默认「还没选动作」（builtinId 为空），这是**待配置的正常状态**，
               不是坏数据 —— 静默跳过即可。此前会走到下面的 toast 分支，
               每次工具条重建都弹一次「无法识别的按钮」，纯属噪音。
               真正无法识别的（非空但查不到动作）才提示。
               「设置」按钮同样：settingId 为空（待选）静默跳过，不 toast。 */
            if (def.type === "builtin" && !def.builtinId) return;
            if (def.type === "setting" && !def.settingId) return;
            const act = buttonActionOf(def);
            if (!act) {
                toast("无法识别的按钮：" + (def.name || def.type || def.builtinId), true);
                return;
            }
            const ic = buttonIconOf(def.icon);
            items.push({
                kind: "icon",
                iconKey: ic.skey,
                icon: ic.html,
                title: buttonTitle(def),
                act: () => Promise.resolve(act()).catch((e) => toast(String((e && e.message) || e), true)),
                long: (def.type === "builtin" && def.builtinId === "asset") ? () => actionInsert("image") : null,
                panel: def.type === "panel"
            });
        });

        /* v0.8.17：工具栏末尾「设置入口」齿轮 —— 排列在所有按钮**最后面**的
           一个普通按钮：与大家一同等分、一同横向滚动，按钮铺满时需要往左滑动
           才能看到它（这正是用户要的「固定在最末端、不影响其他按钮排序」——
           排序指不动用户配置的按钮顺序，齿轮永远追加在末尾）。
           早期版本（v0.8.16）做成 bar 的 fixed 兄弟层，结果 --sy-mb-offset 等
           几何变量写在 bar 元素上、兄弟层读不到，bottom 回退 0px，齿轮落到了
           系统键盘工具栏那一行（真实踩坑，见截图反馈）。改为滚动流内的按钮后，
           显隐随 bar 自动同步，也不再有多的一套几何要维护。 */
        if (CONFIG.settingsEntry) {
            const gic = buttonIconOf("gear");
            items.push({
                kind: "icon",
                iconKey: gic.skey,
                icon: gic.html,
                title: SETTINGS_ENTRY_TITLE,
                act: () => {
                    // 跳全屏设置界面前先收键盘（与「设置」按钮同一套，否则 IME 盖住弹窗）
                    hideKeyboard();
                    const fn = window.__syMbOpenSetting;
                    if (typeof fn === "function") {
                        try { fn(); }
                        catch (e) { toast(String((e && e.message) || e), true); }
                    } else {
                        // 桥接未注入（桌面端 / 异常情况）：退回思源主菜单的设置项
                        execSettingCommand("menuConfigAppearance");
                    }
                },
                panel: false,
                entry: true
            });
        }
        return items;
    }

    /* 只重建按钮区（不动面板 / 监听器 / 几何测量） */
    function rebuildButtons() {
        if (!bar) return;
        bar.querySelectorAll(".sy-mb-btn, .sy-mb-sep").forEach((el) => el.remove());
        buildButtonItems().forEach((it) => {
            const btn = ce("button", "sy-mb-btn" + (it.entry ? " sy-mb-btn--entry" : ""));
            btn.type = "button";
            btn.setAttribute("aria-label", it.title);
            btn.title = it.title;
            if (it.iconKey) btn.setAttribute("data-sy-icon", it.iconKey);
            btn.innerHTML = it.icon;
            bindButton(btn, it.act, it.long);
            bar.appendChild(btn);
        });
        rebuildIcons();
        updateVisibility();
        updateVisible();
        updateOverflow();
    }

    /* 工具条可横向滚动时，给「确实还藏着按钮的那一侧」加渐隐遮罩，提示「还能滑」。
       靠 mask-image 实现，纯 CSS，无额外 DOM。
       注意要分左右：停在最左端时左侧不该淡出，否则第一个按钮会被无故压暗。 */
    function updateOverflow() {
        if (!bar) return;
        const maxScroll = bar.scrollWidth - bar.clientWidth;
        const scrollable = maxScroll > 2;
        bar.classList.toggle("sy-mb-scroll", scrollable);
        bar.classList.toggle("sy-mb-scroll-l", scrollable && bar.scrollLeft > 2);
        bar.classList.toggle("sy-mb-scroll-r", scrollable && bar.scrollLeft < maxScroll - 2);
    }

    /* 设置「可见图标上限」：每个按钮等宽占 100%/maxIcons，超过即横向滑动。
       上限固定 9（MAX_VISIBLE）——传更大的值也只按 9 处理，避免把工具条压扁。 */
    function setMaxIcons(n) {
        const v = Math.max(1, Math.min(MAX_VISIBLE, parseInt(n, 10) || MAX_VISIBLE));
        CONFIG.maxIcons = v;
        if (bar) {
            updateVisible();
            updateOverflow();
        }
    }

    /* 按「实际渲染的按钮数」与「上限」取较小值作为等宽基准：
       9 个按钮 + 上限 9 → 每个占 100%/9，正好铺满、不滚动；
       超过上限 → 每个占 100%/上限，溢出后由父容器左右滑动。 */
    function updateVisible() {
        if (!bar) return;
        const items = bar.querySelectorAll(".sy-mb-btn");
        const n = Math.min(items.length || activeList().length, CONFIG.maxIcons || MAX_VISIBLE);
        bar.style.setProperty("--sy-mb-visible", String(n));
    }

    function setButtons(list) {
        CONFIG.buttons = Array.isArray(list) ? list : DEFAULT_BUTTONS;
        rebuildButtons();
    }

    /* ============================================ 设置入口齿轮（v0.8.16） ====
       可选开关：打开后工具栏**最末端**（所有按钮最后面）出现一个齿轮按钮，
       点击跳转到本插件的「自定义按钮」配置界面（openSetting，
       由 index.ts 注入 __syMbOpenSetting）。

       v0.8.17 起齿轮就是 bar 滚动流里的最后一个普通按钮：与大家一同等分、
       一同横滑，按钮铺满时需要往左滑动才看到它。齿轮的渲染在 buildButtonItems
       末尾追加（见那里的注释），这里只负责开关：
       早期（v0.8.16）曾做成 bar 的 fixed 兄弟节点想「钉」在右端，但
       --sy-mb-offset / --sy-mb-safe 等几何变量写在 bar 元素上，兄弟层读不到、
       bottom 回退 0px，齿轮落到了系统键盘工具栏那一行（真实踩坑）；
       且用户要的本就是「滑到末端才看到」，滚动流内方案两者都满足。 */
    function setSettingsEntry(on) {
        CONFIG.settingsEntry = !!on;
        rebuildButtons();
    }

    /* ============================================== 构建 DOM ============== */
    function buildBar() {
        bar = ce("div");
        bar.id = "syMobileToolbar";
        bar.setAttribute("role", "toolbar");
        bar.setAttribute("aria-label", "移动端工具底栏");
        bar.classList.add("sy-mb-hidden");   // 初始隐藏，软键盘打开后出现
        // 每个按钮等宽占 100%/可见数；超过上限即出现横向滑动（由 updateVisible 计算）
        updateVisible();
        bar.addEventListener("scroll", () => updateOverflow(), { passive: true });

        const items = buildButtonItems();

        items.forEach((it) => {
            if (it.kind === "sep") {
                bar.appendChild(ce("div", "sy-mb-sep"));
                return;
            }
            const btn = ce("button", "sy-mb-btn" + (it.entry ? " sy-mb-btn--entry" : ""));
            btn.type = "button";
            btn.setAttribute("aria-label", it.title);
            btn.title = it.title;
            if (it.iconKey) btn.setAttribute("data-sy-icon", it.iconKey);
            btn.innerHTML = it.kind === "text"
                ? '<span class="sy-mb-text">' + it.label + "</span>"
                : it.icon;
            bindButton(btn, it.act, it.long);
            bar.appendChild(btn);
        });

        document.body.appendChild(bar);

        /* 横向滑动由我们自己接管（原生滚动被按钮的 touchstart preventDefault 掐断，见 bindBarPan） */
        bindBarPan();
        bindBarPanMouse();
        /* 整条工具条的触摸封边：不放进 bindBarPan —— 那里全是捕获阶段，这里必须冒泡（v0.8.21） */
        sealBarTouches();
        /* 诊断钩子 + 焦点守卫（blur 拦截）都在这里装上，与工具条同生命周期 */
        installFocusGuard();   // 焦点守卫（正式修复）

        // 布局稳定后再判断一次是否出现横向滑动（首帧 clientWidth 可能还没就绪）
        requestAnimationFrame(() => updateOverflow());
        window.addEventListener("resize", updateOverflow, { passive: true });

        // 模板选择面板（仅在无法调用思源自带模板面板时使用）
        sheet = ce("div");
        sheet.id = "syMobileToolbarSheet";
        sheet.style.display = "none";
        sheet.innerHTML =
            '<div class="sy-mb-mask"></div>' +
            '<div class="sy-mb-panel">' +
            '<div class="sy-mb-grip-zone"><div class="sy-mb-grip"></div></div>' +
            '<div class="sy-mb-list"></div>' +
            "</div>";
        document.body.appendChild(sheet);

        // 日期 / 时间滚轮选择面板（v10）：遮罩 / 底部弹层 / 小横条与选择面板同源
        pickerEl = ce("div");
        pickerEl.id = "syMobileToolbarPicker";
        pickerEl.style.display = "none";
        pickerEl.innerHTML =
            '<div class="sy-mb-mask"></div>' +
            '<div class="sy-mb-panel sy-mb-picker">' +
            '<div class="sy-mb-grip-zone"><div class="sy-mb-grip"></div></div>' +
            '<div class="sy-picker-head">' +
            '<button type="button" class="sy-picker-btn sy-picker-cancel">取消</button>' +
            '<div class="sy-picker-display"></div>' +
            '<button type="button" class="sy-picker-btn sy-picker-ok">插入</button>' +
            "</div>" +
            '<div class="sy-picker-stage"><div class="sy-picker-band"></div></div>' +
            "</div>";
        document.body.appendChild(pickerEl);
        bindSheetDrag(pickerEl);

        document.body.classList.add("sy-mb-enabled");
        if (CONFIG.contentPadding) document.body.classList.add("sy-mb-pad");
    }

    /* 思源 symbol 是异步注入的；注入完成后把按钮换成真正的思源图标。
       按 data-sy-icon 而非下标匹配，增删按钮不会错位。 */
    function rebuildIcons() {
        if (!bar || !CONFIG.useSiyuanIcons) return false;
        let changed = false;
        bar.querySelectorAll(".sy-mb-btn[data-sy-icon]").forEach((btn) => {
            if (btn.querySelector("use")) return;
            const key = btn.getAttribute("data-sy-icon");
            /* v0.8.15：SY_ICON 表外的 skey 就是 symbol id 本身（见 buttonIconOf），
               比如设置按钮的 iconBazaar —— 表里查不到，直接当 symbolId 用。 */
            const id = SY_ICON[key] ||
                (/^icon[A-Za-z0-9]+$/.test(key) ? key : "");
            if (!id || !hasSymbol(id)) return;
            btn.innerHTML = syIcon(id);
            changed = true;
        });
        return changed;
    }

    let iconRetry = 0;
    function rebuildIconsWithRetry() {
        clearSymbolCache();
        const changed = rebuildIcons();
        iconRetry++;
        if (iconRetry < 20 && (!changed || document.querySelectorAll(".sy-mb-btn use").length < 4)) {
            setTimeout(rebuildIconsWithRetry, 600);
        }
    }

    /* ============================================== 手势绑定 ============== */
    function pressIn(el) { el.classList.add("sy-mb-press"); }
    function pressOut(el) { el.classList.remove("sy-mb-press"); }

    let panRaf = 0;   // 横向滑动惯性动画句柄（destroy 时清掉）
    let barPanMoved = false;   // 桌面鼠标拖拽滑动时置位，避免拖完又误触发一次按钮点按

    /* 工具条横向滑动 —— 由我们自己接管，不依赖浏览器原生滚动。
       背景：按钮的 touchstart 里必须 preventDefault（否则点一下就把焦点从正文抢走、软键盘收起），
       而 cancel 掉 touchstart 会让浏览器认为这次触摸不参与滚动，于是 #syMobileToolbar 的
       overflow-x:auto 永远滑不动 —— 第 10 个按钮被推到屏幕外就再也够不着了。
       所以这里手动接管：横向位移超过阈值就自己写 scrollLeft（并阻止原生行为），松手补一小段惯性。
       阈值与按钮的「点按 / 拖动」判定（10px）保持一致：
       位移不足 10px 一律算点按，按钮照常响应，不会因为加了滑动而变得难点。

       ⚠️ 监听必须挂在**捕获阶段**（capture:true）。原因：按钮的 touchstart / touchend 里
       会 stopPropagation（见 sealEvent —— 防止点按被思源的 document 级手势管线误判、
       进而收起软键盘）。stopPropagation 只影响冒泡，而按钮是 bar 的子节点：如果这里
       用默认的冒泡阶段，按钮先执行、冒泡到 bar 之前就被掐断，bar 永远收不到这次触摸，
       armed 保持 false —— 表现就是「工具条再也滑不动，第 10 个以后的按钮看不见」。
       捕获阶段由外向内，bar 一定先于按钮拿到事件；按钮对 document 的截断照旧生效。 */
    function bindBarPan() {
        if (!bar) return;
        let sx = 0, sy = 0;          // 判定时的触点（判定后重新基准）
        let baseLeft = 0;            // 判定时的 scrollLeft
        let armed = false;           // 触摸开始，等待判定方向
        let lastX = 0, lastT = 0, vx = 0;   // vx = 每毫秒位移（向左为正）
        let rubberX = 0;                     // v0.8.55 边缘橡皮筋当前位移（px）

        const maxScroll = () => Math.max(0, bar.scrollWidth - bar.clientWidth);
        const clampLeft = (v) => Math.max(0, Math.min(maxScroll(), v));
        const stopInertia = () => { if (panRaf) { cancelAnimationFrame(panRaf); panRaf = 0; } };

        bar.addEventListener("touchstart", (ev) => {
            stopInertia();
            /* v0.8.56：清掉上一轮横滑残留的边缘橡皮筋（只作用在按钮上的 --sy-mb-rubber 变量），
               交还给 CSS 控制；不影响工具栏显示/隐藏用的 translateY（在 bar 上） */
            if (rubberX !== 0 || bar.style.getPropertyValue("--sy-mb-rubber")) {
                bar.classList.remove("sy-mb-rubber-out");
                bar.style.setProperty("--sy-mb-rubber", "");
                rubberX = 0;
            }
            /* v0.8.22：这里**不再**因为「没溢出」就整条放手。
               按钮不足 9 个（如只配了 4~5 个）时永远不溢出；
               一旦放手，这一下横滑就成了「没人接管的触摸」：手指若落在按钮之间的
               空档上，连按钮自己的 preventDefault 都没有，浏览器就会按默认动作处理
               （挪焦点 / 清选区）→ 编辑器的 contenteditable 失焦 → 原生层收软键盘
               （真机实测：「在工具条上左右滑动，直接把键盘滑没了」）。
               所以现在无论如何都接管方向判定；没有溢出时 maxScroll() = 0，
               clamp 之后不会有任何位移，用户感知就是「这一下被工具条吃掉了，
               不会漏到页面上去」。 */
            const t = ev.touches && ev.touches[0];
            if (!t) { armed = false; panning = false; return; }
            barPanMoved = false;
            sx = t.clientX;
            sy = t.clientY;
            armed = true;
            panning = false;
            vx = 0;
        }, { passive: true, capture: true });

        bar.addEventListener("touchmove", (ev) => {
            if (!armed) return;
            const t = ev.touches && ev.touches[0];
            if (!t) return;
            if (!panning) {
                const dx = t.clientX - sx;
                const dy = t.clientY - sy;
                if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;   // 未达阈值：仍算点按
                if (Math.abs(dy) > Math.abs(dx)) { armed = false; return; }   // 竖直手势让位给页面
                /* 判定为横向滑动：连判定这一帧也阻止默认行为，
                   并以这一刻为基准（此刻之前浏览器可能有几像素原生漂移，一并丢掉） */
                panning = true;
                if (ev.cancelable) ev.preventDefault();
                /* v0.8.24：判定为横滑的这一刻起给键盘上锁（见 armGuardThrottled 注释）——
                   此后 activeBlur() 会被闸门挡回去，「键盘 + 工具条一起关掉再打开」
                   不会再发生。**只在真的滑动时才上锁**：单纯点按按钮不该去碰焦点，
                   那是 v0.8.23「表格动作不动键盘」的底线。 */
                armGuardThrottled(true);
                /* 标记本次是「横滑」——按钮抬手时据此不再当成点按执行动作 */
                barPanMoved = true;
                baseLeft = bar.scrollLeft;
                sx = lastX = t.clientX;
                lastT = ev.timeStamp || Date.now();
                return;
            }
            if (ev.cancelable) ev.preventDefault();   // 停掉可能存在的原生滚动，避免双重位移
            armGuardThrottled();                      // 长滑动时续锁（锁只有 500ms）
            const now = ev.timeStamp || Date.now();
            const dt = now - lastT;
            if (dt > 0) vx = (lastX - t.clientX) / dt;
            lastX = t.clientX;
            lastT = now;
            bar.scrollLeft = clampLeft(baseLeft - (t.clientX - sx));
            /* v0.8.55：在边界外继续拉 → 边缘橡皮筋（iOS 同款）。仅视觉 translateX，
               不动 scrollLeft，也不碰焦点/键盘守卫。 */
            const intended = baseLeft - (t.clientX - sx);
            if (intended < 0 || intended > maxScroll()) {
                const rb = Math.max(-80, Math.min(80, (bar.scrollLeft - intended) * 0.3));
                applyRubber(rb);
            } else if (rubberX !== 0) {
                applyRubber(0);
            }
        }, { passive: false, capture: true });

        const prefersReduced = () =>
            (typeof matchMedia === "function") && matchMedia("(prefers-reduced-motion: reduce)").matches;

        /* v0.8.56：边缘橡皮筋只作用于按钮（背景固定在 bar 上不动）。
           用 CSS 变量 --sy-mb-rubber 驱动 .sy-mb-btn 的 translateX，收尾由 .sy-mb-rubber-out 接管过渡 */
        const applyRubber = (x) => {
            rubberX = x;
            bar.classList.remove("sy-mb-rubber-out");
            bar.style.setProperty("--sy-mb-rubber", x ? x + "px" : "");
        };
        const settleRubber = () => {
            if (rubberX === 0 && !bar.style.getPropertyValue("--sy-mb-rubber")) return;
            if (bar.classList.contains("sy-mb-hidden")) {
                bar.style.setProperty("--sy-mb-rubber", "");
                bar.classList.remove("sy-mb-rubber-out");
                rubberX = 0; return;
            }
            bar.classList.add("sy-mb-rubber-out");
            bar.style.setProperty("--sy-mb-rubber", "");
            rubberX = 0;
            setTimeout(() => {
                if (rubberX === 0) {
                    bar.classList.remove("sy-mb-rubber-out");
                    bar.style.setProperty("--sy-mb-rubber", "");
                }
            }, 460);
        };

        const finish = () => {
            if (!panning) return;
            panning = false;
            armed = false;
            /* v0.8.25：滑完再续一段保护。横滑本身不落库，但手指在工具条上
               划过之后，思源那边可能因焦点 / 选区的微小变化响应一次
               activeBlur；这里多给 600ms 缓冲，把这段尾巴也盖住。 */
            keepKeyboardAlive(600);
            /* v0.8.55：边缘橡皮筋回弹 */
            if (rubberX !== 0) settleRubber();
            if (Math.abs(vx) < 0.12) return;          // 慢慢松手：不补惯性
            if (prefersReduced()) {
                /* 减少动态偏好：直接吸附到最近边界，不做惯性滑行 */
                bar.scrollLeft = clampLeft(bar.scrollLeft + (vx > 0 ? 2 : -2));
                return;
            }
            /* v0.8.55：惯性改为「基于时间」的指数衰减（与帧率无关，60/120Hz 手感一致），
               收尾用速度趋零自然停住（ease-out 收尾），不再硬切。 */
            let v = vx;                               // 单位 px/ms
            let last = 0;
            const DECAY = 0.0038;                     // 每毫秒衰减系数
            const step = (ts) => {
                if (!last) last = ts;
                let dt = ts - last; last = ts;
                if (dt > 48) dt = 48;                 // 标签页切回 dt 可能很大，限幅防跳变
                v *= Math.exp(-DECAY * dt);
                const next = clampLeft(bar.scrollLeft + v * dt);
                const hitEnd = (next <= 0 && v < 0) || (next >= maxScroll() && v > 0);
                bar.scrollLeft = next;
                if (hitEnd || Math.abs(v) < 0.002) { panRaf = 0; return; }
                panRaf = requestAnimationFrame(step);
            };
            panRaf = requestAnimationFrame(step);
        };
        bar.addEventListener("touchend", finish, { capture: true });
        bar.addEventListener("touchcancel", () => {
            panning = false;
            armed = false;
            stopInertia();
            keepKeyboardAlive(600);
            if (rubberX !== 0) settleRubber();
        }, { capture: true });
    }

    /* v0.8.21：整条工具条的触摸对本页面「不透明」（冒泡阶段截断）。
       为什么必须补这一层 ——
       ① 按钮自己的 handler 截断了 touchstart / touchend（sealEvent），但 **touchmove
          没有**：一次从按钮上起手、横着划走的滑动，touchmove 会一路冒泡到 document；
       ② 思源移动端的手势管线（mobile/util/touch.ts，按冒泡阶段挂在 document）正是靠
          模块级 clientX / clientY 和 touchmove 判定滑动方向的。而我们执行表格动作时
          要给官方键盘工具条派发合成触摸，handleTouchStart 会把这两个值留成 (12, 12)；
          此后任意一次冒泡到 document 的 touchmove 都会被算成一次「真实页面手势」——
          左滑 → 打开左侧文档树（touch.ts popSide），坐标对不上时还会去拖右侧面板；
       ③ 只要键盘开着，touch.ts 有「编辑中禁止滑动」的兜底（#keyboardToolbar 可见就
          直接 return）—— 而表格动作一旦把键盘收掉，这层兜底跟着失效，两个问题叠在
          一起就成了「一滑就弹出文档树」。
       所以在源头上把整条 bar 的触摸都拦在 document 之前：手势管线根本收不到事件，
       也就无从误判。必须用**冒泡阶段**（捕获阶段挂在 bar 上会先于按钮自己的
       handler 执行，把点按也掐掉）；touchend / touchcancel 一并拦，避免残留状态。
       —— 刻意与 bindBarPan() 分开：那里面的滑动监听必须**全部**捕获阶段，这里必须
       **冒泡阶段**，两者混在一个函数里会让「捕获阶段」的源码护栏失去判别力。 */
    /* v0.8.75：手指碰到工具条的那一刻就把键盘锁上。
       现场日志（BlockBar v0.8.74 / 数学键盘 v0.5.0）：

           +64305 pd out svg                       ← 点工具条按钮
           +64320 fo div[ce] rel=-                 ← 15ms 后编辑器失焦
           +64393 mb sheet open held=0 up=0 sy=0 mf=0   ← 到 openSheet 时键盘已经没了

       也就是说 `openSheet` 里那套「显示前先武装」根本来不及 —— 等它跑到，
       焦点早掉、IME 已被思源收走，held 只能是 0。所以武装必须**提前到按下瞬间**：
       手指一碰工具条就 focus 回编辑器（思源的 focus 补丁会 arm 500ms 的
       keyboardLockUntil），随后的 activeBlur 就被闸门挡回去。
       公式会话真在跑时（mathSessionLive）不插手，落库链不受影响。 */
    function armOnPress(tag) {
        if (mathSessionLive()) return;
        try { noteKbAtPress(); } catch (e) { /* ignore */ }
        if (!kbWasUp()) {
            try { kbDiag("bar press skip tag=" + tag + " up=0"); } catch (e) { /* ignore */ }
            return;
        }
        try { armKeyboardGuard(true); } catch (e) { /* ignore */ }
        try { keepKeyboardAlive(3000, false, true); } catch (e) { /* ignore */ }
        try {
            kbDiag("bar press arm tag=" + tag +
                " vp=" + Math.round(viewportH()) + "/" + Math.round(maxViewportH));
        } catch (e) { /* ignore */ }
    }

    function sealBarTouches() {
        if (!bar) return;
        /* pointerdown 是最早能拿到的时刻（早于 touchstart），**焦点转移就发生在
           它的默认行为里** —— 现场日志 `+64305 pd out svg` → `+64320 fo div[ce]`，
           中间只有 15ms。所以这里必须 preventDefault，否则焦点一定被带走。
           安全性：本插件所有按钮的动作都走 touchend / mouseup（见 bindButton 的
           touchend 分支），click 只是被 preventDefault 吃掉，没有任何逻辑依赖它。 */
        bar.addEventListener("pointerdown", (ev) => {
            /* 先存真实编辑器与 Range，再允许焦点守卫工作；顺序不能反过来。 */
            captureInsertionContext("bar-pointerdown");
            barTouching = true;
            if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
            if (ev.cancelable && ev.preventDefault) ev.preventDefault();
            sealEvent(ev);
            armOnPress("pd");
            InsertDiagnostics.trace("press.after-arm", {selection: InsertDiagnostics.selection()});
        }, { capture: true, passive: false });
        const sealOnly = (ev) => {
            /* 诊断：冒泡到 bar 时看一眼「默认行为到底有没有被阻止」——
               若这里 defaultPrevented=false，浏览器就会按普通触摸处理
               （挪焦点 / 清选区），键盘正是这么被收掉的。 */
            if (ev.type === "touchend" || ev.type === "touchcancel") {
                if (barTouchTimer) clearTimeout(barTouchTimer);
                /* 尾巴留 900ms：动作落库后的重渲染窗口也要护住 */
                barTouchTimer = setTimeout(() => { barTouching = false; barTouchTimer = 0; }, 900);
            }
            sealEvent(ev);
        };
        /* v0.8.22：touchstart 这一层还必须 preventDefault（所以不能是 passive）。
           手指落在**按钮之间的空档**上时，没有任何人阻止默认行为，浏览器就会把它
           当普通触摸处理：移走焦点 / 清掉选区 → 编辑器失焦 → 原生层收键盘。
           按钮自己（bindButton）本来就 preventDefault，这里补的是空档那部分——
           即「整条工具条，无论按在哪里，都不会惊动编辑器的焦点与软键盘」。 */
        const sealAndPrevent = (ev) => {
            captureInsertionContext("bar-touchstart");
            barTouching = true;                     // 焦点守卫：这期间不许 blur 编辑器
            if (barTouchTimer) { clearTimeout(barTouchTimer); barTouchTimer = 0; }
            if (ev.cancelable && ev.preventDefault) ev.preventDefault();
            sealEvent(ev);
            armOnPress("ts");                       // v0.8.75：按下即武装（见 armOnPress）
            InsertDiagnostics.trace("press.after-arm", {selection: InsertDiagnostics.selection()});
        };
        bar.addEventListener("touchstart", sealAndPrevent, { passive: false });
        ["touchmove", "touchend", "touchcancel"].forEach((t) => {
            bar.addEventListener(t, sealOnly, { passive: true });
        });
    }

    /* 鼠标（桌面浏览器调试 / browser-mobile）：按住横向拖拽同样能滑动
       同样必须用捕获阶段：按钮的 mousedown / mouseup 里有 stopPropagation，
       冒泡阶段的话 bar 收不到 mousedown，dragging 永远起不来。 */
    function bindBarPanMouse() {
        if (!bar) return;
        let dragging = false, baseLeft = 0, sx = 0;
        bar.addEventListener("mousedown", (ev) => {
            barPanMoved = false;
            if (ev.button !== 0) return;
            if (bar.scrollWidth <= bar.clientWidth + 2) return;
            dragging = true;
            sx = ev.clientX;
            baseLeft = bar.scrollLeft;
        }, { capture: true });
        bar.addEventListener("mousemove", (ev) => {
            if (!dragging) return;
            const dx = ev.clientX - sx;
            if (!barPanMoved && Math.abs(dx) < 10) return;
            barPanMoved = true;
            bar.scrollLeft = Math.max(0, Math.min(bar.scrollWidth - bar.clientWidth, baseLeft - dx));
        }, { capture: true });
        const up = () => { dragging = false; };
        bar.addEventListener("mouseup", up, { capture: true });
        bar.addEventListener("mouseleave", up, { capture: true });
    }

    /* 通用：把「工具条自己的 UI 收到的一次触摸」就地截断，不再冒泡到 document。
       原因见 bindButton 顶部的长注释 —— 工具条挂在 document.body 下，不在官方
       .keyboard 容器里，思源移动端的 document 级触摸管线会把我们的点按误判成
       页面手势（设 touchRange / 关面板 / 长按进多选），进而打扰编辑焦点与软键盘。 */
    function sealEvent(ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
    }

    function bindButton(el, onTap, onLongPress) {
        let lpTimer = null;
        let moved = false;
        let fired = false;
        let sx = 0, sy = 0;

        /* 说明见 sealEvent 与 holdKeyboard 的注释：
           touchstart / touchend 必须成对拦，只拦一边会让思源那边的
           clientX/clientY 停留在上一次触摸的旧值，反而误判成长按。 */
        const seal = sealEvent;

        el.addEventListener("touchstart", (ev) => {
            touchMode = true;
            // 关键：阻止默认行为 + 截断冒泡 —— 既避免把焦点从 contenteditable
            // 抢走导致软键盘收起，也避免被思源当成页面手势
            ev.preventDefault();
            seal(ev);
            /* v0.8.73：在 preventDefault 之后、任何动作执行之前记下键盘状态。
               之后打开面板时用它判断「本来就有键盘才守」，避免晚了半拍看到
               activeElement=body 而整段跳过守护。 */
            noteKbAtPress();
            moved = false;
            fired = false;
            const t = ev.touches[0];
            sx = t.clientX;
            sy = t.clientY;
            pressIn(el);
            if (onLongPress) {
                lpTimer = setTimeout(() => {
                    fired = true;
                    pressOut(el);
                    if (navigator.vibrate) { try { navigator.vibrate(10); } catch (e) {} }
                    onLongPress(ev);
                }, CONFIG.longPressMs);
            }
        }, { passive: false });

        el.addEventListener("touchmove", (ev) => {
            const t = ev.touches[0];
            if (Math.abs(t.clientX - sx) > 10 || Math.abs(t.clientY - sy) > 10) {
                moved = true;
                clearTimeout(lpTimer);
                pressOut(el);
            }
        }, { passive: true });

        el.addEventListener("touchend", (ev) => {
            ev.preventDefault();
            seal(ev);
            clearTimeout(lpTimer);
            pressOut(el);
            /* v0.8.24：刚才是横向滑动工具条 → 不当成点按（与 mouseup 同一口径）。
               光靠 moved（位移 >10px）不够：慢慢挪、小幅横滑时位移到不了阈值，
               抬手就被当成一次点按，动作直接被执行掉了 —— 表格动作一执行就会
               落库、触发整块重渲染，键盘与工具条随即「关一下又开」。 */
            if (barPanMoved) {
                barPanMoved = false;
                return;
            }
            if (!fired && !moved) {
                onTap(ev);
            }
        }, { passive: false });

        el.addEventListener("touchcancel", (ev) => {
            seal(ev);
            clearTimeout(lpTimer);
            pressOut(el);
        });

        el.addEventListener("mousedown", (ev) => {
            if (touchMode) return;
            ev.preventDefault();
            seal(ev);
            noteKbAtPress();       // v0.8.73：同上，桌面调试路径也要记
            pressIn(el);
        });

        el.addEventListener("mouseup", (ev) => {
            if (touchMode) return;
            ev.preventDefault();
            seal(ev);
            pressOut(el);
            /* 刚才是横向拖拽滑动工具条：不要再当成一次点按 */
            if (barPanMoved) { barPanMoved = false; return; }
            onTap(ev);
        });

        el.addEventListener("click", (ev) => { ev.preventDefault(); seal(ev); });
        el.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            seal(ev);
            if (onLongPress) onLongPress(ev);
        });
    }

    /* ============================================== 事件监听 ============== */
    function bindEvents() {
        /* v0.8.82：window 捕获一定早于思源 tableCellRichEditor 的 document 捕获，
           必须在它之前把本次按压标记为「仍属于单元格编辑器」，否则 lite 实例
           会在我们的 bar pointerdown 到达前就被 finish() 销毁。 */
        window.addEventListener("pointerdown", markNativeCellOwner,
            { capture: true, passive: true });
        /* 与原生 bindMobileToolbar 相同：focusin / pointerdown 激活当前编辑器。
           activeProtyle 会跨 TABLE 焦点与 TH 假选区保留，供块插入使用。 */
        document.addEventListener("focusin", (ev) => {
            activateProtyleFromTarget(ev.target, "focusin");
            rememberActiveRange();
        }, true);
        /* v0.8.94：焦点在「编辑器外输入控件 ↔ 文档编辑器」之间切换时立刻
           同步可见性，不等下一次 applyMeasure（最长可能到 900ms 巡检）。
           锚点等待中交给 revealWithNativeAnchor 决定，不抢跑、不绕过 v0.8.92。 */
        const syncEditorVisibility = () => {
            if (destroyed || pendingShow) return;
            try { updateVisibility(); } catch (e) { /* ignore */ }
        };
        document.addEventListener("focusin", syncEditorVisibility, true);
        document.addEventListener("focusout", syncEditorVisibility, true);
        document.addEventListener("pointerdown", (ev) => {
            activateProtyleFromTarget(ev.target, "pointerdown");
            rememberActiveRange();
        }, true);
        // 记录最近一次编辑位置（焦点被工具条抢走后依然可用）
        // 打字时 selectionchange 几乎每个按键都触发；用 rAF 合并到每帧最多一次
        let selPending = false;
        document.addEventListener("selectionchange", () => {
            rememberActiveRange();
            if (selPending) return;
            selPending = true;
            requestAnimationFrame(() => {
                selPending = false;
                const id = blockIdFromSelection();
                if (id) {
                    lastBlockId = id;
                    lastBlockIdAt = Date.now();
                }
            });
        }, true);

        document.addEventListener("focusin", (ev) => {
            const id = blockIdOf(ev.target);
            if (id) {
                lastBlockId = id;
                lastBlockIdAt = Date.now();
            }
        }, true);

        document.addEventListener("pointerdown", (ev) => {
            if (ev.target && ev.target.closest && ev.target.closest(".protyle-wysiwyg")) {
                const id = blockIdOf(ev.target);
                if (id) {
                    lastBlockId = id;
                    lastBlockIdAt = Date.now();
                }
            }
        }, true);

        // 键盘 / 视口变化
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", () => {
                scanDirty = true;                 // 视口变了，扫描缓存需要刷新
                scheduleMeasure([0, 120, 320]);
            });
            window.visualViewport.addEventListener("scroll", () => scheduleMeasure([0]));
        }
        window.addEventListener("resize", () => {
            scanDirty = true;
            scheduleMeasure([0, 120, 320]);
        });
        window.addEventListener("orientationchange", () => {
            maxViewportH = 0;   // 旋转后重建视口基准
            scanDirty = true;
            scanForce = true;   // 坐标系全变，强制立即重扫
            scheduleMeasure([0, 300, 700]);
        });

        // 官方键盘工具条显示 / 隐藏时会派发该事件（keyboardToolbar.ts:878/890/992）
        window.addEventListener("siyuan-mobile-keyboard-change", (ev) => {
            const on = !!(ev && (ev as any).detail);
            setKb(on);
            /* v0.8.36：键盘（连工具条）被收 = 用户/系统主动收键盘的信号，
               focusout 守卫据此让路（kb-hiding-skip），键盘才关得掉 */
            if (!on) kbHidingAt = Date.now();
            /* v0.8.25：保护窗口内键盘被收起 → 立刻叫回来（表格动作落库后的
               重渲染窗口最容易被别人顺手收一次键盘） */
            if (!on) rescueKeyboardIfProtected();
        });

        // Android SDK 32+：键盘收起前会派发该事件（见 Utils.hideKeyboardAndToolbar）
        window.addEventListener("siyuan-mobile-keyboard-hiding", () => {
            setKb(false, true);   // v0.8.88：明确收起，不走 200ms 确认窗口
            kbHidingAt = Date.now();   // v0.8.36：主动收键盘信号，守卫让路
            /* v0.8.90：置 1200ms 强让路闩锁并撤销续锁。安卓在真正收键盘前
               派发本事件，随后才调 hideKeyboardToolbar(true)；blip 不派发，
               所以不会误伤表格命令 / 横滑的键盘保护。 */
            userHideUntil = Date.now() + 1200;
            cancelKeyboardAlive();
            rescueKeyboardIfProtected();
            scheduleMeasure([0, 120, 400]);
        });

        // 原生层手指抬起通知（见 MainActivity#initUIElements）
        window.addEventListener("nativePhysicalTouchUp", () => scheduleMeasure([0]));

        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                syncMode();
                scanDirty = true;
                scheduleMeasure([0, 200]);
            }
        });

        // 页面结构变化 → 标记底栏缓存失效 + 节流重测。
        // 可见性由 applyMeasure 内的 updateVisibility 同步（≤160ms 内），
        // 不再在每个变更批次里同步读几何，避免打字期间反复强制排版
        mo = new MutationObserver((records) => {
            InsertDiagnostics.perf.bump("moBatches");
            InsertDiagnostics.perf.bump("moRecords", records ? records.length : 0);
            scanDirty = true;
            // 键盘已收起且无需让位：隐藏态不随 DOM 变化，直接返回。
            // ——但官方块功能面板（native .b3-menu）开合是例外：必须重测，
            //   以隐藏工具条（避免遮挡面板）或面板关闭后恢复工具条。
            //   用 lastNativeMenuOpen 缓存，菜单态无变化时仍走快速返回。
            if (kbSignal === false && !CONFIG.contentPadding) {
                const nmo = nativeMenuOpen();
                if (nmo === lastNativeMenuOpen) return;
                lastNativeMenuOpen = nmo;
            }
            scheduleMeasure([0, 160]);
        });
        mo.observe(document.body, { childList: true, subtree: true, attributes: false });

        // 主题 / 日夜间切换：思源没有统一事件，用低频实测兜底（开销可忽略）
        intervals.push(setInterval(() => { if (!document.hidden) syncMode(); }, 900));
        // 兜底巡检：捕获 MutationObserver 监听不到的属性类变化（如 class 改位）
        intervals.push(setInterval(() => {
            if (document.visibilityState === "visible") {
                scanDirty = true;
                applyMeasure();
            }
        }, 1500));
    }

    /* ============================================== 卸载 ================== */
    /* 插件禁用 / 更新时调用：移除 DOM、清掉定时器与轮询、还原被包装的原生函数。
       （document / window 上的监听器在 bar 为空时都会直接 return，无副作用。） */
    function destroy() {
        if (destroyed) return;
        destroyed = true;

        measureTimers.forEach(clearTimeout);
        measureTimers = [];
        pendingMeasure.clear();
        if (deepScanTimer) { clearTimeout(deepScanTimer); deepScanTimer = 0; }
        if (kbHideTimer) { clearTimeout(kbHideTimer); kbHideTimer = 0; }
        if (showAnchorTimer) { clearTimeout(showAnchorTimer); showAnchorTimer = 0; }
        pendingShow = false;
        userHideUntil = 0;
        kbOpenedAt = 0;
        intervals.forEach(clearInterval);
        intervals.length = 0;

        Object.keys(origToolbarFns).forEach((name) => {
            window[name] = origToolbarFns[name];
            delete origToolbarFns[name];
        });

        if (mo) { mo.disconnect(); mo = null; }
        if (panRaf) { cancelAnimationFrame(panRaf); panRaf = 0; }
        barPanMoved = false;
        releaseNativeCellOwner();

        ["syMobileToolbar", "syMobileToolbarSheet", "syMobileToolbarPicker"].forEach((id) => {
            const el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        bar = null;
        sheet = null;
        pickerEl = null;
        sheetCloser = null;
        wysCache = null;
        scanHitS = null;
        scanHitD = null;
        lastOffsetVal = "";
        lastSafeVal = "";
        lastStackVal = "";
        lastZVal = "";
        lastPanelZVal = "";
        activeProtyle = null;
        pressInsertionContext = null;
        mathHandoffUntil = 0;
        protyleByWys.clear();

        if (document.body) {
            document.body.classList.remove("sy-mb-enabled");
            document.body.classList.remove("sy-mb-pad");
        }
        document.documentElement.style.removeProperty("--sy-mb-stack");
        try { delete window.syMobileToolbar; } catch (e) { /* ignore */ }
    }

    /* ============================================== 启动 ================== */
    function boot() {
        if (destroyed) return;
        if (bar) return;                  // 幂等：插件重复调用不会建第二根工具条
        if (!document.body) {
            setTimeout(boot, 120);
            return;
        }
        if (!isMobileEnv()) return;
        // 仅在主页面（/stage/build/…）注入，避开启动页与鉴权页
        if (!CONFIG.forceEnable && !/\/stage\/build\//.test(location.href)) {
            setTimeout(boot, 600);
            return;
        }

        buildBar();
        syncMode();
        rebuildIconsWithRetry();
        hookNativeToolbarWithRetry(12);
        bindEvents();
        scheduleMeasure([0, 200, 600]);

        window.syMobileToolbar = {
            config: CONFIG,
            icons: SY_ICON,
            hasSymbol: (id) => {
                clearSymbolCache();
                return hasSymbol(id);
            },
            state: () => ({
                keyboard: kbSignal,
                viewport: viewportH(),
                maxViewport: maxViewportH
            }),
            refresh: () => { scanDirty = true; scanForce = true; scheduleMeasure([0]); },
            rebuildIcons: () => rebuildIconsWithRetry(),
            hide: () => { forceHidden = true; updateVisibility(); },
            show: () => { forceHidden = false; updateVisibility() },
            // 自定义按钮（v0.3）：面板预设 / 内置动作选项 / 上限设置，便于控制台调试
            actions: Object.assign({ heading: actionHeading, callout: actionCallout }, ACTIONS),
            actionNames: ACTION_NAMES,
            /* 思源内置插入块 / 资产的图标清单（设置页图标选择器用） */
            blockIcons: () => BLOCK_ICONS.map((b) => ({ id: b.id, label: b.label })),
            /* 动作库用到的全部图标（含样式色块与自绘图标），图标选择器第一组用 */
            actionIcons: actionIcons,
            /* 把任意图标字符串渲染成与工具条一致的 html（调试 / 自检用） */
            iconHtml: (spec) => buttonIconOf(spec).html,
            itemLabel: itemLabel,
            /* 顶层按钮的提示文案（tip → 动作规范名 → 自定义名），设置页预览的 title 用 */
            buttonTitle: buttonTitle,
            legacyKidNames: LEGACY_KID_NAMES,
            panelPresets: () => JSON.parse(JSON.stringify(PANEL_PRESETS)),
            panelPresetNames: PANEL_PRESET_NAMES,
            builtinOptions: builtinOptions,
            /* 「设置」类别：思源设置菜单项（value / label / icon）+ 名称 / 图标表，供设置页下拉与网格 */
            settingOptions: settingOptions,
            settingGroups: settingGroups,
            settingLabels: settingLabels,
            settingIcons: settingIcons,
            setMaxIcons: setMaxIcons,
            /* v0.8.78：登记表 —— 插件入口 patch Protyle.prototype.init 后逐个交进来。
               单元格就地编辑（lite Protyle）不在 getAllEditor() 里，只能自己记。 */
            registerProtyle: registerProtyle,
            /* v0.8.77：注入思源 getAllEditor()，作为登记表之外的兜底通道 */
            setEditorsProvider: setEditorsProvider,
            /* v0.8.16：工具栏末尾「设置入口」齿轮的开关（热生效，可反复调用） */
            setSettingsEntry: setSettingsEntry,
            setButtons: setButtons,
            getButtons: () => (Array.isArray(CONFIG.buttons) ? CONFIG.buttons : DEFAULT_BUTTONS),
            refreshButtons: rebuildButtons,
            defaultButtons: () => DEFAULT_BUTTONS.map((b) => JSON.parse(JSON.stringify(b))),
            /* 旧版配置 → 新版默认的平滑迁移（见 LEGACY_DEFAULT_SIG 注释） */
            migrateButtons: migrateButtons
        };
    }

    return {
        boot: boot,
        destroy: destroy,
        config: CONFIG,
        icons: SY_ICON,
        // 给设置面板预览用：把用户填的图标字符串渲染成与工具条一致的 html
        iconHtml: (spec) => buttonIconOf(spec).html,
        /* 设置面板预览用：面板条目显示名，与实际弹出面板完全同一套规则 */
        itemLabel: itemLabel,
        /* 设置面板预览用：顶层按钮提示文案（tip → 动作规范名 → 自定义名） */
        buttonTitle: buttonTitle,
        /* 旧版默认写死的占位短名（H1..H6 / 思维导图）：设置页 officialKid 判定用 */
        legacyKidNames: LEGACY_KID_NAMES,
        /* 思源内置插入块 / 资产的图标清单（设置页图标选择器用）：
           { id, label }[]，已按思源斜杠面板顺序排列 */
        blockIcons: () => BLOCK_ICONS.map((b) => ({ id: b.id, label: b.label })),
        /* 动作库用到的全部图标（含样式色块与自绘图标），设置页图标选择器第一组用 */
        actionIcons: actionIcons,
        actions: ACTIONS,
        actionNames: ACTION_NAMES,
        insertDiagnostics: InsertDiagnostics,
        panelPresets: () => JSON.parse(JSON.stringify(PANEL_PRESETS)),
        panelPresetNames: PANEL_PRESET_NAMES,
        builtinOptions: builtinOptions,
        /* 「设置」类别：思源设置菜单项（value / label / icon）+ 名称 / 图标表，供设置页下拉与网格 */
        settingOptions: settingOptions,
        settingGroups: settingGroups,
        settingLabels: settingLabels,
        settingIcons: settingIcons,
        setMaxIcons: setMaxIcons,
        /* v0.8.78：登记表 —— 插件入口 patch Protyle.prototype.init 后逐个交进来。
           单元格就地编辑（lite Protyle）不在 getAllEditor() 里，只能自己记。 */
        registerProtyle: registerProtyle,
        /* v0.8.77：注入思源 getAllEditor()，作为登记表之外的兜底通道 */
        setEditorsProvider: setEditorsProvider,
        /* v0.8.16：工具栏末尾「设置入口」齿轮的开关（热生效，可反复调用） */
        setSettingsEntry: setSettingsEntry,
        defaultButtons: () => DEFAULT_BUTTONS.map((b) => JSON.parse(JSON.stringify(b))),
        /* 旧版配置 → 新版默认的平滑迁移：{ buttons, migrated } */
        migrateButtons: migrateButtons,
        setButtons: setButtons,
        getButtons: () => (Array.isArray(CONFIG.buttons) ? CONFIG.buttons : DEFAULT_BUTTONS),
        refreshButtons: rebuildButtons,
        state: () => ({
            installed: !!bar,
            destroyed: destroyed,
            keyboard: kbSignal
        })
    };
})();

export default MobileToolbar;
