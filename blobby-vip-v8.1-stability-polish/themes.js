(function(root){
'use strict';
const presets={
 midnight:{name:'Midnight',bg:'#090b13',bg2:'#151a2a',panel:'#111827',panel2:'#182033',text:'#f4f7ff',muted:'#9ba8c7',accent:'#8da2ff',accent2:'#b28cff',line:'#2c3651',glow:'#7188ff'},
 oled:{name:'OLED Black',bg:'#000000',bg2:'#060606',panel:'#090909',panel2:'#111111',text:'#ffffff',muted:'#a8a8a8',accent:'#8cffd1',accent2:'#70a7ff',line:'#242424',glow:'#59ffbd'},
 cyberpunk:{name:'Cyberpunk',bg:'#090313',bg2:'#180726',panel:'#150a20',panel2:'#21102e',text:'#fff5fd',muted:'#d09bc9',accent:'#ff3bd4',accent2:'#43f7ff',line:'#5f235b',glow:'#ff39d0'},
 neon:{name:'Neon',bg:'#07100d',bg2:'#0b1813',panel:'#0d1713',panel2:'#14231d',text:'#effff7',muted:'#8fc4aa',accent:'#58ff9c',accent2:'#54d7ff',line:'#25533b',glow:'#37ff8c'},
 aurora:{name:'Aurora',bg:'#071613',bg2:'#0d2624',panel:'#0c201d',panel2:'#13302d',text:'#edfff9',muted:'#9cc8bb',accent:'#63e6be',accent2:'#7c9cff',line:'#28584f',glow:'#5be0b8'},
 ocean:{name:'Ocean',bg:'#06131e',bg2:'#09263a',panel:'#0b2030',panel2:'#113148',text:'#effaff',muted:'#9abbd0',accent:'#55d8f4',accent2:'#528dff',line:'#244c63',glow:'#49cce9'},
 sunset:{name:'Sunset',bg:'#1d0e19',bg2:'#3a1726',panel:'#2a1321',panel2:'#3a1d2c',text:'#fff2f5',muted:'#dfadba',accent:'#ff9b72',accent2:'#f56fb3',line:'#6c3549',glow:'#ff865f'},
 purple:{name:'Purple Dream',bg:'#100a1b',bg2:'#24123e',panel:'#19102a',panel2:'#28183f',text:'#f9f2ff',muted:'#bca6d5',accent:'#bd8cff',accent2:'#7d9cff',line:'#4b3568',glow:'#ad75ff'},
 forest:{name:'Forest',bg:'#09140d',bg2:'#132619',panel:'#0f1e13',panel2:'#17291c',text:'#eff9f0',muted:'#a2baa6',accent:'#79d98b',accent2:'#b9e46e',line:'#31523a',glow:'#67d67c'},
 ice:{name:'Ice',bg:'#eaf4fb',bg2:'#dbeaf5',panel:'#f7fbff',panel2:'#eaf4fa',text:'#102235',muted:'#5b7086',accent:'#327dcf',accent2:'#65b8d9',line:'#b9cede',glow:'#4a9ee0'},
 crimson:{name:'Crimson',bg:'#17090c',bg2:'#2e0d14',panel:'#241016',panel2:'#34151d',text:'#fff3f4',muted:'#d5a8ae',accent:'#ff6575',accent2:'#e83d8c',line:'#66303a',glow:'#ff596b'},
 sakura:{name:'Sakura',bg:'#fff4f8',bg2:'#ffe6ef',panel:'#fffafd',panel2:'#fff0f5',text:'#3c1f2b',muted:'#886071',accent:'#e8588d',accent2:'#9e79d8',line:'#ecc3d2',glow:'#ef77a5'},
 retro:{name:'Retro',bg:'#17170f',bg2:'#292416',panel:'#232119',panel2:'#302c1f',text:'#fff6c7',muted:'#c7b77a',accent:'#f3c94b',accent2:'#ef7657',line:'#665d35',glow:'#f0c63f'},
 terminal:{name:'Terminal',bg:'#030904',bg2:'#07120a',panel:'#071009',panel2:'#0b180e',text:'#cbffd7',muted:'#70a97d',accent:'#62ff7d',accent2:'#21d16a',line:'#1f542d',glow:'#50ff6e'},
 space:{name:'Space',bg:'#050611',bg2:'#12122a',panel:'#0c0e20',panel2:'#161831',text:'#f3f5ff',muted:'#9099bf',accent:'#7888ff',accent2:'#d26fff',line:'#30365f',glow:'#7788ff'},
 light:{name:'Minimal Light',bg:'#f4f6fa',bg2:'#e9edf4',panel:'#ffffff',panel2:'#f5f7fb',text:'#17202d',muted:'#687386',accent:'#3d69df',accent2:'#7b61d1',line:'#d6dce6',glow:'#557ce2'},
 dark:{name:'Minimal Dark',bg:'#111317',bg2:'#1a1d23',panel:'#181b21',panel2:'#22262d',text:'#f5f6f8',muted:'#9ca4b0',accent:'#7f9cff',accent2:'#a28bff',line:'#353b45',glow:'#7f9cff'},
 glass:{name:'Glass',bg:'#0d1220',bg2:'#1b2540',panel:'#131a2c',panel2:'#1e2942',text:'#f6f9ff',muted:'#a8b5d2',accent:'#77c7ff',accent2:'#b58cff',line:'#3d4d6d',glow:'#68bcff'},
 rgb:{name:'RGB Gaming',bg:'#080a10',bg2:'#141625',panel:'#111522',panel2:'#1a2030',text:'#ffffff',muted:'#aeb7cc',accent:'#ff4d8d',accent2:'#55dfff',line:'#343d55',glow:'#ff4d8d'},
 graphite:{name:'Graphite',bg:'#0d0f12',bg2:'#171a1f',panel:'#14171c',panel2:'#1d2128',text:'#f2f4f7',muted:'#959da9',accent:'#9ea8ff',accent2:'#77d2c3',line:'#2e343d',glow:'#8f9cff'},
 cobalt:{name:'Cobalt',bg:'#07111e',bg2:'#0c2039',panel:'#0b192b',panel2:'#10243d',text:'#eef6ff',muted:'#93aac2',accent:'#5b9dff',accent2:'#58e1d2',line:'#274767',glow:'#5b9dff'},
 ember:{name:'Ember',bg:'#140b08',bg2:'#26120d',panel:'#1f100c',panel2:'#2d1711',text:'#fff5ef',muted:'#c9a79b',accent:'#ff875c',accent2:'#ffc15c',line:'#5e382a',glow:'#ff7a4b'},
 lavender:{name:'Lavender',bg:'#14111c',bg2:'#211b30',panel:'#1a1625',panel2:'#272038',text:'#fbf8ff',muted:'#b9add0',accent:'#b6a0ff',accent2:'#ef9fc8',line:'#493d62',glow:'#ad96ff'},
 vapor:{name:'Vapor',bg:'#0c0a17',bg2:'#1c1230',panel:'#151023',panel2:'#231a36',text:'#fff8ff',muted:'#c3afd1',accent:'#f071d8',accent2:'#69dfff',line:'#4f3a67',glow:'#e96fd6'}
};
const keys=['bg','bg2','panel','panel2','text','muted','accent','accent2','line','glow'];
function validTheme(t){return t&&keys.every(k=>typeof t[k]==='string');}
function getTheme(id,customThemes=[]){const custom=(customThemes||[]).find(t=>t.id===id);if(custom&&validTheme(custom.colors))return {...custom.colors,name:custom.name};return presets[id]||presets.midnight;}
function apply(theme,prefs,rootEl=document.documentElement){theme=validTheme(theme)?theme:presets.midnight;const vars={
 '--bg':theme.bg,'--bg2':theme.bg2,'--panel':theme.panel,'--panel2':theme.panel2,'--ink':theme.text,'--muted':theme.muted,'--accent':theme.accent,'--accent2':theme.accent2,'--line':theme.line,'--glow':theme.glow,
 '--radius':`${prefs.radius}px`,'--blur':`${prefs.blur}px`,'--panel-opacity':prefs.panelOpacity,'--shadow-strength':prefs.shadow/100,'--animation-speed':prefs.animationSpeed,
 '--rgb-speed':`${prefs.rgbSpeed}s`,'--rgb-intensity':prefs.rgbIntensity/100,'--rgb-saturation':prefs.rgbSaturation/100,
 '--cursor-color':prefs.cursorColor||theme.accent,'--cursor-secondary':prefs.cursorSecondary||theme.text
};for(const [k,v] of Object.entries(vars))rootEl.style.setProperty(k,String(v));
 rootEl.dataset.themeLight=String(['ice','sakura','light'].includes(prefs.theme));rootEl.dataset.glass=String(!!prefs.glass);rootEl.dataset.rgb=String(!!prefs.rgb&&!prefs.performance);rootEl.dataset.rgbMode=prefs.rgbMode||'cycle';rootEl.dataset.performance=String(!!prefs.performance);rootEl.dataset.animations=String(!!prefs.animations&&!prefs.reducedMotion&&!prefs.performance);rootEl.dataset.hover=String(!!prefs.hoverEffects&&!prefs.performance);rootEl.dataset.reduced=String(!!prefs.reducedMotion);rootEl.dataset.density=prefs.density||'default';rootEl.dataset.focusMode=String(!!prefs.focusMode);
 for(const [area,on] of Object.entries(prefs.rgbAreas||{}))rootEl.dataset['rgb'+area[0].toUpperCase()+area.slice(1)]=String(!!on);
}
root.BlobbyThemes={presets,keys,getTheme,apply,validTheme};
})(typeof globalThis!=='undefined'?globalThis:this);
