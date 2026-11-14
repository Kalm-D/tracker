'use strict';
// Chỉ xử lý byte tệp cá nhân trong worker cùng origin.
importScripts('./fflate.min.js','./personal-data.js');
self.onmessage=event=>{try{self.postMessage({ok:true,result:self.TrackerPersonalData.decode(event.data.bytes,event.data.name,self.fflate)});}catch(error){self.postMessage({ok:false,error:error.message||'Không đọc được tệp.'});}};
