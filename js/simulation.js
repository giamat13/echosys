// ---- Orchestrates the world, the population, and evolutionary stats. ----
function Simulation(world) {
  this.world = world;
  this.creatures = [];
  this.cap = 220;
  this.births = 0;
  this.deaths = 0;
  this.kills = 0;
  this.matings = 0;
  this.ticks = 0;
  this.maxGen = 0;
  this.history = []; // sampled averages for the chart
  this.selected = null;
  this.species = [];      // {id, rep(genome), hue}
  this.nextSpecies = 1;
  this.liveSpecies = 0;
  this.baseTemp = Params.temperature; // seasonal set-point
  this.climateClock = 0;
  this._prevTemp = Params.temperature;
  this._prevSea = Params.seaLevel;
  this.volatility = 0; // smoothed measure of how fast the climate is shifting
}

// Environmental feedback: every fitting metric drifts naturally, coupled to
// the others, instead of staying at a fixed value.
Simulation.prototype.updateClimate = function (dt) {
  this.climateClock += dt;
  if (Params.seasons) {
    // slow seasonal swing around the player's set-point
    Params.temperature = Util.clamp(this.baseTemp + Math.sin(this.climateClock * 0.0004) * 0.13, 0, 1);
  }
  if (!Params.dynamicClimate) { this._prevTemp = Params.temperature; this._prevSea = Params.seaLevel; return; }

  const T = Params.temperature;

  // 1) Heat evaporates the sea; cold lets it rise (toward a temp-driven target).
  const seaTarget = Util.clamp(0.46 - (T - 0.5) * 0.6, 0.05, 0.72);
  Params.seaLevel += (seaTarget - Params.seaLevel) * 0.006 * dt;

  // 2) Productivity: richest in a temperate, moist world; barren at extremes.
  const warmth = 1 - Math.abs(T - 0.5) * 1.4;          // bell curve, peak temperate
  const moisture = 0.4 + Params.seaLevel * 0.9;        // more sea -> more rain
  const foodTarget = Util.clamp(warmth * moisture * 1.1, 0.05, 1.5);
  Params.foodRegen += (foodTarget - Params.foodRegen) * 0.005 * dt;

  // 3) Climate volatility drives mutation (stress-induced mutagenesis):
  //    rapid change accelerates adaptation, long stability calms the genome.
  const flux = Math.abs(T - this._prevTemp) + Math.abs(Params.seaLevel - this._prevSea);
  this._prevTemp = T; this._prevSea = Params.seaLevel;
  this.volatility = this.volatility * 0.996 + flux;
  const mutTarget = Util.clamp(0.05 + this.volatility * 0.7, 0.03, 0.3);
  Params.mutation += (mutTarget - Params.mutation) * 0.08 * dt;
};

// Assign a creature to the nearest genetic cluster, or found a new species.
Simulation.prototype.classify = function (c) {
  let best = Infinity, sp = null;
  for (const s of this.species) {
    const d = Genome.distance(c.genome, s.rep);
    if (d < best) { best = d; sp = s; }
  }
  if (sp && best < 0.16) c.speciesId = sp.id;
  else {
    sp = { id: this.nextSpecies++, rep: c.genome, hue: c.hue };
    this.species.push(sp);
    c.speciesId = sp.id;
  }
};

Simulation.prototype.spawn = function (x, y, genome, generation) {
  if (this.creatures.length >= this.cap) return;
  const c = new Creature(x, y, genome || Genome.random(), generation || 0);
  this.classify(c);
  this.creatures.push(c);
};

Simulation.prototype.spawnRandom = function (count) {
  const W = this.world.cols * this.world.tile, H = this.world.rows * this.world.tile;
  for (let i = 0; i < count; i++) {
    let x, y, tries = 0;
    do { x = Util.rand(0, W); y = Util.rand(0, H); tries++; }
    while (this.world.isRockAt(x, y) && tries < 30);
    this.spawn(x, y, Genome.random(), 0);
  }
};

Simulation.prototype.spawnChild = function (parent) {
  const child = Genome.mutate(parent.genome, Params.mutation);
  const a = Util.rand(0, Math.PI * 2), r = parent.radius * 2;
  const x = Util.clamp(parent.x + Math.cos(a) * r, 1, this.world.cols * this.world.tile - 1);
  const y = Util.clamp(parent.y + Math.sin(a) * r, 1, this.world.rows * this.world.tile - 1);
  const c = new Creature(x, y, child, parent.generation + 1);
  c.energy = parent.energy * 0.5;
  this.classify(c);
  this.creatures.push(c);
  this.births++;
  if (c.generation > this.maxGen) this.maxGen = c.generation;
};

// Sexual reproduction: recombine two parents' genomes, then mutate.
Simulation.prototype.spawnSexual = function (a, b) {
  const g = Genome.mutate(Genome.crossover(a.genome, b.genome), Params.mutation);
  const ang = Util.rand(0, Math.PI * 2), r = a.radius * 2;
  const x = Util.clamp(a.x + Math.cos(ang) * r, 1, this.world.cols * this.world.tile - 1);
  const y = Util.clamp(a.y + Math.sin(ang) * r, 1, this.world.rows * this.world.tile - 1);
  const c = new Creature(x, y, g, Math.max(a.generation, b.generation) + 1);
  c.energy = (a.energy + b.energy) * 0.25;
  this.classify(c);
  this.creatures.push(c);
  this.births++; this.matings++;
  if (c.generation > this.maxGen) this.maxGen = c.generation;
};

Simulation.prototype.step = function (dt) {
  this.updateClimate(dt);
  this.world.grow(dt);
  const list = this.creatures;
  for (let i = 0; i < list.length; i++) list[i].update(dt, this.world, this);
  // reap the dead
  let w = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].dead) { this.deaths++; if (list[i] === this.selected) this.selected = null; }
    else list[w++] = list[i];
  }
  list.length = w;

  // auto-seed so the world rarely goes fully silent
  if (Params.autoseed && list.length < 8) this.spawnRandom(6);

  this.ticks += dt;
  if (this.ticks % 12 < dt) this._sample();
};

// Snapshot population-wide gene averages for the evolution chart.
Simulation.prototype._sample = function () {
  const n = this.creatures.length;
  const avg = { pop: n, optTemp: 0, aquatic: 0, size: 0, diet: 0 };
  for (const c of this.creatures) {
    avg.optTemp += c.genome.optTemp; avg.aquatic += c.genome.aquatic;
    avg.size += c.genome.size; avg.diet += c.genome.diet;
  }
  if (n) { avg.optTemp /= n; avg.aquatic /= n; avg.size /= n; avg.diet /= n; }
  this.history.push(avg);
  if (this.history.length > 240) this.history.shift();

  // retire species with no living members; count surviving diversity
  const live = new Set();
  for (const c of this.creatures) live.add(c.speciesId);
  this.species = this.species.filter(s => live.has(s.id));
  this.liveSpecies = this.species.length;
};

Simulation.prototype.creatureAt = function (px, py) {
  let best = 1e9, hit = null;
  for (const c of this.creatures) {
    const d = Util.dist2(px, py, c.x, c.y), rr = (c.radius + 8) * (c.radius + 8);
    if (d < rr && d < best) { best = d; hit = c; }
  }
  return hit;
};
