import { useEffect, useState } from "react";
import Icon from "./Icon";
import type { PageId } from "../lib/nav";

type TourPage = "home" | PageId;

/**
 * The tour covers the whole site: the landing page, then one stop on every
 * dashboard page. It moves between routes itself, so replaying it from any
 * page starts at the same place.
 */
const STEPS: {
  page: TourPage;
  target: string | null;
  title: string;
  body: string;
}[] = [
  {
    page: "home",
    target: null,
    title: "This is YarnLens",
    body: "It reads one plant's production, quality and maintenance logs, scores every machine, and points at the ones most likely to stop the line. One minute, start to finish.",
  },
  {
    page: "home",
    target: ".yl-about",
    title: "What it does for you",
    body: "Four ideas behind the screen: one ranked list, the reason in words, the errors it shows and the files it opens. Hover a line for the detail.",
  },
  {
    page: "home",
    target: ".yl-features",
    title: "A brief, not a chart wall",
    body: "Four things the dashboard does that a folder of exports does not. Hover a card to see why it matters on the floor.",
  },
  {
    page: "today",
    target: "#tour-starthere",
    title: "Today: start here",
    body: "The five machines to check first, each with its main reason in plain words. The headline above says how many need attention.",
  },
  {
    page: "machines",
    target: ".filters",
    title: "Machines: the full list",
    body: "Search by ID or line, filter by status, sort by risk. The columns sort too, and a row opens the machine.",
  },
  {
    page: "quality",
    target: ".quality-grid",
    title: "Quality: where defects come from",
    body: "The spread of defect rates and a correlation map of the readings that move together — with the plain reading underneath.",
  },
  {
    page: "accuracy",
    target: ".verdict",
    title: "Accuracy: how often an alarm is right",
    body: "Precision, recall, F1 and ROC-AUC, plus the confusion matrix including the misses. No score hides its mistakes.",
  },
  {
    page: "how-it-works",
    target: ".steps",
    title: "How it works",
    body: "The pipeline, the cluster versions and the limits of the model. That is the whole site.",
  },
];

/** The whole-site tour; opens on a first visit and replays from the menu. */
export default function Tour({
  open,
  page,
  onNavigate,
  onClose,
}: {
  open: boolean;
  page: TourPage;
  onNavigate: (page: TourPage) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  useEffect(() => {
    if (open) {
      setIndex(0);
    }
  }, [open]);

  // Follow the step: if it lives on another page, go there first.
  useEffect(() => {
    if (open && step.page !== page) {
      onNavigate(step.page);
    }
  }, [open, step.page, page, onNavigate]);

  // Highlight the element the step talks about. Elements can appear a frame
  // after the route change, so look a few times before giving up.
  useEffect(() => {
    if (!open || step.page !== page) {
      return;
    }
    if (!step.target) {
      return;
    }
    let element: HTMLElement | null = null;
    let frame = 0;
    let attempts = 0;

    const find = () => {
      const found = document.querySelector<HTMLElement>(step.target ?? "");
      if (!found) {
        if (attempts++ < 24) {
          frame = requestAnimationFrame(find);
        }
        return;
      }
      element = found;
      found.classList.add("tour-glow");
      let reduced = false;
      try {
        reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        reduced = false;
      }
      found.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
    };

    find();
    return () => {
      cancelAnimationFrame(frame);
      element?.classList.remove("tour-glow");
    };
  }, [open, index, page, step.page, step.target]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowRight" && index < STEPS.length - 1) {
        setIndex((current) => current + 1);
      } else if (event.key === "ArrowLeft" && index > 0) {
        setIndex((current) => current - 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, index, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="tour" role="dialog" aria-labelledby="tour-title" aria-modal="false">
      <span className="tour__bar" aria-hidden="true">
        <i style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
      </span>

      <div className="tour__top">
        <span className="tour__count">
          Step {index + 1} of {STEPS.length}
        </span>
        <button
          type="button"
          className="icon-btn icon-btn--sm"
          onClick={onClose}
          aria-label="Close tour"
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className="tour__body" aria-live="polite">
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.body}</p>
      </div>

      <div className="tour__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
          Skip
        </button>
        <div className="tour__next">
          {index > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setIndex((current) => current - 1)}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => (last ? onClose() : setIndex((current) => current + 1))}
          >
            {last ? "Got it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
