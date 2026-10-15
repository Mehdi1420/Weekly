'use strict';

// ---------- Médias : séries, films, jeux, livres ----------
// Recherche dans des bases publiques gratuites (sans clé) :
// - séries : TVmaze (saisons, épisodes, prochain épisode) ;
// - films : iTunes (durée, réalisateur), sinon Wikipédia ;
// - jeux : Wikipédia (description, année, image) ;
// - livres : Open Library (auteur, pages) — rangés avec la Lecture de l'onglet Objectifs.
// Les épisodes sont stockés en format compact : [saison, numéro, titre, date de diffusion, durée].

const MEDIA_TYPES = {
  series: { label: 'Série', plural: 'Séries', icon: '📺' },
  film: { label: 'Film', plural: 'Films', icon: '🎬' },
  game: { label: 'Jeu', plural: 'Jeux', icon: '🎮' },
  book: { label: 'Livre', plural: 'Livres', icon: '📖' },
};
const MEDIA_STATUS = { todo: 'À voir', doing: 'En cours', done: 'Terminé', dropped: 'Abandonné' };
const SERIES_REFRESH_DAYS = 3;

const media = () => (data.media ||= []);
const stripHtml = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const yearOf = s => ((String(s || '').match(/\b(18|19|20)\d{2}\b/) || [])[0] || '');

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 429 ? 'trop de recherches, réessaie dans un instant' : `erreur ${res.status}`);
  return res.json();
}

// ---------- Recherche ----------

async function searchSeries(q) {
  const r = await getJSON(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`);
  return r.slice(0, 8).map(({ show: s }) => ({
    type: 'series', source: 'tvmaze', extId: s.id, title: s.name, year: yearOf(s.premiered),
    image: s.image && s.image.medium, info: [s.network && s.network.name, (s.genres || []).slice(0, 2).join(', '), s.status === 'Ended' ? 'diffusion terminée' : 'en diffusion'].filter(Boolean).join(' · '),
  }));
}

// Wikipédia (français) : titre, description courte, image ; `hint` oriente la recherche (« film », « jeu vidéo »)
async function searchWikipedia(q, hint, type) {
  const url = 'https://fr.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=8'
    + `&gsrsearch=${encodeURIComponent(`${q} ${hint}`)}&prop=pageimages|description&piprop=thumbnail&pithumbsize=200`;
  const r = await getJSON(url);
  const pages = Object.values((r.query && r.query.pages) || {}).sort((a, b) => a.index - b.index);
  return pages.filter(p => !/homonymie|liste/i.test(p.description || '')).map(p => ({
    type, source: 'wiki', extId: p.pageid, title: p.title.replace(/\s*\((film|jeu vidéo|série télévisée)[^)]*\)$/i, ''),
    year: yearOf(p.description), image: p.thumbnail && p.thumbnail.source, info: p.description || '',
    url: `https://fr.wikipedia.org/?curid=${p.pageid}`,
  }));
}

async function searchFilms(q) {
  try {
    const r = await getJSON(`https://itunes.apple.com/search?media=movie&entity=movie&limit=8&country=FR&term=${encodeURIComponent(q)}`);
    const out = (r.results || []).map(m => ({
      type: 'film', source: 'itunes', extId: m.trackId, title: m.trackName, year: yearOf(m.releaseDate),
      image: m.artworkUrl100 && m.artworkUrl100.replace('100x100', '300x300'),
      runtime: m.trackTimeMillis ? Math.round(m.trackTimeMillis / 60000) : null, director: m.artistName || '',
      info: [m.artistName, m.primaryGenreName, m.trackTimeMillis ? fmtDuration(Math.round(m.trackTimeMillis / 60000)) : ''].filter(Boolean).join(' · '),
    }));
    if (out.length) return out;
  } catch { /* iTunes indisponible : Wikipédia */ }
  return searchWikipedia(q, 'film', 'film');
}

const searchGames = q => searchWikipedia(q, 'jeu vidéo', 'game');

async function searchBooks(q) {
  const r = await getJSON(`https://openlibrary.org/search.json?limit=8&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i&q=${encodeURIComponent(q)}`);
  return (r.docs || []).map(b => ({
    type: 'book', source: 'openlibrary', extId: b.key, title: b.title, year: b.first_publish_year || '',
    author: (b.author_name || []).slice(0, 2).join(', '), pages: b.number_of_pages_median || 0,
    image: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null,
    info: [(b.author_name || [])[0], b.number_of_pages_median ? `${b.number_of_pages_median} p.` : ''].filter(Boolean).join(' · '),
  }));
}

const SEARCHERS = { series: searchSeries, film: searchFilms, game: searchGames, book: searchBooks };

// ---------- Ajout ----------

async function fetchSeriesDetails(tvmazeId) {
  const s = await getJSON(`https://api.tvmaze.com/shows/${tvmazeId}?embed[]=episodes&embed[]=nextepisode`);
  const eps = ((s._embedded && s._embedded.episodes) || [])
    .filter(e => e.season && e.number)
    .map(e => [e.season, e.number, e.name || '', e.airdate || '', e.runtime || s.averageRuntime || 0]);
  const next = s._embedded && s._embedded.nextepisode;
  return {
    episodes: eps, network: (s.network && s.network.name) || (s.webChannel && s.webChannel.name) || '',
    ended: s.status === 'Ended', runtime: s.averageRuntime || s.runtime || 0,
    nextEpisode: next ? { s: next.season, n: next.number, title: next.name, date: next.airdate } : null,
    summary: stripHtml(s.summary).slice(0, 400), refreshed: Date.now(),
  };
}

async function addMedia(r) {
  if (r.type === 'book') {
    if (data.books.some(b => norm(b.title) === norm(r.title))) return { dup: true };
    const b = addBook({ title: r.title, author: r.author, pages: r.pages, themes: [] }, 'todo');
    b.image = r.image;
    b.year = r.year;
    return { item: b };
  }
  if (media().some(m => m.type === r.type && (m.extId === r.extId || norm(m.title) === norm(r.title)))) return { dup: true };
  const item = {
    id: uid(), type: r.type, source: r.source, extId: r.extId, title: r.title, year: r.year, image: r.image || null,
    info: r.info || '', url: r.url || '', status: 'todo', rating: 0, added: toISO(new Date()),
  };
  if (r.type === 'series') Object.assign(item, await fetchSeriesDetails(r.extId), { seen: [] });
  if (r.type === 'film') Object.assign(item, { runtime: r.runtime || null, director: r.director || '' });
  if (r.type === 'game') Object.assign(item, { hours: 0, platform: '', checklist: [] });
  media().push(item);
  return { item };
}

// Import d'une liste : un titre par ligne, avec un préfixe facultatif (« série: », « film: », « jeu: », « livre: »)
async function bulkImport(text, defaultType, onProgress) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const report = { added: [], missing: [], dup: [] };
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    let type = defaultType;
    const m = line.match(/^(s[ée]ries?|films?|jeux?|livres?)\s*:\s*(.+)$/i);
    if (m) {
      const k = lite(m[1]);
      type = k.startsWith('serie') ? 'series' : k.startsWith('film') ? 'film' : k.startsWith('jeu') ? 'game' : 'book';
      line = m[2];
    }
    onProgress && onProgress(i + 1, lines.length, line);
    try {
      const results = await SEARCHERS[type](line);
      if (!results.length) { report.missing.push(line); continue; }
      const res = await addMedia(results[0]);
      (res.dup ? report.dup : report.added).push(results[0].title);
    } catch {
      report.missing.push(line);
    }
    await new Promise(r => setTimeout(r, 250)); // ménage les services gratuits
  }
  save();
  return report;
}

// ---------- Séries : progression ----------

const epKey = e => `${e[0]}x${e[1]}`;
const airedEpisodes = s => s.episodes.filter(e => !e[3] || e[3] <= toISO(new Date()));

function seriesProgress(s) {
  const aired = airedEpisodes(s);
  const seen = new Set(s.seen);
  const nextEp = aired.find(e => !seen.has(epKey(e)));
  return { total: s.episodes.length, aired: aired.length, seen: aired.filter(e => seen.has(epKey(e))).length, nextEp };
}

function toggleEpisode(s, key, on) {
  const set = new Set(s.seen);
  if (on) set.add(key); else set.delete(key);
  s.seen = [...set];
  const p = seriesProgress(s);
  if (p.seen > 0 && s.status === 'todo') s.status = 'doing';
  if (p.aired && p.seen === p.aired && s.ended) { s.status = 'done'; s.finished = toISO(new Date()); }
  else if (s.status === 'done' && p.seen < p.aired) s.status = 'doing';
}

// Séries en cours de diffusion : nouveaux épisodes récupérés tous les 3 jours
async function refreshRunningSeries() {
  const stale = media().filter(m => m.type === 'series' && !m.ended && m.status !== 'dropped'
    && (!m.refreshed || Date.now() - m.refreshed > SERIES_REFRESH_DAYS * 864e5));
  if (!stale.length || !navigator.onLine) return false;
  for (const s of stale) {
    try { Object.assign(s, await fetchSeriesDetails(s.extId)); } catch { /* on réessaiera */ }
  }
  save();
  return true;
}

// ---------- Onglet Médias ----------

function mediaCard(m) {
  const t = MEDIA_TYPES[m.type];
  let progress = '';
  let meta = [m.year, m.info].filter(Boolean).join(' · ');
  if (m.type === 'series') {
    const p = seriesProgress(m);
    progress = `<div class="meter small"><div class="meter-fill" style="width:${p.aired ? (p.seen / p.aired) * 100 : 0}%"></div></div>
      <div class="idea-meta">${p.seen}/${p.aired} épisodes${p.total > p.aired ? ` (+${p.total - p.aired} à venir)` : ''}${p.nextEp ? ` · Prochain : S${pad(p.nextEp[0])}E${pad(p.nextEp[1])}` : ''}</div>`;
    meta = [m.year, m.network, m.ended ? 'diffusion terminée' : 'en diffusion'].filter(Boolean).join(' · ');
  } else if (m.type === 'book') {
    progress = m.pages ? `<div class="meter small"><div class="meter-fill" style="width:${Math.min(100, ((m.page || 0) / m.pages) * 100)}%"></div></div>
      <div class="idea-meta">page ${m.page || 0} / ${m.pages}</div>` : '';
    meta = [m.author, m.year].filter(Boolean).join(' · ');
  } else if (m.type === 'game') {
    const done = (m.checklist || []).filter(c => c.done).length;
    progress = `<div class="idea-meta">${m.hours ? `${m.hours} h jouées` : 'pas encore commencé'}${(m.checklist || []).length ? ` · ${done}/${m.checklist.length} objectifs` : ''}</div>`;
  } else if (m.type === 'film') {
    meta = [m.year, m.director, m.runtime ? fmtDuration(m.runtime) : ''].filter(Boolean).join(' · ') || meta;
  }
  const status = m.type === 'book' ? { todo: 'À lire', reading: 'En cours', done: 'Lu' }[m.status] : MEDIA_STATUS[m.status];
  return `
    <button class="media-card" data-action="${m.type === 'book' ? 'edit-book' : 'open-media'}" data-id="${m.id}">
      ${m.image ? `<img src="${esc(m.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="media-ph">${t.icon}</span>`}
      <span class="idea-main">
        <div class="idea-title">${esc(m.title)}</div>
        <div class="idea-meta">${t.icon} ${t.label} · ${status}${meta ? ` · ${esc(meta)}` : ''}</div>
        ${progress}
      </span>
    </button>`;
}

function renderMedia() {
  const f = state.mediaFilter || 'all';
  const sf = state.mediaStatus || 'active';
  const books = data.books.map(b => ({ ...b, type: 'book', status: b.status }));
  let items = [...media(), ...books];
  if (f !== 'all') items = items.filter(m => m.type === f);
  const isActive = m => (m.type === 'book' ? m.status !== 'done' : !['done', 'dropped'].includes(m.status));
  if (sf === 'active') items = items.filter(isActive);
  else if (sf === 'done') items = items.filter(m => !isActive(m));
  const order = m => (m.status === 'doing' || m.status === 'reading' ? 0 : m.status === 'todo' ? 1 : 2);
  items.sort((a, b) => order(a) - order(b) || String(b.added || '').localeCompare(String(a.added || '')));

  // Séries : épisodes à rattraper
  const toWatch = media().filter(m => m.type === 'series' && m.status === 'doing').map(m => ({ m, p: seriesProgress(m) })).filter(x => x.p.nextEp);

  view.innerHTML = `
    <div class="header"><h1>Médias</h1><button class="icon-btn" data-action="media-add" aria-label="Ajouter">+</button></div>
    <p class="subtitle">Séries, films, jeux et livres : ce que tu regardes, joues et lis</p>
    <div class="row-buttons">
      <button class="primary" data-action="media-add">🔍 Ajouter un titre</button>
      <button class="secondary" data-action="media-bulk">Importer une liste</button>
    </div>
    ${toWatch.length ? `<div class="section-title">À regarder ensuite</div><div class="list">${toWatch.map(({ m, p }) => `
      <div class="idea">
        <span class="idea-main"><div class="idea-title">${esc(m.title)} · S${pad(p.nextEp[0])}E${pad(p.nextEp[1])}</div>
          <div class="idea-meta">${esc(p.nextEp[2] || '')}${p.nextEp[4] ? ` · ${p.nextEp[4]} min` : ''}</div></span>
        <button class="plan-btn" data-action="ep-next" data-id="${m.id}">✓ Vu</button>
      </div>`).join('')}</div>` : ''}
    <div class="chips" style="margin-top:14px">
      ${[['all', 'Tout'], ...Object.entries(MEDIA_TYPES).map(([k, v]) => [k, `${v.icon} ${v.plural}`])].map(([k, l]) => `<button class="chip selectable ${f === k ? 'active' : ''}" data-action="media-filter" data-f="${k}">${l}</button>`).join('')}
    </div>
    <div class="seg" style="max-width:420px">${[['active', 'À suivre'], ['done', 'Terminés'], ['all', 'Tout']].map(([k, l]) => `<button data-action="media-status" data-s="${k}" class="${sf === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${items.length ? `<div class="media-grid">${items.map(mediaCard).join('')}</div>`
      : '<p class="help">Rien ici pour l\'instant. Ajoute un titre ou importe une liste (un titre par ligne).</p>'}`;
}

// ---------- Fenêtres ----------

function openMediaSearch(type = state.mediaFilter && state.mediaFilter !== 'all' ? state.mediaFilter : 'series') {
  sheetForm.innerHTML = `
    <div class="sheet-head"><button type="button" class="text-btn" data-close>Fermer</button><h2>Ajouter un titre</h2><span></span></div>
    <div class="seg">${Object.entries(MEDIA_TYPES).map(([k, v]) => `<button type="button" data-type="${k}" class="${k === type ? 'on' : ''}">${v.icon} ${v.label}</button>`).join('')}</div>
    <div class="field"><label><input type="search" name="q" placeholder="Titre…" autocomplete="off" enterkeyhint="search"></label></div>
    <button type="submit" class="primary">Rechercher</button>
    <div id="media-results"></div>`;
  let current = type;
  let results = [];
  let seq = 0; // seule la dernière recherche lancée s'affiche (les réponses peuvent arriver dans le désordre)
  const box = sheetForm.querySelector('#media-results');
  sheetForm.querySelectorAll('[data-type]').forEach(b => {
    b.onclick = () => {
      current = b.dataset.type;
      sheetForm.querySelectorAll('[data-type]').forEach(x => x.classList.toggle('on', x === b));
      if (sheetForm.q.value.trim()) sheetForm.requestSubmit();
    };
  });
  sheetForm.querySelector('[data-close]').onclick = () => { sheet.close(); render(); };
  sheetForm.onsubmit = async e => {
    e.preventDefault();
    const q = sheetForm.q.value.trim();
    if (!q) return;
    box.innerHTML = '<p class="help">Recherche…</p>';
    const mine = ++seq;
    let found;
    try {
      found = await SEARCHERS[current](q);
    } catch (err) {
      if (mine === seq) box.innerHTML = `<p class="help">Recherche impossible (${esc(err.message)}).</p>`;
      return;
    }
    if (mine !== seq) return;
    results = found;
    box.innerHTML = results.length ? `<div class="list">${results.map((r, i) => `
      <div class="idea">
        ${r.image ? `<img class="thumb" src="${esc(r.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">` : `<span class="media-ph small">${MEDIA_TYPES[r.type].icon}</span>`}
        <span class="idea-main"><div class="idea-title">${esc(r.title)}${r.year ? ` (${r.year})` : ''}</div><div class="idea-meta">${esc(r.info || '')}</div></span>
        <button type="button" class="plan-btn" data-pick="${i}">+ Ajouter</button>
      </div>`).join('')}</div>` : '<p class="help">Aucun résultat. Essaie le titre original ou ajoute-le à la main.</p>';
    box.querySelectorAll('[data-pick]').forEach(b => {
      b.onclick = async () => {
        b.disabled = true;
        b.textContent = '…';
        try {
          const res = await addMedia(results[+b.dataset.pick]);
          save();
          b.textContent = res.dup ? 'Déjà là' : '✓ Ajouté';
        } catch (err) {
          b.disabled = false;
          b.textContent = '+ Ajouter';
          toast(`Ajout impossible : ${err.message}`);
        }
      };
    });
  };
  sheet.showModal();
  setTimeout(() => sheetForm.q.focus(), 50);
}

function openBulkImport() {
  sheetForm.innerHTML = `
    <div class="sheet-head"><button type="button" class="text-btn" data-close>Annuler</button><h2>Importer une liste</h2><button type="submit" class="text-btn">Importer</button></div>
    <p class="help" style="margin:0 4px 10px">Un titre par ligne. Préfixe facultatif pour mélanger les types : <b>série:</b>, <b>film:</b>, <b>jeu:</b>, <b>livre:</b>. L'app cherche chaque titre et ajoute le meilleur résultat.</p>
    <div class="field"><label>Type par défaut <select name="type">${Object.entries(MEDIA_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label></div>
    <div class="field"><label><textarea name="list" rows="9" placeholder="Breaking Bad&#10;The Bear&#10;film: Inception&#10;jeu: Elden Ring&#10;livre: Dune"></textarea></label></div>
    <p class="help" id="bulk-progress"></p>`;
  sheetForm.querySelector('[data-close]').onclick = () => sheet.close();
  sheetForm.onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const text = String(f.get('list') || '');
    if (!text.trim()) return;
    const prog = sheetForm.querySelector('#bulk-progress');
    sheetForm.querySelector('[type=submit]').disabled = true;
    const report = await bulkImport(text, f.get('type'), (i, n, t) => { prog.textContent = `Recherche ${i}/${n} : ${t}…`; });
    prog.innerHTML = `✓ ${report.added.length} ajouté${report.added.length > 1 ? 's' : ''}${report.dup.length ? ` · ${report.dup.length} déjà présent${report.dup.length > 1 ? 's' : ''}` : ''}`
      + (report.missing.length ? `<br>Introuvables : ${report.missing.map(esc).join(', ')}` : '');
    sheetForm.querySelector('[data-close]').textContent = 'Fermer';
    sheetForm.querySelector('[data-close]').onclick = () => { sheet.close(); render(); };
  };
  sheet.showModal();
}

function statusSelect(m) {
  return `<label>Statut <select name="status">${Object.entries(MEDIA_STATUS).map(([k, v]) => `<option value="${k}" ${k === m.status ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
    <label>Note <select name="rating"><option value="0">–</option>${[1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === m.rating ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></label>`;
}

function openMediaSheet(m) {
  const head = `
    <div class="media-head">
      ${m.image ? `<img src="${esc(m.image)}" alt="" onerror="this.style.visibility='hidden'">` : `<span class="media-ph">${MEDIA_TYPES[m.type].icon}</span>`}
      <div><h2>${esc(m.title)}</h2><div class="idea-meta">${esc([m.year, m.network || m.director, m.info && m.type !== 'series' ? m.info : ''].filter(Boolean).join(' · '))}</div>
      ${m.url ? `<a class="text-btn" href="${esc(m.url)}" target="_blank" rel="noopener" style="padding:0">Wikipédia ↗</a>` : ''}</div>
    </div>`;
  let body = '';
  if (m.type === 'series') {
    const p = seriesProgress(m);
    const seen = new Set(m.seen);
    const seasons = [...new Set(m.episodes.map(e => e[0]))];
    const today = toISO(new Date());
    body = `
      ${m.summary ? `<p class="help" style="margin:0 4px 10px">${esc(m.summary)}</p>` : ''}
      <div class="card"><div class="idea-title">${p.seen}/${p.aired} épisodes vus${m.runtime ? ` · ${m.runtime} min chacun` : ''}</div>
        <div class="meter small"><div class="meter-fill" style="width:${p.aired ? (p.seen / p.aired) * 100 : 0}%"></div></div>
        <div class="idea-meta">${p.aired - p.seen > 0 && m.runtime ? `Encore ≈ ${fmtDuration((p.aired - p.seen) * m.runtime)} pour rattraper` : p.aired ? 'À jour 🎉' : ''}${m.nextEpisode ? ` · Prochain épisode le ${fmtShort(fromISO(m.nextEpisode.date))}` : ''}</div></div>
      ${seasons.map(sn => {
        const eps = m.episodes.filter(e => e[0] === sn);
        const seenN = eps.filter(e => seen.has(epKey(e))).length;
        return `<details class="season" ${eps.some(e => !seen.has(epKey(e))) && seasons.indexOf(sn) === seasons.findIndex(x => m.episodes.some(e => e[0] === x && !seen.has(epKey(e)))) ? 'open' : ''}>
          <summary><b>Saison ${sn}</b><span class="idea-meta">${seenN}/${eps.length}</span>
            <button type="button" class="text-btn" data-season="${sn}" style="padding:0 0 0 10px">${seenN === eps.length ? 'Tout décocher' : 'Tout cocher'}</button></summary>
          <div class="field">${eps.map(e => `
            <label class="step ${e[3] && e[3] > today ? 'future' : ''}"><span><b>${e[1]}.</b> ${esc(e[2])}<br><small>${e[3] ? fmtShort(fromISO(e[3])) : ''}${e[4] ? ` · ${e[4]} min` : ''}</small></span>
              <input type="checkbox" data-ep="${epKey(e)}" ${seen.has(epKey(e)) ? 'checked' : ''} ${e[3] && e[3] > today ? 'disabled' : ''}></label>`).join('')}</div>
        </details>`;
      }).join('')}`;
  } else if (m.type === 'film') {
    body = `<div class="field">
      <label>Durée (min) <input type="number" name="runtime" min="1" inputmode="numeric" value="${m.runtime || ''}"></label>
      <label>Réalisateur <input type="text" name="director" value="${esc(m.director || '')}"></label></div>`;
  } else if (m.type === 'game') {
    body = `<div class="field">
      <label>Heures jouées <input type="number" name="hours" min="0" step="0.5" inputmode="decimal" value="${m.hours || 0}"></label>
      <label>Plateforme <input type="text" name="platform" value="${esc(m.platform || '')}" placeholder="PS5, Switch, PC…"></label></div>
      <div class="section-title">Objectifs / chapitres</div>
      <div class="field">${(m.checklist || []).map(c => `<label class="step"><span>${esc(c.title)}</span><input type="checkbox" name="c-${c.id}" ${c.done ? 'checked' : ''}></label>`).join('')}
        <label><input type="text" name="newcheck" placeholder="+ Ajouter (chapitre, boss, trophée…)"></label></div>`;
  }
  sheetForm.innerHTML = `
    <div class="sheet-head"><button type="button" class="text-btn" data-close>Fermer</button><span></span><button type="submit" class="text-btn">OK</button></div>
    ${head}
    <div class="field">${statusSelect(m)}</div>
    ${body}
    <button type="button" class="danger" data-delete>Retirer de mes médias</button>`;
  // Épisodes : enregistrés dès qu'on coche
  sheetForm.querySelectorAll('[data-ep]').forEach(cb => {
    cb.onchange = () => { toggleEpisode(m, cb.dataset.ep, cb.checked); save(); };
  });
  sheetForm.querySelectorAll('[data-season]').forEach(b => {
    b.onclick = ev => {
      ev.preventDefault();
      const sn = +b.dataset.season;
      const eps = airedEpisodes(m).filter(e => e[0] === sn);
      const allSeen = eps.every(e => m.seen.includes(epKey(e)));
      eps.forEach(e => toggleEpisode(m, epKey(e), !allSeen));
      save();
      openMediaSheet(m);
    };
  });
  sheetForm.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(sheetForm);
    const status = f.get('status');
    if (status === 'done' && m.status !== 'done') m.finished = toISO(new Date());
    Object.assign(m, { status, rating: +f.get('rating') || 0 });
    if (m.type === 'film') Object.assign(m, { runtime: +f.get('runtime') || null, director: String(f.get('director') || '').trim() });
    if (m.type === 'game') {
      (m.checklist || []).forEach(c => { c.done = f.get(`c-${c.id}`) === 'on'; });
      const nc = String(f.get('newcheck') || '').trim();
      if (nc) m.checklist.push({ id: uid(), title: nc, done: false });
      Object.assign(m, { hours: +String(f.get('hours')).replace(',', '.') || 0, platform: String(f.get('platform') || '').trim() });
      if (m.hours > 0 && m.status === 'todo') m.status = 'doing';
      save();
      if (nc) { openMediaSheet(m); return; }
    }
    save();
    sheet.close();
    render();
  };
  bindSheetButtons(() => { data.media = media().filter(x => x !== m); });
  // Fermer met aussi la liste à jour (épisodes cochés)
  sheetForm.querySelector('[data-close]').onclick = () => { sheet.close(); render(); };
  sheet.showModal();
}
