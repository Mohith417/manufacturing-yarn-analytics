import { PAGES, type PageId } from "../lib/nav";
import Icon, { type IconName } from "./Icon";
import LogoMark from "./Logo";

const ICONS: Record<PageId, IconName> = {
  today: "today",
  machines: "machines",
  quality: "quality",
  accuracy: "accuracy",
  "how-it-works": "help",
};

/** Desktop sidebar and mobile bottom tab bar share one page list. */
export default function Nav({
  page,
  onNavigate,
  onHome,
  onReplayTour,
}: {
  page: PageId;
  onNavigate: (page: PageId) => void;
  onHome: () => void;
  onReplayTour: () => void;
}) {
  return (
    <>
      <aside className="sidebar">
        <button
          type="button"
          className="brand"
          onClick={onHome}
          aria-label="YarnLens, go to the homepage"
        >
          <span className="brand__mark">
            <LogoMark />
          </span>
          <span className="brand__name">
            yarn<span>lens</span>
          </span>
        </button>

        <nav className="side-nav" aria-label="Main">
          <span className="side-nav__label">Plant</span>
          {PAGES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`side-nav__link${page === item.id ? " is-active" : ""}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={ICONS[item.id]} />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="side-foot">
          <button type="button" className="side-foot__link" onClick={onReplayTour}>
            <Icon name="reset" />
            Replay tour
          </button>
          <p className="side-foot__note">
            Synthetic dataset
            <br />
            One-laptop Hadoop + Spark cluster
          </p>
        </div>
      </aside>

      <nav className="tabbar" aria-label="Main">
        {PAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tabbar__link${page === item.id ? " is-active" : ""}`}
            aria-current={page === item.id ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={ICONS[item.id]} size={18} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
