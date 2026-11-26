import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: Number(process.env.PORT ?? 4174),
    strictPort: true,
  },
});

await server.listen();
server.printUrls();
