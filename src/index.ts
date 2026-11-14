import {
    Plugin,
    Setting,
    Dialog,
    getFrontend,
    getAllEditor,
    showMessage,
} from "siyuan";
/* v0.8.78：siyuan 的类型声明没有再导出 Protyle，但运行时 API 对象里有（与内部
   `new Protyle(...)` 是同一个类）。用命名空间导入按需读取，避免类型报错。 */
import * as SiyuanRuntime from "siyuan";
import "./styles/toolbar.css";
import MobileToolbar from "./engine/mobile-toolbar";

/* v0.8.101：构建期由 webpack DefinePlugin 注入（来源 plugin.json），
   用于日志头版本戳与配置迁移判断；esbuild 单测打包时取兜底值。 */
const PLUGIN_VERSION = typeof __PLUGIN_VERSION__ === "string" ? __PLUGIN_VERSION__ : "0.0.0";
import {InsertDiagnostics} from "./engine/insert-diagnostics";
import {
    ButtonSettingsPanel,
    IButtonConfig,
    STORAGE_KEY,
    sanitizeButtons,
} from "./settings/page";

/**
 * SiYuan 移动端快捷工具栏 · 插件入口
 *
 * 分层约定：
 *   · 本文件只负责「思源插件生命周期」：读配置 → 注入引擎 → 设置页 → 保存/卸载
 *   · src/engine/        工具条引擎（DOM / 手势 / 面板 / 键盘交互）
 *   · src/adapters/      思源适配层（图标与动作来源，版本差异集中在这里）
 *   · src/settings/      设置页（布局与动画原样保留）
 *   · src/styles/        工具条与设置页样式（逐字沿用参考方案，视觉不变）
 */
export default class MobileToolbarPlugin extends Plugin {

    private isMobile = false;
    private panel: ButtonSettingsPanel;
    /** 移动端自管的全屏设置对话框（替代 SiYuan Setting，避免其 row 布局与滚动嵌套） */
    private mobileDialog: any = null;
    /** v0.8.78：Protyle.prototype.init 只包一次 */
    private protyleCaptureInstalled = false;

    async onload() {
        const frontEnd = getFrontend();
        this.isMobile = frontEnd === "mobile" || frontEnd === "browser-mobile";

        // 工具栏末尾「设置入口」齿轮的跳转桥接 —— 引擎不认识插件实例，
        // 只能通过这个全局函数调回 this.openSetting()。
        (window as any).__syMbOpenSetting = () => this.openSetting();

        // 1. 读取自定义按钮配置（读不到就回退到内置九个按钮）
        //    显示上限固定 9 个：历史配置里存过的 maxIcons 一律忽略，
        //    调大会把工具条压扁且不出现横向滑动，与本插件的约定不符。
        const maxIcons = 9;
        let custom: IButtonConfig[] = null;
        let settingsEntry = false;
        let insertDiagnostics = false;
        let perfDiagnostics = false;
        let prevVersion = "";
        /* v0.8.68：表格工具栏已移除（思源 3.8.8 起原生表格能力足够）。
           旧配置里的 tableButtons / tableToolbar / savorCompat 字段直接忽略，
           下次保存时自然消失，不需要额外的迁移代码。 */
        try {
            const data: any = await this.loadData("config");
            if (data) {
                custom = sanitizeButtons(data[STORAGE_KEY]);
                settingsEntry = data.settingsEntry === true;
                insertDiagnostics = data.insertDiagnostics === true;
                perfDiagnostics = data.perfDiagnostics === true;
                prevVersion = typeof data.version === "string" ? data.version : "";
            }
        } catch (e) {
            console.warn(`[${this.name}] load buttons config failed:`, e);
        }
        /* v1.0.0：正式发布版把「块插入诊断 / 首帧性能采样」恢复为默认关闭。
           0.x 测试期这两个开关常被打开并随配置保存，从 0.x 升级到 1.0.0 时
           强制关一次；1.0.0 之后不再干预用户自己的选择。 */
        if (prevVersion.startsWith("0.")) {
            insertDiagnostics = false;
            perfDiagnostics = false;
        }
        if (!custom) {
            custom = MobileToolbar.defaultButtons() as IButtonConfig[];
        } else {
            // 1.1 旧版配置 → 新默认的平滑迁移。
            //     仅当存下来的按钮与旧默认九按钮完全一致（用户从没动过）时，
            //     才换成覆盖「块功能面板」的新九面板；用户自定义过就只补全内置面板子项。
            //     迁移结果落盘一次，之后指纹不再匹配，不会反复触发。
            const migrated = (MobileToolbar as any).migrateButtons
                ? (MobileToolbar as any).migrateButtons(custom)
                : null;
            if (migrated && migrated.migrated) {
                custom = migrated.buttons as IButtonConfig[];
                this.saveData("config", { [STORAGE_KEY]: custom, maxIcons: maxIcons })
                    .then(() => {
                        showMessage(this.t("migrated",
                            "工具条已升级为覆盖思源「块功能面板」的新默认按钮"), 5000);
                    })
                    .catch((e: any) => {
                        console.warn(`[${this.name}] persist migrated buttons failed:`, e);
                    });
            }
        }

        InsertDiagnostics.setEnabled(insertDiagnostics);
        InsertDiagnostics.perf.setEnabled(perfDiagnostics);
        /* v0.8.101：把构建期版本号交给诊断，日志头部会打印「插件版本」。
           排查时第一步就能确认日志出自哪一版，不必再靠字段差异反推。 */
        InsertDiagnostics.setVersion(PLUGIN_VERSION);
        InsertDiagnostics.trace("plugin.onload", {
            frontEnd: frontEnd,
            diagnostics: insertDiagnostics
        });

        // 2. 移动端注入工具条（桌面端不注入，工具条是移动端布局专用）
        if (this.isMobile) {
            MobileToolbar.setMaxIcons(maxIcons);
            MobileToolbar.setButtons(custom);
            MobileToolbar.setSettingsEntry(settingsEntry);
            /* v0.8.78：登记 Protyle 实例。
               思源 3.8.4 起表格单元格用 lite 富文本编辑器**就地**编辑 —— 光标在单元格
               里时属于另一个 Protyle 实例，而 window.siyuan.mobile.editor.protyle 始终
               指向文档编辑器；getAllEditor() 也不含它（次级编辑器表里只有反链面板与
               popEditor）。v0.8.77 就是靠 getAllEditor() 找的，所以永远回退到文档
               protyle，块被插到表格外面。这里改成 patch Protyle.prototype.init，
               每个实例构造完成时交给引擎登记，取用时按 .protyle-wysiwyg 反查。 */
            this.installProtyleCapture();
            /* getAllEditor() 继续保留为兜底通道（老版本 / 未登记场景） */
            if (typeof getAllEditor === "function") {
                MobileToolbar.setEditorsProvider(getAllEditor);
            }
            MobileToolbar.boot();

            // 布局就绪后补一次：部分机型首帧 body / .protyle-wysiwyg 还没挂上，
            // boot() 内部有重试与幂等保护，重复调用不会建出第二根工具条。
            setTimeout(() => MobileToolbar.boot(), 600);
            console.log(`[${this.name}] ${this.t("helloPlugin", "移动端快捷工具栏已加载")}`);
        }

        // 3. 设置面板（桌面端也能打开，方便用大屏编辑按钮顺序）
        this.panel = new ButtonSettingsPanel(this);
        this.panel.setConfig(custom);
        this.panel.setSettingsEntry(settingsEntry);
        this.setting = new Setting({
            width: this.isMobile ? "100%" : "760px",
            height: this.isMobile ? "100%" : "80vh",
            confirmCallback: () => {
                this.saveButtons();
            },
        });
        this.setting.addItem({
            title: this.t("buttonSettings", "自定义按钮"),
            description: this.t("buttonSettingsTip", "增删 / 排序工具条按钮；保存后立即生效"),
            direction: "column",
            createActionElement: () => this.panel.element,
        });
    }

    onLayoutReady() {
        if (!this.isMobile) {
            return;
        }
        MobileToolbar.boot();
    }

    /** v0.8.78：让引擎拿到「所有」Protyle 实例（含表格单元格的 lite 就地编辑器）。
     *
     *  SiYuan 每个编辑器都是 `new Protyle(app, element, options)`，构造末尾一定会调
     *  `this.init(lute)`。把 init 包一层即可在实例就绪时拿到 `this.protyle`，
     *  交给引擎按 `protyle.wysiwyg.element` 登记；取用时从光标锚点往上找最近的
     *  `.protyle-wysiwyg` 查表，就能拿到单元格那个 lite Protyle。
     *  用命名空间导入是为了绕开 siyuan 类型声明没有 re-export Protyle 的问题 ——
     *  运行时的 API 对象里确实有 Protyle（与内部 `new` 的同一个类）。
     *  任何一步不成立都静默跳过：老版本 / 类被改写时行为与改动前一致。 */
    private installProtyleCapture() {
        const w = window as any;
        /* 每次加载都更新转发目标。这样热更新 / 重启用插件后，已存在的包装
           也会登记到当前引擎，而不是继续写入已卸载版本的旧 Map。 */
        w.__syMbRegisterProtyle = (protyle: any) => MobileToolbar.registerProtyle(protyle);
        if (this.protyleCaptureInstalled) {
            InsertDiagnostics.trace("capture.skip", {reason: "current-plugin-already-installed"});
            return;
        }
        try {
            const ctor: any = (SiyuanRuntime as any).Protyle;
            const proto: any = ctor && ctor.prototype;
            InsertDiagnostics.trace("capture.inspect", {
                hasConstructor: !!ctor,
                hasInit: !!(proto && typeof proto.init === "function"),
                legacyCapture: !!(proto && proto.__syMobileToolbarCapture),
                bridgeCapture: !!(proto && proto.__syMbCaptureBridgeV1)
            });
            if (!proto || typeof proto.init !== "function") return;
            if (proto.__syMbCaptureBridgeV1) {
                this.protyleCaptureInstalled = true;
                InsertDiagnostics.trace("capture.reuse", {reason: "bridge-already-installed"});
                return;
            }
            const origInit = proto.init;
            proto.init = function (this: any, ...args: any[]) {
                const result = origInit.apply(this, args);
                /* 必须等原 init 完成：wysiwyg 是在 init 内创建的。经全局桥转发，
                   避免旧版本标记导致新引擎永远收不到登记。 */
                try {
                    const register = w.__syMbRegisterProtyle;
                    if (typeof register === "function") register(this && this.protyle);
                } catch (e) { /* 登记失败不影响编辑器本身 */ }
                return result;
            };
            proto.__syMobileToolbarCapture = true;
            proto.__syMbCaptureBridgeV1 = true;
            this.protyleCaptureInstalled = true;
            InsertDiagnostics.trace("capture.installed", {legacyCaptureReused: !!origInit});
        } catch (e: any) {
            InsertDiagnostics.error("capture.error", e);
            console.warn(`[${this.name}] protyle capture unavailable:`, e);
        }
    }

    /** 配置保存后立即生效，无需重启插件 */
    private saveButtons() {
        const list = this.panel.getConfig();
        const settingsEntry = this.panel.getSettingsEntry();
        MobileToolbar.setMaxIcons(this.panel.getMaxIcons());
        MobileToolbar.setButtons(list);
        MobileToolbar.setSettingsEntry(settingsEntry);
        this.saveData("config", {
            [STORAGE_KEY]: list,
            maxIcons: this.panel.getMaxIcons(),
            settingsEntry: settingsEntry,
            insertDiagnostics: InsertDiagnostics.isEnabled(),
            perfDiagnostics: InsertDiagnostics.perf.isEnabled(),
            version: PLUGIN_VERSION
        }).then(() => {
            showMessage(this.t("saved", "按钮配置已保存并生效"));
        }).catch((e: any) => {
            showMessage(this.t("saveFailed", "按钮配置保存失败：") + String((e && e.message) || e), 6000, "error");
            console.error(`[${this.name}] save buttons config failed:`, e);
        });
    }

    openSetting() {
        /* 移动端先把面板挂进弹窗，再灌配置。
           顺序原来是反的 —— setConfig() 内部会 render()，而 render() 里的量高
           （measureSticky）要求 root 已经在 DOM 里，否则 getBoundingClientRect()
           恒为 0，停靠组的 sticky top 就停在 CSS 的 fallback 0px、被吸顶头盖住；
           切一次标签页又会 render 一次、那时已挂载，于是「切一下就正常」。
           先挂载后 render，首帧量到的就是真实高度。 */
        if (this.isMobile) {
            this.openMobileDialog();
        }
        // 每次打开都同步一次当前生效的配置，避免多处修改后面板显示过期
        this.panel.setConfig(MobileToolbar.getButtons() as IButtonConfig[]);
        if (this.isMobile) {
            /* 挂载之后再补几拍量高（弹窗动画 / 字体图标加载还可能再改一次高度） */
            this.panel.onMounted();
            return;
        }
        this.setting.open(this.name);
        this.fixSettingLayout();
    }

    /**
     * 移动端：用自管的全屏 Dialog 承载设置面板，彻底绕开 SiYuan Setting 的布局约束。
     * 背景：Setting 会把面板塞进 .config-item（标题 + 操作区默认横向并排），其内部滚动容器
     * 与我们面板叠加会产生「嵌套上下滚动」；之前的逐级 flex 修正又把思源容器改出第二层滚动、
     * 挤压顶部行导致文字竖排重叠。自管 Dialog 的结构是：
     *   头部（思源自带标题栏） + 中间唯一滚动区（放面板） + 底部固定「取消 / 保存」栏，
     * 全部 DOM 由我们控制，从根上消灭嵌套滚动与宽度挤压。
     */
    private openMobileDialog() {
        if (this.mobileDialog) return;
        const root = this.panel.element;
        root.classList.add("sy-mb-set--mobile");

        const wrap = document.createElement("div");
        wrap.className = "sy-mb-set-dlg";
        wrap.style.display = "flex";
        wrap.style.flexDirection = "column";
        wrap.style.height = "100%";

        // 中间滚动区：整个设置页唯一的上下滚动容器
        const scroll = document.createElement("div");
        scroll.className = "sy-mb-set-dlg__scroll";
        scroll.style.display = "flex";
        scroll.style.flexDirection = "column";
        scroll.style.flex = "1 1 auto";
        scroll.style.minHeight = "0";
        scroll.style.overflowY = "auto";
        scroll.style.overflowX = "hidden";
        scroll.appendChild(root);
        wrap.appendChild(scroll);

        // 底部固定操作栏：取消 / 保存
        const foot = document.createElement("div");
        foot.className = "sy-mb-set-dlg__foot";
        // 与一级页操作栏、编辑页底部同一套按钮规格（.sy-mb-set-btn），不再混用 b3-button
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "sy-mb-set-btn";
        cancelBtn.textContent = this.t("cancel", "取消");
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "sy-mb-set-btn sy-mb-set-btn--primary";
        saveBtn.textContent = this.t("save", "保存");
        foot.appendChild(cancelBtn);
        foot.appendChild(saveBtn);
        wrap.appendChild(foot);

        const dlg = new Dialog({
            title: this.t("buttonSettings", "自定义按钮"),
            content: "",
            width: "100%",
            height: "100%",
        });
        this.mobileDialog = dlg;

        // 弹窗容器铺满手机（思源默认 max-width:88vw，移动端虽已放宽到 100vw，这里仍显式锁死）
        const container = dlg.element.querySelector(".b3-dialog__container") as HTMLElement | null;
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

        // 内容宿主：思源 Dialog 的结构是 .b3-dialog__container > .b3-dialog__header + .b3-dialog__body，
        // 内容模板 ${options.content} 落在 .b3-dialog__body 里（没有 .b3-dialog__content 这一层）。
        // 这里按优先级查，并对找不到的情况兜底退回 SiYuan Setting，确保任何版本都不会出现空白页。
        const contentEl = (dlg.element.querySelector(".b3-dialog__body") ||
            dlg.element.querySelector(".b3-dialog__content") ||
            container ||
            dlg.element.querySelector(".b3-dialog__container")) as HTMLElement | null;
        if (!contentEl) {
            // 极端情况拿不到宿主：销毁空弹窗并退回系统设置页，绝不留白
            this.mobileDialog = null;
            try { dlg.destroy(); } catch (e) { /* 忽略销毁异常 */ }
            this.setting.open(this.name);
            this.fixSettingLayout();
            return;
        }
        // 关闭 body 自带的滚动与内边距，把滚动交给 wrap 内部唯一的 .sy-mb-set-dlg__scroll，
        // 避免「弹窗一层滚动 + 面板一层滚动」的嵌套滚动。
        contentEl.style.padding = "0";
        contentEl.style.width = "100%";
        contentEl.style.height = "100%";
        contentEl.style.flex = "1 1 auto";
        contentEl.style.minHeight = "0";
        contentEl.style.overflow = "hidden";
        contentEl.style.boxSizing = "border-box";
        contentEl.appendChild(wrap);

        // 丢弃未保存的修改：把面板回灌成当前生效配置
        const discardAndClose = () => {
            this.mobileDialog = null;
            this.panel.setConfig(MobileToolbar.getButtons() as IButtonConfig[]);
            dlg.destroy();
        };
        // 右上角 X（思源直接调 destroy）也视为取消
        const origDestroy = dlg.destroy.bind(dlg);
        dlg.destroy = () => {
            if (this.mobileDialog === dlg) {
                this.mobileDialog = null;
                this.panel.setConfig(MobileToolbar.getButtons() as IButtonConfig[]);
            }
            origDestroy();
        };
        cancelBtn.addEventListener("click", () => {
            if (this.mobileDialog === dlg) dlg.destroy();
        });
        saveBtn.addEventListener("click", () => {
            if (this.mobileDialog !== dlg) return;
            this.mobileDialog = null;
            this.saveButtons();
            dlg.destroy = origDestroy;
            dlg.destroy();
        });
    }

    /**
     * 桌面端专用：修正 SiYuan Setting 对操作区的强约束（direction:"column" 时会给
     * actionElement 强加 fn__size200 / fn__flex-center，面板被压成 200px 窄条），并把
     * .config-item 纵向化让面板占满宽度。移动端已改用自管全屏 Dialog（openMobileDialog），
     * 不再走 Setting，因此不做任何布局 Hack，避免与其内部滚动/布局打架。
     */
    private fixSettingLayout() {
        const root = this.panel.element;
        if (!root) return;
        const apply = () => {
            root.classList.remove("fn__size200", "fn__flex-center");
            root.style.width = "100%";
            root.style.maxWidth = "100%";
            root.style.boxSizing = "border-box";
            root.style.overflowX = "hidden";
            const item = root.closest(".config-item") as HTMLElement | null;
            if (item) {
                item.style.display = "flex";
                item.style.flexDirection = "column";
                item.style.alignItems = "stretch";
                item.style.width = "100%";
                item.style.maxWidth = "100%";
                item.style.boxSizing = "border-box";
                const action = (item.querySelector(".config-item__action") ||
                    item.lastElementChild) as HTMLElement | null;
                if (action) {
                    action.style.width = "100%";
                    action.style.maxWidth = "100%";
                    action.style.flex = "1 1 auto";
                    action.style.minWidth = "0";
                    /* 同 settings.css 的理由 —— hidden 会把本元素变成滚动容器，
                       sticky 吸顶会静默失效；用 clip 裁切而不产生滚动容器。 */
                    action.style.overflowX = "clip";
                }
            }
        };
        apply();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(apply);
    }

    onunload() {
        if (this.mobileDialog) {
            const d = this.mobileDialog;
            this.mobileDialog = null;
            try { d.destroy(); } catch (e) { /* 卸载时忽略销毁异常 */ }
        }
        delete (window as any).__syMbOpenSetting;
        MobileToolbar.destroy();
        console.log(`[${this.name}] ${this.t("byePlugin", "移动端快捷工具栏已卸载")}`);
    }

    uninstall() {
        MobileToolbar.destroy();
    }

    /** 取 i18n 文案，缺失时用中文兜底 */
    private t(key: string, fallback: string): string {
        const dict: any = this.i18n || {};
        const v = dict[key];
        return (v === undefined || v === null || v === "") ? fallback : String(v);
    }
}
