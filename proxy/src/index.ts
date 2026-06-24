import * as http from "node:http";
import httpProxy from "http-proxy";
import { resolveTargetUrl } from "./target.js";

const PORT = Number(process.env.PORT ?? "3000");

const proxy = httpProxy.createProxyServer({
  ws: true,
  changeOrigin: true,
});

proxy.on("error", (err, _req, target) => {
  console.error("proxy error:", err);
  // target は HTTP では ServerResponse、WebSocket では Socket。
  if (target instanceof http.ServerResponse) {
    if (!target.headersSent) {
      target.writeHead(502, { "content-type": "text/plain" });
    }
    target.end("Bad Gateway");
  } else {
    target.destroy();
  }
});

const server = http.createServer(async (req, res) => {
  try {
    const target = await resolveTargetUrl();
    if (!target) {
      res.writeHead(503, { "content-type": "text/plain" });
      res.end("No running task");
      return;
    }
    proxy.web(req, res, { target });
  } catch (err) {
    console.error("failed to resolve target:", err);
    res.writeHead(502, { "content-type": "text/plain" });
    res.end("Bad Gateway");
  }
});

server.on("upgrade", async (req, socket, head) => {
  try {
    const target = await resolveTargetUrl();
    if (!target) {
      socket.destroy();
      return;
    }
    proxy.ws(req, socket, head, { target });
  } catch (err) {
    console.error("failed to resolve target:", err);
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`proxy listening on :${PORT}`);
});
