import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const port = Number(process.env.PORT || 4173);
const prefix = "/calorie_tracker";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".jpg": "image/jpeg" };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === prefix || url.pathname === "/") {
      res.writeHead(302, { Location: prefix + "/" }).end();
      return;
    }
    if (!url.pathname.startsWith(prefix + "/")) {
      res.writeHead(404).end("Not found");
      return;
    }
    const relative = decodeURIComponent(url.pathname.slice(prefix.length + 1));
    let target = resolve(root, relative || ".");
    if (target !== resolve(root) && !target.startsWith(resolve(root) + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if ((await stat(target)).isDirectory()) target = resolve(target, "index.html");
    const bytes = await readFile(target);
    res.writeHead(200, { "Content-Type": types[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(bytes);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log("Preview: http://127.0.0.1:" + port + prefix + "/");
});
