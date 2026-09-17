(() => {
  'use strict';
  const embedded = new URLSearchParams(window.location.search).get('embed') === '1';
  if (embedded) document.documentElement.classList.add('embedded');
  const fuelLabels = {pb95:'Pb 95',pb98:'Pb 98',diesel:'Dyzelinas',lpg:'Dujos'};
  const lithuaniaBounds = [[53.85,20.90],[56.45,26.85]];
  const state = {data:null,history:{days:[]},market:null,checkedAt:null,fuel:'pb95',section:'prices',page:1,perPage:15,lat:null,lng:null,accuracy:null,map:null,tileLayer:null,tileFailures:0,usingFallbackTiles:false,markers:null,userLayers:null,markerByStationId:new Map(),mapResizeObserver:null,mapResizeFrame:null,focusLocation:false,focusStationId:null,selectedStationId:null,fitResults:false};
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const euro = value => value == null ? '—' : Number(value).toFixed(3).replace('.',',')+' €';
  const integer = value => new Intl.NumberFormat('lt-LT').format(value || 0);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const value = selector => $(selector).value.trim();
  const hasCoordinates = station => station?.latitude!=null&&station?.longitude!=null&&Number.isFinite(Number(station.latitude))&&Number.isFinite(Number(station.longitude));
  const mapsSearchUrl = station => {
    const query=[station?.name||station?.brand,station?.address,station?.city,station?.municipality,'Lietuva'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  };
  const priceValue = (station,fuel=state.fuel) => {
    const raw=station?.prices?.[fuel];
    return raw==null||raw===''||!Number.isFinite(Number(raw))?null:Number(raw);
  };
  const declaresFuel = (station,fuel=state.fuel) => priceValue(station,fuel)!=null||(Array.isArray(station?.unavailable_fuels)&&station.unavailable_fuels.includes(fuel));
  const localTime = timestamp => {
    const date=new Date(timestamp);
    return Number.isNaN(date.getTime())?String(timestamp||'—'):new Intl.DateTimeFormat('lt-LT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Vilnius'}).format(date);
  };
  const calendarDate = timestamp => {
    const date=new Date(timestamp);
    return Number.isNaN(date.getTime())?String(timestamp||'—'):new Intl.DateTimeFormat('lt-LT',{year:'numeric',month:'long',day:'numeric',timeZone:'Europe/Vilnius'}).format(date);
  };
  const shortDate = timestamp => {
    const date=new Date(timestamp);
    return Number.isNaN(date.getTime())?String(timestamp||'—'):new Intl.DateTimeFormat('lt-LT',{month:'short',day:'numeric',timeZone:'Europe/Vilnius'}).format(date);
  };
  function priceStatus(station,fuel=state.fuel){
    const price=priceValue(station,fuel);
    if(price==null)return {kind:'missing',label:'Nauja kaina nepateikta'};
    const timestamp=station?.price_updated_at?.[fuel];
    if(!timestamp)return {kind:'current',label:''};
    const date=new Date(timestamp);
    if(Number.isNaN(date.getTime()))return {kind:'current',label:''};
    const stale=Date.now()-date.getTime()>36*60*60*1000;
    return {kind:stale?'stale':'current',label:`${stale?'Senesnė kaina':'Atnaujinta'} · ${localTime(timestamp)}`};
  }
  function priceMarkup(station){
    const price=priceValue(station),status=priceStatus(station);
    if(price==null)return `<strong class="price is-missing">Kaina nepateikta</strong><span class="price-note is-missing">${status.label}</span>`;
    return `<strong class="price${status.kind==='stale'?' is-stale':''}">${euro(price)}</strong><span class="price-note${status.kind==='stale'?' is-stale':''}">${status.label||'už litrą'}</span>`;
  }
  function comparePrices(a,b,direction=1){const left=priceValue(a),right=priceValue(b);if(left==null&&right==null)return a.brand.localeCompare(b.brand,'lt');if(left==null)return 1;if(right==null)return -1;return (left-right)*direction;}

  function distance(aLat,aLng,bLat,bLng){const r=6371,dLat=(bLat-aLat)*Math.PI/180,dLng=(bLng-aLng)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLng/2)**2;return r*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));}
  function fuelStations(){
    if(!state.data)return [];
    const query=value('[data-search]').toLocaleLowerCase('lt');
    return state.data.stations.filter(s => declaresFuel(s))
      .filter(s => !value('[data-city]') || cityKey([s.city,s.municipality].filter(Boolean).join(' ')).includes(cityKey(value('[data-city]'))))
      .filter(s => !value('[data-brand]') || s.brand===value('[data-brand]'))
      .filter(s => !query || [s.name,s.brand,s.address,s.city,s.municipality].join(' ').toLocaleLowerCase('lt').includes(query))
      .map(s => ({...s,distance_km:state.lat!=null&&hasCoordinates(s)?distance(state.lat,state.lng,Number(s.latitude),Number(s.longitude)):null}))
      .sort((a,b) => {const mode=value('[data-sort]');if(mode==='price-desc')return comparePrices(a,b,-1);if(mode==='name')return a.brand.localeCompare(b.brand,'lt');if(mode==='distance')return ((a.distance_km??Infinity)-(b.distance_km??Infinity))||comparePrices(a,b);return comparePrices(a,b);});
  }
  function options(selector,items,first){const node=$(selector);if(!node)return;node.innerHTML=`<option value="">${first}</option>`+[...items].sort((a,b)=>a.localeCompare(b,'lt')).map(item=>`<option>${escapeHtml(item)}</option>`).join('');}
  function syncMapFilters(){$('[data-map-city]').value=value('[data-city]');$('[data-map-brand]').value=value('[data-brand]');}
  function setSection(section,{scroll=true,updateHash=true}={}){
    if(!['prices','stations','map','rankings'].includes(section))section='prices';
    state.section=section;
    $$('[data-app-section]').forEach(node=>{const active=node.dataset.appSection===section;node.hidden=!active;node.classList.toggle('is-active',active);});
    $$('[data-section-target]').forEach(button=>{const active=button.dataset.sectionTarget===section;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');});
    if(updateHash)history.replaceState(null,'',`#${{prices:'kainos',stations:'degalines',map:'zemelapis',rankings:'reitingai'}[section]}`);
    if(scroll)window.scrollTo({top:0,behavior:'smooth'});
    if(section==='map')requestAnimationFrame(()=>renderMap(fuelStations()));
    scheduleHeight();
  }
  function renderSource(){
    const s=state.data.source,node=$('[data-source]'),timestamp=state.checkedAt||s.generated_at,sourceTimestamp=s.source_updated_at||s.source_date;
    node.classList.remove('demo','warning','stale');
    if(state.data.demo){node.classList.add('demo');node.lastChild.textContent=' Demonstraciniai duomenys';showNotice('Rodoma demonstracinė duomenų kopija.','info');return;}
    node.lastChild.textContent=` Kainų duomenys: ${localTime(sourceTimestamp)} · patikrinta ${localTime(timestamp)}`;
  }
  function renderTabs(){const fuels=state.data.summary.fuels.filter(f=>fuelLabels[f]);if(!fuels.includes(state.fuel))state.fuel=fuels[0];const buttons=fuels.map(f=>`<button type="button" class="${f===state.fuel?'active':''}" data-fuel="${f}"><span>${fuelLabels[f]}</span><small>${integer(state.data.stations.filter(s=>s.prices?.[f]!=null).length)} su kaina</small></button>`).join('');$$('[data-fuels],[data-map-fuels],[data-station-fuels],[data-ranking-fuels]').forEach(node=>node.innerHTML=buttons);$('[data-summary-fuel]').textContent=fuelLabels[state.fuel];$$('[data-fuel]').forEach(b=>b.onclick=()=>{state.fuel=b.dataset.fuel;state.page=1;renderAll();});}
  function renderActiveFilters(rows){
    const node=$('[data-active-filters]');
    if(!node)return;
    const chips=[`<span class="filter-result"><b>${integer(rows.length)}</b> rezultatų</span>`,`<span class="filter-result is-fuel">${escapeHtml(fuelLabels[state.fuel])}</span>`];
    if(value('[data-city]'))chips.push(`<button type="button" data-clear-filter="city">${escapeHtml(value('[data-city]'))}<span aria-hidden="true">×</span></button>`);
    if(value('[data-brand]'))chips.push(`<button type="button" data-clear-filter="brand">${escapeHtml(value('[data-brand]'))}<span aria-hidden="true">×</span></button>`);
    if(value('[data-search]'))chips.push(`<button type="button" data-clear-filter="search">„${escapeHtml(value('[data-search]'))}“<span aria-hidden="true">×</span></button>`);
    if(value('[data-sort]')==='distance'&&state.lat!=null)chips.push('<span class="filter-result is-location">Rikiuojama pagal atstumą</span>');
    node.innerHTML=chips.join('');
    $$('[data-clear-filter]').forEach(button=>button.onclick=()=>{
      const key=button.dataset.clearFilter;
      if(key==='city')$('[data-city]').value='';
      if(key==='brand')$('[data-brand]').value='';
      if(key==='search')$('[data-search]').value='';
      state.page=1;renderAll();
    });
  }
  function renderSummary(rows){const prices=rows.map(s=>priceValue(s)).filter(price=>price!=null);$('[data-average]').textContent=euro(prices.length?prices.reduce((a,b)=>a+b,0)/prices.length:null);$('[data-minimum]').textContent=euro(prices.length?Math.min(...prices):null);$('[data-count]').textContent=integer(rows.length);}
  function renderTop(rows){const nearby=value('[data-sort]')==='distance'&&state.lat!=null,priced=rows.filter(s=>priceValue(s)!=null);$('[data-top-kicker]').textContent=nearby?'Iš degalinių su patikrinta vieta':'Pigiausi pagal pasirinktus filtrus';$('[data-top-title]').textContent=nearby?'Artimiausios degalinės':'Degalinių TOP 3';$('[data-top-fuel]').textContent=fuelLabels[state.fuel];$('[data-top]').innerHTML=priced.slice(0,3).map((s,i)=>`<button class="top-card" type="button" data-top-station-id="${escapeHtml(String(s.id))}"><span class="rank">${i+1}</span><span class="station-copy"><strong>${escapeHtml(s.brand)}</strong><small>${escapeHtml(s.address)}${s.city?', '+escapeHtml(s.city):''}${s.distance_km!=null?' · '+s.distance_km.toFixed(1)+' km':''}</small></span><span class="price">${euro(priceValue(s))}</span></button>`).join('')||'<p class="empty">Pagal pasirinktus filtrus pateiktų kainų nerasta.</p>';$$('[data-top-station-id]').forEach(button=>button.onclick=()=>selectStation(button.dataset.topStationId));}
  const cityKey = city => String(city||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('lt').replace(/[^a-z0-9]/g,'');
  const lithuanianLetterCount = city => (String(city||'').match(/[ąčęėįšųūž]/gi)||[]).length;
  function canonicalCities(stations){
    const cities=new Map();
    stations.map(station=>station.city).filter(Boolean).forEach(city=>{
      const key=cityKey(city),current=cities.get(key);
      if(!current||lithuanianLetterCount(city)>lithuanianLetterCount(current))cities.set(key,city);
    });
    return new Set(cities.values());
  }
  function renderCityRanking(){
    const cities=['Vilnius','Kaunas','Klaipėda','Šiauliai','Panevėžys','Alytus','Marijampolė'];
    const cards=cities.map(city=>{
      const candidates=state.data.stations.filter(s=>cityKey(s.city)===cityKey(city)&&priceValue(s)!=null).sort(comparePrices);
      const station=candidates[0];
      return station?`<button class="city-card" type="button" data-ranking-city="${escapeHtml(city)}"><span>${escapeHtml(city)}</span><strong>${euro(priceValue(station))}<small>/l</small></strong><b>${escapeHtml(station.brand)}</b><small>${escapeHtml(station.address)}</small><i>Visos degalinės →</i></button>`:`<article class="city-card is-empty"><span>${escapeHtml(city)}</span><strong>—</strong><small>Kaina nepateikta</small></article>`;
    });
    $$('[data-city-ranking]').forEach(node=>node.innerHTML=cards.join(''));
    $$('[data-ranking-city]').forEach(button=>button.onclick=()=>{const city=button.dataset.rankingCity;$('[data-city]').value=city;$('[data-home-city]').value=city;state.page=1;renderAll();setSection('stations');});
  }
  function hydrateCurrentHistory(){
    if(!state.history||!Array.isArray(state.history.days))state.history={schema_version:2,stations:{},days:[]};
    if(!state.history.stations)state.history.stations={};
    const fuels={};
    const stationPrices={};
    state.data.stations.forEach(station=>{
      const id=String(station.id);
      state.history.stations[id]={brand:station.brand||'',address:station.address||'',city:station.city||'',municipality:station.municipality||''};
      const prices={};
      Object.entries(station.prices||{}).forEach(([fuel,raw])=>{const price=Number(raw);if(Number.isFinite(price))prices[fuel]=price;});
      if(Object.keys(prices).length)stationPrices[id]=prices;
    });
    state.data.summary.fuels.forEach(fuel=>{
      const priced=state.data.stations.filter(station=>priceValue(station,fuel)!=null).sort((a,b)=>priceValue(a,fuel)-priceValue(b,fuel));
      if(!priced.length)return;
      const prices=priced.map(station=>priceValue(station,fuel));
      fuels[fuel]={minimum:Math.min(...prices),average:prices.reduce((sum,price)=>sum+price,0)/prices.length,maximum:Math.max(...prices),station_count:prices.length,winner:{id:priced[0].id,brand:priced[0].brand,address:priced[0].address,city:priced[0].city,price:prices[0]}};
    });
    const date=state.data.source.source_date;
    const day={date,fuels,station_prices:stationPrices};
    const existing=state.history.days.findIndex(item=>item?.date===date);
    if(existing>=0)state.history.days[existing]=day;else state.history.days.push(day);
    state.history.days.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  }
  function updateHistoryStationOptions(){
    const select=$('[data-history-station]');
    if(!select||!state.data)return;
    const selected=select.value;
    const municipality=value('[data-history-municipality]');
    const brand=value('[data-history-brand]');
    const stations=state.data.stations
      .filter(station=>!municipality||station.municipality===municipality)
      .filter(station=>!brand||station.brand===brand)
      .sort((a,b)=>`${a.brand} ${a.city} ${a.address}`.localeCompare(`${b.brand} ${b.city} ${b.address}`,'lt'));
    select.innerHTML='<option value="">Visos degalinės</option>'+stations.map(station=>`<option value="${escapeHtml(String(station.id))}">${escapeHtml(station.brand)} — ${escapeHtml(station.city||station.municipality||station.address)}</option>`).join('');
    select.value=stations.some(station=>String(station.id)===selected)?selected:'';
  }
  function historyDayStats(day,{municipality,brand,stationId}){
    const scoped=Boolean(municipality||brand||stationId);
    if(!scoped){
      const aggregate=day?.fuels?.[state.fuel];
      if(!aggregate)return null;
      return {minimum:Number(aggregate.minimum),average:Number(aggregate.average),maximum:aggregate.maximum==null?null:Number(aggregate.maximum),count:Number(aggregate.station_count)||0};
    }
    const catalog=state.history?.stations||{};
    const prices=[];
    Object.entries(day?.station_prices||{}).forEach(([id,stationPrices])=>{
      const station=catalog[id]||{};
      if(stationId&&id!==stationId)return;
      if(municipality&&station.municipality!==municipality)return;
      if(brand&&station.brand!==brand)return;
      const price=Number(stationPrices?.[state.fuel]);
      if(Number.isFinite(price))prices.push(price);
    });
    return prices.length?{minimum:Math.min(...prices),average:prices.reduce((sum,price)=>sum+price,0)/prices.length,maximum:Math.max(...prices),count:prices.length}:null;
  }
  function renderHistory(){
    const period=value('[data-history-period]');
    const filters={municipality:value('[data-history-municipality]'),brand:value('[data-history-brand]'),stationId:value('[data-history-station]')};
    const scoped=Boolean(filters.municipality||filters.brand||filters.stationId);
    const available=(state.history?.days||[]).filter(day=>day?.fuels?.[state.fuel]);
    const selectedDays=period==='all'?available:available.slice(-Number(period||30));
    const points=selectedDays.map(day=>({date:day.date,...historyDayStats(day,filters)})).filter(point=>Number.isFinite(point.minimum)&&Number.isFinite(point.average));
    $('[data-history-fuel]').textContent=fuelLabels[state.fuel];
    $('[data-history-chart-title]').textContent=`${fuelLabels[state.fuel]} kainų tendencija`;
    const scopeParts=[filters.municipality,filters.brand];
    if(filters.stationId){const station=state.history?.stations?.[filters.stationId];scopeParts.push(station?`${station.brand}, ${station.address}`:'Pasirinkta degalinė');}
    const missingDetailed=Math.max(0,selectedDays.length-points.length);
    $('[data-history-scope]').textContent=points.length
      ?`${scopeParts.filter(Boolean).join(' · ')||'Visa Lietuva'} · rodoma ${points.length} d. istorija${scoped&&missingDetailed?`. Detalūs filtrai dar kaupiami; ${missingDetailed} ankstesnių d. neturi degalinių pjūvio.`:''}`
      :'Pagal šiuos filtrus istorinių duomenų dar nėra. Nauji detalūs pjūviai kaupiami su kiekvienu atnaujinimu.';
    const minima=points.map(point=>point.minimum),averages=points.map(point=>point.average),maxima=points.map(point=>point.maximum).filter(item=>item!=null&&Number.isFinite(Number(item))).map(Number);
    const maximumNote=maxima.length>1?'Aukščiausia per pasirinktą laikotarpį':'Šios reikšmės istorija dar kaupiama';
    const summaries=[['Mažiausia kaina',minima.length?Math.min(...minima):null,'Žemiausia per pasirinktą laikotarpį'],['Vidutinė kaina',averages.length?averages.reduce((sum,price)=>sum+price,0)/averages.length:null,'Dienų vidurkių reikšmė'],['Didžiausia kaina',maxima.length?Math.max(...maxima):null,maximumNote]];
    $('[data-history-summary]').innerHTML=summaries.map(([label,price,note])=>`<article><span>${label}</span><strong>${euro(price)}<small>/l</small></strong><p>${note}</p></article>`).join('');
    if(points.length<2){$('[data-history-legend]').innerHTML='<small>Grafiko linijos atsiras sukaupus bent 2 dienų duomenis pagal pasirinktus filtrus.</small>';$('[data-trend-chart]').innerHTML='<span class="trend-empty">Grafikui reikia bent dviejų dienų duomenų.</span>';$('[data-trend-summary]').textContent=`Sukaupta ${points.length} d. istorija`;return;}
    const metric=(point,key)=>point[key]==null?null:Number(point[key]);
    const chartValues=points.flatMap(point=>['minimum','average','maximum'].map(key=>metric(point,key))).filter(Number.isFinite);
    const lower=Math.min(...chartValues),upper=Math.max(...chartValues),range=upper-lower||0.01;
    const seriesSegments=key=>{
      const segments=[];let current=[];
      points.forEach((point,index)=>{const price=metric(point,key);if(Number.isFinite(price)){current.push(`${(index/(points.length-1))*100},${88-((price-lower)/range)*70}`);}else if(current.length){segments.push(current);current=[];}});
      if(current.length)segments.push(current);
      return segments.filter(segment=>segment.length>1);
    };
    const series=[['minimum','Mažiausia'],['average','Vidutinė'],['maximum','Didžiausia']]
      .map(([key,label])=>({key,label,segments:seriesSegments(key)}))
      .filter(item=>item.segments.length);
    $('[data-history-legend]').innerHTML=series.map(item=>`<span><i class="${item.key==='average'?'avg':item.key==='maximum'?'max':'min'}"></i>${item.label}</span>`).join('')+(maxima.length<2?'<small>Didžiausios kainos linija atsiras sukaupus bent 2 dienas.</small>':'');
    const polylines=series.flatMap(item=>item.segments.map(segment=>`<polyline class="line-${item.key}" points="${segment.join(' ')}" vector-effect="non-scaling-stroke"/>`)).join('');
    $('[data-trend-chart]').innerHTML=`<svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Mažiausios, vidutinės ir didžiausios kainos tendencija"><line class="chart-grid" x1="0" x2="100" y1="18" y2="18"/><line class="chart-grid" x1="0" x2="100" y1="53" y2="53"/><line class="chart-grid" x1="0" x2="100" y1="88" y2="88"/>${polylines}</svg><span class="chart-date first">${escapeHtml(shortDate(points[0].date))}</span><span class="chart-date last">${escapeHtml(shortDate(points.at(-1).date))}</span><span class="chart-value high">${euro(upper)}</span><span class="chart-value low">${euro(lower)}</span>`;
    const change=points.at(-1).average-points[0].average;
    $('[data-trend-summary]').textContent=`Vidutinė kaina ${change===0?'nepasikeitė':`${change>0?'pakilo':'nukrito'} ${Math.abs(change).toFixed(3).replace('.',',')} €`} · ${points.length} d.`;
  }
  function simpleSparkline(points,className,label){
    const usable=(Array.isArray(points)?points:[]).filter(point=>Number.isFinite(Number(point?.value))).slice(-30);
    if(usable.length<2)return '<div class="market-chart-empty">Tendencijai dar trūksta duomenų.</div>';
    const values=usable.map(point=>Number(point.value)),minimum=Math.min(...values),maximum=Math.max(...values),range=maximum-minimum||1;
    const coords=usable.map((point,index)=>`${(index/(usable.length-1))*100},${88-((Number(point.value)-minimum)/range)*70}`).join(' ');
    const change=Number(usable.at(-1).value)-Number(usable[0].value);
    const unit=className==='brent-line'?' $':' €';
    return `<div class="market-chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)}"><line class="market-grid" x1="0" x2="100" y1="18" y2="18"/><line class="market-grid" x1="0" x2="100" y1="88" y2="88"/><polyline class="${className}" points="${coords}" vector-effect="non-scaling-stroke"/></svg><span class="market-date first">${escapeHtml(shortDate(usable[0].date))}</span><span class="market-date last">${escapeHtml(shortDate(usable.at(-1).date))}</span><span class="market-value high">${maximum.toFixed(className==='brent-line'?2:3).replace('.',',')}${unit}</span><span class="market-value low">${minimum.toFixed(className==='brent-line'?2:3).replace('.',',')}${unit}</span></div><p class="market-change">Per rodomą laikotarpį ${change===0?'nepasikeitė':`${change>0?'pakilo':'nukrito'} ${Math.abs(change).toFixed(className==='brent-line'?2:3).replace('.',',')}${unit}`}.</p>`;
  }
  function renderMarketContext(){
    const section=$('[data-market-context]');
    if(!section)return;
    const market=state.market;
    if(!market?.orlen&&!market?.brent){section.hidden=true;return;}
    section.hidden=false;
    const retailPrices=state.data.stations.map(station=>priceValue(station)).filter(price=>price!=null);
    const retailAverage=retailPrices.length?retailPrices.reduce((sum,price)=>sum+price,0)/retailPrices.length:null;
    const orlenFuel=state.fuel==='pb95'?'pb95':state.fuel==='diesel'?'diesel':null;
    const orlenSeries=orlenFuel?market?.orlen?.series?.[orlenFuel]||[]:[];
    const orlenLatest=orlenSeries.at(-1)||null;
    const brentSeries=market?.brent?.series||[];
    const brentLatest=brentSeries.at(-1)||null;
    $('[data-market-fuel]').textContent=fuelLabels[state.fuel];
    $('[data-market-cards]').innerHTML=`<article><span>Degalinių vidurkis</span><strong>${euro(retailAverage)}<small>/l</small></strong><p>${escapeHtml(fuelLabels[state.fuel])} · naujausi LEA duomenys</p></article><article><span>ORLEN orientyras</span><strong>${orlenLatest?euro(orlenLatest.value):'—'}${orlenLatest?'<small>/l</small>':''}</strong><p>${orlenLatest?`${escapeHtml(fuelLabels[state.fuel])} · ${escapeHtml(calendarDate(orlenLatest.date))}`:'Skelbiama A95 ir dyzelinui'}</p></article><article><span>Brent nafta</span><strong>${brentLatest?Number(brentLatest.value).toFixed(2).replace('.',',')+' $':'—'}${brentLatest?'<small>/bbl</small>':''}</strong><p>${brentLatest?escapeHtml(calendarDate(brentLatest.date)):'Duomenų nėra'}</p></article>`;
    const trendCards=[];
    if(orlenLatest)trendCards.push(`<article><header><div><span>ORLEN Lietuva</span><strong>${escapeHtml(fuelLabels[state.fuel])} didmeninės kainos orientyras</strong></div><b>${euro(orlenLatest.value)}/l</b></header>${simpleSparkline(orlenSeries,'orlen-line','ORLEN kainos tendencija')}<a href="${escapeHtml(market.orlen.source_url)}" target="_blank" rel="noopener noreferrer external">Oficialus ORLEN šaltinis ↗</a></article>`);
    trendCards.push(`<article><header><div><span>Tarptautinė rinka</span><strong>Brent žalios naftos kaina</strong></div><b>${brentLatest?Number(brentLatest.value).toFixed(2).replace('.',',')+' $/bbl':'—'}</b></header>${simpleSparkline(brentSeries,'brent-line','Brent kainos tendencija')}<a href="${escapeHtml(market?.brent?.source_url||'https://www.eia.gov/dnav/pet/hist/RBRTED.htm')}" target="_blank" rel="noopener noreferrer external">EIA oficialus šaltinis ↗</a></article>`);
    $('[data-market-trends]').innerHTML=trendCards.join('');
  }
  function storedAlert(){try{return JSON.parse(localStorage.getItem('kuras-price-alert')||'null');}catch(_){return null;}}
  function renderAlert(rows){const alert=storedAlert(),status=$('[data-alert-status]');if(!alert){status.hidden=true;return;}const prices=rows.filter(s=>alert.fuel===state.fuel).map(s=>priceValue(s)).filter(v=>v!=null);const minimum=prices.length?Math.min(...prices):null;status.hidden=false;status.className=`alert-status${minimum!=null&&minimum<=alert.price?' reached':''}`;status.textContent=minimum!=null&&minimum<=alert.price?`Tikslas pasiektas: ${fuelLabels[alert.fuel]} mažiausia kaina dabar ${euro(minimum)}.`:`Perspėjimas aktyvus: ${fuelLabels[alert.fuel]} iki ${euro(alert.price)}.`;}
  function renderTable(rows){
    const pages=Math.max(1,Math.ceil(rows.length/state.perPage));
    state.page=Math.min(state.page,pages);
    const shown=rows.slice((state.page-1)*state.perPage,state.page*state.perPage);
    const pricedCount=rows.filter(s=>priceValue(s)!=null).length;
    $('[data-results-count]').textContent=`Rasta ${integer(rows.length)} · kainą pateikė ${integer(pricedCount)}`;
    $('[data-page]').textContent=`${state.page} iš ${pages}`;
    $('[data-prev]').disabled=state.page<=1;
    $('[data-next]').disabled=state.page>=pages;
    $('[data-table]').innerHTML=shown.map(s=>{
      const id=String(s.id);
      const selected=id===state.selectedStationId;
      const mapped=hasCoordinates(s);
      const label=mapped?`Rodyti degalinę ${s.name||s.brand} žemėlapyje`:`Ieškoti degalinės ${s.name||s.brand} žemėlapyje pagal adresą`;
      const mapStatus=mapped?'':`<span class="map-status">Vieta tikslinama · atidaryti pagal adresą <span aria-hidden="true">↗</span></span>`;
      return `<tr class="station-row${selected?' is-selected':''}${mapped?'':' needs-map'}" data-station-id="${escapeHtml(id)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}" aria-pressed="${selected?'true':'false'}"><td><span class="station-name">${escapeHtml(s.name||s.brand)}</span><span class="brand">${escapeHtml(s.brand)}</span></td><td><span class="address">${escapeHtml(s.address)}<br>${escapeHtml(s.city||s.municipality||'')}${s.distance_km!=null?' · '+s.distance_km.toFixed(1)+' km':''}</span>${mapStatus}</td><td>${priceMarkup(s)}</td></tr>`;
    }).join('')||'<tr><td colspan="3" class="empty">Pagal pasirinktus filtrus degalinių nerasta.</td></tr>';
    $$('[data-table] [data-station-id]').forEach(row=>{
      const select=()=>selectStation(row.dataset.stationId);
      row.onclick=select;
      row.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select();}};
    });
  }
  function syncMap(resetToLithuania=false,redrawTiles=false){if(!state.map)return;if(state.mapResizeFrame)cancelAnimationFrame(state.mapResizeFrame);state.mapResizeFrame=requestAnimationFrame(()=>{state.map.invalidateSize({animate:false,pan:false});if(resetToLithuania&&state.lat==null)state.map.fitBounds(lithuaniaBounds,{padding:[12,12]});if(redrawTiles&&state.tileLayer)state.tileLayer.redraw();});}
  function addTileLayer(url){const layer=L.tileLayer(url,{minZoom:6,maxZoom:18,keepBuffer:3,updateWhenIdle:false,crossOrigin:true,attribution:'© OpenStreetMap contributors'});layer.on('tileerror',()=>{state.tileFailures++;if(state.tileFailures<3||state.usingFallbackTiles)return;state.usingFallbackTiles=true;state.tileFailures=0;state.map.removeLayer(layer);state.tileLayer=addTileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png');setTimeout(()=>syncMap(true,true),80);});layer.addTo(state.map);return layer;}
  function initMap(){if(state.map||!window.L)return;const node=$('[data-map]');if(!node||node.offsetWidth===0||node.offsetHeight===0)return;state.map=L.map(node,{minZoom:6,preferCanvas:true}).setView([55.17,23.88],7);state.tileLayer=addTileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png');state.markers=L.layerGroup().addTo(state.map);state.userLayers=L.layerGroup().addTo(state.map);if('ResizeObserver' in window){state.mapResizeObserver=new ResizeObserver(()=>syncMap(state.lat==null));state.mapResizeObserver.observe(node);}window.addEventListener('resize',()=>syncMap(state.lat==null));syncMap(true);[150,500,1200].forEach((delay,index)=>setTimeout(()=>syncMap(true,index===2),delay));}
  function stationFuelRows(s,{compact=false}={}){
    const fuels=['pb95','diesel','lpg'].filter(fuel=>state.data?.summary?.fuels?.includes(fuel));
    return fuels.map(fuel=>{
      const price=priceValue(s,fuel),status=priceStatus(s,fuel),active=fuel===state.fuel;
      return `<div class="station-fuel-row${active?' is-selected':''}"><span>${escapeHtml(fuelLabels[fuel])}${active&&!compact?'<small>Pasirinkta</small>':''}</span><strong class="${price==null?'is-missing':status.kind==='stale'?'is-stale':''}">${price==null?'Nepateikta':euro(price)}</strong>${compact?'':`<em>${escapeHtml(status.label||'Kaina už litrą')}</em>`}</div>`;
    }).join('');
  }
  function tooltipHtml(s){return `<article class="station-tooltip"><strong>${escapeHtml(s.brand)}</strong><span>${escapeHtml(s.city||s.municipality||'')}</span><div>${stationFuelRows(s,{compact:true})}</div><small>Paspauskite išsamiai</small></article>`;}
  function popupHtml(s){
    const address=String(s.address||'');
    const city=s.city&&!address.toLocaleLowerCase('lt').includes(String(s.city).toLocaleLowerCase('lt'))?`<span>${escapeHtml(s.city)}</span>`:'';
    const distance=s.distance_km!=null?`<span class="station-popup-distance">${s.distance_km.toFixed(1)} km nuo jūsų</span>`:'';
    const route=`https://www.google.com/maps/dir/?api=1&destination=${Number(s.latitude)},${Number(s.longitude)}`;
    return `<article class="station-popup"><span class="station-popup-label">Degalų kainos</span><strong class="station-popup-name">${escapeHtml(s.brand)}</strong><p>${escapeHtml(address)}${city}</p><div class="station-popup-prices">${stationFuelRows(s)}</div><div class="station-popup-actions">${distance}<a href="${route}" target="_blank" rel="noopener">Maršrutas <span aria-hidden="true">↗</span></a></div></article>`;
  }
  function renderMap(rows){
    initMap();
    if(!state.map)return;
    state.markers.clearLayers();
    state.userLayers.clearLayers();
    state.markerByStationId.clear();
    const mapped=rows.filter(hasCoordinates),pricedMapped=mapped.filter(s=>priceValue(s)!=null);
    const mapPrices=pricedMapped.map(s=>priceValue(s));
    const mapAverage=mapPrices.length?mapPrices.reduce((sum,price)=>sum+price,0)/mapPrices.length:null;
    const priceBand=station=>{const price=priceValue(station);if(price==null||mapAverage==null)return 'unavailable';if(price<=mapAverage-.02)return 'cheap';if(price>=mapAverage+.02)return 'expensive';return 'average';};
    const emphasized=new Set((state.lat!=null?pricedMapped.slice(0,10):[...pricedMapped].sort(comparePrices).slice(0,12)).map(s=>String(s.id)));
    mapped.forEach(s=>{
      const id=String(s.id);
      const selected=id===state.selectedStationId;
      const popup=popupHtml(s);
      const popupOptions={minWidth:285,maxWidth:320,offset:[0,-5],autoPanPaddingTopLeft:[58,20],autoPanPaddingBottomRight:[20,20]};
      let marker;
      if(emphasized.has(id)||selected){
        const missing=priceValue(s)==null,markerClass=selected?'selected':priceBand(s);
        marker=L.marker([Number(s.latitude),Number(s.longitude)],{icon:L.divIcon({className:'price-marker',html:`<span class="marker ${markerClass}">${missing?'Nepateikė':euro(priceValue(s))}</span>`,iconSize:[missing?88:76,30],iconAnchor:[missing?44:38,15]})}).bindPopup(popup,popupOptions).addTo(state.markers);
      }else{
        const colors={cheap:'#20ad58',average:'#e6ad00',expensive:'#df4848',unavailable:'#8b969e'};
        marker=L.circleMarker([Number(s.latitude),Number(s.longitude)],{radius:8,color:'#fff',weight:2.5,fillColor:colors[priceBand(s)],fillOpacity:.96}).bindPopup(popup,popupOptions).addTo(state.markers);
      }
      if(window.matchMedia?.('(hover: hover) and (pointer: fine)').matches){
        marker.bindTooltip(tooltipHtml(s),{direction:'top',offset:[0,-10],opacity:1,sticky:true,className:'station-map-tooltip'});
        marker.on('popupopen',()=>marker.closeTooltip());
      }
      state.markerByStationId.set(id,marker);
    });
    if(state.lat!=null){
      if(state.accuracy)L.circle([state.lat,state.lng],{radius:Math.min(state.accuracy,2000),color:'#326f94',weight:1,fillColor:'#326f94',fillOpacity:.08,interactive:false}).addTo(state.userLayers);
      L.circleMarker([state.lat,state.lng],{radius:9,color:'#fff',weight:3,fillColor:'#326f94',fillOpacity:1}).bindTooltip('Jūsų vieta',{permanent:true,direction:'top',offset:[0,-10]}).addTo(state.userLayers);
    }
    const topMapped=[...pricedMapped].sort(state.lat!=null?(a,b)=>(a.distance_km??Infinity)-(b.distance_km??Infinity):comparePrices).slice(0,5);
    $('[data-map-top]').innerHTML=topMapped.map((station,index)=>`<li><button type="button" data-map-station-id="${escapeHtml(String(station.id))}"><span>${index+1}. ${escapeHtml(station.brand)}</span><b>${euro(priceValue(station))}</b><small>${escapeHtml(station.city||station.address)}${station.distance_km!=null?' · '+station.distance_km.toFixed(1)+' km':''}</small></button></li>`).join('')||'<li class="empty">Degalinių nerasta.</li>';
    $$('[data-map-station-id]').forEach(button=>button.onclick=()=>selectStation(button.dataset.mapStationId));
    const selected=mapped.find(s=>String(s.id)===state.selectedStationId);
    $('[data-map-note]').textContent=!mapped.length?'Pasirinktų degalinių vietos žemėlapyje dar tikslinamos.':selected?`Pasirinkta: ${selected.name||selected.brand}, ${selected.address}.`:state.lat!=null?'Žemėlapis surikiuotas pagal atstumą nuo jūsų vietos.':'Rodomos filtro kriterijus atitinkančios degalinės. Paspauskite žymeklį kainoms ir maršrutui.';
    setTimeout(()=>{
      syncMap(false);
      if(state.focusStationId){
        const station=mapped.find(s=>String(s.id)===state.focusStationId);
        const marker=state.markerByStationId.get(state.focusStationId);
        if(station&&marker){
          state.map.setView([Number(station.latitude),Number(station.longitude)],14);
          marker.openPopup();
        }
        state.focusStationId=null;
      }else if(state.focusLocation&&state.lat!=null){
        state.map.setView([state.lat,state.lng],11);
        state.focusLocation=false;
      }else if(state.fitResults&&mapped.length){
        state.map.fitBounds(L.latLngBounds(mapped.map(s=>[s.latitude,s.longitude])),{padding:[26,26],maxZoom:12});
        state.fitResults=false;
      }
    },50);
  }
  function showMapView(){setSection('map');}
  function selectStation(id){
    const station=state.data?.stations.find(item=>String(item.id)===String(id));
    if(!station)return;
    if(!hasCoordinates(station)){
      window.open(mapsSearchUrl(station),'_blank','noopener,noreferrer');
      showNotice('Tiksli šios degalinės vieta dar tikslinama. Atidarėme žemėlapio paiešką pagal pateiktą adresą.','info');
      return;
    }
    state.selectedStationId=String(id);
    state.focusStationId=String(id);
    showMapView();
    const rows=fuelStations();
    renderTable(rows);
    requestAnimationFrame(()=>renderMap(rows));
  }
  function renderAll(){renderTabs();syncMapFilters();const rows=fuelStations();if(state.selectedStationId&&!rows.some(s=>String(s.id)===state.selectedStationId)){state.selectedStationId=null;state.focusStationId=null;}renderActiveFilters(rows);renderSummary(rows);renderTop(rows);renderCityRanking();renderHistory();renderMarketContext();renderAlert(rows);renderTable(rows);renderMap(rows);}
  function setLocationButtons({disabled=false,text='Naudoti mano vietą',ready=false,title=''}){$$('[data-locate]').forEach(button=>{button.disabled=disabled;button.textContent=text;button.title=title;button.classList.toggle('is-ready',ready);});}
  function showNotice(message,type='error'){const notice=$('[data-notice]');notice.hidden=false;notice.className=`notice${type==='info'?' info':''}`;notice.textContent=message;}
  function geolocationMessage(error){if(error?.code===1)return 'Vietos leidimas nesuteiktas. Telefono arba naršyklės nustatymuose leiskite šiam puslapiui naudoti vietą.';if(error?.code===2)return 'Įrenginiui nepavyko nustatyti vietos. Patikrinkite, ar telefone įjungta vietos nustatymo funkcija.';if(error?.code===3)return 'Vietos nustatymas užtruko per ilgai. Pabandykite dar kartą vietoje, kur geresnis GPS signalas.';return 'Vietos nustatyti nepavyko. Pabandykite dar kartą.';}
  function locate(targetSection='stations'){const coordinateCount=state.data?.stations.filter(hasCoordinates).length||0;if(!coordinateCount){showNotice('Artimiausių degalinių skaičiavimas bus įjungtas, kai prie adresų bus prijungtos patikrintos koordinatės.','info');return;}if(!navigator.geolocation){showNotice('Ši naršyklė nepalaiko vietos nustatymo. Galite toliau ieškoti pagal miestą ar adresą.');return;}setLocationButtons({disabled:true,text:'Nustatoma vieta…'});navigator.geolocation.getCurrentPosition(p=>{state.lat=p.coords.latitude;state.lng=p.coords.longitude;state.accuracy=p.coords.accuracy;state.focusLocation=true;$('[data-sort] option[value="distance"]').disabled=false;$('[data-sort]').value='distance';state.page=1;$('[data-notice]').hidden=true;renderAll();setSection(targetSection);setLocationButtons({text:'Vieta nustatyta · atnaujinti',ready:true,title:'Paspauskite dar kartą vietai atnaujinti'});},error=>{setLocationButtons({text:'Bandykite dar kartą'});showNotice(geolocationMessage(error));},{enableHighAccuracy:true,timeout:12000,maximumAge:300000});}
  async function start(){
    try{
      const stamp=Date.now();
      const statusPromise=fetch(`data/status.json?t=${stamp}`,{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null);
      const historyPromise=fetch(`data/history.json?t=${stamp}`,{cache:'no-store'}).then(response=>response.ok?response.json():{days:[]}).catch(()=>({days:[]}));
      const marketPromise=fetch(`data/market.json?t=${stamp}`,{cache:'no-store'}).then(response=>response.ok?response.json():null).catch(()=>null);
      if(window.__KURAS_DATA){state.data=window.__KURAS_DATA;}else{const response=await fetch('data/current.json',{cache:'no-store'});if(!response.ok)throw new Error();state.data=await response.json();}
      const [status,history,market]=await Promise.all([statusPromise,historyPromise,marketPromise]);
      state.checkedAt=status?.checked_at||null;state.history=history||{days:[]};state.market=market;
      hydrateCurrentHistory();
      const cities=canonicalCities(state.data.stations),brands=new Set(state.data.stations.map(s=>s.brand).filter(Boolean)),municipalities=new Set(state.data.stations.map(s=>s.municipality).filter(Boolean));
      const priority=['Vilnius','Kaunas','Klaipėda','Šiauliai','Panevėžys','Alytus','Marijampolė'];
      $('[data-city-options]').innerHTML=[...cities].sort((a,b)=>{const ai=priority.findIndex(city=>cityKey(city)===cityKey(a)),bi=priority.findIndex(city=>cityKey(city)===cityKey(b));if(ai>=0||bi>=0)return (ai<0?99:ai)-(bi<0?99:bi);return a.localeCompare(b,'lt');}).map(city=>`<option value="${escapeHtml(city)}"></option>`).join('');
      $('[data-city-shortcuts]').innerHTML=priority.filter(city=>[...cities].some(item=>cityKey(item)===cityKey(city))).map(city=>`<button type="button" data-city-shortcut="${escapeHtml(city)}">${escapeHtml(city)}</button>`).join('');
      $$('[data-city-shortcut]').forEach(button=>button.onclick=()=>{$('[data-home-city]').value=button.dataset.cityShortcut;applyHomeCity();});
      options('[data-brand]',brands,'Visi tinklai');options('[data-map-brand]',brands,'Visi tinklai');options('[data-history-brand]',brands,'Visi tinklai');options('[data-history-municipality]',municipalities,'Visos savivaldybės');updateHistoryStationOptions();
      $('[data-alert-fuel]').innerHTML=state.data.summary.fuels.filter(f=>fuelLabels[f]).map(f=>`<option value="${f}">${fuelLabels[f]}</option>`).join('');
      const existingAlert=storedAlert();if(existingAlert){$('[data-alert-fuel]').value=existingAlert.fuel;$('[data-alert-price]').value=Number(existingAlert.price).toFixed(3);}
      const coordinateCount=state.data.stations.filter(hasCoordinates).length;
      $('[data-coordinate-coverage]').textContent=coordinateCount?'Vietą naudojame tik artimiausioms degalinėms parodyti ir jos neišsaugome.':'Artimiausių degalinių paieška šiuo metu ruošiama.';
      renderSource();renderAll();
      const initial={kainos:'prices',degalines:'stations',zemelapis:'map',reitingai:'rankings'}[location.hash.slice(1)]||'prices';
      setSection(initial,{scroll:false,updateHash:false});
      if(!coordinateCount)setLocationButtons({disabled:true,text:'Artimiausios – ruošiama',title:'Laukiama patikrintų degalinių koordinačių'});
    }catch(_){showNotice('Kainų failo gauti nepavyko. Automatinis atnaujinimas išsaugojo paskutinę gerą versiją.');}
  }
  function applyHomeCity(){const city=value('[data-home-city]');$('[data-city]').value=city;state.page=1;renderAll();setSection('stations');}
  function publishHeight(){
    if(!embedded||window.parent===window)return;
    const lastBlock=$('.data-note');
    const height=lastBlock?lastBlock.getBoundingClientRect().bottom+window.scrollY:document.body.getBoundingClientRect().height;
    window.parent.postMessage({type:'kuras-pricer:height',height:Math.ceil(height)},'*');
  }
  function scheduleHeight(){publishHeight();requestAnimationFrame(publishHeight);window.setTimeout(publishHeight,180);}
  if(embedded){if('ResizeObserver' in window)new ResizeObserver(publishHeight).observe(document.body);window.addEventListener('load',scheduleHeight);}
  const applyStationFilters=()=>{state.page=1;state.fitResults=state.section==='map'&&state.lat==null;renderAll();};
  let filterTimer=null;
  $('[data-filters]').onsubmit=e=>{e.preventDefault();applyStationFilters();};
  $$('[data-search],[data-city]').forEach(input=>input.addEventListener('input',()=>{window.clearTimeout(filterTimer);filterTimer=window.setTimeout(applyStationFilters,180);}));
  $$('[data-brand],[data-sort]').forEach(select=>select.addEventListener('change',applyStationFilters));
  $('[data-alert-form]').onsubmit=e=>{e.preventDefault();const fuel=$('[data-alert-fuel]').value,price=Number(String($('[data-alert-price]').value).replace(',','.'));if(!fuel||!Number.isFinite(price)||price<.5||price>4){showNotice('Įveskite tikslinę kainą nuo 0,500 iki 4,000 €/l.');return;}localStorage.setItem('kuras-price-alert',JSON.stringify({fuel,price}));state.fuel=fuel;state.page=1;renderAll();};
  $('[data-map-city]').oninput=e=>{window.clearTimeout(filterTimer);filterTimer=window.setTimeout(()=>{$('[data-city]').value=e.target.value;state.page=1;state.fitResults=true;renderAll();},180);};
  $('[data-map-brand]').onchange=e=>{$('[data-brand]').value=e.target.value;state.page=1;state.fitResults=true;renderAll();};
  $$('[data-history-municipality],[data-history-brand]').forEach(select=>select.addEventListener('change',()=>{updateHistoryStationOptions();renderHistory();scheduleHeight();}));
  $$('[data-history-period],[data-history-station]').forEach(select=>select.addEventListener('change',()=>{renderHistory();scheduleHeight();}));
  $('[data-history-clear]').onclick=()=>{$('[data-history-municipality]').value='';$('[data-history-brand]').value='';$('[data-history-station]').value='';updateHistoryStationOptions();renderHistory();};
  $('[data-prev]').onclick=()=>{state.page--;renderTable(fuelStations());};$('[data-next]').onclick=()=>{state.page++;renderTable(fuelStations());};$$('[data-locate]').forEach(button=>button.onclick=()=>locate(button.dataset.locateView||'stations'));$$('[data-section-target]').forEach(button=>button.onclick=()=>setSection(button.dataset.sectionTarget));$$('[data-open-section]').forEach(button=>button.onclick=()=>setSection(button.dataset.openSection));$('[data-home-city-submit]').onclick=applyHomeCity;$('[data-home-city]').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();applyHomeCity();}};start();
})();
