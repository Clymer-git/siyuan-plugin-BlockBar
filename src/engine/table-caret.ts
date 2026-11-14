/* =============================================================================
 * 表格光标记忆（从原「表格动作层」中剥离出来的最小必要部分）
 *
 * 表格工具栏已随思源 3.8.8 的原生表格增强而移除，但**光标在单元格里不丢**仍是
 * 本插件的核心行为：内核重渲染表格块后，document.activeElement 会掉回 body，
 * 键盘随之收起。这里按「块 id + 行/列索引」记住光标位置，重渲染后从新 DOM 找回。
 *
 * 无依赖、不持有 DOM、不读全局工具条状态。
 * ========================================================================== */

export function createTableCaret() {

    /** 单元格在其所在行里的「列号」（colspan 累计），找不到返回 -1 */
    function cellColIndex(td) {
        if (!td || !td.parentElement) return -1;
        const kids = td.parentElement.children;
        let idx = 0;
        for (let i = 0; i < kids.length; i++) {
            if (kids[i] === td) return idx;
            const span = parseInt(kids[i].getAttribute("colspan") || "1", 10);
            idx += (isFinite(span) && span > 0) ? span : 1;
        }
        return -1;
    }

    function placeCaretIn(cell) {
        if (!cell) return;
        try {
            const sel = window.getSelection();
            if (!sel) return;
            const r = document.createRange();
            r.selectNodeContents(cell);
            r.collapse(true);
            sel.removeAllRanges();
            sel.addRange(r);
        } catch (e) { /* ignore */ }
    }

    let lastTableCaret = null;

    function rememberTableCaret(cell) {
        /* v0.8.36：先归一化到真正的 TD/TH —— 调用方传的可能是单元格**内部**的
           contenteditable DIV（记忆来自 realEditableUp 的最深输入点），直接拿它的
           parentElement 当 TR 会把「列号」算成「行号」，tableCaretCell 找回错行。 */
        cell = cell && cell.closest ? (cell.closest("td,th") || cell) : cell;
        const tbl = cell && cell.closest ? cell.closest('[data-type="NodeTable"]') : null;
        const tr = cell ? cell.parentElement : null;
        if (!tbl || !tr || !tr.parentElement) return;
        const id = tbl.getAttribute("data-node-id");
        if (!id) return;
        const rows = tr.parentElement.rows || tr.parentElement.children;
        let row = -1;
        for (let i = 0; i < rows.length; i++) { if (rows[i] === tr) { row = i; break; } }
        if (row < 0) return;
        lastTableCaret = { id: id, row: row, col: cellColIndex(cell), at: Date.now() };
    }

    function tableCaretCell() {
        const m = lastTableCaret;
        if (!m || Date.now() - m.at > 6000) return null;
        let tbl = null;
        try {
            tbl = document.querySelector('.protyle-wysiwyg [data-type="NodeTable"][data-node-id="' + m.id + '"]');
        } catch (e) { return null; }
        if (!tbl) return null;
        const table = tbl.querySelector("table");
        if (!table || !table.rows) return null;
        const tr = table.rows[m.row];
        if (!tr || !tr.cells || !tr.cells.length) return null;
        const cell = (m.col >= 0 && m.col < tr.cells.length) ? tr.cells[m.col] : tr.cells[0];
        if (!cell) return null;
        /* 只有「选区确实已经丢了」才顺手设光标 —— 焦点还在时绝不插手 */
        try {
            const sel = window.getSelection();
            const gone = !sel || !sel.rangeCount ||
                !sel.getRangeAt(0).startContainer ||
                !sel.getRangeAt(0).startContainer.isConnected;
            if (gone) placeCaretIn(cell);
        } catch (e) { /* ignore */ }
        return cell;
    }

    return {
        cellColIndex,
        placeCaretIn,
        rememberTableCaret,
        tableCaretCell,
    };
}
