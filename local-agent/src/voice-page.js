// Browser-based voice UI: Web Speech API for listening + speaking. No extra dependencies.
// NOTE: client JS below deliberately avoids backticks and ${} so it can live in a String.raw template.
export const voicePageHtml = String.raw`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Agent Voice</title>
<style>
 body{font-family:system-ui,sans-serif;max-width:640px;margin:1.5rem auto;padding:0 1rem;color:#222}
 button{padding:.6rem 1rem;border-radius:8px;border:1px solid #888;background:#f4f4f4;cursor:pointer;font-size:1rem}
 button.on{background:#d33;color:#fff;border-color:#d33} input,select{padding:.5rem;font-size:1rem}
 #log{border:1px solid #ddd;border-radius:8px;padding:.5rem;height:300px;overflow:auto;margin:1rem 0;font-size:.95rem}
 .u{color:#06c}.a{color:#070}.s{color:#888;font-style:italic} #status{font-weight:600}
 .row{display:flex;gap:.5rem;margin:.5rem 0;flex-wrap:wrap}
</style></head><body>
<h1>Agent Voice</h1>
<div class="row"><input id="token" type="password" placeholder="AGENT_TOKEN" style="flex:1">
<select id="lang"><option>en-IN</option><option>en-US</option><option>en-GB</option><option>hi-IN</option></select></div>
<div class="row"><button id="mic">Start listening</button><button id="stop">Stop / interrupt</button><span id="status">idle</span></div>
<div id="log"></div>
<div class="row"><input id="typed" placeholder="...or type a command" style="flex:1"><button id="send">Send</button></div>
<h3>Pending approvals</h3><div id="approvals" class="s">none</div>
<p class="s">Say "open Chrome", or any instruction. Say "stop" / "cancel" to interrupt. Speech recognition runs through your browser vendor's service (Chrome/Edge); use a Chromium browser.</p>
<script>
var $=function(i){return document.getElementById(i)};
var token=$('token'),logEl=$('log'),statusEl=$('status'),micBtn=$('mic');
token.value=sessionStorage.getItem('agentToken')||'';
token.onchange=function(){sessionStorage.setItem('agentToken',token.value)};
var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
var listening=false,speaking=false,busy=false,ctrl=null,rec=null;
var STOP=/^(stop|cancel|quiet|be quiet|shut up|never ?mind|interrupt)\b/i;

function log(cls,text){var d=document.createElement('div');d.className=cls;d.textContent=text;logEl.appendChild(d);logEl.scrollTop=logEl.scrollHeight}
function setStatus(){statusEl.textContent=busy?'working...':speaking?'speaking...':listening?'listening...':'idle'}
function headers(){return {'Authorization':'Bearer '+token.value,'Content-Type':'application/json'}}

function speak(text){
  if(!window.speechSynthesis||!text)return;
  var u=new SpeechSynthesisUtterance(String(text).slice(0,500));u.lang=$('lang').value;
  u.onstart=function(){speaking=true;setStatus()};
  u.onend=u.onerror=function(){speaking=false;setStatus()};
  speechSynthesis.speak(u);
}
function interrupt(){
  if(window.speechSynthesis)speechSynthesis.cancel();
  if(ctrl)ctrl.abort();
  speaking=false;busy=false;setStatus();log('s','Interrupted.');
}
async function send(text){
  if(busy){log('s','Busy - say "stop" first.');return}
  log('u',text);busy=true;setStatus();ctrl=new AbortController();
  try{
    var r=await fetch('/voice/command',{method:'POST',headers:headers(),body:JSON.stringify({text:text}),signal:ctrl.signal});
    var j=await r.json();
    var reply=r.ok?j.reply:('Error: '+j.error);
    log('a',reply);speak(reply);
  }catch(e){if(e.name!=='AbortError'){log('a','Error: '+e.message)}}
  finally{busy=false;ctrl=null;setStatus();loadApprovals()}
}
function handle(text){
  text=text.trim();if(!text)return;
  if(STOP.test(text)){interrupt();return}
  if(speaking){log('s','(ignored while speaking: '+text+')');return}
  send(text);
}
async function loadApprovals(){
  try{
    var r=await fetch('/approvals',{headers:headers()});var j=await r.json();var box=$('approvals');box.textContent='';
    if(!j.pending||!j.pending.length){box.textContent='none';return}
    j.pending.forEach(function(p){
      var row=document.createElement('div');row.className='row';
      var code=document.createElement('code');code.textContent=p.command;row.appendChild(code);
      ['approve','deny'].forEach(function(act){
        var b=document.createElement('button');b.textContent=act;
        b.onclick=async function(){
          var rr=await fetch('/approvals/'+p.id+'/'+act,{method:'POST',headers:headers()});var jj=await rr.json();
          log('a',act+': '+(jj.stdout||jj.status||jj.error||''));loadApprovals();
        };row.appendChild(b);
      });
      box.appendChild(row);
    });
  }catch(e){}
}
if(!SR){micBtn.disabled=true;log('s','Speech recognition is not supported here. Use Chrome or Edge, or type commands below.')}
else{
  rec=new SR();rec.continuous=true;rec.interimResults=false;
  rec.onresult=function(ev){for(var i=ev.resultIndex;i<ev.results.length;i++){if(ev.results[i].isFinal)handle(ev.results[i][0].transcript)}};
  rec.onend=function(){if(listening){try{rec.start()}catch(e){}}};
  rec.onerror=function(e){if(e.error==='not-allowed'){listening=false;micBtn.classList.remove('on');micBtn.textContent='Start listening';log('s','Microphone permission denied.')}};
  micBtn.onclick=function(){
    listening=!listening;micBtn.classList.toggle('on',listening);micBtn.textContent=listening?'Stop listening':'Start listening';
    if(listening){rec.lang=$('lang').value;try{rec.start()}catch(e){}}else{rec.stop()}setStatus();
  };
}
$('stop').onclick=interrupt;
$('send').onclick=function(){var t=$('typed').value;$('typed').value='';handle(t)};
$('typed').onkeydown=function(e){if(e.key==='Enter')$('send').click()};
loadApprovals();setStatus();
</script></body></html>`;
