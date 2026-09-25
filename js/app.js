// Reinado de Primavera 2026 — pantalla en vivo.
//
// Solo lee el nodo /publico de Firebase Realtime Database, que publica el
// sistema del evento (Laravel) con cada cambio. Es exactamente lo que muestra
// el proyector: mientras no llega la revelación no trae cifras ni puestos.
// Esta página no puede escribir nada (las reglas de Firebase lo impiden).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getDatabase, ref, onValue } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAfi7LgZWZ_vIv8YoItmjnoCS5VDgVeKP0',
  authDomain: 'reinado-688ec.firebaseapp.com',
  databaseURL: 'https://reinado-688ec-default-rtdb.firebaseio.com',
  projectId: 'reinado-688ec',
  storageBucket: 'reinado-688ec.firebasestorage.app',
  messagingSenderId: '830001495734',
  appId: '1:830001495734:web:42cd943ffab02239733017',
};

const db = getDatabase(initializeApp(firebaseConfig));

const FALLBACK = 'img/avatar.svg';
const main = document.getElementById('main');
const chip = document.getElementById('mode-chip');
const chipText = document.getElementById('mode-text');
const conn = document.getElementById('conn');
const reactionsLayer = document.getElementById('reactions');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let serverOffset = 0;          // reloj de Firebase − reloj de este equipo
let renderedKey = null;        // qué está dibujado (para no redibujar sin motivo)
let cleanups = [];             // timers y listeners del modo actual
let liveUpdater = null;        // actualiza la lista de sobres sin redibujar
let revealPlayed = false;      // la cortina de la ganadora corre una sola vez
let lastState = null;          // último /publico recibido
const votingClosed = st => !!st.votingEnd && (Date.now() + serverOffset) >= st.votingEnd;

// ------------------------------------------------------------------ util
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const photo = p => p || FALLBACK;
const money = n => 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = n => Number(n || 0).toLocaleString('es-PE');
const roundLabel = r => (r === 1 ? '1.er' : r === 3 ? '3.er' : r + '.º') + ' llamado';
const onErr = `onerror="this.onerror=null;this.src='${FALLBACK}'"`;
const later = (fn, ms) => { const t = setTimeout(fn, ms); cleanups.push(() => clearTimeout(t)); return t; };
const every = (fn, ms) => { const t = setInterval(fn, ms); cleanups.push(() => clearInterval(t)); return t; };
const listen = (el, ev, fn) => { el.addEventListener(ev, fn); cleanups.push(() => el.removeEventListener(ev, fn)); };
const hhmm = ms => new Date(ms).toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
const list = v => Array.isArray(v) ? v.filter(Boolean) : Object.values(v || {});

function resetMode() {
  cleanups.forEach(fn => fn());
  cleanups = [];
  liveUpdater = null;
  reactionsLayer.innerHTML = '';
  document.querySelectorAll('.curtain, .countdown, .confetti, .handover').forEach(e => e.remove());
}

// Pétalos del fondo
(function ambient() {
  const box = document.getElementById('ambient');
  let html = '';
  for (let i = 0; i < 22; i++) {
    html += `<span class="p ${['', 'g', 'w'][i % 3]}" style="left:${Math.random() * 100}%; animation-duration:${16 + Math.random() * 14}s; animation-delay:-${Math.random() * 30}s"></span>`;
  }
  box.innerHTML = html;
})();

// Ajusta la grilla para que todas las tarjetas entren sin scroll.
const wide = window.matchMedia('(min-width:901px) and (min-height:521px)');
function fit(grid) {
  const n = grid.children.length;
  if (!n) return;
  if (!wide.matches) { grid.style.gridTemplateColumns = ''; grid.style.removeProperty('--cw'); return; }
  const gap = parseFloat(getComputedStyle(grid).columnGap) || 16;
  const ratio = parseFloat(grid.dataset.ratio) || .75;
  const W = grid.clientWidth, H = grid.clientHeight;
  let best = { score: 0, w: 0, c: 1 };
  for (let c = 1; c <= n; c++) {
    const r = Math.ceil(n / c);
    const w = Math.min((W - gap * (c - 1)) / c, ((H - gap * (r - 1)) / r) * ratio);
    const score = w * (1 + .08 * (r - 1));
    if (score > best.score) best = { score, w, c };
  }
  const w = Math.max(60, Math.floor(best.w));
  grid.style.setProperty('--cw', w + 'px');
  grid.style.gridTemplateColumns = `repeat(${best.c}, ${w}px)`;
}
const fitAll = () => document.querySelectorAll('.fit').forEach(fit);
window.addEventListener('resize', fitAll);
wide.addEventListener?.('change', fitAll);
document.fonts?.ready.then(fitAll);

// ------------------------------------------------------------------ grilla de candidatas
function rosterHtml(state, { compact = false, liveId = null, title = 'Candidatas en competencia', pie = '' } = {}) {
  const cands = list(state.candidates);
  const fbShort = (state.facebookPage || '').replace(/^https?:\/\/(web\.|www\.)?/, '').replace(/\/$/, '');
  const cards = cands.map((c, i) => {
    const onStage = compact && liveId && Number(liveId) === Number(c.id);
    return `
      <article class="candidata ${onStage ? 'on-stage' : ''}" style="--d:${i * 70}ms"
        data-i="${i}" data-name="${esc(c.name)}" data-program="${esc(c.program)}" data-img="${esc(photo(c.photo))}" data-facebook="${esc(c.facebook || '')}">
        <img src="${esc(photo(c.photo))}" alt="Foto ${esc(c.name)}" decoding="async" ${onErr}>
        ${onStage ? '<span class="stage-flag">● En el atril</span>' : ''}
        <div class="info">
          <div class="name">${esc(c.name)}</div>
          <div class="program">${esc(c.program)}</div>
        </div>
      </article>`;
  }).join('');

  const closed = votingClosed(state);
  const tickerItems = (closed ? [
    '🔒 La votación por Facebook cerró a las ' + hhmm(state.votingEnd),
    '💌 Primer llamado de sobres' + (state.firstRoundAt ? ' a las ' + hhmm(state.firstRoundAt) : ''),
    '👑 Los resultados se revelan en la ceremonia final',
  ] : [
    '💖 Cada “Me gusta” en Facebook cuenta como un voto',
    '🌸 ' + (pie || 'Los resultados se revelan en la ceremonia final.'),
    '📲 Reacciona en sus publicaciones de Facebook' + (fbShort ? ': ' + fbShort : ''),
    '👑 Los resultados se revelan en la ceremonia final',
  ]).map(t => `<span>${esc(t)}</span>`).join('');

  return `
    <section class="roster ${compact ? 'strip' : 'showcase'}">
      ${compact ? '' : `<div class="roster-bg" aria-hidden="true">${cands.map(c => `<img src="${esc(photo(c.photo))}" alt="">`).join('')}</div>`}
      <div class="roster-head">
        <h2 class="display section-title">${esc(title)}</h2>
        <span class="tag">🤫 Resultados en reserva</span>
        ${compact || closed ? '' : '<span class="now-pill" id="now-pill" hidden>💖 ¡Dale tu “Me gusta” a <b id="now-name"></b>!</span>'}
      </div>
      ${compact || !state.votingEnd ? '' : `
        <div class="vote-band" id="vote-band">
          <div class="vb-label">
            <div class="eyebrow" id="vb-kicker">Votación por Facebook abierta</div>
            <div class="vb-title" id="vb-title">Cierra a las <b>${esc(hhmm(state.votingEnd))}</b></div>
          </div>
          <div class="vb-clock">
            <div class="seg"><b id="vb-h">--</b><span>horas</span></div><i>:</i>
            <div class="seg"><b id="vb-m">--</b><span>minutos</span></div><i>:</i>
            <div class="seg"><b id="vb-s">--</b><span>segundos</span></div>
          </div>
          <div class="vb-hint" id="vb-hint">Cada “Me gusta” en su publicación de Facebook cuenta como un voto</div>
        </div>`}
      ${cands.length
        ? `<div class="candidatas fit" data-ratio="0.75">${cards}</div>`
        : '<div class="card pad muted" style="text-align:center; padding:48px">Aún no hay candidatas registradas.</div>'}
      ${compact ? '' : `
        <div class="ticker"><div class="ticker-track">${tickerItems}${tickerItems}</div></div>
        <dialog class="cand-sheet" id="cand-sheet" data-page="${esc(state.facebookPage || '')}">
          <button class="close" type="button" aria-label="Cerrar">✕</button>
          <img id="sheet-img" src="" alt="">
          <div class="body">
            <div class="eyebrow">Candidata · Reinado de Primavera</div>
            <h3 class="display" id="sheet-name"></h3>
            <div class="pg" id="sheet-program"></div>
            <div class="links" id="sheet-links"></div>
            <p class="hint">Cada “Me gusta” en su publicación de Facebook cuenta como un voto.</p>
          </div>
        </dialog>`}
    </section>`;
}

// Foco rotativo, fondo, reacciones que suben, tilt 3D y ficha al tocar.
function initShowcase() {
  const roster = main.querySelector('.roster.showcase');
  if (!roster) return;
  const grid = roster.querySelector('.candidatas');
  const cards = grid ? [...grid.querySelectorAll('.candidata')] : [];
  if (!cards.length) return;
  const bgs = [...roster.querySelectorAll('.roster-bg img')];
  const pill = document.getElementById('now-pill');
  const pillName = document.getElementById('now-name');
  const emojis = ['👍', '❤️', '😍', '🌸', '💖', '👏', '✨', '🌷'];
  let i = -1, paused = false;

  function burst(card) {
    if (reduceMotion) return;
    const r = card.getBoundingClientRect();
    for (let k = 0; k < 14; k++) {
      const e = document.createElement('span');
      e.textContent = emojis[Math.floor(Math.random() * emojis.length)];
      e.style.left = (r.left + r.width * (.15 + Math.random() * .7)) + 'px';
      e.style.top = (r.top + r.height * (.55 + Math.random() * .35)) + 'px';
      e.style.setProperty('--dx', ((Math.random() - .5) * 8) + 'vw');
      e.style.setProperty('--rot', ((Math.random() - .5) * 60) + 'deg');
      e.style.setProperty('--t', (2.4 + Math.random() * 1.8) + 's');
      e.style.animationDelay = (k * 90) + 'ms';
      reactionsLayer.appendChild(e);
      setTimeout(() => e.remove(), 5200);
    }
  }
  function spotlight(k) {
    i = ((k % cards.length) + cards.length) % cards.length;
    const card = cards[i];
    grid.classList.add('has-star');
    cards.forEach((c, j) => c.classList.toggle('star', j === i));
    card.classList.remove('star'); void card.offsetWidth; card.classList.add('star');
    bgs.forEach((b, j) => b.classList.toggle('on', j === i));
    if (pill) {
      pill.hidden = false;
      pillName.textContent = card.dataset.name;
      pill.classList.remove('swap'); void pill.offsetWidth; pill.classList.add('swap');
    }
    burst(card);
  }
  later(() => { spotlight(0); every(() => { if (!paused) spotlight(i + 1); }, 4200); }, 700 + cards.length * 70);

  const sheet = document.getElementById('cand-sheet');
  function openSheet(card) {
    if (!sheet || typeof sheet.showModal !== 'function') return;
    document.getElementById('sheet-img').src = card.dataset.img;
    document.getElementById('sheet-name').textContent = card.dataset.name;
    document.getElementById('sheet-program').textContent = card.dataset.program;
    const links = document.getElementById('sheet-links');
    links.innerHTML = '';
    const url = card.dataset.facebook || sheet.dataset.page;
    if (url) {
      const a = document.createElement('a');
      a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.className = 'btn primary';
      a.textContent = card.dataset.facebook ? '👍 Dar “Me gusta” en Facebook' : 'Ver en la página de Facebook';
      links.appendChild(a);
    }
    paused = true;
    sheet.showModal();
    burst(card);
  }
  cards.forEach((card, j) => {
    listen(card, 'pointermove', ev => {
      const r = card.getBoundingClientRect();
      const x = (ev.clientX - r.left) / r.width - .5, y = (ev.clientY - r.top) / r.height - .5;
      card.style.transform = `perspective(900px) rotateY(${x * 14}deg) rotateX(${-y * 14}deg)`;
    });
    listen(card, 'pointerenter', () => { paused = true; if (j !== i) spotlight(j); });
    listen(card, 'pointerleave', () => { card.style.transform = ''; paused = false; });
    listen(card, 'click', () => openSheet(card));
  });
  if (sheet) {
    listen(sheet.querySelector('.close'), 'click', () => sheet.close());
    listen(sheet, 'click', ev => { if (ev.target === sheet) sheet.close(); });
    listen(sheet, 'close', () => { paused = false; });
  }
}

// Reloj grande: al corte de Facebook y, después, al 1.er llamado.
function initVoteClock(state) {
  const band = document.getElementById('vote-band');
  if (!band) return;
  const $ = id => document.getElementById(id);
  const pad = n => String(n).padStart(2, '0');
  const cut = state.votingEnd, first = state.firstRoundAt || 0;
  const openAtRender = (Date.now() + serverOffset) < cut;
  const tick = () => {
    const now = Date.now() + serverOffset;
    // Al cruzar el corte, redibuja para que todos los textos digan "cerrada".
    if (openAtRender && now >= cut) { renderedKey = null; render(lastState); return true; }
    let target, kicker, title, hint;
    if (now < cut) {
      target = cut; kicker = 'Votación por Facebook abierta';
      title = 'Cierra a las <b>' + esc(hhmm(cut)) + '</b>';
      hint = 'Cada “Me gusta” en su publicación de Facebook cuenta como un voto';
    } else if (first && now < first) {
      target = first; kicker = '🔒 Votación por Facebook cerrada';
      title = '1.er llamado a las <b>' + esc(hhmm(first)) + '</b>';
      hint = 'Preparen sus sobres: el conteo empieza en';
    } else {
      band.className = 'vote-band closed done';
      $('vb-kicker').textContent = '🔒 Votación por Facebook cerrada';
      $('vb-title').innerHTML = 'El conteo de sobres <b>empieza en instantes</b>';
      $('vb-hint').textContent = 'Los resultados se revelan en la ceremonia final';
      return true;
    }
    const ms = Math.max(0, target - now);
    band.classList.toggle('closed', target !== cut);
    band.classList.toggle('urgent', ms < 10 * 60 * 1000);
    $('vb-kicker').textContent = kicker; $('vb-title').innerHTML = title; $('vb-hint').textContent = hint;
    $('vb-h').textContent = pad(Math.floor(ms / 3600000));
    $('vb-m').textContent = pad(Math.floor(ms / 60000) % 60);
    $('vb-s').textContent = pad(Math.floor(ms / 1000) % 60);
    return false;
  };
  if (!tick()) { const t = every(() => { if (tick()) clearInterval(t); }, 1000); }
}

// ------------------------------------------------------------------ modo: votación
function renderVotes(state) {
  main.innerHTML = rosterHtml(state, { pie: 'La votación por Facebook está abierta hasta las ' + hhmm(state.votingEnd) + '. El conteo se revela en la ceremonia final.' });
  fitAll();
  initShowcase();
  initVoteClock(state);
}

// ------------------------------------------------------------------ modo: conteo de sobres
function renderEnvelopes(state) {
  const cands = list(state.candidates);
  const live = state.live;
  const cand = live ? cands.find(c => Number(c.id) === Number(live.id)) : null;

  if (!cand) {
    main.innerHTML = rosterHtml(state, { pie: 'En unos momentos empieza el conteo de sobres.' });
    fitAll();
    initShowcase();
    return;
  }

  main.innerHTML = `
    <section class="live-stage">
      <div class="live-portrait">
        <img src="${esc(photo(cand.photo))}" alt="Foto ${esc(cand.name)}" ${onErr}>
        <span class="chip live"><span class="dot"></span> En vivo</span>
        <div class="cap">
          <div class="display">${esc(cand.name)}</div>
          <div class="small">${esc(cand.program)}</div>
        </div>
      </div>
      <div class="live-main">
        <div class="live-top">
          <span class="round-badge">${esc(roundLabel(state.round))}</span>
          <div class="eyebrow">Sesión de conteo – ${esc(cand.name)}</div>
        </div>
        <div class="bump">
          <div class="live-total-label">Recaudado en este llamado</div>
          <div id="live-total" class="live-total num gold-text">S/ 0.00</div>
          <div id="live-pop" class="pop"></div>
        </div>
        <div class="live-meta"><span id="live-count">0 sobres</span><span>·</span><span id="live-last">Esperando el primer sobre…</span></div>
        <div class="live-list">
          <table><thead><tr><th>#</th><th>Código</th><th>Hora</th><th class="right">Monto</th></tr></thead><tbody id="live-body"></tbody></table>
          <div class="empty-live" id="live-empty">💌 Los sobres de este llamado aparecerán aquí a medida que se abran.</div>
        </div>
      </div>
    </section>
    ${rosterHtml(state, { compact: true, liveId: live.id })}`;
  fitAll();

  const totalEl = document.getElementById('live-total');
  const popEl = document.getElementById('live-pop');
  const body = document.getElementById('live-body');
  let shown = 0, known = null;

  function animateTotal(to) {
    const from = shown, start = performance.now(), dur = 1400;
    shown = to;
    const step = t => {
      const k = Math.min(1, (t - start) / dur), e = 1 - Math.pow(1 - k, 3);
      totalEl.textContent = money(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  liveUpdater = liveState => {
    const items = list(liveState?.items);
    const first = known === null;
    const prev = known || new Set();
    const fresh = items.filter(it => !prev.has(it.id));
    known = new Set(items.map(it => it.id));
    const sum = items.reduce((a, it) => a + Number(it.amount || 0), 0);

    body.innerHTML = items.slice().reverse().map((it, idx) => `
      <tr class="${!first && fresh.some(f => f.id === it.id) ? 'new' : ''}">
        <td class="muted">${items.length - idx}</td>
        <td>${it.code ? esc(it.code) : '—'}</td>
        <td class="muted num">${esc(it.at)}</td>
        <td class="amt num">${money(it.amount)}</td>
      </tr>`).join('');
    document.getElementById('live-empty').style.display = items.length ? 'none' : 'block';
    document.getElementById('live-count').textContent = items.length + (items.length === 1 ? ' sobre' : ' sobres');
    if (items.length) document.getElementById('live-last').textContent = 'Último: ' + money(items[items.length - 1].amount);

    if (first) { shown = sum; totalEl.textContent = money(sum); return; }
    if (sum !== shown) {
      if (fresh.length) {
        popEl.textContent = '+ ' + money(fresh.reduce((a, f) => a + Number(f.amount || 0), 0));
        popEl.classList.remove('go'); void popEl.offsetWidth; popEl.classList.add('go');
      }
      animateTotal(sum);
    }
  };
  liveUpdater(live);
}

// ------------------------------------------------------------------ modo: intermedio
function renderGrace(state) {
  const cands = list(state.candidates);
  const round = Number(state.round || 1);
  const hasNext = round < 3;
  const legacy = state.legacy;

  main.innerHTML = `
    <section class="inter" id="inter">
      <div class="inter-bg" id="inter-bg">${cands.map(c => `<img src="${esc(photo(c.photo))}" alt="">`).join('')}</div>
      <div class="inter-head">
        <div class="inter-title">
          <div class="eyebrow">Intermedio · ${esc(roundLabel(round))} concluido</div>
          ${hasNext
            ? `<h2 class="display">Próximo: <span class="script gold-text">${esc(roundLabel(round + 1))}</span></h2><p>Preparen sus sobres. Los resultados siguen en reserva.</p>`
            : '<h2 class="display">Se viene la <span class="script gold-text">coronación</span></h2><p>El conteo está cerrado y los resultados, sellados.</p>'}
        </div>
        ${state.nextRoundAt ? `
          <div class="countdown-box">
            <div class="lbl">${hasNext ? 'Empieza en' : 'Faltan'}</div>
            <div class="clock" id="clock">--:--</div>
            <div class="at">${esc(hhmm(state.nextRoundAt))} h</div>
          </div>` : ''}
      </div>
      ${cands.length ? `
        <div class="carousel" id="carousel"><div class="ring" id="ring">
          ${cands.map(c => `<div class="slot" data-name="${esc(c.name)}" data-program="${esc(c.program)}"><img src="${esc(photo(c.photo))}" alt="Foto ${esc(c.name)}" ${onErr}></div>`).join('')}
        </div></div>
        ${legacy ? `<div class="legacy-medal"><img src="${esc(legacy.photo)}" alt=""><div><div class="k">Reina ${esc(legacy.year)}</div><div class="v">${esc(legacy.name)}</div></div></div>` : ''}
        <div class="spotlight">
          <div id="spot-text"></div>
          <div class="dots" id="dots">${cands.map(() => '<span></span>').join('')}</div>
        </div>` : '<div class="carousel"><div class="muted">Aún no hay candidatas registradas.</div></div>'}
    </section>`;

  const clock = document.getElementById('clock');
  if (clock) {
    const pad = n => String(n).padStart(2, '0');
    const tick = () => {
      const left = Math.max(0, state.nextRoundAt - (Date.now() + serverOffset));
      const h = Math.floor(left / 3600000), m = Math.floor(left / 60000) % 60, s = Math.floor(left / 1000) % 60;
      clock.textContent = left <= 0 ? '¡Ya!' : (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(s);
    };
    tick(); every(tick, 1000);
  }

  const ring = document.getElementById('ring');
  if (!ring) return;
  const carousel = document.getElementById('carousel');
  const slots = [...ring.children], n = slots.length, step = 360 / n;
  const bgs = [...document.querySelectorAll('#inter-bg img')];
  const dots = [...document.querySelectorAll('#dots span')];
  const text = document.getElementById('spot-text');
  let i = 0, radius = 0;

  const layout = () => {
    const h = carousel.clientHeight * .82;
    const w = Math.min(h * .75, carousel.clientWidth * .24);
    ring.style.setProperty('--cw', w + 'px');
    radius = n < 3 ? w * .9 : Math.round((w / 2) / Math.tan(Math.PI / n) * 1.75);
    slots.forEach((el, k) => { el.style.transform = `rotateY(${k * step}deg) translateZ(${radius}px)`; });
    ring.style.transform = `translateZ(${-radius}px) rotateY(${-i * step}deg)`;
  };
  const show = k => {
    i = k;
    ring.style.transform = `translateZ(${-radius}px) rotateY(${-i * step}deg)`;
    const cur = ((i % n) + n) % n;
    slots.forEach((el, j) => el.classList.toggle('on', j === cur));
    dots.forEach((el, j) => el.classList.toggle('on', j === cur));
    bgs.forEach((el, j) => el.classList.toggle('on', j === cur));
    text.innerHTML = `<div class="nm swap">${esc(slots[cur].dataset.name)}</div><div class="pg swap">${esc(slots[cur].dataset.program)}</div>`;
    const slot = slots[cur];
    slot.classList.remove('on'); void slot.offsetWidth; slot.classList.add('on');
  };
  for (let k = 0; k < 10; k++) {
    const sp = document.createElement('span');
    sp.className = 'sparkle';
    sp.style.left = (38 + Math.random() * 24) + '%';
    sp.style.top = (8 + Math.random() * 84) + '%';
    sp.style.animationDelay = (Math.random() * 2.6) + 's';
    carousel.appendChild(sp);
  }
  layout(); show(0);
  listen(window, 'resize', layout);
  if (n > 1) every(() => show(i + 1), 4500);
}

// ------------------------------------------------------------------ modo: ganadora
function renderWinner(state) {
  const cands = list(state.candidates);
  const byId = Object.fromEntries(cands.map(c => [String(c.id), c]));
  const results = list(state.results);
  const winner = byId[String(state.winnerId)] || cands[0] || null;
  const maxTotal = Math.max(0.01, ...results.map(r => Number(r.total || 0)));
  const legacy = state.legacy;
  const w = state.weights || {};

  main.innerHTML = `
    <section class="stage" id="stage">
      <div class="rays"></div>
      <div class="spot" id="spot"></div>
      <div class="reveal" id="hero">
        <div class="winner-hero">
          <div class="crown">👑</div>
          <div class="eyebrow">Reina de Primavera</div>
          <div class="winner-portrait"><img src="${esc(photo(winner?.photo))}" alt="Ganadora" ${onErr}></div>
          <h2 class="display winner-name gold-text">${esc(winner?.name || 'Ganadora')}</h2>
          <div class="winner-program">${esc(winner?.program || '')}</div>
          ${legacy ? `<div class="winner-succ">Recibe la corona de <b>${esc(legacy.name)}</b>, Reina ${esc(legacy.year)}</div>` : ''}
        </div>
        <div class="ranking">
          <div class="ranking-head">
            <h2 class="display">Resultados finales</h2>
            <span class="tag">${esc(w.social ?? '')}% redes · ${esc(w.money ?? '')}% sobres</span>
          </div>
          <ol>
            ${results.map((r, i) => {
              const c = byId[String(r.id)] || {};
              return `
                <li class="rank-row ${i === 0 ? 'r1' : ''}" style="--i:${i}">
                  <div class="pos"><span class="medal ${i < 3 ? 'm' + (i + 1) : ''}">${i + 1}</span><small>Puesto ${i + 1}</small></div>
                  <img class="avatar" src="${esc(photo(c.photo))}" alt="" ${onErr}>
                  <div class="who">
                    <div class="nm">${esc(c.name || '')}</div>
                    <div class="meta">${intFmt(r.r)} “Me gusta” · ${money(r.m)}</div>
                    <div class="bar"><span style="width:${Math.round(Number(r.total || 0) / maxTotal * 100)}%"></span></div>
                  </div>
                  <div class="pts num">${Number(r.total || 0).toFixed(2)}<small>pts</small></div>
                </li>`;
            }).join('')}
          </ol>
        </div>
      </div>
      <button class="btn sm ghost replay" id="replay" type="button">↻ Repetir</button>
    </section>`;

  const overlays = document.createElement('div');
  overlays.innerHTML = `
    <div class="curtain" id="curtain"><div class="panel left"></div><div class="panel right"></div></div>
    ${legacy ? `
      <div class="handover" id="handover"><div>
        <div class="k">Reina de Primavera ${esc(legacy.year)}</div>
        <div class="pic"><span class="crown-fly">👑</span><img src="${esc(legacy.photo)}" alt=""></div>
        <h2 class="display nm gold-text">${esc(legacy.name)}</h2>
        <div class="pg">${esc(legacy.program)}</div>
        <div class="msg">entrega su corona…</div>
      </div></div>` : ''}
    <div class="countdown hide" id="countdown"><div class="n" id="count-n">10</div><div class="lbl">Y la nueva reina es…</div></div>
    <div class="confetti" id="confetti"></div>`;
  document.getElementById('page').append(...overlays.children);

  const stage = document.getElementById('stage');
  const curtain = document.getElementById('curtain');
  const spot = document.getElementById('spot');
  const countdown = document.getElementById('countdown');
  const countN = document.getElementById('count-n');
  const hero = document.getElementById('hero');
  const confetti = document.getElementById('confetti');
  const handover = document.getElementById('handover');
  const colors = ['var(--gold)', 'var(--gold-2)', 'var(--rose)', 'var(--rose-2)', '#ffffff'];
  let run = 0;

  const piece = () => {
    const p = document.createElement('span');
    p.className = 'petal' + (Math.random() < .35 ? ' sq' : '');
    p.style.left = Math.random() * 100 + '%';
    p.style.top = (-10 - Math.random() * 20) + 'vh';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.animationDuration = (4 + Math.random() * 4) + 's';
    p.style.animationDelay = (-Math.random() * 2) + 's';
    confetti.appendChild(p);
    setTimeout(() => p.remove(), 8000);
  };
  const burst = n => { for (let i = 0; i < n; i++) later(piece, i * 10); };
  const wait = ms => new Promise(r => later(r, ms));

  function finale() {
    countdown.classList.add('hide');
    curtain.style.display = 'none';
    stage.classList.add('show-rays');
    hero.classList.add('show');
    burst(200);
    every(() => burst(40), 3200);
  }

  async function play() {
    const me = ++run;
    hero.classList.remove('show');
    stage.classList.remove('show-rays');
    curtain.style.display = '';
    curtain.classList.remove('open'); void curtain.offsetHeight; curtain.classList.add('open');
    spot.classList.remove('on'); void spot.offsetHeight; spot.classList.add('on');

    if (handover) {
      handover.classList.remove('out', 'show'); void handover.offsetWidth; handover.classList.add('show');
      await wait(6000); if (me !== run) return;
      handover.classList.add('out');
      await wait(900); if (me !== run) return;
      handover.classList.remove('show', 'out');
    }
    countdown.classList.remove('hide');
    for (let n = 10; n >= 1; n--) {
      if (me !== run) return;
      countN.textContent = n;
      countN.classList.remove('tick'); void countN.offsetWidth; countN.classList.add('tick');
      await wait(750);
    }
    if (me !== run) return;
    finale();
  }

  listen(document.getElementById('replay'), 'click', play);
  // La cortina corre una sola vez: si solo se actualizan cifras, se muestra el final.
  if (revealPlayed) { finale(); } else { revealPlayed = true; play(); }
}

// ------------------------------------------------------------------ chip del modo
function setChip(state) {
  const texts = {
    votes: votingClosed(state) ? 'Votación por Facebook cerrada' : 'Votación por Facebook en curso',
    envelopes: 'Conteo de sobres · ' + roundLabel(Number(state.round || 1)),
    grace: 'Intermedio',
    winner: '¡Tenemos reina!',
  };
  chip.className = 'chip mode-' + state.mode + (state.mode === 'envelopes' ? ' live' : '');
  document.getElementById('page').className = 'page mode-' + state.mode;
  chipText.textContent = texts[state.mode] || 'En vivo';
}

// ------------------------------------------------------------------ Firebase
function render(state) {
  lastState = state;
  if (!state || !state.mode) {
    resetMode();
    renderedKey = null;
    main.innerHTML = '<div class="empty-state"><div style="font-size:48px">🌸</div><p>La transmisión aún no ha empezado.</p></div>';
    chipText.textContent = 'Esperando…';
    return;
  }

  setChip(state);
  if (state.mode !== 'winner') revealPlayed = false;

  // Qué obliga a redibujar. Los sobres del atril no: se actualizan en su lugar.
  const key = JSON.stringify({
    mode: state.mode,
    round: state.round,
    next: state.nextRoundAt || null,
    cut: state.votingEnd || null,
    live: state.live?.id || null,
    cands: list(state.candidates).map(c => [c.id, c.name, c.program, c.photo, c.facebook]),
    results: state.results || null,
    winnerId: state.winnerId || null,
  });

  if (key === renderedKey) {
    if (liveUpdater) liveUpdater(state.live);
    return;
  }

  resetMode();
  renderedKey = key;
  ({ votes: renderVotes, envelopes: renderEnvelopes, grace: renderGrace, winner: renderWinner }[state.mode] || renderVotes)(state);
}

onValue(ref(db, '.info/serverTimeOffset'), snap => { serverOffset = Number(snap.val() || 0); });
onValue(ref(db, '.info/connected'), snap => { conn.hidden = !!snap.val(); });
onValue(ref(db, 'publico'), snap => render(snap.val()), err => {
  main.innerHTML = `<div class="empty-state"><p>No se pudo conectar con la transmisión.</p><p class="small">${esc(err.message)}</p></div>`;
});
