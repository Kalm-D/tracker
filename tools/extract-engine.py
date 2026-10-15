"""One-off extraction from the audited baseline; no arithmetic/threshold changes."""
from pathlib import Path
import re

p = Path(__file__).resolve().parents[1]
html = (p / 'public/index.html').read_text(encoding='utf-8')
start = html.index('    function buildSeries(rows)')
end = html.index('    function dateToTime(', start)
source = html[start:end]
names = re.findall(r'^    function (\w+)\(', source, re.M)
source = source.replace('function computeMetrics() {\n      const cfg = settings();', 'function computeMetrics(series, cfg, quality) {')
source = source.replace('state.series', 'series').replace('state.quality', 'quality')
source = source.replace('isBenchmarkOrIndexTicker(ticker)', 'isBenchmarkOrIndexTicker(ticker, cfg.benchmarkTicker)')
source = source.replace('function deriveVolumeScore(m)', 'function deriveVolumeScore(m, cfg)')
source = source.replace('settings().', 'cfg.')
source = source.replace('function applyCompositeScores(metrics, regime)', 'function applyCompositeScores(metrics, regime, cfg)')
source = source.replace('deriveVolumeScore(m);', 'deriveVolumeScore(m, cfg);')
prefix = '''/* Extracted from Tracker 007e5c36. Arithmetic and thresholds unchanged.
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
'''
(p / 'public/shared/tracker-engine.js').write_text(prefix + source + '\n  return { VERSION, DEFAULTS, isPlainStockTicker, isBenchmarkOrIndexTicker, ' + ', '.join(names) + ' };\n});\n', encoding='utf-8')
pure = [n for n in names if n not in ['computeMetrics','deriveVolumeScore','applyCompositeScores']]
wrappers = '    const { ' + ', '.join(pure) + ' } = TrackerEngine;\n' + '''    function computeMetrics() { return TrackerEngine.computeMetrics(state.series, settings(), state.quality); }
    function deriveVolumeScore(m) { return TrackerEngine.deriveVolumeScore(m, settings()); }
    function applyCompositeScores(metrics, regime) { return TrackerEngine.applyCompositeScores(metrics, regime, settings()); }

'''
html = html[:start] + wrappers + html[end:]
html = html.replace('  <script>\n    "use strict";\n\n    function readWatchlistStorage', '  <script src="./shared/tracker-engine.js"></script>\n  <script>\n    "use strict";\n\n    function readWatchlistStorage', 1)
(p / 'public/index.html').write_text(html, encoding='utf-8')
print('Extracted', len(names), 'functions')
