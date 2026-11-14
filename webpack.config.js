const path = require("path");
const fs = require("fs");
const webpack = require("webpack");
const {EsbuildPlugin} = require("esbuild-loader");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CopyPlugin = require("copy-webpack-plugin");
const ZipPlugin = require("zip-webpack-plugin");
const pluginManifest = require("./plugin.json");

// 集市图片：字段优先，其次兼容传统文件名
const packageImagePatterns = [
    ["icon", "icon.png"],
    ["preview", "preview.jpg"],
    ["preview", "preview.png"],
].flatMap(([field, legacyName]) => {
    const fileName = pluginManifest[field] || legacyName;
    return fileName && fs.existsSync(fileName) ? [{from: fileName, to: "./dist/"}] : [];
});

module.exports = (env, argv) => {
    const production = argv.mode === "production";
    const plugins = [
        /* v0.8.101：把插件版本编进产物，诊断日志头部直接打印。
           以前排查时分不清用户装的是哪一版（日志字段差异才能反推），
           有了这一行就不会再有歧义。单一来源仍是 plugin.json。 */
        new webpack.DefinePlugin({
            __PLUGIN_VERSION__: JSON.stringify(pluginManifest.version),
        }),
        new MiniCssExtractPlugin({
            filename: production ? "dist/index.css" : "index.css",
        }),
    ];
    if (production) {
        plugins.push(
            new CopyPlugin({
                patterns: [
                    ...packageImagePatterns,
                    {from: "README*.md", to: "./dist/"},
                    {from: "plugin.json", to: "./dist/"},
                    {from: "src/i18n/", to: "./dist/i18n/"},
                ],
            }),
        );
        plugins.push(
            new ZipPlugin({
                filename: "package.zip",
                algorithm: "gzip",
                include: [/dist/],
                pathMapper: (assetPath) => assetPath.replace("dist/", ""),
            }),
        );
    } else {
        plugins.push(
            new CopyPlugin({
                patterns: [{from: "src/i18n/", to: "./i18n/"}],
            }),
        );
    }
    return {
        mode: argv.mode || "development",
        watch: !production,
        devtool: production ? false : "eval-source-map",
        output: {
            filename: "[name].js",
            path: path.resolve(__dirname),
            libraryTarget: "commonjs2",
            library: {type: "commonjs2"},
        },
        externals: {
            siyuan: "siyuan",
        },
        entry: {
            [production ? "dist/index" : "index"]: "./src/index.ts",
        },
        optimization: {
            minimize: production,
            minimizer: [new EsbuildPlugin({target: "es2020", format: "cjs"})],
        },
        // 思源插件以单文件加载，不做代码分割；体积提示对本项目无指导意义，
        // 且 package.zip 会被一并计入阈值，故关闭体积告警避免噪声
        performance: {
            hints: false,
        },
        resolve: {
            extensions: [".ts", ".js", ".css", ".json"],
        },
        module: {
            rules: [
                {
                    // 与官方 plugin-sample-main 一致：src 下全部源码为 TypeScript，
                    // 由 esbuild-loader 统一编译。target 固定 es2020，避免可选链等
                    // 新语法在旧版 Android WebView 上解析失败。
                    test: /\.tsx?$/,
                    include: [path.resolve(__dirname, "src")],
                    use: [{loader: "esbuild-loader", options: {target: "es2020"}}],
                },
                {
                    test: /\.css$/,
                    include: [path.resolve(__dirname, "src")],
                    use: [MiniCssExtractPlugin.loader, "css-loader"],
                },
            ],
        },
        plugins,
    };
};
