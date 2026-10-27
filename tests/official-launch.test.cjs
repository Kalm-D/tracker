'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/ai/chat.js'),'utf8');
function render(config){
 const nodes=[];function element(tag){return {tag,style:{},children:[],setAttribute(k,v){this[k]=v;},append(...items){this.children.push(...items);},attachShadow(){return this.shadow=element('shadow');},click(){this.clicked=true;}};}
 const window={TRACKER_AI_CONFIG:config};const document={baseURI:'https://kalm-d.github.io/tracker/',createElement:element,body:{append(...items){nodes.push(...items);}}};
 vm.runInNewContext(source,{window,document,URL,console:{warn(){}},fetch(){throw Error('Pages must not send cross-site API requests');}});return {nodes,window};
}
test('Official Pages opens HTTPS research with first-party login and keeps the Tracker tab',()=>{
 const configContext={window:{},Object};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/ai/config.js'),'utf8'),configContext);
 const {nodes,window}=render(configContext.window.TRACKER_AI_CONFIG);assert.equal(nodes.length,1);const link=nodes[0].shadow.children.find(n=>n.tag==='a');
 assert.equal(link.href,'https://tracker-ai-free.onrender.com/#research');assert.equal(link.target,'_blank');assert.equal(link.rel,'noopener noreferrer');assert.equal(nodes[0].shadow.children[0].href,'https://kalm-d.github.io/tracker/ai/chat.css');window.TrackerAI.open();assert.equal(link.clicked,true);
});
test('Disabled AI or unsafe launch URLs never add a launcher',()=>{for(const config of [{enabled:false},{enabled:true,launchUrl:'javascript:alert(1)'},{enabled:true,launchUrl:'http://unsafe.test/'}])assert.equal(render(config).nodes.length,0);});
