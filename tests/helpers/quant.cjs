'use strict';
// Đọc nguyên Quant Core và hàm Health từ HTML; không sao chép công thức.
const vm=require('node:vm'),crypto=require('node:crypto');
function quant(html){const source=html.match(/<script[^>]+id="trackerQuantSource"[^>]*>([\s\S]*?)<\/script>/)?.[1];if(!source)throw Error('Thiếu Quant Core');const context=vm.createContext({});vm.runInContext(source,context);return context.TrackerQuantCore;}
function health(html,Q,metrics,benchmark,regime){const source=html.slice(html.indexOf('  function marketHealth(){'),html.indexOf('  // Chỉ chạy một lượt;',html.indexOf('  function marketHealth(){')));return vm.runInNewContext(source+';marketHealth()', {Q,currentMetrics:()=>metrics,benchmarkRows:()=>benchmark,state:{marketRegime:regime}});}
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
module.exports={quant,health,hash};
