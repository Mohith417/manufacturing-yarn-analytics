import type { ReactNode } from "react";

interface PanelProps {
  title?: string;
  subtitle?: ReactNode;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  flush?: boolean;
}

/** The single card surface used across every page. */
export default function Panel({
  title,
  subtitle,
  hint,
  action,
  children,
  className = "",
  id,
  flush = false,
}: PanelProps) {
  return (
    <section id={id} className={`card ${flush ? "card--flush" : ""} ${className}`.trim()}>
      {(title || hint || action) && (
        <header className="panel-head">
          <div className="panel-head__text">
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {hint && <span className="panel-head__hint">{hint}</span>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
