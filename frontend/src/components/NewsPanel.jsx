import { useEffect, useMemo, useRef } from "react";

function fmtMeta(item) {
  const parts = [];
  if (item?.source_name) parts.push(item.source_name);
  if (item?.country_code) parts.push(item.country_code);
  if (item?.lang) parts.push(item.lang);
  if (item?.ai_score != null) parts.push(`score ${Number(item.ai_score).toFixed(2)}`);
  return parts.join(" · ");
}

function ClickCard({ item, variant = "active", onPick }) {
  const isActive = variant === "active";
  const cls = isActive ? "card active" : "card compact";

  const excerpt = (item.excerpt || "").trim();
  const showExcerpt = isActive && excerpt.length > 0;

  return (
    <a
      className={cls}
      href={item.url}
      target="_blank"
      rel="noreferrer"
      onClick={() => onPick?.(item)}
      title={item.title}
    >
      <div className="meta">{fmtMeta(item)}</div>

      {isActive ? (
        <>
          <div className="title">{item.title}</div>

          {item.image_url && (
            <div className="heroWrap">
              <img
                className="heroImg"
                src={item.image_url}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.target.style.display = "none";
                }}
              />
            </div>
          )}

          {showExcerpt && <div className="excerpt">{excerpt}</div>}
        </>
      ) : (
        <div className="compactRow">
          {item.image_url ? (
            <img
              className="mini"
              src={item.image_url}
              alt=""
              loading="lazy"
              onError={(e) => {
                e.target.style.display = "none";
              }}
            />
          ) : (
            <div className="mini placeholder" />
          )}
          <div className="compactTitle">{item.title}</div>
        </div>
      )}
    </a>
  );
}

export default function NewsPanel({ loading, error, active, history, onSelect, onRefresh, reload }) {
  const refresh = onRefresh || reload;
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (el.scrollTop < 30) el.scrollTop = 0;
  }, [history.length]);

  const hasAny = Boolean(active) || (history?.length || 0) > 0;
  const historySafe = useMemo(() => history || [], [history]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">AI News</div>
        <button className="btn" onClick={refresh} disabled={loading || !refresh}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {error ? <div className="errorBox">{String(error)}</div> : null}
  
      {!hasAny && (
        <div className="empty">
          {loading ? "Loading..." : error ? "API error. Check backend logs." : "Waiting for the first article..."}
        </div>
      )}
  
      {hasAny && (
        <div className="feedScroll" ref={listRef}>
          {active && <ClickCard item={active} variant="active" onPick={onSelect} />}
  
          {historySafe.map((h) => (
            <ClickCard key={h.url_hash} item={h} variant="compact" onPick={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}
