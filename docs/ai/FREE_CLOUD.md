# Free cloud deployment checkpoint (2026-10-27)

Supabase project: tracker-ai-free, ckuoasopcyansrydvnam, Singapore.
Creation quote: USD 0/month. Schema applied through migration tracker_ai_cloud_state.
Database transaction smoke test: service_role acquire/write/release succeeded, rolled back.
Anonymous and authenticated EXECUTE privileges: false. Security advisor reports only two INFO notices for RLS without policies: intentional server-only tables, direct grants revoked.

Render workspace: My Workspace. No service deployed yet. Latest source is local and public-source upload approval remains outstanding from earlier automatic review.

Cloud state persists history, monitors and quota through a single-writer RPC lease. Failure blocks further work rather than resetting quota. Browser wake checks are GET-only, bounded to two minutes; they never resubmit research automatically.

Before production: securely configure owner password hash and Supabase service-role key in Render, never chat or frontend. Use a new provider project, or migrate the existing usage ledger before reusing keys; an empty cloud database is not a quota migration. Do not run local and cloud backends with shared provider keys.

Free hosting can sleep; monitoring is not continuous. Market snapshots still need updating. Backtest measured peak RSS 467 MiB on Windows, not production Linux acceptance; verify against the 512 MiB service limit before enabling heavy workloads. No paid upgrades authorized.

Pending: full application-to-Supabase REST integration, restart recovery acceptance, deployed mobile login, provider free-tier setup, and Render runtime validation. SQL smoke tests do not establish full cloud acceptance.
