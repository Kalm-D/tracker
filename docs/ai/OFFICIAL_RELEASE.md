# Official release verification (2026-10-27)

Render Free service tracker-ai-free is live in Singapore and connected to the existing Supabase project. The owner entered secrets directly in Render. No secrets are included in this release.

The official GitHub Pages site keeps its existing tabs and opens research in a separate Render tab. This uses first-party login on phones rather than depending on cross-site cookies. The research URL opens the assistant automatically after the backend update. On the earlier backend, click the research button once.

Merged the current main data snapshot without changing engine, filters or market data. Snapshot date: 2026-10-26; source Vnstock / KBS; 1520 symbols; 353624 source rows; 353309 valid rows; 315 invalid OHLCV rows excluded by the existing engine. The market.json demo seed remains rejected by the audit; the production source is market.json.gz.

Checks: 26 browser scripts parse; local tests include the official launcher, HTTPS authentication/CSRF, durable quota reservation, history restoration and bounded backend wake. Live backend returns 200 health and 401 unauthenticated session. Anonymous access to private state is denied. User accepted the rendered interface before this release.

Limits: Gemini/Groq billing/free-tier setup and successful real model calls have not been accepted. No real provider calls were performed during release checks. No 24/7 monitoring guarantee. Backtest peak memory was measured locally, not as a full Linux stress test. This release does not add a complete multi-user account system. Free service resumes may take time; reopening requires login after a process restart.
