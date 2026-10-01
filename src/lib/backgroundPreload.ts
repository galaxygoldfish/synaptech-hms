// Tracks chunk fetches the app starts on its own (see PreloadRoutes in
// router.tsx), so the reload-on-chunk-failure handler in main.tsx can tell
// them apart from a page the user actually opened. A background fetch that
// fails — a network blip, or a deploy in between — must not reload the page
// under someone mid-task; the page it was for simply loads on visit instead.

let pending = 0

export function isBackgroundPreloading(): boolean {
  return pending > 0
}

export function preloadInBackground(loads: (() => Promise<unknown>)[]): void {
  for (const load of loads) {
    pending += 1
    load()
      .catch(() => {
        // Ignored — visiting the page retries it.
      })
      .finally(() => {
        pending -= 1
      })
  }
}
