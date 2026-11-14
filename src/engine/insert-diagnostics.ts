/*
 * 块插入诊断：开关、采样、日志格式化、复制 / 清空与设置界面全部集中在这一处。
 * 只记录 DOM 结构、块 ID / 类型和调用结果，不记录文档正文或用户输入内容。
 */

const MAX_ENTRIES = 320;
const MAX_TIMERS = 18;
let enabled = false;
/* v0.8.101：插件版本，由入口在 onload 时注入（构建期 __PLUGIN_VERSION__），
   只用于日志头部 —— 排查时先确认「日志出自哪一版」再谈原因。 */
let pluginVersion = "";

function setVersion(v) {
    pluginVersion = typeof v === "string" ? v : "";
}
let sequence = 0;
let entries = [];
let timers = new Set<any>();
const listeners = new Set<() => void>();

/* v0.8.86：性能采样独立于「块插入诊断」，默认关闭。
   一次「键盘打开 → 工具条真正显示」为一个会话，只输出 begin / end 两条记录，
   把中间的高频事件（测量重排、全树扫描、DOM 变更）累计成计数，
   避免高频日志冲垮 320 条环形缓冲。关闭时所有 perf.* 入口立即返回，
   不调用 performance.now()、不写日志，运行时零开销。 */
let perfEnabled = false;
let perfSession: any = null;
let perfTimer: any = null;
const PERF_WINDOW_MS = 2000;

function perfNow() {
    return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now() : Date.now();
}

function clip(value, max) {
    const text = String(value == null ? "" : value);
    return text.length > max ? text.slice(0, max) + "…" : text;
}

function errorInfo(error) {
    if (!error) return null;
    return {
        name: clip(error.name || "Error", 60),
        message: clip(error.message || error, 300),
        stack: clip(error.stack || "", 1200)
    };
}

function nodeInfo(node) {
    if (!node) return null;
    try {
        if (node.nodeType === 3) {
            return {kind: "text", parent: nodeInfo(node.parentElement)};
        }
        if (node.nodeType !== 1) return {kind: "node", nodeType: node.nodeType};
        const cell = node.closest && node.closest(".table__cell-editor");
        const table = node.closest && node.closest('[data-type="NodeTable"][data-node-id]');
        return {
            tag: node.tagName,
            id: clip(node.id || "", 80),
            className: clip(node.getAttribute && node.getAttribute("class") || "", 180),
            blockId: clip(node.getAttribute && node.getAttribute("data-node-id") || "", 60),
            blockType: clip(node.getAttribute && node.getAttribute("data-type") || "", 60),
            connected: node.isConnected !== false,
            inCell: !!cell,
            tableId: table ? table.getAttribute("data-node-id") : null
        };
    } catch (error) {
        return {kind: "unreadable", error: errorInfo(error)};
    }
}

function rangeInfo(range) {
    if (!range) return null;
    try {
        return {
            collapsed: !!range.collapsed,
            start: nodeInfo(range.startContainer),
            startOffset: range.startOffset,
            connected: !!(range.startContainer && range.startContainer.isConnected)
        };
    } catch (error) {
        return {error: errorInfo(error)};
    }
}

function protyleInfo(protyle) {
    if (!protyle) return null;
    try {
        return {
            lite: protyle.lite === true,
            rootId: protyle.block && protyle.block.rootID || null,
            element: nodeInfo(protyle.element),
            wysiwyg: nodeInfo(protyle.wysiwyg && protyle.wysiwyg.element),
            hasToolbar: !!protyle.toolbar,
            hasHintFill: !!(protyle.hint && typeof protyle.hint.fill === "function"),
            range: rangeInfo(protyle.toolbar && protyle.toolbar.range)
        };
    } catch (error) {
        return {error: errorInfo(error)};
    }
}

function selectionInfo() {
    try {
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return {rangeCount: 0};
        return {
            rangeCount: selection.rangeCount,
            activeElement: nodeInfo(document.activeElement),
            range: rangeInfo(selection.getRangeAt(0))
        };
    } catch (error) {
        return {error: errorInfo(error)};
    }
}

function valueInfo(value) {
    const text = String(value == null ? "" : value);
    let kind = "slash";
    if (text === "$$") kind = "mathBlock";
    else if (text.indexOf("```") === 0) kind = "codeBlock";
    else if (/^#{1,6} /.test(text)) kind = "heading";
    else if (/^[-*+] \[ \] /.test(text)) kind = "task";
    else if (/^[-*+] /.test(text)) kind = "list";
    else if (/^\d+[.)] /.test(text)) kind = "orderedList";
    else if (/^>/.test(text)) kind = "quote";
    else if (text.indexOf("|") === 0) kind = "table";
    else if (text.indexOf("<") === 0) kind = "html";
    else if (text.length > 160) kind = "longContent";
    return {kind: kind, length: text.length};
}

function blockLocation(element) {
    const cell = element.closest(".table__cell-editor");
    const table = element.closest('[data-type="NodeTable"][data-node-id]');
    let location = "document";
    if (cell) location = "table-cell";
    else if (table) location = "inside-table-non-cell";
    else if (table === null && element.parentElement) {
        const previous = element.previousElementSibling;
        if (previous && previous.matches('[data-type="NodeTable"]')) location = "after-table";
    }
    return {
        location: location,
        blockId: element.getAttribute("data-node-id"),
        blockType: element.getAttribute("data-type"),
        tableId: table ? table.getAttribute("data-node-id") : null,
        parent: nodeInfo(element.parentElement)
    };
}

function recentBlocks() {
    try {
        const selector = '[data-node-id][data-type="NodeMathBlock"],' +
            '[data-node-id][data-type="NodeCodeBlock"],' +
            '[data-node-id][data-type="NodeHeading"],' +
            '[data-node-id][data-type="NodeList"],' +
            '[data-node-id][data-type="NodeBlockquote"],' +
            '[data-node-id][data-type="NodeTable"]';
        return Array.from(document.querySelectorAll(selector)).slice(-10).map(blockLocation);
    } catch (error) {
        return [{error: errorInfo(error)}];
    }
}

function notify() {
    listeners.forEach((listener) => {
        try { listener(); } catch (error) { /* 设置界面刷新不影响诊断本身 */ }
    });
}

/* force=true 供性能采样使用：主诊断关闭时也能写日志。
   块插入链路的 trace / watchDom 仍走 force=false，不会被性能采样带出来。 */
function write(stage, detail, force?) {
    if (!enabled && !force) return;
    try {
        sequence += 1;
        entries.push({
            sequence: sequence,
            time: new Date().toISOString(),
            stage: clip(stage, 80),
            detail: detail === undefined ? null : detail
        });
        if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
        notify();
    } catch (error) { /* 诊断永不干扰正常编辑 */ }
}

function setEnabled(on) {
    const next = !!on;
    if (next === enabled) {
        notify();
        return;
    }
    if (!next) write("diagnostics.disabled", {entryCount: entries.length});
    enabled = next;
    if (!enabled) {
        timers.forEach((timer) => clearTimeout(timer));
        timers.clear();
    }
    write("diagnostics.enabled", {userAgent: clip(window.navigator.userAgent, 500)});
    notify();
}

/* ── v0.8.86 性能采样：一次键盘弹出 = 一个会话 ─────────────────────────
   调用点只分布在 mobile-toolbar.ts 的 6 处（begin / bump / timed / scan / end），
   会话状态、计时、聚合、日志格式与开关 UI 全部留在本模块。 */
function perfActive() { return perfEnabled && !!perfSession; }

function perfWrite(stage, detail) { write(stage, detail, true); }

/* v0.8.91：不受 perf 会话窗口限制的单条事件。
   offset 校准发生在 perf.show.end 之后，用 bump/setMax 记不进会话，
   但排查「工具条被顶到图片上方」必须拿到这段数据。 */
function perfNote(stage, detail) {
    if (!perfEnabled) return;
    write(stage, detail, true);
}

function perfClearTimer() {
    if (perfTimer) { clearTimeout(perfTimer); perfTimer = null; }
}

function perfBump(key, delta?) {
    if (!perfActive()) return;
    const step = delta == null ? 1 : delta;
    perfSession.values[key] = Math.round(((perfSession.values[key] || 0) + step) * 10) / 10;
}

function perfSetMax(key, value) {
    if (!perfActive()) return;
    perfSession.values[key] = Math.max(perfSession.values[key] || 0, value);
}

function perfBegin(source) {
    if (!perfEnabled) return;
    /* 同一次键盘弹出里 setKb / 视口事件可能重复触发；2s 内只保留第一个会话，
       否则日志会被切成碎片，看不出完整的首帧链路。 */
    if (perfActive()) return;
    perfClearTimer();
    perfSession = {source: source, t0: perfNow(), values: {}};
    perfWrite("perf.show.begin", {source: source});
    perfTimer = setTimeout(() => perfEnd("timeout"), PERF_WINDOW_MS);
}

function perfEnd(reason) {
    if (!perfActive()) return;
    const session = perfSession;
    const delayMs = Math.round((perfNow() - session.t0) * 10) / 10;
    perfSession = null;
    perfClearTimer();
    perfWrite("perf.show.end", Object.assign({
        source: session.source,
        reason: reason,
        delayMs: delayMs
    }, session.values));
    notify();
}

/* 高频事件只累计，不逐条写日志。名前缀用于区分测量阶段。 */
function perfTimed(name, fn) {
    if (!perfActive()) return fn();
    const t0 = perfNow();
    try {
        return fn();
    } finally {
        const ms = Math.round((perfNow() - t0) * 10) / 10;
        perfBump(name + "Ms", ms);
        perfBump(name + "Count", 1);
    }
}

/* 记录参与扫描的节点规模 —— 图片文档节点暴涨是首帧变慢的关键证据 */
function perfScan(deep, nodes) {
    if (!perfActive()) return;
    if (deep) perfSession.values.scanDeep = true;
    perfSetMax("scanNodes", nodes);
}

function setPerfEnabled(on) {
    const next = !!on;
    if (next === perfEnabled) { notify(); return; }
    perfEnabled = next;
    if (!perfEnabled) {
        perfSession = null;
        perfClearTimer();
    } else {
        perfWrite("perf.enabled", {windowMs: PERF_WINDOW_MS});
    }
    notify();
}

function getText() {
    const header = [
        "# BlockBar 块插入诊断",
        "# 导出时间: " + new Date().toISOString(),
        "# 插件版本: " + (pluginVersion || "unknown"),
        "# 诊断开关: " + (enabled ? "on" : "off"),
        "# 性能采样: " + (perfEnabled ? "on" : "off"),
        "# 日志条数: " + entries.length,
        "# User-Agent: " + clip(window.navigator.userAgent, 500),
        "# 隐私: 仅含结构、块 ID / 类型与调用结果，不含文档正文",
        ""
    ];
    const lines = entries.map((entry) => {
        const seq = String(entry.sequence).padStart(4, "0");
        let detail = "";
        try { detail = JSON.stringify(entry.detail); } catch (error) { detail = "{\"serialization\":\"failed\"}"; }
        return seq + " " + entry.time + " " + entry.stage + (detail ? " " + detail : "");
    });
    return header.concat(lines).join("\n");
}

async function copyText(text) {
    try {
        if (window.navigator.clipboard && window.navigator.clipboard.writeText) {
            await window.navigator.clipboard.writeText(text);
            return true;
        }
    } catch (error) { /* 继续走兼容路径 */ }
    try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "readonly");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.focus();
        area.select();
        area.setSelectionRange(0, area.value.length);
        const ok = document.execCommand("copy");
        area.remove();
        return !!ok;
    } catch (error) {
        return false;
    }
}

function watchDom(protyle, value) {
    if (!enabled) return;
    [0, 120, 500, 1200].forEach((delay) => {
        if (timers.size >= MAX_TIMERS) return;
        const timer = setTimeout(() => {
            timers.delete(timer);
            write("fill.dom+" + delay + "ms", {
                value: valueInfo(value),
                target: protyleInfo(protyle),
                selection: selectionInfo(),
                recentBlocks: recentBlocks()
            });
        }, delay);
        timers.add(timer);
    });
}

function createElement(tag, className?, text?) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createUI(options?) {
    const opts = options || {};
    const root = createElement("section", "sy-mb-diag");
    const row = createElement("div", "sy-mb-set__entry");
    const label = createElement("div", "sy-mb-set__entry-label");
    label.appendChild(createElement("div", "sy-mb-set__entry-name", "块插入诊断"));
    label.appendChild(createElement("div", "sy-mb-set__entry-tip",
        "记录编辑器选择、fill 调用与插入后落点；不记录文档正文。开关立即生效，保存配置后记住状态。"));
    row.appendChild(label);
    const toggle = createElement("input", "b3-switch sy-mb-set__switch");
    toggle.type = "checkbox";
    toggle.checked = enabled;
    toggle.setAttribute("aria-label", "块插入诊断");
    row.appendChild(toggle);
    root.appendChild(row);

    /* 性能采样开关：默认关闭。开启后只记录「键盘打开 → 工具条出现」的
       耗时与累计计数，一次激活两条日志，不采集文档正文。 */
    const perfRow = createElement("div", "sy-mb-set__entry");
    const perfLabel = createElement("div", "sy-mb-set__entry-label");
    perfLabel.appendChild(createElement("div", "sy-mb-set__entry-name", "首帧性能采样"));
    perfLabel.appendChild(createElement("div", "sy-mb-set__entry-tip",
        "记录工具条出现的延迟、测量重排次数与全树扫描节点数；用于定位激活卡顿。默认关闭，关闭时零开销；开关立即生效，保存配置后记住状态。"));
    perfRow.appendChild(perfLabel);
    const perfToggle = createElement("input", "b3-switch sy-mb-set__switch");
    perfToggle.type = "checkbox";
    perfToggle.checked = perfEnabled;
    perfToggle.setAttribute("aria-label", "首帧性能采样");
    perfRow.appendChild(perfToggle);
    root.appendChild(perfRow);

    const actions = createElement("div", "sy-mb-diag__actions");
    const copyButton = createElement("button", "b3-button", "复制完整日志");
    const clearButton = createElement("button", "b3-button b3-button--cancel", "清空日志");
    copyButton.type = "button";
    clearButton.type = "button";
    actions.appendChild(copyButton);
    actions.appendChild(clearButton);
    root.appendChild(actions);

    const status = createElement("div", "sy-mb-diag__status");
    root.appendChild(status);
    const log = createElement("textarea", "sy-mb-diag__log");
    log.readOnly = true;
    log.spellcheck = false;
    log.setAttribute("aria-label", "完整块插入诊断日志");
    root.appendChild(log);

    const refresh = () => {
        toggle.checked = enabled;
        perfToggle.checked = perfEnabled;
        log.value = getText();
        status.textContent = (enabled || perfEnabled)
            ? "采集中 · " + entries.length + " 条（最多保留 " + MAX_ENTRIES + " 条）"
            : "已关闭 · 保留 " + entries.length + " 条日志";
    };
    listeners.add(refresh);
    toggle.addEventListener("change", () => {
        setEnabled(toggle.checked);
        if (typeof opts.onEnabledChange === "function") opts.onEnabledChange(enabled);
        refresh();
    });
    perfToggle.addEventListener("change", () => {
        setPerfEnabled(perfToggle.checked);
        if (typeof opts.onPerfEnabledChange === "function") opts.onPerfEnabledChange(perfEnabled);
        refresh();
    });
    copyButton.addEventListener("click", async () => {
        const ok = await copyText(getText());
        status.textContent = ok ? "完整日志已复制，可直接粘贴发送" : "复制失败，请全选下方日志手动复制";
        if (!ok) { log.focus(); log.select(); }
    });
    clearButton.addEventListener("click", () => {
        entries = [];
        sequence = 0;
        timers.forEach((timer) => clearTimeout(timer));
        timers.clear();
        /* 清掉未结束的性能会话，下一次键盘弹出会重新开一个完整窗口 */
        perfSession = null;
        perfClearTimer();
        refresh();
        status.textContent = "日志已清空，可以开始新一轮测试";
    });
    refresh();
    return {
        element: root,
        refresh: refresh,
        destroy: () => listeners.delete(refresh)
    };
}

export const InsertDiagnostics = {
    isEnabled: () => enabled,
    setVersion: setVersion,
    setEnabled: setEnabled,
    trace: write,
    error: (stage, error, detail?) => write(stage, Object.assign({error: errorInfo(error)}, detail || {})),
    protyle: protyleInfo,
    selection: selectionInfo,
    node: nodeInfo,
    value: valueInfo,
    watchDom: watchDom,
    getText: getText,
    clear: () => {
        entries = [];
        sequence = 0;
        perfSession = null;
        perfClearTimer();
        notify();
    },
    createUI: createUI,
    perf: {
        isEnabled: () => perfEnabled,
        setEnabled: setPerfEnabled,
        begin: perfBegin,
        bump: perfBump,
        timed: perfTimed,
        scan: perfScan,
        note: perfNote,
        end: perfEnd
    }
};
