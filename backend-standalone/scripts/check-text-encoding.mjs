import { promises as fs } from "node:fs";
import path from "node:path";

const roots = ["src", "supabase", "scripts"];
const extensions = new Set([".ts", ".tsx", ".js", ".mjs", ".md", ".sql", ".toml"]);
const mojibake = /Ã[¡-¿ƒ]|Â[\u0080-\u00bf]|â[€™œ“”€¢†‡]|ðŸ|ï¿½|\uFFFD/u;
const failures = [];

async function visit(target) {
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    return;
  }
  if (stat.isDirectory()) {
    for (const name of await fs.readdir(target)) {
      if (["node_modules", "dist", "build", ".git"].includes(name)) continue;
      await visit(path.join(target, name));
    }
    return;
  }
  if (!extensions.has(path.extname(target))) return;
  if (path.basename(target) === "check-text-encoding.mjs") return;
  const lines = (await fs.readFile(target, "utf8")).split(/\r?\n/);
  lines.forEach((line, index) => {
    if (mojibake.test(line)) failures.push(`${target}:${index + 1}`);
  });
}

for (const root of roots) await visit(root);
if (failures.length) {
  console.error("Texto com codificação corrompida:");
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}
console.log("Codificação UTF-8 verificada.");
