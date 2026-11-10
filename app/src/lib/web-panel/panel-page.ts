/**
 * The web panel's page: one document, one stylesheet and one script, served
 * by the app itself. The script only ever writes text with `textContent`, so
 * console output and player names can never become markup.
 */

export const PanelHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Minecraft panel</title>
<link rel="stylesheet" href="/panel.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header>
  <h1>Minecraft panel</h1>
  <label class="pick" id="pick" hidden>Server
    <select id="server"></select>
  </label>
  <button id="signout" type="button" hidden>Sign out</button>
</header>
<main id="main">
  <section id="pair" hidden aria-labelledby="pair-title">
    <h2 id="pair-title">Pair this device</h2>
    <p>Type the one-time code shown in Desktop Material. A code works once and for ten minutes.</p>
    <form id="pair-form">
      <label>Pairing code
        <input id="code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="9" required>
      </label>
      <label>Name for this device
        <input id="label" maxlength="60" placeholder="My phone">
      </label>
      <button type="submit">Pair</button>
    </form>
    <p id="pair-error" role="alert"></p>
  </section>
  <section id="panel" hidden>
    <nav aria-label="Pages">
      <button type="button" data-page="dashboard" aria-pressed="true">Dashboard</button>
      <button type="button" data-page="console" aria-pressed="false">Console</button>
      <button type="button" data-page="players" aria-pressed="false">Players</button>
      <button type="button" data-page="settings" aria-pressed="false">Settings</button>
      <button type="button" data-page="backups" aria-pressed="false">Backups</button>
      <button type="button" data-page="addons" aria-pressed="false">Plugins</button>
      <button type="button" data-page="activity" aria-pressed="false">Activity</button>
    </nav>
    <p id="notice" role="status"></p>
    <div id="page-dashboard" class="page">
      <h2>Dashboard</h2>
      <dl>
        <div><dt>Status</dt><dd id="status">Unknown</dd></div>
        <div><dt>Players online</dt><dd id="count">0</dd></div>
        <div><dt>Port</dt><dd id="port">-</dd></div>
        <div><dt>Memory</dt><dd id="memory">-</dd></div>
      </dl>
      <p id="message" role="alert"></p>
      <div class="actions">
        <button id="start" type="button">Start</button>
        <button id="stop" type="button">Stop</button>
      </div>
    </div>
    <div id="page-console" class="page" hidden>
      <h2>Console</h2>
      <pre id="console" role="log" aria-label="Server console" tabindex="0"></pre>
      <form id="command-form">
        <label>Console command
          <input id="command" maxlength="256" autocomplete="off" spellcheck="false">
        </label>
        <button type="submit">Send</button>
      </form>
    </div>
    <div id="page-players" class="page" hidden>
      <h2>Players</h2>
      <p id="players-empty">Nobody is online.</p>
      <ul id="players"></ul>
    </div>
    <div id="page-settings" class="page" hidden>
      <h2>Settings</h2>
      <p>These are written to server.properties. A running server reads them the next time it starts.</p>
      <form id="settings-form"></form>
    </div>
    <div id="page-backups" class="page" hidden>
      <h2>Backups</h2>
      <p>A backup is a copy of the world in the server's backups folder. The server must be stopped first.</p>
      <div class="actions"><button id="backup" type="button">Back up now</button></div>
      <p id="backups-empty">No backups yet.</p>
      <ul id="backups"></ul>
    </div>
    <div id="page-addons" class="page" hidden>
      <h2>Plugins and mods</h2>
      <p id="addons-empty">No plugin or mod files were found.</p>
      <ul id="addons"></ul>
    </div>
    <div id="page-activity" class="page" hidden>
      <h2>Activity</h2>
      <p>What paired devices did on this panel, newest first.</p>
      <ol id="activity"></ol>
    </div>
  </section>
</main>
<script src="/panel.js"></script>
</body>
</html>
`

export const PanelCss = `:root{color-scheme:light dark;--bg:#fbf8f2;--card:#fff;--ink:#1d1b20;--soft:#5b5866;--line:#d9d4e0;--accent:#3a6a4b;--on-accent:#fff;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#141218;--card:#211f26;--ink:#e6e0e9;--soft:#b9b3c4;--line:#49454f;--accent:#9dd4ab;--on-accent:#0b3820;--bad:#f2b8b5}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,sans-serif}
.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px;background:var(--card);padding:8px}
header{display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)}
h1{font-size:20px;margin:0;flex:1 1 auto}h2{font-size:18px;margin:0 0 8px}
main{max-width:920px;margin:0 auto;padding:16px}
section,.page{display:flex;flex-direction:column;gap:12px}
[hidden]{display:none!important}
nav{display:flex;flex-wrap:wrap;gap:8px}
button,select,input{font:inherit;min-height:44px;border-radius:22px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:0 16px}
input{border-radius:12px;width:100%}
button{cursor:pointer}
button[type=submit],#start,nav button[aria-pressed=true]{background:var(--accent);color:var(--on-accent);border-color:transparent}
button:disabled{opacity:.5;cursor:default}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
label{display:flex;flex-direction:column;gap:4px;font-size:14px;color:var(--soft)}
.pick{flex-direction:row;align-items:center;gap:8px}
form{display:flex;flex-direction:column;gap:12px;max-width:420px}
select{width:100%;border-radius:12px}.pick select{width:auto;border-radius:22px}
small{color:var(--soft);white-space:nowrap}
#command-form{flex-direction:row;align-items:flex-end;max-width:none}#command-form label{flex:1 1 auto}
dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:0}
dl div{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:12px 16px}
dt{font-size:13px;color:var(--soft)}dd{margin:0;font-size:20px}
.actions{display:flex;gap:8px;flex-wrap:wrap}
pre{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px;margin:0;height:50vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.4 ui-monospace,Consolas,monospace}
ul,ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}
li{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:8px 12px;display:flex;gap:12px;align-items:center;justify-content:space-between;overflow-wrap:anywhere}
[role=alert]:not(:empty){color:var(--bad)}[role=alert]:empty,#notice:empty{display:none}
@media (prefers-reduced-motion:no-preference){button{transition:background-color .15s,transform .1s}button:active:not(:disabled){transform:scale(.97)}}
`

export const PanelJs = `(function(){
'use strict';
var $=function(id){return document.getElementById(id)};
var selected=null,page='dashboard',position=0,consoleFor=null,busy=false,state=null;
function api(method,path,body){
  var init={method:method,credentials:'same-origin',headers:{'X-Panel-Request':'1'}};
  if(body!==undefined){init.headers['Content-Type']='application/json';init.body=JSON.stringify(body)}
  return fetch(path,init).then(function(r){
    return r.json().catch(function(){return {}}).then(function(j){return {status:r.status,body:j}})
  });
}
function show(paired){
  $('pair').hidden=paired;$('panel').hidden=!paired;$('signout').hidden=!paired;$('pick').hidden=!paired;
  if(!paired){$('code').focus()}
}
function notice(text){$('notice').textContent=text||''}
function current(){
  if(!state){return null}
  for(var i=0;i<state.servers.length;i++){if(state.servers[i].id===selected){return state.servers[i]}}
  return null;
}
function paint(){
  var select=$('server'),servers=state?state.servers:[];
  if(select.options.length!==servers.length||servers.some(function(s,i){return select.options[i].value!==s.id||select.options[i].textContent!==s.name})){
    select.textContent='';
    servers.forEach(function(s){var o=document.createElement('option');o.value=s.id;o.textContent=s.name;select.appendChild(o)});
  }
  if(!current()&&servers.length>0){selected=servers[0].id}
  if(selected){select.value=selected}
  var s=current();
  $('status').textContent=s?s.statusLabel:'No servers';
  $('count').textContent=s?String(s.players.length):'0';
  $('port').textContent=s?String(s.port):'-';
  $('memory').textContent=s?s.memoryMegabytes+' MB':'-';
  $('message').textContent=s&&s.message?s.message:(s&&!s.eulaAccepted?'Accept the Minecraft EULA in Desktop Material before this server can start.':'');
  $('start').disabled=!s||!s.eulaAccepted||(s.status!=='stopped'&&s.status!=='crashed');
  $('stop').disabled=!s||(s.status!=='running'&&s.status!=='starting');
  $('command').disabled=!s||s.status!=='running';
  var list=$('players');list.textContent='';
  (s?s.players:[]).forEach(function(name){
    var li=document.createElement('li'),span=document.createElement('span'),kick=document.createElement('button');
    span.textContent=name;kick.type='button';kick.textContent='Kick';
    kick.setAttribute('aria-label','Kick '+name);
    kick.addEventListener('click',function(){act('/api/kick',{id:selected,player:name})});
    li.appendChild(span);li.appendChild(kick);list.appendChild(li);
  });
  $('players-empty').hidden=!!s&&s.players.length>0;
  var log=$('activity');log.textContent='';
  (state?state.activity:[]).forEach(function(entry){
    var li=document.createElement('li');
    li.textContent=new Date(entry.at).toLocaleString()+' · '+entry.device+' · '+entry.what;
    log.appendChild(li);
  });
}
function refresh(){
  return api('GET','/api/state').then(function(r){
    if(r.status===401){state=null;show(false);return}
    if(r.status===200){state=r.body;show(true);paint()}
  }).catch(function(){notice('The panel cannot be reached right now.')});
}
function readConsole(){
  if(!selected||busy||page!=='console'){return}
  if(consoleFor!==selected){consoleFor=selected;position=0;$('console').textContent=''}
  busy=true;
  api('GET','/api/console?id='+encodeURIComponent(selected)+'&after='+position).then(function(r){
    if(r.status!==200||consoleFor!==selected){return}
    position=r.body.next;
    if(r.body.lines.length>0){
      var pre=$('console'),stick=pre.scrollTop+pre.clientHeight>=pre.scrollHeight-8;
      pre.appendChild(document.createTextNode(r.body.lines.join('\\n')+'\\n'));
      if(stick){pre.scrollTop=pre.scrollHeight}
    }
  }).catch(function(){}).then(function(){busy=false});
}
function row(parent,left,right){
  var li=document.createElement('li'),a=document.createElement('span'),b=document.createElement('small');
  a.textContent=left;b.textContent=right;li.appendChild(a);li.appendChild(b);parent.appendChild(li);
}
function size(bytes){return bytes<1048576?Math.max(1,Math.round(bytes/1024))+' KB':(bytes/1048576).toFixed(1)+' MB'}
function loadPage(){
  if(!selected){return}
  var id=encodeURIComponent(selected),want=selected;
  if(page==='settings'){
    api('GET','/api/config?id='+id).then(function(r){
      if(r.status!==200||want!==selected||page!=='settings'){return}
      var form=$('settings-form');form.textContent='';
      r.body.settings.forEach(function(s){
        var label=document.createElement('label'),input;
        label.appendChild(document.createTextNode(s.label));
        if(s.type.kind==='boolean'||s.type.kind==='choice'){
          input=document.createElement('select');
          (s.type.kind==='boolean'?['true','false']:s.type.choices).forEach(function(c){
            var o=document.createElement('option');o.value=c;
            o.textContent=s.type.kind==='boolean'?(c==='true'?'On':'Off'):c;input.appendChild(o);
          });
        }else{
          input=document.createElement('input');
          if(s.type.kind==='integer'){input.inputMode='numeric'}else{input.maxLength=s.type.maxLength}
        }
        input.value=s.value;
        input.addEventListener('change',function(){
          act('/api/config',{id:selected,key:s.key,value:input.value}).then(loadPage);
        });
        label.appendChild(input);form.appendChild(label);
      });
    }).catch(function(){});
  }
  if(page==='backups'){
    api('GET','/api/backups?id='+id).then(function(r){
      if(r.status!==200||want!==selected){return}
      var list=$('backups');list.textContent='';
      r.body.backups.forEach(function(b){row(list,b.name,new Date(b.createdAt).toLocaleString())});
      $('backups-empty').hidden=r.body.backups.length>0;
    }).catch(function(){});
  }
  if(page==='addons'){
    api('GET','/api/addons?id='+id).then(function(r){
      if(r.status!==200||want!==selected){return}
      var list=$('addons');list.textContent='';
      r.body.addOns.forEach(function(a){row(list,a.name,(a.kind==='mod'?'Mod':'Plugin')+' · '+size(a.bytes))});
      $('addons-empty').hidden=r.body.addOns.length>0;
    }).catch(function(){});
  }
}
function act(path,body){
  notice('');
  return api('POST',path,body).then(function(r){
    if(r.status===401){show(false);return}
    if(r.status!==200){notice(r.body.error||'That did not work.')}
    return refresh();
  }).catch(function(){notice('The panel cannot be reached right now.')});
}
$('pair-form').addEventListener('submit',function(e){
  e.preventDefault();$('pair-error').textContent='';
  api('POST','/api/pair',{code:$('code').value,label:$('label').value}).then(function(r){
    if(r.status===200){$('code').value='';refresh()}
    else{$('pair-error').textContent=r.body.error||'That code did not work.'}
  }).catch(function(){$('pair-error').textContent='The panel cannot be reached right now.'});
});
$('signout').addEventListener('click',function(){api('POST','/api/signout',{}).then(function(){state=null;show(false)})});
$('server').addEventListener('change',function(e){selected=e.target.value;paint();readConsole();loadPage()});
$('backup').addEventListener('click',function(){$('backup').disabled=true;act('/api/backup',{id:selected}).then(function(){$('backup').disabled=false;loadPage()})});
$('settings-form').addEventListener('submit',function(e){e.preventDefault()});
$('start').addEventListener('click',function(){act('/api/start',{id:selected})});
$('stop').addEventListener('click',function(){act('/api/stop',{id:selected})});
$('command-form').addEventListener('submit',function(e){
  e.preventDefault();var input=$('command');if(!input.value.trim()){return}
  var command=input.value;input.value='';
  act('/api/command',{id:selected,command:command}).then(readConsole);
});
Array.prototype.forEach.call(document.querySelectorAll('nav button'),function(button){
  button.addEventListener('click',function(){
    page=button.getAttribute('data-page');
    Array.prototype.forEach.call(document.querySelectorAll('nav button'),function(b){b.setAttribute('aria-pressed',String(b===button))});
    Array.prototype.forEach.call(document.querySelectorAll('.page'),function(p){p.hidden=p.id!=='page-'+page});
    readConsole();loadPage();
  });
});
refresh();
setInterval(refresh,3000);
setInterval(readConsole,1000);
})();
`
