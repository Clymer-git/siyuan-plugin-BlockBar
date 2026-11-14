/**
 * 与思源官方插件模板 plugin-sample-main/src/declarations.d.ts 对齐的环境声明。
 *
 * 插件运行在思源宿主页面里，window 上挂载了大量宿主对象（siyuan / Lute /
 * JSAndroid / JSHarmony / syMobileToolbar 等），且思源 3.8.x 的 lite 编辑器、
 * hint.fillCommand 等运行时能力尚未进入 siyuan 1.2.8 的 SDK 类型声明。
 * CSS 由 webpack 的 css-loader 以副作用形式引入，也没有默认类型。
 *
 * 迁移说明：引擎原先是纯 JS 且 tsconfig 开了 checkJs:false，这些访问完全
 * 不参与类型检查。统一为 TS 后先用宽松的索引签名让 tsc 覆盖全部源码，
 * 后续可逐步为宿主对象补精确接口、收紧 noImplicitAny。
 */
declare module "*.css" {
    const content: string;
    export default content;
}

declare global {
    /** 构建时由 webpack DefinePlugin 注入（单一来源：plugin.json 的 version） */
    const __PLUGIN_VERSION__: string;
    /* 宿主注入的全局对象（JSAndroid / JSHarmony / Lute / syMobileToolbar …） */
    interface Window {
        [key: string]: any;
    }
    /* 事件与选区代码大量在 Node / EventTarget 上读取 DOM 专有属性。
       SDK 的 DOM lib 把这些基类声明得过窄，先以索引签名放行。 */
    interface Node {
        [key: string]: any;
    }
    interface EventTarget {
        [key: string]: any;
    }
    interface Element {
        [key: string]: any;
    }
    interface HTMLElement {
        [key: string]: any;
    }
}

export {};
