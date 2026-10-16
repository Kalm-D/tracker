# Tracker

Tracker is published as its own GitHub Pages site:

https://kalm-d.github.io/tracker/

The public page reads the shared market snapshot from `public/data/market.json.gz` and falls back to `public/data/market.json`.

The scheduled workflow runs at 15:00 Vietnam time, Monday through Friday. It refreshes the shared snapshot and deploys the page automatically.

Alpha Stock reads the same shared snapshot from:

https://raw.githubusercontent.com/Kalm-D/tracker/main/public/data/market.json.gz


Standalone deployment is configured through the repository workflow.

## Backtest

Tab Backtest adds historical daily-bar portfolio simulation with shared Tracker formulas, two candidate methods, pivot/next-session entries, cash and settlement accounting, and reproducible exports. Account work is deferred; the Pages tab is public.

Read [Backtest operation, assumptions, data audit and limitations](docs/BACKTEST.md). Run `npm test` on Node >=22. A durable, token-protected single-user runner is provided in `server/`; remote hosting is not preconfigured. No paid service is required for local testing.
