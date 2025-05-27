import http from 'http';
import https from 'https';

const convexUrl = process.env.CONVEX_URL || 'http://localhost:3100';
const port = Number(process.env.PORT || 4000);

const target = new URL(convexUrl);
const client = target.protocol === 'https:' ? https : http;

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', target);
  const options: http.RequestOptions = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = client.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  req.pipe(proxyReq);
});

server.listen(port, () => {
  console.log(`Convex proxy server listening on port ${port}`);
});
