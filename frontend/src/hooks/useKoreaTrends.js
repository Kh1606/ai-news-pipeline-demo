import { useEffect, useState } from "react";
import { buildApiError } from "../api/errorHints";

// Trends is a one-shot fetch per page load, and the backend may need to warm
// the DB-backed cache on first request.
const DEFAULT_TIMEOUT_MS = 60000;

function composeSignals(external, timeoutMs) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!external) return timeoutSignal;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([external, timeoutSignal]);
  }
  const ac = new AbortController();
  const abort = () => ac.abort();
  external.addEventListener("abort", abort, { once: true });
  timeoutSignal.addEventListener("abort", abort, { once: true });
  return ac.signal;
}

export default function useKoreaTrends(opts = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const ac = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const p = new URLSearchParams();
        if (opts.start) p.set("start", opts.start);
        if (opts.end) p.set("end", opts.end);

        // IMPORTANT: backend expects snake_case
        if (opts.min_ai != null) p.set("min_ai", String(opts.min_ai));
        if (opts.min_primary != null) p.set("min_primary", String(opts.min_primary));
        if (opts.min_topic != null) p.set("min_topic", String(opts.min_topic));
        if (opts.score_version) p.set("score_version", String(opts.score_version));

        const endpoint = "/api/trends/kr.json";
        const url = `${endpoint}?${p.toString()}`;
        let res;
        try {
          res = await fetch(url, {
            signal: composeSignals(ac.signal, DEFAULT_TIMEOUT_MS),
          });
        } catch (fetchErr) {
          if (fetchErr?.name === "AbortError") throw fetchErr;
          if (fetchErr?.name === "TimeoutError") {
            throw buildApiError({
              endpoint,
              status: 0,
              cause: `request timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`,
            });
          }
          throw buildApiError({
            endpoint,
            status: 0,
            cause: fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
          });
        }

        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw buildApiError({
            endpoint,
            status: res.status,
            body,
          });
        }

        const json = await res.json();
        if (!ac.signal.aborted) setData(json);
      } catch (e) {
        if (ac.signal.aborted || e?.name === "AbortError") return;
        setError(e);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }

    load();
    return () => {
      ac.abort();
    };
  }, [
    opts.start, opts.end,
    opts.min_ai, opts.min_primary, opts.min_topic, opts.score_version,
  ]);

  return { data, loading, error };
}
