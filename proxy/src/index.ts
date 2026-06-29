import * as http from "node:http";
import httpProxy from "http-proxy";
import { resolveTargetUrl } from "./target.js";

const PORT = Number(process.env.PORT ?? "3000");

const proxy = httpProxy.createProxyServer({
  ws: true,
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
    target.write(
      "HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\n",
    );
    target.destroy();
  }
});

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

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
      socket.write(
        "HTTP/1.1 503 Service Unavailable\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nNo running task",
      );
      socket.destroy();
      return;
    }
    proxy.ws(req, socket, head, { target });
  } catch (err) {
    console.error("failed to resolve target:", err);
    socket.write(
      "HTTP/1.1 502 Bad Gateway\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nBad Gateway",
    );
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`proxy listening on :${PORT}`);
});
