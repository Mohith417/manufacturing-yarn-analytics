export const PAGES = [
  {
    id: "today",
    label: "Today",
    blurb: "Which machine needs a look first",
  },
  {
    id: "machines",
    label: "Machines",
    blurb: "Search, filter and sort every machine",
  },
  {
    id: "upload",
    label: "Upload and score",
    blurb: "Score your own CSV, in the browser",
  },
  {
    id: "live",
    label: "Live feed",
    blurb: "A simulated reading every few seconds",
  },
  {
    id: "history",
    label: "History",
    blurb: "Scored readings over time",
  },
  {
    id: "quality",
    label: "Quality",
    blurb: "Where defects come from",
  },
  {
    id: "accuracy",
    label: "Accuracy",
    blurb: "How good the prediction is",
  },
  {
    id: "how-it-works",
    label: "How it works",
    blurb: "Data, cluster and scope",
  },
] as const;

export type PageId = (typeof PAGES)[number]["id"];

export const PAGE_IDS = PAGES.map((page) => page.id);
