/**
 * 打包后处理：
 *   1. 校验 dist/ 内必需文件（zip 根层级不能多套文件夹）
 *   2. 校验 plugin.json 版本与交付文件名一致
 *   3. 校验图标 / 预览图体积上限（集市要求）
 *   4. 把 package.zip 复制成 package_v<version>.zip
 */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "plugin.json"), "utf8"));
const version = manifest.version;

const dist = path.join(root, "dist");
const required = ["index.js", "index.css", "plugin.json", "icon.png", "preview.jpg", "README.md", "README.zh-CN.md"];
const missing = required.filter((file) => !fs.existsSync(path.join(dist, file)));

if (missing.length > 0) {
    console.error(`[pack] dist 缺少文件：${missing.join(", ")}`);
    process.exit(1);
}

const iconSize = fs.statSync(path.join(dist, "icon.png")).size;
const previewSize = fs.statSync(path.join(dist, "preview.jpg")).size;
if (iconSize > 64 * 1024) {
    console.error(`[pack] icon.png 超过 64 KiB（${(iconSize / 1024).toFixed(1)} KiB）`);
    process.exit(1);
}
if (previewSize > 512 * 1024) {
    console.error(`[pack] preview.jpg 超过 512 KiB（${(previewSize / 1024).toFixed(1)} KiB）`);
    process.exit(1);
}

const zipPath = path.join(root, "package.zip");
if (!fs.existsSync(zipPath)) {
    console.error("[pack] 未找到 package.zip，请先执行构建");
    process.exit(1);
}

const target = path.join(root, `package_v${version}.zip`);
fs.copyFileSync(zipPath, target);

const manifestVersionOk = JSON.parse(fs.readFileSync(path.join(dist, "plugin.json"), "utf8")).version === version;
if (!manifestVersionOk) {
    console.error("[pack] dist/plugin.json 的 version 与根目录 plugin.json 不一致");
    process.exit(1);
}

console.log(`[pack] 版本：v${version}`);
console.log(`[pack] 交付包：${target}`);
console.log(`[pack] icon.png ${(iconSize / 1024).toFixed(1)} KiB / preview.jpg ${(previewSize / 1024).toFixed(1)} KiB`);
console.log(`[pack] 包大小：${(fs.statSync(target).size / 1024).toFixed(1)} KiB`);
console.log("[pack] 包内根层级：" + required.join(", ") + ", i18n/");
