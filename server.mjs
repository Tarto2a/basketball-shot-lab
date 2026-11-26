import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const assets = {
  "/": ["index.html", "text/html"],
  "/index.html": ["index.html", "text/html"],
  "/styles.css": ["styles.css", "text/css"],
  "/app.mjs": ["app.mjs", "text/javascript"],
  "/model.mjs": ["model.mjs", "text/javascript"],
  "/chart.mjs": ["chart.mjs", "text/javascript"],
  "/physics.mjs": ["physics.mjs", "text/javascript"],
};
const port = Number(process.env.PORT ?? 4174);

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  const path = request.url.split("?")[0];
  if (path === "/favicon.ico") {
    response.writeHead(204).end();
    return;
  }
  if (!Object.hasOwn(assets, path)) {
    response.writeHead(404).end("File not found.");
    return;
  }
  try {
    const [filename, mime] = assets[path];
    const content = await readFile(new URL(filename, import.meta.url));
    response.writeHead(200, {
      "Content-Type": mime + "; charset=utf-8",
      "Content-Length": content.length,
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(500).end("Could not load the requested file.");
  }
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write("Basketball Shot Lab is running at http://127.0.0.1:" + server.address().port + "/\n");
});
