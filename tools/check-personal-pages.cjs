'use strict';
// Gate artifact cá nhân thay kiểm tra snapshot vì artifact không được chứa snapshot.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'work'),{recursive:true});
const parent=fs.mkdtempSync(path.join(root,'work/personal-pages-check-')),target=path.join(parent,'site');
cp.execFileSync(process.execPath,[path.join(root,'tools/prepare-pages.cjs'),target]);
assert.equal(fs.existsSync(path.join(target,'data')),false);assert.equal(fs.existsSync(path.join(target,'backtest')),false);
const html=fs.readFileSync(path.join(target,'index.html'),'utf8');
assert.ok(html.includes('window.TRACKER_PERSONAL_WEB = true'));assert.ok(!html.includes('refreshTrackerSharedMarketData()'));
for(const name of ['personal-data.js','personal-worker.js','personal-ui.js','fflate.min.js'])assert.ok(fs.existsSync(path.join(target,'shared',name)));
console.log(JSON.stringify({policy:'personal-file-only',publicSnapshot:false,backtestAssetsPublic:false,artifact:target}));
