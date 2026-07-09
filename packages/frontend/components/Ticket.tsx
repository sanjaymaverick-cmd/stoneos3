import { LucideIcon } from "lucide-react";
import { ReactNode } from "react";

interface TicketProps {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  accent?: "brass" | "moss" | "rust";
  action?: ReactNode;
  children?: ReactNode;
}

// The one place the "work-ticket" visual (notched perforated card) is
// defined for real pages — matches the dpr-entry.jsx artifact's Ticket
// component exactly. Use this instead of hand-rolling ticket-header/notch
// markup so every page stays visually identical without copy-paste drift.
export function Ticket({ icon: Icon, title, subtitle, accent = "brass", action, children }: TicketProps) {
  return (
    <div className="ticket">
      <div className="ticket-notch left" />
      <div className="ticket-notch right" />
      <div className="ticket-header">
        <div className={`ticket-icon ${accent}`}>
          <Icon size={16} strokeWidth={2.25} />
        </div>
        <div style={{ flex: 1 }}>
          <div className="ticket-title">{title}</div>
          {subtitle && <div className="ticket-subtitle">{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
