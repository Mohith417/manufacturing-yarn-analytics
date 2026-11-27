import { PAGES, type PageId } from "../lib/nav";
import Icon, { type IconName } from "./Icon";

const ICONS: Record<PageId, IconName> = {
  today: "today",
  machines: "machines",
  upload: "upload",
  live: "live",
  history: "history",
  quality: "quality",
  accuracy: "accuracy",
  "how-it-works": "help",
};

/**
 * One horizontal navigation bar under the dashboard header. It replaces the
 * old sidebar and the mobile tab bar: the same eight pills scroll sideways on a
 * narrow screen instead of turning into a second navigation pattern.
 */
export default function Nav({
  page,
  onNavigate,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <nav className="topnav" aria-label="Main">
      <div className="topnav__inner">
        {PAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`topnav__link${page === item.id ? " is-active" : ""}`}
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={ICONS[item.id]} size={15} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
