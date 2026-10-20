const RC_SHEET = {
  spreadsheetId: '1I4_rxfEN4k5yiqEMEUHZyKUzVStR_c8aXvlUDxsP9u0',
  gid: '1459522559',
  sheetUrl: 'https://docs.google.com/spreadsheets/d/1I4_rxfEN4k5yiqEMEUHZyKUzVStR_c8aXvlUDxsP9u0/edit?gid=0'
};

const FIELDS = {
  category: 'Activity Categories (Review/Edit)',
  lead: 'Activity Provider / Lead (Review/Edit)',
  direct: 'Direct Intended Audience (Review/Edit)',
  other: 'Other Involved / Beneficiary Groups (Review/Edit)'
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
  // Keep source headers intact so the interface reads the Review/Edit fields directly.
  const out={};
  Object.entries(raw).forEach(([k,v])=>{out[normalizeHeader(k)]=v});
  return out;
}

function validateRequiredColumns(rows){
  const required=[
    'Regional Center',
    'Specific Quote / Activity',
    FIELDS.category,
    FIELDS.lead,
    FIELDS.direct,
    FIELDS.other
  ];
  const available=new Set();
  rows.forEach(row=>Object.keys(row).forEach(k=>available.add(lookupKey(k))));
  const missing=required.filter(h=>!available.has(lookupKey(h)));
  if(missing.length){
    throw new Error(`The public data feed is missing required column${missing.length===1?'':'s'}: ${missing.join(', ')}. Confirm the Public Data Feed includes the new role-based columns.`);
  }
}

function init(DATA){
  const $=id=>document.getElementById(id);
  const clean=v=>(v??'').toString().trim();

  function splitTags(v){
    return clean(v)
      .split(/\s*\|\s*|\n+|,\s*/)
      .map(x=>x.trim())
      .filter(Boolean);
  }

  function catTags(d){ return splitTags(d[FIELDS.category]||d['All Activity Categories']); }
  function leadTags(d){ return splitTags(d[FIELDS.lead]); }
  function directTags(d){ return splitTags(d[FIELDS.direct]); }
  function otherTags(d){ return splitTags(d[FIELDS.other]); }
  function allRoleTags(d){ return [...leadTags(d),...directTags(d),...otherTags(d)]; }

  const activityRows=DATA.filter(d=>clean(d['Specific Quote / Activity']));
  const centers=[...new Set(DATA.map(d=>d['Regional Center']).filter(Boolean))].sort();
  const years=[...new Set(activityRows.map(d=>d['Source Year']).filter(Boolean))].sort().reverse();
  const cats=[...new Set(activityRows.flatMap(catTags))].sort();
  const leads=[...new Set(activityRows.flatMap(leadTags))].sort();
  const directs=[...new Set(activityRows.flatMap(directTags))].sort();
  const others=[...new Set(activityRows.flatMap(otherTags))].sort();
  const roleGroups=[...new Set(activityRows.flatMap(allRoleTags))].sort();

  $('statCenters').textContent=centers.length;
  $('statActivities').textContent=activityRows.length;
  $('statYears').textContent=years.length;
  $('statRoles').textContent=roleGroups.length;

  function opt(sel,vals){
    vals.forEach(v=>{
      const o=document.createElement('option');
      o.value=v;
      o.textContent=v;
      sel.append(o);
    });
  }

  opt($('centerSelect'),centers);
  opt($('browseCenter'),centers);
  opt($('compareAdd'),centers);
  [$('browseYear'),$('compareYear')].forEach(s=>opt(s,years));
  [$('centerCatFilter'),$('browseCat'),$('compareCat')].forEach(s=>opt(s,cats));
  [$('centerLeadFilter'),$('browseLead'),$('compareLead')].forEach(s=>opt(s,leads));
  [$('centerDirectFilter'),$('browseDirect'),$('compareDirect')].forEach(s=>opt(s,directs));
  [$('centerOtherFilter'),$('browseOther'),$('compareOther')].forEach(s=>opt(s,others));

  let current=centers[0];
  let compare=centers.slice(0,3);

  function tagEl(t,cls='tag'){
    const s=document.createElement('span');
    s.className=cls;
    s.textContent=t;
    return s;
  }

  function tagGroup(label, values, cls){
    const wrap=document.createElement('div');
    wrap.className='roleGroup';
    const lab=document.createElement('div');
    lab.className='label';
    lab.textContent=label;
    const tags=document.createElement('div');
    tags.className='tags';
    if(values.length){
      values.forEach(t=>tags.append(tagEl(t,cls)));
    }else{
      const empty=document.createElement('span');
      empty.className='roleEmpty';
      empty.textContent='Not coded';
      tags.append(empty);
    }
    wrap.append(lab,tags);
    return wrap;
  }

  function sourceLink(d,label='View source ↗'){
    if(!clean(d['Source Link'])){
      const m=document.createElement('span');
      m.className='missing';
      m.textContent='Source link not yet added';
      return m;
    }
    const a=document.createElement('a');
    a.className='sourceBtn';
    a.href=d['Source Link'];
    a.target='_blank';
    a.rel='noopener noreferrer';
    a.textContent=label;
    return a;
  }

  function activityCard(d,small=false){
    const c=document.createElement('div');
    c.className=small?'compareItem':'activityCard';

    const top=document.createElement('div');
    top.className='activityTop';
    const meta=document.createElement('div');
    meta.className='meta';
    meta.textContent=[d['Source Year'],d['Source Type']].filter(Boolean).join(' · ');
    top.append(meta);

    const categoryBlock=tagGroup('Activity category',catTags(d),'tag');
    const leadBlock=tagGroup('Activity provider / lead',leadTags(d),'leadTag');
    const directBlock=tagGroup('Direct intended audience',directTags(d),'directTag');
    const otherBlock=tagGroup('Other involved / beneficiary groups',otherTags(d),'otherTag');

    const q=document.createElement('div');
    q.className='activityQuote';
    q.textContent=d['Specific Quote / Activity'];

    const sm=document.createElement('div');
    sm.className='meta';
    sm.textContent=d['Source Title'];

    c.append(top,categoryBlock,leadBlock,directBlock,otherBlock,q,sm,sourceLink(d));
    return c;
  }

  function centerRows(name){ return DATA.filter(d=>d['Regional Center']===name); }

  function setCenter(name){
    current=name;
    $('centerSelect').value=name;
    renderCenterGrid();
    renderCenter();
  }

  function renderCenterGrid(){
    const g=$('centerGrid');
    g.textContent='';
    centers.forEach(name=>{
      const b=document.createElement('button');
      b.className='centerBtn'+(name===current?' active':'');
      const n=activityRows.filter(d=>d['Regional Center']===name).length;
      b.innerHTML='<div class="short">'+name+'</div><div class="n">'+n+' activity'+(n===1?'':' excerpts')+'</div>';
      b.onclick=()=>setCenter(name);
      g.append(b);
    });
  }

  function renderCenter(){
    const rows=centerRows(current);
    const populated=rows.filter(d=>clean(d['Specific Quote / Activity']));
    $('centerName').textContent=current;
    $('centerCount').textContent=populated.length+' activity excerpts';
    const ys=[...new Set(populated.map(d=>d['Source Year']).filter(Boolean))];
    $('centerYear').textContent=ys.join(', ')||'Not coded';
    $('centerCats').textContent=new Set(populated.flatMap(catTags)).size;
    $('centerLeads').textContent=new Set(populated.flatMap(leadTags)).size;
    $('centerDirect').textContent=new Set(populated.flatMap(directTags)).size;
    $('centerOther').textContent=new Set(populated.flatMap(otherTags)).size;
    $('centerSource').textContent=[...new Set(populated.map(d=>d['Source Title']).filter(Boolean))].join(' · ');
    renderCenterActivities();
  }

  function renderCenterActivities(){
    const cat=$('centerCatFilter').value;
    const lead=$('centerLeadFilter').value;
    const direct=$('centerDirectFilter').value;
    const other=$('centerOtherFilter').value;
    const q=$('centerSearch').value.toLowerCase();
    const rows=centerRows(current)
      .filter(d=>clean(d['Specific Quote / Activity']))
      .filter(d=>(!cat||catTags(d).includes(cat))
        &&(!lead||leadTags(d).includes(lead))
        &&(!direct||directTags(d).includes(direct))
        &&(!other||otherTags(d).includes(other))
        &&(!q||Object.values(d).join(' ').toLowerCase().includes(q)));

    const box=$('centerActivities');
    box.textContent='';
    if(!rows.length){
      const e=document.createElement('div');
      e.className='missing';
      e.textContent='No activity excerpts match these filters.';
      box.append(e);
    }else{
      rows.forEach(d=>box.append(activityCard(d)));
    }
  }

  $('centerSelect').onchange=e=>setCenter(e.target.value);
  ['centerCatFilter','centerLeadFilter','centerDirectFilter','centerOtherFilter'].forEach(id=>$(id).onchange=renderCenterActivities);
  $('centerSearch').oninput=renderCenterActivities;

  function tagCell(values,cls){
    const td=document.createElement('td');
    const wrap=document.createElement('div');
    wrap.className='tags';
    if(values.length){
      values.forEach(t=>wrap.append(tagEl(t,cls)));
    }else{
      const empty=document.createElement('span');
      empty.className='roleEmpty';
      empty.textContent='Not coded';
      wrap.append(empty);
    }
    td.append(wrap);
    return td;
  }

  function renderBrowse(){
    const q=$('browseSearch').value.toLowerCase();
    const c=$('browseCenter').value;
    const y=$('browseYear').value;
    const cat=$('browseCat').value;
    const lead=$('browseLead').value;
    const direct=$('browseDirect').value;
    const other=$('browseOther').value;

    const rr=activityRows.filter(d=>(!c||d['Regional Center']===c)
      &&(!y||d['Source Year']===y)
      &&(!cat||catTags(d).includes(cat))
      &&(!lead||leadTags(d).includes(lead))
      &&(!direct||directTags(d).includes(direct))
      &&(!other||otherTags(d).includes(other))
      &&(!q||Object.values(d).join(' ').toLowerCase().includes(q)));

    const tb=$('browseBody');
    tb.textContent='';
    rr.forEach(d=>{
      const tr=document.createElement('tr');
      tr.className='click';
      tr.onclick=()=>{
        setCenter(d['Regional Center']);
        show('explore');
        window.scrollTo({top:$('exploreMode').offsetTop-10,behavior:'smooth'});
      };

      const td1=document.createElement('td'); td1.textContent=d['Regional Center'];
      const td2=document.createElement('td'); td2.textContent=d['Source Year'];
      const td3=tagCell(catTags(d),'tag');
      const td4=tagCell(leadTags(d),'leadTag');
      const td5=tagCell(directTags(d),'directTag');
      const td6=tagCell(otherTags(d),'otherTag');
      const td7=document.createElement('td'); td7.className='quoteCell'; td7.textContent=d['Specific Quote / Activity'];
      const td8=document.createElement('td');
      const meta=document.createElement('div'); meta.className='meta'; meta.textContent=d['Source Title'];
      td8.append(meta,sourceLink(d,'Open source ↗'));
      tr.append(td1,td2,td3,td4,td5,td6,td7,td8);
      tb.append(tr);
    });
    $('browseCount').textContent='Showing '+rr.length+' of '+activityRows.length+' activity excerpts.';
  }

  ['browseCenter','browseYear','browseCat','browseLead','browseDirect','browseOther'].forEach(id=>$(id).onchange=renderBrowse);
  $('browseSearch').oninput=renderBrowse;

  function renderCompare(){
    const chips=$('compareChips');
    chips.textContent='';
    compare.forEach(name=>{
      const c=document.createElement('span');
      c.className='chip';
      c.textContent=name;
      const b=document.createElement('button');
      b.textContent='×';
      b.disabled=compare.length<=2;
      b.style.opacity=compare.length<=2?'.35':'1';
      b.onclick=()=>{
        if(compare.length<=2)return;
        compare=compare.filter(x=>x!==name);
        renderCompare();
      };
      c.append(b);
      chips.append(c);
    });

    const y=$('compareYear').value;
    const cat=$('compareCat').value;
    const lead=$('compareLead').value;
    const direct=$('compareDirect').value;
    const other=$('compareOther').value;
    const grid=$('compareGrid');
    grid.textContent='';

    compare.forEach(name=>{
      const col=document.createElement('div');
      col.className='compareCol';
      const rr=activityRows.filter(d=>d['Regional Center']===name
        &&(!y||d['Source Year']===y)
        &&(!cat||catTags(d).includes(cat))
        &&(!lead||leadTags(d).includes(lead))
        &&(!direct||directTags(d).includes(direct))
        &&(!other||otherTags(d).includes(other)));

      const h=document.createElement('h3');
      h.textContent=name+' · '+rr.length+' matches';
      const items=document.createElement('div');
      items.className='compareItems';
      if(!rr.length){
        const e=document.createElement('div');
        e.className='missing';
        e.textContent='No matching activities.';
        items.append(e);
      }else{
        rr.forEach(d=>items.append(activityCard(d,true)));
      }
      col.append(h,items);
      grid.append(col);
    });
  }

  $('addCompare').onclick=()=>{
    const v=$('compareAdd').value;
    if(v&&!compare.includes(v)){
      compare.push(v);
      renderCompare();
    }
  };
  ['compareYear','compareCat','compareLead','compareDirect','compareOther'].forEach(id=>$(id).onchange=renderCompare);

  function show(mode){
    $('exploreMode').classList.toggle('hidden',mode!=='explore');
    $('browseMode').classList.toggle('active',mode==='browse');
    $('compareMode').classList.toggle('active',mode==='compare');
    $('exploreBtn').classList.toggle('active',mode==='explore');
    $('browseBtn').classList.toggle('active',mode==='browse');
    $('compareBtn').classList.toggle('active',mode==='compare');
    if(mode==='browse')renderBrowse();
    if(mode==='compare')renderCompare();
  }

  $('exploreBtn').onclick=()=>show('explore');
  $('browseBtn').onclick=()=>show('browse');
  $('compareBtn').onclick=()=>show('compare');

  setCenter(current);
  renderBrowse();
  renderCompare();
}

async function boot(){
  setDataStatus('loading','Loading the Regional Center public data feed.');
  try{
    const raw=await loadPublishedRows();
    validateRequiredColumns(raw);
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
