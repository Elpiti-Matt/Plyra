import test from "node:test";
import assert from "node:assert/strict";
import { makeRoastery, makeDemo, makeSoftwareDemo, loadGraph, buildIndex, flatten, stubsForSheet, edgesBetweenSheets, lint, parseCSV, csvGraph, toCanvas, splitSheets, safeSrc, notationLoss, forceLayout, sheetTypeId, emptyProject, overviewPositions, moveOverviewSheet, moveOverviewNode, fitOverview, serializePlyra } from "../.qa/support.mjs";

test("all demo datasets and languages retain every node, edge and membership", () => {
  for (const g of [makeRoastery(), makeDemo(), makeSoftwareDemo("en")]) {
    const result = loadGraph(JSON.parse(JSON.stringify(g)));
    assert.equal(result.errors.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(result.graph)), JSON.parse(JSON.stringify({...g,sheets:g.sheets.map(s=>({...s,typeId:sheetTypeId(s),tags:[]}))})));
  }
});
test("legacy and generic graphs receive deterministic coordinates and edge IDs", () => {
  const raw = { nodes: [{id:"a", name:"A"}, {id:"b", name:"B"}], edges: [{from:"a",to:"b"}] };
  const a = loadGraph(raw), b = loadGraph(raw);
  assert.deepEqual(a,b); assert.notDeepEqual(a.graph.nodes[0].pos, a.graph.nodes[1].pos);
  assert.equal(raw.sheets, undefined);
  assert.ok(loadGraph(flatten(makeRoastery()).graph).graph);
});
test("invalid data is rejected atomically: duplicates, dangling ends, memberships, types, versions", () => {
  const mutations = [
    (g) => g.nodes.push(g.nodes[0]), (g) => g.edges.push({from:"blend", to:"missing"}),
    (g) => g.nodes[0].sheets.push("missing"), (g) => g.nodes[0].kind="secret-new-type",
    (g) => g.edges[0].kind="unknown", (g) => g.version=99,
    (g) => g.edges.push({...g.edges[0]}), (g) => g.nodes[0].sheets.push(7),
    (g) => g.nodes[0].id="__proto__", (g) => g.nodes[0].body={table:[["a"], null]},
  ];
  for (const mutate of mutations) { const g = makeRoastery(); mutate(g); const r = loadGraph(g); assert.equal(r.graph,null); assert.ok(r.errors.length); }
});
test("empty maps and bodies over 8000 characters survive storage round trip", () => {
  const g = makeRoastery(); g.nodes[0].body = "x".repeat(16000);
  assert.equal(loadGraph(g).graph.nodes[0].body.length,16000);
  g.nodes=[];g.edges=[];assert.equal(loadGraph(g).graph.nodes.length,0);
});
test("tree export removes memberships and retains graph edges", () => {
  const g=makeRoastery(), r=flatten(g);
  assert.equal(r.droppedMemberships,g.nodes.reduce((s,n)=>s+n.sheets.length-1,0));
  assert.deepEqual(r.graph.edges,g.edges);assert.equal(g.nodes[0].sheets.length,3);
});
test("a shared third sheet must not hide the boundary edge between A and B", () => {
  const g=loadGraph({sheets:[{id:"a"},{id:"b"},{id:"c"}], nodes:[{id:"x",sheets:["a","c"]},{id:"y",sheets:["b","c"]}],edges:[{from:"x",to:"y"}]}).graph;
  const idx=buildIndex(g);assert.equal(edgesBetweenSheets(g,idx,"a","b").length,1);
  assert.equal(stubsForSheet(g,idx,"a",new Map()).length,1);
  assert.equal(stubsForSheet(g,idx,"c",new Map()).length,0);
});
test("sheet classification accepts all node and relation types and never mutates the canonical graph", () => {
  const g=makeRoastery(), before=JSON.stringify(g), sheet={...g.sheets.find((s)=>s.id==="roasting"),notation:"процесс"};
  const loss=notationLoss(g,sheet);assert.equal(loss.nodes,0);assert.equal(loss.edges,0);
  assert.equal(JSON.stringify(g),before);
});
test("CSV supports BOM, escaped quotes, quoted commas and multiline bodies", () => {
  const rows=parseCSV('\uFEFFid,name,body\r\na,"Hello, ""coffee""","line1\nline2"\r\n');
  assert.deepEqual(rows,[{id:"a",name:'Hello, "coffee"',body:"line1\nline2"}]);
  assert.throws(()=>parseCSV('id,name\na,"broken'));
  const g=csvGraph([{name:"nodes.csv",text:"id,name,sheets\na,A,one|two\nb,B,two\n"},{name:"edges.csv",text:"from,to\na,b\n"}]);
  assert.equal(loadGraph(g).graph.nodes[0].sheets.length,2);
});
test("Canvas IDs are unique, all edge endpoints resolve, every canonical edge appears", () => {
  const g=makeRoastery(),c=toCanvas(g),ids=new Set(c.nodes.map((n)=>n.id));
  assert.equal(ids.size,c.nodes.length);
  for(const e of c.edges){assert.ok(ids.has(e.fromNode));assert.ok(ids.has(e.toNode));}
  for(const e of g.edges)assert.ok(c.edges.some((x)=>x.atlasEdgeId===e.id));
  assert.equal(c.nodes.filter((n)=>n.atlasNodeId==="blend").length,3);
  assert.ok(c.nodes.every((n)=>[n.x,n.y,n.width,n.height].every(Number.isFinite)));
});
test("sheet splitting is deterministic, bounded, idempotent and preserves identities and edges", () => {
  const g=makeDemo();g.sheets.forEach((s)=>s.limit=5);
  const r=splitSheets(g);assert.ok(r.sheets.length>g.sheets.length);assert.deepEqual(r,splitSheets(g));assert.deepEqual(r,splitSheets(r));
  assert.deepEqual(r.edges,g.edges);assert.deepEqual(r.nodes.map((n)=>n.id),g.nodes.map((n)=>n.id));
  for(const s of r.sheets)assert.ok(r.nodes.filter((n)=>n.sheets.includes(s.id)).length<=5);
  assert.ok(loadGraph(r).graph);
});
test("image URLs cannot perform network requests", () => {
  for(const s of ["https://example.com/a.png","//example.com/a.png","\\\\example.com/a.png","/a.png","blob:abc","javascript:alert(1)","data:image/svg+xml;base64,PHN2Zz4="])assert.equal(safeSrc(s),null);
  assert.equal(safeSrc("data:image/png;base64,AAAA"),"data:image/png;base64,AAAA");
});
test("membership recommendations count unique neighbors, not parallel edges", () => {
  const g=loadGraph({sheets:[{id:"a"},{id:"b"}],nodes:[{id:"x",sheet:"a"},{id:"y",sheet:"b"}],edges:Array.from({length:4},()=>({from:"x",to:"y"}))}).graph;
  assert.ok(!lint(g,buildIndex(g)).some((x)=>x.code==="membership-candidate"));
});
test("large flat view uses bounded deterministic grid layout", () => {
  const g=makeRoastery();g.nodes=Array.from({length:301},(_,i)=>({...g.nodes[0],id:`n${i}`}));g.edges=[];
  const layout=forceLayout(g);assert.equal(layout.size,301);assert.deepEqual(layout,forceLayout(g));
});

test('spread hides only references with visible destinations and preserves every corresponding route',async()=>{
  const {sheetRoutes}=await import('../.qa/support.mjs');
  for(const graph of [makeRoastery(),makeDemo()]){
    const idx=buildIndex(graph),before=JSON.stringify(graph);
    for(const count of [1,2,3,5,6,graph.sheets.length]){
      const visible=graph.sheets.slice(0,count).map((s)=>s.id),routes=sheetRoutes(graph,idx,visible);
      for(const sid of visible){
        const base=stubsForSheet(graph,idx,sid,new Map()),shown=stubsForSheet(graph,idx,sid,new Map(),undefined,visible);
        for(const stub of base){
          const elsewhere=stub.node.sheets.some((s)=>s!==sid&&visible.includes(s));
          assert.equal(shown.some((s)=>s.node.id===stub.node.id),!elsewhere);
          if(elsewhere)for(const edge of stub.edges)assert.ok(routes.some((r)=>r.edge.id===edge.id&&(r.fromSheet===sid||r.toSheet===sid)),`lost ${edge.id} at ${sid}`);
        }
      }
      if(count===graph.sheets.length)for(const sid of visible)assert.equal(stubsForSheet(graph,idx,sid,new Map(),undefined,visible).length,0);
    }
    assert.equal(JSON.stringify(graph),before);
  }
});

test('a common third membership retains routes from both original appearances',async()=>{
  const {sheetRoutes}=await import('../.qa/support.mjs');
  const g=loadGraph({sheets:['a','b','c'].map(id=>({id,name:id})),nodes:[{id:'x',sheets:['a','c']},{id:'y',sheets:['b','c']}],edges:[{id:'xy',from:'x',to:'y'}]}).graph;
  const routes=sheetRoutes(g,buildIndex(g),['a','b','c']);
  assert.ok(routes.some(r=>r.fromSheet==='a'&&r.toSheet==='b'));assert.equal(new Set(routes.map(r=>r.key)).size,routes.length);
});

test('view reflow fills a wide sheet differently from a tall one without changing saved positions',async()=>{
  const {responsivePositions}=await import('../.qa/support.mjs');const nodes=makeRoastery().nodes.slice(0,8),before=JSON.stringify(nodes);
  const wide=responsivePositions(nodes,new Map(),1400,200),tall=responsivePositions(nodes,new Map(),300,1100);
  assert.ok(new Set([...wide.values()].map(p=>p.x)).size>new Set([...tall.values()].map(p=>p.x)).size);
  assert.equal(JSON.stringify(nodes),before);
  const sizes=new Map([[nodes[0].id,350]]),expanded=responsivePositions(nodes,sizes,600,500);
  const boxes=nodes.map(n=>({...expanded.get(n.id),w:208,h:sizes.get(n.id)||64}));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y);}
});

test('both AI v3 examples load with typed attributes, sheet classification and shared identities',async()=>{
  const {generationExample,generationPrompt}=await import('../.qa/support.mjs');
  for(const locale of ['ru','en']){const g=generationExample(locale);const r=loadGraph(JSON.parse(JSON.stringify(g)));assert.deepEqual(r.errors,[]);assert.equal(r.graph.version,3);assert.deepEqual(JSON.parse(JSON.stringify(r.graph.nodes)),g.nodes);assert.deepEqual(JSON.parse(JSON.stringify(r.graph.sheets)),g.sheets);assert.equal(r.graph.types.attributes.length,6);assert.deepEqual(new Set(r.graph.types.attributes.map(d=>d.dataType)),new Set(['text','number','boolean','date','url','select']));assert.equal(r.graph.nodes[0].attributes.unitCost,null);assert.equal(r.graph.nodes[0].attributes.confirmed,false);assert.equal(g.nodes.filter(n=>n.id==='blend').length,1);assert.equal(g.nodes[0].sheets.length,2);assert.ok(generationPrompt(locale).includes(JSON.stringify(g,null,2)));}
  const g=generationExample('en');g.sheets[0].notation='process';assert.equal(notationLoss(g,g.sheets[0]).nodes,0);
});

test('identity lines connect repeated appearances without manufacturing graph edges',async()=>{
 const {identityRoutes,makeCrossNotation}=await import('../.qa/support.mjs');
 for(const g of [makeRoastery(),makeCrossNotation('en')]){
  const before=JSON.stringify(g),visible=g.sheets.map(s=>s.id),routes=identityRoutes(g,visible);
  assert.equal(routes.length,g.nodes.reduce((sum,n)=>sum+Math.max(0,n.sheets.length-1),0));
  assert.equal(identityRoutes(g,[visible[0]]).length,0);
  for(const r of routes){assert.ok(r.node.sheets.includes(r.fromSheet));assert.ok(r.node.sheets.includes(r.toSheet));assert.notEqual(r.fromSheet,r.toSheet);}
  assert.equal(JSON.stringify(g),before);
 }
});

test('cross-notation examples retain distinct activity/service/state IDs and valid shared appearances',async()=>{
 const {makeCrossNotation}=await import('../.qa/support.mjs');
 for(const lang of ['ru','en']){
  const g=makeCrossNotation(lang),r=loadGraph(JSON.parse(JSON.stringify(g)));assert.deepEqual(r.errors,[]);assert.equal(g.nodes.length,13);assert.equal(g.sheets.length,6);
  const idx=buildIndex(g);assert.notEqual(idx.nodeById.get('activity.pay'),idx.nodeById.get('service.payment'));
  assert.deepEqual(idx.nodeById.get('class.payment').sheets,['classes','states']);assert.equal(g.nodes.filter(n=>n.id==='req.confirmed').length,1);
  assert.ok(g.edges.some(e=>e.from==='service.payment'&&e.to==='activity.pay'));assert.ok(g.edges.some(e=>e.from==='test.duplicate'&&e.to==='req.once'));
 }
});

// Layout checks use the same cubic control points as the SVG renderer.
const layoutAPI=await import('../.qa/support.mjs');
const {responsivePositions,identityRoutes,sheetRoutes}=layoutAPI;
const layoutBox=(id,x,y,h=64)=>({id,x,y,w:208,h,group:'one'});
const tangled=()=>({nodes:[layoutBox('a',0,0),layoutBox('b',500,240),layoutBox('c',0,240),layoutBox('d',500,0)],links:[{from:'a',to:'b'},{from:'c',to:'d'}],groups:[{id:'one',aspect:1.5}]});

test('layout detects a cubic X, a line through a card, and coincident line runs',()=>{
  const {measureLayout}=layoutAPI,req=tangled();
  assert.equal(measureLayout({boxes:req.nodes,links:req.links}).crossings,1);
  const boxes=[layoutBox('a',0,0),layoutBox('b',350,0),layoutBox('c',700,0)];
  assert.equal(measureLayout({boxes,links:[{from:'a',to:'c'}]}).nodeHits,1);
  const shared=measureLayout({boxes,links:[{from:'a',to:'c'},{from:'a',to:'c'}]});
  assert.equal(shared.sharedSegments,1);assert.equal(shared.crossings,0);
});

test('optimization reduces crossings, separates unequal cards, and is reproducible without mutation',()=>{
  const {optimizeLayout,compareLayout}=layoutAPI,req=tangled(),original=structuredClone(req);
  const a=optimizeLayout(req),b=optimizeLayout(req);
  assert.equal(a.before.crossings,1);assert.equal(a.after.crossings,0);
  assert.equal(a.after.nodeHits,0);assert.deepEqual(a.positions,b.positions);assert.deepEqual(req,original);
  const pile={...req,nodes:req.nodes.map((n,i)=>({...n,x:0,y:0,h:64+i*110}))};
  const result=optimizeLayout(pile);
  assert.equal(result.before.overlaps,6);assert.equal(result.after.overlaps,0);assert.ok(compareLayout(result.after,result.before)<0);
  assert.deepEqual([...result.positions.keys()].sort(),req.nodes.map(n=>n.id).sort());
  const reversed=optimizeLayout({...req,nodes:[...req.nodes].reverse(),links:[...req.links].reverse()});
  assert.deepEqual(reversed.positions,a.positions);
});

test('optimization handles empty, isolated and cyclic graphs with finite coordinates',()=>{
  const {optimizeLayout}=layoutAPI;
  for(const links of [[],[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'a'},{from:'a',to:'a'}]]){
    const req={nodes:[layoutBox('a',0,0),layoutBox('b',0,0),layoutBox('c',0,0)],links,groups:[{id:'one',aspect:.3}]};
    const r=optimizeLayout(req);assert.equal(r.after.overlaps,0);
    for(const p of r.positions.values())assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
  }
  const empty=optimizeLayout({nodes:[],links:[],groups:[]});assert.equal(empty.changed,false);assert.equal(empty.after.overlaps,0);
});

test('spread scoring includes inter-sheet relations, shared identity and boundary references',()=>{
  const {viewLayoutRequest,appearanceId}=layoutAPI;
  const g=makeRoastery(),idx=buildIndex(g),sizes=new Map(),visible=g.sheets.slice(0,6);
  const snapshot={external:true,panes:visible.map((s,i)=>({sid:s.id,width:600,height:400,frame:{x:i%3*600,y:Math.floor(i/3)*400,w:600,h:400},positions:responsivePositions(idx.bySheet.get(s.id),sizes,600,400)}))};
  const req=viewLayoutRequest(g,sizes,snapshot),ids=new Set(req.nodes.map(n=>n.id));
  const first=identityRoutes(g,visible.map(s=>s.id))[0];assert.ok(first);
  assert.ok(req.links.some(e=>e.from===appearanceId(first.fromSheet,first.node.id)&&e.to===appearanceId(first.toSheet,first.node.id)));
  const cross=sheetRoutes(g,idx,visible.map(s=>s.id))[0];assert.ok(req.links.some(e=>e.from===appearanceId(cross.fromSheet,cross.edge.from)&&e.to===appearanceId(cross.toSheet,cross.edge.to)));
  const positions=new Map(req.nodes.map(n=>[n.id,{x:n.x,y:n.y}])),scene=req.scene(positions);
  assert.ok(scene.boxes.length>ids.size);assert.ok(scene.links.length>req.links.length);
  const hidden=viewLayoutRequest(g,sizes,{...snapshot,external:false});assert.equal(hidden.scene(positions).boxes.length,ids.size);
});

test('six-sheet optimization preserves all identities and unopened coordinates; native save retains layouts',()=>{
  const {viewLayoutRequest,optimizeLayout,applyViewLayout,compareLayout}=layoutAPI;
  const g=makeRoastery(),original=structuredClone(g),idx=buildIndex(g),sizes=new Map();
  const panes=g.sheets.slice(0,6).map((s,i)=>({sid:s.id,width:600,height:400,frame:{x:i%3*600,y:Math.floor(i/3)*400,w:600,h:400},positions:responsivePositions(idx.bySheet.get(s.id),sizes,600,400)}));
  const snapshot={panes,external:true},result=optimizeLayout(viewLayoutRequest(g,sizes,snapshot)),next=applyViewLayout(g,snapshot,result);
  assert.ok(result.changed);assert.ok(compareLayout(result.after,result.before)<0);assert.ok(result.after.nodeHits<result.before.nodeHits);
  assert.deepEqual(g,original);assert.deepEqual(next.edges,g.edges);
  assert.deepEqual(next.nodes.map(n=>[n.id,n.sheets,n.name,n.body]),g.nodes.map(n=>[n.id,n.sheets,n.name,n.body]));
  const closed=g.sheets[6].id;for(const n of next.nodes)assert.deepEqual(n.pos[closed],g.nodes.find(v=>v.id===n.id).pos[closed]);
  const loaded=loadGraph(JSON.parse(JSON.stringify(next)));assert.deepEqual(loaded.errors,[]);assert.ok(loaded.graph.sheets.slice(0,6).every(s=>s.layout==='manual'));
  assert.deepEqual(loaded.graph.nodes.map(n=>n.pos),next.nodes.map(n=>n.pos));
});

test('flat layout saves separately and rejects malformed or orphaned stored positions atomically',()=>{
  const {viewLayoutRequest,optimizeLayout,applyViewLayout}=layoutAPI;
  const g=makeRoastery(),snapshot={flat:true,external:false,panes:[{sid:'__flat',width:1000,height:600,positions:forceLayout(g)}]};
  const r=optimizeLayout(viewLayoutRequest(g,new Map(),snapshot)),next=applyViewLayout(g,snapshot,r);
  assert.equal(r.after.overlaps,0);assert.deepEqual(next.nodes,g.nodes);assert.deepEqual(next.sheets,g.sheets);
  assert.deepEqual({...loadGraph(JSON.parse(JSON.stringify(next))).graph.flatPositions},next.flatPositions);
  for(const flatPositions of [[],{missing:{x:0,y:0}},{blend:{x:Infinity,y:0}},{blend:{x:1e10,y:0}},{blend:{x:'0',y:0}}])assert.equal(loadGraph({...g,flatPositions}).graph,null);
  assert.equal(loadGraph({...g,sheets:g.sheets.map(s=>({...s,layout:'surprise'}))}).graph,null);
});

test('dense layouts keep every node and disclose their bounded edge sample',()=>{
  const {optimizeLayout,compareLayout}=layoutAPI;
  const nodes=Array.from({length:1000},(_,i)=>layoutBox('n'+i,(i%25)*240,Math.floor(i/25)*100));
  const links=Array.from({length:5000},(_,i)=>({from:'n'+(i%1000),to:'n'+((i*7+19)%1000)}));
  const result=optimizeLayout({nodes,links,groups:[{id:'one',aspect:1.6}]});
  assert.equal(result.positions.size,1000);assert.equal(result.after.sampled,true);assert.equal(result.after.checkedEdges,400);assert.equal(result.after.totalEdges,5000);
  assert.ok(result.evaluated<=18);assert.ok(compareLayout(result.after,result.before)<=0);
});

test('overview sheet layout persists independently from every node position and diagram route',()=>{
 const g=emptyProject();g.sheets.push({...g.sheets[0],id:'second'});g.nodes=[{id:'shared',kind:'entity',name:'Shared',body:'One entity',sheets:['main','second'],pos:{main:{x:25,y:45},second:{x:80,y:60}}}];
 const snapshot=structuredClone(g),positions=overviewPositions(g),moved=moveOverviewSheet(g,'main',{x:370,y:-90},positions);
 assert.deepEqual(g,snapshot);assert.deepEqual(moved.nodes,g.nodes);assert.deepEqual(moved.edges,g.edges);assert.deepEqual(moved.sheets[0].overviewPos,{x:370,y:-90});assert.deepEqual(moved.sheets[1].overviewPos,positions.get('second'));
 const r=loadGraph(JSON.parse(serializePlyra(moved)));assert.deepEqual(r.errors,[]);assert.deepEqual(r.graph.sheets.map(s=>s.overviewPos),moved.sheets.map(s=>s.overviewPos));
 const added={...moved,sheets:[...moved.sheets,{...g.sheets[0],id:'new'}]},next=overviewPositions(added);assert.deepEqual(next.get('main'),{x:370,y:-90});assert.deepEqual(next.get('second'),positions.get('second'));assert.ok(next.has('new'));
});

test('overview node movement edits one appearance, retains identity and does not move any sheet',()=>{
 const g=emptyProject();g.sheets[0].overviewPos={x:500,y:800};g.sheets.push({...g.sheets[0],id:'other',overviewPos:{x:1300,y:0}});g.nodes=[{id:'shared',kind:'entity',name:'Shared',body:'Common',sheets:['main','other'],pos:{main:{x:10,y:20},other:{x:80,y:90}}}];
 const snapshot=structuredClone(g),next=moveOverviewNode(g,'shared','other',{x:140,y:160});assert.deepEqual(g,snapshot);assert.deepEqual(next.sheets,g.sheets);assert.deepEqual(next.nodes[0].pos.main,{x:10,y:20});assert.deepEqual(next.nodes[0].pos.other,{x:140,y:160});assert.deepEqual(next.nodes[0].sheets,['main','other']);assert.equal(next.nodes[0].body,'Common');assert.equal(moveOverviewNode(g,'shared','missing',{x:1,y:2}),g);
});

test('overview geometry rejects invalid coordinates and fits large or empty projects finitely',()=>{
 for(const pos of [{x:Infinity,y:0},{x:1,y:'2'},{x:1e9,y:0},null,[1,2]]){const g=emptyProject();g.sheets[0].overviewPos=pos;assert.equal(loadGraph(g).graph,null);}
 const g=emptyProject();g.sheets=Array.from({length:100},(_,i)=>({...g.sheets[0],id:`s${i}`}));const positions=overviewPositions(g),fit=fitOverview(positions,390,600);assert.equal(positions.size,100);assert.ok([fit.x,fit.y,fit.k].every(Number.isFinite));assert.ok(fit.k>0);assert.deepEqual(overviewPositions(g),positions);assert.ok(fitOverview(new Map(),390,600).k>0);
});


test('focused overview connects every shared appearance directly and excludes unrelated sheet routes',async()=>{
 const {overviewRoutes}=await import('../.qa/support.mjs');
 const g=loadGraph({sheets:['a','b','c'].map(id=>({id,name:id})),nodes:[
  {id:'shared',sheets:['a','b','c']},{id:'x',sheets:['a']},{id:'y',sheets:['b']},{id:'z',sheets:['c']}
 ],edges:[{id:'xy',from:'x',to:'y'},{id:'zx',from:'z',to:'x'},{id:'yz',from:'y',to:'z'}]}).graph;
 const before=JSON.stringify(g),idx=buildIndex(g),visible=['a','b','c'];
 const focused=overviewRoutes(g,idx,visible,'a');
 assert.deepEqual(new Set(focused.edges.map(r=>r.edge.id)),new Set(['xy','zx']));
 assert.ok(focused.edges.some(r=>r.edge.id==='zx'&&r.fromSheet==='c'&&r.toSheet==='a'),'incoming direction survives');
 assert.deepEqual(focused.identities.map(r=>[r.fromSheet,r.toSheet]),[['a','b'],['a','c']]);
 assert.deepEqual(overviewRoutes(g,idx,[...visible,'b'],'a'),focused);
 assert.deepEqual(overviewRoutes(g,idx,visible,'missing'),{edges:[],identities:[]});
 assert.equal(overviewRoutes(g,idx,visible).edges.length,3);
 assert.equal(JSON.stringify(g),before);
});

test('downloadable AI prompts and examples match the v3 contract used by the application',async()=>{
 const {readFileSync}=await import('node:fs');
 const {generationExample,generationPrompt}=await import('../.qa/support.mjs');
 for(const locale of ['ru','en']){
  assert.equal(readFileSync(`docs/AI-PROMPT.${locale}.txt`,'utf8'),generationPrompt(locale)+'\n');
  assert.deepEqual(JSON.parse(readFileSync(`data/ai-example-${locale}.json`,'utf8')),generationExample(locale));
 }
});
