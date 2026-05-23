// src/App.jsx
import PageShell from "./components/PageShell";
import MapView from "./components/MapView";
import KoreaTrends from "./components/KoreaTrends";
import NewsPanel from "./components/NewsPanel";
import ErrorBoundary from "./components/ErrorBoundary";
import { useNewsFeed } from "./hooks/useNewsFeed";
import "./styles/app.css";

export default function App() {
  const { loading, error, active, history, markers, reload, pick, activeChange } = useNewsFeed({
    minAiScore: 0.5,
    limit: 60,
    scoreVersion: "v2",
    rotateMs: 5000,
    refreshMs: 180000,
    maxHistory: 60,
  });

  const handleSelect = (item) => pick(item, { source: "manual" });

  return (
    <PageShell>
      <div className="layout">
        {/* TOP: keep map + news exactly like before */}
        <div className="grid">
        <div className="mapCol">
          <div className="mapCard">
            <ErrorBoundary>
              <MapView
                active={active}
                activeChange={activeChange}
                markers={markers}
                onSelect={handleSelect}
              />
            </ErrorBoundary>
          </div>
        </div>
  
          <NewsPanel
            loading={loading}
            error={error}
            active={active}
            history={history}
            onSelect={handleSelect}
            reload={reload}
          />
        </div>
  
        {/* BOTTOM: trends full width */}
        <div className="trendsRow">
          <ErrorBoundary>
            <KoreaTrends />
          </ErrorBoundary>
        </div>
      </div>
    </PageShell>
  );
  
}
