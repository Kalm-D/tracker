/* Extracted from Tracker 007e5c36. Arithmetic and thresholds unchanged.
 * Inputs are explicit so the browser and historical runner use the same code. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TrackerEngine = api;
})(globalThis, function() {
  'use strict';
  const VERSION = 'tracker-007e5c36-pure-v1';
  const DEFAULTS = Object.freeze({minValueB:3,minVol:100000,minPrice:5000,minActiveRatio:1,
    maxHighGap:0.25,minLowLift:0.30,slopeDays:20,leaderRS:70,earlyRS:45,
    benchmarkTicker:'VNINDEX',baseDays:60,nearPivotPct:0.05,breakVolMultiple:1.5});
  function isPlainStockTicker(t) { return /^[A-Z0-9]{3}$/.test(String(t || '').trim().toUpperCase()); }
  function isBenchmarkOrIndexTicker(t, benchmark='VNINDEX') {
    return t === benchmark || ['VNINDEX','VN30','HNXINDEX','UPCOMINDEX'].includes(t) || t.endsWith('INDEX');
  }
    function buildSeries(rows) {
      const map = new Map();
      for (const r of rows) {
        if (!map.has(r.ticker)) map.set(r.ticker, []);
        map.get(r.ticker).push(r);
      }
      for (const arr of map.values()) {
        arr.sort((a,b) => a.date.localeCompare(b.date));
      }
      return map;
    }

    function avg(values) {
      const valid = values.filter(Number.isFinite);
      if (!valid.length) return NaN;
      return valid.reduce((a,b) => a + b, 0) / valid.length;
    }
    function max(values) { return Math.max(...values.filter(Number.isFinite)); }
    function min(values) { return Math.min(...values.filter(Number.isFinite)); }
    function ma(closes, n, endOffset = 0) {
      const end = closes.length - endOffset;
      if (end < n) return NaN;
      return avg(closes.slice(end - n, end));
    }
    function ret(closes, days) {
      if (closes.length <= days) return NaN;
      const now = closes[closes.length - 1], past = closes[closes.length - 1 - days];
      return past ? now / past - 1 : NaN;
    }
    function slopeMA(closes, n, slopeDays) {
      const now = ma(closes, n, 0);
      const prev = ma(closes, n, slopeDays);
      if (!Number.isFinite(now) || !Number.isFinite(prev)) return NaN;
      return now / prev - 1;
    }

    function computeMarketRegime(benchmark, metrics = []) {
      if (!benchmark || benchmark.length < 210) {
        return {
          key: "UNKNOWN",
          label: "Thiếu dữ liệu",
          tone: "warn",
          desc: "Không đủ dữ liệu chỉ số để đánh giá.",
          playbook: "Chưa phân loại môi trường. Ưu tiên kiểm tra CSV có VNINDEX.",
          breadth50: NaN,
          breadth200: NaN,
          riskLevel: "UNKNOWN",
          distributionDays: NaN,
          ret20: NaN,
          ret63: NaN
        };
      }

      const closes = benchmark.map(x => x.close);
      const highs = benchmark.map(x => x.high);
      const lows = benchmark.map(x => x.low);
      const vols = benchmark.map(x => x.volume || 0);
      const close = closes.at(-1);
      const m20 = ma(closes, 20);
      const m50 = ma(closes, 50);
      const m150 = ma(closes, 150);
      const m200 = ma(closes, 200);
      const sl20 = slopeMA(closes, 20, 10);
      const sl50 = slopeMA(closes, 50, 20);
      const sl150 = slopeMA(closes, 150, 30);
      const sl200 = slopeMA(closes, 200, 30);
      const ret10 = ret(closes, 10);
      const ret20 = ret(closes, 20);
      const ret63 = ret(closes, 63);
      const high63 = max(highs.slice(-63));
      const low63 = min(lows.slice(-63));
      const high252 = max(highs.slice(-252));
      const low252 = min(lows.slice(-252));
      const drawdown63 = Number.isFinite(high63) ? close / high63 - 1 : NaN;
      const drawdown252 = Number.isFinite(high252) ? close / high252 - 1 : NaN;
      const bounceFromLow63 = Number.isFinite(low63) ? close / low63 - 1 : NaN;
      const range20 = max(highs.slice(-20)) / Math.max(1, min(lows.slice(-20))) - 1;
      const avgVol50 = avg(vols.slice(-50));
      const distributionDays = benchmark.slice(-25).filter((x, i, arr) => {
        if (i === 0) return false;
        const prev = arr[i - 1];
        return x.close < prev.close && x.volume > avgVol50 * 1.10;
      }).length;
      const followThroughLike = benchmark.slice(-12).some((x, i, arr) => {
        if (i < 4) return false;
        const prev = arr[i - 1];
        const gain = x.close / prev.close - 1;
        return gain >= 0.012 && x.volume >= avgVol50 * 1.05 && close > m20;
      });

      const liquid = metrics.filter(x => x.liquidityPass);
      const baseSet = liquid.length ? liquid : metrics;
      const breadth50 = baseSet.length ? baseSet.filter(x => x.close > x.m50).length / baseSet.length : NaN;
      const breadth150 = baseSet.length ? baseSet.filter(x => x.close > x.m150).length / baseSet.length : NaN;
      const breadth200 = baseSet.length ? baseSet.filter(x => x.close > x.m200).length / baseSet.length : NaN;
      const advancers20 = baseSet.length ? baseSet.filter(x => Number.isFinite(x.stock20) && x.stock20 > 0).length / baseSet.length : NaN;
      const rsSurvivors = metrics.filter(x => x.survivorPass).length;
      const distributionWarnings = metrics.filter(x => x.distributionPass).length;
      const breakdownWarnings = metrics.filter(x => x.avoidPass).length;

      const base = {
        breadth50, breadth150, breadth200, advancers20,
        ret10, ret20, ret63, drawdown63, drawdown252, bounceFromLow63,
        m20, m50, m150, m200, sl20, sl50, sl150, sl200,
        distributionDays, followThroughLike, rsSurvivors, distributionWarnings, breakdownWarnings
      };

      if (ret20 < -0.10 && close < m50 && range20 > 0.10 && breadth50 < 0.30) {
        return {
          ...base,
          key: "CAPITULATION",
          label: "Capitulation / Panic",
          tone: "bad",
          riskLevel: "Rất cao",
          desc: "Chỉ số giảm nhanh, breadth yếu và biến động lớn.",
          playbook: "Không ưu tiên breakout. Chỉ tạo watchlist RS Survivor, Wyckoff Selling Climax/Spring và chờ test lại."
        };
      }

      if (close < m200 && sl200 < 0 && breadth200 < 0.38) {
        return {
          ...base,
          key: "DOWNTREND",
          label: "Downtrend",
          tone: "bad",
          riskLevel: "Cao",
          desc: "Chỉ số dưới MA200, MA200 dốc xuống và đa số cổ phiếu yếu.",
          playbook: "Cash mode là mặc định. Chỉ theo dõi RS Survivor, Stage 1 sớm và cổ phiếu giữ cấu trúc tốt."
        };
      }

      if (close > m200 && close < m50 && distributionDays >= 4 && (ret20 < -0.03 || breadth50 < 0.42)) {
        return {
          ...base,
          key: "DISTRIBUTION",
          label: "Distribution / Late Cycle",
          tone: "warn",
          riskLevel: "Cao vừa",
          desc: "Chỉ số còn trên MA200 nhưng mất MA50 và xuất hiện nhiều phiên phân phối.",
          playbook: "Ưu tiên cảnh báo phân phối, giảm tỷ trọng; chỉ giữ setup A+ có risk nhỏ."
        };
      }

      if (close > m50 && m50 > m150 && m150 > m200 && sl50 > 0 && sl200 > 0 && (Number.isNaN(breadth50) || breadth50 >= 0.48)) {
        return {
          ...base,
          key: "UPTREND",
          label: "Uptrend",
          tone: "good",
          riskLevel: "Thuận lợi",
          desc: "Chỉ số trên MA50/MA150/MA200, MA dài hạn dốc lên và breadth đủ tốt.",
          playbook: "Ưu tiên Leader, SEPA/VCP, Darvas/Donchian breakout. Mua đuổi vẫn bị chặn bởi Risk Engine."
        };
      }

      if ((close > m50 || followThroughLike) && close > m200 * 0.96 && sl20 > 0 && (ret63 > 0 || bounceFromLow63 > 0.10 || breadth50 >= 0.38)) {
        return {
          ...base,
          key: "EARLY_RECOVERY",
          label: "Early Recovery",
          tone: "info",
          riskLevel: "Trung bình",
          desc: "Thị trường hồi phục sớm, chưa đủ xác nhận như uptrend hoàn chỉnh.",
          playbook: "Ưu tiên Stage 1→2, Wyckoff Accumulation, RS cải thiện; dùng vị thế nhỏ và stop rõ."
        };
      }

      return {
        ...base,
        key: "SIDEWAY",
        label: "Sideway / Neutral",
        tone: "warn",
        riskLevel: "Trung bình",
        desc: "Thị trường chưa có xu hướng rõ. Breakout đơn lẻ dễ nhiễu.",
        playbook: "Ưu tiên range breakout có volume, Wyckoff Test, RSI(2) Pullback trong cổ phiếu khỏe."
      };
    }

    function computeMetrics(series, cfg, quality) {
      const benchmark = series.get(cfg.benchmarkTicker);
      const benchCloses = benchmark ? benchmark.map(x => x.close) : [];
      const bench3 = ret(benchCloses, 63);
      const bench6 = ret(benchCloses, 126);
      const list = [];

      for (const [ticker, arr] of series.entries()) {
        if (ticker === cfg.benchmarkTicker || isBenchmarkOrIndexTicker(ticker, cfg.benchmarkTicker)) continue;
        if (!isPlainStockTicker(ticker)) continue;
        if (arr.length < 210) continue;
        const closes = arr.map(x => x.close), highs = arr.map(x => x.high), lows = arr.map(x => x.low), vols = arr.map(x => x.volume);
        const last = arr.at(-1), close = last.close;
        const m50 = ma(closes, 50), m150 = ma(closes, 150), m200 = ma(closes, 200);
        const m200Slope = slopeMA(closes, 200, cfg.slopeDays);
        const high52 = max(highs.slice(-252)), low52 = min(lows.slice(-252));
        const highGapPct = high52 ? close / high52 - 1 : NaN;
        const lowLiftPct = low52 ? close / low52 - 1 : NaN;
        const avgVol20 = avg(vols.slice(-20));
        const avgVol50 = avg(vols.slice(-50));
        const avgValue20B = avg(arr.slice(-20).map(x => x.close * x.volume)) / 1e9;
        const activeRatio60 = arr.slice(-60).filter(x => x.volume > 0).length / Math.min(60, arr.length);
        const stock3 = ret(closes, 63), stock6 = ret(closes, 126);
        const rs3m = Number.isFinite(bench3) ? stock3 - bench3 : stock3;
        const rs6m = Number.isFinite(bench6) ? stock6 - bench6 : stock6;
        const rsRaw = (Number.isFinite(rs3m) ? rs3m * 0.45 : 0) + (Number.isFinite(rs6m) ? rs6m * 0.55 : 0);
        const rsTrend = rs3m - rs6m;
        const liquidityPass = avgValue20B >= cfg.minValueB && avgVol20 >= cfg.minVol && close >= cfg.minPrice && activeRatio60 >= cfg.minActiveRatio;
        const trendInfo = trendStage(close, m50, m150, m200, m200Slope, highGapPct, lowLiftPct, cfg);
        const qualityMeta = quality.byTicker.get(ticker) || { status: "UNKNOWN", label: "—", tone: "warn", staleSessions: NaN };
        const baseInfo = detectBase(arr, cfg, avgVol50, m50);
        let breakoutInfo = detectBreakout(arr, cfg, baseInfo.pivot, avgVol50);
        if (!["D0", "D1"].includes(qualityMeta.status)) {
          breakoutInfo = { status: `Không xác nhận (${qualityMeta.label})`, tone: "warn", pass: false };
        }
        const stop = riskStop(arr, baseInfo.pivot, close);
        const riskPct = Number.isFinite(stop) && stop < close ? (close - stop) / close : NaN;
        list.push({
          ticker,
          exchange: last.exchange,
          sector: last.sector,
          date: last.date,
          dataQuality: qualityMeta.status,
          dataQualityLabel: qualityMeta.label,
          dataQualityTone: qualityMeta.tone,
          staleSessions: qualityMeta.staleSessions,
          close, m50, m150, m200, m200Slope, high52, low52, highGapPct, lowLiftPct,
          avgVol20, avgVol50, avgValue20B, activeRatio60, liquidityPass,
          stock3, stock6, rs3m, rs6m, rsRaw, rsTrend,
          trendStage: trendInfo.stage, trendTone: trendInfo.tone, trendPass: trendInfo.pass,
          baseStatus: baseInfo.status, baseTone: baseInfo.tone, basePass: baseInfo.pass, pivot: baseInfo.pivot,
          breakoutStatus: breakoutInfo.status, breakoutTone: breakoutInfo.tone, breakoutPass: breakoutInfo.pass,
          stop, riskPct, rows: arr
        });
      }

      const sortedByRs = [...list].sort((a,b) => a.rsRaw - b.rsRaw);
      const n = Math.max(1, sortedByRs.length - 1);
      sortedByRs.forEach((m, idx) => { m.rsPercentile = Math.round((idx / n) * 100); });

      for (const m of list) {
        m.leaderPass = m.liquidityPass && m.trendPass && m.rsPercentile >= cfg.leaderRS && m.rs3m > 0 && m.rs6m > 0;
        m.earlyPass = m.liquidityPass && m.trendPass && !m.leaderPass && m.rsPercentile >= cfg.earlyRS && (m.rsTrend > 0 || m.rs3m > 0);
        m.anyRsPass = m.leaderPass || m.earlyPass;
        Object.assign(m, classifyMultiRegimeSetups(m, cfg));
      }

      return list;
    }

    function rsiValue(closes, period = 14) {
      if (!closes || closes.length <= period) return NaN;
      let gains = 0, losses = 0;
      for (let i = closes.length - period; i < closes.length; i++) {
        const diff = closes[i] - closes[i - 1];
        if (diff >= 0) gains += diff;
        else losses -= diff;
      }
      if (losses === 0) return 100;
      const rs = gains / losses;
      return 100 - (100 / (1 + rs));
    }

    function downDayCount(arr, days, avgVol50) {
      const sample = arr.slice(-days);
      let count = 0;
      for (let i = 1; i < sample.length; i++) {
        const x = sample[i], prev = sample[i - 1];
        if (x.close < prev.close && x.volume > avgVol50 * 1.25) count++;
      }
      return count;
    }

    function trueRange(row, prevClose) {
      const a = row.high - row.low;
      const b = Math.abs(row.high - prevClose);
      const c = Math.abs(row.low - prevClose);
      return Math.max(a, b, c);
    }

    function atrValue(arr, period = 14) {
      if (!arr || arr.length <= period + 1) return NaN;
      const sample = arr.slice(-period - 1);
      const trs = [];
      for (let i = 1; i < sample.length; i++) trs.push(trueRange(sample[i], sample[i - 1].close));
      return avg(trs);
    }

    function pctDistance(price, ref) {
      return Number.isFinite(price) && Number.isFinite(ref) && ref !== 0 ? price / ref - 1 : NaN;
    }

    function clamp(n, lo = 0, hi = 100) {
      return Math.max(lo, Math.min(hi, n));
    }

    function scoreFromBool(ok, points) {
      return ok ? points : 0;
    }

    function riskEngine(m, ctx = {}) {
      const arr = m.rows || [];
      const close = m.close;
      const lows = arr.map(x => x.low);
      const atr14 = atrValue(arr, 14);
      const atrPct = Number.isFinite(atr14) && close ? atr14 / close : NaN;
      const pivot = m.pivot;
      const swingLow20 = min(lows.slice(-20));
      const swingLow10 = min(lows.slice(-10));
      const maStop = Number.isFinite(m.m50) ? m.m50 * 0.985 : NaN;
      const pivotStop = Number.isFinite(pivot) ? pivot * 0.93 : NaN;
      const atrStop = Number.isFinite(atr14) ? close - atr14 * 2.2 : NaN;

      const candidates = [m.stop, pivotStop, swingLow20, swingLow10, maStop, atrStop].filter(x => Number.isFinite(x) && x > 0 && x < close);
      const stop = candidates.length ? Math.max(...candidates) : m.stop;
      const riskPct = Number.isFinite(stop) && stop < close ? (close - stop) / close : NaN;
      const target1 = Number.isFinite(pivot) && pivot > 0 ? pivot * 1.15 : close * 1.15;
      const target2 = Number.isFinite(pivot) && pivot > 0 ? pivot * 1.25 : close * 1.25;
      const reward1Pct = target1 / close - 1;
      const reward2Pct = target2 / close - 1;
      const rr1 = Number.isFinite(riskPct) && riskPct > 0 ? reward1Pct / riskPct : NaN;
      const rr2 = Number.isFinite(riskPct) && riskPct > 0 ? reward2Pct / riskPct : NaN;

      let score = 100;
      if (!Number.isFinite(riskPct)) score = 35;
      else if (riskPct <= 0.045) score = 95;
      else if (riskPct <= 0.07) score = 82;
      else if (riskPct <= 0.10) score = 66;
      else if (riskPct <= 0.14) score = 46;
      else score = 24;

      if (Number.isFinite(atrPct)) {
        if (atrPct > 0.075) score -= 22;
        else if (atrPct > 0.055) score -= 12;
        else if (atrPct < 0.018) score += 6;
      }
      if (Number.isFinite(rr1) && rr1 < 1.2) score -= 14;
      if (m.distributionPass) score -= 18;
      if (!m.liquidityPass) score -= 28;
      if (m.dataQuality && !["D0", "D1"].includes(m.dataQuality)) score -= 12;
      score = clamp(Math.round(score));

      let label = "Không đủ dữ liệu";
      let tone = "warn";
      if (score >= 80) { label = "Risk đẹp"; tone = "good"; }
      else if (score >= 60) { label = "Risk chấp nhận"; tone = "info"; }
      else if (score >= 40) { label = "Risk cao"; tone = "warn"; }
      else { label = "Tránh / quá rủi ro"; tone = "bad"; }

      return { atr14, atrPct, stop, riskPct, target1, target2, rr1, rr2, riskScore: score, riskLabel: label, riskTone: tone };
    }

    function marketFitScoreFor(regimeKey, m) {
      const key = regimeKey || "UNKNOWN";
      const setup = {
        breakout: m.breakoutPass || m.leaderPass || m.basePass,
        stage: m.stageTransitionPass,
        wyckoff: m.wyckoffPass,
        mean: m.meanReversionPass,
        donchian: m.donchianPass || m.darvasPass,
        survivor: m.survivorPass,
        dist: m.distributionPass,
        avoid: m.avoidPass
      };

      let score = 40;
      if (key === "UPTREND") {
        score += scoreFromBool(setup.breakout, 28) + scoreFromBool(setup.donchian, 18) + scoreFromBool(m.rsPercentile >= 70, 14);
        if (setup.dist || setup.avoid) score -= 32;
      } else if (key === "EARLY_RECOVERY") {
        score += scoreFromBool(setup.stage, 24) + scoreFromBool(setup.wyckoff, 22) + scoreFromBool(m.rsTrend > 0, 12);
        if (setup.breakout && m.riskScore >= 65) score += 10;
      } else if (key === "SIDEWAY") {
        score += scoreFromBool(setup.wyckoff, 22) + scoreFromBool(setup.mean, 18) + scoreFromBool(setup.donchian, 16);
        if (setup.breakout && !setup.donchian) score += 4;
      } else if (key === "DOWNTREND") {
        score += scoreFromBool(setup.survivor, 28) + scoreFromBool(setup.stage, 12) + scoreFromBool(setup.wyckoff, 10);
        if (setup.breakout) score -= 16;
        if (m.riskPct > 0.08) score -= 16;
      } else if (key === "CAPITULATION") {
        score += scoreFromBool(setup.survivor, 24) + scoreFromBool(setup.wyckoff, 20);
        if (setup.breakout || setup.donchian) score -= 20;
      } else if (key === "DISTRIBUTION") {
        score += scoreFromBool(setup.dist, 26) + scoreFromBool(setup.survivor, 16);
        if (setup.breakout && m.riskScore < 80) score -= 18;
      } else {
        score += scoreFromBool(m.setupScore >= 50, 12);
      }
      return clamp(Math.round(score));
    }

    function deriveTrendScore(m) {
      let score = 0;
      score += scoreFromBool(m.close > m.m50, 18);
      score += scoreFromBool(m.close > m.m150, 14);
      score += scoreFromBool(m.close > m.m200, 18);
      score += scoreFromBool(m.m50 > m.m150, 12);
      score += scoreFromBool(m.m150 > m.m200, 12);
      score += scoreFromBool(m.m200Slope > 0, 12);
      score += scoreFromBool(m.highGapPct >= -0.20, 8);
      score += scoreFromBool(m.lowLiftPct >= 0.25, 6);
      return clamp(score);
    }

    function deriveVolumeScore(m, cfg) {
      const arr = m.rows || [];
      const vols = arr.map(x => x.volume);
      const volToday = vols.at(-1) || 0;
      let score = 0;
      score += scoreFromBool(m.avgValue20B >= cfg.minValueB, 24);
      score += scoreFromBool(m.avgVol20 >= cfg.minVol, 20);
      score += scoreFromBool(m.activeRatio60 >= 1, 18);
      score += scoreFromBool(volToday > m.avgVol50 * 1.10, 14);
      score += scoreFromBool(m.avgVol20 > m.avgVol50 * 0.80, 10);
      score += scoreFromBool(m.close >= cfg.minPrice, 14);
      return clamp(score);
    }

    function deriveRsScore(m) {
      let score = 0;
      score += Math.max(0, Math.min(70, m.rsPercentile * 0.7));
      score += scoreFromBool(m.rs3m > 0, 10);
      score += scoreFromBool(m.rs6m > 0, 10);
      score += scoreFromBool(m.rsTrend > 0, 10);
      return clamp(Math.round(score));
    }

    function applyCompositeScores(metrics, regime, cfg) {
      for (const m of metrics) {
        const risk = riskEngine(m);
        Object.assign(m, risk);
        m.trendScore = deriveTrendScore(m);
        m.rsScore = deriveRsScore(m);
        m.volumeScore = deriveVolumeScore(m, cfg);
        m.marketFitScore = marketFitScoreFor(regime?.key, m);
        m.liquidityScore = m.liquidityPass ? 100 : Math.max(0, Math.round(m.volumeScore * 0.55));
        const raw =
          m.marketFitScore * 0.22 +
          m.setupScore * 0.22 +
          m.trendScore * 0.16 +
          m.rsScore * 0.16 +
          m.riskScore * 0.16 +
          m.volumeScore * 0.08;
        let total = Math.round(raw);
        if (m.distributionPass || m.avoidPass) total = Math.min(total, 48);
        if (!m.liquidityPass) total = Math.min(total, 42);
        if (m.dataQuality && !["D0", "D1"].includes(m.dataQuality)) total = Math.min(total, 60);
        m.trackerScore = clamp(total);
        if (m.avoidPass) m.trackerGrade = "Avoid";
        else if (m.trackerScore >= 82) m.trackerGrade = "A+";
        else if (m.trackerScore >= 70) m.trackerGrade = "A";
        else if (m.trackerScore >= 58) m.trackerGrade = "B";
        else if (m.trackerScore >= 45) m.trackerGrade = "Watch";
        else m.trackerGrade = "Risky";

        if (m.trackerGrade === "A+" && m.riskScore >= 70) m.trackerAction = "Theo dõi sát / chờ điểm vào";
        else if (m.trackerGrade === "A") m.trackerAction = "Watchlist ưu tiên";
        else if (m.distributionPass) m.trackerAction = "Cảnh báo phân phối";
        else if (m.avoidPass || m.riskScore < 40) m.trackerAction = "Tránh";
        else if (m.trackerGrade === "B") m.trackerAction = "Theo dõi";
        else m.trackerAction = "Quan sát / chưa đủ";
      }
    }

    function classifyMultiRegimeSetups(m, cfg) {
      const arr = m.rows || [];
      const closes = arr.map(x => x.close);
      const highs = arr.map(x => x.high);
      const lows = arr.map(x => x.low);
      const vols = arr.map(x => x.volume);
      const close = m.close;
      const m10 = ma(closes, 10);
      const m20 = ma(closes, 20);
      const rsi2 = rsiValue(closes, 2);
      const high20 = max(highs.slice(-20));
      const high55 = max(highs.slice(-55));
      const priorHigh20 = max(highs.slice(-21, -1));
      const priorHigh55 = max(highs.slice(-56, -1));
      const low10 = min(lows.slice(-10));
      const low20 = min(lows.slice(-20));
      const low60 = min(lows.slice(-60));
      const priorLow60 = min(lows.slice(-90, -20));
      const high90 = max(highs.slice(-90));
      const low90 = min(lows.slice(-90));
      const high120 = max(highs.slice(-120));
      const low120 = min(lows.slice(-120));
      const range90 = high90 && low90 ? high90 / low90 - 1 : NaN;
      const range120 = high120 && low120 ? high120 / low120 - 1 : NaN;
      const avgVol20 = m.avgVol20;
      const avgVol50 = m.avgVol50;
      const volToday = vols.at(-1) || 0;
      const stock20 = ret(closes, 20);
      const downVol20 = downDayCount(arr, 20, avgVol50);
      const upVol20 = arr.slice(-20).filter((x, i, a) => i > 0 && x.close > a[i - 1].close && x.volume > avgVol50 * 1.20).length;
      const recentRed = arr.slice(-4).filter((x, i, a) => i > 0 && x.close < a[i - 1].close).length;

      const sepaBreakoutPass = m.liquidityPass && m.trendPass && m.basePass && m.breakoutPass && m.rsPercentile >= cfg.earlyRS;
      const donchianBreakoutPass =
        m.liquidityPass &&
        Number.isFinite(priorHigh20) &&
        close > priorHigh20 &&
        volToday > avgVol20 * 1.15 &&
        close > m.m50 &&
        m.rsPercentile >= 50;

      const darvasBoxPass =
        m.liquidityPass &&
        Number.isFinite(range90) &&
        range90 < 0.32 &&
        Number.isFinite(priorHigh55) &&
        close >= priorHigh55 * 0.99 &&
        volToday > avgVol50 * 1.10 &&
        close > m.m50;

      const stageTransitionPass =
        m.liquidityPass &&
        close > m.m50 &&
        close > m.m200 * 0.96 &&
        Math.abs((m.m50 / m.m200) - 1) < 0.18 &&
        m.m200Slope > -0.03 &&
        m.rsTrend > 0 &&
        m.rsPercentile >= Math.max(35, cfg.earlyRS - 15);

      const springLike =
        Number.isFinite(priorLow60) &&
        low10 < priorLow60 * 0.985 &&
        close > priorLow60 &&
        volToday <= avgVol50 * 1.35;

      const wyckoffAccumulationPass =
        m.liquidityPass &&
        Number.isFinite(range120) &&
        range120 < 0.55 &&
        close > low120 * 1.10 &&
        close < high120 * 0.98 &&
        (springLike || (upVol20 >= downVol20 && m.rsTrend > 0 && close > m50Safe(m)));

      const meanReversionPass =
        m.liquidityPass &&
        close > m.m200 &&
        Number.isFinite(rsi2) &&
        rsi2 <= 12 &&
        recentRed >= 2 &&
        close < m20 &&
        m.rsPercentile >= 45 &&
        m.highGapPct > -0.35;

      const survivorPass =
        m.liquidityPass &&
        close > m.m200 * 0.96 &&
        m.rsPercentile >= 70 &&
        (m.rs3m > 0 || m.rsTrend > 0);

      const distributionPass =
        m.liquidityPass &&
        close < m.m50 &&
        downVol20 >= 4 &&
        m.rsTrend < 0 &&
        (m.highGapPct < -0.12 || close < low20 * 1.03);

      const breakdownPass =
        (close < m.m200 && m.m200Slope < -0.02 && m.rsPercentile < 35) ||
        (Number.isFinite(low60) && close < low60 * 1.015 && downVol20 >= 3) ||
        (!m.liquidityPass && m.avgValue20B < cfg.minValueB * 0.5);

      let score = 0;
      if (sepaBreakoutPass) score += 22;
      if (m.leaderPass) score += 16;
      if (m.earlyPass) score += 10;
      if (m.basePass) score += 12;
      if (m.breakoutPass) score += 12;
      if (stageTransitionPass) score += 15;
      if (wyckoffAccumulationPass) score += 15;
      if (meanReversionPass) score += 11;
      if (donchianBreakoutPass || darvasBoxPass) score += 14;
      if (survivorPass) score += 11;
      if (m.rsPercentile >= 80) score += 8;
      if (Number.isFinite(m.riskPct) && m.riskPct <= 0.08) score += 5;
      if (distributionPass) score -= 20;
      if (breakdownPass) score -= 28;
      score = clamp(Math.round(score));

      const setups = [];
      if (sepaBreakoutPass) setups.push("SEPA/VCP Breakout");
      if (stageTransitionPass) setups.push("Stage 1→2");
      if (wyckoffAccumulationPass) setups.push(springLike ? "Wyckoff Spring/Test" : "Wyckoff Accum.");
      if (meanReversionPass) setups.push("RSI(2) Pullback");
      if (donchianBreakoutPass) setups.push("Donchian 20D");
      if (darvasBoxPass) setups.push("Darvas Box");
      if (survivorPass) setups.push("RS Survivor");
      if (distributionPass) setups.push("Distribution Warning");
      if (breakdownPass) setups.push("Breakdown / Avoid");

      const primarySetup = setups.find(s => !s.includes("Warning") && !s.includes("Avoid")) || setups[0] || (m.leaderPass ? "Leader Trend" : m.earlyPass ? "Early Watch" : "Chưa có setup rõ");
      const setupTone = breakdownPass || distributionPass ? "bad" : score >= 65 ? "good" : score >= 45 ? "info" : score >= 25 ? "warn" : "warn";

      return {
        setupScore: score,
        setupSummary: primarySetup,
        setupTone,
        setupList: setups.join(", "),
        sepaBreakoutPass,
        donchianPass: donchianBreakoutPass,
        darvasPass: darvasBoxPass,
        stageTransitionPass,
        wyckoffPass: wyckoffAccumulationPass,
        meanReversionPass,
        survivorPass,
        distributionPass,
        avoidPass: breakdownPass,
        rsi2,
        downVol20,
        upVol20,
        stock20,
        range90,
        range120,
        low20,
        low60,
        high20,
        high55
      };
    }

    function m50Safe(m) {
      return Number.isFinite(m.m50) ? m.m50 : m.close;
    }

    function trendStage(close, m50, m150, m200, m200Slope, highGapPct, lowLiftPct, cfg) {
      const strong = close > m50 && m50 > m150 && m150 > m200 && m200Slope > 0 && highGapPct >= -cfg.maxHighGap && lowLiftPct >= cfg.minLowLift;
      if (strong) return { stage: "Stage 2 mạnh", tone: "good", pass: true };
      const early = close > m50 && close > m200 && m50 > m150 && m200Slope > -0.015;
      if (early) return { stage: "Stage 2 sớm", tone: "info", pass: true };
      const acc = close > m150 && Math.abs((m50 / m150) - 1) < 0.08;
      if (acc) return { stage: "Tích lũy", tone: "warn", pass: false };
      const down = close < m200 && m50 < m200;
      if (down) return { stage: "Downtrend", tone: "bad", pass: false };
      return { stage: "Trung tính", tone: "warn", pass: false };
    }

    function detectBase(arr, cfg, avgVol50, m50) {
      const n = Math.min(cfg.baseDays, arr.length);
      const base = arr.slice(-n);
      const highs = base.map(x => x.high), lows = base.map(x => x.low), closes = base.map(x => x.close), vols = base.map(x => x.volume);
      const pivot = max(highs.slice(0, Math.max(1, highs.length - 3)));
      const range = max(highs) / min(lows) - 1;
      const half = Math.floor(base.length / 2);
      const r1 = max(highs.slice(0, half)) / min(lows.slice(0, half)) - 1;
      const r2 = max(highs.slice(half)) / min(lows.slice(half)) - 1;
      const v1 = avg(vols.slice(0, half)), v2 = avg(vols.slice(half));
      const close = closes.at(-1);
      const contraction = Number.isFinite(r1) && Number.isFinite(r2) && r2 < r1 * 0.78;
      const volContraction = Number.isFinite(v1) && Number.isFinite(v2) && v2 < v1 * 0.88;
      const nearMA50 = Number.isFinite(m50) ? close > m50 * 0.94 : true;
      const tight20 = (() => {
        const b = arr.slice(-20);
        if (b.length < 20) return false;
        return max(b.map(x => x.high)) / min(b.map(x => x.low)) - 1 < 0.12;
      })();
      const selloff = base.some((x, i) => i > 0 && x.close / base[i-1].close - 1 < -0.065 && x.volume > avgVol50 * 1.8);
      if (selloff) return { status: "Nền lỗi", tone: "bad", pass: false, pivot };
      if (contraction && volContraction && nearMA50 && range < 0.35) return { status: "Có dấu hiệu VCP", tone: "purple", pass: true, pivot };
      if ((tight20 || range < 0.18) && volContraction) return { status: "Nền chặt", tone: "good", pass: true, pivot };
      if (range < 0.30 && nearMA50) return { status: "Đang tạo nền", tone: "info", pass: true, pivot };
      return { status: "Không có nền", tone: "warn", pass: false, pivot };
    }

    function detectBreakout(arr, cfg, pivot, avgVol50) {
      const last = arr.at(-1);
      if (!Number.isFinite(pivot) || !last) return { status: "Chưa có pivot", tone: "warn", pass: false };
      const dist = last.close / pivot - 1;
      if (last.close > pivot && last.volume >= avgVol50 * cfg.breakVolMultiple) return { status: "Breakout có volume", tone: "good", pass: true };
      if (last.close > pivot) return { status: "Vượt pivot volume yếu", tone: "warn", pass: true };
      if (dist >= -cfg.nearPivotPct) return { status: "Gần pivot", tone: "info", pass: true };
      return { status: "Chưa gần điểm mua", tone: "warn", pass: false };
    }

    function riskStop(arr, pivot, close) {
      const low20 = min(arr.slice(-20).map(x => x.low));
      const byPivot = pivot * 0.93;
      const candidate = Math.max(low20 * 0.99, byPivot);
      if (!Number.isFinite(candidate) || candidate >= close) return pivot * 0.92;
      return candidate;
    }


  return { VERSION, DEFAULTS, isPlainStockTicker, isBenchmarkOrIndexTicker, buildSeries, avg, max, min, ma, ret, slopeMA, computeMarketRegime, computeMetrics, rsiValue, downDayCount, trueRange, atrValue, pctDistance, clamp, scoreFromBool, riskEngine, marketFitScoreFor, deriveTrendScore, deriveVolumeScore, deriveRsScore, applyCompositeScores, classifyMultiRegimeSetups, m50Safe, trendStage, detectBase, detectBreakout, riskStop };
});
