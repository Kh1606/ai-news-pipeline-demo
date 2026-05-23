import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "20px",
            margin: "10px",
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "12px",
            color: "#f87171",
            fontSize: "14px",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Something went wrong</div>
          <div style={{ color: "rgba(248,113,113,0.7)" }}>
            {String(this.state.error?.message || "Unknown error")}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 10,
              padding: "6px 14px",
              background: "rgba(239,68,68,0.2)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "6px",
              color: "#f87171",
              cursor: "pointer",
              fontSize: "13px",
            }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
