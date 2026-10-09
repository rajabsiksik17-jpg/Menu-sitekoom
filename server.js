// Production entry point for hosts that start a Node.js app from an entry file (Hostinger, Passenger, cPanel…).
// Equivalent to `next start`, but listens on whatever PORT the host provides (or the socket it injects).
const http = require("node:http");
const next = require("next");

const port = Number(process.env.PORT) || 3000;
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  http.createServer((req, res) => handle(req, res)).listen(port, () => console.log(`POS-SITEKOOM Menu ready on port ${port}`));
}).catch((e) => {
  console.error("Failed to start:", e);
  process.exit(1);
});
