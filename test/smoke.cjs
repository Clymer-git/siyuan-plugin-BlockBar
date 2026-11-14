/**
 * 引擎冒烟测试：不依赖思源内核，只验证「结构整理后行为没变」的最小集合。
 *   · 工具条能建出来，默认 9 个按钮、每行 9 个
 *   · 图标来自适配层（思源 symbol 表 + 旧自绘兜底）
 *   · 设置齿轮开关生效
 *   · destroy 能清理干净
 */
const {JSDOM} = require("jsdom");
const path = require("path");
const fs = require("fs");

const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <div class="protyle"><div class="protyle-wysiwyg"><div data-node-id="p1">正文</div></div></div>
    <div id="keyboardToolbar"></div>
</body></html>`, {url: "https://siyuan.local/", pretendToBeVisual: true});

const {window} = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.MutationObserver = window.MutationObserver;
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.CustomEvent = window.CustomEvent;
global.getComputedStyle = window.getComputedStyle.bind(window);
global.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 16);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.siyuan = {languages: {}, zIndex: 10, config: {}};
window.matchMedia = () => ({matches: false, addListener() {}, removeListener() {}});
/* v0.8.92：jsdom 的 getBoundingClientRect 全是 0，不打补丁会让
   keyboardBarState().open 永远为 false，所有键盘打开测试都会走
   「等待原生锚点」分支。这里模拟思源原生工具条已就位。 */
const nativeKb = window.document.getElementById("keyboardToolbar");
nativeKb.className = "keyboard";
nativeKb.getBoundingClientRect = () => ({
    width: 1024, height: 48, top: 425, bottom: 473,
    left: 0, right: 1024, x: 0, y: 425, toJSON() {}
});

const bundle = path.resolve(__dirname, ".engine.cjs");
const engine = require(bundle).default;

let failed = 0;
const check = (name, ok, detail) => {
    if (!ok) failed++;
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  ← " + (detail ?? "")}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    console.log("[engine]");
    check("引擎导出 boot/destroy", typeof engine.boot === "function" && typeof engine.destroy === "function");

    engine.config.forceEnable = true;
    engine.setButtons(engine.defaultButtons());
    engine.boot();
    await wait(120);

    const bar = window.document.getElementById("syMobileToolbar");
    check("工具条已挂载", !!bar);
    if (!bar) {
        console.log(`\n${failed} 项失败`);
        process.exit(1);
    }

    const buttons = bar.querySelectorAll(".sy-mb-btn");
    check("默认 9 个按钮", buttons.length === 9, String(buttons.length));
    check("每行 9 个", bar.style.getPropertyValue("--sy-mb-visible") === "9",
        bar.style.getPropertyValue("--sy-mb-visible"));
    check("按钮等宽基准存在", buttons.length > 0 && !!buttons[0].className.includes("sy-mb-btn"));

    console.log("[adapters/icons]");
    check("图标来自适配层", engine.icons.table === "iconTable" && engine.icons.heading === "iconH1");
    check("内置图标清单保留", engine.blockIcons().length > 30, String(engine.blockIcons().length));
    const html = engine.iconHtml("table");
    check("图标可渲染（symbol 或自绘兜底）", /<svg/.test(html), html.slice(0, 40));

    console.log("[table toolbar removed]");
    {
        /* v0.8.68：表格工具栏已移除（思源 3.8.8 起原生表格能力足够）。
           这里守着「别再长回来」：相关 API 全部不存在，引擎只有一套按钮。 */
        check("表格工具栏 API 已移除",
            engine.setTableToolbar === undefined &&
            engine.setTableButtons === undefined &&
            engine.getTableButtons === undefined &&
            engine.tableMode === undefined);
        check("Savor 兼容开关已移除",
            engine.setSavorCompat === undefined && engine.savorActive === undefined);

        /* 光标落在表格单元格里时，工具条仍是同一套快捷按钮（不再切模式） */
        const wrap = window.document.createElement("div");
        wrap.setAttribute("data-node-id", "tbl-1");
        wrap.setAttribute("data-type", "NodeTable");
        wrap.innerHTML = "<table><tbody><tr><td>1</td><td>2</td></tr></tbody></table>";
        window.document.querySelector(".protyle-wysiwyg").appendChild(wrap);
        const cell = wrap.querySelector("td");
        const range = window.document.createRange();
        range.setStart(cell.firstChild, 0);
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        engine.setButtons(engine.getButtons());
        await wait(60);
        check("光标在表格里按钮数不变", bar.querySelectorAll(".sy-mb-btn").length === 9,
            String(bar.querySelectorAll(".sy-mb-btn").length));
        sel.removeAllRanges();
    }

    console.log("[siyuan panel yield]");
    {
        /* v0.8.70：思源官方内联编辑浮层（.protyle-util，行级/块级公式面板就走它）
           打开期间，插件的键盘守卫必须全线让路：
             · focusout 守卫不抢焦点 —— 否则面板里的 math-field 失焦，按键进不去；
             · 续锁 / blur 拦截 / hideKeyboardToolbar 否决同理（内部状态，这里只测
               用户可见的那一条：焦点不许被拽回编辑器）。
           对照实测依据：禁用本插件后同样的操作可以把公式内容写进块里。
           注意本段必须排在 [table col resize] **之前** —— 那段松手后还留着 1.2s
           的收键盘宽限窗，会把这里的第二次断言一起让路掉。 */
        const util = window.document.createElement("div");
        util.className = "protyle-util math-keyboard-panel";
        /* v0.8.73：判定「编辑会话真的在跑」只认两条此刻为真的事实 ——
           容器里有 math-field（数学键盘每次会话都注入、cleanup 必移除），
           或焦点此刻就在容器里。见引擎里 siyuanPanelOpen ③ 的注释：
           v0.8.71 的「有没有输入控件」和 v0.8.72 的「关闭回调还挂着」都会永久误判。 */
        util.innerHTML = '<math-field></math-field>';
        /* jsdom 的 getBoundingClientRect 恒为 0，判定「可见」必须给个真盒子 */
        util.getBoundingClientRect = () => ({
            left: 0, right: 300, top: 400, bottom: 600, width: 300, height: 200, x: 0, y: 400, toJSON() { },
        });
        window.document.body.appendChild(util);

        const wrap = window.document.createElement("div");
        wrap.setAttribute("data-node-id", "tbl-3");
        wrap.setAttribute("data-type", "NodeTable");
        wrap.innerHTML = '<table><tbody><tr><td contenteditable="true" tabindex="0">格</td></tr></tbody></table>';
        window.document.querySelector(".protyle-wysiwyg").appendChild(wrap);
        const cell = wrap.querySelector("td");
        const focusOut = () => cell.dispatchEvent(new window.FocusEvent("focusout", {bubbles: true, relatedTarget: null}));

        cell.focus();
        cell.blur();
        focusOut();
        await wait(30);
        check("公式面板开着时焦点不被抢回", window.document.activeElement !== cell,
            String(window.document.activeElement && window.document.activeElement.tagName));

        /* 面板关闭只加 fn__none（单例复用），此时守卫必须恢复原行为 */
        util.classList.add("fn__none");
        cell.focus();
        cell.blur();
        focusOut();
        await wait(30);
        check("面板关闭后守卫恢复救回", window.document.activeElement === cell,
            String(window.document.activeElement && window.document.activeElement.tagName));

        /* v0.8.72 回归：容器里只剩一个**残留的普通 textarea**（公式会话早已结束、
           但 .protyle-util 没被再次 fn__none）时，不许再判成「公式面板开着」——
           那会让整套键盘守卫永久失效，表现正是「用一会儿之后点开面板键盘就被收掉」。 */
        util.classList.remove("fn__none");
        const resid = window.document.createElement("textarea");
        util.innerHTML = "";
        util.appendChild(resid);
        cell.focus();
        cell.blur();
        focusOut();
        await wait(30);
        check("残留 util 空壳不再让守卫失效", window.document.activeElement === cell,
            String(window.document.activeElement && window.document.activeElement.tagName));

        util.remove();
        wrap.remove();

        /* v0.8.73：让路判据本身不改（armKeyboardGuard 的早退是公式面板落库链的
           必要条件：只有让 activeBlur 跑完，hideElements(["util"]) →
           closeSubElement → subElementCloseCB 才会把 textarea.value 写回
           renderElement[data-content]）。改的是判据**是否会永久为真** ——
           一旦恒真，整套守卫就静默失效，现场只看到「面板一开键盘就没了」。 */
        const srcText = fs.readFileSync(
            path.resolve(__dirname, "..", "src", "engine", "mobile-toolbar.ts"), "utf8");
        check("续锁入口与守卫保持同一让路判据",
            /function keepKeyboardAlive\(ms, immediate\??, forceOnce\??\)/.test(srcText) &&
            srcText.includes("if (!forceOnce && (siyuanPanelOpen() || mathHandoffActive()))") &&
            srcText.includes("function armKeyboardGuard(force)") &&
            srcText.includes("if (!force && (siyuanPanelOpen() || mathHandoffActive()))"));
        /* v0.8.74：面板刚弹出的第一次武装必须能跳过让路，否则用户「还没选任何
           功能」的这一刻，输入法键盘就被 activeBlur 收走了 —— 现场那句话。
           同时 step 里必须换成只看 DOM 的硬判据，否则 300ms 后又把窗口掐断。 */
        check("面板首次武装可跳过让路，step 用硬判据",
            srcText.includes("keepKeyboardAlive(20000, true, true)") &&
            srcText.includes("armKeyboardGuard(true)") &&
            srcText.includes("if (mathSessionLive() || mathHandoffActive()) { kbAliveUntil = 0; return; }") &&
            srcText.includes("function mathSessionLive()"));
        check("公式会话判据不依赖关闭回调（不会永久为真）",
            srcText.includes('if (el.querySelector("math-field")) return true;') &&
            !srcText.includes("siyuanSubElementLive"));
        check("面板/选择器在显示前就守住键盘",
            (srcText.match(/kbWasUp\(\)/g) || []).length >= 3 &&
            srcText.includes("sheetHeldKb = kbWasUp()") &&
            srcText.includes("pickerHeldKb = kbWasUp()"));
        /* v0.8.75：现场日志里「按下工具条 → 15ms 后编辑器失焦 → 到 openSheet 时
           键盘已经没了（held=0）」。所以武装必须早到 pointerdown 的捕获阶段，
           并且必须 preventDefault —— 焦点就是在它的默认行为里被带走的。 */
        check("按下工具条即武装（pointerdown 捕获 + preventDefault）",
            srcText.includes('bar.addEventListener("pointerdown"') &&
            srcText.includes("armOnPress(") &&
            srcText.includes("function armOnPress(tag)") &&
            srcText.includes("if (!kbWasUp()) {") &&
            srcText.includes("maxViewportH - vh > 120"));
    }

    console.log("[table col resize]");
    {
        /* v0.8.69/70：按住两格之间那道竖线 = 触控调宽。
           思源 3.8.8 移动端的列宽线是 .protyle-table-control__width（不是桌面端的
           .table__resize），且 startColumnResize 在 pointerdown 里同步 blur 单元格、
           再派发 siyuan-mobile-table-action 让 keyboardToolbar 调 activeBlur(true)。
           插件旧版会把焦点救回来并重新弹键盘（「点一下闪一下」）。
           现在只有该手势允许键盘收着。 */
        const wrap = window.document.createElement("div");
        wrap.setAttribute("data-node-id", "tbl-2");
        wrap.setAttribute("data-type", "NodeTable");
        wrap.innerHTML = '<table><tbody><tr><td contenteditable="true" tabindex="0">单元格</td></tr></tbody></table>';
        const resize = window.document.createElement("div");
        resize.className = "protyle-table-control__handle protyle-table-control__width";
        wrap.appendChild(resize);
        window.document.querySelector(".protyle-wysiwyg").appendChild(wrap);

        const cell = wrap.querySelector("td");
        const focusOut = () => cell.dispatchEvent(new window.FocusEvent("focusout", {bubbles: true, relatedTarget: null}));

        /* ① 基线：普通焦点掉落，守卫应当救回（证明测试环境能观察到这个行为） */
        cell.focus();
        cell.blur();
        focusOut();
        await wait(30);
        check("普通焦点掉落被守卫救回", window.document.activeElement === cell,
            String(window.document.activeElement && window.document.activeElement.className));

        /* ② 第一次「点分隔线」其实是点在单元格边缘 8px 内（思源在 click 里激活手柄），
           这一步同样会收键盘，所以也必须允许收着 —— 冷启动后「线刚选中就消失」就是这个。 */
        cell.getBoundingClientRect = () => ({
            left: 0, right: 100, top: 0, bottom: 40, width: 100, height: 40, x: 0, y: 0, toJSON() { },
        });
        cell.dispatchEvent(new window.MouseEvent("pointerdown", {bubbles: true, cancelable: true, clientX: 96}));
        cell.focus();
        cell.blur();
        focusOut();
        await wait(30);
        check("点单元格边缘（激活分隔线）时焦点不被救回", window.document.activeElement !== cell,
            String(window.document.activeElement && window.document.activeElement.tagName));

        /* ③ 按住列宽线（pointerdown，思源就是在这一步 blur 的）：同样不许救回 */
        resize.dispatchEvent(new window.Event("pointerdown", {bubbles: true, cancelable: true}));
        cell.focus();
        cell.blur();
        focusOut();
        await wait(30);
        check("按住列宽线时焦点不被救回", window.document.activeElement !== cell,
            String(window.document.activeElement && window.document.activeElement.tagName));

        /* ③ 松手后仍留宽限（思源 onmouseup 落库重渲染那一下也不许救） */
        window.document.dispatchEvent(new window.Event("pointerup", {bubbles: true}));
        cell.focus();
        cell.blur();
        focusOut();
        await wait(30);
        check("松手后 1.2s 内仍允许收键盘", window.document.activeElement !== cell,
            String(window.document.activeElement && window.document.activeElement.tagName));
        wrap.remove();
    }

    console.log("[caret protyle · 单元格内所有块插入]");
    {
        /* v0.8.78：思源 3.8.4 起表格单元格走「lite 富文本编辑器」就地编辑，
           光标属于**另一个 Protyle 实例**；文档编辑器那个 Protyle 的 insert 事务
           会让块落在表格外面。而 getAllEditor() 并不含这个 lite 实例，所以引擎改成
           由插件入口登记所有 Protyle（registerProtyle），按 .protyle-wysiwyg 反查。
           这里用两个假 Protyle 守住「插入打给谁」：
             ① 光标在单元格 → 公式块打给 lite Protyle（只靠登记表，provider 里没有它）
             ② 光标在普通段落 → 仍打给文档 Protyle（不回归）
             ③ 行级公式 → 维持现状，仍走文档 Protyle 的 setInlineMark */
        const wys = window.document.querySelector(".protyle-wysiwyg");
        const table = window.document.createElement("div");
        table.setAttribute("data-node-id", "tbl-math");
        table.setAttribute("data-type", "NodeTable");
        table.innerHTML = "<table><thead><tr><th>表头</th></tr></thead><tbody><tr><td>" +
            '<div class="table__cell-editor">' +
            '<div class="protyle" data-protyle-lite="true">' +
            '<div class="protyle-wysiwyg" contenteditable="true">' +
            '<div data-node-id="cell-p1">单元格</div>' +
            "</div></div></div></td></tr></tbody></table>";
        wys.appendChild(table);

        const calls = [];
        const docProtyle = {
            element: window.document.querySelector(".protyle"),
            wysiwyg: {element: wys},
            toolbar: {
                range: null,
                setInlineMark: (p, mark) => calls.push({who: "doc-inline", target: p, mark: mark}),
            },
            hint: {
                splitChar: "", lastIndex: 0, source: "",
                fill: (value, p) => calls.push({who: "doc-fill", value: value, target: p}),
                fillCommand: (value, p) => calls.push({who: "doc-fillCommand", value: value, target: p}),
            },
        };
        const liteWys = table.querySelector(".table__cell-editor .protyle-wysiwyg");
        const liteProtyle = {
            lite: true,
            element: table.querySelector(".table__cell-editor .protyle"),
            wysiwyg: {element: liteWys},
            toolbar: {
                range: null,
                setInlineMark: (p, mark) => calls.push({who: "lite-inline", target: p, mark: mark}),
            },
            hint: {
                splitChar: "", lastIndex: 0, source: "",
                fill: (value, p) => calls.push({who: "lite-fill", value: value, target: p}),
                fillCommand: (value, p) => calls.push({who: "lite-fillCommand", value: value, target: p}),
            },
        };

        window.siyuan.mobile = {editor: {protyle: docProtyle}};
        /* 真实情况：getAllEditor() 只返回文档编辑器 / popEditor / 次级编辑器，
           单元格的就地 lite 编辑器**不在**里面（v0.8.77 就栽在这里）。
           所以这里故意只给文档编辑器，lite 只能靠 registerProtyle 登记表找到。 */
        engine.setEditorsProvider(() => [{protyle: docProtyle}]);
        engine.registerProtyle(liteProtyle);

        const caretIn = (el) => {
            const range = window.document.createRange();
            range.setStart(el.firstChild || el, 0);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        };

        caretIn(table.querySelector('[data-node-id="cell-p1"]'));
        await engine.actions.math();
        const inCell = calls.filter((c) => c.value === "$$").pop();
        check("单元格内公式块投给 lite Protyle（原生 fillCommand）",
            !!inCell && inCell.who === "lite-fillCommand" && inCell.target === liteProtyle,
            inCell ? inCell.who : "未发生插入");

        /* 不只保护公式块：标题以外的常用块都共用同一个插入入口。
           每个动作都重新把光标放进单元格，并断言没有打给文档 Protyle。 */
        for (const item of [
            {action: "ul", value: "- "},
            {action: "ol", value: "1. "},
            {action: "task", value: "- [ ]"},
            {action: "quote", value: "> "},
            {action: "code", value: "```"},
        ]) {
            calls.length = 0;
            caretIn(table.querySelector('[data-node-id="cell-p1"]'));
            await engine.actions[item.action]();
            const call = calls.filter((c) => c.who === "lite-fillCommand").pop();
            check("单元格内 " + item.action + " 投给 lite Protyle",
                !!call && call.target === liteProtyle && String(call.value).startsWith(item.value) &&
                !calls.some((c) => c.who === "doc-fill" || c.who === "doc-fillCommand"),
                calls.map((c) => c.who + ":" + c.value).join(" | ") || "未发生插入");
        }

        /* 真机 v0.8.80 日志复现：先在 lite 内编辑，按下工具条后选区被重锚到 TH。
           原生 activeEditor 语义要求这次插入仍交给之前的 lite，而不是文档。 */
        calls.length = 0;
        caretIn(table.querySelector('[data-node-id="cell-p1"]'));
        liteWys.dispatchEvent(new window.Event("pointerdown", {bubbles: true}));
        bar.dispatchEvent(new window.Event("pointerdown", {bubbles: true, cancelable: true}));
        caretIn(table.querySelector("th"));
        await engine.actions.ul();
        const reanchored = calls.filter((c) => c.who === "lite-fillCommand").pop();
        check("TH 重锚后列表仍投给按压前的 lite Protyle",
            !!reanchored && reanchored.target === liteProtyle &&
            liteWys.contains(liteProtyle.toolbar.range.startContainer) &&
            !calls.some((c) => c.who === "doc-fill" || c.who === "doc-fillCommand"),
            calls.map((c) => c.who).join(" | ") || "未发生插入");

        /* v0.8.82 真机根因：思源 tableCellRichEditor 在 document 捕获阶段的
           pointerdown 里，只要目标不在 #keyboardToolbar / #commonMenu / .b3-dialog
           白名单就 finish() 销毁 lite 编辑器。复刻这个监听器，验证插件在
           原生代码读取 target 之前已经给工具条挂上标记。 */
        console.log("[cell editor guard]");
        let nativeSeen = null;
        const nativePointerDown = (ev) => {
            nativeSeen = {
                whitelist: !!(ev.target && ev.target.closest &&
                    ev.target.closest("#keyboardToolbar, #commonMenu, .b3-dialog")),
                marked: bar.classList.contains("b3-dialog")
            };
        };
        window.document.addEventListener("pointerdown", nativePointerDown, {capture: true});
        bar.querySelector(".sy-mb-btn").dispatchEvent(
            new window.Event("pointerdown", {bubbles: true, cancelable: true}));
        check("工具条按下时命中原生白名单，lite 编辑器不会被 finish()",
            !!nativeSeen && nativeSeen.whitelist && nativeSeen.marked,
            JSON.stringify(nativeSeen));
        await wait(0);
        check("pointerdown 派发结束后标记立即移除", !bar.classList.contains("b3-dialog"));
        window.document.removeEventListener("pointerdown", nativePointerDown, {capture: true});

        const guardSrc = fs.readFileSync(path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("标记监听器装在 window 捕获阶段（早于思源 document 捕获）",
            /window\.addEventListener\("pointerdown", markNativeCellOwner,\s*\{\s*capture: true/.test(guardSrc));
        const guardCss = fs.readFileSync(path.resolve(__dirname, "../src/styles/toolbar.css"), "utf8");
        check("临时标记的 .b3-dialog 布局副作用已用 ID+class 抵消",
            guardCss.includes("#syMobileToolbar.b3-dialog") && guardCss.includes("top: auto"));

        /* 安全闸：万一原生 finish() 仍把 lite 拆掉，必须中止而不是退回文档编辑器
           —— 退回文档正是「块插到表格下方」那条错误路径。 */
        const cellHost = table.querySelector("tbody .table__cell-editor");
        const hostParent = cellHost.parentNode;
        const hostNext = cellHost.nextSibling;
        calls.length = 0;
        caretIn(table.querySelector('[data-node-id="cell-p1"]'));
        bar.dispatchEvent(new window.Event("pointerdown", {bubbles: true, cancelable: true}));
        cellHost.remove();                 // 模拟 finish() → fragment.destroy()
        caretIn(table.querySelector("th"));
        await engine.actions.ul();
        check("lite 被销毁后中止插入，不再写到表格下方", calls.length === 0,
            calls.map((c) => c.who).join(" | ") || "已中止");
        hostParent.insertBefore(cellHost, hostNext);

        /* 单元格实例尚未登记时宁可中止，也不能回退文档而插到表格下方。 */
        const pendingCell = window.document.createElement("td");
        pendingCell.innerHTML = '<div class="table__cell-editor"><div class="protyle" data-protyle-lite="true">' +
            '<div class="protyle-wysiwyg" contenteditable="true"><div data-node-id="cell-pending">待初始化</div>' +
            "</div></div></div>";
        table.querySelector("tbody tr").appendChild(pendingCell);
        calls.length = 0;
        caretIn(pendingCell.querySelector('[data-node-id="cell-pending"]'));
        await engine.actions.code();
        check("未登记的单元格不回退到文档插入", calls.length === 0,
            calls.map((c) => c.who).join(" | "));

        calls.length = 0;
        caretIn(window.document.querySelector('[data-node-id="p1"]'));
        await engine.actions.math();
        const inDoc = calls.filter((c) => c.value === "$$").pop();
        check("普通段落公式块仍投给文档 Protyle",
            !!inDoc && inDoc.who === "doc-fillCommand" && inDoc.target === docProtyle,
            inDoc ? inDoc.who : "未发生插入");

        /* v0.8.83：行级公式也统一走 protyleForInsertion()。旧实现固定打给文档
           Protyle，单元格里 TH 假选区会让文档层 setInlineMark 对 NodeTable 生成
           非法事务（用户实测内核崩溃）。 */
        console.log("[inline-math · 单元格]");
        calls.length = 0;
        caretIn(table.querySelector('[data-node-id="cell-p1"]'));
        await engine.actions.inlineMath();
        const inlineInCell = calls.filter((c) => c.mark === "inline-math").pop();
        check("单元格内行级公式投给 lite Protyle",
            !!inlineInCell && inlineInCell.who === "lite-inline" && inlineInCell.target === liteProtyle &&
            !calls.some((c) => c.who === "doc-inline"),
            calls.map((c) => c.who).join(" | ") || "未发生插入");

        /* lite 已销毁时宁可中止，绝不回退文档层（那正是内核崩溃的路径） */
        const mathHost = table.querySelector("tbody .table__cell-editor");
        const mathParent = mathHost.parentNode;
        const mathNext = mathHost.nextSibling;
        calls.length = 0;
        caretIn(table.querySelector('[data-node-id="cell-p1"]'));
        bar.dispatchEvent(new window.Event("pointerdown", {bubbles: true, cancelable: true}));
        mathHost.remove();
        caretIn(table.querySelector("th"));
        await engine.actions.inlineMath();
        check("lite 已销毁时行级公式中止，不触发文档层行内标记", calls.length === 0,
            calls.map((c) => c.who).join(" | ") || "已中止");
        mathParent.insertBefore(mathHost, mathNext);

        calls.length = 0;
        caretIn(window.document.querySelector('[data-node-id="p1"]'));
        await engine.actions.inlineMath();
        const inlineInDoc = calls.filter((c) => c.mark === "inline-math").pop();
        check("普通段落行级公式仍投给文档 Protyle（不回归）",
            !!inlineInDoc && inlineInDoc.who === "doc-inline" && inlineInDoc.target === docProtyle,
            inlineInDoc ? inlineInDoc.who : "未发生插入");

        /* v0.8.78 的实际失效点：登记写在 origInit 之前，wysiwyg 尚未创建，
           所以真机上登记表永远为空。用源码顺序断言锁住这个回归。 */
        const entryText = fs.readFileSync(path.resolve(__dirname, "../src/index.ts"), "utf8");
        const initAt = entryText.indexOf("const result = origInit.apply(this, args);");
        const registerAt = entryText.indexOf("register(this && this.protyle);", initAt);
        check("lite 实例在 Protyle 初始化完成后才登记", initAt >= 0 && registerAt > initAt);
        check("热更新通过全局桥登记到当前引擎",
            entryText.includes("w.__syMbRegisterProtyle =") && entryText.includes("proto.__syMbCaptureBridgeV1"));

        console.log("[insert diagnostics]");
        const diag = engine.insertDiagnostics;
        diag.setEnabled(false);
        diag.clear();
        diag.setEnabled(true);
        engine.registerProtyle(liteProtyle);
        caretIn(table.querySelector('[data-node-id="cell-p1"]'));
        await engine.actions.math();
        await wait(20);
        const logText = diag.getText();
        check("诊断记录 lite 目标与 fill 完整链路",
            logText.includes("register.ok") && logText.includes("insert.target.lite") &&
            logText.includes("fill.before") && logText.includes("fill.return"));
        check("诊断不记录单元格正文", !logText.includes("单元格"));

        /* v0.8.85：公式块 / 行级公式插入后必须把系统 IME 让给公式键盘插件。
           现场冲突是 BlockBar 的 hideKeyboardToolbar 包装返回 2（请原生叫回 IME）
           叠加 holdKeyboard 的 showKeyboard，而 mathSessionLive() 在面板刚打开、
           math-field 未注入时还是假。这里守住院「交接窗口」的触发与边界。 */
        console.log("[math keyboard handoff]");
        const handoffs = [];
        const kbBroadcasts = [];
        const onHandoff = (ev) => handoffs.push(ev.detail);
        const onKb = (ev) => kbBroadcasts.push(String(ev.detail));
        window.document.addEventListener("sy-mb:math-session-start", onHandoff);
        window.document.addEventListener("sy-mb:kb", onKb);

        diag.clear();
        caretIn(window.document.querySelector('[data-node-id="p1"]'));
        await engine.actions.math();
        check("公式块插入派发 IME 交接事件",
            handoffs.length === 1 && handoffs[0].source === "math-block" &&
            kbBroadcasts.some((m) => m.indexOf("math-handoff") === 0),
            JSON.stringify(handoffs) + " | " + kbBroadcasts.join(","));
        check("公式块插入记录 math.handoff 诊断", diag.getText().includes("math.handoff"));

        handoffs.length = 0;
        kbBroadcasts.length = 0;
        diag.clear();
        caretIn(window.document.querySelector('[data-node-id="p1"]'));
        await engine.actions.ul();
        check("普通块插入不交接 IME（不回归）",
            handoffs.length === 0 && !diag.getText().includes("math.handoff"),
            JSON.stringify(handoffs));

        handoffs.length = 0;
        caretIn(window.document.querySelector('[data-node-id="p1"]'));
        await engine.actions.inlineMath();
        check("行级公式同样交接 IME",
            handoffs.length === 1 && handoffs[0].source === "inline-math",
            JSON.stringify(handoffs));

        window.document.removeEventListener("sy-mb:math-session-start", onHandoff);
        window.document.removeEventListener("sy-mb:kb", onKb);

        const handoffSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("hideKeyboardToolbar 否决分支与焦点守卫均受交接窗口约束",
            (handoffSrc.match(/!mathSessionLive\(\) && !mathHandoffActive\(\)/g) || []).length === 3);
        check("续锁 / 延复查 / 行级公式兜底均受交接窗口约束",
            handoffSrc.includes("!CONFIG.keepKeyboard || mathHandoffActive()") &&
            handoffSrc.includes("siyuanPanelOpen() || mathHandoffActive()") &&
            handoffSrc.includes("mathSessionLive() || mathHandoffActive()"));

        let copied = "";
        Object.defineProperty(window.navigator, "clipboard", {
            configurable: true,
            value: {writeText: async (text) => { copied = text; }}
        });
        const ui = diag.createUI();
        window.document.body.appendChild(ui.element);
        const diagButtons = ui.element.querySelectorAll("button");
        diagButtons[0].click();
        await wait(20);
        check("设置中一键复制完整日志", copied.includes("fill.before") && copied.includes("User-Agent"),
            "复制长度=" + copied.length + " 前缀=" + copied.slice(0, 120));
        diagButtons[1].click();
        check("设置中清空后可重新测试",
            !diag.getText().includes("fill.before") && diag.getText().includes("日志条数: 0"));
        ui.destroy();
        ui.element.remove();
        diag.setEnabled(false);
        diag.clear();

        table.remove();
        delete window.siyuan.mobile;
        engine.setEditorsProvider(null);
    }

    console.log("[perf probe]");
    {
        const diag = engine.insertDiagnostics;
        check("性能采样默认关闭", diag.perf.isEnabled() === false &&
            diag.getText().includes("# 性能采样: off"));

        /* 主诊断关闭时性能采样仍可独立记录（write 的 force 通道） */
        diag.setEnabled(false);
        diag.clear();
        diag.perf.setEnabled(true);
        diag.perf.begin("test-open");
        diag.perf.bump("scheduleCalls", 3);
        diag.perf.timed("scan", () => { /* 模拟一次扫描 */ });
        diag.perf.scan(true, 8421);
        diag.perf.end("shown");
        const perfText = diag.getText();
        check("首帧窗口记录延迟、扫描节点与重排计数",
            perfText.includes("perf.show.begin") && perfText.includes("perf.show.end") &&
            perfText.includes("delayMs") && perfText.includes("scanNodes") &&
            perfText.includes("8421") && perfText.includes("scheduleCalls") &&
            perfText.includes("scanMs"),
            perfText.slice(0, 320));
        check("性能采样不牵出块插入链路日志",
            !perfText.includes("fill.before") && !perfText.includes("register.ok"));

        diag.perf.setEnabled(false);
        diag.clear();
        diag.perf.begin("should-not-log");
        diag.perf.end("shown");
        check("关闭后零日志", !diag.getText().includes("perf.show"));

        diag.setEnabled(true);
        diag.perf.setEnabled(true);
        const ui = diag.createUI();
        window.document.body.appendChild(ui.element);
        const toggles = ui.element.querySelectorAll('input[type="checkbox"]');
        check("设置中诊断与性能采样是两个独立开关", toggles.length === 2,
            String(toggles.length));
        toggles[1].click();
        check("性能采样开关可切换", diag.perf.isEnabled() === false);
        ui.destroy();
        ui.element.remove();
        diag.setEnabled(false);
        diag.perf.setEnabled(false);
        diag.clear();

        const diagSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/insert-diagnostics.ts"), "utf8");
        const engineSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("采样逻辑集中在诊断模块（引擎只有调用点）",
            diagSrc.includes("function perfBegin") && diagSrc.includes("function perfTimed") &&
            engineSrc.includes("InsertDiagnostics.perf.timed") &&
            !engineSrc.includes("performance.now"));
    }

    console.log("[fast show]");
    {
        const diag = engine.insertDiagnostics;
        /* JSDOM 不做布局，inEditor() 会判 false；临时关掉这条门槛，
           只验证「键盘信号 → 同步显示」这条快路径本身。 */
        const savedOnlyInEditor = engine.config.showOnlyInEditor;
        engine.config.showOnlyInEditor = false;
        diag.setEnabled(false);
        diag.clear();
        diag.perf.setEnabled(true);
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        const fastText = diag.getText();
        check("键盘打开信号同步显示工具条（不等测量队列）",
            !bar.classList.contains("sy-mb-hidden") &&
            fastText.includes("perf.show.begin") && fastText.includes('"reason":"shown"'),
            fastText.slice(0, 320));
        const delay = fastText.match(/"delayMs":([\d.]+)/);
        check("首帧显示延迟进入毫秒级", !!delay && Number(delay[1]) < 100,
            delay ? delay[1] : "无 delayMs");

        const fastSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("显示与测量解耦：键盘信号同步走 fast 快路径",
            fastSrc.includes("function updateVisibility(kbState?, fast?)") &&
            fastSrc.includes("wanted && !fast") &&
            fastSrc.includes("updateVisibility(null, true)"));
        check("测量队列改为合并去重（不再整体清空）",
            fastSrc.includes("pendingMeasure.has(d)") &&
            fastSrc.includes("pendingMeasure.set(d, timer)") &&
            !fastSrc.includes("scheduleCancelled"));
        check("原生工具条未就位的过渡期不把快路径显示收回",
            fastSrc.includes("const kbPending = kbSignal === true && !res.kb.open") &&
            fastSrc.includes("updateVisibility(res.kb, kbPending)"));
        check("深扫描移出首帧",
            fastSrc.includes("deepScanTimer") &&
            fastSrc.includes("kbOpenedAt === 0 || now - kbOpenedAt >= 300"));
        const cssText = fs.readFileSync(
            path.resolve(__dirname, "../src/styles/toolbar.css"), "utf8");
        check("出现动画改为完整载入曲线（360ms / 缓起中段可见）",
            cssText.includes("--sy-mb-ease-load: cubic-bezier(.22, .68, .24, 1)") &&
            cssText.includes("--sy-mb-dur-in: 360ms") &&
            cssText.includes("--sy-mb-dur-out: 200ms") &&
            cssText.includes("--sy-mb-enter-shift: calc(100% + 12px)"));

        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: false}));
        engine.config.showOnlyInEditor = savedOnlyInEditor;
        diag.perf.setEnabled(false);
        diag.clear();
    }

    console.log("[jitter fix]");
    {
        const diag = engine.insertDiagnostics;
        /* 上一段的 detail:false 现在走 200ms 确认窗口，等它自然到期，
           让状态干净地收敛到隐藏态，再复刻真机的 true→false→true 抖动。 */
        await wait(230);
        const savedOnlyInEditor = engine.config.showOnlyInEditor;
        engine.config.showOnlyInEditor = false;
        diag.setEnabled(false);
        diag.clear();
        diag.perf.setEnabled(true);

        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        const shownOnce = !bar.classList.contains("sy-mb-hidden");
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: false}));
        await wait(60);
        const stillShown = !bar.classList.contains("sy-mb-hidden");
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        const jitterText = diag.getText();
        const beginCount = (jitterText.match(/perf\.show\.begin/g) || []).length;
        check("抖动窗口内工具条保持显示（不重放滑入动画）",
            shownOnce && stillShown && !bar.classList.contains("sy-mb-hidden"));
        check("一次物理激活只产生一个性能会话", beginCount === 1,
            "begin=" + beginCount);

        /* 明确收起信号必须立即隐藏，不能被确认窗口拖住 */
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        check("明确的 keyboard-hiding 立即隐藏",
            bar.classList.contains("sy-mb-hidden"));

        const jitterSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("隐藏信号统一走 200ms 确认窗口",
            jitterSrc.includes("KB_HIDE_CONFIRM_MS") &&
            jitterSrc.includes("function applyKbHidden()") &&
            jitterSrc.includes("setKb(false, true)") &&
            jitterSrc.includes("if (kbSignal === true) return;"));
        check("键盘打开过渡期启发式不改回 false",
            jitterSrc.includes("const settling = kbOpenedAt > 0") &&
            jitterSrc.includes("!settling && vh >= maxViewportH - 8"));
        check("卸载时清理隐藏确认定时器",
            jitterSrc.includes("if (kbHideTimer) { clearTimeout(kbHideTimer); kbHideTimer = 0; }"));
        const jitterCss = fs.readFileSync(
            path.resolve(__dirname, "../src/styles/toolbar.css"), "utf8");
        check("动画只保留可合成属性（bottom 不在 transition）",
            !/transition[^;]*bottom/.test(jitterCss) &&
            jitterCss.includes("transition: opacity var(--sy-mb-dur-out)") &&
            jitterCss.includes("transform var(--sy-mb-dur-out)"));
        check("隐藏位移与 --sy-mb-offset 解耦（60px 载入位移）",
            jitterCss.includes("translateY(var(--sy-mb-enter-shift))") &&
            !jitterCss.includes("translateY(calc(100% + 96px))") &&
            !jitterCss.includes("translateY(calc(100% + var(--sy-mb-offset"));
        check("非对称进出：进场 360ms / 退场 200ms",
            jitterCss.includes("#syMobileToolbar:not(.sy-mb-hidden)") &&
            jitterCss.includes("transition-duration: var(--sy-mb-dur-in)"));
        check("不再使用前段极快的强 ease-out / 线性淡入",
            !jitterCss.includes("opacity .12s linear") &&
            !jitterCss.includes("cubic-bezier(.23, 1, .32, 1)") &&
            !jitterCss.includes("transform .16s cubic-bezier(.32, .72, 0, 1)"));
        check("reduced-motion 覆盖工具条自身（更轻柔而非清零）",
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition: opacity 120ms ease-out !important/.test(jitterCss) &&
            /@media \(prefers-reduced-motion: reduce\)[\s\S]*?sy-mb-hidden \{ transform: none/.test(jitterCss));
        check("按压反馈保留原生 pointerdown 即时态 sy-mb-press",
            jitterCss.includes(".sy-mb-btn.sy-mb-press .sy-mb-icon"));
        /* 只审工具条容器本身：文件里滚轮/条目等其它组件本来就有投影，
           不属于「与官方 .keyboard 对齐」的约束范围。 */
        const barBlock = (jitterCss.match(/#syMobileToolbar\s*\{[\s\S]*?\n\}/) || [""])[0];
        check("视觉约束不破：工具条容器不叠毛玻璃、不加投影",
            !!barBlock && !/backdrop-filter|box-shadow/.test(barBlock));

        engine.config.showOnlyInEditor = savedOnlyInEditor;
        diag.perf.setEnabled(false);
        diag.clear();
    }

    console.log("[user hide latch]");
    {
        const latchSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("keyboard-hiding 置强让路闩锁并撤销续锁",
            latchSrc.includes("userHideUntil = Date.now() + 1200") &&
            /siyuan-mobile-keyboard-hiding[\s\S]{0,700}userHideUntil/.test(latchSrc) &&
            /siyuan-mobile-keyboard-hiding[\s\S]{0,700}cancelKeyboardAlive\(\)/.test(latchSrc));
        check("hideKeyboardToolbar 否决分支在真收闩锁期间不返回 2",
            /hideKeyboardToolbar" && arguments\[0\][\s\S]{0,420}!userHideActive\(\)/.test(latchSrc));
        check("rescue / 续锁 step 均受真收闩锁约束",
            /function rescueKeyboardIfProtected\(\)\s*\{[\s\S]{0,220}if \(userHideActive\(\)\) return;/.test(latchSrc) &&
            latchSrc.includes("if (userHideActive()) { kbAliveUntil = 0; return; }"));
        check("键盘真打开时解除闩锁、卸载时清零",
            latchSrc.includes("userHideUntil = 0;   // v0.8.90：键盘真打开") &&
            /userHideUntil = 0;\s*kbOpenedAt = 0;/.test(latchSrc));
        /* 行为：真收之后不再被唤回 */
        const savedOnlyInEditor2 = engine.config.showOnlyInEditor;
        engine.config.showOnlyInEditor = false;
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(60);
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: false}));
        await wait(60);
        check("真收键盘后工具条保持隐藏、不被重生",
            bar.classList.contains("sy-mb-hidden"));
        engine.config.showOnlyInEditor = savedOnlyInEditor2;
    }

    console.log("[offset hit]");
    {
        const offSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        const offDiag = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/insert-diagnostics.ts"), "utf8");
        check("原生键盘工具条为可信基准，缓存元素最多再让 24px",
            offSrc.includes("const trustedTop = kbState.open && kbState.el ? kbState.top : -Infinity;") &&
            offSrc.includes("const topFloor = trustedTop - 24;") &&
            offSrc.includes("if (r.top < top && r.top >= topFloor)"));
        check("consider / reuse 均排除编辑器内容树（图片块不参与避让）",
            offSrc.split('if (el.closest && el.closest(".protyle-wysiwyg")) return;').length - 1 === 2);
        check("offset 变化时才写诊断，记录基准与命中元素",
            offSrc.includes('InsertDiagnostics.perf.note("perf.offset"') &&
            offSrc.includes("kbTop: Math.round(res.kb.top || 0)") &&
            offSrc.includes("hit: InsertDiagnostics.node(res.el)") &&
            offSrc.includes("if (off !== lastOffsetVal)"));
        check("诊断模块导出 note（不受会话窗口限制）",
            offDiag.includes("function perfNote(stage, detail)") &&
            offDiag.includes("note: perfNote,"));
        const diag2 = engine.insertDiagnostics;
        diag2.setEnabled(false);
        diag2.clear();
        diag2.perf.setEnabled(true);
        diag2.perf.note("perf.offset.test", {px: 42});
        check("perf.note 在会话结束后仍可写",
            diag2.getText().includes("perf.offset.test"));
        diag2.perf.setEnabled(false);
        diag2.clear();
    }

    console.log("[native anchor]");
    {
        const anchorSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("setKb(true) 锚定原生键盘工具条，未就位时保持隐藏",
            anchorSrc.includes("if (keyboardBarState().open) {") &&
            anchorSrc.includes("pendingShow = true;") &&
            anchorSrc.includes("updateVisibility(null, false);   // 完整判据：kb.open=false → 隐藏"));
        check("showKeyboardToolbar() 返回后立即校准并叠加",
            /showKeyboardToolbar" && pendingShow[\s\S]{0,220}revealWithNativeAnchor\("native"\)/.test(anchorSrc));
        check("applyMeasure 兜底：kb.open 到达才显示，等待期间不提前显示",
            anchorSrc.includes('revealWithNativeAnchor("measure", res)') &&
            anchorSrc.includes("updateVisibility(res.kb, false);"));
        check("先校准 offset 再显示（一次到位，无瞬间移位）",
            /function revealWithNativeAnchor[\s\S]{0,420}writeBottomOffset\(state\);[\s\S]{0,460}updateVisibility\(null, true\)/.test(anchorSrc));
        check("超时兜底与收键盘 / 卸载清理",
            anchorSrc.includes('revealWithNativeAnchor("timeout")') &&
            anchorSrc.includes("showAnchorTimeoutMs: 1000") &&
            anchorSrc.split("pendingShow = false;").length - 1 >= 3);

        /* 行为：原生工具条不可见时，键盘打开信号不应抢先显示 */
        const kbEl = window.document.getElementById("keyboardToolbar");
        const savedRect = kbEl.getBoundingClientRect;
        kbEl.getBoundingClientRect = () => ({
            width: 0, height: 0, top: 0, bottom: 0,
            left: 0, right: 0, x: 0, y: 0, toJSON() {}
        });
        const savedTimeout = engine.config.showAnchorTimeoutMs;
        const savedOnlyInEditor3 = engine.config.showOnlyInEditor;
        engine.config.showAnchorTimeoutMs = 60;
        engine.config.showOnlyInEditor = false;
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(25);
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        check("原生工具条未出现时快捷工具条保持隐藏",
            bar.classList.contains("sy-mb-hidden"));
        await wait(130);
        check("锚点超时兜底仍会让工具条出现（不会永不显示）",
            !bar.classList.contains("sy-mb-hidden"));
        kbEl.getBoundingClientRect = savedRect;
        engine.config.showAnchorTimeoutMs = savedTimeout;
        engine.config.showOnlyInEditor = savedOnlyInEditor3;
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(25);
    }

    console.log("[editor only]");
    {
        const edSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("inEditor 增加「编辑器外输入控件」焦点判据",
            edSrc.includes("function focusInForeignInput(wys)") &&
            /function inEditor\(\)[\s\S]{0,1100}if \(focusInForeignInput\(wys\)\) return false;/.test(edSrc) &&
            edSrc.includes('tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"'));
        check("焦点切换时立即同步可见性，且不绕过原生锚点等待",
            edSrc.includes("const syncEditorVisibility = () => {") &&
            edSrc.includes("if (destroyed || pendingShow) return;") &&
            edSrc.includes('document.addEventListener("focusout", syncEditorVisibility, true)'));
        check("showOnlyInEditor 默认开启",
            edSrc.includes("showOnlyInEditor: true,"));

        /* 行为：jsdom 不给布局，先给编辑器补几何/定位 mock，让 inEditor()
           的基础检查通过 —— 这样下面两条断言才真正只验证「焦点归属」。 */
        const wysEl = window.document.querySelector(".protyle-wysiwyg");
        const savedWysRect = wysEl.getBoundingClientRect;
        const savedWysPos = wysEl.style.position;
        wysEl.style.position = "fixed";
        wysEl.getBoundingClientRect = () => ({
            width: 1024, height: 600, top: 0, bottom: 600,
            left: 0, right: 1024, x: 0, y: 0, toJSON() {}
        });
        const savedOnly = engine.config.showOnlyInEditor;
        engine.config.showOnlyInEditor = true;
        const foreign = window.document.createElement("input");
        foreign.id = "foreign-search-input";
        window.document.body.appendChild(foreign);
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(25);
        foreign.focus();
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        check("焦点在搜索 / 插件输入框时工具条保持隐藏",
            bar.classList.contains("sy-mb-hidden"));

        /* 焦点回到文档编辑器后应恢复显示（不误伤按压时的短暂 blur） */
        foreign.blur();
        wysEl.setAttribute("contenteditable", "true");
        wysEl.focus();
        window.document.dispatchEvent(new window.CustomEvent("focusin", {bubbles: true}));
        await wait(25);
        check("焦点回到文档编辑器后工具条恢复显示",
            !bar.classList.contains("sy-mb-hidden"),
            "active=" + (window.document.activeElement && window.document.activeElement.tagName));

        wysEl.removeAttribute("contenteditable");
        wysEl.getBoundingClientRect = savedWysRect;
        wysEl.style.position = savedWysPos;
        foreign.remove();
        engine.config.showOnlyInEditor = savedOnly;
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(25);
    }

    console.log("[panel dock]");
    {
        const pdSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        const pdCss = fs.readFileSync(
            path.resolve(__dirname, "../src/styles/toolbar.css"), "utf8");
        check("面板容器层级低于原生键盘工具条（按实测 kbZ 反推）",
            pdCss.includes("--sy-mb-panel-z: 204;") &&
            (pdCss.match(/z-index: var\(--sy-mb-panel-z, 204\);/g) || []).length === 2 &&
            pdSrc.includes("String(Math.max(1, res.kbZ - 1))") &&
            pdSrc.includes('document.documentElement.style.setProperty("--sy-mb-panel-z", pz)'));
        check("面板容器仍全屏，白底延伸到底作工具条背后的背景板",
            (pdCss.match(/#syMobileToolbar(?:Sheet|Picker)\s*\{[\s\S]{0,420}?inset: 0;/g) || []).length === 2 &&
            pdCss.includes("bottom: 0;"));
        check("遮罩覆盖整屏吃点击，但底部两条工具条区域全透明",
            /\.sy-mb-mask\s*\{[\s\S]{0,760}?position: absolute;/.test(pdCss) &&
            /\.sy-mb-mask\s*\{[\s\S]{0,760}?linear-gradient\(to bottom/.test(pdCss) &&
            pdCss.includes("calc(100% - var(--sy-mb-bottom-stack, 96px))"));
        check("内容区按实测工具条高度做底部避让（不是面板留白）",
            pdCss.includes("padding: 2px 8px calc(10px + var(--sy-mb-bottom-stack, 0px))") &&
            pdCss.includes("padding: 4px 8px calc(10px + var(--sy-mb-bottom-stack, 0px))") &&
            !pdCss.includes("padding-bottom: var(--sy-mb-bottom-stack"));
        check("面板高度补偿，可视行数不减少、且列表可内部滚动",
            pdCss.includes("max-height: min(calc(62vh + var(--sy-mb-bottom-stack, 0px)), 100%)") &&
            /\.sy-mb-list\s*\{[\s\S]{0,260}overflow-y: auto;/.test(pdCss));
        check("offset / safe 同期写入 :root（兄弟层与变量链可读）",
            pdSrc.includes('document.documentElement.style.setProperty("--sy-mb-offset", off)') &&
            pdSrc.includes('document.documentElement.style.setProperty("--sy-mb-safe", safeVal)'));

        /* 行为：键盘打开后 :root 上有实测值，面板定位有基准 */
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(25);
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        await wait(45);
        check(":root 已获得实测 offset / 面板层级",
            !!window.document.documentElement.style.getPropertyValue("--sy-mb-offset"),
            window.document.documentElement.style.getPropertyValue("--sy-mb-offset"));
    }

    console.log("[panel companion]");
    {
        const pcSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("键盘收起时同步关闭伴生面板，且不续锁把 IME 叫回",
            pcSrc.includes("function closeCompanionPanels()") &&
            /function applyKbHidden\(\)[\s\S]{0,240}closeCompanionPanels\(\)/.test(pcSrc) &&
            /function closeCompanionPanels\(\)[\s\S]{0,620}sheetHeldKb = false;[\s\S]{0,140}pickerHeldKb = false;/.test(pcSrc));

        /* 行为：面板是工具条的伴生物，收起键盘时应一起关闭 */
        const pcSheet = window.document.getElementById("syMobileToolbarSheet");
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        await wait(40);
        engine.actions.headingPanel();          // 不 await：由收起键盘事件来关闭
        await wait(60);
        check("标题面板可正常展开", pcSheet.classList.contains("sy-mb-open"));
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(40);
        check("收起键盘后面板随工具条一起关闭",
            !pcSheet.classList.contains("sy-mb-open"));
    }

    console.log("[vis diagnostics]");
    {
        const vdSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("显示状态翻转写入 perf.vis，并带判据",
            vdSrc.includes('InsertDiagnostics.perf.note("perf.vis"') &&
            vdSrc.includes('from: wasHidden ? "hidden" : "shown"') &&
            vdSrc.includes('to: wanted ? "shown" : "hidden"') &&
            vdSrc.includes("pending: !!pendingShow") &&
            vdSrc.includes("forceHidden: !!forceHidden"));
        check("setKb 信号翻转写入 perf.kb（含 immediate）",
            vdSrc.includes('InsertDiagnostics.perf.note("perf.kb"') &&
            vdSrc.includes("immediate: !!immediate"));
        check("面板开闭写入 perf.panel，键盘连带关闭单独标记",
            vdSrc.includes('InsertDiagnostics.perf.note("perf.panel"') &&
            vdSrc.includes('act: "close-by-keyboard"') &&
            vdSrc.includes('panel: "sheet"') && vdSrc.includes('panel: "picker"'));

        /* 行为：面板展开 + 收起键盘，日志必须真的落下 perf.panel / perf.kb */
        const vd = engine.insertDiagnostics;
        vd.setEnabled(false);
        vd.perf.setEnabled(true);
        window.dispatchEvent(new window.CustomEvent(
            "siyuan-mobile-keyboard-change", {detail: true}));
        await wait(40);
        vd.clear();
        engine.actions.headingPanel();
        await wait(60);
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(50);
        const vdText = vd.getText();
        check("日志实际产出 perf.panel / perf.kb",
            vdText.includes("perf.panel") && vdText.includes("perf.kb"),
            vdText.split("\n").slice(-4).join(" | "));
        vd.perf.setEnabled(false);
        vd.clear();
    }

    console.log("[self dialog]");
    {
        const sdSrc = fs.readFileSync(
            path.resolve(__dirname, "../src/engine/mobile-toolbar.ts"), "utf8");
        check("dialogOpen 排除插件自身三个浮层的 .b3-dialog 标记",
            sdSrc.includes("const DIALOG_OTHERS_SELECTOR =") &&
            sdSrc.includes(":not(#syMobileToolbar)") &&
            sdSrc.includes(":not(#syMobileToolbarSheet)") &&
            sdSrc.includes(":not(#syMobileToolbarPicker)") &&
            sdSrc.includes("document.querySelector(DIALOG_OTHERS_SELECTOR)"));
        check("面板切换时先关上一张（避免 Promise 挂起与续锁叠加）",
            /function showSheet\(items\)[\s\S]{0,760}if \(sheetCloser\)/.test(sdSrc) &&
            sdSrc.includes("try { prev(null); }"));
        check("延时隐藏带守卫（新面板已展开时不隐藏）",
            sdSrc.includes('if (sheet && !sheet.classList.contains("sy-mb-open"))') &&
            sdSrc.includes('if (pickerEl && !pickerEl.classList.contains("sy-mb-open"))'));
        check("perf.vis 记录判据明细",
            sdSrc.includes("inEditor: CONFIG.showOnlyInEditor ? inEditor() : null") &&
            sdSrc.includes("dialog: dialogOpen()") &&
            sdSrc.includes("menu: nativeMenuOpen()"));

        /* 行为：插件自己的 .b3-dialog 标记不得被当成思源对话框 */
        const sdSheet = window.document.getElementById("syMobileToolbarSheet");
        const sdSel = ".b3-dialog--open:not(#syMobileToolbar):not(#syMobileToolbarSheet):not(#syMobileToolbarPicker)," +
            ".b3-dialog:not(#syMobileToolbar):not(#syMobileToolbarSheet):not(#syMobileToolbarPicker)";
        sdSheet.classList.add("b3-dialog");
        check("插件自身 .b3-dialog 标记不被判为对话框",
            window.document.querySelector(sdSel) === null);
        const sdReal = window.document.createElement("div");
        sdReal.className = "b3-dialog";
        window.document.body.appendChild(sdReal);
        check("真正的思源对话框仍能被识别",
            window.document.querySelector(sdSel) === sdReal);
        sdReal.remove();
        sdSheet.classList.remove("b3-dialog");

        /* 行为：连点两次面板，第二次应先关掉第一张 */
        const sd = engine.insertDiagnostics;
        sd.setEnabled(false);
        sd.perf.setEnabled(true);
        sd.clear();
        engine.actions.headingPanel();
        await wait(60);
        engine.actions.headingPanel();
        await wait(70);
        const sdText = sd.getText();
        check("切换面板会先关闭上一张（日志有 close 也有 open）",
            sdText.includes('"act":"close"') && sdText.includes('"act":"open"'),
            sdText.split("\n").slice(-5).join(" | "));
        sd.perf.setEnabled(false);
        sd.clear();
        window.dispatchEvent(new window.CustomEvent("siyuan-mobile-keyboard-hiding"));
        await wait(40);
    }

    console.log("[version stamp]");
    {
        const vs = engine.insertDiagnostics;
        vs.setVersion("9.9.9-test");
        const vsText = vs.getText();
        check("日志头部打印插件版本",
            vsText.includes("# 插件版本: 9.9.9-test"),
            vsText.split("\n").slice(0, 4).join(" | "));
        vs.setVersion("");
        check("未注入版本时显示 unknown",
            vs.getText().includes("# 插件版本: unknown"));
    }

    console.log("[v1 defaults]");
    {
        const v1 = fs.readFileSync(path.resolve(__dirname, "../src/index.ts"), "utf8");
        const d1 = engine.insertDiagnostics;
        check("诊断与性能采样默认关闭（引擎层）",
            d1.isEnabled() === false && d1.perf.isEnabled() === false);
        check("配置默认值为 false，且 0.x 升级到 1.0.0 时强制关闭一次",
            v1.includes("let insertDiagnostics = false;") &&
            v1.includes("let perfDiagnostics = false;") &&
            /prevVersion\.startsWith\("0\."\)[\s\S]{0,120}insertDiagnostics = false;[\s\S]{0,80}perfDiagnostics = false;/.test(v1));
        check("配置保存写入 version，供后续迁移判断",
            v1.includes("version: PLUGIN_VERSION"));
        const mani = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../plugin.json"), "utf8"));
        check("清单作者地址为仓库地址、版本为 1.0.1",
            mani.url === "https://github.com/Clymer-git/siyuan-plugin-BlockBar" &&
            mani.version === "1.0.1");
        // 集市检查规则：backends/frontends 若含 "all" 则不能再混入具体值
        const mixedAll = ["kernels", "backends", "frontends"].filter((k) =>
            Array.isArray(mani[k]) && mani[k].includes("all") && mani[k].length > 1);
        check("清单平台字段不与 all 混用",
            mixedAll.length === 0);
        // 无 kernel.js：不声明 kernels（文档：缺失时不启动内核插件，前端仍可用）
        check("无内核插件，不声明 kernels",
            !("kernels" in mani) ||
            !Array.isArray(mani.kernels) || mani.kernels.length === 0);
        check("后端环境与系统无关，写 all",
            JSON.stringify(mani.backends) === JSON.stringify(["all"]));
        // 插件面向移动端：移动应用 + 移动端浏览器
        check("清单前端限定为移动端（应用 + 浏览器）",
            JSON.stringify(mani.frontends) === JSON.stringify(["mobile", "browser-mobile"]));
    }

    console.log("[settings entry]");
    engine.setSettingsEntry(true);
    await wait(60);
    check("设置齿轮出现", !!bar.querySelector(".sy-mb-btn--entry"));

    console.log("[destroy]");
    engine.destroy();
    await wait(60);
    check("卸载后无残留", !window.document.getElementById("syMobileToolbar"));

    try { fs.unlinkSync(bundle); } catch (e) { /* ignore */ }
    console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
    process.exit(failed ? 1 : 0);
})();
