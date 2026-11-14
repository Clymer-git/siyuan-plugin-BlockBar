/* 修改前快照：把「源码 + 构建产物 + 关键清单」复制到 _backup/<时间戳>-<标签>/，
   并生成逐文件 SHA256 清单，出问题时可整目录还原。
   用法：
     node scripts/backup.cjs "修复表格内公式块"
     node scripts/backup.cjs list        # 只看已有快照
     node scripts/backup.cjs restore <快照目录名>
   设计取舍：
   · 不含 node_modules（114M，可由 npm ci 重建），其余全部纳入；
   · 复制后逐文件比对 SHA256，任何一项不一致即视为备份失败并退出码 1；
   · restore 只覆盖/删除快照里记录过的路径，不做全盘清理。 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const BACKUP_ROOT = path.join(ROOT, "_backup");

/* 需要纳入快照的顶层条目；node_modules / _backup / .workbuddy 永不纳入 */
const INCLUDE = [
    "src",
    "dist",
    "scripts",
    "test",
    "plugin.json",
    "package.json",
    "package-lock.json",
    "webpack.config.js",
    "tsconfig.json",
    "README.md",
    "README.zh-CN.md",
    "LICENSE",
    "icon.png",
    "preview.jpg",
    "package.zip",
];
const SKIP_DIRS = new Set(["node_modules", "_backup", ".workbuddy", ".git"]);

function sha256(file) {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function walk(dir, out) {
    for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) {
            if (SKIP_DIRS.has(name)) continue;
            walk(abs, out);
        } else {
            out.push(abs);
        }
    }
    return out;
}

function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function listBackups() {
    if (!fs.existsSync(BACKUP_ROOT)) {
        console.log("（暂无快照）");
        return [];
    }
    const dirs = fs.readdirSync(BACKUP_ROOT)
        .filter((n) => fs.statSync(path.join(BACKUP_ROOT, n)).isDirectory())
        .sort();
    dirs.forEach((n) => {
        const manifest = path.join(BACKUP_ROOT, n, "SHA256SUMS.txt");
        const count = fs.existsSync(manifest)
            ? fs.readFileSync(manifest, "utf8").split("\n").filter(Boolean).length
            : 0;
        console.log(`${n}  (${count} 个文件)`);
    });
    return dirs;
}

function create(label) {
    const name = `${stamp()}-${(label || "snapshot").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 40)}`;
    const dest = path.join(BACKUP_ROOT, name);
    fs.mkdirSync(dest, { recursive: true });

    const files = [];
    for (const entry of INCLUDE) {
        const abs = path.join(ROOT, entry);
        if (!fs.existsSync(abs)) continue;
        const stat = fs.statSync(abs);
        if (stat.isDirectory()) walk(abs, files);
        else files.push(abs);
    }

    const lines = [];
    let failed = 0;
    for (const abs of files) {
        const rel = path.relative(ROOT, abs).split(path.sep).join("/");
        const target = path.join(dest, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(abs, target);
        const srcHash = sha256(abs);
        const dstHash = sha256(target);
        if (srcHash !== dstHash) {
            failed++;
            console.error(`  MISMATCH  ${rel}`);
        }
        lines.push(`${srcHash}  ${rel}`);
    }
    fs.writeFileSync(path.join(dest, "SHA256SUMS.txt"), lines.join("\n") + "\n", "utf8");

    console.log(`快照目录：${path.relative(ROOT, dest)}`);
    console.log(`文件数：${files.length}  校验：${failed === 0 ? "全部一致" : failed + " 项不一致"}`);
    console.log(`版本：${JSON.parse(fs.readFileSync(path.join(ROOT, "plugin.json"), "utf8")).version}`);
    process.exitCode = failed === 0 ? 0 : 1;
}

function restore(name) {
    const dest = path.join(BACKUP_ROOT, name);
    const manifest = path.join(dest, "SHA256SUMS.txt");
    if (!fs.existsSync(manifest)) {
        console.error(`找不到快照：${name}`);
        process.exitCode = 1;
        return;
    }
    const rows = fs.readFileSync(manifest, "utf8").split("\n").filter(Boolean);
    let bad = 0;
    for (const row of rows) {
        const [hash, rel] = row.split(/\s{2}/);
        const from = path.join(dest, rel);
        const to = path.join(ROOT, rel);
        if (!fs.existsSync(from)) { bad++; console.error(`  缺失 ${rel}`); continue; }
        if (sha256(from) !== hash) { bad++; console.error(`  快照损坏 ${rel}`); continue; }
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
    }
    console.log(`已还原 ${rows.length - bad}/${rows.length} 个文件 ← ${name}`);
    process.exitCode = bad === 0 ? 0 : 1;
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "list") listBackups();
else if (cmd === "restore") restore(arg);
else create(cmd);
