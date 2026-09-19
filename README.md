# Tracker

Tracker is published as its own GitHub Pages site:

https://kalm-d.github.io/tracker/

The public page reads the shared market snapshot from `public/data/market.json.gz` and falls back to `public/data/market.json`.

The scheduled workflow runs at 15:00 Vietnam time, Monday through Friday. It refreshes the shared snapshot and deploys the page automatically.

Alpha Stock reads the same shared snapshot from:

https://raw.githubusercontent.com/Kalm-D/tracker/main/public/data/market.json.gz
