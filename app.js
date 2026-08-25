
const RC_SHEET = {
  spreadsheetId: '1I4_rxfEN4k5yiqEMEUHZyKUzVStR_c8aXvlUDxsP9u0',
  gid: '0',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1I4_rxfEN4k5yiqEMEUHZyKUzVStR_c8aXvlUDxsP9u0/edit?gid=0'
};

function normalizeHeader(value){ return String(value ?? '').replace(/\s+/g,' ').trim(); }
function lookupKey(value){ return normalizeHeader(value).toLowerCase().replace(/[“”"'’]/g,'').replace(/[^a-z0-9]+/g,' ').trim(); }
function isBlank(value){ return value === null || value === undefined || String(value).trim() === ''; }
function cleanGvizCell(cell){
  if(!cell) return '';
  // Prefer formatted values because dropdown chips, dates, and links are represented readably there.
  const v = cell.f !== undefined && cell.f !== null ? cell.f : cell.v;
  return v === undefined || v === null ? '' : v;
}
function gvizRows(response){
  if(!response || response.status === 'error' || !response.table){
    const msg = response?.errors?.map(e=>e.detailed_message || e.message).filter(Boolean).join('; ') || 'Google Sheets returned no table.';
    throw new Error(msg);
  }
  const labels = response.table.cols.map((c,i)=>normalizeHeader(c.label || c.id || `Column ${i+1}`));
  return response.table.rows.map(r=>{
    const obj={};
    labels.forEach((label,i)=>{ if(label) obj[label]=cleanGvizCell(r.c?.[i]); });
    return obj;
  }).filter(r=>Object.values(r).some(v=>!isBlank(v)));
}
function loadGviz(headers){
  return new Promise((resolve,reject)=>{
    const callback=`__rcSheet_${Date.now()}_${headers}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    let settled=false;
    const cleanup=()=>{ try{delete window[callback]}catch{}; script.remove(); };
    const timer=setTimeout(()=>{
      if(!settled){settled=true;cleanup();reject(new Error('Timed out while loading the Google Sheet.'));}
    },15000);
    window[callback]=(response)=>{
      if(settled)return;
      settled=true;clearTimeout(timer);
      try{const rows=gvizRows(response);cleanup();resolve(rows)}catch(err){cleanup();reject(err)}
    };
    script.onerror=()=>{
      if(!settled){settled=true;clearTimeout(timer);cleanup();reject(new Error('Could not reach the Google Sheet. Make sure the Public Data Feed is set to Anyone with the link → Viewer.'));}
    };
    const tqx=encodeURIComponent(`out:json;responseHandler:${callback}`);
    script.src=`https://docs.google.com/spreadsheets/d/${RC_SHEET.spreadsheetId}/gviz/tq?gid=${encodeURIComponent(RC_SHEET.gid)}&headers=${headers}&tqx=${tqx}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}
function hasRegionalCenterHeader(rows){
  return rows.some(row=>Object.keys(row).some(k=>lookupKey(k)==='regional center'));
}
async function loadPublishedRows(){
  if(Array.isArray(window.__RC_TEST_DATA__)) return window.__RC_TEST_DATA__;
  let lastError=null;
  for(const headers of [1,2]){
    try{
      const rows=await loadGviz(headers);
      if(hasRegionalCenterHeader(rows)) return rows;
    }catch(err){ lastError=err; }
  }
  throw lastError || new Error('Could not identify a Regional Center column in the public data feed. Make sure the first row contains the Activity Data headers.');
}
function setDataStatus(kind, message){
  const n=document.getElementById('dataNotice'), s=document.getElementById('dataStatus');
  if(!n||!s)return;
  // Keep routine loading/success messages out of the public interface.
  // Only surface the notice if the live data connection fails.
  if(kind!=='error'){
    n.classList.add('hidden');
    return;
  }
  n.classList.remove('hidden','loading');
  n.classList.add('error');
  n.querySelector('b').textContent='Data connection problem.';
  s.textContent=message;
}
function canonicalizeRow(raw){
  // Keep source headers intact so the existing interface reads the Review/Edit fields directly.
  const out={};
  Object.entries(raw).forEach(([k,v])=>{out[normalizeHeader(k)]=v});
  return out;
}

function init(DATA){
const $=id=>document.getElementById(id);const clean=v=>(v??'').toString().trim();
function splitTags(v){return clean(v).split(/\s*\|\s*|\n+|,\s*/).map(x=>x.trim()).filter(Boolean)}
function catTags(d){return splitTags(d['Activity Categories (Review/Edit)']||d['All Activity Categories'])}
function audTags(d){return splitTags(d['Intended Audience (Review/Edit)'])}
const activityRows=DATA.filter(d=>clean(d['Specific Quote / Activity']));const centers=[...new Set(DATA.map(d=>d['Regional Center']).filter(Boolean))].sort();const years=[...new Set(activityRows.map(d=>d['Source Year']).filter(Boolean))].sort().reverse();const cats=[...new Set(activityRows.flatMap(catTags))].sort();const audiences=[...new Set(activityRows.flatMap(audTags))].sort();
$('statCenters').textContent=centers.length;$('statActivities').textContent=activityRows.length;$('statYears').textContent=years.length;$('statAudiences').textContent=audiences.length;
function opt(sel,vals){vals.forEach(v=>{let o=document.createElement('option');o.value=v;o.textContent=v;sel.append(o)})}
opt($('centerSelect'),centers);opt($('browseCenter'),centers);opt($('compareAdd'),centers);[$('browseYear'),$('compareYear')].forEach(s=>opt(s,years));[$('centerCatFilter'),$('browseCat'),$('compareCat')].forEach(s=>opt(s,cats));[$('centerAudFilter'),$('browseAud'),$('compareAud')].forEach(s=>opt(s,audiences));
let current=centers[0];let compare=centers.slice(0,3);
function tagEl(t,cls='tag'){const s=document.createElement('span');s.className=cls;s.textContent=t;return s}
function sourceLink(d,label='View source ↗'){if(!clean(d['Source Link'])){const m=document.createElement('span');m.className='missing';m.textContent='Source link not yet added';return m}const a=document.createElement('a');a.className='sourceBtn';a.href=d['Source Link'];a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;return a}
function activityCard(d,small=false){const c=document.createElement('div');c.className=small?'compareItem':'activityCard';const top=document.createElement('div');top.className='activityTop';const meta=document.createElement('div');meta.className='meta';meta.textContent=d['Source Year']+' · '+d['Source Type'];top.append(meta);const lab1=document.createElement('div');lab1.className='label';lab1.textContent='Activity category';const tags=document.createElement('div');tags.className='tags';catTags(d).forEach(t=>tags.append(tagEl(t)));const lab2=document.createElement('div');lab2.className='label';lab2.textContent='Intended audience';const aud=document.createElement('div');aud.className='tags';audTags(d).forEach(t=>aud.append(tagEl(t,'audTag')));const q=document.createElement('div');q.className='activityQuote';q.textContent=d['Specific Quote / Activity'];const sm=document.createElement('div');sm.className='meta';sm.textContent=d['Source Title'];c.append(top,lab1,tags,lab2,aud,q,sm,sourceLink(d));return c}
function centerRows(name){return DATA.filter(d=>d['Regional Center']===name)}
function setCenter(name){current=name;$('centerSelect').value=name;renderCenterGrid();renderCenter()}
function renderCenterGrid(){const g=$('centerGrid');g.textContent='';centers.forEach(name=>{const b=document.createElement('button');b.className='centerBtn'+(name===current?' active':'');const n=activityRows.filter(d=>d['Regional Center']===name).length;b.innerHTML='<div class="short">'+name+'</div><div class="n">'+n+' activity'+(n===1?'':' excerpts')+'</div>';b.onclick=()=>setCenter(name);g.append(b)})}
function renderCenter(){const rows=centerRows(current);const populated=rows.filter(d=>clean(d['Specific Quote / Activity']));$('centerName').textContent=current;$('centerCount').textContent=populated.length+' activity excerpts';const ys=[...new Set(populated.map(d=>d['Source Year']).filter(Boolean))];$('centerYear').textContent=ys.join(', ')||'Not coded';$('centerCats').textContent=new Set(populated.flatMap(catTags)).size;$('centerAuds').textContent=new Set(populated.flatMap(audTags)).size;$('centerSource').textContent=[...new Set(populated.map(d=>d['Source Title']).filter(Boolean))].join(' · ');renderCenterActivities()}
function renderCenterActivities(){const cat=$('centerCatFilter').value,aud=$('centerAudFilter').value,q=$('centerSearch').value.toLowerCase();const rows=centerRows(current).filter(d=>clean(d['Specific Quote / Activity'])).filter(d=>(!cat||catTags(d).includes(cat))&&(!aud||audTags(d).includes(aud))&&(!q||Object.values(d).join(' ').toLowerCase().includes(q)));const box=$('centerActivities');box.textContent='';if(!rows.length){const e=document.createElement('div');e.className='missing';e.textContent='No activity excerpts match these filters.';box.append(e)}else rows.forEach(d=>box.append(activityCard(d)))}
$('centerSelect').onchange=e=>setCenter(e.target.value);['centerCatFilter','centerAudFilter'].forEach(id=>$(id).onchange=renderCenterActivities);$('centerSearch').oninput=renderCenterActivities;
function renderBrowse(){const q=$('browseSearch').value.toLowerCase(),c=$('browseCenter').value,y=$('browseYear').value,cat=$('browseCat').value,aud=$('browseAud').value;const rr=activityRows.filter(d=>(!c||d['Regional Center']===c)&&(!y||d['Source Year']===y)&&(!cat||catTags(d).includes(cat))&&(!aud||audTags(d).includes(aud))&&(!q||Object.values(d).join(' ').toLowerCase().includes(q)));const tb=$('browseBody');tb.textContent='';rr.forEach(d=>{const tr=document.createElement('tr');tr.className='click';tr.onclick=()=>{setCenter(d['Regional Center']);show('explore');window.scrollTo({top:$('exploreMode').offsetTop-10,behavior:'smooth'})};let td1=document.createElement('td');td1.textContent=d['Regional Center'];let td2=document.createElement('td');td2.textContent=d['Source Year'];let td3=document.createElement('td'),tg=document.createElement('div');tg.className='tags';catTags(d).forEach(t=>tg.append(tagEl(t)));td3.append(tg);let td4=document.createElement('td'),ag=document.createElement('div');ag.className='tags';audTags(d).forEach(t=>ag.append(tagEl(t,'audTag')));td4.append(ag);let td5=document.createElement('td');td5.className='quoteCell';td5.textContent=d['Specific Quote / Activity'];let td6=document.createElement('td');const meta=document.createElement('div');meta.className='meta';meta.textContent=d['Source Title'];td6.append(meta,sourceLink(d,'Open source ↗'));tr.append(td1,td2,td3,td4,td5,td6);tb.append(tr)});$('browseCount').textContent='Showing '+rr.length+' of '+activityRows.length+' activity excerpts.'}
['browseCenter','browseYear','browseCat','browseAud'].forEach(id=>$(id).onchange=renderBrowse);$('browseSearch').oninput=renderBrowse;
function renderCompare(){const chips=$('compareChips');chips.textContent='';compare.forEach(name=>{const c=document.createElement('span');c.className='chip';c.textContent=name;const b=document.createElement('button');b.textContent='×';b.disabled=compare.length<=2;b.style.opacity=compare.length<=2?'.35':'1';b.onclick=()=>{if(compare.length<=2)return;compare=compare.filter(x=>x!==name);renderCompare()};c.append(b);chips.append(c)});const y=$('compareYear').value,cat=$('compareCat').value,aud=$('compareAud').value;const grid=$('compareGrid');grid.textContent='';compare.forEach(name=>{const col=document.createElement('div');col.className='compareCol';const rr=activityRows.filter(d=>d['Regional Center']===name&&(!y||d['Source Year']===y)&&(!cat||catTags(d).includes(cat))&&(!aud||audTags(d).includes(aud)));const h=document.createElement('h3');h.textContent=name+' · '+rr.length+' matches';const items=document.createElement('div');items.className='compareItems';if(!rr.length){const e=document.createElement('div');e.className='missing';e.textContent='No matching activities.';items.append(e)}else rr.forEach(d=>items.append(activityCard(d,true)));col.append(h,items);grid.append(col)})}
$('addCompare').onclick=()=>{const v=$('compareAdd').value;if(v&&!compare.includes(v)){compare.push(v);renderCompare()}};['compareYear','compareCat','compareAud'].forEach(id=>$(id).onchange=renderCompare);
function show(mode){$('exploreMode').classList.toggle('hidden',mode!=='explore');$('browseMode').classList.toggle('active',mode==='browse');$('compareMode').classList.toggle('active',mode==='compare');$('exploreBtn').classList.toggle('active',mode==='explore');$('browseBtn').classList.toggle('active',mode==='browse');$('compareBtn').classList.toggle('active',mode==='compare');if(mode==='browse')renderBrowse();if(mode==='compare')renderCompare()}
$('exploreBtn').onclick=()=>show('explore');$('browseBtn').onclick=()=>show('browse');$('compareBtn').onclick=()=>show('compare');setCenter(current);renderBrowse();renderCompare();

}

async function boot(){
  setDataStatus('loading','Loading the Regional Center public data feed.');
  try{
    const raw=await loadPublishedRows();
    const DATA=raw.map(canonicalizeRow).filter(d=>!isBlank(d['Regional Center']));
    if(!DATA.length) throw new Error('The sheet loaded, but no activity rows with a Regional Center value were found.');
    setDataStatus('success',`Loaded ${DATA.length} activity rows from the Google Sheet. Refresh this page after editing the main Google Sheet to load the latest feed values.`);
    init(DATA);
  }catch(err){
    console.error(err);
    setDataStatus('error',err.message || String(err));
  }
}
boot();
