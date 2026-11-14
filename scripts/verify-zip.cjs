/* BlockBar 打包校验：包内容 / 版本 / 关键逻辑标记 / 与 dist 一致性 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const JSZip = require("F:/WorkBuddy Workspace/math-keyboard/siyuan-plugin-math-keyboard/node_modules/jszip");

const ROOT = path.resolve(__dirname, "..");
const ZIP = path.join(ROOT, "package.zip");

const KEYS = [
    "math-field",            // v0.8.73：公式会话判据 = 真的注入了 math-field
    "sy-mb:kb",              // v0.8.73：跨插件键盘诊断事件（数学键盘插件转进时间线）
    "hold-skip",             // v0.8.73：续锁让路必须留痕，不再静默跳
    "sy-mb-open",
    "keyboardToolbar",
];

(async () => {
    const buf = fs.readFileSync(ZIP);
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    console.log("entries:", names.length);
    names.forEach((n) => console.log("  " + n));

    const pj = JSON.parse(await zip.file("plugin.json").async("string"));
    console.log("zip plugin.json version:", pj.version);

    const js = await zip.file("index.js").async("string");
    let bad = 0;
    KEYS.forEach((k) => {
        const ok = js.includes(k);
        if (!ok) bad++;
        console.log((ok ? "  OK   " : "  MISS ") + k);
    });

    // 与 dist 逐字节比对（打包器直接读 dist，这里再确认一次没串版本）
    for (const n of names) {
        const local = path.join(ROOT, "dist", n);
        if (!fs.existsSync(local)) {
            console.log("  MISS dist/" + n);
            bad++;
            continue;
        }
        const a = crypto.createHash("sha256").update(fs.readFileSync(local)).digest("hex");
        const b = crypto.createHash("sha256").update(Buffer.from(await zip.file(n).async("uint8array"))).digest("hex");
        if (a !== b) {
            console.log("  DIFF dist/" + n);
            bad++;
        }
    }

    const sha = crypto.createHash("sha256").update(buf).digest("hex").toUpperCase();
    console.log("size:", buf.length, "bytes");
    console.log("sha256:", sha);
    console.log(bad ? "RESULT: FAIL (" + bad + ")" : "RESULT: PASS");
    process.exit(bad ? 1 : 0);
})();
