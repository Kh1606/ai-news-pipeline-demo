import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Line,
  XAxis,
  YAxis,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Customized,
  Area,
  ComposedChart,
  Tooltip,
} from "recharts";
import useKoreaTrends from "../hooks/useKoreaTrends";

// 6 colors for 6 topics - distinct and vibrant
const COLORS = [
  { main: "#6366f1", glow: "#818cf8" },  // indigo - genai_foundation
  { main: "#10b981", glow: "#34d399" },  // emerald - ai_infra_compute
  { main: "#f43f5e", glow: "#fb7185" },  // rose - robotics_autonomy
  { main: "#f59e0b", glow: "#fbbf24" },  // amber - health_bio
  { main: "#8b5cf6", glow: "#a78bfa" },  // violet - enterprise_industry
  { main: "#06b6d4", glow: "#22d3ee" },  // cyan - security_trust
];

const ALLOWED_TOPICS = [
  "genai_foundation",
  "ai_infra_compute",
  "robotics_autonomy",
  "health_bio",
  "enterprise_industry",
  "security_trust",
];

const TOPIC_LABELS = {
  genai_foundation: "GenAI Foundation",
  ai_infra_compute: "AI Infra & Compute",
  robotics_autonomy: "Robotics & Autonomy",
  health_bio: "Health & Bio",
  enterprise_industry: "Enterprise & Industry",
  security_trust: "Security & Trust",
};

function prettyTopic(t) {
  return TOPIC_LABELS[t] || String(t)
    .replaceAll("_", " ")
    .replace(/\bai\b/gi, "AI")
    .replace(/\bllm\b/gi, "LLM");
}

function fmtDeltaPct(v) {
  const n = Number(v || 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}
function fmtDeltaNum(v) {
  const n = Number(v || 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}
function deltaClass(v) {
  const n = Number(v || 0);
  if (n > 0) return "trendDeltaUp";
  if (n < 0) return "trendDeltaDown";
  return "trendDeltaFlat";
}
function fmtIntDelta(v) {
  const n = Number(v || 0);
  const sign = n > 0 ? "+" : "";
  return `${sign}${Math.round(n)}`;
}

/**
 * Parses an ISO week label like "2025-W05" into the Date of that Monday.
 */
function isoWeekLabelToDate(weekLabel) {
  const m = /^(\d{4})-W(\d{2})$/.exec(weekLabel);
  if (!m) return null;
  const year = parseInt(m[1]);
  const week = parseInt(m[2]);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayOfWeek = jan4.getUTCDay() || 7; // Mon=1, Sun=7
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (jan4DayOfWeek - 1) + (week - 1) * 7);
  return monday;
}

/**
 * Click layer: one invisible rect per week column.
 */
function WeekClickLayer({ xAxisMap, offset, data, onWeekClick }) {
  const axis = xAxisMap ? Object.values(xAxisMap)[0] : null;
  const scale = axis?.scale;

  if (!scale || !offset || !Array.isArray(data) || data.length === 0) return null;

  const { top, left, width, height } = offset;
  const weeks = data.map((d) => d.week);

  const xs = weeks
    .map((w) => scale(w))
    .map((x) => (Number.isFinite(x) ? x : null));

  if (xs.some((x) => x == null)) return null;

  const rects = weeks.map((week, i) => {
    const x = xs[i];
    const xPrev = i > 0 ? xs[i - 1] : null;
    const xNext = i < xs.length - 1 ? xs[i + 1] : null;

    const x0 = i === 0 ? left : (xPrev + x) / 2;
    const x1 = i === xs.length - 1 ? left + width : (x + xNext) / 2;

    return { week, x: x0, w: Math.max(1, x1 - x0) };
  });

  return (
    <g>
      {rects.map((r) => (
        <rect
          key={r.week}
          x={r.x}
          y={top}
          width={r.w}
          height={height}
          fill="transparent"
          style={{ cursor: "pointer", pointerEvents: "all" }}
          onClick={(e) => onWeekClick?.(r.week, e)}
        />
      ))}
    </g>
  );
}

export default function KoreaTrends() {
  const [startDate, setStartDate] = useState("2026-01-01");
  const { data, loading, error } = useKoreaTrends({
    start: startDate,
    min_ai: 0.5,
    min_primary: 0.4,
    min_topic: 0.4,
    score_version: "v2",
  });

  const [metric, setMetric] = useState("share");
  const [popup, setPopup] = useState(null);
  const wrapRef = useRef(null);

  const { chartRows, topics, yMax, weekIndexMap } = useMemo(() => {
    const weeks = data?.weeks || [];

    const totals = new Map();
    for (const w of weeks) {
      for (const t of w.topics || []) {
        if (ALLOWED_TOPICS.includes(t.topic)) {
          totals.set(t.topic, (totals.get(t.topic) || 0) + (t.points || 0));
        }
      }
    }

    const topTopics = ALLOWED_TOPICS.filter(topic => totals.has(topic))
      .sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0));

    const finalTopics = topTopics.length > 0 ? topTopics : ALLOWED_TOPICS;

    // Build rows with raw share_pct and points; no per-row normalization yet.
    // Normalizing before smoothing causes outlier weeks to leak their shape
    // into the next 2 weeks via the rolling mean. Order matters here:
    // smooth raw, then renormalize the smoothed shares.
    const rows = weeks.map((w) => {
      const row = {
        week: w.week_label,
        __week_total_points: Number(w.total_points ?? 0),
        __week_article_count: Number(w.article_count ?? 0),
      };

      for (const topic of finalTopics) {
        row[topic] = 0;
        row[`${topic}__points`] = 0;
      }

      for (const t of w.topics || []) {
        if (!finalTopics.includes(t.topic)) continue;
        row[t.topic] = t.share_pct ?? 0;
        row[`${t.topic}__points`] = t.points ?? 0;
      }

      return row;
    });

    const MIN_ARTICLES_PER_WEEK = 3;
    const filteredRows = rows.filter((r) => Number(r.__week_article_count || 0) >= MIN_ARTICLES_PER_WEEK);
    const baseRows = filteredRows.length > 0 ? filteredRows : rows;

    // 3-week rolling mean over RAW share + points.
    const smoothedRows = baseRows.map((row, idx) => {
      if (idx === 0) return { ...row };
      const smoothed = { ...row };
      const windowSize = Math.min(3, idx + 1);
      for (const topic of finalTopics) {
        let sumShare = 0;
        let sumPoints = 0;
        for (let w = 0; w < windowSize; w++) {
          sumShare += Number(baseRows[idx - w][topic] || 0);
          sumPoints += Number(baseRows[idx - w][`${topic}__points`] || 0);
        }
        smoothed[topic] = sumShare / windowSize;
        smoothed[`${topic}__points`] = sumPoints / windowSize;
      }
      return smoothed;
    });

    // Renormalize smoothed shares to sum to 100% per row so the stacked area
    // chart still adds up visually. Only affects the "share" metric; raw
    // points are left as-is for the "credit" metric.
    for (const row of smoothedRows) {
      const totalDisplayedShare = finalTopics.reduce(
        (sum, t) => sum + (Number(row[t]) || 0),
        0,
      );
      if (totalDisplayedShare > 0) {
        for (const topic of finalTopics) {
          row[topic] = (Number(row[topic] || 0) / totalDisplayedShare) * 100;
        }
      }
    }

    const valueFor = (r, topic) =>
      metric === "share"
        ? Number(r[topic] || 0)
        : Number(r[`${topic}__points`] || 0);

    let maxV = 0;
    for (const r of smoothedRows) {
      for (const topic of finalTopics) maxV = Math.max(maxV, valueFor(r, topic));
    }
    const headroom = maxV <= 0 ? 5 : Math.max(2, Math.ceil(maxV * 0.25));
    const dynamicMax = Math.ceil(maxV + headroom);

    const idxMap = new Map();
    smoothedRows.forEach((r, i) => idxMap.set(r.week, i));

    return { chartRows: smoothedRows, topics: finalTopics, yMax: dynamicMax, weekIndexMap: idxMap };
  }, [data, metric]);

  // Compute month boundary lines from chartRows week labels.
  const monthLines = useMemo(() => {
    if (!chartRows.length) return [];
    const lines = [];
    let prevKey = null;
    for (const row of chartRows) {
      const date = isoWeekLabelToDate(row.week);
      if (!date) continue;
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      if (prevKey !== null && key !== prevKey) {
        const label = date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
        lines.push({ week: row.week, label });
      }
      prevKey = key;
    }
    return lines;
  }, [chartRows]);

  // close popup when clicking outside
  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) setPopup(null);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function metricValue(row, topic) {
    return metric === "share"
      ? Number(row?.[topic] || 0)
      : Number(row?.[`${topic}__points`] || 0);
  }

  function metricDelta(nowRow, prevRow, topic) {
    const now = metricValue(nowRow, topic);
    const prev = prevRow ? metricValue(prevRow, topic) : 0;
    return now - prev;
  }

  function formatMetric(v) {
    return metric === "share" ? `${Number(v || 0).toFixed(2)}%` : `${Number(v || 0).toFixed(2)}`;
  }

  function formatMetricDelta(v) {
    return metric === "share" ? fmtDeltaPct(v) : fmtDeltaNum(v);
  }

  function handleWeekClick(weekLabel, e) {
    e?.stopPropagation?.();

    const idx = weekIndexMap.get(weekLabel);
    if (idx == null) return;

    const row = chartRows[idx];
    const prev = idx > 0 ? chartRows[idx - 1] : null;

    const weekTotal = Number(row.__week_article_count || 0);
    const prevTotal = prev ? Number(prev.__week_article_count || 0) : 0;
    const totalDelta = weekTotal - prevTotal;

    const sorted = topics
      .map((t) => {
        const v = metricValue(row, t);
        const d = metricDelta(row, prev, t);
        return {
          topic: t,
          val: v,
          delta: d,
          share: Number(row[t] || 0),
          points: Number(row[`${t}__points`] || 0),
        };
      })
      .sort((a, b) => b.val - a.val);

    setPopup({
      mode: "week",
      week: weekLabel,
      idx,
      list: sorted,
      weekTotal,
      totalDelta,
      metric,
    });
  }

  function handleTopicPointClick(weekLabel, topic, e) {
    e?.stopPropagation?.();

    const idx = weekIndexMap.get(weekLabel);
    if (idx == null) return;

    const row = chartRows[idx];
    const prev = idx > 0 ? chartRows[idx - 1] : null;

    const valNow = metricValue(row, topic);
    const valPrev = prev ? metricValue(prev, topic) : 0;
    const valDelta = valNow - valPrev;

    const weekTotal = Number(row.__week_article_count || 0);
    const prevTotal = prev ? Number(prev.__week_article_count || 0) : 0;
    const totalDelta = weekTotal - prevTotal;

    setPopup({
      mode: "topic",
      week: weekLabel,
      idx,
      topic,
      metric,
      valNow,
      valDelta,
      weekTotal,
      totalDelta,
      shareNow: Number(row[topic] || 0),
      topicPoints: Number(row[`${topic}__points`] || 0),
    });
  }

  // Dots: small always-visible dot; larger + glow ring on selected week.
  const makeDotRenderer = (topic, colorIdx) => (dotProps) => {
    const { cx, cy, payload } = dotProps;
    if (!payload) return null;

    const isSelectedWeek = payload.week === popup?.week;
    const color = COLORS[colorIdx % COLORS.length];

    const v = metric === "share"
      ? Number(payload[topic] || 0)
      : Number(payload[`${topic}__points`] || 0);

    if (v <= 0) return null;

    return (
      <g>
        {/* Glow ring only on selected week */}
        {isSelectedWeek && (
          <circle
            cx={cx}
            cy={cy}
            r={8}
            fill="none"
            stroke={color.glow}
            strokeWidth={2}
            opacity={0.4}
            pointerEvents="none"
          />
        )}
        {/* Always-visible dot, larger on selected week */}
        <circle
          cx={cx}
          cy={cy}
          r={isSelectedWeek ? 5 : 3}
          fill={color.main}
          stroke="rgba(15,23,42,0.85)"
          strokeWidth={1.5}
          pointerEvents="none"
        />
        {/* Invisible larger click target */}
        <circle
          cx={cx}
          cy={cy}
          r={11}
          fill="transparent"
          style={{ cursor: "pointer", pointerEvents: "all" }}
          onClick={(e) => handleTopicPointClick(payload.week, topic, e)}
        />
      </g>
    );
  };

  // Legend click: opens topic detail for last week if none is selected.
  function onLegendClick(e) {
    let topic = e?.dataKey;
    if (!topic) return;
    // Strip __points suffix from credit metric dataKey.
    if (topic.endsWith("__points")) topic = topic.replace("__points", "");
    if (!ALLOWED_TOPICS.includes(topic)) return;

    const targetWeek =
      popup?.week ?? (chartRows.length > 0 ? chartRows[chartRows.length - 1].week : null);
    if (!targetWeek) return;
    handleTopicPointClick(targetWeek, topic, e);
  }

  // Custom hover tooltip shows all topics at the hovered week.
  const renderTooltip = useCallback(
    ({ active, payload, label }) => {
      if (!active || !payload?.length) return null;
      const row = payload[0]?.payload;
      if (!row) return null;

      // Deduplicate: areas and lines share the same dataKey.
      const seen = new Set();
      const entries = payload
        .filter((p) => {
          const key = String(p.dataKey);
          const slug = key.endsWith("__points") ? key.replace("__points", "") : key;
          if (!ALLOWED_TOPICS.includes(slug)) return false;
          if (seen.has(slug)) return false;
          seen.add(slug);
          return true;
        })
        .sort((a, b) => b.value - a.value);

      if (!entries.length) return null;

      return (
        <div className="trendsTooltip">
          <div className="trendsTooltipWeek">{label}</div>
          {entries.map((p) => {
            const key = String(p.dataKey);
            const slug = key.endsWith("__points") ? key.replace("__points", "") : key;
            return (
              <div key={slug} className="trendsTooltipRow">
                <span className="trendsTooltipDot" style={{ background: p.color }} />
                <span className="trendsTooltipLabel">{prettyTopic(slug)}</span>
                <span className="trendsTooltipVal">
                  {metric === "share"
                    ? `${Number(p.value || 0).toFixed(1)}%`
                    : Number(p.value || 0).toFixed(2)}
                </span>
              </div>
            );
          })}
          <div className="trendsTooltipMeta">{row.__week_article_count} articles</div>
        </div>
      );
    },
    [metric]
  );

  const focusTopic = popup?.mode === "topic" ? popup.topic : null;

  return (
    <div className="trendsCard">
      {/* Decorative corners */}
      <div className="trendsCorner trendsCornerTL" />
      <div className="trendsCorner trendsCornerTR" />
      <div className="trendsCorner trendsCornerBL" />
      <div className="trendsCorner trendsCornerBR" />

      <div className="cardHeader">
        <div className="cardHeaderLeft">
          <div className="trendsBadge">LIVE</div>
          <div>
            <div className="cardTitle">Korea AI Trends</div>
            <div className="cardSub">
              Hover to see values / Click week column for summary / Click dot for topic detail
            </div>
          </div>
        </div>

        <div className="cardMeta">
          <select
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              background: "#1e2228",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              color: "rgba(241,245,249,0.8)",
              padding: "6px 10px",
              fontSize: "12px",
              cursor: "pointer",
              marginRight: "8px",
            }}
          >
            <option value="2025-01-01" style={{ background: "#1e2228", color: "rgba(241,245,249,0.8)" }}>From Jan 2025</option>
            <option value="2025-07-01" style={{ background: "#1e2228", color: "rgba(241,245,249,0.8)" }}>From Jul 2025</option>
            <option value="2026-01-01" style={{ background: "#1e2228", color: "rgba(241,245,249,0.8)" }}>From Jan 2026</option>
            <option value="2026-02-01" style={{ background: "#1e2228", color: "rgba(241,245,249,0.8)" }}>From Feb 2026</option>
          </select>

          <div className="trendToggle">
            <button
              className={`trendToggleBtn ${metric === "share" ? "on" : ""}`}
              onClick={() => setMetric("share")}
            >
              Share %
            </button>
            <button
              className={`trendToggleBtn ${metric === "credit" ? "on" : ""}`}
              onClick={() => setMetric("credit")}
            >
              Topic Credit
            </button>
          </div>

          <div className="trendsWeekCount">
            {loading ? (
              <span className="trendsLoading">
                <span className="trendsSpinner" />
                Loading...
              </span>
            ) : error ? (
              <span className="trendsError">Error</span>
            ) : (
              `${chartRows.length} weeks`
            )}
          </div>
        </div>
      </div>

      {error && <div className="cardError">{String(error)}</div>}

      {!loading && !error && chartRows.length > 0 ? (
        <div className="trendsBodyRow">
          <div className="trendsChartWrap trendClickWrap" ref={wrapRef}>
          <div className="trendsChartGlow" />

          <ResponsiveContainer width="100%" height={360} minWidth={0}>
            <ComposedChart data={chartRows} margin={{ top: 16, right: 24, left: 0, bottom: 12 }}>
              <defs>
                {topics.map((t, idx) => {
                  const color = COLORS[idx % COLORS.length];
                  return (
                    <linearGradient key={`grad-${t}`} id={`areaGrad-${idx}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color.main} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={color.main} stopOpacity={0.02} />
                    </linearGradient>
                  );
                })}
                <filter id="trendGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.06)"
                vertical={false}
              />

              <XAxis
                dataKey="week"
                tickMargin={10}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
              />
              <YAxis
                domain={[0, yMax]}
                tickFormatter={(v) => (metric === "share" ? `${v}%` : `${v}`)}
                width={44}
                axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
                tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }}
              />

              {/* Hover tooltip */}
              <Tooltip
                content={renderTooltip}
                cursor={{ stroke: "rgba(255,255,255,0.12)", strokeWidth: 1, strokeDasharray: "4 4" }}
              />

              <Customized component={(layerProps) => (
                <WeekClickLayer {...layerProps} onWeekClick={handleWeekClick} />
              )} />

              {popup?.week && (
                <ReferenceLine
                  x={popup.week}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
              )}

              {/* Month boundary reference lines */}
              {monthLines.map((ml) => (
                <ReferenceLine
                  key={`month-${ml.week}`}
                  x={ml.week}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                  label={{
                    value: ml.label,
                    position: "insideTopLeft",
                    fill: "rgba(255,255,255,0.28)",
                    fontSize: 10,
                    dy: -4,
                  }}
                />
              ))}

              <Legend
                formatter={(value) => <span className="trendsLegendText">{prettyTopic(value)}</span>}
                onClick={onLegendClick}
                wrapperStyle={{ paddingTop: "12px", cursor: "pointer" }}
              />

              {/* Area fills */}
              {topics.map((t, idx) => {
                const isFocus = focusTopic && t === focusTopic;
                const isDim = focusTopic && t !== focusTopic;
                const dataKey = metric === "share" ? t : `${t}__points`;

                return (
                  <Area
                    key={`area-${t}`}
                    type="monotone"
                    dataKey={dataKey}
                    fill={`url(#areaGrad-${idx})`}
                    stroke="none"
                    legendType="none"
                    fillOpacity={isDim ? 0.05 : isFocus ? 0.4 : 0.25}
                    isAnimationActive={false}
                  />
                );
              })}

              {/* Lines */}
              {topics.map((t, idx) => {
                const isFocus = focusTopic && t === focusTopic;
                const isDim = focusTopic && t !== focusTopic;
                const color = COLORS[idx % COLORS.length];
                const dataKey = metric === "share" ? t : `${t}__points`;

                return (
                  <Line
                    key={t}
                    type="monotone"
                    dataKey={dataKey}
                    stroke={color.main}
                    strokeWidth={isFocus ? 3.5 : 2.5}
                    strokeOpacity={isDim ? 0.15 : 1}
                    filter={isFocus ? "url(#trendGlow)" : undefined}
                    dot={makeDotRenderer(t, idx)}
                    activeDot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>

          {/* WEEK POPUP */}
          {popup?.mode === "week" && (
            <div className="trendPopover">
              <div className="trendPopHeader">
                <div className="trendPopTitle">{popup.week}</div>
                <button className="trendPopClose" onClick={() => setPopup(null)}>
                  x
                </button>
              </div>

              <div className="trendPopMeta">
                AI news (week): <b>{Math.round(popup.weekTotal || 0)}</b>{" "}
                <span className={`trendDelta ${deltaClass(popup.totalDelta)}`}>
                  {fmtIntDelta(popup.totalDelta)}
                </span>
              </div>

              <div className="trendPopMeta" style={{ marginTop: -4 }}>
                Metric: <b>{popup.metric === "share" ? "Share %" : "Topic Credit"}</b>
              </div>

              <div className="trendPopList">
                {popup.list.map((x) => (
                  <div
                    key={x.topic}
                    className="trendPopRow"
                    onClick={(e) => handleTopicPointClick(popup.week, x.topic, e)}
                  >
                    <span
                      className="trendPopDot"
                      style={{ background: COLORS[topics.indexOf(x.topic) % COLORS.length]?.main }}
                    />
                    <div className="trendPopName">{prettyTopic(x.topic)}</div>
                    <div className="trendPopVal">
                      {formatMetric(x.val)}
                      <span className={`trendDelta ${deltaClass(x.delta)}`} style={{ marginLeft: 8 }}>
                        {formatMetricDelta(x.delta)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="trendPopHint">Click a row for topic details</div>
            </div>
          )}

          {/* TOPIC POPUP */}
          {popup?.mode === "topic" && (
            <div className="trendPopover trendPopoverTopic">
              <div className="trendPopHeader">
                <div>
                  <div className="trendPopTitle">{popup.week}</div>
                  <div className="trendPopSub trendPopSubBig">
                    <span
                      className="trendPopDot"
                      style={{ background: COLORS[topics.indexOf(popup.topic) % COLORS.length]?.main }}
                    />
                    {prettyTopic(popup.topic)}
                  </div>
                </div>
                <button className="trendPopClose" onClick={() => setPopup(null)}>
                  x
                </button>
              </div>

              <div className="trendPopStats">
                <div className="trendStatRow">
                  <span className="trendStatKey">
                    {popup.metric === "share" ? "Share" : "Topic Credit"}
                  </span>
                  <span className="trendStatVal">{formatMetric(popup.valNow)}</span>
                  <span className={`trendDelta ${deltaClass(popup.valDelta)}`}>
                    {formatMetricDelta(popup.valDelta)}
                  </span>
                </div>

                <div className="trendStatRow">
                  <span className="trendStatKey">AI news (week)</span>
                  <span className="trendStatVal">{Math.round(popup.weekTotal)}</span>
                  <span className={`trendDelta ${deltaClass(popup.totalDelta)}`}>
                    {fmtIntDelta(popup.totalDelta)}
                  </span>
                </div>

                <div className="trendStatRow">
                  <span className="trendStatKey">Other metric</span>
                  <span className="trendStatVal">
                    {popup.metric === "share"
                      ? `${popup.topicPoints.toFixed(2)}`
                      : `${popup.shareNow.toFixed(2)}%`}
                  </span>
                  <span className="trendDelta trendDeltaFlat">N/A</span>
                </div>
              </div>

              <div className="trendPopHint">Focused view: only this topic + this week</div>
            </div>
          )}
          </div>

          {/* LAST WEEK SNAPSHOT PANEL */}
          {(() => {
            const lastRow = chartRows[chartRows.length - 1];
            if (!lastRow) return null;
            const snap = topics
              .map((t, idx) => ({
                topic: t,
                share: Number(lastRow[t] || 0),
                color: COLORS[idx % COLORS.length].main,
              }))
              .sort((a, b) => b.share - a.share);
            const articleCount = Number(lastRow.__week_article_count || 0);
            return (
              <div className="trendsSnapshot">
                <div className="trendsSnapshotLabel">Latest Week</div>
                <div className="trendsSnapshotWeek">{lastRow.week}</div>
                <div className="trendsSnapshotList">
                  {snap.map((s) => (
                    <div key={s.topic} className="trendsSnapshotRow">
                      <span className="trendsSnapshotDot" style={{ background: s.color }} />
                      <span className="trendsSnapshotName">{prettyTopic(s.topic)}</span>
                      <span className="trendsSnapshotVal">{s.share.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <div className="trendsSnapshotMeta">{articleCount.toLocaleString()} articles</div>
              </div>
            );
          })()}
        </div>
      ) : !loading && !error ? (
        <div className="trendsEmpty">
          <svg className="trendsEmptyIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 3v18h18"/>
            <path d="M7 16l4-4 4 4 5-6"/>
          </svg>
          <span>No trend data available yet</span>
        </div>
      ) : null}
    </div>
  );
}
