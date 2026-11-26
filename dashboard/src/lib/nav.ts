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
