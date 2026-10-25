const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gunzipSync } = require('node:zlib');

const shared = path.join(__dirname, '../public/shared');
const loader = fs.readFileSync(path.join(shared, 'market-data.js'), 'utf8');
const vendor = fs.readFileSync(path.join(shared, 'fflate.min.js'), 'utf8');
const snapshot = fs.readFileSync(path.join(__dirname, '../public/data/market.json.gz'));
const expected = JSON.parse(gunzipSync(snapshot));
const expectedIndex = expected.symbols.find(item => item.ticker === 'VNINDEX').rows.at(-1);

function browser(decompressor) {
  let scriptLoads = 0;
  const root = { Response };
  if (decompressor) root.DecompressionStream = decompressor;
  const document = {
    baseURI: 'https://example.test/tracker/',
    currentScript: { src: 'https://example.test/tracker/shared/market-data.js?v=test' },
    createElement: () => ({}),
    head: { appendChild(script) {
      scriptLoads++;
      assert.equal(script.src, 'https://example.test/tracker/shared/fflate.min.js');
      vm.runInContext(vendor, context);
      script.onload();
    } }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [expected.meta.asOf + 'T18:00:00Z'])); }
  }
  const context = vm.createContext({
    window: root, self: root, document, URL, Uint8Array, AbortController,
    Date: FixedDate, setTimeout, clearTimeout,
    fetch: async url => {
      assert.equal(url, 'https://example.test/tracker/data/market.json.gz');
      return new Response(snapshot);
    }
  });
  vm.runInContext(loader, context);
  return { load: () => root.SharedMarketData.load(), scriptLoads: () => scriptLoads };
}

for (const [name, decoder, expectedScripts] of [
  ['native gzip', DecompressionStream, 0],
  ['Safari without DecompressionStream', null, 1],
  ['browser with a broken native decoder', class { constructor() { throw Error('unsupported'); } }, 1]
]) {
  test(name + ' loads the real published dataset', async () => {
    const app = browser(decoder);
    const result = await app.load();
    const index = result.rows.filter(row => row.ticker === 'VNINDEX');
    assert.equal(result.meta.isDemo, false);
    assert.equal(result.meta.asOf, expected.meta.asOf);
    assert.equal(result.rows.length, expected.meta.rowCount);
    assert.equal(index.at(-1).close, expectedIndex[4]);
    assert.equal(index.at(-1).date, expectedIndex[0]);
    assert.equal(app.scriptLoads(), expectedScripts);
  });
}
