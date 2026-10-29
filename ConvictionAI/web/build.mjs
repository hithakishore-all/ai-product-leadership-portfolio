// Builds the UI into ONE self-contained file: dist/index.html
// (React, styles and app code inlined, so it also works offline by double-clicking).
// Run: npm run build
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
const out = await build({
  entryPoints: ["src/app.jsx"], bundle: true, format: "iife", target: "es2019", minify: true, write: false,
  jsxFactory: "React.createElement", jsxFragment: "React.Fragment", inject: ["src/react-shim.js"],
  define: { "process.env.NODE_ENV": '"production"' }, logLevel: "warning",
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const css = readFileSync("src/styles.css", "utf8");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Conviction AI</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
<style>${css}</style></head>
<body><div id="root"></div><script>${js}</script></body></html>`;
writeFileSync("dist/index.html", html);
console.log(`built dist/index.html (${(html.length / 1024).toFixed(0)} KB)`);
