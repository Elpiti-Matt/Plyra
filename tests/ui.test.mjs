// DOM unit tests. jsdom has no layout engine: these are NOT browser or device QA.
import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { App, makeRoastery } from "../.qa/support.mjs";

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
    const el=[...document.querySelectorAll("button")].find((b)=>b.textContent.trim()===text);
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
test("notation control reports exclusions without altering nodes",async()=>{
  const t=await mount();
  try{
    const button=[...document.querySelectorAll('aside[aria-label="Листы"] button')].find((b)=>b.textContent.includes("Обжарка"));
    await act(async()=>button.click());
    const field=document.getElementById("sheet-notation");
    await act(async()=>{field.value="процесс";field.dispatchEvent(new t.w.Event("change",{bubbles:true}));});
    assert.ok(document.body.textContent.includes("Вне нотации: 3 из 8 узлов"));
    await t.flush();const g=JSON.parse(localStorage.getItem("atlas.graph.v2"));assert.equal(g.nodes.length,42);
  }finally{await t.close();}
});
test("creating a node, undoing and redoing restore data and persisted graph",async()=>{
  const t=await mount();
  try{
    await t.click("+ узел");
    await t.field("add-node-name","Новая сезонная смесь");
    await t.field("add-node-kind","hypothesis");
    await t.click("Создать узел");
    await t.flush();const g=JSON.parse(localStorage.getItem("atlas.graph.v2"));assert.equal(g.nodes.length,43);assert.equal(g.nodes.at(-1).name,"Новая сезонная смесь");assert.equal(g.nodes.at(-1).kind,"hypothesis");
    await t.click("Отменить");await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,42);
    await t.click("Вернуть");await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,43);
  }finally{await t.close();}
});
test("all seven view components mount and the spread handles shared memberships",async()=>{
  const t=await mount();
  try{
    for(const mode of ["Разворот","Стопка","Оглавление","Одна плоскость","Для ИИ","FAQ / ЧАВО","Лист"]) {
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
    await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,1);
    assert.equal(document.querySelectorAll('[role="alert"]').length,0);
    await t.click("Отменить");await t.flush();assert.equal(JSON.parse(localStorage.getItem("atlas.graph.v2")).nodes.length,42);
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
    const mode=document.querySelector('select[aria-label="Режим"]');
    await act(async()=>{mode.value="spread";mode.dispatchEvent(new t.w.Event("change",{bubbles:true}));});
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
    await t.click('＋ Добавить');
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
    assert.equal(checks.filter((c)=>c.checked).length,2);
    await act(async()=>checks[2].click());
    assert.equal(document.querySelectorAll('.stack-layer-checks input:checked').length,3);
    assert.ok(document.querySelectorAll('[data-stack-edge]').length>0);
    const toggle=(text)=>[...document.querySelectorAll('.stack-settings-row label')].find((l)=>l.textContent===text).querySelector('input');
    await act(async()=>toggle('Связи').click());assert.equal(document.querySelectorAll('[data-stack-edge]').length,0);
    await act(async()=>toggle('Связи').click());assert.ok(document.querySelectorAll('[data-stack-edge]').length>0);
    await act(async()=>toggle('Подписи узлов').click());assert.equal(document.querySelectorAll('#stack-svg text[role="button"]').length,0);
    await act(async()=>toggle('Подписи узлов').click());assert.ok(document.querySelectorAll('#stack-svg text[role="button"]').length>0);
    await act(async()=>document.querySelector('[aria-label="Активировать слой Деньги"]').dispatchEvent(new t.w.KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
    await t.click('＋ Добавить');assert.equal(document.getElementById('add-node-sheet').selectedOptions[0].textContent,'Деньги');
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
    await t.click('＋ Добавить');const active=document.getElementById('add-node-sheet').value;
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
    assert.equal(document.querySelectorAll('.spread-pane').length,1);
    assert.ok(document.querySelector('.spread-pane [data-nid="only"]'));
    await t.click('Отменить');
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
    await pick(panes[0],from.id);await t.click('связать');await pick(panes[2],to.id);
    await t.flush();const saved=JSON.parse(localStorage.getItem('atlas.graph.v2'));
    assert.equal(saved.edges.length,44);assert.equal(saved.nodes.length,42);
    assert.ok(saved.edges.some((e)=>e.from===from.id&&e.to===to.id));
    await t.click('Отменить');await t.flush();assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).edges.length,43);
  }finally{await t.close();}
});

test('RU/ENG changes controls, demo names and contents title without changing saved graph',async()=>{
  const graph=makeRoastery();const t=await mount(1366,graph);
  try{
    await t.click('ENG');assert.equal(document.documentElement.lang,'en');assert.equal(document.querySelector('.atlas-titlebar h1').textContent,'Small Coffee Roastery');
    assert.ok(document.querySelector('[data-nid="blend"]').textContent.includes('Morning espresso blend'));
    assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent==='Spread'));
    await t.click('Contents');assert.equal(document.querySelector('.overview-heart h2').textContent,'Small Coffee Roastery');
    await t.click('AI format');assert.ok(document.querySelector('.help-contract pre').textContent.includes('CONTRACT — Plyra v2'));
    await t.click('FAQ');assert.ok(document.querySelector('.faq-list').textContent.includes('What does + on a node do?'));
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
    await t.click('Отменить');assert.ok([...document.querySelectorAll('[data-node-body-editor="blend"]')].every(e=>e.value===before));
    await act(async()=>document.querySelector('[data-nid="blend"] .node-expand-button').click());assert.equal(document.querySelectorAll('[data-node-body-editor="blend"]').length,0);
  }finally{await t.close();}
});

test('desktop spread removes external duplicates dynamically; mobile keeps links to offscreen layers',async()=>{
  const g=makeRoastery();
  for(const width of [1366,390]){
    const t=await mount(width);
    try{
      if(width===390){const mode=document.querySelector('select[aria-label="Режим"]');await act(async()=>{mode.value='spread';mode.dispatchEvent(new t.w.Event('change',{bubbles:true}));});}else await t.click('Разворот');
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
  assert.ok(document.querySelector('[data-line-kind="local"] path:not([stroke-dasharray])'));
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
  const mode=document.querySelector('select[aria-label="Режим"]');await act(async()=>{mode.value='spread';mode.dispatchEvent(new t.w.Event('change',{bubbles:true}));});
  assert.ok(document.querySelector('.external-toggle'));await act(async()=>document.querySelector('.external-toggle').click());assert.equal(document.querySelectorAll('[data-external-node]').length,0);
  await act(async()=>document.querySelector('.legend-trigger').click());assert.ok(document.querySelector('.legend-panel'));
  await act(async()=>document.querySelector('.legend-close').click());assert.equal(document.querySelector('.legend-panel'),null);
  await t.flush();assert.equal(JSON.parse(localStorage.getItem('atlas.graph.v2')).nodes.length,42);
 }finally{await t.close();}
});

test('help media starts as a still, plays a local GIF, stops, and changes language',async()=>{
 const t=await mount();
 try{
  await t.click('Для ИИ');const first=document.querySelector('.help-media');assert.ok(first.querySelector('img').src.startsWith('data:image/png;base64,'));
  await act(async()=>first.querySelector('button').click());assert.ok(first.querySelector('img').src.startsWith('data:image/gif;base64,'));
  await act(async()=>first.querySelector('button').click());assert.ok(first.querySelector('img').src.startsWith('data:image/png;base64,'));
  await t.click('ENG');assert.ok(document.querySelector('.help-media-title').textContent.includes('Illustrated walkthrough'));
  const links=[...document.querySelectorAll('.help-media a')];assert.ok(links.every(a=>a.download.endsWith('-en.gif')||a.download.endsWith('-en.png')));
 }finally{await t.close();}
});

test('cross-model walkthrough reveals review targets without mutating the current atlas',async()=>{
 const graph=makeRoastery(),t=await mount(1366,graph);
 try{
  await t.click('FAQ / ЧАВО');assert.equal(document.querySelectorAll('[data-case-model]').length,6);
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
  await t.click('Отменить');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);assert.deepEqual(currentPositions(),before);
  await t.click('Вернуть');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),saved);assert.deepEqual(currentPositions(),after);
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
  await t.click('Лист');await t.click('Разворот');assert.deepEqual(currentPositions(),after);
  await t.click('Отменить');await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
  await t.click('Вернуть');await t.flush();assert.deepEqual(currentPositions(),after);
 }finally{await t.close();}
});

test('flat optimization saves independent positions, translates its button, and undoes without editing sheets',async()=>{
 const g=makeRoastery(),t=await mount(1366,g);
 try{
  await t.click('Одна плоскость');const before=currentPositions();await t.click('ENG');
  assert.ok(document.querySelector('.optimize-button').textContent.includes('Optimize layout'));
  await t.click('Optimize layout');await finishLayout(t);
  const saved=JSON.parse(localStorage.getItem('atlas.graph.v2')),after=currentPositions();
  assert.equal(Object.keys(saved.flatPositions).length,g.nodes.length);assert.deepEqual(saved.nodes,g.nodes);assert.notDeepEqual(after,before);
  await t.click('Sheet');await t.click('Flat view');assert.deepEqual(currentPositions(),after);
  await t.click('Undo');await t.flush();assert.deepEqual(currentPositions(),before);assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
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
  await act(async()=>document.querySelector('button[aria-label="Отменить изменение"]').click());await t.flush();assert.deepEqual(JSON.parse(localStorage.getItem('atlas.graph.v2')),g);
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
