const DEV_PROXY_TARGET = "backend:8000";

function readBodyMessage(body = "") {
  const trimmed = body.trim();
  if (!trimmed) return "";

  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed?.detail === "string") return parsed.detail;
    if (Array.isArray(parsed?.detail)) return parsed.detail.map(String).join("; ");
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // Fall through to plain text.
  }

  return trimmed;
}

function looksLikeProxyFailure({ status, body = "", cause = "" }) {
  const t = `${body} ${cause}`.toLowerCase();

  if (t.includes("enotfound backend")) return true;
  if (t.includes("econnrefused")) return true;
  if (t.includes("getaddrinfo")) return true;
  if (t.includes("bad gateway")) return true;
  if (t.includes("failed to fetch")) return true;
  if (status === 500 && t.includes("proxy")) return true;

  // Vite proxy often returns bare 500 in dev when upstream is unreachable.
  if (status === 500 && !body.trim()) return true;

  return false;
}

function devApiMessage(endpoint) {
  return (
    `Dev API unreachable (proxy target ${DEV_PROXY_TARGET}). ` +
    `Start the backend (endpoint: ${endpoint}).`
  );
}

export function buildApiError({ endpoint, status, body = "", cause = "" }) {
  const message = readBodyMessage(body);

  if (looksLikeProxyFailure({ status, body, cause })) {
    return new Error(devApiMessage(endpoint));
  }

  if (status === 0 && cause) {
    return new Error(`API request failed: ${cause} (endpoint: ${endpoint})`);
  }

  if (status === 504) {
    const detail = message || "backend timed out while preparing this data";
    return new Error(`API timeout: ${detail} (endpoint: ${endpoint})`);
  }

  const detail = message || cause;
  const hint = detail ? ` - ${detail.slice(0, 200)}` : "";
  return new Error(`API error ${status}${hint} (endpoint: ${endpoint})`);
}
