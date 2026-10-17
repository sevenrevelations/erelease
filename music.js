'use strict';
(() => {
  const API_BASE = 'https://blobby-music-api.onrender.com';

  const state = {
    open: false,
    view: 'search',
    provider: 'all',
    query: '',
    results: [],
    queue: [],
    index: -1,
    shuffle: false,
    repeat: 'off',
    favorites: [],
    recent: [],
    loading: false,
    playing: false,
    ready: false,
    currentKind: null,
    currentTrack: null,
    soundcloudResolved: null,
    localFiles: []
  };

  let ui = {};
  let audio = null;
  let hls = null;
  let ytPlayer = null;
  let ytApiPromise = null;
  let ytReady = false;
  let scWidget = null;
  let scApiPromise = null;
  let scWidgetReady = false;
  let scWidgetDuration = 0;
  let scWidgetPosition = 0;
  let progressTimer = 0;
  let searchAbort = null;

  const el = (tag, cls = '', text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  const fmt = seconds => {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function appExpand() {
    try { window.BlobbyAppUI?.expand?.('music'); } catch {}
  }

  function appRestore() {
    try { window.BlobbyAppUI?.restore?.(); } catch {}
  }

  function safeJSON(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }

  function savePrefs() {
    localStorage.setItem('blobby.music.v2.prefs', JSON.stringify({
      provider: state.provider,
      shuffle: state.shuffle,
      repeat: state.repeat,
      volume: audio ? audio.volume : 0.8
    }));
  }

  function saveLibrary() {
    localStorage.setItem('blobby.music.v2.favorites', JSON.stringify(
      state.favorites.slice(0, 100).map(cleanTrackForStorage)
    ));
    localStorage.setItem('blobby.music.v2.recent', JSON.stringify(
      state.recent.slice(0, 30).map(cleanTrackForStorage)
    ));
  }

  function cleanTrackForStorage(t) {
    if (!t) return null;
    return {
      id: t.id || '',
      provider: t.provider || '',
      title: t.title || 'Untitled',
      artist: t.artist || 'Unknown artist',
      duration: Number(t.duration) || 0,
      thumbnail: t.thumbnail || '',
      url: t.url || '',
      kind: t.kind || providerKind(t.provider)
    };
  }

  function loadStoredState() {
    const prefs = safeJSON('blobby.music.v2.prefs', {});
    state.provider = ['all', 'youtube_music', 'soundcloud', 'local'].includes(prefs.provider)
      ? prefs.provider
      : 'all';
    state.shuffle = !!prefs.shuffle;
    state.repeat = ['off', 'all', 'one'].includes(prefs.repeat) ? prefs.repeat : 'off';
    state.favorites = safeJSON('blobby.music.v2.favorites', []).filter(Boolean);
    state.recent = safeJSON('blobby.music.v2.recent', []).filter(Boolean);
    if (audio) {
      audio.volume = Number.isFinite(+prefs.volume)
        ? clamp(+prefs.volume, 0, 1)
        : 0.8;
    }
  }

  function providerKind(provider) {
    if (provider === 'soundcloud') return 'soundcloud';
    if (provider === 'local') return 'local';
    return 'youtube';
  }

  function providerLabel(provider) {
    if (provider === 'youtube_music' || provider === 'youtube') return 'YouTube Music';
    if (provider === 'soundcloud') return 'SoundCloud';
    if (provider === 'local') return 'Local';
    return provider || 'Music';
  }

  function providerIcon(provider) {
    if (provider === 'soundcloud') return '☁';
    if (provider === 'local') return '⌁';
    return '▶';
  }

  function youtubeVideoId(track) {
    if (!track) return '';
    if (track.id && /^[A-Za-z0-9_-]{6,}$/.test(track.id)) return track.id;
    try {
      const u = new URL(track.url);
      if (u.hostname === 'youtu.be') return u.pathname.slice(1);
      return u.searchParams.get('v') || '';
    } catch {
      return '';
    }
  }

  function isPlayableYouTubeResult(t) {
    if (!t || !t.url) return false;
    return t.url.includes('youtube.com/watch?v=') || t.url.includes('youtu.be/');
  }

  function normalizeApiTrack(t) {
    const provider = t.provider === 'youtube' ? 'youtube_music' : t.provider;
    return {
      id: String(t.id || ''),
      provider,
      kind: providerKind(provider),
      title: String(t.title || 'Untitled'),
      artist: String(t.artist || 'Unknown artist'),
      duration: Number(t.duration) || 0,
      thumbnail: String(t.thumbnail || ''),
      url: String(t.url || '')
    };
  }

  function escapeAttr(v) {
    return String(v || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[ch]);
  }

  function build() {
    audio = new Audio();
    audio.preload = 'metadata';
    audio.crossOrigin = 'anonymous';
    loadStoredState();

    const root = el('div', 'blobby-music-root');
    root.id = 'blobbyMusicRoot';
    root.dataset.open = 'false';

    root.innerHTML = `
      <div class="blobby-music-backdrop"></div>

      <section class="blobby-music-shell" aria-hidden="true" aria-label="Blobby Music">
        <aside class="bm-side">
          <div class="bm-brand">
            <div class="bm-brand-mark">♫</div>
            <div>
              <small>BLOBBY</small>
              <strong>Music</strong>
            </div>
          </div>

          <nav class="bm-nav" aria-label="Music navigation">
            <button type="button" data-view="search" class="active">
              <span>⌕</span><span>Search</span>
            </button>
            <button type="button" data-view="library">
              <span>≡</span><span>Your Library</span>
            </button>
            <button type="button" data-view="local">
              <span>＋</span><span>Local Music</span>
            </button>
          </nav>

          <div class="bm-side-section">
            <small>PROVIDERS</small>
            <button class="bm-provider-shortcut" type="button" data-provider-shortcut="youtube_music">
              <span class="bm-provider-dot youtube">▶</span>
              <span>YouTube Music</span>
            </button>
            <button class="bm-provider-shortcut" type="button" data-provider-shortcut="soundcloud">
              <span class="bm-provider-dot soundcloud">☁</span>
              <span>SoundCloud</span>
            </button>
            <button class="bm-provider-shortcut disabled" type="button" disabled>
              <span class="bm-provider-dot tidal">T</span>
              <span>TIDAL <small>Soon</small></span>
            </button>
          </div>

          <div class="bm-side-spacer"></div>

          <button class="bm-close" type="button" aria-label="Close Music">× Close</button>
        </aside>

        <section class="bm-main">
          <header class="bm-topbar">
            <div class="bm-search-wrap">
              <span class="bm-search-icon">⌕</span>
              <input class="bm-search" type="search" autocomplete="off" spellcheck="false"
                placeholder="Search songs, artists, albums...">
              <button class="bm-search-clear" type="button" aria-label="Clear search" hidden>×</button>
            </div>

            <select class="bm-provider" aria-label="Music provider">
              <option value="all">All Providers</option>
              <option value="youtube_music">YouTube Music</option>
              <option value="soundcloud">SoundCloud</option>
              <option value="local">Local</option>
            </select>
          </header>

          <div class="bm-content">
            <section class="bm-search-view" data-view-panel="search">
              <div class="bm-hero">
                <small>DISCOVER</small>
                <h2>Search across your music.</h2>
                <p>YouTube Music, SoundCloud, and your local files — one Blobby player.</p>
                <div class="bm-quick">
                  <button type="button" data-quick="Steve Lacy">Steve Lacy</button>
                  <button type="button" data-quick="Chill mix">Chill</button>
                  <button type="button" data-quick="New music">New music</button>
                </div>
              </div>

              <div class="bm-loading" hidden>
                <span class="bm-spinner"></span>
                <span>Searching music…</span>
              </div>

              <div class="bm-status" role="status" aria-live="polite"></div>

              <section class="bm-top-results" hidden>
                <div class="bm-section-head">
                  <div>
                    <small>TOP RESULTS</small>
                    <h3>Quick picks</h3>
                  </div>
                  <span class="bm-result-count"></span>
                </div>
                <div class="bm-cards"></div>
              </section>

              <section class="bm-tracks-section" hidden>
                <div class="bm-section-head">
                  <div>
                    <small>TRACKS</small>
                    <h3>Results</h3>
                  </div>
                </div>
                <div class="bm-track-list"></div>
              </section>
            </section>

            <section class="bm-library-view" data-view-panel="library" hidden>
              <div class="bm-section-head bm-library-head">
                <div>
                  <small>YOUR LIBRARY</small>
                  <h2>Saved music</h2>
                </div>
              </div>

              <section class="bm-library-block">
                <div class="bm-section-head"><h3>Favorites</h3></div>
                <div class="bm-favorites"></div>
              </section>

              <section class="bm-library-block">
                <div class="bm-section-head"><h3>Recently played</h3></div>
                <div class="bm-recent"></div>
              </section>
            </section>

            <section class="bm-local-view" data-view-panel="local" hidden>
              <div class="bm-section-head bm-library-head">
                <div>
                  <small>LOCAL MUSIC</small>
                  <h2>Files on this device</h2>
                  <p class="bm-muted">Local files stay on your device and are never uploaded.</p>
                </div>
                <button class="bm-add-local" type="button">+ Add music</button>
              </div>
              <input class="bm-file-picker" type="file" accept="audio/*" multiple hidden>
              <div class="bm-local-list"></div>
            </section>
          </div>

          <div class="bm-player">
            <div class="bm-player-media">
              <div class="bm-art-wrap">
                <img class="bm-art" alt="" hidden>
                <div class="bm-art-placeholder">♫</div>
              </div>
              <div class="bm-track-copy">
                <strong class="bm-now-title">Nothing playing</strong>
                <span class="bm-now-artist">Choose a track to begin.</span>
                <span class="bm-now-source"></span>
              </div>
              <button class="bm-favorite-now" type="button" title="Favorite" disabled>♡</button>
            </div>

            <div class="bm-player-center">
              <div class="bm-player-buttons">
                <button type="button" data-player="shuffle" title="Shuffle">⤨</button>
                <button type="button" data-player="prev" title="Previous">‹</button>
                <button type="button" data-player="play" class="primary" title="Play">▶</button>
                <button type="button" data-player="next" title="Next">›</button>
                <button type="button" data-player="repeat" title="Repeat">↻</button>
              </div>
              <div class="bm-progress-row">
                <span class="bm-current">0:00</span>
                <input class="bm-seek" type="range" min="0" max="1000" value="0">
                <span class="bm-duration">0:00</span>
              </div>
            </div>

            <div class="bm-player-right">
              <div class="bm-youtube-surface" hidden>
                <div id="blobbyMusicYoutubePlayer"></div>
              </div>
              <div class="bm-soundcloud-surface" hidden>
                <iframe id="blobbyMusicSoundCloudPlayer"
                  title="SoundCloud player"
                  width="100%" height="166"
                  scrolling="no" frameborder="no"
                  allow="autoplay">
                </iframe>
              </div>
              <label class="bm-volume">
                <span>🔊</span>
                <input type="range" min="0" max="100" value="80">
              </label>
            </div>
          </div>
        </section>
      </section>
    `;

    const mini = el('div', 'blobby-music-mini');
    mini.hidden = true;
    mini.innerHTML = `
      <button class="bm-mini-main" type="button">
        <div class="bm-mini-art">♫</div>
        <span><small>NOW PLAYING</small><strong>Nothing playing</strong></span>
      </button>
      <button class="bm-mini-play" type="button" aria-label="Play">▶</button>
      <button class="bm-mini-next" type="button" aria-label="Next">›</button>
    `;

    document.body.append(root, mini);

    ui = {
      root,
      shell: root.querySelector('.blobby-music-shell'),
      backdrop: root.querySelector('.blobby-music-backdrop'),
      close: root.querySelector('.bm-close'),
      navButtons: [...root.querySelectorAll('.bm-nav [data-view]')],
      viewPanels: [...root.querySelectorAll('[data-view-panel]')],
      providerShortcuts: [...root.querySelectorAll('[data-provider-shortcut]')],
      search: root.querySelector('.bm-search'),
      clearSearch: root.querySelector('.bm-search-clear'),
      provider: root.querySelector('.bm-provider'),
      loading: root.querySelector('.bm-loading'),
      status: root.querySelector('.bm-status'),
      topResults: root.querySelector('.bm-top-results'),
      cards: root.querySelector('.bm-cards'),
      count: root.querySelector('.bm-result-count'),
      tracksSection: root.querySelector('.bm-tracks-section'),
      trackList: root.querySelector('.bm-track-list'),
      favorites: root.querySelector('.bm-favorites'),
      recent: root.querySelector('.bm-recent'),
      addLocal: root.querySelector('.bm-add-local'),
      picker: root.querySelector('.bm-file-picker'),
      localList: root.querySelector('.bm-local-list'),
      art: root.querySelector('.bm-art'),
      artPlaceholder: root.querySelector('.bm-art-placeholder'),
      nowTitle: root.querySelector('.bm-now-title'),
      nowArtist: root.querySelector('.bm-now-artist'),
      nowSource: root.querySelector('.bm-now-source'),
      favoriteNow: root.querySelector('.bm-favorite-now'),
      play: root.querySelector('[data-player="play"]'),
      prev: root.querySelector('[data-player="prev"]'),
      next: root.querySelector('[data-player="next"]'),
      shuffle: root.querySelector('[data-player="shuffle"]'),
      repeat: root.querySelector('[data-player="repeat"]'),
      seek: root.querySelector('.bm-seek'),
      current: root.querySelector('.bm-current'),
      duration: root.querySelector('.bm-duration'),
      volume: root.querySelector('.bm-volume input'),
      youtubeSurface: root.querySelector('.bm-youtube-surface'),
      soundcloudSurface: root.querySelector('.bm-soundcloud-surface'),
      mini,
      miniMain: mini.querySelector('.bm-mini-main'),
      miniArt: mini.querySelector('.bm-mini-art'),
      miniTitle: mini.querySelector('strong'),
      miniPlay: mini.querySelector('.bm-mini-play'),
      miniNext: mini.querySelector('.bm-mini-next')
    };

    ui.provider.value = state.provider;
    ui.volume.value = Math.round(audio.volume * 100);

    ui.close.onclick = close;
    ui.backdrop.onclick = close;

    ui.navButtons.forEach(btn => {
      btn.onclick = () => setView(btn.dataset.view);
    });

    ui.providerShortcuts.forEach(btn => {
      btn.onclick = () => {
        state.provider = btn.dataset.providerShortcut;
        ui.provider.value = state.provider;
        savePrefs();
        setView('search');
        ui.search.focus();
        if (ui.search.value.trim()) runSearch();
      };
    });

    ui.provider.onchange = () => {
      state.provider = ui.provider.value;
      savePrefs();
      if (state.provider === 'local') {
        setView('local');
      } else {
        setView('search');
        if (ui.search.value.trim()) runSearch();
      }
    };

    ui.search.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runSearch();
      }
    });

    ui.search.addEventListener('input', () => {
      ui.clearSearch.hidden = !ui.search.value;
    });

    ui.clearSearch.onclick = () => {
      ui.search.value = '';
      ui.clearSearch.hidden = true;
      resetSearchUI();
      ui.search.focus();
    };

    root.querySelectorAll('[data-quick]').forEach(btn => {
      btn.onclick = () => {
        ui.search.value = btn.dataset.quick || '';
        ui.clearSearch.hidden = false;
        runSearch();
      };
    });

    ui.addLocal.onclick = () => ui.picker.click();
    ui.picker.onchange = e => addLocalFiles([...e.target.files]);

    ui.play.onclick = togglePlay;
    ui.prev.onclick = previous;
    ui.next.onclick = next;
    ui.shuffle.onclick = () => {
      state.shuffle = !state.shuffle;
      savePrefs();
      renderPlayerControls();
    };
    ui.repeat.onclick = () => {
      state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
      savePrefs();
      renderPlayerControls();
    };
    ui.volume.oninput = () => setVolume(+ui.volume.value);
    ui.seek.oninput = () => seekTo(+ui.seek.value / 1000);
    ui.favoriteNow.onclick = () => toggleFavorite(state.currentTrack);

    ui.miniMain.onclick = open;
    ui.miniPlay.onclick = togglePlay;
    ui.miniNext.onclick = next;

    audio.addEventListener('play', () => {
      state.playing = true;
      state.ready = true;
      renderPlayerControls();
    });
    audio.addEventListener('pause', () => {
      if (state.currentKind !== 'youtube') state.playing = false;
      renderPlayerControls();
    });
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('loadedmetadata', updateProgress);
    audio.addEventListener('timeupdate', updateProgress);
    audio.addEventListener('error', () => {
      if (state.currentKind === 'soundcloud') {
        setStatus('SoundCloud stream could not play in this WebViewer. Try another track.', true);
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.open) close();
    });

    window.addEventListener('blobby:license-locked', () => {
      pauseEverything();
      close();
    });

    setView('search');
    renderLibrary();
    renderLocal();
    renderNowPlaying();
    renderPlayerControls();

    progressTimer = window.setInterval(updateProgress, 500);
  }

  function setView(view) {
    if (!['search', 'library', 'local'].includes(view)) view = 'search';
    state.view = view;

    ui.navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view === view));
    ui.viewPanels.forEach(panel => {
      panel.hidden = panel.dataset.viewPanel !== view;
    });

    if (view === 'library') renderLibrary();
    if (view === 'local') renderLocal();
  }

  function setStatus(message = '', error = false) {
    ui.status.textContent = message;
    ui.status.classList.toggle('error', !!error);
  }

  function resetSearchUI() {
    state.results = [];
    ui.topResults.hidden = true;
    ui.tracksSection.hidden = true;
    ui.cards.replaceChildren();
    ui.trackList.replaceChildren();
    ui.count.textContent = '';
    setStatus('');
  }

  async function runSearch() {
    const q = ui.search.value.trim();
    if (!q) {
      resetSearchUI();
      setStatus('Type something to search.');
      return;
    }

    state.query = q;
    state.provider = ui.provider.value;
    savePrefs();

    if (state.provider === 'local') {
      setView('local');
      renderLocal(q);
      return;
    }

    searchAbort?.abort?.();
    searchAbort = new AbortController();

    state.loading = true;
    ui.loading.hidden = false;
    resetSearchUI();
    setStatus('Waking the music service and searching…');

    try {
      let raw = [];

      if (state.provider === 'all') {
        const [yt, sc] = await Promise.allSettled([
          fetchSearch(q, 'youtube_music', searchAbort.signal),
          fetchSearch(q, 'soundcloud', searchAbort.signal)
        ]);

        if (yt.status === 'fulfilled') raw.push(...yt.value);
        if (sc.status === 'fulfilled') raw.push(...sc.value);

        if (!raw.length) {
          throw new Error('No provider returned results.');
        }
      } else {
        raw = await fetchSearch(q, state.provider, searchAbort.signal);
      }

      state.results = dedupeTracks(raw.map(normalizeApiTrack).filter(track => {
        if (track.kind === 'youtube') return isPlayableYouTubeResult(track);
        return !!track.url;
      }));

      if (!state.results.length) {
        setStatus('No playable tracks found.');
        return;
      }

      renderSearchResults();
      setStatus('');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setStatus(err?.message || 'Music search failed.', true);
    } finally {
      state.loading = false;
      ui.loading.hidden = true;
    }
  }

  async function fetchSearch(q, provider, signal) {
    const url = `${API_BASE}/search?q=${encodeURIComponent(q)}&provider=${encodeURIComponent(provider)}&limit=12`;
    const res = await fetch(url, { signal });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.detail || ''; } catch {}
      throw new Error(detail || `${providerLabel(provider)} search failed.`);
    }
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  }

  function dedupeTracks(list) {
    const seen = new Set();
    return list.filter(t => {
      const key = `${t.provider}:${t.id || t.url}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderSearchResults() {
    ui.topResults.hidden = false;
    ui.tracksSection.hidden = false;
    ui.count.textContent = `${state.results.length} track${state.results.length === 1 ? '' : 's'}`;

    ui.cards.replaceChildren();
    state.results.slice(0, 6).forEach((track, index) => {
      const card = el('button', 'bm-card');
      card.type = 'button';
      card.onclick = () => playSearchTrack(index);

      const art = el('div', 'bm-card-art');
      if (track.thumbnail) {
        const img = document.createElement('img');
        img.src = track.thumbnail;
        img.alt = '';
        img.loading = 'lazy';
        art.append(img);
      } else {
        art.textContent = '♫';
      }

      const badge = el('span', `bm-source-badge ${track.kind}`, providerLabel(track.provider));
      const title = el('strong', '', track.title);
      const artist = el('span', '', track.artist);

      card.append(art, badge, title, artist);
      ui.cards.append(card);
    });

    renderTrackRows(ui.trackList, state.results, index => playSearchTrack(index));
  }

  function renderTrackRows(container, tracks, onPlay) {
    container.replaceChildren();

    if (!tracks.length) {
      container.append(el('div', 'bm-empty', 'Nothing here yet.'));
      return;
    }

    tracks.forEach((track, index) => {
      const row = el('div', 'bm-track-row');
      if (sameTrack(track, state.currentTrack)) row.classList.add('active');

      const number = el('span', 'bm-track-number', String(index + 1));

      const art = el('button', 'bm-row-art');
      art.type = 'button';
      if (track.thumbnail) {
        const img = document.createElement('img');
        img.src = track.thumbnail;
        img.alt = '';
        img.loading = 'lazy';
        art.append(img);
      } else {
        art.textContent = providerIcon(track.provider);
      }
      art.onclick = () => onPlay(index);

      const copy = el('button', 'bm-row-copy');
      copy.type = 'button';
      copy.innerHTML = `<strong>${escapeAttr(track.title)}</strong><span>${escapeAttr(track.artist)}</span>`;
      copy.onclick = () => onPlay(index);

      const provider = el('span', `bm-row-provider ${track.kind}`, providerLabel(track.provider));
      const duration = el('span', 'bm-row-duration', track.duration ? fmt(track.duration) : '—');

      const fav = el('button', 'bm-row-fav', isFavorite(track) ? '♥' : '♡');
      fav.type = 'button';
      fav.title = isFavorite(track) ? 'Remove favorite' : 'Add favorite';
      fav.onclick = e => {
        e.stopPropagation();
        toggleFavorite(track);
        fav.textContent = isFavorite(track) ? '♥' : '♡';
      };

      row.append(number, art, copy, provider, duration, fav);
      container.append(row);
    });
  }

  function playSearchTrack(index) {
    const queue = state.results.map(cleanTrackForStorage);
    playQueue(queue, index);
  }

  function playQueue(queue, index) {
    if (!queue.length) return;
    state.queue = queue;
    state.index = clamp(index, 0, queue.length - 1);
    playTrack(state.queue[state.index]);
  }

  async function playTrack(track) {
    if (!track) return;

    pauseEverything(false);
    destroyHls();

    state.currentTrack = track;
    state.currentKind = track.kind || providerKind(track.provider);
    state.ready = false;
    state.playing = false;
    state.soundcloudResolved = null;

    rememberRecent(track);
    renderNowPlaying();
    renderSearchResultsIfVisible();
    renderLibrary();

    if (state.currentKind === 'local') {
      if (!track.blobUrl) {
        setStatus('This local file needs to be selected again after restarting Blobby.', true);
        return;
      }
      ui.youtubeSurface.hidden = true;
      ui.soundcloudSurface.hidden = true;
      audio.src = track.blobUrl;
      audio.load();
      try {
        await audio.play();
      } catch {
        state.ready = true;
        setStatus('Track loaded. Tap Play to start.');
      }
      return;
    }

    if (state.currentKind === 'soundcloud') {
      ui.youtubeSurface.hidden = true;
      ui.soundcloudSurface.hidden = true;
      setStatus('Loading SoundCloud stream…');

      try {
        const resolved = await resolveSoundCloud(track.url);
        state.soundcloudResolved = resolved;
        ui.soundcloudSurface.hidden = true;
        await loadSoundCloudStream(resolved.stream_url);
        state.ready = true;
        setStatus('');
        try {
          await audio.play();
        } catch {
          setStatus('SoundCloud is ready. Tap Play to start.');
        }
      } catch (err) {
        const message = String(err?.message || '');
        if (/DRM protected/i.test(message)) {
          setStatus('This track uses SoundCloud protected playback. Switching to the official SoundCloud player…');
          try {
            await loadSoundCloudWidget(track.url);
            state.currentKind = 'soundcloud_widget';
            state.ready = true;
            setStatus('');
            scWidget?.play?.();
          } catch (widgetErr) {
            setStatus(widgetErr?.message || 'SoundCloud protected playback could not load.', true);
          }
        } else {
          setStatus(message || 'Could not load this SoundCloud track.', true);
        }
      }
      return;
    }

    if (state.currentKind === 'youtube') {
      ui.soundcloudSurface.hidden = true;
      ui.youtubeSurface.hidden = false;
      setStatus('Loading YouTube Music player…');

      try {
        await ensureYouTubePlayer();
        const id = youtubeVideoId(track);
        if (!id) throw new Error('This YouTube result has no playable video ID.');
        state.ready = true;
        ytPlayer.loadVideoById(id);
        ytPlayer.setVolume(Math.round(audio.volume * 100));
        setStatus('');
      } catch (err) {
        setStatus(err?.message || 'YouTube player could not load.', true);
      }
    }
  }

  async function resolveSoundCloud(url) {
    const res = await fetch(`${API_BASE}/resolve?url=${encodeURIComponent(url)}`);
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json())?.detail || ''; } catch {}
      throw new Error(detail || 'SoundCloud resolution failed.');
    }
    const data = await res.json();
    if (!data.stream_url) throw new Error('No SoundCloud stream URL was returned.');
    return data;
  }

  async function ensureHls() {
    if (window.Hls) return window.Hls;
    await new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-blobby-hls]');
      if (existing) {
        existing.addEventListener('load', resolve, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';
      s.async = true;
      s.dataset.blobbyHls = '1';
      s.onload = resolve;
      s.onerror = () => reject(new Error('HLS player library failed to load.'));
      document.head.append(s);
    });
    return window.Hls;
  }

  async function loadSoundCloudStream(url) {
    destroyHls();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();

    if (/\.m3u8(?:\?|$)/i.test(url)) {
      if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = url;
        audio.load();
        return;
      }

      const Hls = await ensureHls();
      if (!Hls?.isSupported?.()) {
        throw new Error('HLS playback is not supported in this WebViewer.');
      }

      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30
      });

      hls.loadSource(url);
      hls.attachMedia(audio);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('SoundCloud stream timed out.')), 15000);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          clearTimeout(timeout);
          resolve();
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data?.fatal) {
            clearTimeout(timeout);
            reject(new Error('SoundCloud HLS playback failed.'));
          }
        });
      });
      return;
    }

    audio.src = url;
    audio.load();
  }

  function destroyHls() {
    if (hls) {
      try { hls.destroy(); } catch {}
      hls = null;
    }
  }

  function ensureSoundCloudApi() {
    if (window.SC?.Widget) return Promise.resolve(window.SC);
    if (scApiPromise) return scApiPromise;

    scApiPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-blobby-soundcloud-api]');
      if (existing) {
        const check = () => {
          if (window.SC?.Widget) resolve(window.SC);
          else reject(new Error('SoundCloud Widget API did not initialize.'));
        };
        existing.addEventListener('load', check, { once: true });
        existing.addEventListener('error', () => reject(new Error('SoundCloud Widget API failed to load.')), { once: true });
        return;
      }

      const s = document.createElement('script');
      s.src = 'https://w.soundcloud.com/player/api.js';
      s.async = true;
      s.dataset.blobbySoundcloudApi = '1';
      s.onload = () => {
        if (window.SC?.Widget) resolve(window.SC);
        else reject(new Error('SoundCloud Widget API did not initialize.'));
      };
      s.onerror = () => reject(new Error('SoundCloud Widget API failed to load.'));
      document.head.append(s);
    });

    return scApiPromise;
  }

  async function loadSoundCloudWidget(trackUrl) {
    const SC = await ensureSoundCloudApi();
    const iframe = document.getElementById('blobbyMusicSoundCloudPlayer');
    if (!iframe) throw new Error('SoundCloud player frame is missing.');

    try { audio.pause(); } catch {}
    destroyHls();

    ui.youtubeSurface.hidden = true;
    ui.soundcloudSurface.hidden = false;

    scWidgetReady = false;
    scWidgetDuration = Number(state.currentTrack?.duration || 0) * 1000;
    scWidgetPosition = 0;

    const src =
      'https://w.soundcloud.com/player/?url=' + encodeURIComponent(trackUrl) +
      '&auto_play=false&buying=false&sharing=false&download=false' +
      '&show_artwork=false&show_playcount=false&show_user=true&visual=false';

    iframe.src = src;
    scWidget = SC.Widget(iframe);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('SoundCloud protected player timed out.')), 15000);

      scWidget.bind(SC.Widget.Events.READY, () => {
        clearTimeout(timeout);
        scWidgetReady = true;

        try {
          scWidget.setVolume(Math.round(audio.volume * 100));
          scWidget.getDuration(ms => {
            if (Number(ms) > 0) scWidgetDuration = Number(ms);
          });
        } catch {}

        resolve();
      });

      scWidget.bind(SC.Widget.Events.PLAY, () => {
        state.playing = true;
        renderPlayerControls();
      });

      scWidget.bind(SC.Widget.Events.PAUSE, () => {
        state.playing = false;
        renderPlayerControls();
      });

      scWidget.bind(SC.Widget.Events.FINISH, () => {
        state.playing = false;
        renderPlayerControls();
        onEnded();
      });

      scWidget.bind(SC.Widget.Events.PLAY_PROGRESS, e => {
        if (Number.isFinite(e?.currentPosition)) scWidgetPosition = e.currentPosition;
        if (Number.isFinite(e?.relativePosition) && scWidgetDuration) {
          scWidgetPosition = e.relativePosition * scWidgetDuration;
        }
        updateProgress();
      });

      scWidget.bind(SC.Widget.Events.ERROR, () => {
        setStatus('SoundCloud could not play this track in the official player.', true);
      });
    });

    return scWidget;
  }

  function ensureYouTubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (ytApiPromise) return ytApiPromise;

    ytApiPromise = new Promise((resolve, reject) => {
      const prior = window.onYouTubeIframeAPIReady;
      let done = false;

      window.onYouTubeIframeAPIReady = () => {
        try { if (typeof prior === 'function') prior(); } catch {}
        if (!done) {
          done = true;
          resolve(window.YT);
        }
      };

      if (!document.querySelector('script[data-blobby-youtube-api]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        s.async = true;
        s.dataset.blobbyYoutubeApi = '1';
        s.onerror = () => {
          if (!done) {
            done = true;
            reject(new Error('YouTube player API failed to load.'));
          }
        };
        document.head.append(s);
      }

      setTimeout(() => {
        if (!done && window.YT?.Player) {
          done = true;
          resolve(window.YT);
        } else if (!done) {
          done = true;
          reject(new Error('YouTube player API timed out.'));
        }
      }, 15000);
    });

    return ytApiPromise;
  }

  async function ensureYouTubePlayer() {
    if (ytPlayer && ytReady) return ytPlayer;

    const YT = await ensureYouTubeApi();

    if (ytPlayer) return ytPlayer;

    return await new Promise((resolve, reject) => {
      ytPlayer = new YT.Player('blobbyMusicYoutubePlayer', {
        width: '360',
        height: '203',
        playerVars: {
          controls: 0,
          rel: 0,
          playsinline: 1,
          origin: location.origin
        },
        events: {
          onReady: event => {
            ytReady = true;
            event.target.setVolume(Math.round(audio.volume * 100));
            resolve(event.target);
          },
          onStateChange: event => {
            if (!window.YT) return;

            if (event.data === YT.PlayerState.PLAYING) {
              state.playing = true;
              state.ready = true;
            } else if (event.data === YT.PlayerState.PAUSED) {
              state.playing = false;
            } else if (event.data === YT.PlayerState.ENDED) {
              state.playing = false;
              onEnded();
            }

            renderPlayerControls();
          },
          onError: event => {
            const code = event.data;
            const message = code === 101 || code === 150
              ? 'This YouTube track does not allow embedded playback.'
              : code === 153
                ? 'YouTube rejected this embedded player request in the WebViewer.'
                : `YouTube playback error (${code}).`;
            setStatus(message, true);
          },
          onAutoplayBlocked: () => {
            state.playing = false;
            state.ready = true;
            setStatus('Track loaded. Tap Play to start.');
            renderPlayerControls();
          }
        }
      });
    });
  }

  function togglePlay() {
    if (!state.currentTrack) return;

    if (state.currentKind === 'youtube') {
      if (!ytPlayer || !ytReady) {
        playTrack(state.currentTrack);
        return;
      }

      try {
        const YT = window.YT;
        const s = ytPlayer.getPlayerState();
        if (s === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
        else ytPlayer.playVideo();
      } catch {}
      return;
    }

    if (state.currentKind === 'soundcloud_widget') {
      if (!scWidget || !scWidgetReady) {
        playTrack(state.currentTrack);
        return;
      }
      try { scWidget.toggle(); } catch {}
      return;
    }

    if (audio.paused) audio.play().catch(() => {
      setStatus('Tap the track again if playback was blocked.', true);
    });
    else audio.pause();
  }

  function pauseEverything(update = true) {
    try { audio.pause(); } catch {}
    if (ytPlayer && ytReady) {
      try { ytPlayer.pauseVideo(); } catch {}
    }
    if (scWidget && scWidgetReady) {
      try { scWidget.pause(); } catch {}
    }
    if (update) {
      state.playing = false;
      renderPlayerControls();
    }
  }

  function next() {
    if (!state.queue.length) return;

    if (state.shuffle && state.queue.length > 1) {
      let nextIndex = state.index;
      while (nextIndex === state.index) {
        nextIndex = Math.floor(Math.random() * state.queue.length);
      }
      state.index = nextIndex;
    } else if (state.index < state.queue.length - 1) {
      state.index += 1;
    } else if (state.repeat === 'all') {
      state.index = 0;
    } else {
      return;
    }

    playTrack(state.queue[state.index]);
  }

  function previous() {
    if (!state.queue.length) return;

    const current = currentTime();
    if (current > 3) {
      seekSeconds(0);
      return;
    }

    if (state.index > 0) state.index -= 1;
    else if (state.repeat === 'all') state.index = state.queue.length - 1;
    else return;

    playTrack(state.queue[state.index]);
  }

  function onEnded() {
    if (state.repeat === 'one') {
      seekSeconds(0);
      togglePlay();
      return;
    }
    next();
  }

  function setVolume(percent) {
    percent = clamp(percent, 0, 100);
    audio.volume = percent / 100;

    if (ytPlayer && ytReady) {
      try { ytPlayer.setVolume(percent); } catch {}
    }
    if (scWidget && scWidgetReady) {
      try { scWidget.setVolume(percent); } catch {}
    }

    savePrefs();
  }

  function currentTime() {
    if (state.currentKind === 'youtube' && ytPlayer && ytReady) {
      try { return Number(ytPlayer.getCurrentTime()) || 0; } catch {}
    }
    if (state.currentKind === 'soundcloud_widget' && scWidgetReady) {
      return (Number(scWidgetPosition) || 0) / 1000;
    }
    return Number(audio.currentTime) || 0;
  }

  function duration() {
    if (state.currentKind === 'youtube' && ytPlayer && ytReady) {
      try { return Number(ytPlayer.getDuration()) || Number(state.currentTrack?.duration) || 0; } catch {}
    }
    if (state.currentKind === 'soundcloud_widget' && scWidgetReady) {
      return (Number(scWidgetDuration) || 0) / 1000 || Number(state.currentTrack?.duration) || 0;
    }
    return Number(audio.duration) || Number(state.currentTrack?.duration) || 0;
  }

  function seekSeconds(seconds) {
    seconds = Math.max(0, Number(seconds) || 0);

    if (state.currentKind === 'youtube' && ytPlayer && ytReady) {
      try { ytPlayer.seekTo(seconds, true); } catch {}
    } else if (state.currentKind === 'soundcloud_widget' && scWidgetReady) {
      try {
        scWidget.seekTo(seconds * 1000);
        scWidgetPosition = seconds * 1000;
      } catch {}
    } else {
      try { audio.currentTime = seconds; } catch {}
    }

    updateProgress();
  }

  function seekTo(ratio) {
    const d = duration();
    if (!d) return;
    seekSeconds(clamp(ratio, 0, 1) * d);
  }

  function updateProgress() {
    if (!ui.seek) return;
    const c = currentTime();
    const d = duration();

    ui.current.textContent = fmt(c);
    ui.duration.textContent = d ? fmt(d) : '0:00';
    ui.seek.value = d ? Math.round((c / d) * 1000) : 0;
  }

  function renderNowPlaying() {
    const t = state.currentTrack;

    if (!t) {
      ui.nowTitle.textContent = 'Nothing playing';
      ui.nowArtist.textContent = 'Choose a track to begin.';
      ui.nowSource.textContent = '';
      ui.favoriteNow.disabled = true;
      ui.favoriteNow.textContent = '♡';
      ui.art.hidden = true;
      ui.art.removeAttribute('src');
      ui.artPlaceholder.hidden = false;
      ui.mini.hidden = true;
      return;
    }

    ui.nowTitle.textContent = t.title;
    ui.nowArtist.textContent = t.artist;
    ui.nowSource.textContent = providerLabel(t.provider);
    ui.favoriteNow.disabled = t.kind === 'local';
    ui.favoriteNow.textContent = isFavorite(t) ? '♥' : '♡';

    if (t.thumbnail) {
      ui.art.src = t.thumbnail;
      ui.art.hidden = false;
      ui.artPlaceholder.hidden = true;
    } else {
      ui.art.hidden = true;
      ui.artPlaceholder.hidden = false;
    }

    ui.mini.hidden = false;
    ui.miniTitle.textContent = t.title;

    if (t.thumbnail) {
      ui.miniArt.textContent = '';
      ui.miniArt.style.backgroundImage = `url("${t.thumbnail.replace(/"/g, '\\"')}")`;
    } else {
      ui.miniArt.textContent = '♫';
      ui.miniArt.style.backgroundImage = '';
    }
  }

  function renderPlayerControls() {
    ui.play.textContent = state.playing ? '❚❚' : '▶';
    ui.miniPlay.textContent = state.playing ? '❚❚' : '▶';

    ui.shuffle.classList.toggle('active', state.shuffle);
    ui.repeat.classList.toggle('active', state.repeat !== 'off');
    ui.repeat.textContent = state.repeat === 'one' ? '↻¹' : '↻';
    ui.repeat.title = `Repeat: ${state.repeat}`;
  }

  function renderSearchResultsIfVisible() {
    if (!ui.trackList || ui.tracksSection.hidden) return;
    renderTrackRows(ui.trackList, state.results, index => playSearchTrack(index));
  }

  function addLocalFiles(files) {
    const added = [];

    for (const file of files) {
      if (!file.type.startsWith('audio/')) continue;

      const t = {
        id: `${file.name}:${file.size}:${file.lastModified}`,
        provider: 'local',
        kind: 'local',
        title: file.name.replace(/\.[^.]+$/, ''),
        artist: 'Local file',
        duration: 0,
        thumbnail: '',
        url: '',
        blobUrl: URL.createObjectURL(file),
        fileName: file.name
      };

      state.localFiles.push(t);
      added.push(t);
    }

    ui.picker.value = '';
    setView('local');
    renderLocal();

    if (added.length && !state.currentTrack) {
      state.queue = state.localFiles.slice();
      state.index = state.localFiles.indexOf(added[0]);
      playTrack(added[0]);
    }
  }

  function renderLocal(filter = '') {
    const q = String(filter || '').trim().toLowerCase();
    const tracks = state.localFiles.filter(t => {
      if (!q) return true;
      return `${t.title} ${t.artist}`.toLowerCase().includes(q);
    });

    if (!tracks.length) {
      ui.localList.replaceChildren(
        el('div', 'bm-empty',
          state.localFiles.length
            ? 'No local files match that search.'
            : 'No local music added yet. Choose audio files from this device.'
        )
      );
      return;
    }

    renderTrackRows(ui.localList, tracks, index => {
      state.queue = tracks.slice();
      state.index = index;
      playTrack(tracks[index]);
    });
  }

  function sameTrack(a, b) {
    if (!a || !b) return false;
    return a.provider === b.provider && (a.id || a.url) === (b.id || b.url);
  }

  function isFavorite(track) {
    return state.favorites.some(f => sameTrack(f, track));
  }

  function toggleFavorite(track) {
    if (!track || track.kind === 'local') return;

    const idx = state.favorites.findIndex(f => sameTrack(f, track));
    if (idx >= 0) state.favorites.splice(idx, 1);
    else state.favorites.unshift(cleanTrackForStorage(track));

    saveLibrary();
    renderLibrary();
    renderNowPlaying();
    renderSearchResultsIfVisible();
  }

  function rememberRecent(track) {
    if (!track || track.kind === 'local') return;

    state.recent = state.recent.filter(r => !sameTrack(r, track));
    state.recent.unshift(cleanTrackForStorage(track));
    state.recent = state.recent.slice(0, 30);
    saveLibrary();
  }

  function renderLibrary() {
    renderTrackRows(ui.favorites, state.favorites, index => {
      state.queue = state.favorites.slice();
      state.index = index;
      playTrack(state.queue[index]);
    });

    renderTrackRows(ui.recent, state.recent, index => {
      state.queue = state.recent.slice();
      state.index = index;
      playTrack(state.queue[index]);
    });
  }

  function open() {
    if (document.body.dataset.licenseState !== 'unlocked') return;

    if (window.BlobbyChat?.state?.().open) window.BlobbyChat.close();
    if (window.BlobbyDM?.state?.().open) window.BlobbyDM.close();
    if (window.BlobbyGroup?.state?.().open) window.BlobbyGroup.close();
    if (window.BlobbyLeaderboard?.state?.().open) window.BlobbyLeaderboard.close();
    window.BlobbyPanels?.close();

    state.open = true;
    ui.root.dataset.open = 'true';
    ui.shell.setAttribute('aria-hidden', 'false');
    document.documentElement.dataset.musicOpen = 'true';
    appExpand();

    if (state.view === 'search') {
      setTimeout(() => ui.search?.focus?.(), 80);
    }
  }

  function close() {
    if (!state.open) return;

    state.open = false;
    ui.root.dataset.open = 'false';
    ui.shell.setAttribute('aria-hidden', 'true');
    delete document.documentElement.dataset.musicOpen;
    appRestore();
  }

  function destroy() {
    searchAbort?.abort?.();
    destroyHls();

    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = 0;
    }

    state.localFiles.forEach(t => {
      if (t.blobUrl) {
        try { URL.revokeObjectURL(t.blobUrl); } catch {}
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build, { once: true });
  } else {
    build();
  }

  window.addEventListener('beforeunload', destroy);

  window.BlobbyMusic = Object.freeze({
    open,
    close,
    toggle: () => state.open ? close() : open(),
    search: query => {
      if (!state.open) open();
      setView('search');
      ui.search.value = String(query || '');
      ui.clearSearch.hidden = !ui.search.value;
      runSearch();
    },
    state: () => ({
      open: state.open,
      view: state.view,
      provider: state.provider,
      playing: state.playing,
      current: cleanTrackForStorage(state.currentTrack),
      queueCount: state.queue.length
    })
  });
})();