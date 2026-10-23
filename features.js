'use strict';
(() => {
  const VERSION='performance-ui-20261023-hotfix2-contrast';
  const manifest={
    chat:{file:'chat.js',css:'chat.css',global:'BlobbyChat',extras:['activity.js']},
    profile:{file:'profile.js',css:'profile.css',global:'BlobbyProfile',depends:['chat']},
    dm:{file:'dm.js',css:'dm.css',global:'BlobbyDM',depends:['chat']},
    group:{file:'group.js',css:'group.css',global:'BlobbyGroup',depends:['chat']},
    leaderboard:{file:'leaderboard.js',css:'leaderboard.css',global:'BlobbyLeaderboard',depends:['chat']},
    music:{file:'music.js',css:'music.css',global:'BlobbyMusic'}
  };
  const pending=new Map();
  const api=name=>manifest[name]?window[manifest[name].global]:null;
  function addCss(name,item){if(!item.css||document.querySelector(`link[data-blobby-feature-css="${name}"]`))return;const link=document.createElement('link');link.rel='stylesheet';link.href=`./${item.css}?v=${VERSION}`;link.dataset.blobbyFeatureCss=name;document.head.append(link);}
  function addScript(file,key){return new Promise((resolve,reject)=>{if(document.querySelector(`script[data-blobby-feature="${key}"]`)){resolve();return;}const script=document.createElement('script');script.src=`./${file}?v=${VERSION}`;script.async=true;script.dataset.blobbyFeature=key;script.onload=resolve;script.onerror=()=>reject(Error(`Could not load ${file}.`));document.head.append(script);});}
  async function load(name){const item=manifest[name];if(!item)throw Error(`Unknown feature: ${name}`);if(api(name))return api(name);if(pending.has(name))return pending.get(name);const promise=(async()=>{for(const dep of item.depends||[])await load(dep);addCss(name,item);await addScript(item.file,name);for(const extra of item.extras||[])await addScript(extra,`${name}:${extra}`);const value=api(name);if(!value)throw Error(`${name} loaded without registering its API.`);return value;})().catch(err=>{pending.delete(name);throw err;});pending.set(name,promise);return promise;}
  async function open(name,...args){const value=await load(name);if(typeof value.open==='function')return value.open(...args);}
  async function openDMWith(profileId){const value=await load('dm');return typeof value.openWith==='function'?value.openWith(profileId):value.open?.();}
  window.BlobbyFeatures=Object.freeze({load,open,openDMWith,isLoaded:name=>!!api(name)});
})();
