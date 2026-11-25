import type { Contribution } from "../lib/derive";

/**
 * Signed log-odds contributions for one machine, computed from
 * model_coefficients.json. Bars to the right push the chance up, bars to the
 * left pull it down; nothing is estimated here.
 */
export default function ContributionBars({ items }: { items: Contribution[] }) {
  if (items.length === 0) {
    return <p className="muted small">The saved model is not available, so the drivers cannot be shown.</p>;
  }

  const maxAbs = Math.max(...items.map((item) => Math.abs(item.value)), 0.0001);

  return (
    <div className="why">
      <div className="why__legend">
        <span className="why__key why__key--up">pushes risk up</span>
        <span className="why__key why__key--down">pulls risk down</span>
      </div>
      {items.map((item) => {
        const share = (Math.abs(item.value) / maxAbs) * 50;
        const up = item.value >= 0;
        return (
          <div
            className="why__row"
            key={item.key}
            title={`${item.label}: ${up ? "+" : "−"}${Math.abs(
              item.value,
            ).toFixed(2)} effect on risk`}
          >
            <span className="why__label">{item.label}</span>
            <div
              className="why__track"
              title={`${item.label}: ${up ? "+" : "−"}${Math.abs(item.value).toFixed(2)} effect on risk`}
            >
              <span className="why__axis" aria-hidden="true" />
              <span
                className={`why__bar${up ? " why__bar--up" : " why__bar--down"}`}
                style={
                  up
                    ? { left: "50%", width: `${share}%` }
                    : { right: "50%", width: `${share}%` }
                }
                aria-hidden="true"
              />
            </div>
            <span className={`why__value${up ? " why__value--up" : " why__value--down"}`}>
              {up ? "↑ up" : "↓ down"}
              <span className="sr-only">
                {" "}
                — this reading pushes the chance of breakdown {up ? "up" : "down"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
