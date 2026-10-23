'use strict';
(() => {
  const VERSION='stage14.2-20261018';
  const manifest={
    profile:{file:'profile.js',global:'BlobbyProfile'},
    dm:{file:'dm.js',global:'BlobbyDM'},
    group:{file:'group.js',global:'BlobbyGroup'},
    leaderboard:{file:'leaderboard.js',global:'BlobbyLeaderboard'},
    music:{file:'music.js',css:'music.css',global:'BlobbyMusic'}
  };
  const pending=new Map();

  function api(name){const item=manifest[name];return item?window[item.global]:null;}
  function load(name){
    const item=manifest[name];
    if(!item)return Promise.reject(Error(`Unknown feature: ${name}`));
    if(api(name))return Promise.resolve(api(name));
    if(pending.has(name))return pending.get(name);
    const promise=new Promise((resolve,reject)=>{
      if(item.css&&!document.querySelector(`link[data-blobby-feature-css="${name}"]`)){
        const link=document.createElement('link');
        link.rel='stylesheet';
        link.href=`./${item.css}?v=${VERSION}`;
        link.dataset.blobbyFeatureCss=name;
        document.head.append(link);
      }
      const script=document.createElement('script');
      script.src=`./${item.file}?v=${VERSION}`;
      script.async=true;
      script.dataset.blobbyFeature=name;
      script.onload=()=>{const value=api(name);if(value)resolve(value);else reject(Error(`${name} loaded without registering its API.`));};
      script.onerror=()=>reject(Error(`Could not load ${name}.`));
      document.head.append(script);
    }).catch(err=>{pending.delete(name);throw err;});
    pending.set(name,promise);
    return promise;
  }
  async function open(name,...args){const value=await load(name);if(typeof value.open==='function')return value.open(...args);}
  async function openDMWith(profileId){const value=await load('dm');return typeof value.openWith==='function'?value.openWith(profileId):value.open?.();}

  window.BlobbyFeatures=Object.freeze({load,open,openDMWith,isLoaded:name=>!!api(name)});
})();
