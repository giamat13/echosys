// ---- Wires DOM controls, terrain tools, readouts and the evolution chart. ----
function UI(sim, world, canvas) {
  this.sim = sim; this.world = world; this.canvas = canvas;
  this.tool = 'none';
  this._bindParams();
  this._bindTools();
  this._bindCanvas();
  this._bindButtons();
  this.chart = document.getElementById('chart');
  this.cctx = this.chart.getContext('2d');
  this.refreshOutputs();
}

UI.prototype._bindParams = function () {
  const map = ['temperature', 'seaLevel', 'foodRegen', 'mutation', 'simSpeed', 'brush'];
  for (const id of map) {
    const el = document.getElementById(id);
    el.addEventListener('input', () => {
      Params[id] = parseFloat(el.value);
      if (id === 'temperature') this.sim.baseTemp = Params.temperature; // seasonal set-point
      this.refreshOutputs();
    });
  }
  document.getElementById('autoseed').addEventListener('change', e => { Params.autoseed = e.target.checked; });
  document.getElementById('dynamic').addEventListener('change', e => { Params.dynamicClimate = e.target.checked; });
  document.getElementById('seasons').addEventListener('change', e => {
    Params.seasons = e.target.checked;
    if (!Params.seasons) Params.temperature = this.sim.baseTemp; // release back to set-point
  });
};

// Push auto-drifting parameters back onto their sliders so the UI stays live.
UI.prototype.syncClimateSliders = function () {
  if (Params.dynamicClimate) {
    document.getElementById('seaLevel').value = Params.seaLevel;
    document.getElementById('foodRegen').value = Params.foodRegen;
    document.getElementById('mutation').value = Params.mutation;
  }
  if (Params.seasons) document.getElementById('temperature').value = Params.temperature;
  if (Params.dynamicClimate || Params.seasons) this.refreshOutputs();
};

UI.prototype.refreshOutputs = function () {
  const fmt = {
    temperature: v => (v < .28 ? '❄ ' : v > .72 ? '🔥 ' : '🌤 ') + Math.round(v * 100) + '%',
    seaLevel: v => Math.round(v * 100) + '%',
    foodRegen: v => v.toFixed(2) + '×',
    mutation: v => Math.round(v * 100) + '%',
    simSpeed: v => v + '×',
    brush: v => v + ' משבצות',
  };
  document.querySelectorAll('[data-out]').forEach(s => {
    const k = s.getAttribute('data-out');
    if (fmt[k]) s.textContent = fmt[k](Params[k]);
  });
};

UI.prototype._bindTools = function () {
  document.querySelectorAll('.tool').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.tool = btn.getAttribute('data-tool');
      this.canvas.style.cursor = this.tool === 'none' ? 'default' : 'crosshair';
    });
  });
};

UI.prototype._toWorld = function (e) {
  const r = this.canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (this.canvas.width / r.width),
    y: (e.clientY - r.top) * (this.canvas.height / r.height),
  };
};

UI.prototype._bindCanvas = function () {
  let down = false;
  const apply = e => {
    const p = this._toWorld(e);
    if (this.tool === 'none') return;
    if (this.tool === 'spawn') { this.sim.spawn(p.x, p.y, Genome.random(), 0); return; }
    this.world.paint(p.x, p.y, this.tool, Params.brush);
  };
  this.canvas.addEventListener('mousedown', e => { down = true; apply(e); });
  window.addEventListener('mouseup', () => { down = false; });
  this.canvas.addEventListener('mousemove', e => {
    const p = this._toWorld(e);
    if (down) apply(e);
    if (this.tool === 'none' || this.tool === 'spawn')
      this.sim.selected = this.sim.creatureAt(p.x, p.y) || this.sim.selected;
  });
};

UI.prototype._bindButtons = function () {
  document.getElementById('playBtn').addEventListener('click', e => {
    Params.paused = !Params.paused;
    e.target.textContent = Params.paused ? '▶ המשך' : '⏸ השהה';
  });
  document.getElementById('reseedBtn').addEventListener('click', () => {
    this.world.generate();
    this.sim.creatures.length = 0;
    this.sim.births = this.sim.deaths = this.sim.kills = this.sim.matings = this.sim.maxGen = 0;
    this.sim.history.length = 0;
    this.sim.species.length = 0;
    this.sim.nextSpecies = 1;
    this.sim.spawnRandom(40);
  });
  document.getElementById('burstBtn').addEventListener('click', () => this.sim.spawnRandom(25));
};

// Side-panel numeric readout.
UI.prototype.updateReadout = function () {
  const s = this.sim;
  let herb = 0, carn = 0, aqua = 0;
  for (const c of s.creatures) { if (c.carnivore) carn++; else herb++; if (c.aquatic > 0.5) aqua++; }
  document.getElementById('readout').innerHTML =
    `אוכלוסייה: <b>${s.creatures.length}</b> / ${s.cap}<br>` +
    `מינים חיים: <b>${s.liveSpecies}</b> · דור מקסימלי: <b>${s.maxGen}</b><br>` +
    `צמחוניים <b>${herb}</b> · טורפים <b>${carn}</b> · ימיים <b>${aqua}</b><br>` +
    `לידות <b>${s.births}</b> (זיווגים <b>${s.matings}</b>)<br>` +
    `מיתות <b>${s.deaths}</b> · טריפות <b>${s.kills}</b>`;
  this.syncClimateSliders();
  this._drawChart();
  this._drawDNA();
};

UI.prototype._drawChart = function () {
  const ctx = this.cctx, w = this.chart.width, h = this.chart.height, H = this.sim.history;
  ctx.clearRect(0, 0, w, h);
  if (H.length < 2) return;
  // population (scaled to cap) as filled area
  ctx.fillStyle = 'rgba(90,169,255,.18)';
  ctx.beginPath(); ctx.moveTo(0, h);
  H.forEach((d, i) => ctx.lineTo(i / (H.length - 1) * w, h - (d.pop / this.sim.cap) * h));
  ctx.lineTo(w, h); ctx.closePath(); ctx.fill();

  const lines = [
    { key: 'optTemp', color: '#ff8a5c' },
    { key: 'aquatic', color: '#5aa9ff' },
    { key: 'diet', color: '#ff6b9d' },
    { key: 'size', color: '#4dd6a6' },
  ];
  for (const ln of lines) {
    ctx.strokeStyle = ln.color; ctx.lineWidth = 1.5; ctx.beginPath();
    H.forEach((d, i) => {
      const x = i / (H.length - 1) * w, y = h - d[ln.key] * h;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
  }
  // climate reference line for temperature
  ctx.strokeStyle = 'rgba(255,138,92,.35)'; ctx.setLineDash([4, 4]);
  const ty = h - Params.temperature * h;
  ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke(); ctx.setLineDash([]);
};

UI.prototype._drawDNA = function () {
  const el = document.getElementById('dna');
  const c = this.sim.selected;
  if (!c || c.dead) { el.innerHTML = '— רחף מעל יצור כדי לקרוא DNA —'; return; }
  const kindTxt = c.carnivore ? '🩸 טורף' : c.diet > 0.4 ? '🍃 אומניבור' : '🌿 צמחוני';
  const medium = c.aquatic > 0.5 ? '🌊 ימי' : '🌱 יבשתי';
  let html = `<div style="margin-bottom:6px"><b style="color:hsl(${c.hue},60%,60%)">יצור #${c.id}</b> · דור ${c.generation}<br>` +
    `${kindTxt} · ${medium} · ${c.legCount ? c.legCount + ' רגליים' : 'שוחה'}<br>` +
    `אנרגיה ${Math.round(c.energy)}/${Math.round(c.maxEnergy)}</div>`;
  for (const k of Genome.keys) {
    html += `<div class="bar"><i>${Genome.labels[k]}</i>` +
      `<div class="track"><div class="fill" style="width:${(c.genome[k] * 100).toFixed(0)}%"></div></div></div>`;
  }
  el.innerHTML = html;
};
