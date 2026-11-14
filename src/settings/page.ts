/**
 * 移动端快捷工具栏 —— 自定义按钮设置面板（v0.4，触控优先重构）
 *
 * 设计目标：这是装在手机上的设置页，一切以「手指好点、好拖」为先。
 *   · 每个按钮是一张较大的卡片：左侧拖拽手柄（按住拖动即可排序）、开关、图标、名称；
 *     点卡片中部即展开/收起编辑区，不再用箭头做上下移。
 *   · 排序用指针拖拽（pointer events），同时兼容触屏与鼠标；拖动时实时插位，松手落定。
 *   · 面板类型按钮可在展开区里继续编辑「面板内容」子按钮，子按钮同样可拖拽排序。
 *   · 类型选择用分段按钮（大点区），内置动作用原生 select（手机端会弹系统选择器）。
 */
import { Dialog, confirm, showMessage, getFrontend } from "siyuan";
import MobileToolbar from "../engine/mobile-toolbar";
import {InsertDiagnostics} from "../engine/insert-diagnostics";
import "../styles/settings.css";

export type TButtonType = "panel" | "builtin" | "popup" | "setting";

export interface IPopupOption {
    name: string;
    value: string;
}

export interface IButtonConfig {
    id: string;
    name: string;
    type: TButtonType;
    builtinId?: string;
    settingId?: string;
    children?: IButtonConfig[];
    options?: IPopupOption[];
    icon: string;
    tip: string;
    enabled: boolean;
}

/** 插件数据里保存自定义按钮所用的键 */
export const STORAGE_KEY = "buttons";

/** 数据层允许出现在工具条顶层的全部类型（面板是容器，只出现在顶层） */
const TOP_TYPES: TButtonType[] = ["panel", "builtin", "popup", "setting"];
/** 面板子项只能是下面这三种「叶子行为」，面板不能嵌套面板 */
const CHILD_TYPES: TButtonType[] = ["builtin", "popup", "setting"];
/**
 * 编辑页里作为「叶子行为」呈现的三种类型。
 *
 * 「面板」**不在此列**：它的层级高于这些行为 —— 面板是**容器**，不是一种行为。
 * 由编辑页顶部的「面板」开关单独控制（见 modeRow）：开启即变成可装子项的容器，
 * 关闭则回到这三种直接行为之一。这样面板就不再和动作 / 设置 / 快捷短语平起平坐，
 * 用户也不会把「容器」误当成「又一件可以点的事」。
 *
 * 「设置」是 v0.8.12 新增的第三种行为：点击后打开思源的某个设置页（外观 / 编辑器 /
 * 云端 / 导出 / 关于 / 插件集市 …），与「动作」「快捷短语」平级，可自由添加。
 *
 * 注：v0.8.4 移除了「快捷键」类型（思源移动端没有快捷键体系）；v0.8.5 移除了「内容」
 * 类型，并把「弹选」改名为「快捷短语」—— 单独插入一段固定文字完全可以由只含一条选项的
 * 快捷短语承担，不必再单列一种类型。
 */
const LEAF_TYPES: TButtonType[] = ["builtin", "popup", "setting"];
/** 新建子项时三种行为各自的默认图标（都能在思源里渲染出来，不会出现空白格） */
const CHILD_DEFAULT_ICON: Record<TButtonType, string> = {
    panel: "iconList",
    builtin: "iconList",
    popup: "iconList",
    setting: "iconSettings"
};
const TYPE_LABELS: Record<TButtonType, string> = {
    panel: "面板",
    builtin: "动作",
    popup: "快捷短语",
    setting: "设置"
};

/** 类型卡片上的图形：用具象图形代替抽象名词，一眼看懂「点了会发生什么」 */
const TYPE_ICONS: Record<TButtonType, string> = {
    panel: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/></svg>',
    builtin: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h9"/><path d="M11 8l4 4-4 4"/></svg>',
    popup: '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="4" y="5" width="16" height="3" rx="1"/><rect x="4" y="10.5" width="16" height="3" rx="1"/><rect x="4" y="16" width="16" height="3" rx="1"/></svg>',
    setting: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9 19 19M19 5l-2.1 2.1M7.1 16.9 5 19"/></svg>'
};

/** 类型卡片副标题：一句话说明行为，≤5 字 */
const TYPE_DESC: Record<TButtonType, string> = {
    panel: "弹出子菜单",
    builtin: "直接执行",
    popup: "短语列表",
    setting: "打开设置"
};

/**
 * 插件自研动作（v0.8.6）：日期 / 时间 / 日期时间面板不是思源官方斜杠菜单里的条目，
 * 是本插件自己开发的功能 —— 用户明确要求它们**保持原有可编辑行**（可改名 / 换图标），
 * 不参与「官方动作行」的统一化；其余内置动作子项一律用思源的图标与名字展示。
 */
const SELF_ACTIONS: string[] = ["date", "time", "datetimePanel"];

/**
 * 新建按钮的初始图标（v0.8.9）。
 *
 * 新按钮**不预置任何动作**，所以图标也不能跟着某个动作走；用一个中性列表图标占位，
 * 用户挑完动作后自动换成该动作的官方图标（仅当图标仍是这个初始值时才换，
 * 用户自己挑过的图标一律尊重）。
 */
const NEW_BUTTON_ICON = "iconList";

/** 图标选择器里额外提供的常用思源 symbol */
const EXTRA_ICONS = [
    "iconAdd", "iconEdit", "iconTrashcan", "iconStar", "iconTags", "iconLink",
    "iconRef", "iconFile", "iconRefresh", "iconSearch", "iconCopy", "iconSettings",
    "iconEmoji", "iconCamera", "iconBug", "iconLightbulb", "iconShorthandNonCurr",
    "iconSplitRight", "iconSplitUp", "iconLayout", "iconDown", "iconUp",
    "iconRight", "iconLeft", "iconContract", "iconExpand", "iconMenuItem"
];

/** 工具条可见按钮数上限：固定 9，与系统键盘工具条一致（超过即横向滑动查看） */
const MAX_VISIBLE = 9;

function uid(prefix: string): string {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escHtml(s: string): string {
    return String(s).replace(/[&<>"]/g, (c) => (
        { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string
    ));
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
}

function symbolExists(id: string): boolean {
    try {
        const el = document.getElementById(id);
        return !!el && /^(symbol|svg|g)$/i.test(el.tagName);
    } catch (e) {
        return false;
    }
}

/* --------------------------------------------------------------- 数据清洗 */

/** 把任意来源（存储 / 导入 JSON）洗成合法按钮列表；返回 null 表示数据根本不是按钮列表 */
export function sanitizeButtons(input: any): IButtonConfig[] | null {
    if (!Array.isArray(input)) return null;
    return sanitizeList(input, true);
}

function sanitizeList(list: any[], topLevel: boolean): IButtonConfig[] | null {
    const opts: any = (MobileToolbar as any).builtinOptions
        ? (MobileToolbar as any).builtinOptions()
        : { leaf: [], panel: [] };
    const leafIds = new Set((opts.leaf || []).map((o: any) => o.value));
    const panelIds = new Set((opts.panel || []).map((o: any) => o.value));

    const out: IButtonConfig[] = [];
    list.forEach((raw: any) => {
        if (!raw || typeof raw !== "object") return;
        /* v0.8.9：显式写了一个**不认识**的类型 = 坏数据，直接丢弃。
           此前会 fallback 成 builtin，而 v0.8.9 起「builtinId 为空」是合法的待选状态，
           于是「type:bogus」这种脏数据会被当成待选按钮混进配置（导入时计数对不上）。 */
        /* v0.8.68：旧配置里的 type:"table"（表格工具栏）在此被判为不认识的类型，
           随保存自动淘汰 —— 表格工具栏已移除，不保留半死的配置项。 */
        const known = TOP_TYPES.indexOf(raw.type) >= 0;
        if (raw.type !== undefined && raw.type !== null && String(raw.type) !== "" && !known) return;
        const type: TButtonType = known ? raw.type : "builtin";
        if (type === "panel" && !topLevel) return; // 面板只能挂在工具条顶层

        if (type === "builtin") {
            const bid = String(raw.builtinId || "");
            /* v0.8.9：新建按钮默认「还没选动作」，builtinId 为空是**合法的待选状态**，
               必须保留这个按钮（否则用户没配完就被清掉，前面的设置全白做）。
               非空时才校验它确实是已知动作 —— 未知 id 属于坏数据，丢弃。
               注意「允许为空」只对显式 type:"builtin" 成立：类型缺失/无法识别的条目
               即使builtinId 为空也是脏数据（见上面的类型校验）。 */
            if (!bid) {
                if (raw.type !== "builtin") return;
            } else if (!leafIds.has(bid) && !panelIds.has(bid)) return;
        } else if (type === "popup") {
            if (!raw.options || !raw.options.length) return;
        } else if (type === "setting") {
            /* 「设置」：settingId 为空是合法的待选状态（只对显式 type:"setting" 成立）。
               v0.8.13 起选项清单来自真机主菜单 DOM 的**动态枚举**（随宿主版本变化），
               不做静态成员校验——在这里校验会把「换台设备/换个思源版本后仍有效或
               至少无害」的已配置项直接清掉，属于数据丢失。执行端自有降级与提示。 */
            if (!raw.settingId) {
                if (raw.type !== "setting") return;
            }
        }

        const item: IButtonConfig = {
            id: String(raw.id || uid("btn")),
            name: String(raw.name || ""),
            type: type,
            icon: raw.icon === undefined || raw.icon === null ? "" : String(raw.icon),
            tip: String(raw.tip || ""),
            enabled: raw.enabled !== false
        };
        if (type === "builtin") item.builtinId = String(raw.builtinId);
        else if (type === "popup") {
            item.options = (raw.options || []).map((o: any) => ({
                name: String((o && o.name) || ""),
                value: String((o && (o.value !== undefined ? o.value : "")) || "")
            })).filter((o: IPopupOption) => (o.name || o.value));
        } else if (type === "panel") {
            item.children = Array.isArray(raw.children)
                ? (sanitizeList(raw.children, false) || [])
                : [];
        } else if (type === "setting") {
            item.settingId = String(raw.settingId);
        }
        out.push(item);
    });
    return out;
}

/** 「名称|内容」多行文本 ⇄ 选项数组 */
function optionsToText(options?: IPopupOption[]): string {
    return (options || []).map((o) => (o.name === o.value ? o.name : o.name + "|" + o.value)).join("\n");
}

function textToOptions(text: string): IPopupOption[] {
    return String(text || "").split("\n").map((line) => {
        const i = line.indexOf("|");
        if (i < 0) return { name: line.trim(), value: line.trim() };
        return { name: line.slice(0, i).trim(), value: line.slice(i + 1) };
    }).filter((o) => (o.name || o.value));
}

/* ----------------------------------------------------------------- 面板 */

export class ButtonSettingsPanel {

    private plugin: any;
    private list: IButtonConfig[] = [];
    /** 工具条「可见按钮数」上限：固定 9（与系统键盘工具条一致），不可配置 */
    private maxIcons = MAX_VISIBLE;
    private root: HTMLDivElement;
    private listEl: HTMLDivElement;
    private jsonEl: HTMLTextAreaElement;
    /** 顶部统计行 */
    private statEl: HTMLDivElement;
    /** 工具条实时预览（v0.8.8）：标题下方、统计行上方，外形与编辑器里的真实工具条一致 */
    private pvEl: HTMLDivElement;
    /** 预览条本体：可左右滑动，渐隐遮罩逻辑与真实工具条一致 */
    private pvBar: HTMLDivElement;
    /** 预览下方的说明行（滑动提示 / 空态提示） */
    private pvHint: HTMLDivElement;
    /** v0.8.16：工具栏末尾「设置入口」齿轮开关（与引擎 CONFIG.settingsEntry 同步） */
    private settingsEntry = false;
    /** 「设置入口」开关行与其 checkbox（setSettingsEntry 回填用） */
    private entryRow: HTMLDivElement;
    private entrySw: HTMLInputElement | null = null;
    /** 顶部操作栏（添加按钮 / 恢复默认 / 导入 / 导出） */
    private barEl: HTMLDivElement;
    /** v0.8.21 吸顶头：预览 + 统计行（提示语行）合成一块，一起固定在顶部 */
    private headEl: HTMLDivElement;
    /** v0.8.21 停靠组：操作栏 + 两个标签页 —— 滑到吸顶头下方后整组停住 */
    private pinEl: HTMLDivElement;
    /** v0.8.22：盯着吸顶头高度的 ResizeObserver（不支持的环境为 null，走 render 后重量） */
    private stickyRO: any = null;
    /** v0.8.67：正在拖拽排序 —— 橡皮筋与滚动接管都要让位，否则手指一动页面就跟着滑 */
    private dragActive = false;
    /** 动作 id → 图标 id 的缓存（从面板预设与默认按钮推导，供动作库网格显示图标） */
    private iconMap: Record<string, string> | null = null;
    /**
     * 当前编辑会话（有且仅有一个编辑弹窗）。
     * 面板子按钮不再开新弹窗，而是在这个会话里下钻 —— 整条设置动线因此最多只有
     * 「设置弹窗 + 编辑弹窗」两层，不再出现「弹窗套弹窗」。
     */
    private editor: any = null;
    /** v0.8.52：「更多设置」二级页 Dialog（懒加载，打开时才构建三个开关） */
    private moreDlg: any = null;
    /** 块插入诊断界面；日志状态由独立诊断模块统一持有 */
    private diagnosticsUI: any = null;
    /** v0.8.54：导入用的隐藏文件选择器（懒创建、复用，打开系统文件管理器选配置文件） */
    private fileInput: HTMLInputElement | null = null;

    constructor(plugin: any) {
        this.plugin = plugin;
        this.root = h("div", "sy-mb-set");
        this.buildSkeleton();
        /* v0.8.22：吸顶头一挂进文档就盯着它 —— 预览条 / 提示行高度一变，
           停靠组的 sticky top 立刻跟着变，不会停在错的位置。 */
        this.ensureStickyObserver();
    }

    get element(): HTMLElement { return this.root; }

    getConfig(): IButtonConfig[] {
        return this.list.map((b) => JSON.parse(JSON.stringify(b)));
    }

    /** 显示上限固定 9；参数保留仅为兼容旧调用方（存过的旧值一律忽略） */
    getMaxIcons(): number { return MAX_VISIBLE; }

    /** v0.8.16：工具栏末尾「设置入口」齿轮开关 */
    getSettingsEntry(): boolean { return this.settingsEntry; }

    setSettingsEntry(on: boolean) {
        this.settingsEntry = !!on;
        if (this.entrySw) this.entrySw.checked = this.settingsEntry;
        this.renderPreview();
    }

    setConfig(list: IButtonConfig[]) {
        /* 配置被重置（打开设置 / 取消 / 保存后）时，顺带关掉可能还开着的编辑弹窗，
           否则会留下一个挂在上面的孤儿弹窗。 */
        if (this.editor) {
            const session = this.editor;
            this.editor = null;
            try { session.dialog.destroy(); } catch (e) { /* 忽略 */ }
        }
        this.list = list.map((b) => JSON.parse(JSON.stringify(b)));
        this.maxIcons = MAX_VISIBLE;
        this.render();
    }

    private t(key: string, fallback: string): string {
        const dict = this.plugin && this.plugin.i18n;
        return (dict && dict[key]) ? dict[key] : fallback;
    }

    /* ---------------------------------------------------------- 骨架 */

    private buildSkeleton() {
        /* v0.8.21：吸顶头 —— 预览 + 统计行（提示语行）合成一块。
           需求：上下滑动时「工具栏预览」连同它下面那行提示语一起保持可见。
           两块用一层 .sy-mb-set__stick 包住统一 sticky（top:0），不再只吸预览那一小块。
           （类名不能用 __head —— 那是按钮卡片的头部行，样式会被串上。）
           下面「操作栏 + 两个标签页」的停靠位置是相对这块头的高度算的
           （见 measureSticky），所以两者必须同源。 */
        this.headEl = h("div", "sy-mb-set__stick");

        /* 工具条实时预览（v0.8.8）：放在标题下方、统计行上方。
           增删按钮、拖拽调序、启停开关、导入 / 恢复默认之后，这里都会立刻反映真实工具条的样子，
           超过 9 个时可左右滑动查看藏在右侧的按钮 —— 与编辑器里的实际表现完全一致。 */
        this.pvEl = h("div", "sy-mb-set__pv");
        this.pvEl.appendChild(h("div", "sy-mb-set__pv-cap", this.t("preview", "工具栏预览")));
        this.pvBar = h("div", "sy-mb-set__pv-bar");
        /* 不用 id="syMobileToolbar"，避免与真实工具条的选择器 / 变量互相污染 */
        this.pvBar.setAttribute("role", "toolbar");
        this.pvBar.setAttribute("aria-label", this.t("preview", "工具栏预览"));
        /* 预览条用原生 overflow-x 滚动（不抢手势），故滚动事件直接驱动渐隐遮罩 */
        this.pvBar.addEventListener("scroll", () => this.updatePvOverflow(), { passive: true });
        this.pvEl.appendChild(this.pvBar);
        this.pvHint = h("div", "sy-mb-set__pv-hint");
        this.pvEl.appendChild(this.pvHint);
        this.headEl.appendChild(this.pvEl);

        /* 顶部统计行：共 N 个按钮 / 超出 M 个可左右滑动。
           原先这里有个「通用设置 · 图标可见上限」输入框（1~12），已移除：
           显示上限固定 9 个（与系统键盘工具条一致），超过 9 个一律横向滑动，
           既不需要用户配置，也避免了把工具条压扁成 12 个小格。 */
        this.statEl = h("div", "sy-mb-set__stat");
        this.headEl.appendChild(this.statEl);
        this.root.appendChild(this.headEl);

        /* v0.8.52：「工具栏末尾设置入口」等低频开关已迁至「更多设置」二级页
           （见 buildMorePage），一级页只留操作栏，视觉更轻、不挤占常用动作配置区。 */

        /* v0.8.21：停靠组 —— 操作栏单独成组（.sy-mb-set__pin）。
           需求：往下滑时只有「设置选项」（上面那几个开关）被折叠隐藏，操作栏滑到
           吸顶头下方就停住、跟着一起固定在头下面；列表则照常往上滚、
           被这块挡在后面。做成一个 sticky 组是最省事也最稳的做法：两块天然同步，
           不必再去逐个算每块各自的高度。 */
        this.pinEl = h("div", "sy-mb-set__pin");

        /* 操作栏：统一规格与风格（.sy-mb-set-btn）。
           「＋ 添加按钮」是主操作，靠在左；其余工具（恢复默认 / 导入 / 导出 / 更多设置）
           收进右侧 utils 容器，容器内部等距、整体右对齐，窄屏时整组换行至第二行，
           不会把「添加按钮」挤变形。v0.8.52：新增「更多设置」入口，点开二级页。 */
        const bar = h("div", "sy-mb-set__bar");
        this.barEl = bar;
        const addBtn = this.toolBtn(this.t("addButton", "＋ 添加按钮"), () => this.add());
        addBtn.classList.add("sy-mb-set__add");
        bar.appendChild(addBtn);
        const utils = h("div", "sy-mb-set__bar-utils");
        [
            { act: "reset", label: this.t("restoreDefault", "恢复默认") },
            { act: "import", label: this.t("importConfig", "导入") },
            { act: "export", label: this.t("exportConfig", "导出") },
            { act: "more", label: this.t("moreSettings", "更多设置") }
        ].forEach((b) => {
            const btn = this.toolBtn(b.label, () => {
                if (b.act === "more") this.openMoreSettings();
                else this.onBarAct(b.act);
            });
            btn.setAttribute("data-act", b.act);
            if (b.act === "more") btn.classList.add("sy-mb-set-btn--more");
            utils.appendChild(btn);
        });
        bar.appendChild(utils);
        this.pinEl.appendChild(bar);
        this.root.appendChild(this.pinEl);

        /* 工具条按钮列表 */
        this.listEl = h("div", "sy-mb-set__list");
        this.root.appendChild(this.listEl);

        /* 导入导出 JSON */
        this.jsonEl = h("textarea", "sy-mb-set__json b3-text-field fn__none") as HTMLTextAreaElement;
        this.jsonEl.rows = 6;
        this.jsonEl.spellcheck = false;
        this.jsonEl.placeholder = this.t("jsonPlaceholder", "粘贴按钮配置 JSON 后点「导入并应用」，或点「导出」复制当前配置");
        this.root.appendChild(this.jsonEl);

        const applyRow = h("div", "sy-mb-set__bar sy-mb-set__bar--foot fn__none");
        const applyBtn = this.toolBtn(this.t("applyImport", "导入并应用"), () => this.doImport());
        applyRow.appendChild(h("div", "fn__flex-1"));
        applyRow.appendChild(applyBtn);
        applyRow.classList.add("sy-mb-set__json-foot");
        this.root.appendChild(applyRow);
    }

    /* ---------------------------------------------------------- 更多设置二级页 */

    /**
     * v0.8.52：「更多设置」二级页。
     * 点操作栏的「更多设置」打开一个全屏子页（与编辑按钮弹窗同款 Dialog），
     * 里面收着低频开关（工具栏末尾设置入口）。
     * 一级页因此只剩「操作栏 + 列表」，配置常用动作时不再被开关挤占。
     * 重复点击会先销毁旧页再重建（幂等），避免叠多个对话框。
     */
    private openMoreSettings() {
        /* 已打开时再次触发（如测试里反复点「更多设置」）：与 v0.8.56 一致，
           先同步销毁旧页再重建，保证 this.entryRow / entrySw 等字段始终指向当前展示页；
           带动画的「推出」只走关闭按钮（closeMoreSettings），避免重入时双开。 */
        if (this.moreDlg) {
            if (this.diagnosticsUI) this.diagnosticsUI.destroy();
            this.diagnosticsUI = null;
            try { this.moreDlg.destroy(); } catch (e) { /* 忽略 */ }
            this.moreDlg = null;
        }
        const dialog = new Dialog({
            title: this.t("moreSettings", "更多设置"),
            content: "",
            width: "100%",
            height: "100%"
        });
        const host = this.dialogHost(dialog);
        if (!host) { dialog.destroy(); return; }
        /* 选择器抽屉要贴着弹窗底部绝对定位 */
        host.style.position = "relative";
        /* 保留原生对话框标题栏（含右上角 ✕ 关闭），不另加页面内导航条 / 左侧返回按钮。
           整页右滑覆盖动画作用于对话框面板（.sy-mb-set__push，见 settings.css），
           从右侧滑入、退出原路滑回；底层主设置页保持静止，由左缘投影表达纵深。 */
        const container = dialog.element.querySelector(".b3-dialog__container") as HTMLElement | null;
        if (container) container.classList.add("sy-mb-set__push");
        /* v0.8.63：自管阴影遮罩 —— 隐藏 SiYuan 自带 .b3-dialog__mask（其退出时会被提前淡出 / 移除，
           造成「阴影先消失、二级页还在滑」的错位），改由我们可控的 .sy-mb-set__backdrop 提供纵深。
           v0.8.67：退出时该遮罩在 closeSubPage 里与面板滑出**同步淡出**（同一条 .34s 曲线），
           动画结束随 Dialog 一起销毁——阴影不再滞后于面板消失。 */
        /* v0.8.63：隐藏 SiYuan 自带遮罩（真机为 .b3-dialog__scrim，个别版本为 .b3-dialog__mask），
           改用我们可控的 .sy-mb-set__backdrop 表达纵深，
           消除「阴影先消失、面板还在滑」的错位。 */
        const scrimEl = dialog.element.querySelector(".b3-dialog__scrim, .b3-dialog__mask") as HTMLElement | null;
        if (scrimEl) scrimEl.style.display = "none";
        const backdrop = h("div", "sy-mb-set__backdrop");
        (container.parentElement || dialog.element).insertBefore(backdrop, container);
        /* 二级页内容容器（中性包裹，不含任何导航条 / 返回按钮）；
           滚动体：开关列表内部滚动（flex:1 填满并自带滚动） */
        const page = h("div", "sy-mb-set__more-page");
        host.appendChild(page);
        const body = h("div", "sy-mb-set__more-body");
        page.appendChild(body);
        this.buildMorePage(body);
        this.moreDlg = dialog;
        /* 右上角 ✕ 关闭：改为先滑出再销毁，避免瞬间消失 */
        const closeBtn = dialog.element.querySelector(".b3-dialog__close") as HTMLElement | null;
        if (closeBtn) {
            closeBtn.addEventListener("click", (e: any) => {
                e.preventDefault(); e.stopPropagation();
                this.closeMoreSettings();
            }, true);
        }
    }

    /** v0.8.60：二级页退出 = 整页原路滑回右侧（.sy-mb-set-sub--out），动画结束后再销毁 Dialog。
     *  页面全程不透明，滑出即露出下方主设置页，不会透出空白页，与推入完全对称。 */
    private closeMoreSettings() {
        const dlg = this.moreDlg;
        if (!dlg) return;
        this.moreDlg = null;
        const page = dlg.element.querySelector(".sy-mb-set__push") as HTMLElement | null;
        this.closeSubPage(dlg, page);
    }

    /** v0.8.60：二级页统一退出 —— 整页加 .sy-mb-set-push--out 滑回右侧，结束后销毁 Dialog。
     *  页面始终不透明，滑出过程中直接露出下方主设置页，不会透出底层 Dialog 的空白背景。
     *  v0.8.67：自管阴影遮罩（.sy-mb-set__backdrop）在退出**开始时**与面板同步淡出
     *  （同一条 .34s iOS 曲线），不再等动画结束才消失，消除阴影滞后的错位感。
     *  减少动态偏好下直接销毁、不播动画。 */
    private closeSubPage(dlg: any, page: HTMLElement | null) {
        const finish = () => {
            if (this.diagnosticsUI) this.diagnosticsUI.destroy();
            this.diagnosticsUI = null;
            try { dlg.destroy(); } catch (e) { /* 忽略 */ }
        };
        if (this.reduceMotion()) { finish(); return; }
        if (page) page.classList.add("sy-mb-set-push--out");
        const backdrop = dlg.element.querySelector(".sy-mb-set__backdrop") as HTMLElement | null;
        if (backdrop) backdrop.classList.add("sy-mb-set__backdrop--out");
        setTimeout(finish, 360);
    }

    private reduceMotion(): boolean {
        return (typeof matchMedia === "function") &&
            matchMedia("(prefers-reduced-motion: reduce)").matches;
    }

    /**
     * 在给定宿主里构建「更多设置」二级页的开关。
     * 开关的实现与事件与原来在一级页时完全一致（只是宿主从 root 换成二级页）；
     * 末尾按当前实例状态初始化一次（对话框懒加载，打开时才反映真实值）。
     */
    private buildMorePage(host: HTMLElement) {
        /* v0.8.16：工具栏末尾「设置入口」开关。
           打开后工具条最末端出现齿轮按钮，点击跳转本插件的「自定义按钮」界面；
           齿轮固定在末尾，不参与横滑、不影响其他按钮排序。 */
        this.entryRow = h("div", "sy-mb-set__entry");
        const entryLabel = h("div", "sy-mb-set__entry-label");
        entryLabel.appendChild(h("div", "sy-mb-set__entry-name",
            this.t("showSettingsEntry", "在工具栏末尾显示设置入口")));
        entryLabel.appendChild(h("div", "sy-mb-set__entry-tip",
            this.t("showSettingsEntryTip", "工具条最末端出现齿轮按钮，点击进入本插件的自定义按钮界面；不影响其他按钮的排序与显示")));
        this.entryRow.appendChild(entryLabel);
        const entrySw = h("input", "b3-switch sy-mb-set__switch") as HTMLInputElement;
        entrySw.type = "checkbox";
        entrySw.checked = this.settingsEntry;
        entrySw.title = this.t("showSettingsEntry", "在工具栏末尾显示设置入口");
        entrySw.setAttribute("aria-label", this.t("showSettingsEntry", "在工具栏末尾显示设置入口"));
        entrySw.addEventListener("change", () => {
            this.settingsEntry = entrySw.checked;
            /* 立即热生效：引擎增删齿轮层；预览同步（不整页 render，保住编辑焦点） */
            const mt = MobileToolbar as any;
            if (mt.setSettingsEntry) mt.setSettingsEntry(this.settingsEntry);
            this.renderPreview();
        });
        this.entryRow.appendChild(entrySw);
        this.entrySw = entrySw;
        host.appendChild(this.entryRow);

        /* 块插入诊断：模块内部统一维护开关、日志文本、复制与清空，
           设置页只负责把完整控件挂进来，不另存诊断状态。 */
        this.diagnosticsUI = InsertDiagnostics.createUI();
        host.appendChild(this.diagnosticsUI.element);

    }

    /* ---------------------------------------------------------- 渲染 */

    /** 当前按钮列表（预览 / 列表 / 统计 / 添加都跟随它） */
    private activeList(): IButtonConfig[] {
        return this.list;
    }

    /** 当前编辑上下文里的「叶子行为」集合 */
    private leafTypesNow(): TButtonType[] {
        return LEAF_TYPES.slice();
    }

    /** 面板子项可选的类型 */
    private childTypesNow(): TButtonType[] {
        return CHILD_TYPES.slice();
    }

    private render() {
        const list = this.activeList();
        this.listEl.innerHTML = "";
        this.renderPreview();
        this.updateStat();
        /* v0.8.21：重画后重量一次吸顶头高度（停靠组的 sticky top 靠它）。
           v0.8.22：量高改成「未挂载不量、量不到不写」+ ResizeObserver 跟随 —— 见 measureSticky。 */
        this.scheduleStickyMeasure();
        if (!list.length) {
            this.listEl.appendChild(h("div", "sy-mb-set__empty",
                this.t("emptyList", "暂无按钮，点上方「添加按钮」开始配置")));
            return;
        }
        list.forEach((def) => this.listEl.appendChild(this.renderCard(def, this.listEl, list)));
    }

    /** 统一规格的次级按钮：一级页操作栏 / 编辑页 / 各弹层共用同一套尺寸与外观。
        类名用 sy-mb-set-btn 而非 sy-mb-btn —— 后者是工具条按钮的类名，重名会把
        设置页的灰底/描边/圆角串到工具条上，破坏其与系统键盘工具条一致的外观。 */
    private toolBtn(label: string, onClick: () => void, extra?: string): HTMLButtonElement {
        const btn = h("button", "sy-mb-set-btn" + (extra ? " " + extra : ""), label);
        btn.type = "button";
        btn.addEventListener("click", onClick);
        return btn;
    }

    /** 这个按钮会不会真的出现在工具条上？与引擎 buildButtonItems 的跳过条件保持一致：
     *  builtinId 为空（动作待选）或查不到对应动作（坏数据）→ 都不出现。 */
    private onToolbar(def: IButtonConfig): boolean {
        if (def.type === "builtin") {
            const bid = String(def.builtinId || "");
            if (!bid) return false;
            const opts: any = (MobileToolbar as any).builtinOptions
                ? (MobileToolbar as any).builtinOptions() : { leaf: [], panel: [] };
            const ids = (opts.leaf || []).concat(opts.panel || []).map((o: any) => o.value);
            return ids.indexOf(bid) >= 0;
        }
        if (def.type === "setting") {
            /* v0.8.13：选项清单是动态枚举，这里只挡「待选」（settingId 为空），
               非空一律视为可上预览——执行端有降级提示兜底。 */
            return Boolean(String(def.settingId || ""));
        }
        return true;
    }

    /**
     * 渲染工具条实时预览（v0.8.8）。
     *
     * 「所见即所得」的关键在于**不另画一套**：按钮直接用引擎的 `.sy-mb-btn` 类名与
     * `iconHtml()` 输出的图标 html，等分基准 `--sy-mb-visible` 也用与真实工具条
     * 相同的算法（min(按钮数, MAX_VISIBLE)）—— 所以这里看到的大小、留白、图标形状，
     * 与编辑器里真实工具条上的按钮逐项一致，不需要在脑子里做换算。
     *
     * 预览按钮一律 disabled：设置页里点它不会误触发动作，它只是「画面」而不是入口。
     */
    private renderPreview() {
        if (!this.pvBar) return;
        this.pvBar.innerHTML = "";

        /* 只画「真实工具条上会出现」的按钮：停用的不画，**动作待选的也不画**
           （引擎 buildButtonItems 同样跳过 builtinId 为空的按钮）——
           预览与真实必须一致，否则用户会以为「配好了但工具条上没有」。 */
        const list = this.activeList();
        const shown = list.filter((b) => b && b.enabled !== false && this.onToolbar(b));
        const iconHtml = (MobileToolbar as any).iconHtml;
        const titleOf = (MobileToolbar as any).buttonTitle;

        shown.forEach((def) => {
            const btn = h("button", "sy-mb-btn sy-mb-set__pv-btn");
            btn.type = "button";
            btn.disabled = true;
            const title = titleOf ? titleOf(def) : (def.name || "");
            btn.title = title;
            btn.setAttribute("aria-label", title);
            btn.innerHTML = iconHtml ? iconHtml(def.icon) : "";
            this.pvBar.appendChild(btn);
        });

        /* v0.8.17：末尾齿轮（开关打开才画）—— 与真实工具条一致：
           它就是滚动流里最后一个按钮，一同等分、一同横滑，滑到末端才看到 */
        if (this.settingsEntry) {
            const g = h("button", "sy-mb-btn sy-mb-set__pv-btn sy-mb-set__pv-entry-btn");
            g.type = "button";
            g.disabled = true;
            const gt = this.t("settingsEntry", "工具栏设置");
            g.title = gt;
            g.setAttribute("aria-label", gt);
            g.innerHTML = iconHtml ? iconHtml("gear") : "";
            this.pvBar.appendChild(g);
        }

        /* 等分基准：与引擎 updateVisible 同口径 —— 9 个铺满，超过 9 个每个仍占 1/9，
           于是右侧的按钮被推到容器外，滑动即可看到（与真实工具条一致地「不压缩不丢」）。
           齿轮是末尾的一个普通按钮，计入等分（用户要的就是「滑到末端看到它」）。 */
        const visible = Math.max(1, Math.min(shown.length + (this.settingsEntry ? 1 : 0), MAX_VISIBLE));
        this.pvBar.style.setProperty("--sy-mb-visible", String(visible));

        this.pvEl.classList.toggle("sy-mb-set__pv--empty", shown.length === 0);

        /* 两种「不显示」的原因要分开说，用户才知道下一步该做什么：
           停用 = 我自己关的；未选动作 = 还没配完，得去选一个。 */
        const offCount = list.filter((b) => b && b.enabled === false).length;
        const unsetCount = list.filter((b) => b && b.enabled !== false && !this.onToolbar(b)).length;
        if (!shown.length) {
            this.pvHint.textContent = unsetCount > 0
                ? this.t("previewUnsetOnly", "有 {m} 个按钮还没选动作，选完动作后才会出现在工具条上").replace("{m}", String(unsetCount))
                : this.t("previewEmpty", "没有启用的按钮，工具条当前是空的");
        } else {
            /* v0.8.10：统计行已说明「共 N 个 · 超出 M 个可左右滑动」，预览提示
               不再重复这些 —— 只补统计行没说的：还没选动作 / 已停用。
               两条额外信息都没有时整行留空（CSS :empty 隐藏），省一行高度。 */
            const extras: string[] = [];
            if (unsetCount > 0) {
                extras.push(this.t("previewUnset", "{m} 个还没选动作").replace("{m}", String(unsetCount)));
            }
            if (offCount > 0) {
                extras.push(this.t("previewOff", "另有 {m} 个按钮已停用，不出现在工具条上").replace("{m}", String(offCount)));
            }
            this.pvHint.textContent = extras.join(" · ");
        }

        /* 布局稳定后再判一次是否溢出（首帧 clientWidth 可能还没就绪） */
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => this.updatePvOverflow());
        else this.updatePvOverflow();
    }

    /** 预览条溢出时，只给「还藏着按钮的那一侧」加渐隐（与引擎 updateOverflow 同一套判定） */
    private updatePvOverflow() {
        if (!this.pvBar) return;
        const maxScroll = this.pvBar.scrollWidth - this.pvBar.clientWidth;
        const scrollable = maxScroll > 2;
        this.pvBar.classList.toggle("sy-mb-scroll", scrollable);
        this.pvBar.classList.toggle("sy-mb-scroll-l", scrollable && this.pvBar.scrollLeft > 2);
        this.pvBar.classList.toggle("sy-mb-scroll-r", scrollable && this.pvBar.scrollLeft < maxScroll - 2);
    }

    /** 更新顶部统计行：共 N 个按钮，超出上限几项可滑动 */
    private updateStat() {
        if (!this.statEl) return;
        const total = this.activeList().length;
        const over = Math.max(0, total - this.maxIcons);
        let txt = this.t("stat", "共 {n} 个按钮").replace("{n}", String(total));
        if (over > 0) txt += " · " + this.t("overHint", "超出 {m} 个可左右滑动查看").replace("{m}", String(over));
        else txt += " · " + this.t("fitHint", "均在显示上限内");
        this.statEl.textContent = txt;
    }

    /* ------------------------------------- v0.8.21：吸顶头 + 停靠组 -----------------
       需求（v0.8.19 提出、本轮修正）：
       · 上下滑动时「工具栏预览」**连同它下面那行提示语**一起固定在顶部；
       · 继续滑动只折叠隐藏「设置选项」（那几个开关），它们可以滚到头后面去；
       · 「添加按钮 / 恢复默认 / 导入 / 导出」滑到吸顶内容下方时**就停在那里**，
         不再固定到屏幕底部（v0.8.19 的 fixed 方案位置不对）；
       · 按钮列表照常往上滚，被这块挡住即可。
       实现：纯 CSS 两层 sticky —— .sy-mb-set__stick（预览 + 统计行，top:0）
       与 .sy-mb-set__pin（操作栏，top: 头的高度）。后者需要一个像素值，
       由这里量出来写进 --sy-mb-sticky-h。JS 只做「量高度」这一件事，滚不滚、
       停不停全交给浏览器，不再自己判滚动位置（v0.8.19 那套 fixed 停靠已删除）。 */

    /** 量吸顶头的高度 → 写进 --sy-mb-sticky-h，供停靠组的 sticky top 使用。
        headEl 的高度会随预览提示行内容变化（有 / 无提醒时行数不同），
        所以除了每次 render 后重量一次，还要用 ResizeObserver 盯着它自己变。

        ⚠️ v0.8.22 修正（真实反馈：刚打开设置页时停靠组压在提示语下面 ——
        「会遮挡部分按钮…有部分藏到提示语下方了」，切一下标签页又变正常）：
        根因有两层，都得堵 ——
        ① **量早了一步**：openSetting 先 setConfig→render（此刻 root 还没挂进弹窗，
           量到的是 0），若之后没有人再量，--sy-mb-sticky-h 就一直是 0px，
           停靠组于是贴在最顶上、被吸顶头盖住；切标签页会再 render 一次 → 又对了。
           → 未挂载时**根本不量**（见下面的 isConnected 守卫）；
        ② **量到 0 就写 0**：真机上首帧布局未就绪时同样可能拿到 0，
           把 0 写进去等于「停靠组顶到最上面」。
           → 量不到有效高度就保持上一次的值，绝不写 0。
        再补一个 ResizeObserver 兜住「预览条 / 提示行 / 字体迟到」引起的高度变化。 */
    private measureSticky() {
        if (!this.root || !this.headEl) return;
        if (!this.root.isConnected || !this.headEl.isConnected) return;
        let hgt = 0;
        try {
            hgt = this.headEl.getBoundingClientRect().height || (this.headEl as any).offsetHeight || 0;
        } catch (e) { /* ignore */ }
        if (!isFinite(hgt) || hgt <= 0) return;
        this.root.style.setProperty("--sy-mb-sticky-h", Math.round(hgt) + "px");
    }

    /** 用 ResizeObserver 盯住吸顶头：高度一变就同步 sticky top（幂等）。 */
    private ensureStickyObserver() {
        if (this.stickyRO || !this.headEl) return;
        const RO = typeof window !== "undefined" ? (window as any).ResizeObserver : null;
        if (typeof RO !== "function") return;
        try {
            this.stickyRO = new RO(() => this.measureSticky());
            this.stickyRO.observe(this.headEl);
        } catch (e) { this.stickyRO = null; }
    }

    /** 渲染后调一次量高：先量一次，再在下一帧补一次（挂载 / 布局稳定后才准）。 */
    scheduleStickyMeasure() {
        this.ensureStickyObserver();
        this.measureSticky();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => this.measureSticky());
    }

    /**
     * v0.8.23：面板真正挂进弹窗之后由 index 调用一次。
     *
     * 为什么必须单独有这一步 —— 之前 openSetting() 是「先 setConfig（内部 render）
     * 再 openMobileDialog（挂载）」，render 里量高时 root 还没进 DOM，
     * getBoundingClientRect() 恒为 0；v0.8.22 加了「量不到不写」之后，这一刻变量
     * 干脆不落，CSS 的 fallback（top: var(--sy-mb-sticky-h, 0px)）就让停靠组停在
     * 0px —— 也就是被吸顶头整块盖住。而切一次标签页会再 render 一次，那时已挂载，
     * 于是「切一下就好了」，与用户描述逐字吻合。
     * 光靠 rAF / ResizeObserver 不够稳（弹窗入场动画、字体与图标加载都会再改一次
     * 高度），所以这里再补几拍延时的量高兜底。
     */
    onMounted() {
        this.scheduleStickyMeasure();
        [60, 200, 500].forEach((d) => setTimeout(() => this.measureSticky(), d));
        this.bindVerticalRubber();
        this.bindPreviewRubber();
    }

    /** v0.8.57：设置页纵向橡皮筋（iOS 同款触底回弹）。
     *  与编辑器工具条的横向橡皮筋同思路：仅在原生滚动已到顶/底、用户继续往同方向拉时才接管
     *  （纯视觉 translateY，不碰原生滚动、不新造滚动层、不碰 sticky 测量）；中间的常规滚动
     *  仍交给原生（保留原生惯性）。只作用在「按钮列表」(.sy-mb-set__list) 上，
     *  上方吸顶冻结区（预览/统计/操作栏）纹丝不动，只有下方按钮行参与回弹。 */
    /* v0.8.60：重写纵向橡皮筋 —— 诊断结论：长列表滑动卡顿是**主线程性能问题**
       （不是纯 GPU 帧率问题）。两处真凶：① touchmove 在每一帧都读 scrollHeight/clientHeight/
       scrollTop 强制同步布局（布局抖动），列表每帧回流直接掉帧，长列表尤甚；② 列表不可滚动时
       rubber-band 把整块 .sy-mb-set__list 拉伸而非滚动，按钮少、内容常刚好塞满，于是
       「滑动 = 整块被橡皮筋拽着变形」，看着就是卡顿/不跟手。
       修法：端点 / 可滚动态只在「手势起点」按 scrollTop 判定一次，手势进行中零布局读取
       （消除每帧强制回流）；不可滚动时不再劫持竖向滑动（非滚动区手势不生效，不拉伸）。
       仅作用于按钮列表，吸顶区不动；will-change 只在橡皮筋介入时加上、归位后移除，
       不长期占一张超大合成层。 */
    private bindVerticalRubber() {
        const scroll = this.root.parentElement as HTMLElement | null;
        if (!scroll || !scroll.classList.contains("sy-mb-set-dlg__scroll")) return;
        const content = (this.listEl || this.root.querySelector(".sy-mb-set__list") || this.root) as HTMLElement;
        let startX = 0, startY = 0, edgeY = 0;
        let mode = 0;                                   // 0 未介入；1 顶边下拉；2 底边上拉
        const MAXR = 90, SOFT = 110;                    // 限幅 ±90px；SOFT 越大起步越跟手
        const maxScroll = () => Math.max(0, scroll.scrollHeight - scroll.clientHeight);
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        const reduce = () => (typeof matchMedia === "function") &&
            matchMedia("(prefers-reduced-motion: reduce)").matches;
        /* v0.8.59：渐近阻尼 —— 起步跟手（比例≈0.8），越拉越抗拒并逼近限幅，
           触底拉伸的「回弹感」更自然；替代原线性 0.4，消除「硬切到固定比例」的顿挫。 */
        const damp = (d: number) => {
            if (d === 0) return 0;
            const s = d < 0 ? -1 : 1, a = Math.abs(d);
            return s * (1 - 1 / (1 + a / SOFT)) * MAXR;
        };
        const clear = () => {
            mode = 0; edgeY = 0;
            content.style.willChange = "";
            content.style.transition = ""; content.style.transform = "";
        };
        const settle = () => {
            if (!content.style.transform) { mode = 0; return; }
            if (reduce()) { content.style.transition = ""; content.style.transform = ""; content.style.willChange = ""; mode = 0; return; }
            /* 轻微回弹（overshoot）让松手有「弹回」的弹性，而非生硬吸附 */
            content.style.transition = "transform .52s cubic-bezier(.33,1.25,.5,1)";
            content.style.transform = "translateY(0)";
            mode = 0;
            setTimeout(() => { if (!content.style.transform || content.style.transform === "translateY(0)") { content.style.transition = ""; content.style.transform = ""; content.style.willChange = ""; } }, 540);
        };
        /* v0.8.58：passive 监听，常规滚动交还原生（不拦主线程，长列表跟手）。
           v0.8.60：端点态只在「手势起点」读一次 scrollTop，手势中不再碰布局属性
           —— 消除每帧强制回流（表格分页卡顿主因）；不可滚动时不劫持竖向滑动。 */
        scroll.addEventListener("touchstart", (ev: any) => {
            const t = ev.touches && ev.touches[0];
            if (!t) return;
            if (content.style.transform) clear();
            startX = t.clientX; startY = t.clientY;
            edgeY = 0; mode = 0;
        }, { passive: true, capture: true });
        scroll.addEventListener("touchmove", (ev: any) => {
            const t = ev.touches && ev.touches[0];
            if (!t) return;
            /* v0.8.67：正在拖拽排序时一律不接管 —— 否则按住手柄上下拖，
               列表会被橡皮筋整块平移，看着就像「拖拽变成了滑动」。 */
            if (this.dragActive) { if (content.style.transform) clear(); return; }
            const y = t.clientY;
            const dy = y - startY;
            if (mode === 0) {
                if (Math.abs(dy) < 3) return;                          // 死区，避免误触抖动
                if (Math.abs(t.clientX - startX) > Math.abs(dy)) return; // 横滑让位给页面
                /* 端点态在「手势起点」按 scrollTop 判定一次（此帧前原生滚动几乎未动，
                   scrollTop 即起点位置），手势中不再读取——既消除每帧回流，也避免
                   「中途滚到边」反复误判。 */
                const ms = maxScroll();
                if (ms <= 0.5) return;                                // 不可滚动：不劫持竖向滑动
                const atTop = scroll.scrollTop <= 1;
                const atBottom = scroll.scrollTop >= ms - 1;
                const top = atTop && dy > 0;                          // 顶边：手指下拉
                const bot = atBottom && dy < 0;                        // 底边：手指上拉
                if (top) mode = 1; else if (bot) mode = 2; else return;
                edgeY = y;                                            // 触边瞬间定基线，偏移从 0 起算
                content.style.willChange = "transform";
                return;                                               // 本帧不施力，下一帧起跟手
            }
            /* 回拉到位（越过基线回到可滚动区）：平滑归位并交还原生滚动 */
            if (mode === 1 && (y - edgeY) <= 0) { settle(); return; }
            if (mode === 2 && (y - edgeY) >= 0) { settle(); return; }
            const off = clamp(damp(y - edgeY), -MAXR, MAXR);          // 触边后的超额位移→渐近阻尼
            content.style.transition = "none";
            content.style.transform = "translateY(" + off + "px)";
        }, { passive: true, capture: true });
        const end = () => { if (content.style.transform) settle(); mode = 0; edgeY = 0; };
        scroll.addEventListener("touchend", end, { capture: true });
        scroll.addEventListener("touchcancel", end, { capture: true });
    }

    /** v0.8.60：设置页「工具栏预览」边缘橡皮筋 —— 与编辑器真实工具条同一套效果。
       引擎真实工具条用自定义横滑 + --sy-mb-rubber 驱动 .sy-mb-btn 的 translateX 做边缘回弹；
       预览条复用同一变量（按钮本就带 translateX(var(--sy-mb-rubber,0px))），
       在原生横滑到端点、用户继续往外拉时接管理想橡皮筋，松手按编辑器同款曲线归位。
       中间段仍交给原生滚动（保留原生惯性），全程顺滑；overscroll-behavior-x:none
       关掉原生端点反弹，避免与我们的橡皮筋叠加成双弹。 */
    private bindPreviewRubber() {
        const bar = this.pvBar;
        if (!bar) return;
        let sx = 0, sy = 0, baseLeft = 0, armed = false, panning = false, mode = 0;
        const maxScroll = () => Math.max(0, bar.scrollWidth - bar.clientWidth);
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
        const reduce = () => (typeof matchMedia === "function") &&
            matchMedia("(prefers-reduced-motion: reduce)").matches;
        const applyRubber = (x: number) => {
            bar.classList.remove("sy-mb-rubber-out");
            bar.style.setProperty("--sy-mb-rubber", x ? x + "px" : "");
        };
        const settle = () => {
            if (!bar.style.getPropertyValue("--sy-mb-rubber")) return;
            if (reduce()) { bar.style.setProperty("--sy-mb-rubber", ""); return; }
            bar.classList.add("sy-mb-rubber-out");
            bar.style.setProperty("--sy-mb-rubber", "");
            setTimeout(() => { if (!bar.style.getPropertyValue("--sy-mb-rubber")) bar.classList.remove("sy-mb-rubber-out"); }, 460);
        };
        bar.addEventListener("touchstart", (ev: any) => {
            const t = ev.touches && ev.touches[0];
            if (!t) { armed = false; panning = false; return; }
            if (bar.style.getPropertyValue("--sy-mb-rubber")) { bar.classList.remove("sy-mb-rubber-out"); bar.style.setProperty("--sy-mb-rubber", ""); }
            sx = t.clientX; sy = t.clientY;
            armed = true; panning = false; mode = 0;
        }, { passive: true, capture: true });
        bar.addEventListener("touchmove", (ev: any) => {
            const t = ev.touches && ev.touches[0];
            if (!t || !armed) return;
            const dx = t.clientX - sx, dy = t.clientY - sy;
            if (!panning) {
                if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;   // 未达阈值：仍算点按
                if (Math.abs(dy) > Math.abs(dx)) { armed = false; return; } // 竖直手势让位
                panning = true;
                baseLeft = bar.scrollLeft;
                return;
            }
            const ms = maxScroll();
            const intended = baseLeft - (t.clientX - sx);
            /* 仅在端点（或不可滚动时整体）往外拉才接管理想橡皮筋；中间段交给原生滚动 */
            if ((bar.scrollLeft <= 0 && intended < 0) || (bar.scrollLeft >= ms - 1 && intended > ms)) {
                const rb = clamp((bar.scrollLeft - intended) * 0.3, -80, 80);
                applyRubber(rb);
                mode = intended < 0 ? 1 : 2;
            } else if (mode !== 0) {
                applyRubber(0);
                mode = 0;
            }
        }, { passive: true, capture: true });
        const end = () => {
            if (!panning) return;
            panning = false; armed = false;
            if (mode !== 0) { settle(); mode = 0; }
        };
        bar.addEventListener("touchend", end, { capture: true });
        bar.addEventListener("touchcancel", end, { capture: true });
    }

    /** 渲染一张可拖拽的顶层按钮卡片（点它进入「顶层按钮的编辑弹窗」） */
    private renderCard(def: IButtonConfig, container: HTMLElement, siblings: IButtonConfig[]): HTMLElement {
        const item = h("div", "sy-mb-set__item" + (def.enabled === false ? " sy-mb-set__item--off" : ""));
        item.setAttribute("data-id", def.id);

        const head = h("div", "sy-mb-set__head");
        head.setAttribute("data-role", "head");

        /* 拖拽手柄：手指按住即可拖动排序 */
        const handle = h("div", "sy-mb-set__handle");
        handle.setAttribute("role", "button");
        handle.setAttribute("aria-label", this.t("drag", "拖动排序"));
        handle.title = this.t("dragTip", "按住拖动可调整顺序");
        handle.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><circle cx="7" cy="5" r="1.4"/><circle cx="13" cy="5" r="1.4"/><circle cx="7" cy="10" r="1.4"/><circle cx="13" cy="10" r="1.4"/><circle cx="7" cy="15" r="1.4"/><circle cx="13" cy="15" r="1.4"/></svg>';
        this.bindDrag(handle, item, container, siblings);
        head.appendChild(handle);

        /* 开关 */
        const sw = h("input", "b3-switch sy-mb-set__switch") as HTMLInputElement;
        sw.type = "checkbox";
        sw.checked = def.enabled !== false;
        sw.title = this.t("enabled", "启用");
        sw.setAttribute("aria-label", this.t("enabled", "启用"));
        sw.addEventListener("change", () => {
            def.enabled = sw.checked;
            item.classList.toggle("sy-mb-set__item--off", !def.enabled);
            /* 停用/启用会直接改变工具条上的按钮数，预览必须同步（但不能整页 render：
               正在编辑的弹窗与输入焦点都在 listEl 里，重建会把用户输入抹掉） */
            this.renderPreview();
        });
        head.appendChild(sw);

        /* 图标 + 名称（点此处展开/收起） */
        const iconBox = h("div", "sy-mb-set__icon");
        head.appendChild(iconBox);

        const meta = h("div", "sy-mb-set__meta");
        meta.appendChild(h("div", "sy-mb-set__name"));
        meta.appendChild(h("div", "sy-mb-set__sub"));
        head.appendChild(meta);

        /* 删除：列表里直接删这一个按钮，不必进编辑页，更不用「恢复默认」把全部清空。
           放在箭头左边，和「进入编辑」的大点击区错开，点它不会误触发编辑。 */
        const del = h("button", "sy-mb-set__del");
        del.type = "button";
        del.title = this.t("remove", "删除");
        del.setAttribute("aria-label", this.t("remove", "删除"));
        del.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
            'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M5 7h14"/><path d="M10 7V5.2h4V7"/>' +
            '<path d="M6.7 7l.9 11.3a1 1 0 0 0 1 .9h6.8a1 1 0 0 0 1-.9L17.3 7"/>' +
            '<path d="M10.4 10.6v5.2M13.6 10.6v5.2"/></svg>';
        del.addEventListener("click", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            this.remove(def, siblings);
        });
        head.appendChild(del);

        /* 展开箭头 */
        const chev = h("div", "sy-mb-set__chev");
        chev.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor"><path d="M6 8l4 4 4-4z"/></svg>';
        head.appendChild(chev);

        /* 点整行进入「单按钮编辑页」：不再在卡片下方堆一长条表单。
           手柄（拖拽）、开关、删除按钮除外，避免误触。 */
        head.addEventListener("click", (e: any) => {
            if (e.target.closest(".sy-mb-set__handle") ||
                e.target.closest(".sy-mb-set__switch") ||
                e.target.closest(".sy-mb-set__del")) return;
            this.openEditor(def, siblings);
        });

        item.appendChild(head);
        this.syncHead(item, def);
        return item;
    }

    private syncHead(item: HTMLElement, def: IButtonConfig) {
        const iconBox = item.querySelector(".sy-mb-set__icon") as HTMLElement;
        const title = item.querySelector(".sy-mb-set__name") as HTMLElement;
        const sub = item.querySelector(".sy-mb-set__sub") as HTMLElement;
        if (iconBox) iconBox.innerHTML = (MobileToolbar as any).iconHtml(def.icon);
        if (title) title.textContent = (def.name || this.describe(def) || this.t("unnamed", "未命名")) + (def.type === "panel" ? "" : "");
        if (sub) sub.textContent = this.subText(def);
    }

    /** 卡片副标题：类型 · 具体做什么 · 禁用态，一句话说清这个按钮 */
    private subText(def: IButtonConfig): string {
        let s = TYPE_LABELS[def.type] || def.type;
        if (def.type === "builtin") {
            /* 没选动作时说清「待选」，别显示成动作名后面空一段 */
            s += " · " + (def.builtinId ? this.actionLabel(def.builtinId) : this.t("noActionYet", "未选择动作"));
        } else if (def.type === "popup") {
            s += " · " + (def.options || []).map((o) => o.name || o.value).join("/");
        } else if (def.type === "setting") {
            s += " · " + (def.settingId ? this.settingLabel(def.settingId) : this.t("noSettingYet", "未选择设置项"));
        }
        if (def.type === "panel") s += " · " + (def.children || []).length + this.t("childrenUnit", " 项");
        if (def.enabled === false) s += " · " + this.t("disabled", "已禁用");
        return s;
    }

    /** 动作 id → 思源图标 id；推导不出来时返回空串，由调用方兜底 */
    private actionIcon(id?: string): string {
        if (!id) return "";
        if (!this.iconMap) {
            const map: Record<string, string> = {};
            const presets: any = (MobileToolbar as any).panelPresets ? (MobileToolbar as any).panelPresets() : {};
            Object.keys(presets).forEach((k) => {
                const arr: any[] = presets[k] || [];
                if (arr.length && arr[0].icon) map[k] = arr[0].icon;
                arr.forEach((c: any) => { if (c.builtinId && c.icon) map[c.builtinId] = c.icon; });
            });
            const defs: any[] = (MobileToolbar as any).defaultButtons ? (MobileToolbar as any).defaultButtons() : [];
            defs.forEach((d: any) => { if (d.builtinId && d.icon) map[d.builtinId] = d.icon; });
            this.iconMap = map;
        }
        return this.iconMap[id] || "";
    }

    private actionLabel(bid?: string): string {
        const names: any = (MobileToolbar as any).actionNames || {};
        return (bid && names[bid]) || bid || "";
    }

    /** 设置 id → 思源设置项名（注册表里的显示名） */
    private settingLabel(sid?: string): string {
        const labels: any = (MobileToolbar as any).settingLabels || {};
        return (sid && labels[sid]) || sid || "";
    }

    /** 设置 id → 思源图标 id（注册表里的图标，查不到返回空串由调用方兜底） */
    private settingIcon(sid?: string): string {
        const icons: any = (MobileToolbar as any).settingIcons || {};
        return (sid && icons[sid]) || "";
    }

    /**
     * 面板子项的显示文案：直接复用引擎的 itemLabel，与实际弹出的面板同一套规则，
     * 保证「设置页里看到的条目」= 「外侧真实面板弹出的条目」（所见即所得）。
     */
    private childLabel(c: IButtonConfig): string {
        const fn = (MobileToolbar as any).itemLabel;
        const label = fn ? fn(c) : (c.name || this.describe(c));
        return label || this.t("unnamed", "未命名");
    }

    private describe(def: IButtonConfig): string {
        if (def.type === "builtin") return def.builtinId ? this.actionLabel(def.builtinId) : "";
        if (def.type === "popup") return (def.options || []).map((o) => o.name || o.value).join(" / ");
        if (def.type === "setting") return def.settingId ? this.settingLabel(def.settingId) : "";
        if (def.type === "panel") return (def.children || []).map((c) => this.childLabel(c)).join(" / ");
        return "";
    }

    /**
     * 名称输入框的占位提示 = 「这个按钮会自动显示成什么」。
     * v0.8.9：动作待选 / 面板为空时也给一句实话（而不是干巴巴一个「名称」），
     * 让用户一眼知道「这个按钮还没配置完，点哪里去配」。
     */
    private namePlaceholder(def: IButtonConfig): string {
        const d = this.describe(def);
        if (d) return d;
        if (def.type === "panel") {
            return (def.children || []).length
                ? this.t("name", "名称")
                : this.t("nameEmptyPanel", "名称（面板为空，点下方添加子项）");
        }
        if (def.type === "setting") {
            return def.settingId ? this.settingLabel(def.settingId)
                : this.t("nameNoSetting", "名称（还没选设置项，点下方选择）");
        }
        return this.t("nameNoAction", "名称（还没选动作，点下方选择）");
    }

    /* ---------------------------------------------------------- 编辑区 */

    /**
     * 自管弹窗的内容宿主：思源 Dialog 的结构是 .b3-dialog__container > .b3-dialog__body，
     * 内容模板落在 __body（没有 __content 这一层）。这里按优先级取，并对取不到的情况返回 null
     * 让调用方退回，避免出现空白页。
     */
    private dialogHost(dialog: any): HTMLElement | null {
        const container = dialog.element.querySelector(".b3-dialog__container") as HTMLElement | null;
        if (container) {
            container.style.width = "100%";
            container.style.height = "100%";
            container.style.maxWidth = "100%";
            container.style.maxHeight = "100%";
            container.style.margin = "0";
            container.style.border = "0";
            container.style.borderRadius = "0";
            container.style.boxSizing = "border-box";
        }
        const host = (dialog.element.querySelector(".b3-dialog__body") ||
            dialog.element.querySelector(".b3-dialog__content") || container) as HTMLElement | null;
        if (!host) return null;
        host.style.padding = "0";
        host.style.width = "100%";
        host.style.height = "100%";
        host.style.flex = "1 1 auto";
        host.style.minHeight = "0";
        host.style.overflow = "hidden";
        host.style.display = "flex";
        host.style.flexDirection = "column";
        host.style.boxSizing = "border-box";
        return host;
    }

    /**
     * 顶层按钮的编辑弹窗 —— 设置流程里**唯一**的编辑弹窗。
     *
     * v0.7.0 起面板子项不再进这里：它们在面板页里**行内直改**（见 kidsBlock）。
     * 之前的动线是「设置弹窗 → 编辑弹窗 → 子项编辑页 → 选择器弹窗」四层全屏叠加，
     * 而子项编辑页与面板编辑页共用同一套模板（只少了「面板」一张类型卡），
     * 点进去看不出页面变过，于是产生「套娃」般的迷失感。根因是把「容器」和「列表项」
     * 当成同一类对象来编辑 —— 现在子项编辑降级为「行」，面板与子项之间不再有任何页面跳转。
     *
     * 这一页保留给顶层按钮：它可能是面板 / 动作 / 快捷短语两种类型之一，
     * 字段量与顶层列表里那张卡片不匹配，用一页来编辑是合理的。
     *   · 顶部是该按钮的实时预览（图标 + 名称），改任何字段立刻反映，所见即所得；
     *   · 字段「按需出现」——只显示当前类型真正需要的那一项参数；
     *   · 低频项（长按提示）收进「更多」，默认不占视觉；
     *   · 底部固定 删除 / 完成，手指不用找。
     */
    private openEditor(def: IButtonConfig, siblings: IButtonConfig[]) {
        const dialog = new Dialog({
            title: this.t("editButton", "编辑按钮"),
            content: "",
            width: "100%",
            height: "100%"
        });
        const host = this.dialogHost(dialog);
        if (!host) { dialog.destroy(); return; }
        /* 选择器抽屉要贴着弹窗底部绝对定位 */
        host.style.position = "relative";

        /* 保留原生对话框标题栏（含右上角 ✕ 关闭），不另加页面内导航条 / 左侧返回按钮。
           整页右滑覆盖动画作用于对话框面板（.sy-mb-set__push，见 settings.css），
           从右侧滑入、退出原路滑回；抽屉（图标 / 动作选择器）仍挂在 host 内、
           与编辑内容体（.sy-mb-set-editor）互为兄弟，保证「抽屉贴在编辑弹窗内部、
           不另开弹窗」的不变式成立。 */
        const container = dialog.element.querySelector(".b3-dialog__container") as HTMLElement | null;
        if (container) container.classList.add("sy-mb-set__push");
        /* v0.8.63：自管阴影遮罩（同 openMoreSettings）—— 隐藏 SiYuan 自带 mask，改由
           .sy-mb-set__backdrop 提供纵深。v0.8.67：退出时与面板滑出同步淡出（closeSubPage）。 */
        /* v0.8.63：隐藏 SiYuan 自带遮罩（真机为 .b3-dialog__scrim，个别版本为 .b3-dialog__mask），
           改用我们可控的 .sy-mb-set__backdrop 表达纵深，
           消除「阴影先消失、面板还在滑」的错位。 */
        const scrimEl = dialog.element.querySelector(".b3-dialog__scrim, .b3-dialog__mask") as HTMLElement | null;
        if (scrimEl) scrimEl.style.display = "none";
        const backdrop = h("div", "sy-mb-set__backdrop");
        (container.parentElement || dialog.element).insertBefore(backdrop, container);
        const body = h("div", "sy-mb-set-editor");
        host.appendChild(body);

        const session: any = {
            dialog: dialog,
            host: host,
            page: container,
            body: body
        };
        this.editor = session;

        /* 右上角 ✕ 关闭：改为先滑出再销毁，避免瞬间消失 */
        const closeBtn = dialog.element.querySelector(".b3-dialog__close") as HTMLElement | null;
        if (closeBtn) {
            closeBtn.addEventListener("click", (e: any) => {
                e.preventDefault(); e.stopPropagation();
                this.closeSubPage(dialog, container);
            }, true);
        }

        /* 每次 paint 都会重建这一页的元素，syncPv 指向当前这批（所以是 let 而不是 const） */
        let syncPv: () => void = () => { /* 由 paint 赋值 */ };

        session.paint = () => {
            const cur: IButtonConfig = def;

            body.innerHTML = "";

            /* ① 图标 + 名称 合并一行：图标是可点的方块按钮，名称是有边框底色的输入框，
                  两者等高（48px）严格对齐。行下方只保留一行「怎么改」的提示。 */
            const pv = h("div", "sy-mb-set-editor__pv");
            const pvMain = h("div", "sy-mb-set-editor__pv-main");
            const pvIcon = h("button", "sy-mb-set-editor__pv-icon");
            pvIcon.type = "button";
            pvIcon.title = this.t("pickIconHint", "点击更换图标");
            const pvText = h("div", "sy-mb-set-editor__pv-text");
            const pvName = h("input", "sy-mb-set-editor__pv-name") as HTMLInputElement;
            pvText.appendChild(pvName);
            pvMain.appendChild(pvIcon);
            pvMain.appendChild(pvText);
            pv.appendChild(pvMain);
            pv.appendChild(h("div", "sy-mb-set-editor__pv-hint",
                this.t("pickIconNameHint", "点击方块换图标，点名称框可直接输入名称")));
            body.appendChild(pv);

            syncPv = () => {
                pvIcon.innerHTML = (MobileToolbar as any).iconHtml(cur.icon);
                /* 用户正在输入名称时不回灌，避免丢焦点 */
                if (document.activeElement !== pvName) pvName.value = cur.name;
                if (!cur.name) pvName.placeholder = this.namePlaceholder(cur);
            };
            pvName.value = cur.name;
            pvName.placeholder = this.namePlaceholder(cur);
            pvName.addEventListener("input", () => { cur.name = pvName.value; this.render(); });
            pvIcon.addEventListener("click", () => {
                this.openIconPicker(cur.icon, (v) => {
                    cur.icon = v;
                    pvIcon.innerHTML = (MobileToolbar as any).iconHtml(v);
                    this.render();
                });
            });
            syncPv();

            /* ② 唯一的上下滚动区 + 表单 */
            const scroll = h("div", "sy-mb-set-editor__scroll");
            const form = h("div", "sy-mb-set-editor__form");
            scroll.appendChild(form);
            body.appendChild(scroll);

            /* ③ 底部固定：删除 / 完成（与一级页操作栏同一套按钮规格） */
            const foot = h("div", "sy-mb-set-dlg__foot");
            const delBtn = h("button", "sy-mb-set-btn sy-mb-set-btn--danger", this.t("remove", "删除"));
            delBtn.type = "button";
            const doneBtn = h("button", "sy-mb-set-btn sy-mb-set-btn--primary", this.t("done", "完成"));
            doneBtn.type = "button";
            foot.appendChild(delBtn);
            foot.appendChild(doneBtn);
            body.appendChild(foot);

            /* 结构性变更（换类型 / 增删子按钮）才重画字段区；输入中不重画，避免丢焦点 */
            const redraw = () => {
                form.innerHTML = "";
                this.fillEditorForm(form, cur, syncPv, redraw);
            };
            redraw();

            delBtn.addEventListener("click", () => {
                this.remove(cur, siblings, () => session.close());
            });
            doneBtn.addEventListener("click", () => session.close());
        };

        /* 关闭编辑弹窗（完成 / 右上角 ×）—— 清理与重画交给覆盖后的 destroy */
        session.close = () => {
            if (this.editor !== session) return;
            this.closeSubPage(session.dialog, session.page);
        };

        const origDestroy = dialog.destroy.bind(dialog);
        dialog.destroy = () => {
            if (this.editor === session) this.editor = null;
            origDestroy();
            this.render();
        };

        session.paint();
    }

    private fillEditorForm(form: HTMLElement, def: IButtonConfig, syncPv: () => void, redraw: () => void) {
        /* 轻量变更：只同步预览与列表 */
        const changed = () => { syncPv(); this.render(); };
        /* 结构变更：重画字段区（开了面板 / 换了类型 → 参数区整块换掉） */
        const structural = () => { syncPv(); redraw(); this.render(); };
        /* ① 形态开关：面板是「容器」，层级高于各种行为，单独一行、单独一个开关 */
        form.appendChild(this.modeRow(def, structural));
        if (def.type !== "panel") {
            /* ② 按形态分流：面板 → 只编辑容器里的子项；否则 → 几种行为里选一个再配参数 */
            form.appendChild(this.typeCards(def, structural));
        }
        if (def.type === "panel") {
            form.appendChild(this.panelBlock(def, structural));
        } else {
            form.appendChild(this.paramBlock(def, structural));
        }
        /* ③ 两种形态都用得上的低频项（长按提示） */
        form.appendChild(this.moreBlock(def, changed));
    }

    /**
     * 形态开关：**面板 = 容器**，与「动作 / 快捷短语」两种行为不属于同一层，
     * 所以不再挤进那张四等分的类型卡里，而是单独一行、单独一个开关。
     *
     * 开 → `type = "panel"`，这一页下面变成「面板内容」（可自由添加子项）；
     * 关 → 回到四种直接行为之一（记住关之前选的那种，用不落盘的 `$leafType` 暂存）。
     */
    private modeRow(def: IButtonConfig, onChanged: () => void): HTMLElement {
        const row = h("div", "sy-mb-set-ed__row");
        row.appendChild(h("div", "sy-mb-set-ed__label", this.t("formMode", "按钮形态")));

        const card = h("div", "sy-mb-set-ed__mode" +
            (def.type === "panel" ? " sy-mb-set-ed__mode--on" : ""));
        const icon = h("span", "sy-mb-set-ed__mode-ic");
        icon.innerHTML = TYPE_ICONS.panel;
        const text = h("span", "sy-mb-set-ed__mode-text");
        text.appendChild(h("span", "sy-mb-set-ed__mode-name", this.t("panelMode", "面板（容器）")));
        text.appendChild(h("span", "sy-mb-set-ed__mode-desc",
            this.t("panelModeDesc", "开启后点击弹出子菜单；关闭后是一个直接执行的按钮")));

        const sw = h("input", "b3-switch sy-mb-set-ed__mode-switch") as HTMLInputElement;
        sw.type = "checkbox";
        sw.checked = def.type === "panel";
        sw.setAttribute("aria-label", this.t("panelMode", "面板（容器）"));
        sw.addEventListener("change", () => {
            /* 关掉面板开关时回到之前记住的那种叶子行为（$leafType），
               记不住才退回第一种 —— 不能写死 "builtin"。 */
            const leafs = this.leafTypesNow();
            if (sw.checked) {
                (def as any).$leafType = leafs.indexOf(def.type) >= 0 ? def.type : leafs[0];
                def.type = "panel";
                /* 容器可以是空的：新建按钮打开面板时**不给预设子项**，
                   由用户自己点「＋ 添加子项」挑动作 / 快捷短语。
                   （若原本就有子项 —— 用户自己加的 —— 这里保持不动。） */
                if (!Array.isArray(def.children)) def.children = [];
            } else {
                const back = leafs.indexOf((def as any).$leafType) >= 0 ? (def as any).$leafType : leafs[0];
                def.type = back;
                /* v0.8.9：回到「动作」时**不再自动塞 h1**，保持未选择状态，
                   由「内置动作」那一栏显示「点击选择动作」的占位提示。 */
                if (back === "popup" && !def.options) def.options = [{ name: "选项一", value: "内容一" }];
            }
            onChanged();
        });

        card.appendChild(icon);
        card.appendChild(text);
        card.appendChild(sw);
        row.appendChild(card);
        row.appendChild(h("div", "sy-mb-set-ed__hint", def.type === "panel"
            ? this.t("panelModeHintOn", "面板里可以放任意多个子项，每个子项都能是这三种行为之一（动作 / 设置 / 快捷短语）")
            : this.t("panelModeHintOff", "打开开关即可把这个按钮变成一个弹出子菜单的面板")));
        return row;
    }

    /** 面板内容块（开关打开时出现）：容器里的子项行内直改 */
    private panelBlock(def: IButtonConfig, onChanged: () => void): HTMLElement {
        const row = h("div", "sy-mb-set-ed__row");
        row.appendChild(h("div", "sy-mb-set-ed__label", this.t("panelContent", "面板内容（点此按钮后弹出）")));
        row.appendChild(this.kidsBlock(def, onChanged));
        return row;
    }

    /** 类型：一行排满的可视化卡片（图形 + 名称）—— 两种**叶子行为**
       （面板是容器，不在这里，见 modeRow）。
       等分一行，绝不折行留下空位；具体行为说明收进卡片下方单独一行，避免每张卡里塞小字。 */
       private typeCards(def: IButtonConfig, onChanged: () => void): HTMLElement {
         const row = h("div", "sy-mb-set-ed__row");
         row.appendChild(h("div", "sy-mb-set-ed__label", this.t("whatItDoes", "点击后做什么")));
         let types: TButtonType[] = this.leafTypesNow();
         /* 当前类型不在候选里（老配置 / 导入的旧配置）→ 补上，
           别让用户看到一排「一张都没选中」的卡。 */
        if (def.type !== "panel" && types.indexOf(def.type) < 0) types = types.concat([def.type]);
        const grid = h("div", "sy-mb-set-ed__types");
        /* 按选项数量等分（2→2 列），一行排满，不留空位 */
        grid.style.gridTemplateColumns = "repeat(" + types.length + ", minmax(0, 1fr))";
        const caption = h("div", "sy-mb-set-ed__type-caption");
        const paintCaption = () => {
            caption.textContent = TYPE_LABELS[def.type] + " · " + TYPE_DESC[def.type];
        };
        types.forEach((t) => {
            const card = h("button", "sy-mb-set__seg-btn sy-mb-set-ed__type" +
                (def.type === t ? " sy-mb-set__seg-btn--on" : ""));
            card.type = "button";
            card.setAttribute("data-type", t);
            card.title = TYPE_LABELS[t] + " · " + TYPE_DESC[t];
            card.innerHTML = '<span class="sy-mb-set-ed__type-ic">' + TYPE_ICONS[t] + "</span>" +
                '<span class="sy-mb-set-ed__type-name">' + TYPE_LABELS[t] + "</span>";
            card.addEventListener("click", () => {
                if (def.type === t) return;
                def.type = t;
                /* v0.8.9：**不预置动作**。原先这里会塞一个 "h1"，
                   于是用户刚点「动作」就看到一个「一级标题」躺在那儿，得先删掉才知道能换。
                   现在保持空，由「内置动作」那一栏显示占位提示，选完动作才落地。 */
                if (t === "popup" && !def.options) def.options = [{ name: "选项一", value: "内容一" }];
                paintCaption();
                onChanged();
            });
            grid.appendChild(card);
        });
        paintCaption();
        row.appendChild(grid);
        row.appendChild(caption);
        return row;
    }

    /** 参数区：只出现当前类型真正需要的那一项，其它字段根本不渲染 */
    private paramBlock(def: IButtonConfig, onChanged: () => void): HTMLElement {
        if (def.type === "builtin") {
            const row = h("div", "sy-mb-set-ed__row");
            row.appendChild(h("div", "sy-mb-set-ed__label", this.t("builtinAction", "内置动作")));
            row.appendChild(this.actionButton(def, onChanged));
            return row;
        }
        if (def.type === "setting") {
            const row = h("div", "sy-mb-set-ed__row");
            row.appendChild(h("div", "sy-mb-set-ed__label", this.t("settingItem", "设置项")));
            row.appendChild(this.settingButton(def, onChanged));
            return row;
        }
        /* 快捷短语（popup）：与面板子项的展开区共用 typeParam 这一份
           （面板不在这里 —— 它是容器，走 modeRow + panelBlock） */
        return this.typeParam(def) || h("div", "sy-mb-set-ed__row");
    }

    /**
     * 「快捷短语（popup）」这类非动作类型的参数控件。
     * 顶层编辑页与**面板子项的展开区**共用这一份，同一套字段不写两遍。
     * 返回值已是一整块 `.sy-mb-set-ed__row`（含标题与提示）；动作与面板返回 null，由调用方各自渲染。
     *
     * 输入即改、**不重画表单**（只同步顶层列表副标题）—— 之前这里回调的是 structural，
     * 每敲一个字都重建表单，输入框会当场掉焦点。
     */
    private typeParam(def: IButtonConfig): HTMLElement | null {
        if (def.type === "popup") {
            const row = h("div", "sy-mb-set-ed__row");
            row.appendChild(h("div", "sy-mb-set-ed__label", this.t("popupOptions", "短语列表")));
            row.appendChild(this.optionsEditor(def));
            row.appendChild(h("div", "sy-mb-set-ed__hint",
                this.t("popupOptionsTip", "名称即显示文字，内容即插入文字；支持 {{date}} 等占位符")));
            return row;
        }

        return null;
    }

    /**
     * 「内置动作」大按钮：图标 + 动作名 + ›，点开动作库。
     *
     * v0.8.9：新增按钮**不再预置动作**，所以没选动作时这一栏不能显示某个动作名，
     * 而是显示占位提示「点击选择动作」并用待选态样式（虚线框 + 浅色）——
     * 让「这里还什么都没选」一眼可见，而不是让用户以为默认就是「一级标题」。
     * 选完动作后才显示真实的官方图标与动作名。
     */
    private actionButton(def: IButtonConfig, onChanged: () => void): HTMLElement {
        const btn = h("button", "sy-mb-set-ed__action");
        btn.type = "button";
        const paint = () => {
            /* 没选动作：占位提示，不显示任何动作名 */
            if (!def.builtinId) {
                btn.classList.add("sy-mb-set-ed__action--empty");
                btn.innerHTML = '<span class="sy-mb-set-ed__action-ic sy-mb-set-ed__action-ic--empty"></span>' +
                    '<span class="sy-mb-set-ed__action-name sy-mb-set-ed__action-name--empty">' +
                    escHtml(this.t("pickActionHint", "点击选择动作")) +
                    '</span><span class="sy-mb-set-ed__action-more">›</span>';
                return;
            }
            btn.classList.remove("sy-mb-set-ed__action--empty");
            btn.innerHTML = '<span class="sy-mb-set-ed__action-ic">' +
                (MobileToolbar as any).iconHtml(this.actionIcon(def.builtinId) || "iconList") +
                '</span><span class="sy-mb-set-ed__action-name">' + escHtml(this.actionLabel(def.builtinId)) +
                '</span><span class="sy-mb-set-ed__action-more">›</span>';
        };
        paint();
        btn.addEventListener("click", () => this.openActionPicker(def.builtinId, (v) => {
            def.builtinId = v;
            /* 动作定了，图标跟着走 —— 但只在用户还没自己挑过图标时才换（尊重用户选择） */
            if (!def.icon || def.icon === NEW_BUTTON_ICON) def.icon = this.actionIcon(v) || NEW_BUTTON_ICON;
            paint();
            onChanged();
        }, this.t("pickAction", "选择动作")));
        return btn;
    }

    /**
     * 「设置项」大按钮：与「内置动作」同款外观（图标 + 设置项名 + ›），点开设置项库。
     *
     * 未选设置项时显示占位提示「点击选择设置项」并用待选态样式（虚线框 + 浅色），
     * 与「内置动作」的待选态同一套 class（sy-mb-set-ed__action--empty），复用其样式，无需新增 CSS。
     * 选完设置项后才显示真实的设置图标与名称。构建方式完全参照「动作」。 */
    private settingButton(def: IButtonConfig, onChanged: () => void): HTMLElement {
        const btn = h("button", "sy-mb-set-ed__action");
        btn.type = "button";
        const paint = () => {
            if (!def.settingId) {
                btn.classList.add("sy-mb-set-ed__action--empty");
                btn.innerHTML = '<span class="sy-mb-set-ed__action-ic sy-mb-set-ed__action-ic--empty"></span>' +
                    '<span class="sy-mb-set-ed__action-name sy-mb-set-ed__action-name--empty">' +
                    escHtml(this.t("pickSettingHint", "点击选择设置项")) +
                    '</span><span class="sy-mb-set-ed__action-more">›</span>';
                return;
            }
            btn.classList.remove("sy-mb-set-ed__action--empty");
            btn.innerHTML = '<span class="sy-mb-set-ed__action-ic">' +
                (MobileToolbar as any).iconHtml(this.settingIcon(def.settingId) || "iconSettings") +
                '</span><span class="sy-mb-set-ed__action-name">' + escHtml(this.settingLabel(def.settingId)) +
                '</span><span class="sy-mb-set-ed__action-more">›</span>';
        };
        paint();
        btn.addEventListener("click", () => this.openSettingPicker(def.settingId, (v) => {
            def.settingId = v;
            /* 设置项定了，图标跟着走 —— 但只在用户还没自己挑过图标时才换（尊重用户选择） */
            if (!def.icon || def.icon === NEW_BUTTON_ICON || def.icon === "iconSettings") {
                def.icon = this.settingIcon(v) || "iconSettings";
            }
            paint();
            onChanged();
        }, this.t("pickSetting", "选择设置项")));
        return btn;
    }


    /** 快捷短语的选项编辑：一行一条（名称 / 短语内容），可增删，不再用多行文本猜格式 */
    private optionsEditor(def: IButtonConfig): HTMLElement {
        const box = h("div", "sy-mb-set-ed__opts");
        const draw = () => {
            box.innerHTML = "";
            const opts = def.options || (def.options = []);
            if (!opts.length) box.appendChild(h("div", "sy-mb-set__empty sy-mb-set__empty--mini",
                this.t("noOptions", "还没有选项，点下方添加")));
            opts.forEach((o, i) => {
                const line = h("div", "sy-mb-set-ed__opt");
                const nameIn = h("input", "b3-text-field sy-mb-set-ed__opt-name") as HTMLInputElement;
                nameIn.value = o.name || "";
                nameIn.placeholder = this.t("optionName", "名称");
                nameIn.addEventListener("input", () => { o.name = nameIn.value; this.render(); });
                const valIn = h("input", "b3-text-field sy-mb-set-ed__opt-value") as HTMLInputElement;
                valIn.value = o.value || "";
                valIn.placeholder = this.t("optionValue", "短语内容");
                valIn.addEventListener("input", () => { o.value = valIn.value; this.render(); });
                const del = h("button", "sy-mb-set-ed__opt-del", "×");
                del.type = "button";
                del.title = this.t("removeOption", "删除此选项");
                del.addEventListener("click", () => { opts.splice(i, 1); draw(); this.render(); });
                line.appendChild(nameIn);
                line.appendChild(valIn);
                line.appendChild(del);
                box.appendChild(line);
            });
            const add = this.toolBtn(this.t("addOption", "＋ 添加选项"), () => {
                def.options = def.options || [];
                def.options.push({ name: "", value: "" });
                draw();
                this.render();
            }, "sy-mb-set-btn--block");
            box.appendChild(add);
        };
        draw();
        return box;
    }

    /**
     * 面板子项：**行内直改**（v0.7.0 动线重做，取代原来的「子项编辑页」）。
     *
     * 旧版点一个子项会进入子编辑页，而那一页与面板编辑页共用同一套模板（只少了「面板」
     * 一张类型卡），点进去看不出页面变过 —— 这就是「套娃般迷失感」的来源。根因是把
     * 「容器」和「列表项」当成同一类对象来编辑：容器配得上一个页面，而列表项在真实面板里
     * 本来就只是一行「图标 + 名字」。所以这里把子项编辑降级为「行」（v0.8.6 起两种行式样，
     * 与顶层编辑页统一，详见 kidRow）：
     *   · 官方动作行 → 思源图标 + 官方名 + ›，点行换动作，图标名字跟着动作走；
     *   · 自定义行 → 图标方块点开图标抽屉、名称就是输入框、行为按钮点开动作抽屉；
     *   · ⋯ → 就地展开「这一行的设置」：类型切换 / 参数 / 长按提示 / 删除。
     * 面板页与子项之间**不再有任何页面跳转**。
     */
    private kidsBlock(def: IButtonConfig, onChanged: () => void): HTMLElement {
        const out = h("div", "sy-mb-set-ed__kids");
        const box = h("div", "sy-mb-set__kids");
        /* 轻量变更（改名 / 换图标 / 换动作）只同步顶层列表；结构变更（增删 / 换类型）才重画表单 */
        const light = () => this.render();

        const draw = () => {
            box.innerHTML = "";
            const kids = def.children || (def.children = []);
            if (!kids.length) {
                /* v0.8.9：新建按钮的面板是空的。空态要明确告诉用户「这里什么都没有，
                   请用下面的按钮自己加」，而不是让人以为面板加载失败。 */
                box.appendChild(h("div", "sy-mb-set__empty sy-mb-set__empty--mini",
                    this.t("noChildrenNew", "面板是空的 —— 点下方「＋ 添加子项」挑一个动作或快捷短语")));
            }
            kids.forEach((c) => box.appendChild(this.kidRow(c, kids, box, light, onChanged)));
        };
        draw();
        out.appendChild(box);
        /* 一行提示，把「行内直改」这件事讲明白（这是本版动线改动的关键，不说用户想不到） */
        out.appendChild(h("div", "sy-mb-set-ed__hint", this.t("kidInlineHint",
            "动作子项直接使用思源的图标与名称，点行即可换动作；快捷短语等自定义子项在本页直接改名改内容")));

        /* 「＋ 添加子项」：**先选类型、再落地** —— 选完图标 / 名称 / 行为一次配好，
           不离开面板页，也不会先冒出一个「待编辑」的空行。
           弹出的选择器带两个分页（动作 / 快捷短语），
           面板里想放什么子项都直接在这里挑，不必先加一个动作再改类型。 */
        out.appendChild(this.toolBtn(this.t("addChild", "＋ 添加子项"), () => {
            this.openAddChildPicker((child) => {
                def.children = def.children || [];
                def.children.push(child);
                onChanged();
            });
        }, "sy-mb-set-btn--block"));
        return out;
    }

    /** 按类型造一个「已配好默认值」的新子项（图标 / 名称 / 行为一次到位） */
    private newChild(type: TButtonType, builtinId?: string, settingId?: string): IButtonConfig {
        const child: IButtonConfig = {
            id: uid("ch"),
            name: "",
            type: type,
            icon: (type === "builtin" && builtinId) ? (this.actionIcon(builtinId) || "iconList")
                : (type === "setting" && settingId) ? (this.settingIcon(settingId) || "iconSettings")
                    : CHILD_DEFAULT_ICON[type],
            tip: "",
            enabled: true
        };
        if (type === "builtin") child.builtinId = builtinId || "h1";
        if (type === "popup") child.options = [{ name: "选项一", value: "内容一" }];
        if (type === "setting") child.settingId = settingId || "";
        return child;
    }

    /**
     * 「添加子项」选择器：**分页 = 当前标签页下面板子项可选的行为**。
     *
     * 旧版点「＋」直接弹动作库，于是「面板里只能加动作」—— 想要一个插入短语的子项，
     * 得先加一个动作、再进「⋯」把它改成「快捷短语」，绕一大圈。这里把各种行为
     * 平铺成分页，想加什么直接选：
     *   · 动作 → 图标网格，点一个动作即可；
     *   · 设置 → 图标网格，点一个设置项即可；
     *   · 快捷短语 → 填短语列表（每行「名称|内容」，支持 {{date}} 等占位符）。
     * 各分页产出的都是标准的子项定义，落地后照样能在行内继续改。
     */
    private openAddChildPicker(onCreate: (child: IButtonConfig) => void) {
        const title = this.t("addChild", "＋ 添加子项");
        this.presentOrDialog(title, (host, close) => {
            const tabs = h("div", "sy-mb-set-tabs");
            const pane = h("div", "sy-mb-set-tabpane");
            host.appendChild(tabs);
            host.appendChild(pane);

            let cur: TButtonType = this.childTypesNow()[0];
            const finish = (child: IButtonConfig) => { close(); onCreate(child); };

            const paintTabs = () => {
                tabs.innerHTML = "";
                this.childTypesNow().forEach((t) => {
                    const b = h("button", "sy-mb-set-tab" +
                        (cur === t ? " sy-mb-set-tab--on" : ""));
                    b.type = "button";
                    b.setAttribute("data-tab", t);
                    b.textContent = TYPE_LABELS[t];
                    b.addEventListener("click", () => {
                        if (cur === t) return;
                        cur = t;
                        paintTabs();
                        paintPane();
                    });
                    tabs.appendChild(b);
                });
            };

            const paintPane = () => {
                pane.innerHTML = "";
                /* ① 动作：图标网格，点一个动作即落地 */
                if (cur === "builtin") {
                    pane.appendChild(this.actionGrid("", (v) => finish(this.newChild("builtin", v))));
                    return;
                }
                /* ①-2 设置：图标网格，点一个设置项即落地（与动作同款交互） */
                if (cur === "setting") {
                    pane.appendChild(this.settingGrid("", (v) => finish(this.newChild("setting", undefined, v))));
                    return;
                }
                /* ② 快捷短语：一个表单 + 一个「添加」 */
                const wrap = h("div", "sy-mb-set-tabform");
                let getValue: () => string;
                let take: (v: string) => IButtonConfig;
                wrap.appendChild(h("div", "sy-mb-set-ed__label", this.t("popupOptions", "短语列表")));
                const ta = h("textarea", "b3-text-field sy-mb-set-ed__area") as HTMLTextAreaElement;
                ta.rows = 5;
                ta.placeholder = "待办|- [ ] {C}\n今日|{{date}}";
                wrap.appendChild(ta);
                wrap.appendChild(h("div", "sy-mb-set-ed__hint",
                    this.t("popupOptionsTip", "每行一条，格式「名称|插入内容」；不写竖线则名称即内容。支持 {{date}} 等占位符")));
                getValue = () => ta.value;
                take = (v) => {
                    const c = this.newChild("popup");
                    const opts = textToOptions(v);
                    c.options = opts.length ? opts : c.options;
                    return c;
                };
                const add = h("button", "sy-mb-set-btn sy-mb-set-btn--primary sy-mb-set-btn--block");
                add.type = "button";
                add.textContent = this.t("addChild", "＋ 添加子项");
                add.addEventListener("click", () => {
                    const v = String(getValue() || "").trim();
                    /* 快捷短语必须有值，否则落到配置里也会在下次加载时被清掉（空则给默认选项） */
                    if (!v) {
                        showMessage(this.t("emptyOptions", "请先填写短语列表"), 4000, "error");
                        return;
                    }
                    finish(take(v));
                });
                const bar = h("div", "sy-mb-set-tabform__foot");
                bar.appendChild(add);
                wrap.appendChild(bar);
                pane.appendChild(wrap);
            };

            paintTabs();
            paintPane();
        });
    }

    /**
     * 一个子项 = 一行，**行本身就是编辑器**（v0.8.6 起分两种行式样，与顶层编辑页统一）：
     *   · 官方动作行 —— 内置动作且未改名（自研动作除外）：与顶层「内置动作」同款
     *     大按钮（思源图标 + 官方名 + ›），点了换动作；**不再提供改名 / 独立换图标**。
     *   · 自定义行 —— 快捷短语、自研动作（日期 / 时间 / 日期时间）、用户改过名的动作：
     *     图标可换、名称可改、行尾行为按钮，维持 v0.7.0 的行内直改。
     * 低频项（类型、参数、长按提示、删除）一律收进行尾「⋯」就地展开，不离开面板页。
     */
    private kidRow(c: IButtonConfig, kids: IButtonConfig[], box: HTMLElement,
                   light: () => void, structural: () => void): HTMLElement {
        const item = h("div", "sy-mb-set__kid" + (c.enabled === false ? " sy-mb-set__kid--off" : ""));
        item.setAttribute("data-id", c.id);

        const line = h("div", "sy-mb-set__kid-row");

        /* ① 拖拽手柄：行里有输入框，不能再整行可拖，所以给一个显式手柄 */
        const drag = h("span", "sy-mb-set__kid-drag");
        drag.title = this.t("dragTip", "按住拖动可调整顺序");
        drag.innerHTML = '<svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor">' +
            '<circle cx="7" cy="6" r="1.3"/><circle cx="13" cy="6" r="1.3"/>' +
            '<circle cx="7" cy="10" r="1.3"/><circle cx="13" cy="10" r="1.3"/>' +
            '<circle cx="7" cy="14" r="1.3"/><circle cx="13" cy="14" r="1.3"/></svg>';
        this.bindDrag(drag, item, box, kids, "sy-mb-set__kid");
        line.appendChild(drag);

        /* 展开区容器先建好（官方行 / 自定义行共用）：低频项收在行尾「⋯」里 */
        const panel = h("div", "sy-mb-set__kid-ed fn__none");
        const setOpen = (open: boolean) => {
            panel.classList.toggle("fn__none", !open);
            item.classList.toggle("sy-mb-set__kid--open", open);
        };

        if (this.officialKid(c)) {
            /* ②③④ 官方行（v0.8.6）：与顶层「内置动作」同款 —— 图标 + 官方名 + ›，
               整块是一个按钮，点了开动作库换动作。
               不提供改名与独立换图标：图标与名字**跟随动作本身**（即「用 APP 的
               功能图标与名称」），旧配置里被改过的图标在此一并归一（幂等）。
               快捷短语、自研动作、用户改过名的子项不走这条线（见 officialKid）。 */
            const canonIcon = () => this.actionIcon(c.builtinId);
            const canonName = () => this.actionLabel(c.builtinId);
            const offIcon = canonIcon();
            if (offIcon && c.icon !== offIcon) c.icon = offIcon;
            /* 旧版占位短名（H1..H6、思维导图）是自动生成的官方名，不是用户起的 ——
               在此一并归一清空，让位给规范动作名（与引擎 itemLabel 同一规则） */
            const legacyMap: any = (MobileToolbar as any).legacyKidNames || {};
            if (c.name && legacyMap[c.builtinId || ""] === c.name) c.name = "";
            const main = h("button", "sy-mb-set__kid-main sy-mb-set-ed__action");
            main.type = "button";
            main.title = this.t("pickAction", "选择动作");
            const paintMain = () => {
                main.innerHTML = '<span class="sy-mb-set-ed__action-ic">' +
                    (MobileToolbar as any).iconHtml(canonIcon() || "iconList") +
                    '</span><span class="sy-mb-set-ed__action-name">' +
                    escHtml(canonName()) +
                    '</span><span class="sy-mb-set-ed__action-more">›</span>';
            };
            paintMain();
            main.addEventListener("click", () => {
                /* 换动作即整套归一：动作 id、图标、名称一起跟随新动作 */
                const apply = (v: string) => {
                    c.builtinId = v;
                    c.name = "";
                    const next = canonIcon();
                    if (next) c.icon = next;
                    paintMain();
                    light();
                };
                this.openActionPicker(c.builtinId, apply, this.t("pickAction", "选择动作"));
            });
            line.appendChild(main);
        } else {
            /* ② 图标：点开图标抽屉，原地生效（不再需要「进编辑页 → 再点图标」两步） */
            const ic = h("button", "sy-mb-set__kid-ic");
            ic.type = "button";
            ic.title = this.t("pickIconHint", "点击更换图标");
            ic.innerHTML = (MobileToolbar as any).iconHtml(c.icon);
            ic.addEventListener("click", () => {
                this.openIconPicker(c.icon, (v) => {
                    c.icon = v;
                    ic.innerHTML = (MobileToolbar as any).iconHtml(v);
                    light();
                });
            });
            line.appendChild(ic);

            /* ③ 名称：就是输入框，直接打字；空着时占位符说明它实际会显示成什么 */
            const nameIn = h("input", "sy-mb-set__kid-name") as HTMLInputElement;
            nameIn.value = c.name || "";
            nameIn.placeholder = this.fallbackLabel(c);
            nameIn.addEventListener("input", () => { c.name = nameIn.value; light(); });
            line.appendChild(nameIn);

            /* ④ 行为：动作 → 直接开抽屉换；快捷短语 → 就地展开参数 */
            const act = h("button", "sy-mb-set__kid-act");
            act.type = "button";
            const paintAct = () => {
                act.textContent = c.type === "builtin" ? this.actionLabel(c.builtinId)
                    : c.type === "setting" ? (this.settingLabel(c.settingId) || TYPE_LABELS[c.type])
                        : TYPE_LABELS[c.type];
                act.title = this.t("whatItDoes", "点击后做什么") + "：" + this.describe(c);
            };
            paintAct();
            act.addEventListener("click", () => {
                if (c.type === "builtin") {
                    this.openActionPicker(c.builtinId, (v) => {
                        c.builtinId = v;
                        const next = this.actionIcon(v);
                        if (next) { c.icon = next; ic.innerHTML = (MobileToolbar as any).iconHtml(next); }
                        paintAct();
                        light();
                    }, this.t("pickAction", "选择动作"));
                    return;
                }
                if (c.type === "setting") {
                    this.openSettingPicker(c.settingId, (v) => {
                        c.settingId = v;
                        const next = this.settingIcon(v);
                        if (next) { c.icon = next; ic.innerHTML = (MobileToolbar as any).iconHtml(next); }
                        paintAct();
                        light();
                    }, this.t("pickSetting", "选择设置项"));
                    return;
                }
                setOpen(true);
            });
            line.appendChild(act);
        }

        /* ⑤ ⋯ 这一行的设置：类型切换 / 参数 / 长按提示 / 删除 */
        const more = h("button", "sy-mb-set__kid-more");
        more.type = "button";
        more.title = this.t("kidRowMore", "这一行的设置");
        more.setAttribute("aria-label", this.t("kidRowMore", "这一行的设置"));
        more.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" fill="currentColor">' +
            '<circle cx="10" cy="4.6" r="1.6"/><circle cx="10" cy="10" r="1.6"/>' +
            '<circle cx="10" cy="15.4" r="1.6"/></svg>';
        more.addEventListener("click", () => setOpen(panel.classList.contains("fn__none")));
        line.appendChild(more);

        /* 展开区：类型切换 + 当前类型的参数 + 长按提示 + 删除。
           当前类型不在候选里（老配置 / 导入的数据）时补上它，避免一排卡全都没选中。 */
        const types = h("div", "sy-mb-set__kid-ed__types");
        let chipTypes = this.childTypesNow();
        if (chipTypes.indexOf(c.type) < 0) chipTypes = chipTypes.concat([c.type]);
        chipTypes.forEach((t) => {
            const chip = h("button", "sy-mb-set__seg-btn sy-mb-set__kid-ed__type" +
                (c.type === t ? " sy-mb-set__seg-btn--on" : ""));
            chip.type = "button";
            chip.setAttribute("data-type", t);
            chip.textContent = TYPE_LABELS[t];
            chip.addEventListener("click", () => {
                if (c.type === t) return;
                c.type = t;
                if (t === "builtin" && !c.builtinId) c.builtinId = "h1";
                if (t === "popup" && !c.options) c.options = [{ name: "选项一", value: "内容一" }];
                if (t === "setting" && !c.settingId) c.settingId = "";
                structural();
            });
            types.appendChild(chip);
        });
        panel.appendChild(this.field(this.t("whatItDoes", "点击后做什么"), types));
        panel.appendChild(this.kidParam(c));

        const tipIn = h("input", "b3-text-field sy-mb-set-ed__input") as HTMLInputElement;
        tipIn.value = c.tip || "";
        tipIn.placeholder = this.fallbackLabel(c);
        tipIn.addEventListener("input", () => { c.tip = tipIn.value; light(); });
        panel.appendChild(this.field(this.t("btnTip", "长按提示"), tipIn,
            this.t("btnTipTip", "留空则自动使用「按钮名称 / 动作名」")));

        const del = h("button", "sy-mb-set-ed__delbtn", this.t("remove", "删除这个子按钮"));
        del.type = "button";
        del.addEventListener("click", () => {
            const i = kids.indexOf(c);
            if (i >= 0) kids.splice(i, 1);
            structural();
        });
        panel.appendChild(del);

        item.appendChild(line);
        item.appendChild(panel);
        return item;
    }

    /**
     * 这个子项是否按「官方动作行」展示：内置动作 + 非自研 + 没被用户改过名。
     * 「官方名」有三处来源 —— 动作注册表 ACTION_NAMES（如 quote → 引述块）、
     * 面板预设条目名（如插入面板的「模板 / 表格 / 数据库」，与思源斜杠菜单一致、
     * 比 ACTION_NAMES 的长描述更短），以及旧版默认写死的占位短名
     * （v0.4 的 "H1".."H6"、旧页签面板的「思维导图」，见引擎 LEGACY_KID_NAMES）——
     * 这些都是当年自动生成的官方名，不是用户起的自定义名（v0.8.7 修正）。
     */
    private officialKid(c: IButtonConfig): boolean {
        if (c.type !== "builtin") return false;
        if (SELF_ACTIONS.indexOf(c.builtinId || "") >= 0) return false;
        const name = (c.name || "").trim();
        if (!name) return true;
        if (this.actionLabel(c.builtinId) === name) return true;
        const legacyMap: any = (MobileToolbar as any).legacyKidNames || {};
        if (legacyMap[c.builtinId || ""] === name) return true;
        const presets: any = (MobileToolbar as any).panelPresets
            ? (MobileToolbar as any).panelPresets() : {};
        const keys = Object.keys(presets);
        for (let i = 0; i < keys.length; i++) {
            const arr: any[] = presets[keys[i]] || [];
            if (arr.some((p: any) => p.builtinId === c.builtinId &&
                (p.name || "").trim() === name)) return true;
        }
        return false;
    }

    /** 子项展开区里「当前类型的参数」：动作在行上就能换，这里只补快捷短语 */
    private kidParam(c: IButtonConfig): HTMLElement {
        const box = h("div", "sy-mb-set__kid-ed__param");
        const p = this.typeParam(c);
        if (p) box.appendChild(p);
        return box;
    }

    /** 子项没起名字时，它实际会显示成什么（名称框与长按提示的占位符共用） */
    private fallbackLabel(c: IButtonConfig): string {
        return this.describe(c) || this.t("name", "名称");
    }

    /** 低频字段收进「更多」，默认折叠，不占视觉 */
    private moreBlock(def: IButtonConfig, onChanged: () => void): HTMLElement {
        const row = h("div", "sy-mb-set-ed__row sy-mb-set-ed__more");
        const head = h("button", "sy-mb-set-ed__more-head");
        head.type = "button";
        head.textContent = this.t("more", "更多设置（长按提示…）");
        const inner = h("div", "sy-mb-set-ed__more-body fn__none");
        const input = h("input", "b3-text-field sy-mb-set-ed__input") as HTMLInputElement;
        input.value = def.tip || "";
        input.addEventListener("input", () => { def.tip = input.value; onChanged(); });
        inner.appendChild(this.field(this.t("btnTip", "长按提示"), input,
            this.t("btnTipTip", "留空则自动使用「按钮名称 / 动作名」")));
        head.addEventListener("click", () => {
            inner.classList.toggle("fn__none");
            row.classList.toggle("sy-mb-set-ed__more--open");
        });
        row.appendChild(head);
        row.appendChild(inner);
        return row;
    }

    /* 类型参数区与面板子按钮区已改为编辑页内的 paramBlock / kidsBlock（见「顶层按钮的编辑弹窗」
       与「面板子项」两节），列表里不再原地展开任何表单。 */

    /**
     * 选择器承载层：在**当前编辑弹窗内**从底部滑入一个抽屉，选完自动收起。
     *
     * 旧版图标 / 动作选择器各自 `new Dialog(...)`，于是在「设置弹窗 → 编辑弹窗」之上
     * 又叠了第三层弹窗，还带自己的遮罩和标题栏 —— 这正是「套娃感」的主要来源。
     * 改成抽屉后，编辑弹窗仍是唯一一层，选择器只是它内部的一张浮层。
     *
     * @returns `{ body, dismiss }`：body 是抽屉内容区（调用方往里面塞 DOM），
     *          dismiss 手动收起；没有编辑会话时返回 null。
     */
    private presentLayer(title: string): { body: HTMLElement; dismiss: () => void } | null {
        const session = this.editor;
        if (!session) return null;

        const layer = h("div", "sy-mb-set-drawer");
        const scrim = h("div", "sy-mb-set-drawer__scrim");
        const sheet = h("div", "sy-mb-set-drawer__sheet");
        const head = h("div", "sy-mb-set-drawer__head");
        head.appendChild(h("div", "sy-mb-set-drawer__title", title));
        const close = h("button", "sy-mb-set-drawer__close", "✕");
        close.type = "button";
        close.title = this.t("cancel", "取消");
        close.setAttribute("aria-label", this.t("cancel", "取消"));
        head.appendChild(close);
        const body = h("div", "sy-mb-set-drawer__body");
        sheet.appendChild(head);
        sheet.appendChild(body);
        layer.appendChild(scrim);
        layer.appendChild(sheet);

        const dismiss = () => { if (layer.parentNode) layer.parentNode.removeChild(layer); };
        scrim.addEventListener("click", dismiss);
        close.addEventListener("click", dismiss);
        session.host.appendChild(layer);
        return { body, dismiss };
    }

    /**
     * 统一的「先试抽屉、抽屉不可用再退弹窗」入口。
     * 抽屉是常态（编辑弹窗内滑出，不叠层）；弹窗只是没有编辑会话时的兜底，
     * 保证任何调用路径都不会「点了没反应」。
     */
    private presentOrDialog(title: string, build: (host: HTMLElement, close: () => void) => void) {
        const layer = this.presentLayer(title);
        if (layer) { build(layer.body, layer.dismiss); return; }
        const dialog = new Dialog({ title: title, content: "", width: "90vw", height: "72vh" });
        const host = (dialog.element.querySelector(".b3-dialog__body") ||
            dialog.element) as HTMLElement;
        /* 与抽屉内容区同一套布局约束，让里面的网格 / 分页照常撑满并各自滚动 */
        host.style.padding = "0";
        host.style.display = "flex";
        host.style.flexDirection = "column";
        host.style.overflow = "hidden";
        host.style.boxSizing = "border-box";
        build(host, () => dialog.destroy());
    }

    /**
     * 动作库网格（DOM 版）：每格是「真实图标 + 动作名」，所见即所得。
     *
     * 只列**叶子动作**。面板预设（headingPanel / listPanel …）不再出现在这里 ——
     * 面板是容器、由开关控制，不该和动作混在一个下拉里。仅当某个历史配置恰好把
     * builtinId 指向了面板预设时，才把它所在的「面板预设」组一并列出，让用户能改回叶子动作。
     */
    private actionGrid(current: string, onPick: (v: string) => void): HTMLElement {
        const opts: any = (MobileToolbar as any).builtinOptions
            ? (MobileToolbar as any).builtinOptions()
            : { leaf: [], panel: [] };
        const box = h("div", "sy-mb-set__pick");
        const addGroup = (title: string, arr: any[]) => {
            if (!arr || !arr.length) return;
            box.appendChild(h("div", "sy-mb-set__pick-title", title));
            const grid = h("div", "sy-mb-set__pick-grid");
            arr.forEach((o: any) => {
                const b = h("button", "sy-mb-set__pick-cell" +
                    (o.value === current ? " sy-mb-set__pick-cell--on" : ""));
                b.type = "button";
                b.setAttribute("data-action", o.value);
                b.setAttribute("data-pick", o.value);
                b.innerHTML = '<span class="sy-mb-set__pick-ic">' +
                    (MobileToolbar as any).iconHtml(this.actionIcon(o.value) || "iconList") + "</span>" +
                    '<span class="sy-mb-set__pick-name">' + escHtml(o.label) + "</span>";
                b.addEventListener("click", () => onPick(o.value));
                grid.appendChild(b);
            });
            box.appendChild(grid);
        };
        /* 兼容历史配置：当前值若是一个面板预设，才把面板预设组一并列出 */
        const legacyPanel = (opts.panel || []).some((o: any) => o.value === current);
        if (legacyPanel) addGroup(this.t("groupPanel", "面板预设（点击后弹出子面板）"), opts.panel);
        addGroup(this.t("groupLeaf", "直接动作"), opts.leaf);
        return box;
    }

    /**
     * 动作库选择器：网格铺在抽屉里，点一格即回传并收起。
     * （旧版这里是原生 select 文字下拉 / 字符串拼 HTML，现在统一走 actionGrid 的 DOM 版）
     */
    private openActionPicker(current: string, cb: (v: string) => void, title?: string) {
        const pickTitle = title || this.t("pickAction", "选择动作");
        this.presentOrDialog(pickTitle, (host, close) => {
            host.appendChild(this.actionGrid(current, (v) => { close(); cb(v); }));
        });
    }

    /**
     * 设置项网格（DOM 版）：与动作库网格同款（真实图标 + 设置项名），所见即所得。
     * v0.8.13 起数据来自引擎 settingGroups()——真机优先枚举思源主菜单 #menu 的
     * 实际分组与条目（导航 / 创建 / 数据管理 / 设置…），拿不到再退回静态注册表，
     * 分组标题与宿主菜单完全一致，不另写一遍。
     */
    private settingGrid(current: string, onPick: (v: string) => void): HTMLElement {
        const mt: any = MobileToolbar as any;
        const groups: any[] = mt.settingGroups ? mt.settingGroups() : [];
        const total = groups.reduce((n, g) => n + (g.items || []).length, 0);
        const box = h("div", "sy-mb-set__pick");
        if (!total) {
            box.appendChild(h("div", "sy-mb-set__empty sy-mb-set__empty--mini",
                this.t("noSettingYet", "还没有可添加的设置项")));
            return box;
        }
        groups.forEach((g) => {
            const items: any[] = g.items || [];
            if (!items.length) return;
            if (g.title) box.appendChild(h("div", "sy-mb-set__pick-title", g.title));
            const grid = h("div", "sy-mb-set__pick-grid");
            items.forEach((o: any) => {
                const b = h("button", "sy-mb-set__pick-cell" +
                    (o.value === current ? " sy-mb-set__pick-cell--on" : ""));
                b.type = "button";
                b.setAttribute("data-setting", o.value);
                b.setAttribute("data-pick", o.value);
                b.innerHTML = '<span class="sy-mb-set__pick-ic">' +
                    mt.iconHtml(this.settingIcon(o.value) || "iconSettings") + "</span>" +
                    '<span class="sy-mb-set__pick-name">' + escHtml(o.label) + "</span>";
                b.addEventListener("click", () => onPick(o.value));
                grid.appendChild(b);
            });
            box.appendChild(grid);
        });
        return box;
    }

    /** 设置项选择器：网格铺在抽屉里，点一格即回传并收起（与 openActionPicker 同款） */
    private openSettingPicker(current: string, cb: (v: string) => void, title?: string) {
        const pickTitle = title || this.t("pickSetting", "选择设置项");
        this.presentOrDialog(pickTitle, (host, close) => {
            host.appendChild(this.settingGrid(current, (v) => { close(); cb(v); }));
        });
    }

    private textInput(value: string, onInput: (v: string) => void, placeholder?: string): HTMLInputElement {
        const input = h("input", "b3-text-field fn__block") as HTMLInputElement;
        input.value = value;
        if (placeholder) input.placeholder = placeholder;
        input.addEventListener("input", () => onInput(input.value));
        return input;
    }

    private field(label: string, control: HTMLElement, desc?: string): HTMLElement {
        const wrap = h("div", "sy-mb-set__field");
        wrap.appendChild(h("div", "sy-mb-set__label", label));
        wrap.appendChild(control);
        if (desc) wrap.appendChild(h("div", "sy-mb-set__desc", desc));
        return wrap;
    }

    /* ---------------------------------------------------------- 拖拽排序 */

    /**
     * 在手柄上按住拖动即可调整顺序（v0.8.67 重写）。
     *
     * 旧实现三个硬伤，正是「拖一下就变成上下滑动、顺序调不动」的根因：
     *   ① 只在手柄上听 pointermove/up，一旦 setPointerCapture 在 WebView 里失效
     *      （触屏很常见），手指挪出 34px 的小手柄就再也收不到事件，拖拽等于中断；
     *   ② 浏览器判定「这是滚动」时会发 pointercancel，旧代码把 cancel 当成正常松手，
     *      于是刚动一点就落定重渲染 —— 用户看到的就是「页面跟着滑、顺序没变」；
     *   ③ 卡片用「相对按下点的 translateY」跟手，换位后基准没跟着变，
     *      卡片会突然跳一个身位，手感像脱手。
     *
     * 现在：事件挂到 document（不依赖指针捕获）；触屏补一道 touchmove preventDefault
     * 彻底掐断滚动（个别 WebView 不认 touch-action:none）；换位后重算位移让卡片始终
     * 粘在手指下；贴近上下边缘自动滚动，长列表也能一路拖到底。
     */
    private bindDrag(handle: HTMLElement, itemEl: HTMLElement, container: HTMLElement, list: IButtonConfig[], itemClass?: string) {
        /* 同一容器内用来判定「同类可排序项」的 class：顶层卡片 / 子按钮卡片 / 面板 chips 各不相同 */
        const cls = itemClass ||
            (itemEl.classList.contains("sy-mb-set__item--child") ? "sy-mb-set__item--child" : "sy-mb-set__item");

        /* 手柄自身再兜一层：样式表没加载 / 被覆盖时也不会被浏览器抢去做滚动 */
        handle.style.touchAction = "none";

        let active = false;             // 是否已越过死区、真正进入拖拽
        let startY = 0;                 // 按下点
        let lastY = 0;                  // 最近一次手指位置（自动滚动要用）
        let grabOffset = 0;             // 按下点相对卡片顶边的距离
        let itemH = 0;                  // 卡片高度（算视觉中心用）
        let origNext: Node | null = null;   // 按下时卡片的后一个兄弟节点，取消时原位还原
        let scroller: HTMLElement | null = null;
        let raf = 0;

        const doc = document as any;

        /* 同容器内其它可排序项（不含自己） */
        const sameItems = (): HTMLElement[] => Array.prototype.slice.call(container.children)
            .filter((el: HTMLElement) => el !== itemEl && el.classList.contains(cls));

        /* 让卡片始终贴在手指下方：先清掉 transform 读到真实布局位，再按「手指 - 抓取偏移」补差。
           少了这一步，换位后卡片会跳一个身位（旧版手感差的直接原因）。 */
        const follow = (y: number) => {
            itemEl.style.transform = "none";
            const top = itemEl.getBoundingClientRect().top;
            itemEl.style.transform = "translateY(" + Math.round(y - grabOffset - top) + "px)";
        };

        /* 按「卡片视觉中心」决定插到谁前面：先批量读矩形，再一次性写 DOM，避免读写交替回流 */
        const place = (y: number) => {
            const center = y - grabOffset + itemH / 2;
            const sibs = sameItems();
            if (!sibs.length) return;
            const rects = sibs.map((el) => el.getBoundingClientRect());
            let ref: HTMLElement | null = null;
            for (let i = 0; i < sibs.length; i++) {
                const r = rects[i];
                if (r.height <= 0) continue;
                if (center < r.top + r.height / 2) { ref = sibs[i]; break; }
            }
            if (ref) {
                if (itemEl.nextSibling !== ref) container.insertBefore(itemEl, ref);
            } else {
                const last = sibs[sibs.length - 1];
                if (last.nextSibling !== itemEl && last.parentNode) last.parentNode.insertBefore(itemEl, last.nextSibling);
            }
        };

        /* 贴边自动滚动：手指进入上下 64px 热区时按距离加速，滚完重新定位卡片 */
        const tick = () => {
            raf = 0;
            if (!active) return;
            if (scroller) {
                const r = scroller.getBoundingClientRect();
                const EDGE = 64;
                let dv = 0;
                if (lastY < r.top + EDGE) dv = -Math.max(4, Math.round((r.top + EDGE - lastY) / 3));
                else if (lastY > r.bottom - EDGE) dv = Math.max(4, Math.round((lastY - (r.bottom - EDGE)) / 3));
                if (dv) {
                    const before = scroller.scrollTop;
                    scroller.scrollTop = before + dv;
                    if (scroller.scrollTop !== before) { place(lastY); follow(lastY); }
                }
            }
            raf = requestAnimationFrame(tick);
        };

        const begin = (y: number) => {
            active = true;
            this.dragActive = true;
            lastY = y;
            const r = itemEl.getBoundingClientRect();
            grabOffset = startY - r.top;
            itemH = r.height > 0 ? r.height : 52;
            origNext = itemEl.nextSibling;
            scroller = this.nearestScroller(container);
            itemEl.classList.add("sy-mb-set__item--drag");
            itemEl.style.zIndex = "30";
            if (document.body) document.body.classList.add("sy-mb-set--dragging");
            if (scroller && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
        };

        const moveTo = (y: number) => {
            if (!active) {
                if (Math.abs(y - startY) < 5) return;      // 死区：轻点手柄不算拖拽
                begin(y);
            }
            lastY = y;
            place(y);
            follow(y);
        };

        /* 触屏兜底：手指按住手柄期间一律掐掉 touchmove 的原生行为。
           个别 Android WebView 不认 touch-action:none，浏览器一旦接管就发 pointercancel，
           拖拽必然中断 —— 这条 preventDefault 才是「不再上下滑动」的关键。 */
        const blockTouch = (ev: any) => { if (ev.cancelable !== false) ev.preventDefault(); };

        const detach = () => {
            doc.removeEventListener("pointermove", onMove, true);
            doc.removeEventListener("pointerup", onUp, true);
            doc.removeEventListener("pointercancel", onCancel, true);
            doc.removeEventListener("touchmove", blockTouch, true);
        };

        const finish = (commit: boolean) => {
            detach();
            if (!active) return;
            active = false;
            this.dragActive = false;
            if (raf) { cancelAnimationFrame(raf); raf = 0; }
            itemEl.classList.remove("sy-mb-set__item--drag");
            itemEl.style.transform = "";
            itemEl.style.zIndex = "";
            if (document.body) document.body.classList.remove("sy-mb-set--dragging");
            if (commit) {
                this.syncOrderFromDom(list, container, cls);
                this.render();
            } else if (origNext && origNext.parentNode === container) {
                container.insertBefore(itemEl, origNext);   // 被系统手势打断：还原原位，不留半截顺序
            } else if (!origNext) {
                container.appendChild(itemEl);
            }
        };

        const onMove = (ev: any) => { moveTo(ev.clientY); };
        const onUp = () => finish(true);
        const onCancel = () => finish(false);

        handle.addEventListener("pointerdown", (e: any) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;
            if (this.dragActive) return;                   // 已在拖别的卡片
            e.preventDefault();
            startY = e.clientY;
            lastY = startY;
            doc.addEventListener("pointermove", onMove, true);
            doc.addEventListener("pointerup", onUp, true);
            doc.addEventListener("pointercancel", onCancel, true);
            doc.addEventListener("touchmove", blockTouch, { passive: false, capture: true });
        });
    }

    /** 往上找最近的可滚动祖先：拖到列表边缘时要靠它自动滚动 */
    private nearestScroller(el: HTMLElement): HTMLElement | null {
        let p: HTMLElement | null = el.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
            try {
                const oy = getComputedStyle(p).overflowY;
                if (oy === "auto" || oy === "scroll" || oy === "overlay") return p;
            } catch (e) { /* ignore */ }
            p = p.parentElement;
        }
        return null;
    }

    /** 按容器里的 DOM 顺序回写 list 数组顺序（id 唯一，各类容器分别各自排） */
    private syncOrderFromDom(list: IButtonConfig[], container: HTMLElement, cls: string) {
        const order = Array.prototype.slice.call(container.querySelectorAll("." + cls))
            .map((el: HTMLElement) => el.getAttribute("data-id"));
        list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }

    /* ---------------------------------------------------------- 操作 */

    private remove(def: IButtonConfig, siblings: IButtonConfig[], after?: () => void) {
        const name = def.name || this.describe(def);
        confirm(this.t("removeTitle", "删除按钮"),
            this.t("removeConfirm", "确定删除「") + name + this.t("removeConfirm2", "」？"),
            () => {
                const i = siblings.indexOf(def);
                if (i >= 0) siblings.splice(i, 1);
                this.render();
                if (after) after();
            });
    }

    /**
     * 新增按钮：一切从**空白**开始（v0.8.9）。
     *
     * 此前默认给的是「面板容器 + 预置的六级标题子项」，用户新建一个按钮后面对的是
     * 一个塞满 H1~H6 的面板，得先一个个删掉才能改成自己的东西 —— 违背了「新增即新建」的直觉。
     * 现在：面板开关默认**关闭**、不预置任何动作、面板一旦打开也是空的，
     * 由用户自己点「＋ 添加子项」挑「动作」或「快捷短语」。
     */
    private add() {
        const def: IButtonConfig = { id: uid("btn"), name: "", type: "builtin", builtinId: "",
            icon: NEW_BUTTON_ICON, tip: "", enabled: true };
        this.activeList().push(def);
        this.render();
        this.openEditor(def, this.activeList());
    }

    private onBarAct(act: string) {
        if (act === "reset") {
            confirm(this.t("restoreDefault", "恢复默认"),
                this.t("resetConfirm", "将丢弃当前配置并恢复为内置九个按钮（含面板内容），确定继续？"),
                () => {
                    const mt = MobileToolbar as any;
                    const defs: IButtonConfig[] = mt.defaultButtons ? mt.defaultButtons() : [];
                    const list = this.activeList();
                    list.length = 0;
                    defs.forEach((d: any) => list.push(d));
                    this.render();
                });
        } else if (act === "export") {
            const cfg = this.buildConfigObject();
            const text = JSON.stringify(cfg, null, 2);
            /* 仍写进 textarea：保留手动复制 / 测试读取的能力 */
            this.jsonEl.value = text;
            this.jsonEl.classList.remove("fn__none");
            const foot = this.root.querySelector(".sy-mb-set__json-foot") as HTMLElement | null;
            if (foot) foot.classList.remove("fn__none");
            const base = "mobile-toolbar-config-" + this.stamp() + ".json";
            if (this.isDesktopFrontend()) {
                /* 桌面端：唤起系统文件管理器（原生「另存为」对话框），默认落在下载文件夹，
                   用户可自由选路径；该对话框本身会记住上次选择的目录，下次导出直接沿用。
                   走 <a download> + Blob，桌面端 Electron 会交给系统下载管线、弹出保存对话框，
                   不会像移动端 WebView 那样被当成页面导航导致重载。
                   注意：此路径不会把最终落盘路径回传 JS，故「记住上次目录」由系统对话框自身记忆承担，
                   插件无需额外持久化（受限于渲染进程无法向工作区外写文件，putFile 也被沙箱限制）。 */
                const fired = this.exportViaDownload(base, text);
                if (fired) {
                    showMessage(this.t("exportSaveDialog",
                        "已唤起系统文件管理器，请在保存对话框中选择存放位置（默认下载文件夹）"), 5000);
                } else {
                    /* 极端情况 <a download> 被环境拦截：回退到工作区存储目录写入 */
                    this.downloadConfig(text).then((rel) => {
                        if (rel) {
                            showMessage(this.t("exportedFile", "配置已导出为文件：") + rel, 4000);
                        } else {
                            showMessage(this.t("exportFallback", "已生成配置文本，请手动复制上方文本框内容"), 4000, "error");
                        }
                    });
                }
            } else {
                /* v0.8.66 移动端：改走思源 App 的原生导出桥。
                   思源 Android 端在 WebView 注入 JSAndroid.saveExportFileV2(url, requestID)，
                   iOS 端暴露 webkit.messageHandlers.saveExportFileV2——原生层会弹出系统
                   「另存为」对话框（ACTION_CREATE_DOCUMENT，默认下载文件夹，系统自动
                   记住上次选择的目录），把文件复制到用户自选位置后经
                   window.handleSaveExportFileResult(requestID, json) 回传结果。
                   原生导出租约只认工作区 assets 相对路径（内核 AcquireExportArtifactLease
                   解析 assets/ 到 data/assets/），因此先把配置临时 putFile 进 data/assets/，
                   保存流程结束（成功/取消/失败）后立即删除临时文件。 */
                const fired = this.exportViaMobileBridge(base, text);
                if (!fired) {
                    /* 无原生桥（旧版 App / 鸿蒙等）：降级为写入工作区存储目录 */
                    this.downloadConfig(text).then((rel) => {
                        if (rel) {
                            showMessage(this.t("exportedFile", "配置已导出为文件：") + rel, 4000);
                        } else {
                            showMessage(this.t("exportFallback", "已生成配置文本，请手动复制上方文本框内容"), 4000, "error");
                        }
                    }).catch(() => {
                        showMessage(this.t("exportFallback", "已生成配置文本，请手动复制上方文本框内容"), 4000, "error");
                    });
                }
            }
        } else if (act === "import") {
            /* v0.8.54：不再靠粘贴文本，改为打开系统文件管理器选择配置文件 */
            this.importConfigFile();
        }
    }

    /** 拼出当前完整配置（按钮 + 开关 + 元信息），供导出 / 外部备份使用。
        schema / exportedAt 是给导入方做格式识别的元信息；buttons / settingsEntry
        保持扁平，向后兼容既有导入逻辑。 */
    private buildConfigObject(): any {
        return {
            schema: "siyuan-mobile-toolbar/config@v1",
            exportedAt: new Date().toISOString(),
            app: "块捷坞·兔脱 / KuaiJieDock",
            buttons: this.list,
            settingsEntry: this.settingsEntry,
            insertDiagnostics: InsertDiagnostics.isEnabled(),
            perfDiagnostics: InsertDiagnostics.perf.isEnabled(),
            maxIcons: MAX_VISIBLE
        };
    }

    /** 把配置文本经由思源内核 putFile 写入工作区存储目录（data/storage/...）。
       返回写入后的相对路径；任何异常（WebView 不支持 fetch/FormData、内核拒绝等）
       返回空串，由调用方降级提示用户手动复制文本框内容。
       关键修复：不再用 <a download>.click() 触发 blob 下载——移动端 WebView 下该写法
       会被当成页面导航、导致思源整体重载；putFile 走同源表单请求，不触发导航。 */
    private async downloadConfig(text: string): Promise<string> {
        const base = "mobile-toolbar-config-" + this.stamp() + ".json";
        const rel = "data/storage/mobile-toolbar/exports/" + base;
        try {
            const blob = new Blob([text], { type: "application/json" });
            const fd = new FormData();
            fd.append("path", rel);
            fd.append("isDir", "false");
            fd.append("modTime", String(Date.now()));
            fd.append("file", blob, base);
            const res = await fetch("/api/file/putFile", { method: "POST", body: fd });
            const json = await res.json().catch(() => null);
            if (!json || json.code !== 0) throw new Error((json && json.msg) || "putFile failed");
            return rel;
        } catch (e) {
            return "";
        }
    }

    /** 当前是否处于桌面端（含桌面浏览器）：桌面端可用系统文件管理器 / 下载管线，
       移动端 WebView 不行。getFrontend 取值：desktop / browser-desktop / mobile / browser-mobile 等。 */
    private isDesktopFrontend(): boolean {
        try {
            const fe = (typeof getFrontend === "function") ? getFrontend() : "";
            return fe !== "mobile" && fe !== "browser-mobile";
        } catch (e) {
            return false;
        }
    }

    /** 桌面端导出：用 Blob + <a download> 触发系统「另存为」对话框（默认下载文件夹）。
       返回 true 表示已成功触发下载（文件由系统接管保存）；false 表示环境拦截。
       说明：此路径不会把最终落盘路径回传 JS，因此「记住上次目录」依赖系统保存对话框自身记忆，
       无需插件额外持久化；移动端不走这里（见 export 分支）。 */
    private exportViaDownload(fileName: string, text: string): boolean {
        try {
            const blob = new Blob([text], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            a.style.display = "none";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
            }, 2000);
            return true;
        } catch (e) {
            return false;
        }
    }

    /** 时间戳：YYYYMMDD-HHmm，用于导出文件名（避免同名覆盖） */
    private stamp(): string {
        const d = new Date();
        const p = (n: number) => String(n).padStart(2, "0");
        return "" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
    }

    /** 进行中的移动端原生导出：requestID -> assets 相对路径（保存结束后用于删除临时文件） */
    private mobileExports: Map<string, string> | null = null;

    /** v0.8.66 移动端导出：经思源 App 原生导出桥唤起系统「另存为」对话框。
       流程：① 把配置临时写入工作区 data/assets/<name>.json（原生租约只认 assets/ 路径）；
       ② 调 JSAndroid.saveExportFileV2(iOS: webkit.messageHandlers) 传 assets 相对路径 +
       requestID；③ 原生弹 ACTION_CREATE_DOCUMENT（默认下载文件夹、系统记住上次目录），
       复制完成后回调 window.handleSaveExportFileResult(requestID, json)；
       ④ 收到结果后删除 assets 里的临时文件并 toast 结果。
       返回 false 表示当前环境没有原生桥（由调用方降级到 putFile 存储目录方案）。 */
    private exportViaMobileBridge(fileName: string, text: string): boolean {
        try {
            const w = window as any;
            const jsAndroid = w.JSAndroid;
            const iosHandler = (w.webkit && w.webkit.messageHandlers && w.webkit.messageHandlers.saveExportFileV2) || null;
            const isAndroid = !!(jsAndroid && typeof jsAndroid.saveExportFileV2 === "function");
            if (!isAndroid && !iosHandler) return false;
            const blob = new Blob([text], { type: "application/json" });
            const fd = new FormData();
            fd.append("path", "data/assets/" + fileName);
            fd.append("isDir", "false");
            fd.append("modTime", String(Date.now()));
            fd.append("file", blob, fileName);
            fetch("/api/file/putFile", { method: "POST", body: fd })
                .then((res) => res.json().catch(() => null))
                .then((json) => {
                    if (!json || json.code !== 0) throw new Error((json && json.msg) || "putFile failed");
                    const requestID = "sy-mb-export-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
                    this.trackMobileExport(requestID, "assets/" + fileName);
                    if (isAndroid) {
                        jsAndroid.saveExportFileV2("assets/" + fileName, requestID);
                    } else {
                        iosHandler.postMessage({ uri: "assets/" + fileName, requestID });
                    }
                })
                .catch(() => {
                    showMessage(this.t("exportFallback", "已生成配置文本，请手动复制上方文本框内容"), 4000, "error");
                });
            return true;
        } catch (e) {
            return false;
        }
    }

    /** 登记（并安装一次全局回调）一个进行中的原生导出：收到原生结果后删除
       assets 临时文件并提示。原生层保证一定回调（用户取消也会回 canceled），
       故不做超时兜底；仅在思源进程被杀死等极端情况会残留一个临时 json，
       下次导出会正常覆盖使用新的临时文件，不影响功能。 */
    private trackMobileExport(requestID: string, assetRel: string) {
        const w = window as any;
        if (!this.mobileExports) {
            this.mobileExports = new Map<string, string>();
            w.handleSaveExportFileResult = (id: string, payload: string) => {
                try {
                    const info = JSON.parse(payload || "{}");
                    const entry = this.mobileExports && this.mobileExports.get(id);
                    if (!entry) return;
                    this.mobileExports.delete(id);
                    /* 保存流程已结束，清理工作区 assets 中的临时导出文件（fire-and-forget） */
                    fetch("/api/file/removeFile", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ path: "/" + entry })
                    }).catch(() => { /* 清理失败不影响主流程 */ });
                    if (info && info.status === "success") {
                        showMessage(this.t("exportSaved", "已保存到所选位置：") + (info.name || ""), 5000);
                    } else if (info && info.status !== "canceled") {
                        showMessage(this.t("exportFailed", "导出未完成，请重试"), 4000, "error");
                    }
                } catch (e) { /* ignore */ }
            };
        }
        this.mobileExports.set(requestID, assetRel);
    }

    /** 打开系统文件管理器选择配置文件（<input type=file>），读取后直接导入应用。
       input 懒创建、复用；每次先清空 value，以便重复选同一文件也能触发 change。 */
    private importConfigFile() {
        if (!this.fileInput) {
            const inp = document.createElement("input");
            inp.type = "file";
            inp.accept = "application/json,.json";
            inp.style.display = "none";
            inp.addEventListener("change", () => {
                const f = inp.files && inp.files[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        this.applyParsed(JSON.parse(String(reader.result)));
                    } catch (e) {
                        showMessage(this.t("jsonError", "JSON 解析失败：") + (e && (e as Error).message), 4000, "error");
                    }
                    inp.value = "";
                };
                reader.onerror = () => {
                    showMessage(this.t("fileReadError", "配置文件读取失败"), 4000, "error");
                    inp.value = "";
                };
                reader.readAsText(f);
            });
            this.fileInput = inp;
        }
        this.fileInput.value = "";
        this.fileInput.click();
    }

    /** 把已解析的对象（裸数组 / 扁平对象 / 带 schema 的新格式都认）洗成合法配置并应用。
       抽出来供「文本导入（导入并应用）」与「文件导入」共用，避免两套解析逻辑漂移。 */
    private applyParsed(parsed: any) {
        let clean: IButtonConfig[] | null = null;
        let settingsEntry: boolean | null = null;
        let insertDiagnostics: boolean | null = null;
        let perfDiagnostics: boolean | null = null;
        if (Array.isArray(parsed)) {
            clean = sanitizeButtons(parsed);
        } else if (parsed && typeof parsed === "object") {
            clean = sanitizeButtons(parsed[STORAGE_KEY] || parsed.buttons);
            if (typeof parsed.settingsEntry === "boolean") settingsEntry = parsed.settingsEntry;
            if (typeof parsed.insertDiagnostics === "boolean") insertDiagnostics = parsed.insertDiagnostics;
            if (typeof parsed.perfDiagnostics === "boolean") perfDiagnostics = parsed.perfDiagnostics;
            /* v0.8.68：表格工具栏已移除，旧文件里的 tableButtons / tableToolbar /
               savorCompat 一律忽略（sanitizeButtons 也会把 type:"table" 条目剔掉）。 */
        }
        if (!clean) {
            showMessage(this.t("jsonEmpty", "没有解析到可用的按钮配置"), 4000, "error");
            return;
        }
        this.setConfig(clean);
        if (settingsEntry !== null) this.setSettingsEntry(settingsEntry);
        if (insertDiagnostics !== null) InsertDiagnostics.setEnabled(insertDiagnostics);
        if (perfDiagnostics !== null) InsertDiagnostics.perf.setEnabled(perfDiagnostics);
        if (this.diagnosticsUI) this.diagnosticsUI.refresh();
        showMessage(this.t("imported", "已导入 ") + clean.length + this.t("imported2", " 个按钮，记得点保存生效"));
    }

    private doImport() {
        let parsed: any = null;
        try {
            parsed = JSON.parse(this.jsonEl.value);
        } catch (e) {
            showMessage(this.t("jsonError", "JSON 解析失败：") + (e && (e as Error).message), 4000, "error");
            return;
        }
        this.applyParsed(parsed);
    }

    /* ---------------------------------------------------------- 图标选择器 */

    /**
     * 图标选择器。图标池分四层，保证「动作库里出现的图标」一个都不缺：
     *   ⓪ 动作图标 —— 引擎 actionIcons()，即「动作」下拉 / 面板子项 / 默认按钮
     *      用到的全部图标。**不做 symbol 存在性过滤**：内置样式色块
     *      （style:info…）、页签 iconTabs、思维导图 iconMindmap、日期时间
     *      iconCalendarClock 这几个思源本就没有 symbol，只能靠引擎自绘，
     *      过滤掉的话用户根本选不到；
     *   ① 块类型 / 插入类 —— 引擎 BLOCK_ICONS，顺序与思源斜杠面板、getIcon.ts 一致，带中文名；
     *   ② 常用 —— 工具条内置图标 + 常用操作图标；
     *   ③ 其它思源图标 —— 运行时枚举页面上全部 `symbol#icon*`，兜住任何遗漏
     *      （换主题、装插件带来的图标也能选到）。
     */
    private openIconPicker(current: string, cb: (value: string) => void) {
        const used: Record<string, boolean> = {};
        /** 收录一个图标：去重 + 必须真实存在（symbolExists）才算数 */
        const take = (id: string): boolean => {
            if (!id || used[id] || !symbolExists(id)) return false;
            used[id] = true;
            return true;
        };
        /** 收录一个「动作里用到的图标」：只去重，不查 symbol 是否存在。
            动作库里有三类图标天生没有 symbol（内置样式色块、页签、思维导图、日期时间），
            按 symbolExists 过滤会让它们在选择器里彻底消失。 */
        const takeRaw = (id: string): boolean => {
            if (!id || used[id]) return false;
            used[id] = true;
            return true;
        };
        /** 统一的图标渲染：交给引擎的 iconHtml，与工具条上完全同一套逻辑
            （真 symbol / 自绘线条 / 内置样式色块都能正确显示，不会出现空白格） */
        const drawIcon = (id: string): string => {
            const fn = (MobileToolbar as any).iconHtml;
            if (fn) return String(fn(id));
            return '<svg class="sy-mb-icon"><use xlink:href="#' + escHtml(id) + '"></use></svg>';
        };
        const cell = (id: string, label: string) => {
            const active = id === current ? " sy-mb-set__pick-cell--on" : "";
            const name = label || id.replace(/^icon/, "");
            return '<button type="button" class="sy-mb-set__pick-cell' + active +
                '" data-symbol="' + escHtml(id) + '" data-pick="' + escHtml(id) +
                '" title="' + escHtml(id) + '">' +
                drawIcon(id) +
                '<span class="sy-mb-set__pick-name">' + escHtml(name) + "</span>" +
                "</button>";
        };
        const group = (title: string, cells: string[]) =>
            cells.length
                ? '<div class="sy-mb-set__pick-title">' + escHtml(title) + "</div>" +
                  '<div class="sy-mb-set__pick-grid">' + cells.join("") + "</div>"
                : "";

        /* ⓪ 动作图标：动作库（动作下拉 / 面板子项 / 默认按钮）用到的全部图标。
              放最前面 —— 这是「按钮图标能选什么」的最小完整集：
              凡是动作里出现过的图标，这里一定有，不用去后面几组里翻。 */
        const acts: string[] = [];
        const actList: any[] = (MobileToolbar as any).actionIcons
            ? (MobileToolbar as any).actionIcons() : [];
        actList.forEach((a: any) => { if (takeRaw(a.id)) acts.push(cell(a.id, a.label)); });

        /* ① 块类型（思源内置插入块 / 插入资产 / 行级格式的全部图标） */
        const blocks: string[] = [];
        const blockList: any[] = (MobileToolbar as any).blockIcons
            ? (MobileToolbar as any).blockIcons() : [];
        blockList.forEach((b: any) => { if (take(b.id)) blocks.push(cell(b.id, b.label)); });

        /* ② 常用：工具条内置图标 + 常用操作图标 */
        const commons: string[] = [];
        const icons: any = (MobileToolbar as any).icons || {};
        Object.keys(icons).forEach((k) => { if (take(icons[k])) commons.push(cell(icons[k], "")); });
        EXTRA_ICONS.forEach((id) => { if (take(id)) commons.push(cell(id, "")); });

        /* ③ 其它：页面上真实存在的全部思源 symbol，兜底不漏 */
        const others: string[] = [];
        try {
            document.querySelectorAll('symbol[id^="icon"]').forEach((el) => {
                const id = el.getAttribute("id") || "";
                if (take(id)) others.push(cell(id, ""));
            });
        } catch (e) { /* 枚举失败不影响前几组 */ }

        const total = acts.length + blocks.length + commons.length + others.length;
        let html = '<div class="sy-mb-set__pick">' +
            group(this.t("groupActionIcon", "动作图标（动作库用到的全部图标）"), acts) +
            group(this.t("groupBlockIcon", "块类型（与思源插入块一致）"), blocks) +
            group(this.t("groupCommonIcon", "常用"), commons) +
            group(this.t("groupOtherIcon", "其它思源图标"), others);
        if (total === 0) {
            html += '<div class="sy-mb-set__empty">' +
                this.t("noSymbol", "当前环境没有可用的思源图标，可直接在输入框填文字 / emoji") + "</div>";
        }
        html += "</div>";

        const title = this.t("pickIcon", "选择图标");
        /* 优先在编辑弹窗内滑出抽屉（一条动线到底，不叠弹窗） */
        this.presentOrDialog(title, (host, close) => {
            host.innerHTML = html;
            host.querySelectorAll("[data-symbol]").forEach((cell: any) => {
                cell.addEventListener("click", () => {
                    close();
                    cb(cell.getAttribute("data-symbol"));
                });
            });
        });
    }
}
