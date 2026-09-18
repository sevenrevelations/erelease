(function(root){
'use strict';
let lastInbound='';
function isAppInventor(){return !!(root.AppInventor&&typeof root.AppInventor.setWebViewString==='function');}
function encode(command,payload){return payload===undefined||payload===null||payload===''?String(command):String(command)+'|'+String(payload);}
function send(command,payload){const message=encode(command,payload);if(isAppInventor()){try{root.AppInventor.setWebViewString(message);return {sent:true,message};}catch(e){console.warn('App Inventor bridge failed',e);}}root.dispatchEvent(new CustomEvent('blobby:demo-command',{detail:{command,payload,message}}));return {sent:false,message};}
function parse(message){message=String(message||'');const i=message.indexOf('|');return i<0?{command:message,payload:''}:{command:message.slice(0,i),payload:message.slice(i+1)};}
function receive(message){const parsed=parse(message);root.dispatchEvent(new CustomEvent('blobby:appmessage',{detail:{...parsed,raw:String(message||'')}}));return parsed;}
root.blobbyReceiveFromApp=receive;
function poll(){if(root.AppInventor&&typeof root.AppInventor.getWebViewString==='function'){try{const value=root.AppInventor.getWebViewString();if(value&&value!==lastInbound){lastInbound=value;receive(value);}}catch{}}
 if(root.AppInventor)setTimeout(poll,450);
}
setTimeout(poll,450);
root.BlobbyBridge={isAppInventor,send,parse,receive};
})(window);
