import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), "VITE_");
function reject(reason) {
  console.error("BUILD_ENV_REJECTED: " + reason);
  process.exit(1);
}
function address(key, protocol, pathname) {
  let url;
  try { url = new URL(env[key]); }
  catch { reject(key + " must be an absolute URL"); }

  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== protocol ||
    url.username || url.password || url.search || url.hash ||
    ["localhost", "0.0.0.0", "::1", "[::1]"].includes(host) ||
    /^127\./.test(host) || host.endsWith(".localhost") ||
    url.pathname.replace(/\/$/, "") !== pathname
  ) reject(key + " has an unsafe or unexpected production address");
  return url;
}

const api = address("VITE_API_URL", "https:", "/api");
const ws = address("VITE_WS_URL", "wss:", "/ws");
if (api.host !== ws.host) reject("API and WebSocket hosts must match");
console.log("PRODUCTION_BUILD_ENV_OK: " + api.origin + api.pathname);
