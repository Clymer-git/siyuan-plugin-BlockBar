/* =============================================================================
 * 思源图标适配层（动态发现 + 版本适配）
 *
 * 这里集中管理「按钮/面板图标」的唯一来源，业务代码不再散落 iconH1、iconTable 之类的
 * 硬编码字符串。分三层：
 *   1. SY_ICON        —— 语义 key → 思源 symbol id（版本升级只需要动这一张表）
 *   2. 动态发现        —— hasSymbol() 运行时探测 symbol 是否已注入 / 当前主题是否提供，
 *                        注入后由引擎的 rebuildIcons() 自动重刷，无需插件更新
 *   3. FALLBACK_ICON  —— 旧插件已构造好的矢量兜底图标（思源没有对应 symbol、
 *                        或 symbol 尚未注入时使用，保证任何情况下都不出现文字占位）
 *
 * 新增思源图标时若能与既有语义对应，只需在 SY_ICON 里加一行；探测与回退自动生效。
 * ========================================================================== */
    /* ==================================================== 图标 ============ */
    /* 思源 symbol id —— 与 keyboardToolbar.ts 的斜杠菜单保持一致 */
    export const SY_ICON = {
        // 标题面板按钮（面板内逐项用 iconH1~iconH6）
        heading: "iconH1",
        h1: "iconH1", h2: "iconH2", h3: "iconH3",
        h4: "iconH4", h5: "iconH5", h6: "iconH6",
        // 列表面板按钮（面板内用 iconList / iconOrderedList / iconCheck）
        list: "iconList",
        // 官方「插入资产」项：value + '<input type="file" multiple>'，图标即 iconDownload
        asset: "iconDownload",
        image: "iconImage",
        file: "iconDownload",
        task: "iconCheck",
        ul: "iconList",
        ol: "iconOrderedList",
        quote: "iconQuote",
        callout: "iconCallout",
        table: "iconTable",
        database: "iconDatabase",
        tabs: "iconTabs",
        code: "iconCode",
        html: "iconHTML5",
        math: "iconMath",
        mindmap: "iconMindmap",
        // 日期 / 时间面板项：思源内置 symbol（litheness/icon.js 自带）
        date: "iconCalendar",
        time: "iconClock",
        // 官方没有「日历 + 时钟」组合 symbol；id 故意取不存在的值，
        // 让工具条按钮稳定走下方同风格的自绘线条图标
        datetime: "iconCalendarClock",
        template: "iconMarkdown",
        /* —— 0.5.0 新增：与截图「块功能面板」逐项对齐 ——
           key 既用于按钮/面板子项的默认图标，也是动作 id 的一部分。 */
        widget: "iconBoth",            // 挂件
        assets: "iconImage",           // 资源
        ref: "iconRef",                // 引用
        embed: "iconSQL",              // 嵌入块
        ai: "iconSparkles",            // AI 编写
        subDoc: "iconFile",            // 新建子文档并引用
        photo: "iconCamera",           // 拍照并插入
        iframe: "iconGlobe",           // 插入 Iframe 链接
        imgUrl: "iconImage",           // 插入图片链接
        videoUrl: "iconVideo",         // 插入视频链接
        audioUrl: "iconRecord",        // 插入音频链接
        emoji: "iconEmoji",            // 表情
        superBlock: "iconSuper",       // 超级块
        splitLR: "iconSplitLR",        // 横向超级块（左右分栏）
        splitTB: "iconSplitTB",        // 纵向超级块（上下分栏）
        line: "iconLine",              // 分割线
        // 图表族：官方斜杠面板这几项没有图标（getSlashItem 传空串），
        // 这里挑语义最接近、且 litheness 里确实存在的线条图标，保证面板不出现空白格
        staff: "iconCode",
        chart: "iconLayoutGrid",
        flowchart: "iconSplitTB",
        graphviz: "iconListTree",
        mermaid: "iconAtom",
        uml: "iconTerminal",
        /* v0.8.16：工具栏末尾「设置入口」的齿轮（渲染在 buildButtonItems 末尾）。
           litheness 自带 iconSettings，启动期 symbol 未注入时用下方自绘兜底。 */
        gear: "iconSettings"
    };

    /* 内置样式的「A」色块（icon: "style:info" 之类）：
       与官方键盘工具条 <div style="color:var(--b3-card-*-color);background-color:…">A</div>
       同一套配色变量，日/夜/第三方主题自动跟随。 */
    export const STYLE_KINDS = ["info", "success", "warning", "error"];

    export function styleGlyph(kind) {
        const k = STYLE_KINDS.indexOf(kind) >= 0 ? kind : "";
        const style = k
            ? ' style="color: var(--b3-card-' + k + '-color);' +
              "background-color: var(--b3-card-" + k + "-background);\""
            : "";
        return '<span class="sy-mb-glyph sy-mb-glyph--style">' +
               '<i class="sy-mb-glyph-a"' + style + ">A</i></span>";
    }

    /* 思源自带「插入块 / 插入资产 / 块类型」的全部图标 —— 逐行对照官方源码：
       · app/src/mobile/util/keyboardToolbar.ts:369-413（移动端键盘工具条的斜杠面板，
         即「工具条上插入块」的实际入口）
       · app/src/editor/getIcon.ts（块类型 → 图标 的权威映射）
       顺序照抄斜杠面板：先块类型，再插入类。图标选择器直接吃这份清单，
       保证自定义按钮能选到思源内置的全部插入块类型，而不是只有少数几个。 */
    export const BLOCK_ICONS = [
        // —— 块类型（斜杠面板第三组 + getIcon.ts）——
        { id: "iconParagraph", label: "段落" },
        { id: "iconHeadings", label: "标题" },
        { id: "iconH1", label: "一级标题" },
        { id: "iconH2", label: "二级标题" },
        { id: "iconH3", label: "三级标题" },
        { id: "iconH4", label: "四级标题" },
        { id: "iconH5", label: "五级标题" },
        { id: "iconH6", label: "六级标题" },
        { id: "iconList", label: "无序列表" },
        { id: "iconOrderedList", label: "有序列表" },
        { id: "iconCheck", label: "任务列表" },
        { id: "iconListItem", label: "列表项" },
        { id: "iconQuote", label: "引述块" },
        { id: "iconCallout", label: "提示块" },
        { id: "iconCode", label: "代码块" },
        { id: "iconTable", label: "表格" },
        { id: "iconLine", label: "分割线" },
        { id: "iconMath", label: "公式块" },
        { id: "iconHTML5", label: "HTML 块" },
        { id: "iconDatabase", label: "数据库" },
        { id: "iconSuper", label: "超级块" },
        { id: "iconSplitLR", label: "横向超级块" },
        { id: "iconSplitTB", label: "纵向超级块" },
        { id: "iconSQL", label: "块嵌入" },
        { id: "iconBoth", label: "挂件" },
        { id: "iconGlobe", label: "网页 / Iframe" },
        { id: "iconImage", label: "图片" },
        { id: "iconVideo", label: "视频" },
        { id: "iconRecord", label: "音频" },
        { id: "iconCamera", label: "拍照" },
        { id: "iconDownload", label: "资源 / 附件" },
        { id: "iconFile", label: "文档" },
        // —— 图表语言（斜杠面板第四组没有图标，这里给最贴近的线条图标）——
        { id: "iconLayoutGrid", label: "图表" },
        { id: "iconListTree", label: "Graph" },
        { id: "iconAtom", label: "Mermaid" },
        { id: "iconTerminal", label: "UML" },
        // —— 数据库视图（getIcon.ts / 斜杠面板 database*View）——
        { id: "iconBoard", label: "看板视图" },
        { id: "iconGallery", label: "卡片视图" },
        // —— 插入类（斜杠面板第一组）——
        { id: "iconRef", label: "引用" },
        { id: "iconEmoji", label: "表情" },
        { id: "iconSparkles", label: "AI 书写" },
        { id: "iconMarkdown", label: "模板" },
        { id: "iconTags", label: "标签" },
        { id: "iconCalendar", label: "日期" },
        { id: "iconClock", label: "时间" },
        // —— 行级格式（键盘工具条 inline 动作同款图标）——
        { id: "iconLink", label: "链接" },
        { id: "iconBold", label: "粗体" },
        { id: "iconItalic", label: "斜体" },
        { id: "iconUnderline", label: "下划线" },
        { id: "iconStrike", label: "删除线" },
        { id: "iconMark", label: "高亮" },
        { id: "iconSup", label: "上标" },
        { id: "iconSub", label: "下标" },
        { id: "iconInlineCode", label: "行级代码" },
        { id: "iconKeymap", label: "键盘" },
        { id: "iconTag", label: "标签（行级）" }
    ];

    /* 思源 symbol 尚未注入、或主题换了图标包缺某个 id 时的兜底图标。
       ── 0.5.0 关键修复 ────────────────────────────────────────────────────────
       旧版这里用 textGlyph 画 "H" / "H1"…"H6" / "Σ" / 有序列表的 "1 2 3"，
       这些 <text> 节点在 symbol 取不到时会**直接露出字面文字**，也就是用户看到的
       「出现的不是图标，而是文字」。现在全部换成思源 litheness 里的真实矢量路径
       （逐条抄自 app/appearance/icons/litheness/icon.js），任何情况下都不会变成文字。
       只有思源本身没有对应 symbol 的三项（页签 / 思维导图 / 日期时间）保留自绘线条图标。 */
    export const FALLBACK_ICON = {
        // —— 标题（iconHeadings / iconH1 ~ iconH6）——
        heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
        h1: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/>',
        h2: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/>' +
            '<path d="M21 18h-4c0-4 4-3 4-6 0-1.5-2-2.5-4-1"/>',
        h3: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/>' +
            '<path d="M17.5 10.5c1.7-1 3.5 0 3.5 1.5a2 2 0 0 1-2 2"/>' +
            '<path d="M17 17.5c2 1.5 4 .3 4-1.5a2 2 0 0 0-2-2"/>',
        h4: '<path d="M12 18V6"/><path d="M17 10v3a1 1 0 0 0 1 1h3"/><path d="M21 10v8"/>' +
            '<path d="M4 12h8"/><path d="M4 18V6"/>',
        h5: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="M17 13v-3h4"/>' +
            '<path d="M17 17.7c.4.2.8.3 1.3.3 1.5 0 2.7-1.1 2.7-2.5S19.8 13 18.3 13H17"/>',
        h6: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/>' +
            '<circle cx="19" cy="16" r="2"/><path d="M20 10c-2 2-3 3.5-3 6"/>',
        // —— 列表（iconList / iconOrderedList / iconCheck）——
        list: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/>' +
              '<path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
        ul: '<path d="M3 5h.01"/><path d="M3 12h.01"/><path d="M3 19h.01"/>' +
            '<path d="M8 5h13"/><path d="M8 12h13"/><path d="M8 19h13"/>',
        ol: '<path d="M11 5h10"/><path d="M11 12h10"/><path d="M11 19h10"/><path d="M4 4h1v5"/>' +
            '<path d="M4 9h2"/>' +
            '<path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/>',
        task: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m9 12 2 2 4-4"/>',
        // —— 块类型 ——
        quote: '<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 ' +
               '1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>' +
               '<path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 ' +
               '1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>',
        callout: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8' +
                 'c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>' +
                 '<path d="M9 18h6"/><path d="M10 22h4"/>',
        table: '<path d="M12 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/>' +
               '<path d="M3 9h18"/><path d="M3 15h18"/>',
        database: '<ellipse cx="12" cy="5" rx="9" ry="3"/>' +
                  '<path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
        code: '<path d="m10 9-3 3 3 3"/><path d="m14 15 3-3-3-3"/>' +
              '<rect x="3" y="3" width="18" height="18" rx="2"/>',
        // HTML 块：官方 iconHTML5 是填充式、viewBox 也不同，这里保持同风格自绘的 <H>
        html: '<path d="M7.4 6.6 3.6 12l3.8 5.4"/><path d="M16.6 6.6 20.4 12l-3.8 5.4"/>' +
              '<path d="M9.8 8.8v6.4M14.2 8.8v6.4M9.8 12h4.4"/>',
        // 公式块 / 行级公式：思源 iconMath 的真实路径（不再是 Σ 文字）
        math: '<path d="M18 7V5a1 1 0 0 0-1-1H6.5a.5.5 0 0 0-.4.8l4.5 6a2 2 0 0 1 0 2.4' +
              'l-4.5 6a.5.5 0 0 0 .4.8H17a1 1 0 0 0 1-1v-2"/>',
        line: '<path d="M5 12h14"/>',
        superBlock: '<rect x="3" y="3" width="18" height="7" rx="1"/>' +
                    '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
                    '<rect x="14" y="14" width="7" height="7" rx="1"/>',
        // 横向超级块 / 纵向超级块：抄官方 gutter 菜单用的 iconSplitLR / iconSplitTB
        splitLR: '<path d="M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3"/>' +
                 '<path d="M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3"/>' +
                 '<path d="M12 4v16"/>',
        splitTB: '<path d="M5 8V5c0-1 1-2 2-2h10c1 0 2 1 2 2v3"/>' +
                 '<path d="M19 16v3c0 1-1 2-2 2H7c-1 0-2-1-2-2v-3"/>' +
                 '<path d="M4 12h16"/>',
        // —— 插入类 ——
        image: '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
               '<circle cx="9" cy="9" r="2"/>' +
               '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
        // 资源 / 插入图片链接 与「图片」同一族，直接复用同一条路径
        assets: '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
                '<circle cx="9" cy="9" r="2"/>' +
                '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
        imgUrl: '<rect x="3" y="3" width="18" height="18" rx="2"/>' +
                '<circle cx="9" cy="9" r="2"/>' +
                '<path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
        file: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706' +
              'l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>' +
              '<path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
        // 新建子文档并引用 与「文档」同族
        subDoc: '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706' +
                'l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/>' +
                '<path d="M14 2v5a1 1 0 0 0 1 1h5"/>',
        // 官方「插入资产」同义：托盘 + 向下箭头（图片或文件）
        asset: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
               '<path d="m7 10 5 5 5-5"/>',
        photo: '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2' +
               'v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048' +
               'l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
        ref: '<circle cx="6" cy="19" r="3"/>' +
             '<path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>' +
             '<circle cx="18" cy="5" r="3"/>',
        embed: '<path d="M19 3a2 2 0 0 1 2 2"/><path d="M21 19a2 2 0 0 1-2 2"/>' +
               '<path d="M5 21a2 2 0 0 1-2-2"/><path d="M5 3a2 2 0 0 0-2 2"/>' +
               '<path d="M7 12h10"/><path d="M7 16h6"/><path d="M7 8h8"/>',
        ai: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72' +
            'l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/>' +
            '<path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/>' +
            '<path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
        emoji: '<circle cx="12" cy="12" r="10"/>' +
               '<path d="M8 14s1.5 2 4 2 4-2 4-2"/>' +
               '<path d="M9 9h.01"/><path d="M15 9h.01"/>',
        widget: '<path d="M19.5 7a24 24 0 0 1 0 10"/><path d="M4.5 7a24 24 0 0 0 0 10"/>' +
                '<path d="M7 19.5a24 24 0 0 0 10 0"/><path d="M7 4.5a24 24 0 0 1 10 0"/>' +
                '<rect x="17" y="17" width="5" height="5" rx="1"/>' +
                '<rect x="17" y="2" width="5" height="5" rx="1"/>' +
                '<rect x="2" y="17" width="5" height="5" rx="1"/>' +
                '<rect x="2" y="2" width="5" height="5" rx="1"/>',
        iframe: '<circle cx="12" cy="12" r="10"/>' +
                '<path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/>' +
                '<path d="M2 12h20"/>',
        videoUrl: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432' +
                  'L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
        audioUrl: '<path d="M12 19v3"/>' +
                  '<path d="M19 10v2a7 7 0 0 1-14 0v-2"/>' +
                  '<rect x="9" y="2" width="6" height="13" rx="3"/>',
        template: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
                  '<path d="M7 15v-6l2 2 2-2v6"/><path d="M14 13l2 2 2-2m-2 2v-6"/>',
        // —— 图表族（官方面板这几项本来就没有图标，这里用近义线条图标兜底）——
        staff: '<path d="m10 9-3 3 3 3"/><path d="m14 15 3-3-3-3"/>' +
               '<rect x="3" y="3" width="18" height="18" rx="2"/>',
        chart: '<path d="M12 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/>' +
               '<path d="M3 9h18"/><path d="M3 15h18"/>',
        flowchart: '<path d="M5 8V5c0-1 1-2 2-2h10c1 0 2 1 2 2v3"/>' +
                   '<path d="M19 16v3c0 1-1 2-2 2H7c-1 0-2-1-2-2v-3"/>' +
                   '<path d="M4 12h16"/>',
        graphviz: '<path d="M8 19H5c-1 0-2-1-2-2V7c0-1 1-2 2-2h3"/>' +
                  '<path d="M16 5h3c1 0 2 1 2 2v10c0 1-1 2-2 2h-3"/>' +
                  '<path d="M12 4v16"/>',
        mermaid: '<circle cx="12" cy="12" r="1"/>' +
                 '<path d="M20.2 20.2c2.04-2.03.02-7.36-4.5-11.9-4.54-4.52-9.87-6.54-11.9-4.5' +
                 '-2.04 2.03-.02 7.36 4.5 11.9 4.54 4.52 9.87 6.54 11.9 4.5Z"/>' +
                 '<path d="M15.7 15.7c4.52-4.54 6.54-9.87 4.5-11.9-2.03-2.04-7.36-.02-11.9 4.5' +
                 '-4.52 4.54-6.54 9.87-4.5 11.9 2.03 2.04 7.36.02 11.9-4.5Z"/>',
        uml: '<path d="m7 11 2-2-2-2"/><path d="M11 13h4"/>' +
             '<rect x="3" y="3" width="18" height="18" rx="2"/>',
        // —— 日期 / 时间（逐字抄 iconCalendar / iconClock）——
        date: '<path d="M8 2v4"/><path d="M16 2v4"/>' +
              '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18"/>',
        time: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
        // —— 思源没有对应 symbol 的三项：自绘线条图标 ——
        // 页签：窗口 + 顶部两个页签
        tabs: '<rect x="3" y="5.6" width="18" height="13.8" rx="2.4"/>' +
              '<path d="M3 10.2h18"/><path d="M8.4 10.2V5.6M15.6 10.2V5.6"/>',
        // 思维导图：中心节点 + 两个分支
        mindmap: '<circle cx="5.2" cy="12" r="2.2"/><circle cx="18.4" cy="6.6" r="1.8"/>' +
                 '<circle cx="18.4" cy="17.4" r="1.8"/>' +
                 '<path d="M7.4 12h3.9M11.3 12l5.3-4M11.3 12l5.3 4"/>',
        // 日期时间：日历 + 时钟组合（官方无线条组合 symbol，按二者线条风格自绘；
        // 时钟底填工具条底色，压住日历左下角，与参考图一致）
        datetime: '<path d="M10.4 1.6v2.6M16 1.6v2.6"/>' +
                  '<rect x="5.6" y="3.4" width="15" height="15.6" rx="2.4"/>' +
                  '<path d="M5.6 8.4h15"/>' +
                  '<circle cx="7.2" cy="16.2" r="5.8" fill="var(--b3-theme-background, #fff)"/>' +
                  '<path d="M7.2 13.8v2.4l1.9 1.5"/>',
        // 齿轮（v0.8.16 工具栏末尾「设置入口」）：逐字抄官方 iconSettings，
        // symbol 未注入时与真图标视觉一致，注入后自动换真（SY_ICON.gear）
        gear: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 ' +
              '2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 ' +
              '2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 ' +
              '2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 ' +
              '2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>'
    };

    export const LINE_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

    export const symbolCache = {};

    export function hasSymbol(id) {
        if (Object.prototype.hasOwnProperty.call(symbolCache, id)) {
            return symbolCache[id];
        }
        let hit = false;
        try {
            const el = document.getElementById(id);
            hit = !!el && (el.tagName.toLowerCase() === "symbol" ||
                           el.tagName.toLowerCase() === "svg" ||
                           el.tagName.toLowerCase() === "g");
        } catch (e) { /* ignore */ }
        symbolCache[id] = hit;
        return hit;
    }

    export function clearSymbolCache() {
        Object.keys(symbolCache).forEach((k) => { delete symbolCache[k]; });
    }

    /* 思源 symbol：<svg><use xlink:href="#iconX"></use></svg> */
    export function syIcon(id) {
        return '<svg class="sy-mb-icon"><use xlink:href="#' + id + '"></use></svg>';
    }

    export function lineIcon(path) {
        return '<svg class="sy-mb-icon sy-mb-icon--line" ' + LINE_ATTRS + ">" + path + "</svg>";
    }

    /* symbol 尚未注入时先用内置图标，之后 rebuildIcons() 会替换成思源图标 */
    export function iconHTML(key, fallbackKey?) {
        const id = SY_ICON[key];
        if (useSiyuanIcons && id && hasSymbol(id)) {
            return syIcon(id);
        }
        return lineIcon(FALLBACK_ICON[fallbackKey || key] || "");
    }

/** symbol 是否真的存在于当前页面（作用域缓存在 symbolCache 里，clearSymbolCache 可失效） */
export const iconAvailable = (id) => hasSymbol(id);

/** 由引擎在配置变化时同步（CONFIG.useSiyuanIcons） */
export function setUseSiyuanIcons(on) {
    useSiyuanIcons = on !== false;
}

export let useSiyuanIcons = true;
