interface EmptyStateProps {
  title?: string;
  message?: string;
  /** Why the panel is empty, e.g. the JSON file that could not be read. */
  detail?: string;
}

/**
 * Shown instead of numbers whenever a data file is missing, empty or
 * unreadable. The dashboard never substitutes a placeholder value.
 */
export default function EmptyState({ title, message, detail }: EmptyStateProps) {
  return (
    <div className="empty" role="status">
      <div className="empty__icon" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 7c0-1.1.9-2 2-2h6l3 3h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
          <path d="M8 13h8" />
        </svg>
      </div>
      <div className="empty__title">{title ?? "Awaiting data export"}</div>
      <p className="empty__hint">
        {message ??
          "No rows are available for this panel yet. Run the pipeline export and reload the dashboard."}
      </p>
      {detail && <p className="empty__hint empty__detail">{detail}</p>}
    </div>
  );
}
