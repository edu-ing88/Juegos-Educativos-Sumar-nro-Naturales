/* =====================================================================
   ¡APRENDEMOS A SUMAR!  -  Lógica del juego (JavaScript puro)
   Secciones: 1) Utilidades  2) Sonidos  3) Estado  4) Preguntas
              5) Temporizador / avance  6) Respuestas  7) Resultados
              8) Botones y modales  9) Efectos visuales
   ===================================================================== */
(() => {
'use strict';

/* ---------- 1) Utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;       // entero aleatorio [a, b]
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const show = id => $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));

/* ---------- 2) Sonidos con Web Audio API (sin archivos externos) ---------- */
const Sound = {
  on: true, ctx: null,
  // [frecuencia, inicio(s), duración(s), tipo de onda, volumen]
  seqs: {
    tick: [[520, 0, .15, 'square', .08]],
    go:   [[660, 0, .12], [880, .12, .12], [1175, .24, .3]],
    ok:   [[784, 0, .1], [988, .1, .1], [1319, .2, .3]],
    bad:  [[260, 0, .18, 'sawtooth', .1], [170, .18, .35, 'sawtooth', .1]],
    win:  [[523, 0, .14], [659, .14, .14], [784, .28, .14], [1047, .42, .14], [784, .56, .14], [1047, .7, .5]],
    soft: [[440, 0, .2, 'triangle'], [392, .2, .3, 'triangle']]
  },
  play(name) {
    if (!this.on) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = this.ctx || new AC();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const t0 = this.ctx.currentTime;
      this.seqs[name].forEach(([f, st, d, type = 'sine', v = .17]) => {
        const o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = type; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + st);
        g.gain.linearRampToValueAtTime(v, t0 + st + .02);
        g.gain.exponentialRampToValueAtTime(.001, t0 + st + d);
        o.connect(g).connect(this.ctx.destination);
        o.start(t0 + st); o.stop(t0 + st + d + .05);
      });
    } catch (e) { /* sin audio disponible: el juego sigue funcionando */ }
  }
};

/* ---------- 3) Estado del juego ---------- */
const TOTAL = 10;          // preguntas por partida
const TIME = 20000;        // milisegundos por pregunta
const STEP = 100;          // intervalo del reloj (ms)
const G = {
  q: 0, score: 0, ok: 0, bad: 0,
  a: 0, b: 0, ans: 0,
  phase: 'idle',           // idle | ask (esperando respuesta) | fb (mostrando retroalimentación) | done
  left: 0, fb: 0,          // tiempo restante de la pregunta / de la retroalimentación
  paused: false, token: 0, iv: null
};

/* ---------- Inicio y cuenta regresiva ---------- */
function start() {
  stopClock(); G.token++;
  Object.assign(G, { q: 0, score: 0, ok: 0, bad: 0, phase: 'idle', paused: false });
  $('#rModal').classList.remove('show'); $('#cModal').classList.remove('show');
  resetQuestionUI(); updateHud();
  show('game');
  const token = G.token, o = $('#countdown'), n = $('#cdNum'), seq = ['3', '2', '1', '¡COMENZAMOS!']; let i = 0;
  o.classList.add('show');
  (function step() {
    if (token !== G.token) { o.classList.remove('show'); return; }   // la partida fue cancelada
    n.textContent = seq[i]; n.className = ''; void n.offsetWidth;
    n.className = 'tick' + (i === 3 ? ' go' : '');
    Sound.play(i === 3 ? 'go' : 'tick'); i++;
    setTimeout(i < seq.length ? step : () => {
      o.classList.remove('show'); if (token !== G.token) return;
      nextQuestion(); G.iv = setInterval(tick, STEP);                // el reloj arranca al terminar la cuenta
    }, 900);
  })();
}
function stopClock() { clearInterval(G.iv); G.iv = null; }

/* ---------- 4) Generación de preguntas ---------- */
function nextQuestion() {
  if (G.q >= TOTAL) return finish();
  G.q++;
  const max = 8 + G.q * 2;                       // la dificultad sube poco a poco
  G.a = rnd(1, max); G.b = rnd(1, max); G.ans = G.a + G.b;
  const set = new Set([G.ans]);                  // el Set evita alternativas repetidas
  while (set.size < 4) { const v = G.ans + rnd(1, 5) * (rnd(0, 1) ? 1 : -1); if (v >= 1) set.add(v); }
  const opts = shuffle([...set]);
  $('#qa').textContent = G.a; $('#qb').textContent = G.b;
  $$('.ans').forEach((b, i) => { b.textContent = opts[i]; b.dataset.v = opts[i]; b.disabled = false; b.className = 'ans a' + i; });
  $('#fbMsg').textContent = ''; $('#fbMsg').className = ''; $('#fbAns').innerHTML = '';
  const qc = $('#qcard'); qc.style.animation = 'none'; void qc.offsetWidth; qc.style.animation = '';
  G.left = TIME; G.phase = 'ask';
  updateHud(); updateTimer();
}
function resetQuestionUI() {
  $('#qa').textContent = '?'; $('#qb').textContent = '?';
  $$('.ans').forEach((b, i) => { b.textContent = ''; b.disabled = true; b.className = 'ans a' + i; });
  $('#fbMsg').textContent = ''; $('#fbAns').innerHTML = '';
  $('#timer').className = 'timer'; $('#tBar').style.width = '100%'; $('#tNum').textContent = TIME / 1000;
}

/* ---------- 5) Temporizador y avance (un único reloj) ---------- */
function tick() {
  if (G.paused) return;                          // en pausa mientras hay un modal abierto
  if (G.phase === 'ask') {
    G.left -= STEP; updateTimer();
    if (G.left <= 0) resolve(null);              // se acabó el tiempo = incorrecta
  } else if (G.phase === 'fb') {
    G.fb -= STEP;
    if (G.fb <= 0) { G.phase = 'idle'; nextQuestion(); }
  }
}
function updateTimer() {
  const s = Math.max(0, Math.ceil(G.left / 1000));
  $('#tNum').textContent = s; $('#tBar').style.width = Math.max(0, G.left / TIME * 100) + '%';
  $('#timer').className = 'timer' + (s <= 5 ? ' danger' : s <= 10 ? ' warn' : '');
}
function updateHud() { $('#sQ').textContent = Math.max(1, G.q); $('#sT').textContent = TOTAL; $('#sScore').textContent = G.score; }

/* ---------- 6) Respuestas y retroalimentación ---------- */
// val = número elegido, o null si se acabó el tiempo
function resolve(val) {
  if (G.phase !== 'ask') return;                 // evita responder dos veces o duplicar puntos
  G.phase = 'fb';
  const good = val === G.ans, msg = $('#fbMsg');
  $$('.ans').forEach(b => {
    b.disabled = true;
    const v = +b.dataset.v;
    if (v === G.ans) b.classList.add('right');
    else if (v === val) b.classList.add('wrong');
    else b.classList.add('dim');
  });
  if (good) {
    G.ok++; G.score += 10 + Math.floor(G.left / 4000);          // 10 puntos + bonus por rapidez (0 a 5)
    msg.textContent = '¡MUY BIEN! ¡RESPUESTA CORRECTA!'; msg.className = 'ok';
    Sound.play('ok'); burst(['⭐', '🌟', '✨'], 16); G.fb = 1800;
  } else {
    G.bad++;
    msg.textContent = val === null ? '¡UPS! SE ACABÓ EL TIEMPO. ¡SIGUE INTENTANDO!' : '¡UPS! SIGUE INTENTANDO'; msg.className = 'bad';
    $('#fbAns').innerHTML = `La respuesta correcta es <b>${G.ans}</b>`;
    Sound.play('bad'); G.fb = 3200;
  }
  updateHud();
}
$$('.ans').forEach(b => b.addEventListener('click', () => resolve(+b.dataset.v)));

/* ---------- 7) Resultados ---------- */
function finish() {
  G.phase = 'done'; stopClock();
  const pct = Math.round(G.ok / TOTAL * 100);
  let title, msg, icon;
  if (G.ok === TOTAL) { title = '¡LO HICISTE BIEN!'; icon = '🏆'; msg = '¡Felicitaciones! Respondiste todas las sumas correctamente. ¡Eres un campeón de las matemáticas!'; }
  else if (G.ok === 0) { title = '¡VAMOS, TÚ PUEDES!'; icon = '💪'; msg = 'Cada intento te ayuda a aprender. ¡Inténtalo otra vez, tú puedes lograrlo!'; }
  else { title = '¡TE FALTA UN POCO!'; icon = '🌈'; msg = '¡Vas muy bien! Sigue practicando y la próxima vez lo lograrás.'; }
  $('#rTitle').textContent = title; $('#rIcon').textContent = icon; $('#rMsg').textContent = msg;
  $('#rScore').textContent = G.score; $('#rOk').textContent = G.ok; $('#rBad').textContent = G.bad; $('#rPct').textContent = pct + '%';
  $('#rModal').classList.add('show');
  if (G.ok === TOTAL) { Sound.play('win'); burst(['🎉', '⭐', '🎊', '🌟'], 60, true); } else Sound.play('soft');
  if (G.ok > 0 && G.ok < TOTAL) burst(['⭐', '🌈'], 14);
}

/* ---------- 8) Botones y ventanas modales ---------- */
const Confirm = {
  fn: null,
  ask(text, icon, yes, fn) {
    if ($('#cModal').classList.contains('show') || G.phase === 'idle' && !G.iv) return;
    G.paused = true; this.fn = fn;
    $('#cText').textContent = text; $('#cIcon').textContent = icon; $('#cYes').textContent = yes;
    $('#cModal').classList.add('show'); $('#cNo').focus();
  },
  close() { $('#cModal').classList.remove('show'); G.paused = false; this.fn = null; }
};
$('#cNo').addEventListener('click', () => Confirm.close());
$('#cYes').addEventListener('click', () => { const f = Confirm.fn; Confirm.close(); if (f) f(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#cModal').classList.contains('show')) Confirm.close(); });

function exitGame() { stopClock(); G.token++; G.phase = 'idle'; $('#countdown').classList.remove('show'); $('#rModal').classList.remove('show'); show('home'); }

$('#btnStart').addEventListener('click', start);
$('#gRestart').addEventListener('click', () => Confirm.ask('¿Quieres reiniciar el juego? Empezarás desde cero y perderás tu puntaje actual.', '🔄', 'SÍ, REINICIAR', start));
$('#gExit').addEventListener('click', () => Confirm.ask('¿Estás seguro de que deseas salir del juego? Tu progreso actual se perderá.', '🚪', 'SÍ, SALIR', exitGame));
$('#rAgain').addEventListener('click', start);
$('#rExit').addEventListener('click', exitGame);
$('#gSound').addEventListener('click', () => { Sound.on = !Sound.on; $('#gSound').textContent = Sound.on ? '🔊' : '🔇'; Sound.play('tick'); });

/* ---------- 9) Efectos visuales (estrellas y confeti) ---------- */
function burst(emojis, n, rain) {
  const fx = $('#fx');
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = emojis[rnd(0, emojis.length - 1)];
    s.style.fontSize = rnd(18, 38) + 'px';
    if (rain) {                                   // lluvia de confeti desde arriba
      s.style.left = rnd(0, 98) + 'vw'; s.style.animationDuration = rnd(20, 40) / 10 + 's'; s.style.animationDelay = rnd(0, 12) / 10 + 's';
    } else {                                      // explosión desde el centro
      s.className = 'burst'; s.style.left = '50%'; s.style.top = '45%';
      s.style.setProperty('--dx', rnd(-45, 45) + 'vw'); s.style.setProperty('--dy', rnd(-35, 35) + 'vh');
    }
    fx.append(s); setTimeout(() => s.remove(), 4500);
  }
}
})();
