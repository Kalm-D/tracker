/* Xếp hạng theo lịch chung của benchmark và dữ liệu cuối ngày đang mở. */
(() => {
  'use strict';
  const periods = [
    {days: 1, base: 20, label: '1 ngày'},
    {days: 5, base: 20, label: '1 tuần'},
    {days: 21, base: 63, label: '1 tháng'},
    {days: 126, base: 126, label: '6 tháng'}
  ];
  const exchanges = new Set(['HOSE', 'HNX', 'UPCOM']);
  const valid = value => value != null && value !== '' && Number.isFinite(Number(value));
  const usableClose = value => valid(value) && Number(value) > 0;

  function volumes(sessions, dates, expected) {
    let count = 0, sum = 0;
    for (const date of dates) {
      const volume = sessions.get(date)?.volume;
      if (valid(volume) && Number(volume) >= 0) {
        count++;
        sum += Number(volume);
      }
    }
    return {count, sum, mean: count === expected ? sum / expected : null};
  }

  async function calculate(rows, benchmark, pause) {
    const stocks = new Map(), stockDates = new Set(), benchmarkDates = new Set();
    let deadline = performance.now() + 8;
    async function yieldFrame() { await pause(); deadline = performance.now() + 8; }
    for (const row of rows) {
      if (performance.now() >= deadline) await yieldFrame();
      if (!row.date) continue;
      if (row.ticker === benchmark) benchmarkDates.add(row.date);
      if (!exchanges.has(row.exchange) || !/^[A-Z0-9]{3}$/.test(row.ticker)) continue;
      stockDates.add(row.date);
      let stock = stocks.get(row.ticker);
      if (!stock) {
        stock = {ticker: row.ticker, exchange: row.exchange, sector: row.sector, sessions: new Map()};
        stocks.set(row.ticker, stock);
      }
      if (row.sector && row.sector !== 'Chưa phân loại') stock.sector = row.sector;
      stock.sessions.set(row.date, row);
    }
    const calendar = [...(benchmarkDates.size ? benchmarkDates : stockDates)].sort();
    const source = benchmarkDates.size ? benchmark : 'các phiên có dữ liệu cổ phiếu (dự phòng)';
    const last = calendar.at(-1);
    const windows = new Map();
    const tie = (a,b) => a.ticker.localeCompare(b.ticker);
    for (const {days, base} of periods) {
      const end = Math.max(0, calendar.length - days);
      const currentDates = calendar.slice(end);
      const baseDates = calendar.slice(Math.max(0, end - base), end);
      const start = calendar[end - 1];
      const prices = [], totals = [];
      for (const {ticker, exchange, sector, sessions} of stocks.values()) {
        if (performance.now() >= deadline) await yieldFrame();
        const current = volumes(sessions, currentDates, days);
        if (current.count) totals.push({ticker, exchange, sector, current});
        const firstClose = sessions.get(start)?.close, lastClose = sessions.get(last)?.close;
        if (!usableClose(firstClose) || !usableClose(lastClose)) continue;
        const change = 100 * (lastClose / firstClose - 1);
        prices.push({ticker, exchange, firstClose, lastClose, change, current, sessions});
      }
      prices.sort((a,b) => b.change - a.change || tie(a,b));
      const up = prices.filter(x => x.change > 0).slice(0,10);
      const down = prices.filter(x => x.change < 0).sort((a,b) => a.change - b.change || tie(a,b)).slice(0,10);
      for (const item of [...up, ...down]) {
        item.reference = volumes(item.sessions, baseDates, base);
        item.ratio = item.current.mean !== null && item.reference.mean > 0 ? item.current.mean / item.reference.mean : null;
        delete item.sessions;
      }
      totals.sort((a,b) => b.current.sum - a.current.sum || tie(a,b));
      windows.set(days, {days, base, start, last, currentDates, baseDates, source, eligible: prices.length, up, down, totals: totals.slice(0,10)});
    }
    return windows;
  }
  window.TrackerPeriodRankings = {periods, calculate};
})();
