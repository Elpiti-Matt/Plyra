// DOM unit tests. jsdom has no layout engine: these are NOT browser or device QA.
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { App, makeRoastery, makeSoftwareDemo, loadGraph, emptyProject, parseCanvas, overviewContent, overviewPositions, clampOverviewNode } from "../.qa/support.mjs";

async function mount(width=1366, stored=null, geometry=false) {
  const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url:"https://atlas.test",pretendToBeVisual:true});
  const w=dom.window;
  // Known rectangles only for testing SVG endpoint rendering; this is not CSS/layout QA.
  if(geometry)w.HTMLElement.prototype.getBoundingClientRect=function(){
    const pane=this.closest?.('.spread-pane');const index=pane?[...document.querySelectorAll('.spread-pane')].indexOf(pane):0;
    const x=Math.max(0,index)*600;return {x,y:0,left:x,top:0,right:x+600,bottom:400,width:600,height:400,toJSON(){return this;}};
  };
  Object.defineProperty(w,"innerWidth",{value:width,configurable:true});
  w.matchMedia=()=>({matches:width<1024,addEventListener(){},removeEventListener(){}});
  const RO=class{observe(){} unobserve(){} disconnect(){}};
  w.ResizeObserver=RO;
  w.HTMLElement.prototype.setPointerCapture=function(){};
  w.confirm=()=>true;
  for(const name of ["window","document","localStorage","HTMLElement","HTMLInputElement","HTMLTextAreaElement","navigator","Event","KeyboardEvent"])
    Object.defineProperty(globalThis,name,{value:w[name]??w,writable:true,configurable:true});
  globalThis.ResizeObserver=RO;
  globalThis.requestAnimationFrame=w.requestAnimationFrame.bind(w);
  globalThis.cancelAnimationFrame=w.cancelAnimationFrame.bind(w);
  globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  if(stored)localStorage.setItem("atlas.graph.v2",JSON.stringify(stored));
  const { createRoot } = await import("react-dom/client");
  const root=createRoot(document.getElementById("root"));
  await act(async()=>root.render(React.createElement(App)));
  const click=async(text)=>{
    const el=[...document.querySelectorAll("button")].find((b)=>!b.closest("[inert]")&&(b.textContent.trim()===text||b.getAttribute("aria-label")===text));
    assert.ok(el,`button: ${text}`);await act(async()=>el.click());
  };
  const flush=()=>act(async()=>new Promise((resolve)=>setTimeout(resolve,350)));
  const field=async(id,value)=>{
    const input=document.getElementById(id);assert.ok(input,`field: ${id}`);
    await act(async()=>{
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),"value").set.call(input,value);
      input.dispatchEvent(new w.Event(input.tagName==="SELECT"?"change":"input",{bubbles:true}));
    });
  };
  const close=async()=>{await act(async()=>root.unmount());w.close();};
  return {w,click,flush,close,field};
}

test("software example loads complete English content and undo restores the previous map",async()=>{
  const previousConfirm=globalThis.confirm;
  globalThis.confirm=()=>true;
  const t=await mount();
  try{
    await t.click("ENG");await t.click("Example: software");await t.flush();
    const saved=JSON.parse(localStorage.getItem("atlas.graph.v2"));
    assert.deepEqual(saved,makeSoftwareDemo("en"));
    assert.ok(document.body.textContent.includes("Software: report export"));
    assert.ok(!saved.nodes.some((n)=>/[А-Яа-яЁё]/.test(n.name+n.body)));
    await t.click("Undo change");await t.flush();
    assert.deepEqual(JSON.parse(localStorage.getItem("atlas.graph.v2")),makeRoastery());
  } finally{await t.close();globalThis.confirm=previousConfirm;}
});

test("mobile keyboard selection opens the node drawer, labels work, link action closes drawer",async()=>{
  const t=await mount(390);
  try{
    const card=document.querySelector('main [data-nid="blend"]');assert.ok(card);
    await act(async()=>card.dispatchEvent(new t.w.KeyboardEvent("keydown",{key:"Enter",bubbles:true})));
    assert.equal(document.querySelector('aside[aria-label="Свойства карты"]').getAttribute("aria-modal"),"true");
    assert.equal(document.querySelector('label[for="node-name"]').textContent,"Имя");
    assert.equal(document.getElementById("node-name").value,"Эспрессо-смесь «Утро»");
    await t.click("+ связать с…");
    assert.ok(document.querySelector('aside[aria-label="Свойства карты"]').hasAttribute("inert"));
  } finally{await t.close();}
});
test("sheet type changes classification without excluding nodes",async()=>{
  const t=await mount();
  try{
    const button=[...document.querySelectorAll('aside[aria-label="Листы"] button')].find((b)=>b.textContent.includes("Обжарка"));
    await act(async()=>button.click());
    const field=document.getElementById("sheet-notation");
    await act(async()=>{field.value="процесс";field.dispatchEvent(new t.w.Event("change",{bubbles:true}));});
    assert.ok(!document.body.textContent.includes("Вне нотации:"));assert.equal(document.querySelectorAll("main [data-nid]:not(.opacity-50)").length>=8,true);
    await t.flush();const g=JSON.parse(localStorage.getItem("atlas.graph.v2"));assert.equal(g.nodes.length,42);assert.equal(g.sheets.find(s=>s.id==="roasting").typeId,"процесс");
  }finally{await t.close();}
});
test("creating a node, undoing and redoing restore data and persisted graph",async()=>{
  const t=await mount();
  try{
    await t.click("+ Узел");
    await t.field("add-node-name","Новая сезонная смесь");
    await t.field("add-node-kind","hypothesis");
    await t.click("Создать узел");
    await t.flush();const g=JSON.parse(localStorage.getItem("atlas.graph.v2"));assert.equal(g.nodes.length,43);assert.equal(g.nodes.at(-1).name,"Новая сезонная смесь");assert.equal(g.nodes.at(-1).kind,"hypothesis");
    await t.click("Отменить изменение");await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,42);
    await t.click("Повторить изменение");await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,43);
  }finally{await t.close();}
});
test("all seven view components mount and the spread handles shared memberships",async()=>{
  const t=await mount();
  try{
    for(const mode of ["Разворот","Стопка","Оглавление","Все на один лист","Подготовить проект с ИИ","Как работать с Plyra","Листы"]) {
      await t.click(mode);assert.ok(!document.body.textContent.includes("Что-то сломалось"),mode);
    }
  }finally{await t.close();}
});
test("an intentionally empty saved graph is not replaced by the demo",async()=>{
  const g=makeRoastery();g.nodes=[];g.edges=[];
  const t=await mount(390,g);
  try{assert.equal(document.querySelectorAll("[data-nid]").length,0);assert.ok(document.body.textContent.includes("0 узлов"));}
  finally{await t.close();}
});
test("malformed saved data has a recovery download rather than silent loss",async()=>{
  const t=await mount(390,{nodes:[],edges:[],sheets:[]});
  try{assert.ok(document.querySelector('[role="alert"]').textContent.includes("Скачать прежнее сохранение"));}
  finally{await t.close();}
});

test("invalid import preserves the current graph; a subsequent valid import is undoable",async()=>{
  const t=await mount(390);
  try{
    const input=document.querySelector('input[type="file"]');
    const send=async(value)=>{
      Object.defineProperty(input,"files",{configurable:true,value:[{name:"map.json",size:100,text:async()=>JSON.stringify(value)}]});
      await act(async()=>input.dispatchEvent(new t.w.Event("change",{bubbles:true})));
    };
    await send({nodes:[{id:"a"}],edges:[{from:"a",to:"missing"}]});
    assert.ok(document.querySelector('[role="alert"]').textContent.includes("Импорт отклонён"));
    assert.ok(document.body.textContent.includes("42 узлов"));
    await send({nodes:[{id:"a",name:"Imported"}],edges:[]});
    assert.ok(document.querySelector('[role="dialog"]').textContent.includes("Открыть проект"));
    assert.equal(document.querySelectorAll("main [data-nid]").length>1,true);
    await t.click("Открыть и заменить");
    await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,1);
    assert.equal(document.querySelectorAll('[role="alert"]').length,0);
    await t.click("Отменить изменение");await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,42);
  }finally{await t.close();}
});

test("all spread compositions keep unique sheets and an occupied picker swaps two slots",async()=>{
  const t=await mount();
  try{
    await t.click("Разворот");
    for(const count of [2,3,4,5,6,2]){
      const button=document.querySelector(`.composition-options button[aria-label^="${count} "]`);
      await act(async()=>button.click());
      const ids=[...document.querySelectorAll('.spread-pane')].map((el)=>el.dataset.sheetId);
      assert.equal(ids.length,count);assert.equal(new Set(ids).size,count);
    }
    const before=[...document.querySelectorAll('.spread-pane')].map((el)=>el.dataset.sheetId);
    const picker=document.querySelector('[aria-label="Лист в окне 1"]');
    await act(async()=>{picker.value=before[1];picker.dispatchEvent(new t.w.Event("change",{bubbles:true}));});
    assert.deepEqual([...document.querySelectorAll('.spread-pane')].map((el)=>el.dataset.sheetId),before.toReversed());
    assert.equal(document.querySelector('.spread-pane.is-active').dataset.sheetId,before[1]);
  }finally{await t.close();}
});

test("mobile six-sheet spread shows one editing canvas and tabs preserve the composition",async()=>{
  const t=await mount(390);
  try{
    await t.click("Разворот");
    await act(async()=>document.querySelector('.composition-options button[aria-label^="6 листов"]').click());
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.equal(document.querySelectorAll('.sheet-tabs .is-visible').length,6);
    const last=document.querySelectorAll('.sheet-tabs .is-visible')[5];
    const name=last.querySelector('span').textContent;
    await act(async()=>last.click());
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.ok(document.querySelector('.spread-pane').getAttribute('aria-label').includes(name));
    assert.equal(document.querySelectorAll('.sheet-tabs .is-visible').length,6);
    await act(async()=>document.querySelector('[aria-label="Следующий лист"]').click());
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.equal(document.querySelectorAll('.sheet-tabs .is-visible').length,6);
  }finally{await t.close();}
});

test("adding from a spread pane targets that sheet and cancelling the menu creates nothing",async()=>{
  const t=await mount();
  try{
    await t.click("Разворот");
    const last=[...document.querySelectorAll('.spread-pane')].at(-1),sid=last.dataset.sheetId;
    await act(async()=>last.querySelector('button[aria-label^="Добавить узел"]').click());
    assert.equal(document.getElementById('add-node-sheet').value,sid);
    assert.equal(document.activeElement.id,'add-node-name');
    await t.field('add-node-name','Связанный контракт');
    await t.click('Создать узел');await t.flush();
    const graph=JSON.parse(localStorage.getItem('atlas.graph.v2'));
    assert.deepEqual(graph.nodes.at(-1).sheets,[sid]);
    await t.click('+ Узел');
    await act(async()=>document.activeElement.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
    assert.equal(document.querySelector('.node-dialog'),null);
    await t.flush();assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).nodes.length,43);
  }finally{await t.close();}
});

test("external reference navigates to the canonical node without creating another node",async()=>{
  const t=await mount();
  try{
    const ref=document.querySelector('button[data-external-node]');assert.ok(ref);
    const id=ref.dataset.externalNode;const expected=makeRoastery().nodes.find((n)=>n.id===id);
    await act(async()=>ref.click());
    const canvas=document.querySelector(`main [id="canvas-${expected.sheets[0]}"]`);assert.ok(canvas);
    assert.ok([...canvas.querySelectorAll('[data-nid]')].some((el)=>el.dataset.nid===id));
    assert.equal(document.getElementById('node-name').value,expected.name);
    assert.ok(document.body.textContent.includes('42 узлов'));
  }finally{await t.close();}
});

test("stack layer checkboxes, labels, connection switches and focused creation work",async()=>{
  const t=await mount();
  try{
    await t.click('Стопка');
    const checks=[...document.querySelectorAll('.stack-layer-checks input')];
    assert.equal(checks.filter((c)=>c.checked).length,7);
    await act(async()=>checks[1].click());
    assert.equal(document.querySelectorAll('.stack-layer-checks input:checked').length,6);
    assert.ok(document.querySelectorAll('[data-stack-edge]').length>0);
    const toggle=(text)=>[...document.querySelectorAll('.stack-settings-row label')].find((l)=>l.textContent===text).querySelector('input');
    await act(async()=>toggle('Связи').click());assert.equal(document.querySelectorAll('[data-stack-edge]').length,0);
    await act(async()=>toggle('Связи').click());assert.ok(document.querySelectorAll('[data-stack-edge]').length>0);
    await act(async()=>toggle('Подписи узлов').click());assert.equal(document.querySelectorAll('#stack-svg text[role="button"]').length,0);
    await act(async()=>toggle('Подписи узлов').click());assert.ok(document.querySelectorAll('#stack-svg text[role="button"]').length>0);
    await act(async()=>document.querySelector('[aria-label="Активировать слой Деньги"]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
    await t.click('+ Узел');assert.equal(document.getElementById('add-node-sheet').selectedOptions[0].textContent,'Деньги');
    await t.click('Отмена');await t.click('Очистить');assert.equal(document.querySelector('#stack-svg'),null);
    await t.click('Все');assert.equal(document.querySelectorAll('.stack-layer-checks input:checked').length,7);
  }finally{await t.close();}
});

test("sheet paging has keyboard access and ignores shortcuts while a node menu is open",async()=>{
  const t=await mount();
  try{
    const before=document.querySelector('.sheet-tabs [aria-current="page"]').textContent;
    await act(async()=>window.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})));
    assert.notEqual(document.querySelector('.sheet-tabs [aria-current="page"]').textContent,before);
    await t.click('+ Узел');const active=document.getElementById('add-node-sheet').value;
    await act(async()=>document.activeElement.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})));
    assert.equal(document.getElementById('add-node-sheet').value,active);
  }finally{await t.close();}
});

test("a six-pane composition survives importing a one-sheet map and undoing the import",async()=>{
  const t=await mount();
  try{
    await t.click('Разворот');
    await act(async()=>document.querySelector('.composition-options button[aria-label^="6 листов"]').click());
    const input=document.querySelector('input[type="file"]');
    Object.defineProperty(input,'files',{value:[{name:'small.json',size:100,text:async()=>JSON.stringify({nodes:[{id:'only',name:'Единственный'}],edges:[]})}]});
    await act(async()=>input.dispatchEvent(new t.w.Event('change',{bubbles:true})));
    await t.click('Открыть и заменить');
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.ok(document.querySelector('.spread-pane [data-nid="only"]'));
    await t.click('Отменить изменение');
    assert.equal(document.querySelectorAll('.spread-pane').length,6);
    assert.equal(new Set([...document.querySelectorAll('.spread-pane')].map((p)=>p.dataset.sheetId)).size,6);
  }finally{await t.close();}
});

test("linking between the first and third pane creates one canonical edge and is undoable",async()=>{
  const t=await mount();
  try{
    await t.click('Разворот');
    await act(async()=>document.querySelector('.composition-options button[aria-label^="3 листа"]').click());
    const panes=[...document.querySelectorAll('.spread-pane')];const graph=makeRoastery();
    const from=graph.nodes.find((n)=>n.sheets.includes(panes[0].dataset.sheetId));
    const to=graph.nodes.find((n)=>n.id!==from.id&&n.sheets.includes(panes[2].dataset.sheetId)&&!graph.edges.some((e)=>e.from===from.id&&e.to===n.id));
    const pick=async(pane,id)=>act(async()=>pane.querySelector(`[data-nid="${id}"]`).dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
    await pick(panes[0],from.id);await t.click('Свойства и связи');await t.click('+ связать с…');await pick(panes[2],to.id);
    await t.flush();const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));
    assert.equal(saved.edges.length,44);assert.equal(saved.nodes.length,42);
    assert.ok(saved.edges.some((e)=>e.from===from.id&&e.to===to.id));
    await t.click('Отменить изменение');await t.flush();assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).edges.length,43);
  }finally{await t.close();}
});

test('RU/ENG changes controls, demo names and contents title without changing saved graph',async()=>{
  const graph=makeRoastery();const t=await mount(1366,graph);
  try{
    await t.click('ENG');assert.equal(document.documentElement.lang,'en');assert.equal(document.querySelector('.atlas-titlebar h1').textContent,'Small Coffee Roastery');
    assert.ok(document.querySelector('[data-nid="blend"]').textContent.includes('Morning espresso blend'));
    assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Spread'));
    await t.click('Contents');assert.equal(document.querySelector('.project-overview h2').textContent,'Small Coffee Roastery');
    await t.click('Prepare a project with AI');assert.ok(document.querySelector('.help-contract pre').textContent.includes('CONTRACT — Plyra v3'));
    await t.click('Using Plyra');assert.ok(document.querySelector('.faq-list').textContent.includes('What does the plus on a node do?'));
    await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),graph);assert.equal(localStorage.getItem('atlas.language'),'en');
    await t.click('RU');assert.equal(document.documentElement.lang,'ru');assert.equal(document.querySelector('.atlas-titlebar h1').textContent,graph.title);
  }finally{await t.close();}
});

test('inline name/body edits are shared across appearances and can be undone',async()=>{
  const t=await mount();
  try{
    await t.click('Разворот');const before=makeRoastery().nodes.find(n=>n.id==='blend').body;
    await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());
    assert.equal(document.querySelectorAll('[data-node-body-editor="blend"]').length,2);
    const editor=document.querySelector('[data-node-body-editor="blend"]');await t.field(editor.id,'Edited from the card\nSecond line');
    assert.ok([...document.querySelectorAll('[data-node-body-editor="blend"]')].every(e=>e.value==='Edited from the card\nSecond line'));
    await t.field(document.querySelector('[data-node-name-editor="blend"]').id,'Общая смесь');await t.flush();
    const g=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(g.nodes.find(n=>n.id==='blend').name,'Общая смесь');assert.equal(g.nodes.length,42);
    await t.click('Отменить изменение');assert.ok([...document.querySelectorAll('[data-node-body-editor="blend"]')].every(e=>e.value===before));
    await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());assert.equal(document.querySelectorAll('[data-node-body-editor="blend"]').length,0);
  }finally{await t.close();}
});

test('desktop spread removes external duplicates dynamically; mobile keeps links to offscreen layers',async()=>{
  const g=makeRoastery();
  for(const width of [1366,390]){
    const t=await mount(width);
    try{
      if(width===390){await t.click("Разворот");}else await t.click('Разворот');
      for(const count of [6,2]){
        await act(async()=>document.querySelector(`.composition-options button[aria-label^="${count} "]`).click());
        const visible=[...document.querySelectorAll('.spread-pane')].map(p=>p.dataset.sheetId);
        const refs=[...document.querySelectorAll('[data-external-node]')];assert.ok(refs.length>0);
        for(const ref of refs){const n=g.nodes.find(n=>n.id===ref.dataset.externalNode);assert.ok(!n.sheets.some(s=>visible.includes(s)));}
      }
    }finally{await t.close();}
  }
});

test('mobile inline editor does not open a blocking drawer; entering text does not page or select',async()=>{
  const t=await mount(390);
  try{
    await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());
    assert.equal(document.querySelector('[aria-modal="true"]'),null);
    const input=document.querySelector('[data-node-body-editor="blend"]');const active=document.querySelector('.sheet-tabs [aria-current="page"]').textContent;
    await act(async()=>input.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true})));
    assert.equal(document.querySelector('.sheet-tabs [aria-current="page"]').textContent,active);assert.equal(document.querySelector('[aria-modal="true"]'),null);
  }finally{await t.close();}
});

test('spread toggles side references without losing graph or visible routes and draws gold identity lines',async()=>{
 const graph=makeRoastery(),t=await mount(1366,graph,true);
 try{
  await t.click('Разворот');const before=document.querySelectorAll('[data-external-node]').length;assert.ok(before>0);
  assert.ok(document.querySelector('[data-spread-edge] path[stroke-dasharray="6 5"]'));
  const identity=document.querySelector('.spread-connections [data-identity-node="blend"]');assert.ok(identity);assert.equal(identity.querySelector('[marker-end]'),null);
  assert.ok(document.querySelector('[data-line-kind="local"] path[stroke="#778293"]:not([stroke-dasharray])'),"all intra-sheet relations use solid lines");
  const edgeCount=document.querySelectorAll('[data-spread-edge]').length;
  await act(async()=>document.querySelector('.external-toggle').click());
  assert.equal(document.querySelectorAll('[data-external-node]').length,0);assert.equal(document.querySelectorAll('[data-spread-edge]').length,edgeCount);
  assert.equal(document.querySelector('.external-toggle').getAttribute('aria-pressed'),'false');
  await act(async()=>document.querySelector('.external-toggle').click());assert.equal(document.querySelectorAll('[data-external-node]').length,before);
  await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),graph);
 }finally{await t.close();}
});

test('line legend opens by hover and tap, explains identity, and closes with Escape',async()=>{
 const t=await mount();
 try{
  await t.click('Разворот');const trigger=document.querySelector('.legend-trigger');
  await act(async()=>trigger.dispatchEvent(new t.w.MouseEvent('mouseover',{bubbles:true})));assert.ok(document.querySelector('.legend-panel'));
  assert.equal(document.querySelectorAll('.legend-row').length,3);assert.ok(document.querySelector('.legend-panel').textContent.includes('не новое ребро'));
  await act(async()=>trigger.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));assert.equal(document.querySelector('.legend-panel'),null);
  await act(async()=>trigger.click());assert.ok(document.querySelector('.legend-panel'));
  await act(async()=>document.querySelector('.legend-close').click());assert.equal(document.querySelector('.legend-panel'),null);
 }finally{await t.close();}
});

test('mobile spread has a local side-reference switch and keeps node membership unchanged',async()=>{
 const t=await mount(390,makeRoastery());
 try{
  await t.click("Разворот");
  assert.ok(document.querySelector('.external-toggle'));await act(async()=>document.querySelector('.external-toggle').click());assert.equal(document.querySelectorAll('[data-external-node]').length,0);
  await act(async()=>document.querySelector('.legend-trigger').click());assert.ok(document.querySelector('.legend-panel'));
  await act(async()=>document.querySelector('.legend-close').click());assert.equal(document.querySelector('.legend-panel'),null);
  await t.flush();assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).nodes.length,42);
 }finally{await t.close();}
});

test('help media starts as a still, plays a local GIF, stops, and changes language',async()=>{
 const t=await mount();
 try{
  await t.click('Подготовить проект с ИИ');const first=document.querySelector('.help-media');assert.ok(first.querySelector('img').src.startsWith('data:image/png;base64,'));
  await act(async()=>first.querySelector('button').click());assert.ok(first.querySelector('img').src.startsWith('data:image/gif;base64,'));
  await act(async()=>first.querySelector('button').click());assert.ok(first.querySelector('img').src.startsWith('data:image/png;base64,'));
  await t.click('ENG');assert.ok(document.querySelector('.help-media-title').textContent.includes('Illustrated walkthrough'));
  const links=[...document.querySelectorAll('.help-media a')];assert.ok(links.every(a=>a.download.endsWith('-en.gif')||a.download.endsWith('-en.png')));
 }finally{await t.close();}
});

test('cross-model walkthrough reveals review targets without mutating the current atlas',async()=>{
 const graph=makeRoastery(),t=await mount(1366,graph);
 try{
  await t.click('Как работать с Plyra');assert.equal(document.querySelectorAll('[data-case-model]').length,6);
  await t.click('2. Меняем контракт');assert.equal(document.querySelectorAll('.changed-model').length,1);assert.equal(document.querySelectorAll('.needs-review').length,0);
  await t.click('3. Видим последствия');assert.equal(document.querySelectorAll('.needs-review').length,6);assert.equal(document.querySelectorAll('.case-review').length,6);
  assert.ok(document.querySelector('.case-explanation').textContent.includes('сохраняют разные ID'));
  await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),graph);
 }finally{await t.close();}
});

async function finishLayout(t){
  for(let i=0;i<100&&document.querySelector('.layout-progress');i++)await act(async()=>new Promise(resolve=>setTimeout(resolve,25)));
  assert.equal(document.querySelector('.layout-progress'),null,'calculation finished');await t.flush();
}
const currentPositions=()=>[...document.querySelectorAll('main [data-canvas-id]')].map(canvas=>[canvas.dataset.canvasId,[...canvas.querySelectorAll('[data-nid]')].map(n=>[n.dataset.nid,n.style.left,n.style.top])]);

test('sheet optimization persists positions and ordinary undo/redo restore the whole action',async()=>{
 const g=makeRoastery(),t=await mount(1366,g);
 try{
  const before=currentPositions();await t.click('Оптимизировать расположение');await finishLayout(t);
  const after=currentPositions(),saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));
  assert.notDeepEqual(after,before);assert.equal(saved.sheets[0].layout,'manual');assert.deepEqual(saved.edges,g.edges);
  assert.ok(document.querySelector('.toast').textContent.includes('Проходов через карточки'));
  await t.click('Отменить изменение');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),JSON.parse(JSON.stringify(loadGraph(g).graph)));assert.deepEqual(currentPositions(),before);
  await t.click('Повторить изменение');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),saved);assert.deepEqual(currentPositions(),after);
 }finally{await t.close();}
});

test('spread optimization survives fit, side-reference toggles and reopening; undo restores all six sheets',async()=>{
 const g=makeRoastery(),t=await mount(1366,g,true);
 try{
  await t.click('Разворот');await act(async()=>document.querySelector('.composition-options button[aria-label^="6 "]').click());
  await t.click('Оптимизировать расположение');await finishLayout(t);
  const saved=JSON.parse(localStorage.getItem('atlas.graph.v2')),after=currentPositions();
  assert.ok(saved.sheets.slice(0,6).every(s=>s.layout==='manual'));assert.deepEqual(saved.edges,g.edges);
  assert.deepEqual(saved.nodes.map(n=>[n.id,n.sheets,n.body]),g.nodes.map(n=>[n.id,n.sheets,n.body]));
  await t.click('вписать');assert.deepEqual(currentPositions(),after);
  await act(async()=>document.querySelector('.external-toggle').click());
  await act(async()=>document.querySelector('.external-toggle').click());assert.deepEqual(currentPositions(),after);
  await t.click('Листы');await t.click('Разворот');assert.deepEqual(currentPositions(),after);
  await t.click('Отменить изменение');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),JSON.parse(JSON.stringify(loadGraph(g).graph)));
  await t.click('Повторить изменение');await t.flush();assert.deepEqual(currentPositions(),after);
 }finally{await t.close();}
});

test('flat optimization saves independent positions, translates its button, and undoes without editing sheets',async()=>{
 const g=makeRoastery(),t=await mount(1366,g);
 try{
  await t.click('Все на один лист');const before=currentPositions();await t.click('ENG');
  assert.ok(document.querySelector('.optimize-button').textContent.includes('Optimize layout'));
  await t.click('Optimize layout');await finishLayout(t);
  const saved=JSON.parse(localStorage.getItem('atlas.graph.v2')),after=currentPositions();
  assert.equal(Object.keys(saved.flatPositions).length,g.nodes.length);assert.deepEqual(saved.nodes,g.nodes);assert.notDeepEqual(after,before);
  await t.click('Sheets');await t.click('All-to-1');assert.deepEqual(currentPositions(),after);
  await t.click('Undo change');await t.flush();assert.deepEqual(currentPositions(),before);assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),JSON.parse(JSON.stringify(loadGraph(g).graph)));
 }finally{await t.close();}
});

test('mobile optimization touches only the visible layer and keeps the toolbar reachable',async()=>{
 const g=makeRoastery(),t=await mount(390,g,true);
 try{
  await t.click('Разворот');await act(async()=>document.querySelector('.composition-options button[aria-label^="6 "]').click());
  const sid=document.querySelector('.spread-pane').dataset.sheetId,button=document.querySelector('.canvas-toolbar .optimize-button');
  assert.equal(button.disabled,false);await act(async()=>button.click());await finishLayout(t);
  const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(document.querySelectorAll('.spread-pane').length,1);
  assert.equal(saved.sheets.find(s=>s.id===sid).layout,'manual');
  for(const n of saved.nodes)for(const sheet of n.sheets)if(sheet!==sid)assert.deepEqual(n.pos[sheet],g.nodes.find(v=>v.id===n.id).pos[sheet]);
  assert.equal(document.querySelector('.canvas-toolbar').closest('[inert]'),null);
  await act(async()=>document.querySelector('button[aria-label="Отменить изменение"]').click());await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),JSON.parse(JSON.stringify(loadGraph(g).graph)));
 }finally{await t.close();}
});

test('cancel calculation makes no graph edit or history entry; empty maps disable the action',async()=>{
 const g=makeRoastery(),t=await mount(390,g);
 try{
  const original=t.w.setTimeout.bind(t.w),pending=[];
  t.w.setTimeout=(fn,ms,...args)=>ms===0?(pending.push(()=>fn(...args)),9999):original(fn,ms,...args);
  await t.click('Оптимизировать расположение');assert.ok(document.querySelector('.layout-progress'));
  await t.click('Прервать расчёт');t.w.setTimeout=original;
  await act(async()=>pending.forEach(fn=>fn()));await finishLayout(t);
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
  assert.equal(document.querySelector('button[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
 const empty={...g,nodes:[],edges:[]},u=await mount(390,empty);
 try{assert.equal(document.querySelector('.optimize-button').disabled,true);}finally{await u.close();}
});

test('new empty project supports sheets, nodes and a cross-sheet relation; undo restores it',async()=>{
 const t=await mount(390);
 try{
  await t.click('Новый пустой проект');await t.field('new-project-title','Мой тестовый проект');await t.field('new-project-sheet','Требования');
  await t.click('Создать пустой проект');await t.flush();
  let g=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(g.nodes.length,0);assert.equal(g.edges.length,0);assert.equal(g.sheets.length,1);assert.ok(document.querySelector('.empty-sheet-guide'));
  await t.click('Отменить изменение');await t.flush();assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).nodes.length,42);await t.click('Повторить изменение');
  await t.click('+ Узел');await t.field('add-node-name','REQ-1');await t.click('Создать узел');
  await t.click('+ Лист');await t.field('new-sheet-name','Реализация');await t.click('Создать лист');
  await t.click('+ Узел');await t.field('add-node-name','Компонент');await t.click('Создать узел');
  await t.click('+ Связь');
  // Select endpoints from the live form rather than depending on autosave timing.
  const from=document.getElementById('new-edge-from'),to=document.getElementById('new-edge-to');
  await t.field('new-edge-from',from.options[0].value);await t.field('new-edge-to',to.options[1].value);
  await t.field('new-edge-kind','depends');await t.field('new-edge-label','реализуется');await t.click('Создать связь');await t.flush();
  g=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(g.nodes.length,2);assert.equal(g.sheets.length,2);assert.equal(g.edges.length,1);assert.equal(g.edges[0].kind,'depends');assert.notEqual(g.nodes[0].sheets[0],g.nodes[1].sheets[0]);
  await t.click('Оглавление');assert.equal(document.querySelectorAll('[data-overview-sheet]').length,2);assert.equal(document.querySelectorAll('[data-overview-connection]').length,1);
 }finally{await t.close();}
});

test('all four type tabs persist a custom node type and expose it in creation and editing',async()=>{
 const t=await mount();
 try{
  await t.click('Типы');assert.equal(document.querySelectorAll('.type-tabs [role="tab"]').length,4);
  await act(async()=>document.getElementById('type-tab-nodes').click());await t.click('+ Создать тип');
  await t.field('type-label','Документ команды');await t.field('type-label-en','Team document');await t.field('type-base','rule');
  const customId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];await t.click('Сохранить типы');
  await t.click('+ Узел');assert.ok([...document.getElementById('add-node-kind').options].some(o=>o.value===customId));
  await t.field('add-node-name','Новый документ');await t.field('add-node-kind',customId);await t.click('Создать узел');await t.flush();
  const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(saved.version,3);assert.equal(saved.nodes.at(-1).kind,customId);assert.equal(saved.types.nodes.at(-1).base,'rule');
  assert.equal(document.getElementById('node-kind').value,customId);assert.ok(!document.body.textContent.includes('Что-то сломалось'));
  await t.click('Типы');await act(async()=>document.getElementById('type-tab-nodes').click());await act(async()=>[...document.querySelectorAll('.type-list button')].find(b=>b.textContent.includes('Документ команды')).click());
  assert.equal([...document.querySelectorAll('button')].find(b=>b.textContent==='Удалить').disabled,true);
  await t.click('Отмена');await t.click('ENG');await t.click('+ Node');assert.ok(document.getElementById('add-node-kind').textContent.includes('Team document'));
 }finally{await t.close();}
});

test('native and draw.io inputs are separate; draw.io preview can be cancelled or appended and undone',async()=>{
 const t=await mount(390);globalThis.DOMParser=t.w.DOMParser;
 try{
  const native=document.querySelector('[data-import="plyra"]'),drawio=document.querySelector('[data-import="drawio"]');
  assert.ok(native.accept.includes('.plyra'));assert.equal(native.multiple,false);assert.ok(drawio.accept.includes('.drawio'));assert.equal(drawio.multiple,true);
  const source='<mxfile><diagram name="Imported sheet"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Imported node" vertex="1" parent="1"><mxGeometry x="20" y="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>';
  Object.defineProperty(drawio,'files',{value:[{name:'example.drawio',size:source.length,text:async()=>source}]});
  const send=()=>act(async()=>drawio.dispatchEvent(new t.w.Event('change',{bubbles:true})));
  await send();assert.ok(document.querySelector('.import-summary'));assert.equal(document.querySelectorAll('[data-nid="blend"]').length>0,true);
  await t.click('Отмена');assert.equal(document.querySelector('[role="dialog"]'),null);
  await send();await t.click('Добавить листы');await t.flush();
  const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(saved.nodes.length,43);assert.equal(saved.sheets.length,8);assert.equal(saved.nodes.at(-1).name,'Imported node');
  await t.click('Отменить изменение');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),makeRoastery());
 }finally{await t.close();}
});

test('visibility dims relation paths and preserves their geometry, counts and saved project',async()=>{
 const g=makeRoastery(),t=await mount(390,g);
 try{
  const kindIds=new Set(g.edges.filter(e=>e.kind==='depends').map(e=>e.id));
  const paths=()=>[...document.querySelectorAll('[data-edge-id]')].map(el=>[el.dataset.edgeId,el.querySelector('path')?.getAttribute('d')]);
  const before=paths();assert.ok(before.length>0);
  await t.click('Показ');assert.ok(document.querySelector('[role="dialog"]').textContent.includes('Золотая линия'));
  const label=[...document.querySelectorAll('.filter-checks label')].find(l=>l.textContent.includes('зависит от'));
  assert.ok(label);await act(async()=>label.querySelector('input').click());await t.click('Готово');
  assert.deepEqual(paths(),before);const dimmed=[...document.querySelectorAll('[data-edge-id]')].filter(el=>kindIds.has(el.dataset.edgeId));
  assert.ok(dimmed.length>0);assert.ok(dimmed.every(el=>Number(el.getAttribute('opacity'))<.3));
  assert.equal(document.querySelector('[data-line-kind="local"] path[stroke-dasharray]'),null);
  await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
  await t.click('Показ');await t.click('Показать все типы');await t.click('Готово');
  assert.ok([...document.querySelectorAll('[data-edge-id]')].filter(el=>kindIds.has(el.dataset.edgeId)).every(el=>Number(el.getAttribute('opacity'))>.3));
 }finally{await t.close();}
});

test('mobile contents defaults to a portrait diagram with sheets, relations and shared identities',async()=>{
 const t=await mount(390,makeSoftwareDemo());
 try{
  await t.click('Оглавление');assert.equal(document.querySelector('.project-overview').dataset.overviewLayout,'mobile');
  const svg=document.querySelector('.sheet-overview-svg');assert.ok(svg);assert.equal(svg.getAttribute('viewBox').split(' ')[2],'390');
  assert.equal(svg.querySelectorAll('[data-overview-sheet]').length,8);assert.ok(svg.querySelectorAll('[data-overview-connection]').length>0);
  assert.ok(svg.querySelector('path[stroke="#b78425"]'));await t.click('Список');assert.equal(document.querySelector('.sheet-overview-svg'),null);
  await t.click('Схема');assert.equal(document.querySelectorAll('[data-overview-sheet]').length,8);
 }finally{await t.close();}
});

test('sheet dictionaries follow tags, types, sheets order and save one type with multiple tags atomically',async()=>{
 const t=await mount();try{
  await t.click('Типы');assert.deepEqual([...document.querySelectorAll('[data-catalog]')].map(el=>el.dataset.catalog),['tags','sheet-types','sheets']);
  await t.click('+ Добавить тег');await t.field('type-label','Команда A');
  const tagId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];
  await act(async()=>document.querySelector('[data-catalog="sheet-types"] header button').click());await t.field('type-label','Архитектура');
  const typeId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];
  await t.field('catalog-sheet-type',typeId);
  await act(async()=>{const checks=document.querySelectorAll('.catalog-sheet-editor .tag-choices input');checks[0].click();});
  await act(async()=>[...document.querySelectorAll('.catalog-sheet-editor .tag-choices label')].find(l=>l.textContent==='Команда A').querySelector('input').click());
  await t.click('+ Добавить лист');await t.field('catalog-sheet-name','Новый слой');
  assert.equal(document.querySelectorAll('[aria-label*="Доступные"]').length,0);
  await t.click('Сохранить типы');await t.flush();const g=JSON.parse(localStorage.getItem('atlas.graph.v2'));
  assert.equal(g.sheets.length,8);assert.equal(g.sheets[0].typeId,typeId);assert.deepEqual(g.sheets[0].tags,['draft',tagId]);assert.equal(g.sheets.at(-1).name,'Новый слой');assert.deepEqual(loadGraph(g).errors,[]);
 }finally{await t.close();}
});

test('attribute creation and inline editing are shared across appearances and undoable',async()=>{
 const t=await mount();try{
  await t.click('Типы');await act(async()=>document.getElementById('type-tab-attributes').click());await t.click('+ Создать атрибут');
  await t.field('type-label','Стоимость');await t.field('attribute-data-type','number');
  const attributeId=document.querySelector('.type-id').textContent.replace('ID: ','').split(' · ')[0];await t.click('Сохранить типы');
  await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());
  const add=document.querySelector('[data-nid="blend"] .attribute-add');await act(async()=>{add.value=attributeId;add.dispatchEvent(new t.w.Event('change',{bubbles:true}));});
  const input=document.querySelector('[data-nid="blend"] .attribute-field input');await t.field(input.id,'123.5');await t.flush();
  let saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(saved.nodes.find(n=>n.id==='blend').attributes[attributeId],123.5);
  await t.click('Разворот');const appearances=document.querySelectorAll('[data-nid="blend"] .attribute-field input');assert.equal(appearances.length,2);assert.ok([...appearances].every(input=>input.value==='123.5'));
  await t.click('Отменить изменение');await t.flush();saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(saved.nodes.find(n=>n.id==='blend').attributes?.[attributeId],undefined);
  await t.click('Повторить изменение');await t.flush();assert.ok([...document.querySelectorAll('[data-nid="blend"] .attribute-field input')].every(input=>input.value==='123.5'));
 }finally{await t.close();}
});

test('stack renders more than ten nodes in both modes and optimizes without changing sheet positions',async()=>{
 const g=emptyProject();g.nodes=Array.from({length:36},(_,i)=>({id:`n${i}`,name:`Node ${i}`,body:'',kind:'entity',sheets:['main'],pos:{main:{x:(i%6)*250,y:Math.floor(i/6)*100}}}));g.edges=g.nodes.slice(1).map((n,i)=>({id:`e${i}`,from:`n${i}`,to:n.id,kind:'depends'}));
 const t=await mount(1366,g);try{
  await t.click('Стопка');await t.click('Построчно');assert.equal(document.querySelectorAll('[data-stack-node]').length,36);assert.equal(document.querySelectorAll('[data-stack-edge]').length,35);
  await t.click('Узлы и связи');assert.equal(document.querySelectorAll('[data-stack-node]').length,36);
  await t.click('Оптимизировать расположение');for(let i=0;i<100&&!document.body.textContent.includes('Вернуть расположение');i++)await act(async()=>new Promise(r=>setTimeout(r,20)));
  assert.ok(document.body.textContent.includes('Вернуть расположение'));await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
  await t.click('Вернуть расположение');await t.click('Построчно');assert.equal(document.querySelectorAll('[data-stack-node]').length,36);
 }finally{await t.close();}
});

test('imported figures render their dimensions and semantic shapes without decorative glyph controls',async()=>{
 const g=parseCanvas(JSON.stringify({nodes:[{id:'text',type:'text',text:'A\nFull text',x:17,y:29,width:330,height:170}],edges:[]})).graph;
 const t=await mount(1366,g);try{
  const card=document.querySelector('[data-nid="text"]');assert.equal(card.style.width,'330px');assert.equal(card.style.left,'17px');assert.equal(card.style.top,'29px');assert.ok(card.querySelector('svg.notation-shape'));assert.ok(card.textContent.includes('Full text'));
  await t.click('Типы');await act(async()=>document.getElementById('type-tab-nodes').click());assert.equal(document.getElementById('type-glyph'),null);
  await act(async()=>document.getElementById('type-tab-edges').click());assert.equal(document.getElementById('type-color'),null);assert.equal(document.getElementById('type-dash'),null);
 }finally{await t.close();}
});

async function pointer(t,el,type,x,y,id=1,pointerType='mouse'){
 assert.ok(el,`pointer target for ${type}`);const event=new t.w.MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});Object.defineProperties(event,{pointerId:{value:id},pointerType:{value:pointerType}});await act(async()=>el.dispatchEvent(event));
}
const overviewFixture=()=>{
 const g=emptyProject('Overview test','First');g.sheets.push({...g.sheets[0],id:'second',name:'Second'});
 g.nodes=[{id:'shared',name:'Shared entity',body:'Shared text',kind:'entity',sheets:['main','second'],pos:{main:{x:80,y:100},second:{x:110,y:80}}},{id:'a',name:'A',body:'',kind:'entity',sheets:['main'],pos:{main:{x:400,y:180}}},{id:'b',name:'B',body:'',kind:'process',sheets:['second'],pos:{second:{x:410,y:180}}}];
 g.edges=[{id:'local',from:'shared',to:'a',kind:'depends'},{id:'cross',from:'a',to:'b',kind:'ref'}];return g;
};

test('canvas has two levels, preserves overview camera through +/− and leaves spread as a separate view',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  assert.ok([...document.querySelectorAll('.workspace-view-tabs button')].some(b=>b.textContent==='Листы'));
  await t.click('Выйти к обзору листов');assert.equal(document.querySelectorAll('[data-board-sheet]').length,2);assert.equal(document.querySelectorAll('[data-overview-open]').length,2);assert.equal(document.querySelector('.spread-pane'),null);
  assert.equal(document.querySelectorAll('[data-overview-node="shared"]').length,2);assert.ok(document.querySelector('[data-overview-identity="shared"]'));assert.ok(document.querySelector('[data-overview-edge="cross"][stroke-dasharray]'));assert.equal(document.querySelector('[data-line-kind="local"] path[stroke-dasharray]'),null);
  await t.click('Увеличить обзор');const before=[document.querySelector('.overview-viewport').dataset.overviewZoom,document.querySelector('.overview-viewport').dataset.overviewX,document.querySelector('.overview-viewport').dataset.overviewY];
  await t.click('Редактировать лист Second');assert.equal(document.querySelector('main [data-canvas-id]').dataset.canvasId,'second');await t.click('Выйти к обзору листов');
  assert.deepEqual([document.querySelector('.overview-viewport').dataset.overviewZoom,document.querySelector('.overview-viewport').dataset.overviewX,document.querySelector('.overview-viewport').dataset.overviewY],before);
  await t.click('Разворот');assert.equal(document.querySelectorAll('.spread-pane').length,2);assert.equal(document.querySelector('.overview-viewport'),null);
  await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
 }finally{await t.close();}
});

test('overview header drag moves a whole sheet in one undo action and keeps all node coordinates',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport'),k=Number(surface.dataset.overviewZoom),start=overviewPositions(g).get('main');
  await pointer(t,document.querySelector('[data-overview-handle="main"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',100+70*k,100+40*k);
  assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g,'drag preview does not save partial positions');
  await pointer(t,surface,'pointerup',100+70*k,100+40*k);await t.flush();const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));
  assert.deepEqual(saved.sheets[0].overviewPos,{x:start.x+70,y:start.y+40});assert.deepEqual(saved.nodes,g.nodes);assert.deepEqual(saved.sheets[1].overviewPos,overviewPositions(g).get('second'));
  await t.click('Отменить изменение');await t.flush();assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).sheets[0].overviewPos,undefined);
  await t.click('Повторить изменение');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')).sheets[0].overviewPos,saved.sheets[0].overviewPos);
 }finally{await t.close();}
});

test('overview node drag respects both zoom levels and edits only the selected appearance',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const node=document.querySelector('[data-board-sheet="main"] [data-overview-node="shared"]'),surface=document.querySelector('.overview-viewport'),scale=Number(surface.dataset.overviewZoom)*Number(node.dataset.contentScale);
  await pointer(t,node,'pointerdown',100,100);await pointer(t,surface,'pointermove',100+30*scale,100+20*scale);await pointer(t,surface,'pointerup',100+30*scale,100+20*scale);await t.flush();const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));
  assert.deepEqual(saved.nodes[0].pos.main,{x:110,y:120});assert.deepEqual(saved.nodes[0].pos.second,g.nodes[0].pos.second);assert.deepEqual(saved.nodes[0].sheets,g.nodes[0].sheets);assert.deepEqual(saved.sheets.map(s=>s.overviewPos),[undefined,undefined]);assert.equal(saved.nodes.length,3);
  await t.click('Редактировать лист First');assert.equal(document.querySelector('[data-nid="shared"]').style.left,'110px');assert.equal(document.querySelector('[data-nid="shared"]').style.top,'120px');
  await t.click('Отменить изменение');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')).nodes[0].pos,g.nodes[0].pos);
 }finally{await t.close();}
});

test('dragging outside a sheet clamps the node and never transfers its memberships',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport'),node=document.querySelector('[data-board-sheet="main"] [data-overview-node="shared"]');
  await pointer(t,node,'pointerdown',100,100);await pointer(t,surface,'pointermove',100000,100000);await pointer(t,surface,'pointerup',100000,100000);await t.flush();const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));
  const content=overviewContent(g.nodes.filter(n=>n.sheets.includes('main')),'main');assert.deepEqual(saved.nodes[0].pos.main,clampOverviewNode({x:1e7,y:1e7},g.nodes[0],'main',content));assert.deepEqual(saved.nodes.map(n=>n.sheets),g.nodes.map(n=>n.sheets));assert.deepEqual(saved.nodes[0].pos.second,g.nodes[0].pos.second);
 }finally{await t.close();}
});

test('overview pointer cancellation and Escape discard sheet/node previews',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport');
  await pointer(t,document.querySelector('[data-overview-handle="main"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',200,140);await pointer(t,surface,'pointercancel',200,140);
  await pointer(t,document.querySelector('[data-board-sheet="main"] [data-overview-node="shared"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',150,150);await act(async()=>surface.dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await pointer(t,surface,'pointerup',150,150);
  await pointer(t,document.querySelector('[data-overview-handle="main"]'),'pointerdown',100,100);await pointer(t,surface,'pointermove',200,140);await pointer(t,surface,'lostpointercapture',200,140);await pointer(t,surface,'pointerup',200,140);
  await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);assert.equal(document.querySelector('[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
});

test('touch pinch cancels a pending node drag and changes only the overview camera',async()=>{
 const g=overviewFixture(),t=await mount(390,g);try{
  await t.click('Выйти к обзору листов');const surface=document.querySelector('.overview-viewport'),k=Number(surface.dataset.overviewZoom);
  await pointer(t,document.querySelector('[data-overview-node="shared"]'),'pointerdown',100,100,1,'touch');await pointer(t,surface,'pointermove',110,100,1,'touch');
  await pointer(t,surface,'pointerdown',210,100,2,'touch');await pointer(t,surface,'pointermove',310,100,2,'touch');assert.ok(Number(surface.dataset.overviewZoom)>k*1.9);
  await pointer(t,surface,'pointerup',310,100,2,'touch');await pointer(t,surface,'pointerup',110,100,1,'touch');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
 }finally{await t.close();}
});

test('overview filters dim paths and keyboard movement preserves unrelated coordinates',async()=>{
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');const paths=()=>[...document.querySelectorAll('[data-overview-edge]')].map(el=>el.getAttribute('d')??el.querySelector('path').getAttribute('d')),before=paths();
  await t.click('Показ');const label=[...document.querySelectorAll('.filter-checks label')].find(l=>l.textContent.includes('зависит от'));await act(async()=>label.querySelector('input').click());await t.click('Готово');assert.deepEqual(paths(),before);assert.equal(document.querySelector('[data-overview-edge="local"]').getAttribute('opacity'),'0.1');
  await act(async()=>document.querySelector('[data-overview-handle="second"]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true})));await t.flush();const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(saved.sheets[1].overviewPos.y,overviewPositions(g).get('second').y+50);assert.deepEqual(saved.nodes,g.nodes);
 }finally{await t.close();}
});

test('empty sheets have a + entry point and All-to-1 is editable with independent positions',async()=>{
 const empty=emptyProject('Empty','Blank'),first=await mount(390,empty);try{
  await first.click('Выйти к обзору листов');assert.equal(document.querySelectorAll('[data-board-sheet]').length,1);await first.click('Редактировать лист Blank');assert.ok(document.querySelector('.empty-sheet-guide'));
 }finally{await first.close();}
 const g=overviewFixture(),t=await mount(1366,g);try{
  await t.click('Все на один лист');assert.equal(document.querySelectorAll('main [data-nid="shared"]').length,1);assert.ok(document.querySelector('.all-to-one-note').textContent.includes('Каждая сущность один раз'));
  await act(async()=>document.querySelector('main [data-nid="shared"] .node-expand-button').click());const input=document.querySelector('[data-node-body-editor="shared"]');await t.field(input.id,'Edited in All-to-1');await t.flush();const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));assert.equal(saved.nodes[0].body,'Edited in All-to-1');assert.deepEqual(saved.nodes[0].pos,g.nodes[0].pos);assert.deepEqual(saved.nodes[0].sheets,g.nodes[0].sheets);
  await t.click('ENG');assert.ok([...document.querySelectorAll('.workspace-view-tabs button')].some(b=>b.textContent==='All-to-1'));assert.ok([...document.querySelectorAll('.workspace-view-tabs button')].some(b=>b.textContent==='Sheets'));
 }finally{await t.close();}
});


test('bulk display controls include custom types, stay independent and only dim existing objects',async()=>{
 const g=overviewFixture();g.types.nodes.push({id:'custom-node',label:'Custom node',base:'entity',color:'#475569'});g.types.edges.push({id:'custom-relation',label:'Custom relation',color:'#475569'});g.nodes[1].kind='custom-node';g.edges[0].kind='custom-relation';
 const t=await mount(1366,g);try{
  const geometry=()=>[...document.querySelectorAll('main [data-edge-id]')].map(el=>[el.dataset.edgeId,el.querySelector('path')?.getAttribute('d')]);
  const before=geometry(),nodeCount=document.querySelectorAll('main [data-nid]').length;
  await t.click('Показ');
  const checks=group=>[...document.querySelectorAll('.filter-checks')[group].querySelectorAll('input')];
  await t.click('Выключить все типы узлов');assert.ok(checks(0).every(el=>!el.checked));assert.ok(checks(1).every(el=>el.checked));
  assert.equal(document.querySelectorAll('main [data-nid].opacity-25').length,nodeCount);
  await t.click('Выключить все типы связей');assert.ok(checks(1).every(el=>!el.checked));
  await t.click('Выбрать все типы узлов');assert.ok(checks(0).every(el=>el.checked));assert.ok(checks(1).every(el=>!el.checked));
  assert.equal(document.querySelectorAll('main [data-nid].opacity-25').length,0);
  assert.ok([...document.querySelectorAll('main [data-edge-id]')].every(el=>Number(el.getAttribute('opacity'))<.3));
  await t.click('Выбрать все типы связей');assert.ok(checks(1).every(el=>el.checked));await t.click('Готово');
  assert.deepEqual(geometry(),before);assert.equal(document.querySelectorAll('main [data-nid]').length,nodeCount);
  await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);assert.equal(document.querySelector('[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
});

test('selected-sheet overview keeps all sheets and local edges, fans shared IDs out and follows header selection',async()=>{
 const g=overviewFixture();g.sheets.push({...g.sheets[0],id:'third',name:'Third'});g.nodes[0].sheets.push('third');g.nodes[0].pos.third={x:80,y:100};g.nodes.push({id:'c',name:'C',body:'',kind:'entity',sheets:['third'],pos:{third:{x:400,y:180}}});g.edges.push({id:'unrelated',from:'b',to:'c',kind:'depends'});
 const t=await mount(1366,g);try{
  await t.click('Выйти к обзору листов');
  const cross=()=>[...document.querySelectorAll('[data-overview-edge][data-line-kind="external"]')];
  const shared=()=>[...document.querySelectorAll('[data-overview-identity="shared"]')];
  const toggle=async text=>{const label=[...document.querySelectorAll('.overview-canvas-actions label')].find(el=>el.textContent===text);assert.ok(label,text);await act(async()=>label.querySelector('input').click());};
  const locals=document.querySelectorAll('[data-overview-edge][data-line-kind="local"]').length;
  assert.ok(cross().some(el=>el.dataset.overviewEdge==='unrelated'));
  await toggle('Только для выделенного листа');
  assert.equal(document.querySelectorAll('[data-board-sheet]').length,3);assert.equal(document.querySelectorAll('[data-overview-edge][data-line-kind="local"]').length,locals);
  assert.ok(cross().every(el=>[el.dataset.fromSheet,el.dataset.toSheet].includes('main')));assert.ok(!cross().some(el=>el.dataset.overviewEdge==='unrelated'));
  assert.deepEqual(shared().map(el=>[el.dataset.fromSheet,el.dataset.toSheet]),[['main','second'],['main','third']]);
  const surface=document.querySelector('.overview-viewport');await pointer(t,document.querySelector('[data-overview-handle="third"]'),'pointerdown',100,100);await pointer(t,surface,'pointerup',100,100);
  assert.ok(document.querySelector('.overview-focus-note').textContent.includes('Third'));assert.ok(cross().every(el=>[el.dataset.fromSheet,el.dataset.toSheet].includes('third')));assert.ok(cross().some(el=>el.dataset.overviewEdge==='unrelated'));
  assert.ok(shared().every(el=>el.dataset.fromSheet==='third'));assert.equal(shared().length,2);
  await toggle('Между листами');assert.equal(cross().length,0);assert.equal(shared().length,2);
  await toggle('Один ID');assert.equal(shared().length,0);assert.equal(document.querySelectorAll('[data-overview-node="shared"]').length,3);
  await toggle('Между листами');await toggle('Один ID');await toggle('Только для выделенного листа');assert.ok(cross().some(el=>el.dataset.overviewEdge==='cross'));assert.equal(document.querySelector('.overview-focus-note'),null);
  await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);assert.equal(document.querySelector('[aria-label="Отменить изменение"]').disabled,true);
 }finally{await t.close();}
});
