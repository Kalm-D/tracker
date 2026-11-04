(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.TrackerWatchlist=api;})(globalThis,function(){
  'use strict';
  const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
  function parse(value){let raw=value;try{if(typeof value==='string')raw=JSON.parse(value);}catch{return {tickers:[],quarantined:[{rawText:value,reason:'INVALID_JSON'}]};}if(!Array.isArray(raw))return {tickers:[],quarantined:raw==null?[]:[raw]};const tickers=[],quarantined=[];for(const item of raw){if(typeof item==='string'&&/^[A-Z0-9]{3}$/.test(item.trim().toUpperCase()))tickers.push(item.trim().toUpperCase());else quarantined.push(item);}return {tickers:[...new Set(tickers)],quarantined};}
  function validateBackup(p){if(!plain(p))throw Error('Backup phải là object.');for(const k of ['watchlist','watchlistRecovery','rules','strategies','portfolio','dividends','journals','alerts'])if(p[k]!==undefined&&!Array.isArray(p[k]))throw Error('Sai kiểu '+k);for(const k of ['fundamentals','watchMeta','formula'])if(p[k]!==undefined&&!plain(p[k]))throw Error('Sai kiểu '+k);if(p.ruleLogic!==undefined&&!['AND','OR'].includes(p.ruleLogic))throw Error('Sai logic.');if(p.theme!==undefined&&!['dark','soft'].includes(p.theme))throw Error('Sai theme.');return p;}
  function storageKey(base,identity){if(identity==null)return base;if(identity!=='owner'&&!/^[a-f0-9-]{36}$/.test(identity))throw Error('Danh tính local không hợp lệ.');return base+'.account.'+identity;}
  return {parse,validateBackup,storageKey};
});
