import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
// Use PROFILE_URL for a production preview; default profiles the local Vue dev build.
const server = process.env.PROFILE_URL ? null : await createServer({server:{host:'127.0.0.1',port:0}});
await server?.listen();
let browser;
try {
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
 const page=await browser.newPage({viewport:{width:375,height:812},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>{
  window.perf={curveSets:0,curveMs:0,uploads:0,draws:0,rects:0,bboxes:0,mutations:0};
  const curve=Object.getOwnPropertyDescriptor(WaveShaperNode.prototype,'curve');
  Object.defineProperty(WaveShaperNode.prototype,'curve',{...curve,set(value){const t=performance.now();curve.set.call(this,value);window.perf.curveMs+=performance.now()-t;window.perf.curveSets++;}});
  for(const [proto,name,key] of [[WebGLRenderingContext.prototype,'bufferSubData','uploads'],[WebGLRenderingContext.prototype,'drawArrays','draws'],[Element.prototype,'getBoundingClientRect','rects'],[SVGGraphicsElement.prototype,'getBBox','bboxes']]){
   const original=proto[name];proto[name]=function(...args){window.perf[key]+=key==='uploads'?(args[2]?.byteLength??0):1;return original.apply(this,args);};
  }
  const getExtension=WebGLRenderingContext.prototype.getExtension, wrapped=new WeakSet();
  WebGLRenderingContext.prototype.getExtension=function(name){
   const extension=getExtension.call(this,name);
   if(name==='ANGLE_instanced_arrays' && extension && !wrapped.has(extension)){
    wrapped.add(extension);const original=extension.drawArraysInstancedANGLE.bind(extension);
    extension.drawArraysInstancedANGLE=(...args)=>{window.perf.draws++;return original(...args);};
   }
   return extension;
  };
  new MutationObserver(records=>window.perf.mutations+=records.length).observe(document,{subtree:true,childList:true,attributes:true});
 });
 await page.goto(process.env.PROFILE_URL || server.resolvedUrls.local[0]);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setCPUThrottlingRate',{rate:Number(process.env.PROFILE_CPU_RATE || 4)});
 await cdp.send('Performance.enable');
 await page.getByRole('button',{name:'Play',exact:true}).tap();
 await page.evaluate(()=>{
  const seen=new Set();
  for(const el of document.querySelectorAll('*')){
   const instance=el.__vueParentComponent;
   if(!instance || seen.has(instance))continue;seen.add(instance);
   const name=(instance.type.__file||instance.type.name||'other').split('/').at(-1);
   const original=instance.render;instance.render=function(...args){window.perf.renders??={};window.perf.renders[name]=(window.perf.renders[name]||0)+1;return original.apply(this,args);};
  }
 });
 const results={};
 for(const [name,id,max] of [['drive','range-drive',25],['noise','range-noiseLevel',20],['cutoff','range-cutoff',1000],['width','range-unisonWidth',100]]){
  await page.locator('#'+id).scrollIntoViewIfNeeded();
  const before=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  results[name]=await page.evaluate(async({id,max})=>{
   window.perf={curveSets:0,curveMs:0,uploads:0,draws:0,rects:0,bboxes:0,mutations:0};
   const input=document.getElementById(id),frames=[];let previous=performance.now();
   for(let i=0;i<90;i++){
    await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;
    const min=Number(input.min);input.value=String(min+(max-min)*(i%30)/29);input.dispatchEvent(new Event('input',{bubbles:true}));
   }
   await new Promise(requestAnimationFrame);frames.sort((a,b)=>a-b);
   return {...window.perf,p95:frames[Math.floor(frames.length*.95)],domNodes:document.querySelectorAll('*').length};
  },{id,max});
  const after=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  for(const key of ['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'])results[name][key]=Math.round((after[key]-before[key])*1000);
 }
 const out=process.argv[2]||'.tmp/performance.json';await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(results,null,2));console.log(JSON.stringify(results));
}finally{await browser?.close();await server?.close();}
