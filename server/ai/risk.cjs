'use strict';
const {STRATEGY_VERSION,RULE_VERSION,config}=require('./strategy-config.cjs');
const LIMITATIONS=[
 'Rủi ro theo stop là kịch bản, không phải mức lỗ tối đa được bảo đảm. Gap, giá sàn, thanh khoản và T+ có thể làm lỗ lớn hơn.',
 'Chưa xác minh hạn chế giao dịch, giá tham chiếu, trần/sàn, phiên đặc biệt hoặc trạng thái chứng khoán. Không tạo lệnh giao dịch.',
 'Lô 100 và bước giá áp dụng cho cổ phiếu thường trong mô phỏng; không áp dụng ETF, chứng quyền hoặc lô lẻ.',
 'Phí, thuế và trượt giá là giả định do người dùng xác nhận, không phải báo phí hay tư vấn thuế của công ty chứng khoán.',
 'Công suất thanh khoản dùng TB20 và khối lượng phiên cuối đã có; không bảo đảm khả năng khớp của phiên tương lai.'
];
function tickSize(exchange,price){
 if(!['HOSE','HNX','UPCOM'].includes(exchange)||!Number.isFinite(price)||price<=0||price>1e9)throw new Error('Chưa hỗ trợ sàn hoặc mức giá này.');
 return exchange==='HOSE'?(price<10000?10:price<50000?50:100):100;
}
function roundPrice(price,exchange,direction){
 const tick=tickSize(exchange,price);if(!['up','down'].includes(direction))throw new Error('Hướng làm tròn không hợp lệ.');
 const result=(direction==='up'?Math.ceil(price/tick-1e-10):Math.floor(price/tick+1e-10))*tick;
 if(result<=0)throw new Error('Giá sau làm tròn phải lớn hơn 0.');return result;
}
const asMoney=n=>n/100;
const floorLots=n=>Math.max(0,Math.floor(n/100)*100);
const upwardCents=n=>Math.ceil(n*100-1e-7),downwardCents=n=>Math.floor(n*100+1e-7);
function calculatePosition(input,market){
 const c=config(input),base={version:STRATEGY_VERSION,ruleVersion:RULE_VERSION,simulationOnly:true,executionReady:false,lotSize:100,limitations:LIMITATIONS,inputs:c};
 const blocked=reason=>({...base,status:'blocked',reasons:[reason],quantity:0,rr:null});
 if(!c||!c.capital)return blocked('Chưa nhập vốn danh mục để tính tỷ trọng.');
 if(!c.acknowledge)return blocked('Cần xác nhận giả định phí, thuế, trượt giá, lô và rủi ro thanh toán.');
 if(c.availableCash===undefined&&((c.existingPositionValue??0)>0||(c.existingSectorValue??0)>0))return blocked('Đã khai báo vị thế đang có nhưng chưa nhập tiền khả dụng; không giả định toàn bộ vốn còn trống.');
 if(!market||!['HOSE','HNX','UPCOM'].includes(market.exchange))return blocked('Chưa xác minh sàn của cổ phiếu.');
 if(!Number.isFinite(c.entry)||!Number.isFinite(c.stop))return blocked('Thiếu mức vào và stop có phương pháp xác định.');
 const entry=roundPrice(c.entry,market.exchange,'up'),stop=roundPrice(c.stop,market.exchange,'down');
 if(stop>=entry)return blocked('Stop phải thấp hơn giá vào sau làm tròn.');
 const target=c.target===undefined?null:roundPrice(c.target,market.exchange,'down');
 if(target!==null&&target<=entry)return blocked('Mục tiêu phải cao hơn giá vào sau làm tròn.');
 if(!(market.avgVol20>0)||!(market.lastVolume>0))return blocked('Thiếu thanh khoản TB20 hoặc khối lượng phiên cuối hợp lệ.');
 const fillBuy=roundPrice(entry*(1+c.slippage),market.exchange,'up');
 const fillStop=roundPrice(stop*(1-c.slippage),market.exchange,'down');
 const fillTarget=target===null?null:roundPrice(target*(1-c.slippage),market.exchange,'down');
 const buyCents=upwardCents(fillBuy*(1+c.fee)),stopCents=downwardCents(fillStop*(1-c.fee-c.sellTax)),lossCents=buyCents-stopCents;
 if(lossCents<=0)return blocked('Không tính được mức rủi ro dương.');
 const rewardCents=fillTarget===null?null:downwardCents(fillTarget*(1-c.fee-c.sellTax))-buyCents;
 const capitalCents=downwardCents(c.capital),cashCents=downwardCents(c.availableCash??c.capital);
 const riskBudgetCents=Math.floor(capitalCents*c.riskPct),positionRemaining=Math.max(0,Math.floor(capitalCents*c.maxWeight)-upwardCents(c.existingPositionValue??0));
 const limits={risk:floorLots(riskBudgetCents/lossCents),cash:floorLots(cashCents/buyCents),weight:floorLots(positionRemaining/buyCents),liquidity:floorLots(Math.min(market.avgVol20,market.lastVolume)*c.maxParticipation)};
 if(c.existingSectorValue!==undefined)limits.sector= floorLots(Math.max(0,Math.floor(capitalCents*c.maxSectorWeight)-upwardCents(c.existingSectorValue))/buyCents);
 const quantity=Math.min(...Object.values(limits));
 const stressFill=roundPrice(fillStop*(1-c.stressGapPct),market.exchange,'down'),stressLossCents=buyCents-downwardCents(stressFill*(1-c.fee-c.sellTax));
 return {...base,status:quantity>0?'calculated':'blocked',reasons:quantity>0?[]:['Không đủ một lô sau giới hạn vốn/rủi ro/tỷ trọng/thanh khoản.'],quantity,
  prices:{entry,stop,target,fillBuy,fillStop,fillTarget},perShare:{buyCost:asMoney(buyCents),stopLoss:asMoney(lossCents),targetProfit:rewardCents===null?null:asMoney(rewardCents)},
  limits,bindingLimits:Object.keys(limits).filter(k=>limits[k]===quantity),
  allocated:asMoney(quantity*buyCents),weight:quantity*buyCents/capitalCents,
  plannedLoss:asMoney(quantity*lossCents),plannedLossPct:quantity*lossCents/capitalCents,riskBudget:asMoney(riskBudgetCents),
  targetProfit:rewardCents===null?null:asMoney(quantity*rewardCents),rr:rewardCents===null?null:rewardCents/lossCents,
  stress:{additionalGapBelowStop:c.stressGapPct,fill:stressFill,loss:asMoney(quantity*stressLossCents),lossPct:quantity*stressLossCents/capitalCents},
  missingPortfolioContext:c.existingSectorValue===undefined?'Chưa có danh mục ngành; chưa kiểm tra được tập trung ngành.':null,
  rounding:'Giá mua làm tròn lên; stop/mục tiêu làm tròn xuống. Chi phí mỗi cổ phiếu làm tròn bất lợi đến 0,01 đồng.',
  settlement:'Chưa tính ngày được bán vì chưa có lịch giao dịch và trạng thái phân bổ của broker. Không giả định có thể cắt lỗ trước khi chứng khoán khả dụng.'
 };
}

function aggregate(plans,input){
 const c=config(input),rows=plans.filter(p=>p.risk?.status==='calculated');
 const allocated=rows.reduce((n,p)=>n+p.risk.allocated,0),plannedLoss=rows.reduce((n,p)=>n+p.risk.plannedLoss,0);
 const sectorValues={};for(const p of rows){const sector=p.sector||'Chưa phân ngành';sectorValues[sector]=(sectorValues[sector]||0)+p.risk.allocated;}
 const warnings=[],sectorProjectedValues={...sectorValues};
 const sectors=Object.keys(sectorValues);if(c?.existingSectorValue!==undefined&&sectors.length===1)sectorProjectedValues[sectors[0]]+=c.existingSectorValue;
 if(c?.existingSectorValue!==undefined&&sectors.length>1)warnings.push('Không thể gán một giá trị ngành đang nắm cho nhiều ngành; cần dữ liệu danh mục theo ngành.');
 if(c?.capital&&allocated>(c.availableCash??c.capital)+0.01)warnings.push('Tổng các phương án vượt tiền khả dụng; không thể coi là danh mục mua đồng thời.');
 if(c?.capital&&plannedLoss>c.capital*c.riskPct+0.01)warnings.push('Tổng rủi ro theo stop của các phương án vượt ngân sách rủi ro chung đã chọn.');
 for(const [sector,value] of Object.entries(sectorProjectedValues))if(c?.capital&&value>c.capital*c.maxSectorWeight+0.01)warnings.push('Các phương án tập trung vượt giới hạn ngành: '+sector+'.');
 return {version:STRATEGY_VERSION,simulationOnly:true,executionReady:false,independentAlternatives:true,count:rows.length,allocated,plannedLoss,
  combinedWeight:c?.capital?allocated/c.capital:null,combinedRiskPct:c?.capital?plannedLoss/c.capital:null,sectorValues,sectorProjectedValues,warnings,
  limitation:'Mỗi mã là phương án tính riêng trên cùng vốn giả định; chưa tối ưu phân bổ chung. Tổng rủi ro chưa bao gồm rủi ro của vị thế đang có. Không dùng tổng số lượng này làm danh mục đặt lệnh.'};
}

function position(input,market){
 const c=config(input);
 try{return calculatePosition(c,market);}catch(e){
  if(e.message==='Giá sau làm tròn phải lớn hơn 0.')return {version:STRATEGY_VERSION,ruleVersion:RULE_VERSION,status:'blocked',simulationOnly:true,executionReady:false,quantity:0,rr:null,reasons:[e.message],limitations:LIMITATIONS,inputs:c};
  throw e;
 }
}
module.exports={tickSize,roundPrice,position,aggregate,LIMITATIONS};
