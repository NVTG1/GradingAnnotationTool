export default function Sidebar({ view, onNavigate }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-mark">
        <span className="stamp">GS</span>
        <div>
          <div className="wordmark">GradeSense</div>
          <div className="wordmark-sub">grading &amp; annotation</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-tab ${["upload", "grading", "result"].includes(view) ? "active" : ""}`}
          onClick={() => onNavigate("upload")}
        >
          New submission
        </button>
        <button
          className={`sidebar-tab ${["history", "historyDetail"].includes(view) ? "active" : ""}`}
          onClick={() => onNavigate("history")}
        >
          History
        </button>
      </nav>

      <div className="sidebar-foot">
        Every result is stored — nothing here is graded twice by accident.
      </div>
    </aside>
  );
}
