import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || "dist");
const queue = [{ file: path.join(root, "index.html"), from: "site entry" }];
const visited = new Set();
const failures = [];

while (queue.length) {
  const current = queue.shift();
  if (visited.has(current.file)) continue;
  visited.add(current.file);

  if (!(await isFile(current.file))) {
    failures.push(`${relative(current.file)} (referenced by ${current.from})`);
    continue;
  }

  const extension = path.extname(current.file).toLowerCase();
  const text = await readFile(current.file, "utf8");
  if (extension === ".html") scanHtml(current.file, text);
  else if (extension === ".js") scanJavaScript(current.file, text);
  else if (extension === ".css") scanCss(current.file, text);
  else if (extension === ".webmanifest") scanManifest(current.file, text);
}

if (failures.length) {
  console.error("Site shell validation failed. Missing local references:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Site shell validation passed (${visited.size} local files checked).`);
}

function scanHtml(file, text) {
  for (const match of text.matchAll(/<(?:script|img|link)\b[^>]*?\b(?:src|href)=["']([^"']+)["'][^>]*>/giu)) {
    enqueueReference(file, match[1]);
  }
}

function scanJavaScript(file, text) {
  const patterns = [
    /\bimport\s+(?:[^"'`;]+?\s+from\s+)?["']([^"']+)["']/gu,
    /\bexport\s+[^"'`;]+?\s+from\s+["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) enqueueReference(file, match[1]);
  }
}

function scanCss(file, text) {
  for (const match of text.matchAll(/@import\s+(?:url\()?\s*["']?([^"')\s;]+)["']?\s*\)?/giu)) enqueueReference(file, match[1]);
  for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/giu)) enqueueReference(file, match[1]);
}

function scanManifest(file, text) {
  try {
    const manifest = JSON.parse(text);
    for (const icon of manifest.icons || []) if (icon?.src) enqueueReference(file, icon.src);
  } catch (error) {
    failures.push(`${relative(file)} (invalid JSON: ${error.message})`);
  }
}

function enqueueReference(fromFile, reference) {
  if (!isLocalReference(reference)) return;
  const clean = String(reference).split("#", 1)[0].split("?", 1)[0];
  if (!clean) return;
  const resolved = clean.startsWith("/") ? path.resolve(root, `.${clean}`) : path.resolve(path.dirname(fromFile), clean);
  const relativePath = path.relative(root, resolved);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    failures.push(`${reference} (escapes site root from ${relative(fromFile)})`);
    return;
  }
  queue.push({ file: resolved, from: relative(fromFile) });
}

function isLocalReference(reference) {
  const value = String(reference || "").trim();
  return value && !value.startsWith("#") && !value.startsWith("//") && !/^[a-z][a-z0-9+.-]*:/iu.test(value);
}

async function isFile(file) {
  try { return (await stat(file)).isFile(); } catch { return false; }
}

function relative(file) {
  return path.relative(root, file).replaceAll(path.sep, "/") || ".";
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    if (!values[index].startsWith("--")) continue;
    result[values[index].slice(2)] = values[index + 1];
    index += 1;
  }
  return result;
}
