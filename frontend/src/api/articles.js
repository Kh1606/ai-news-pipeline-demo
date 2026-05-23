import { buildApiError } from "./errorHints";

const DEFAULT_TIMEOUT_MS = 45000;
const DEFAULT_RETRIES = 1;
const RETRY_DELAY_MS = 750;

function makeRetryable(error) {
  error.retryable = true;
  return error;
}

function createRequestSignal(external, timeoutMs) {
  const ac = new AbortController();
  let timedOut = false;

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    ac.abort();
  }, timeoutMs);

  const abortFromExternal = () => {
    if (!ac.signal.aborted) ac.abort(external?.reason);
  };

  if (external) {
    if (external.aborted) {
      abortFromExternal();
    } else {
      external.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  return {
    signal: ac.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      window.clearTimeout(timeoutId);
      external?.removeEventListener?.("abort", abortFromExternal);
    },
  };
}

function waitForRetry(ms, signal) {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(resolve, ms);
    const abort = () => {
      window.clearTimeout(id);
      reject(new DOMException("Retry aborted", "AbortError"));
    };

    if (signal?.aborted) {
      abort();
      return;
    }

    signal?.addEventListener("abort", abort, { once: true });
  });
}

async function fetchArticlesOnce(url, { signal, timeoutMs }) {
  const request = createRequestSignal(signal, timeoutMs);

  try {
    const res = await fetch(url, { signal: request.signal });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = buildApiError({
        endpoint: "/api/articles",
        status: res.status,
        body,
      });
      error.apiStatus = res.status;
      throw error;
    }

    const data = await res.json();
    if (Array.isArray(data)) return data;
    return Array.isArray(data?.items) ? data.items : [];
  } catch (e) {
    if (request.didTimeout()) {
      throw makeRetryable(
        buildApiError({
          endpoint: "/api/articles",
          status: 0,
          cause: `request timed out after ${timeoutMs / 1000}s`,
        })
      );
    }

    // Caller-initiated cancel: propagate raw so the hook can detect it via
    // its own AbortController signal and stay silent.
    if (signal?.aborted || e?.name === "AbortError") throw e;

    if (e?.apiStatus) throw e;

    if (e?.retryable) throw e;

    throw makeRetryable(
      buildApiError({
        endpoint: "/api/articles",
        status: 0,
        cause: e instanceof Error ? e.message : String(e),
      })
    );
  } finally {
    request.cleanup();
  }
}

export async function fetchArticles(
  { minAiScore = 0.5, limit = 200, scoreVersion = "v2" } = {},
  { signal, timeoutMs = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES } = {}
) {
  const url =
    `/api/articles?min_ai_score=${encodeURIComponent(minAiScore)}` +
    `&limit=${encodeURIComponent(limit)}` +
    `&score_version=${encodeURIComponent(scoreVersion)}`;

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchArticlesOnce(url, { signal, timeoutMs });
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      lastError = e;
      if (!e?.retryable || attempt >= retries) break;
      await waitForRetry(RETRY_DELAY_MS, signal);
    }
  }

  throw lastError;
}
