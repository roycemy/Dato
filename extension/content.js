(function(){
'use strict';
if(window.top!==window||window.__datoLoaded)return;window.__datoLoaded=true;
var D=window.DatoDetect;
var defaults={secrets:'block',pii:'warn',financial:'warn',source:'warn',contract:'warn'};
var policies=Object.assign({},defaults);
var rank={allow:0,warn:1,redact:2,block:3};
var bypassUntil=0,bypassText='';
chrome.storage.local.get(defaults,function(x){policies=Object.assign({},defaults,x)});
chrome.storage.onChanged.addListener(function(changes,area){if(area!=='local')return;Object.keys(defaults).forEach(function(k){if(changes[k])policies[k]=changes[k].newValue})});
function editor(){
 var host=location.hostname;
 var selectors=host==='chatgpt.com'?['#prompt-textarea','textarea[data-id="root"]','div[contenteditable="true"][data-virtualkeyboard="true"]']:
 host==='claude.ai'?['div[contenteditable="true"].ProseMirror','div[contenteditable="true"]']:
 ['div[contenteditable="true"].ql-editor','rich-textarea div[contenteditable="true"]','textarea'];
 for(var i=0;i<selectors.length;i++){var e=document.querySelector(selectors[i]);if(e&&visible(e))return e}return null;
}
function visible(e){var r=e.getBoundingClientRect();return r.width>20&&r.height>10}
function textOf(e){return e?(e.tagName==='TEXTAREA'||e.tagName==='INPUT'?e.value:(e.innerText||e.textContent||'')):''}
function setText(e,text){e.focus();if(e.tagName==='TEXTAREA'||e.tagName==='INPUT'){var setter=Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set;setter.call(e,text);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))}else{e.textContent=text;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:text}))}}
function actionFor(findings){var a='allow';findings.forEach(function(f){var p=policies[f.category]||'warn';if(rank[p]>rank[a])a=p});return a}
function supportedSubmit(target){if(!target||!target.closest)return false;var b=target.closest('button');if(!b)return false;var host=location.hostname;var tests=host==='chatgpt.com'?['[data-testid="send-button"]','[aria-label*="Send"]']:
 host==='claude.ai'?['[aria-label*="Send"]','button[type="button"]']:
 ['button[aria-label*="Send"]','button.send-button'];return tests.some(function(s){try{return b.matches(s)}catch(e){return false}})&&!!editor()}
function attempt(e){var ed=editor();if(!ed)return;var text=textOf(ed).trim();if(!text)return;if(Date.now()<bypassUntil&&text===bypassText)return;var findings=D.scan(text).findings;if(!findings.length)return;var action=actionFor(findings);if(action==='allow')return;e.preventDefault();e.stopImmediatePropagation();show(action,findings,text,ed)}
document.addEventListener('click',function(e){if(supportedSubmit(e.target))attempt(e)},true);
document.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&editor()&&editor().contains(e.target))attempt(e)},true);
function resume(ed,text){bypassText=text;bypassUntil=Date.now()+1600;var host=location.hostname;var selectors=host==='chatgpt.com'?['[data-testid="send-button"]','button[aria-label*="Send"]']:host==='claude.ai'?['button[aria-label*="Send"]']:['button[aria-label*="Send"]','button.send-button'];for(var i=0;i<selectors.length;i++){var b=document.querySelector(selectors[i]);if(b&&!b.disabled&&visible(b)){b.click();return}}ed.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))}
function show(action,findings,text,ed){close();var wrap=document.createElement('div');wrap.className='dato-backdrop';wrap.id='dato-modal';var labels={block:['Blocked by policy','Remove the flagged data before sending.'],warn:['Confidential data detected','Review the findings before choosing to send.'],redact:['Redaction required','Dato can replace the detected values before sending.']};var rows=findings.slice(0,6).map(function(f){return '<div class="dato-finding"><b>'+esc(f.label)+'</b><code>'+esc(f.masked)+'</code></div>'}).join('');var more=findings.length>6?'<div class="dato-more">+'+(findings.length-6)+' more finding'+(findings.length-6===1?'':'s')+'</div>':'';var buttons='<button class="dato-btn" data-dato="cancel">Go back</button>';
 if(action==='warn')buttons+='<button class="dato-btn dato-btn-danger" data-dato="send">Send anyway</button>';
 if(action==='redact')buttons+='<button class="dato-btn dato-btn-primary" data-dato="redact">Redact &amp; send</button>';
 wrap.innerHTML='<div class="dato-dialog dato-'+action+'" role="dialog" aria-modal="true" aria-labelledby="dato-title"><div class="dato-head"><div class="dato-logo">D</div><div><strong id="dato-title">Dato stopped this prompt</strong><span>Local AI data-leak firewall</span></div></div><div class="dato-verdict"><b>'+labels[action][0]+'</b><div>'+labels[action][1]+'</div></div><div class="dato-findings">'+rows+more+'</div><div class="dato-local">Scanned on this device. Prompt content was not stored or transmitted by Dato.</div><div class="dato-actions">'+buttons+'</div></div>';
 document.body.appendChild(wrap);sentinel('alert',findings.length+' finding'+(findings.length===1?'':'s'));
 wrap.querySelector('[data-dato="cancel"]').addEventListener('click',close);
 var send=wrap.querySelector('[data-dato="send"]');if(send)send.addEventListener('click',function(){close();resume(ed,text)});
 var redact=wrap.querySelector('[data-dato="redact"]');if(redact)redact.addEventListener('click',function(){var safe=D.redact(text,findings);setText(ed,safe);close();setTimeout(function(){resume(ed,safe)},80)});
 wrap.addEventListener('click',function(x){if(x.target===wrap)close()});document.addEventListener('keydown',escapeOnce,true)
}
function escapeOnce(e){if(e.key==='Escape')close()}
function close(){var m=document.getElementById('dato-modal');if(m)m.remove();document.removeEventListener('keydown',escapeOnce,true);sentinel('', 'Protected locally')}
function sentinel(state,label){var s=document.getElementById('dato-sentinel');if(!s){s=document.createElement('div');s.id='dato-sentinel';s.innerHTML='<i></i><span></span>';document.documentElement.appendChild(s)}s.className=state==='alert'?'dato-alert':'';s.querySelector('span').textContent='Dato · '+label}
function esc(v){var d=document.createElement('div');d.textContent=v;return d.innerHTML}
sentinel('','Protected locally');
})();
