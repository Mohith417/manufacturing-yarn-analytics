/**
 * Static host wrapper for the built dashboard.
 *
 * The dashboard is a single-page Vite app: the Worker has no routes of its own,
 * it just hands every request to the asset binding. `base: "./"` in
 * vite.config.ts keeps the asset URLs relative, so this works at the site root
 * and under any prefix.
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
