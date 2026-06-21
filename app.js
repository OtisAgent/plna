
/* ---------- demo data ---------- */
var JOBS=[
  {ref:"HAF-4821",cust:"Brindley Components",from:"Wolverhampton",to:"Leicester",veh:"Small Van",miles:62,status:"new",price:118,driver:"—"},
  {ref:"HAF-4820",cust:"Severn Print Ltd",from:"Telford",to:"Birmingham",veh:"SWB Van",miles:33,status:"prog",price:74,driver:"D. Okafor"},
  {ref:"HAF-4818",cust:"Cole & Sons",from:"Cannock",to:"Manchester",veh:"LWB Van",miles:88,status:"prog",price:171,driver:"R. Singh"},
  {ref:"HAF-4815",cust:"NorthFix Trade",from:"Stafford",to:"Sheffield",veh:"Luton",miles:74,status:"hold",price:159,driver:"—"},
  {ref:"HAF-4811",cust:"Brindley Components",from:"Wolverhampton",to:"Coventry",veh:"Small Van",miles:41,status:"done",price:86,driver:"D. Okafor"}
];
var BADGE={new:["b-new","New"],prog:["b-prog","In progress"],done:["b-done","Delivered"],hold:["b-hold","On hold"]};

var ROLES=[
  {key:"admin",ic:"🛠️",rn:"Admin",rd:"Command centre",name:"Brent Ford",
    nav:["Dashboard","Jobs","Pricing engine","Drivers","Reports"]},
  {key:"dispatch",ic:"🧭",rn:"Dispatcher",rd:"Allocate & quote",name:"Dispatch desk",
    nav:["Dashboard","Jobs","Pricing engine"]},
  {key:"driver",ic:"🚚",rn:"Driver",rd:"Plan your day",name:"D. Okafor",
    nav:["My day","My jobs","Daily calculator"]},
  {key:"customer",ic:"📦",rn:"Customer",rd:"Quote & track",name:"Brindley Components",
    nav:["Get a quote","My deliveries"]}
];

/* ---------- landing ---------- */
var roleRow=document.getElementById('roleRow');
ROLES.forEach(function(r){
  var d=document.createElement('div');d.className='role-card';
  d.innerHTML='<div class="ic">'+r.ic+'</div><div class="rn">'+r.rn+'</div><div class="rd">'+r.rd+'</div>';
  d.onclick=function(){signIn(r);};
  roleRow.appendChild(d);
});

var current=null;
function signIn(r){
  current=r;
  document.getElementById('landing').classList.add('hidden');
  document.getElementById('app').classList.add('show');
  document.getElementById('whoName').textContent=r.name;
  document.getElementById('whoRole').textContent=r.rn;
  var nav=document.getElementById('nav');nav.innerHTML='';
  r.nav.forEach(function(item,i){
    var a=document.createElement('a');a.textContent=item;
    if(i===0)a.classList.add('active');
    a.onclick=function(){
      [].forEach.call(nav.children,function(c){c.classList.remove('active');});
      a.classList.add('active');render(item);
    };
    nav.appendChild(a);
  });
  render(r.nav[0]);
}
document.getElementById('logout').onclick=function(){
  current=null;
  document.getElementById('app').classList.remove('show');
  document.getElementById('landing').classList.remove('hidden');
};

/* ---------- views ---------- */
function render(page){
  document.getElementById('pageTitle').textContent=page;
  var v=document.getElementById('view');
  if(page==="Pricing engine"||page==="Get a quote"||page==="Daily calculator"){v.innerHTML=pricingView();wirePricing();return;}
  if(page==="Jobs"||page==="My jobs"||page==="My deliveries"){v.innerHTML=jobsView();return;}
  if(page==="Drivers"){v.innerHTML=driversView();return;}
  if(page==="Reports"){v.innerHTML=reportsView();return;}
  v.innerHTML=dashView();
}

function statCards(){
  var open=JOBS.filter(function(j){return j.status!=="done";}).length;
  var rev=JOBS.reduce(function(a,j){return a+j.price;},0);
  return '<div class="cards">'+
    card("Open jobs",open,"+3 today")+
    card("Delivered (wk)","37","+12%")+
    card("Active drivers","9","2 idle")+
    card("Revenue (wk)","£"+rev*7,"+8%")+
  '</div>';
}
function card(k,v,s){return '<div class="stat"><div class="k">'+k+'</div><div class="v">'+v+' <small>'+s+'</small></div></div>';}

function jobsTable(rows){
  var t='<div class="panel"><h3>Live jobs</h3><table><thead><tr><th>Ref</th><th>Customer</th><th>Route</th><th>Vehicle</th><th>Miles</th><th>Driver</th><th>Price</th><th>Status</th></tr></thead><tbody>';
  rows.forEach(function(j){
    var b=BADGE[j.status];
    t+='<tr><td><b>'+j.ref+'</b></td><td>'+j.cust+'</td><td>'+j.from+' → '+j.to+'</td><td>'+j.veh+'</td><td>'+j.miles+'</td><td>'+j.driver+'</td><td>£'+j.price+'</td><td><span class="badge '+b[0]+'">'+b[1]+'</span></td></tr>';
  });
  return t+'</tbody></table></div>';
}

function dashView(){
  if(current.key==="driver"){
    return statCardsDriver()+jobsTable(JOBS.filter(function(j){return j.driver==="D. Okafor";}));
  }
  if(current.key==="customer"){
    return jobsTable(JOBS.filter(function(j){return j.cust==="Brindley Components";}));
  }
  return statCards()+jobsTable(JOBS);
}
function statCardsDriver(){
  return '<div class="cards">'+card("Jobs today","2","1 done")+card("Miles","103","planned")+card("Today's pay","£124","est.")+card("Rating","4.9","★")+'</div>';
}
function jobsView(){
  if(current.key==="driver")return jobsTable(JOBS.filter(function(j){return j.driver==="D. Okafor";}));
  if(current.key==="customer")return jobsTable(JOBS.filter(function(j){return j.cust==="Brindley Components";}));
  return jobsTable(JOBS);
}
function driversView(){
  var d=[["D. Okafor","SWB Van","On job","4.9","£124"],["R. Singh","LWB Van","On job","4.8","£171"],["A. Mensah","Luton","Idle","4.7","£0"],["P. Walsh","Small Van","Idle","5.0","£0"]];
  var t='<div class="panel"><h3>Drivers</h3><table><thead><tr><th>Name</th><th>Vehicle</th><th>Status</th><th>Rating</th><th>Today\'s pay</th></tr></thead><tbody>';
  d.forEach(function(r){t+='<tr><td><b>'+r[0]+'</b></td><td>'+r[1]+'</td><td>'+r[2]+'</td><td>'+r[3]+'</td><td>'+r[4]+'</td></tr>';});
  return t+'</tbody></table></div>';
}
function reportsView(){
  return '<div class="panel"><h3>This week</h3><p class="note">Placeholder reporting view — Cleverpay invoice-block export, revenue by customer and driver-pay summaries land here in Phase 2. Numbers shown across the prototype are illustrative.</p></div>'+statCards();
}

/* ---------- pricing engine ---------- */
function pricingView(){
  return '<div class="grid2"><div class="panel"><h3>Live pricing engine</h3>'+
    '<div class="row"><div><label>Pickup</label><input id="pk" value="Wolverhampton"></div>'+
    '<div><label>Drop-off</label><input id="dp" value="Leicester"></div></div>'+
    '<div class="row"><div><label>Vehicle</label><select id="veh">'+
      '<option value="1">Small Van</option><option value="1.18" selected>SWB Van</option>'+
      '<option value="1.4">LWB Van</option><option value="1.75">Luton</option></select></div>'+
    '<div><label>Urgency</label><select id="urg"><option value="1">Standard</option>'+
      '<option value="1.25">Same day</option><option value="1.6">Express / direct</option></select></div></div>'+
    '<label>Distance: <span id="mlbl">62</span> miles</label>'+
    '<input type="range" id="ml" min="3" max="220" value="62">'+
    '<div class="note">Live preview — pricing model: £15 base + per-mile rate × vehicle × urgency. Driver share illustrative at 72%. Final rates set in the HAF KNECT pricing matrix.</div>'+
  '</div>'+
  '<div><div class="quote"><div class="lbl">Customer price</div><div class="big" id="qprice">£—</div>'+
    '<div class="line"><span>Base</span><span id="qbase">£15.00</span></div>'+
    '<div class="line"><span>Mileage</span><span id="qmiles">£—</span></div>'+
    '<div class="line"><span>Vehicle / urgency</span><span id="qmult">×—</span></div>'+
    '<div class="drv" id="drvBox"><b>Driver pay:</b> <span id="qdriver">£—</span> <span style="opacity:.8">(72%)</span></div>'+
  '</div>'+
  '<div class="dash-toggle"><button id="tShow" class="on">Show driver pay</button><button id="tHide">Customer only</button></div>'+
  '</div></div>';
}
function wirePricing(){
  var ml=document.getElementById('ml'),mlbl=document.getElementById('mlbl');
  function calc(){
    var miles=+ml.value;mlbl.textContent=miles;
    var vm=+document.getElementById('veh').value, um=+document.getElementById('urg').value;
    var base=15, perMile=1.35;
    var mileCost=miles*perMile;
    var total=(base+mileCost)*vm*um;
    document.getElementById('qmiles').textContent='£'+mileCost.toFixed(2);
    document.getElementById('qmult').textContent='×'+(vm*um).toFixed(2);
    document.getElementById('qprice').textContent='£'+total.toFixed(2);
    document.getElementById('qdriver').textContent='£'+(total*0.72).toFixed(2);
  }
  ['ml','veh','urg'].forEach(function(id){document.getElementById(id).addEventListener('input',calc);});
  document.getElementById('tShow').onclick=function(){this.classList.add('on');document.getElementById('tHide').classList.remove('on');document.getElementById('drvBox').style.display='';};
  document.getElementById('tHide').onclick=function(){this.classList.add('on');document.getElementById('tShow').classList.remove('on');document.getElementById('drvBox').style.display='none';};
  calc();
}
