import type { ReactNode } from "react";

/** Page title plus the required plain-language "what am I looking at" line. */
export default function PageHeader({
  title,
  what,
  actions,
}: {
  title: string;
  what: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        <h1>{title}</h1>
        <p className="page-head__what">
          <span className="page-head__ask">What am I looking at?</span> {what}
        </p>
      </div>
      <div className="page-head__end">
        {actions && <div className="page-head__actions">{actions}</div>}
        <span className="page-head__geo" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    </header>
  );
}
