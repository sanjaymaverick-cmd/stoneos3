import { AppNav } from "../../components/AppNav";

export default function Dashboard() {
  // TODO — role-based dashboard shell (owner/manager/accountant views).
  return (
    <div className="app-shell">
      <div className="stamp">
        <div>
          <div className="stamp-title">DASHBOARD</div>
          <div className="stamp-sub">STONEOS · VEDAM GRANITES</div>
        </div>
        <AppNav />
      </div>
      <div className="ticket">
        <div className="ticket-notch left" /><div className="ticket-notch right" />
        <p>Dashboard shell — production, sales, and expenses summaries land here next.</p>
      </div>
    </div>
  );
}
