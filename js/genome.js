// ---- The DNA. Every gene is a scalar in [0,1]. ----
// Phenotype (body & behaviour) is decoded from these in creature.js.
const Genome = {
  keys: [
    'size',       // body mass
    'speed',      // locomotion power
    'sense',      // perception radius
    'metabolism', // energy efficiency
    'legs',       // 0=swimmer .. many-legged walker
    'limb',       // limb length
    'hue',        // colouration
    'optTemp',    // preferred temperature
    'tempTol',    // temperature tolerance
    'diet',       // 0 herbivore .. 1 carnivore
    'aquatic',    // 0 land-dweller .. 1 water-dweller
    'repro',      // reproduction energy threshold
    'spikes',     // armour / defence
    'longevity',  // lifespan
  ],

  labels: {
    size: 'גודל', speed: 'מהירות', sense: 'חושים', metabolism: 'מטבוליזם',
    legs: 'רגליים', limb: 'איברים', hue: 'צבע', optTemp: 'טמפ׳ מועדפת',
    tempTol: 'עמידות טמפ׳', diet: 'תזונה (טורף)', aquatic: 'ימיות',
    repro: 'סף רבייה', spikes: 'קוצים', longevity: 'אריכות ימים',
  },

  random() {
    const g = {};
    for (const k of this.keys) g[k] = Math.random();
    return g;
  },

  // Asexual reproduction with per-gene point mutation.
  mutate(g, rate) {
    const n = {};
    for (const k of this.keys) {
      let v = g[k];
      if (Math.random() < rate) v += Util.rand(-0.18, 0.18);
      n[k] = Util.clamp(v, 0, 1);
    }
    return n;
  },

  // Sexual reproduction: each gene inherited from one parent at random.
  crossover(a, b) {
    const n = {};
    for (const k of this.keys) n[k] = Math.random() < 0.5 ? a[k] : b[k];
    return n;
  },

  // Genetic distance over the traits that define a "kind" of creature.
  // Used for mate compatibility and speciation.
  distance(a, b) {
    const keys = ['size', 'legs', 'diet', 'aquatic', 'optTemp', 'hue'];
    let s = 0;
    for (const k of keys) s += Math.abs(a[k] - b[k]);
    return s / keys.length;
  },
};
