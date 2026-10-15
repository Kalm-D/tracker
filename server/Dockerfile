FROM node:22-alpine
WORKDIR /app
COPY public/shared/tracker-engine.js public/shared/tracker-engine.js
COPY public/backtest/engine.js public/backtest/engine.js
COPY server/ server/
USER node
ENV TRACKER_HOST=0.0.0.0 PORT=8787 TRACKER_JOBS_DIR=/data/jobs TRACKER_DATA_FILE=/data/market.json.gz
EXPOSE 8787
CMD ["node", "server/server.cjs"]
