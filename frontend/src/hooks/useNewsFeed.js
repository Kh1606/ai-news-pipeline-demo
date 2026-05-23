import { useEffect, useMemo, useRef, useState } from "react";
import { fetchArticles } from "../api/articles";

const BACKGROUND_MIN_REFRESH_GAP_MS = 30000;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Re-orders a shuffled array so no two consecutive items share the same
 * country_code. Preserves the within-country order from the shuffle.
 * This prevents the map from jumping between the same region repeatedly.
 */
function spreadByCountry(arr) {
  if (arr.length <= 1) return arr;
  const out = [];
  const pool = [...arr];
  let lastCC = null;

  while (pool.length > 0) {
    // Find the first item whose country differs from the last picked.
    let idx = pool.findIndex(
      (item) => (item.country_code || "_unknown") !== lastCC
    );
    // If all remaining are same country, just drain in order.
    if (idx === -1) idx = 0;
    const [item] = pool.splice(idx, 1);
    out.push(item);
    lastCC = item.country_code || "_unknown";
  }
  return out;
}

export function useNewsFeed({
  minAiScore = 0.5,
  limit = 300,
  scoreVersion = "v2",
  rotateMs = 3500,
  refreshMs = 60000,
  maxHistory = 200,
} = {}) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeChange, setActiveChange] = useState({ source: "init", ts: 0 });

  const idxRef = useRef(0);
  const startedRef = useRef(false);
  const inflightRef = useRef(null);
  const itemsRef = useRef([]);
  const lastFinishedAtRef = useRef(0);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  async function load({ clearUI = true } = {}) {
    const hasItems = itemsRef.current.length > 0;
    const now = Date.now();

    if (!clearUI) {
      if (inflightRef.current) return;
      if (now - lastFinishedAtRef.current < BACKGROUND_MIN_REFRESH_GAP_MS) {
        return;
      }
    } else {
      // Manual/full reloads should win over any background request.
      inflightRef.current?.abort();
    }

    const ac = new AbortController();
    inflightRef.current = ac;
    const showLoading = clearUI || !hasItems;

    if (showLoading) setLoading(true);
    try {
      if (clearUI || !hasItems) setError(null);
      const list = await fetchArticles(
        { minAiScore, limit, scoreVersion },
        { signal: ac.signal }
      );
      if (ac.signal.aborted) return;

      const next = spreadByCountry(shuffle(list || []));
      setItems(next);
      idxRef.current = 0;
      setError(null);

      if (clearUI) {
        setActive(null);
        setHistory([]);
        startedRef.current = false;
        setActiveChange({ source: "refresh", ts: Date.now() });
      }
    } catch (e) {
      // Swallow caller-initiated aborts; they are how we cancel stale loads.
      if (ac.signal.aborted || e?.name === "AbortError") return;
      console.error("Failed to load articles", e);
      if (clearUI || !itemsRef.current.length) {
        setError(e);
      }
      if (clearUI && !itemsRef.current.length) {
        setItems([]);
        setActive(null);
        setHistory([]);
      }
    } finally {
      if (inflightRef.current === ac) {
        inflightRef.current = null;
        lastFinishedAtRef.current = Date.now();
      }
      if (!ac.signal.aborted && showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    load({ clearUI: true });

    const tick = () => {
      // Skip polling while the tab is hidden; saves API calls and avoids
      // piling up stale fetches.
      if (document.hidden) return;
      load({ clearUI: false });
    };
    const t = setInterval(tick, refreshMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        load({ clearUI: false });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisibility);
      inflightRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minAiScore, limit, scoreVersion, refreshMs]);

  const pick = (item, { source = "manual" } = {}) => {
    if (!item) return;

    setActive((prev) => {
      setHistory((h) => {
        // Always remove the picked item from history (so it becomes active cleanly)
        let out = h.filter((x) => x.url_hash !== item.url_hash);

        // If we had a previous active, push it to top (unique)
        if (prev && prev.url_hash !== item.url_hash) {
          out = [prev, ...out.filter((x) => x.url_hash !== prev.url_hash)];
        }

        return out.slice(0, maxHistory);
      });

      return item;
    });

    setActiveChange({ source, ts: Date.now(), urlHash: item.url_hash });
  };

  // Pick first valid item immediately when articles first load
  useEffect(() => {
    if (!items.length || startedRef.current) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const lat = parseFloat(item?.lat);
      const lon = parseFloat(item?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        startedRef.current = true;
        idxRef.current = i + 1;
        pick(item, { source: "auto" });
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    const t = setInterval(() => {
      // Pause rotation while the tab is hidden; no point animating to a card
      // the user cannot see.
      if (document.hidden) return;
      if (!items.length) return;

      // first tick should start the feed
      if (!startedRef.current) {
        startedRef.current = true;
      }

      let tries = 0;
      while (tries < items.length) {
        const item = items[idxRef.current % items.length];
        idxRef.current += 1;
        tries += 1;

        const lat = parseFloat(item?.lat);
        const lon = parseFloat(item?.lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          pick(item, { source: "auto" });
          break;
        }
      }
    }, rotateMs);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, rotateMs]);

  const markers = useMemo(() => {
    const out = [];
    if (active) out.push({ ...active, _kind: "active" });
    const recentHistory = history.slice(0, 30);
    for (const h of recentHistory) out.push({ ...h, _kind: "history" });
    return out;
  }, [active, history]);

  return {
    loading,
    error,
    items,
    active,
    history,
    markers,
    reload: () => load({ clearUI: true }),
    pick,
    activeChange,
    // backward-compatible name if you used it elsewhere
    setActiveByItem: pick,
  };
}
