/*
 * Generator for polyrhythmic passing patterns.
 *
 * Two jugglers A and B share a common cycle of duration 1. A has nA throw
 * beats per cycle (at times i/nA), B has nB (at times j/nB). Each juggler
 * alternates hands R,L,R,L,... on their own beats, starting with R at t=0.
 *
 * Throw values are given in the thrower's own beats (value = time until the
 * club is thrown again, in thrower beats), so a self "3" means the same for
 * both jugglers even though its absolute duration differs.
 *
 * Selfs must land back on the thrower's own beat grid => integer values.
 * Passes must land on the partner's beat grid: a pass by A at beat i landing
 * on the partner's absolute beat j has value p = nA*j/nB - i (a fraction
 * with denominator nB).
 *
 * A pass is "straight" (II, right->left when facing each other) iff the
 * parity of the thrower's global beat differs from the catcher's.
 * If nA+nB is odd this label alternates every cycle (altOrient).
 *
 * An interface is the contract between the two sides: (SA, SB) with
 * SA = beats where A receives a pass (= landing beats of B's passes) and
 * SB = beats where B receives. Any A-sequence and B-sequence with matching
 * interfaces combine into a valid pattern.
 *
 * Solo polyrhythm reuses the same machinery with the two "sides" being the
 * right and left hand of a single juggler (right = A, left = B). Hands do
 * not alternate: every beat of a side belongs to the same hand, and
 * "passes" are crossing throws (X). Internally values are in the hand's
 * own beats; displayed values follow vanilla siteswap counting, where one
 * own beat corresponds to two siteswap beats (an internal same-hand 1
 * displays as 2 = hold). Height bounds are in vanilla units scaled to the
 * faster hand.
 */

export function gcd(a, b) { return b ? gcd(b, a % b) : a; }
export function lcm(a, b) { return a / gcd(a, b) * b; }
export function popcount(x) { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; }

const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUBD = '₀₁₂₃₄₅₆₇₈₉';
const sup = n => String(n).split('').map(d => SUPD[+d]).join('');
const sub = n => String(n).split('').map(d => SUBD[+d]).join('');

export const defaultConfig = {
	nA: 5,
	nB: 7,
	selfMax: 4,       // inclusive; selfs are integers 0..selfMax (0 = empty beat)
	passMin: 2.5,     // inclusive
	passMax: 4.5,     // inclusive
	allowZero: false,
	excludeHolds: true, // drop self 2s (a 2 stays in the same hand = hold)
};

export const soloDefaultConfig = {
	nR: 3,            // right hand beats per cycle
	nL: 2,            // left hand beats per cycle
	minHeight: 2,     // inclusive, vanilla siteswap units scaled to the faster hand
	maxHeight: 10,    // inclusive, vanilla siteswap units scaled to the faster hand
	includeHolds: false, // same-hand 2 = the ball can just stay in the hand
	allowZero: false,
};

export const MAX_SEQS = 600000;
export const MAX_PATTERNS = 200000;

function makeOptions(n, m, cfg) {
	const beats = [];
	for (let i = 0; i < n; i++) {
		const list = [];
		const lo = cfg.allowZero ? 0 : 1;
		for (let v = lo; v <= cfg.selfMax; v++) {
			if (cfg.excludeHolds && v === 2)
				continue;
			list.push({ kind: 'self', v, land: (i + v) % n, num: v * m });
		}
		const jLo = Math.ceil(m * (i + cfg.passMin) / n - 1e-9);
		const jHi = Math.floor(m * (i + cfg.passMax) / n + 1e-9); // inclusive
		for (let jAbs = jLo; jAbs <= jHi; jAbs++) {
			list.push({
				kind: 'pass', num: n * jAbs - i * m, den: m, jAbs, jMod: jAbs % m,
				straight: (i % 2) !== (jAbs % 2),
				altOrient: (n + m) % 2 === 1,
			});
		}
		beats.push(list);
	}
	return beats;
}

// Same beat options for the solo case: hand with n beats per cycle against
// the other hand with m; selfs stay in the same hand (an internal 1,
// displayed as 2, is a hold), passes cross to the other hand. Height
// bounds are in vanilla units (2 per own beat, scaled to the faster
// hand), so an internal own-beat value v has height 2 * v * nFast / n.
function makeSoloOptions(n, m, nFast, cfg) {
	const beats = [];
	const vLo = Math.max(1, Math.ceil(cfg.minHeight * n / (2 * nFast) - 1e-9));
	const vHi = Math.floor(cfg.maxHeight * n / (2 * nFast) + 1e-9);
	for (let i = 0; i < n; i++) {
		const list = [];
		if (cfg.allowZero)
			list.push({ kind: 'self', v: 0, land: i, num: 0 });
		for (let v = vLo; v <= vHi; v++) {
			if (!cfg.includeHolds && v === 1)
				continue;
			list.push({ kind: 'self', v, land: (i + v) % n, num: v * m });
		}
		const jLo = Math.ceil(m * i / n + m * cfg.minHeight / (2 * nFast) - 1e-9);
		const jHi = Math.floor(m * i / n + m * cfg.maxHeight / (2 * nFast) + 1e-9);
		for (let jAbs = jLo; jAbs <= jHi; jAbs++) {
			const num = n * jAbs - i * m;
			if (num <= 0)
				continue;
			list.push({ kind: 'pass', num, den: m, jAbs, jMod: jAbs % m });
		}
		beats.push(list);
	}
	return beats;
}

function enumerate(n, opts) {
	const seqs = [];
	const choice = new Array(n);
	const full = (1 << n) - 1;
	function dfs(i, selfLand, passLand, zeros) {
		if (i === n) {
			if (seqs.length >= MAX_SEQS)
				throw new Error('more than ' + MAX_SEQS.toLocaleString() +
					' sequences for one juggler — reduce beats per cycle, lower the max self, or narrow the pass range');
			let nonzero = 0;
			for (let b = 0; b < n; b++) {
				const o = choice[b];
				if (!(o.kind === 'self' && o.v === 0)) nonzero |= 1 << b;
			}
			let num = 0;
			for (const o of choice) num += o.num;
			seqs.push({ throws: choice.slice(), recv: nonzero & ~selfLand & full, out: passLand, num });
			return;
		}
		for (const o of opts[i]) {
			if (o.kind === 'self') {
				if (o.v === 0) {
					if (selfLand & (1 << i)) continue;
					choice[i] = o;
					dfs(i + 1, selfLand, passLand, zeros | (1 << i));
				} else {
					const b = 1 << o.land;
					if ((selfLand & b) || (zeros & b)) continue;
					choice[i] = o;
					dfs(i + 1, selfLand | b, passLand, zeros);
				}
			} else {
				const b = 1 << o.jMod;
				if (passLand & b) continue;
				choice[i] = o;
				dfs(i + 1, selfLand, passLand | b, zeros);
			}
		}
	}
	dfs(0, 0, 0, 0);
	return seqs;
}

export function generate(cfg) {
	cfg = Object.assign({}, defaultConfig, cfg);
	const seqsA = enumerate(cfg.nA, makeOptions(cfg.nA, cfg.nB, cfg));
	const seqsB = enumerate(cfg.nB, makeOptions(cfg.nB, cfg.nA, cfg));
	const mapA = new Map(), mapB = new Map();
	seqsA.forEach((s, i) => {
		const k = s.recv + ':' + s.out;
		if (!mapA.has(k)) mapA.set(k, []);
		mapA.get(k).push(i);
	});
	seqsB.forEach((s, i) => {
		const k = s.recv + ':' + s.out;
		if (!mapB.has(k)) mapB.set(k, []);
		mapB.get(k).push(i);
	});
	const interfaces = [];
	for (const [k, aIdx] of mapA) {
		const parts = k.split(':').map(Number);
		const bIdx = mapB.get(parts[1] + ':' + parts[0]);
		if (bIdx) interfaces.push({ SA: parts[0], SB: parts[1], nPasses: popcount(parts[0]), aIdx, bIdx });
	}
	interfaces.sort((x, y) => x.nPasses - y.nPasses || x.SA - y.SA || x.SB - y.SB);
	// show "natural" sequences first: average throw value closest to 3
	const target = 3 * cfg.nA * cfg.nB;
	const byNum = seqs => (i, j) =>
		Math.abs(seqs[i].num - target) - Math.abs(seqs[j].num - target) || seqs[i].num - seqs[j].num || i - j;
	for (const itf of interfaces) {
		itf.aIdx.sort(byNum(seqsA));
		itf.bIdx.sort(byNum(seqsB));
	}
	return { cfg, seqsA, seqsB, interfaces };
}

/*
 * Solo generator: right hand = side A, left hand = side B. Unlike the
 * passing generator this returns the complete flat list of valid patterns
 * (all sequence pairs with matching interfaces), including ones without
 * crossing throws.
 */
export function generateSolo(cfg) {
	cfg = Object.assign({}, soloDefaultConfig, cfg);
	cfg.nA = cfg.nR;
	cfg.nB = cfg.nL;
	cfg.nFast = Math.max(cfg.nR, cfg.nL);
	const seqsA = enumerate(cfg.nA, makeSoloOptions(cfg.nA, cfg.nB, cfg.nFast, cfg));
	const seqsB = enumerate(cfg.nB, makeSoloOptions(cfg.nB, cfg.nA, cfg.nFast, cfg));
	const mapB = new Map();
	seqsB.forEach((s, i) => {
		const k = s.recv + ':' + s.out;
		if (!mapB.has(k)) mapB.set(k, []);
		mapB.get(k).push(i);
	});
	const den = cfg.nA * cfg.nB;
	const patterns = [];
	seqsA.forEach((sa, ia) => {
		const match = mapB.get(sa.out + ':' + sa.recv);
		if (!match) return;
		for (const ib of match) {
			if (patterns.length >= MAX_PATTERNS)
				throw new Error('more than ' + MAX_PATTERNS.toLocaleString() +
					' patterns — reduce beats per cycle or lower the max height');
			patterns.push({
				ia, ib,
				balls: (sa.num + seqsB[ib].num) / den,
				nCross: popcount(sa.out) + popcount(seqsB[ib].out),
				balance: Math.abs(sa.num - seqsB[ib].num),
			});
		}
	});
	patterns.sort((x, y) => x.balls - y.balls || x.nCross - y.nCross || x.balance - y.balance);
	return { cfg, seqsA, seqsB, patterns };
}

// compact url token for one side's sequence: internal own-beat self values
// and x<absolute landing beat> for passes/crossings, e.g. "2.2.x1"
export function seqToken(seq) {
	return seq.throws.map(o => o.kind === 'self' ? String(o.v) : 'x' + o.jAbs).join('.');
}

export function maskToBeats(mask, n) {
	const r = [];
	for (let b = 0; b < n; b++) if (mask & (1 << b)) r.push(b);
	return r;
}

// number as (mixed) fraction with an orientation marker attached
function fracLabel(num, den, orient, html) {
	const whole = Math.floor(num / den), rem = num % den;
	let s = whole || !rem ? String(whole) : '';
	if (rem) {
		const g = gcd(rem, den);
		s += html
			? '<span class="frac"><span class="fn">' + (rem / g) + '</span><span>' + (den / g) + '</span></span>'
			: sup(rem / g) + '⁄' + sub(den / g);
	}
	if (orient)
		s += html ? '<sub class="orient">' + orient + '</sub>' : orient;
	return s;
}

export function throwLabel(o, html) {
	if (o.kind === 'self') return String(o.v);
	return fracLabel(o.num, o.den, o.altOrient ? 'X↔II' : (o.straight ? 'II' : 'X'), html);
}

// solo labels follow vanilla siteswap counting: one own beat = two siteswap
// beats, so displayed values are twice the internal own-beat values (a hold
// shows as 2). Crossing throws are fractions on the other hand's grid,
// marked X.
export function soloThrowLabel(o, html) {
	if (o.kind === 'self') return String(2 * o.v);
	return fracLabel(2 * o.num, o.den, 'X', html);
}

// global numbering: vanilla-style value scaled to the faster hand's rhythm,
// II = stays in the same hand, X = crosses to the other hand.
// o.num is the own-beat value times m, so global = 2 * num * nFast / (n * m).
export function soloGlobalLabel(o, n, m, nFast, html) {
	if (o.kind === 'self' && o.v === 0) return '0';
	return fracLabel(2 * o.num * nFast, n * m, o.kind === 'pass' ? 'X' : 'II', html);
}

export function soloHandSeq(seq, html) {
	return seq.throws.map(o => soloThrowLabel(o, html)).join(' ');
}

// both hands merged in time order, global numbering; simultaneous throws
// are grouped as (right,left)
export function soloGlobalSeq(sa, sb, cfg, html) {
	const L = lcm(cfg.nA, cfg.nB), nFast = cfg.nFast;
	const events = [];
	const add = (seq, n, m, hand) => {
		const tick = L / n;
		seq.throws.forEach((o, i) => {
			let label = soloGlobalLabel(o, n, m, nFast, html);
			if (html)
				label = '<span class="h' + hand + '">' + label + '</span>';
			events.push({ t: i * tick, hand, label });
		});
	};
	add(sa, cfg.nA, cfg.nB, 'R');
	add(sb, cfg.nB, cfg.nA, 'L');
	events.sort((a, b) => a.t - b.t || (a.hand === 'R' ? -1 : 1));
	const parts = [];
	for (let i = 0; i < events.length; ) {
		let j = i;
		while (j + 1 < events.length && events[j + 1].t === events[i].t) j++;
		const labels = events.slice(i, j + 1).map(e => e.label);
		parts.push(labels.length > 1 ? '(' + labels.join(',') + ')' : labels[0]);
		i = j + 1;
	}
	return parts.join(' ');
}

export function seqString(seq, html, markRecv) {
	return seq.throws.map((o, i) => {
		let s = throwLabel(o, html);
		if (html && markRecv && (seq.recv & (1 << i))) s = '<span class="recv">' + s + '</span>';
		return s;
	}).join(' ');
}

export function clubCount(sa, sb, cfg) { return (sa.num + sb.num) / (cfg.nA * cfg.nB); }

/*
 * Timing shared by both builders.
 *
 * The dwell is deducted from the end of a throw's flight, so it is time the
 * *catching* hand holds the prop and belongs to that hand's rhythm, not the
 * thrower's. Judged in the thrower's it can outlast the catcher's whole beat
 * whenever the slow side throws to the fast one, leaving that hand holding two
 * props at once — which it then animates as a single curve spanning the cycle.
 */

// share of a hand's beat gap spent holding rather than empty and travelling.
// Half looks rushed at uneven tempos: the slow hand snatches its catch at the
// last moment and waits idle the rest of its long beat.
const DWELL_RATIO = 2 / 3;

// share of the transfer window a carry may take. When a hand throws to a hand
// that has to throw again almost at once — a vanilla '1' — the prop is handed
// across rather than tossed, so nearly the whole window is dwell and only a
// token of it is flight. Applying DWELL_RATIO here instead would put a gap in
// front of the catch: the receiving hand waits idle, then snatches it.
const CARRY_RATIO = 5 / 6;

/*
 * Spins are judged on the global siteswap — every throw scaled to the faster
 * side's rhythm — and on the flight rather than the notated value, since a
 * club only turns while it is in the air. How much of a value is flight
 * depends on which hand catches it, so the flight is counted as the value the
 * faster side would give it: that side always dwells DWELL_RATIO of its own
 * two-global-beat hand gap, which is what leaves its own throws on the plain
 * mapping. See spinHeight in each builder.
 */
const spinHeight = (duration, dwell, globalBeat) =>
	(duration - dwell) / globalBeat + 2 * DWELL_RATIO;

// passing: the classic club count, a 3 is a single and every beat above it
// adds a rotation
const passingSpins = h => Math.max(0, Math.floor(h - 2));

// solo: one rotation per pair of global beats, so 3 and 4 are singles, 5 and 6
// doubles, 7 and 8 triples. A hand's own beat spans two global beats, so this
// counts a rotation for each of the thrower's beats the club is up.
const soloSpins = h => Math.max(0, Math.floor((h - 1) / 2));

export function buildJif(seqA, seqB, cfg, names, propType) {
	names = names || ['A', 'B'];
	propType = propType || 'club';
	const nA = cfg.nA, nB = cfg.nB;
	const L = lcm(nA, nB);
	// one beat of the global siteswap: each juggler's own beat is already a
	// siteswap beat here, since their hands alternate
	const globalBeat = L / Math.max(nA, nB);
	const periodCycles = (nA % 2 === 0 && nB % 2 === 0) ? 1 : 2;
	const throws = [];
	const add = (seq, n, m, limbBase, otherBase) => {
		const tick = L / n, otherTick = L / m;
		for (let c = 0; c < periodCycles; c++) {
			seq.throws.forEach((o, i) => {
				const g = c * n + i;
				const time = g * tick;
				let duration, to, catchHandGap;
				if (o.kind === 'self') {
					if (o.v === 0) return;
					duration = o.v * tick;
					to = limbBase + ((g + o.v) % 2);
					catchHandGap = 2 * tick;
				} else {
					duration = o.jAbs * otherTick - i * tick;
					to = otherBase + ((c * m + o.jAbs) % 2);
					catchHandGap = 2 * otherTick;
				}
				// a juggler alternates hands, so each of their hands throws every
				// second beat of theirs — that gap is what the dwell is judged in
				const dwell = Math.min(DWELL_RATIO * catchHandGap, CARRY_RATIO * duration);
				throws.push({ time, duration, from: limbBase + (g % 2), to, label: throwLabel(o),
					dwell, spins: passingSpins(spinHeight(duration, dwell, globalBeat)) });
			});
		}
	};
	add(seqA, nA, nB, 0, 2);
	add(seqB, nB, nA, 2, 0);
	throws.sort((a, b) => a.time - b.time || a.from - b.from);
	const strA = seqString(seqA), strB = seqString(seqB);
	return {
		jif: '0.01',
		meta: {
			name: 'polyrhythm ' + nA + ':' + nB + '  A: ' + strA + '  B: ' + strB,
			description: 'Polyrhythmic passing pattern, ' + nA + ' beats per cycle for ' + names[0] +
				' against ' + nB + ' for ' + names[1] + '. Throw values are in the thrower\'s own beats. ' +
				'Time unit: 1/' + L + ' cycle.',
			generator: 'polyrhythm-passing-generator',
		},
		highLevelDescription: { type: 'polyrhythmicSiteswap', description: names[0] + ': ' + strA + ' | ' + names[1] + ': ' + strB },
		jugglers: [
			{ name: names[0], position: [1.6, 0, 0], lookAt: [0, 0, 0] },
			{ name: names[1], position: [-1.6, 0, 0], lookAt: [0, 0, 0] },
		],
		limbs: [
			{ juggler: 0, type: 'right hand' }, { juggler: 0, type: 'left hand' },
			{ juggler: 1, type: 'right hand' }, { juggler: 1, type: 'left hand' },
		],
		props: makeProps(clubCount(seqA, seqB, cfg), propType),
		timeStretchFactor: 2 * L / (nA + nB),
		repetition: { period: periodCycles * L },
		throws,
	};
}

/*
 * Jif for a solo polyrhythm pattern: one juggler, right hand on the nR grid,
 * left hand on the nL grid. The hands run at different tempos, which the
 * animation's per-juggler beat heuristic cannot express, so dwell and spins
 * are set explicitly per throw (one own beat corresponds to two beats of a
 * normal alternating siteswap). Spins follow the global siteswap value, the
 * dwell the catching hand's beat — it is time the catcher holds the prop.
 */

function makeProps(count, propType) {
	return Array.from({ length: count }, () =>
		propType === 'ball'
			? { type: 'ball', color: '#ff0000' } // bright red for visibility
			: { type: propType });
}

/*
 * Juggling speed that runs the faster hand at a given throw rate. That hand's
 * tick is two global beats (see the timeStretchFactor below) and the animation
 * advances jugglingSpeed * animationSpeed beats per real second, so the hand
 * throws 30 * jugglingSpeed * animationSpeed times a minute — whatever the
 * ratio of the two hands. Pass the animation speed the player starts at rather
 * than its live value, so the speed slider scales the tempo from here instead
 * of being cancelled out.
 */
export function soloJugglingSpeed(throwsPerMinute, animationSpeed) {
	return 2 * throwsPerMinute / (60 * animationSpeed);
}

export function buildJifSolo(seqR, seqL, cfg, propType) {
	propType = propType || 'ball';
	const nR = cfg.nA, nL = cfg.nB;
	const L = lcm(nR, nL);
	// one beat of the global siteswap: a hand's own beat spans two of them,
	// counted in the faster hand's rhythm
	const globalBeat = L / (2 * Math.max(nR, nL));
	const throws = [];
	const add = (seq, n, m, limb, otherLimb) => {
		const tick = L / n, otherTick = L / m;
		seq.throws.forEach((o, i) => {
			let duration, to, catchTick;
			if (o.kind === 'self') {
				if (o.v === 0) return;
				duration = o.v * tick;
				to = limb;
				catchTick = tick;
			} else {
				duration = o.jAbs * otherTick - i * tick;
				to = otherLimb;
				catchTick = otherTick;
			}
			// The dwell is spent in the catching hand, so it is bounded by that
			// hand's beat gap, not the thrower's — anything above a full gap and
			// the hand would still hold this prop when it has to throw the next
			// one. Where the window between the two throws is shorter than that,
			// the prop is carried across instead (see CARRY_RATIO).
			const dwell = Math.min(DWELL_RATIO * catchTick, CARRY_RATIO * duration);
			// At 3:2 the right hand's global 3 crosses into the slow left hand,
			// which holds it for two of its three beats — one beat of flight, a
			// hand-over however it is notated, while the left hand's global 3
			// into the fast hand flies for 1²⁄₃ and is a real single.
			throws.push({
				time: i * tick, duration, from: limb, to, label: soloThrowLabel(o),
				dwell,
				spins: soloSpins(spinHeight(duration, dwell, globalBeat)),
			});
		});
	};
	add(seqR, nR, nL, 0, 1);
	add(seqL, nL, nR, 1, 0);
	throws.sort((a, b) => a.time - b.time || a.from - b.from);
	const strR = soloHandSeq(seqR), strL = soloHandSeq(seqL);
	return {
		jif: '0.01',
		meta: {
			name: 'solo polyrhythm ' + nR + ':' + nL + '  R: ' + strR + '  L: ' + strL,
			description: 'Solo polyrhythmic pattern, right hand ' + nR + ' beats per cycle against ' +
				nL + ' for the left hand. Throw values follow vanilla siteswap counting in the ' +
				'throwing hand\'s own rhythm (2 = hold). Time unit: 1/' + L + ' cycle.',
			generator: 'polyrhythm-solo-generator',
		},
		highLevelDescription: { type: 'polyrhythmicSiteswap', description: 'R: ' + strR + ' | L: ' + strL },
		jugglers: [{ name: 'Solo', position: [0, 0, 0], lookAt: [0, 0, 1] }],
		limbs: [
			{ juggler: 0, type: 'right hand' },
			{ juggler: 0, type: 'left hand' },
		],
		props: makeProps(clubCount(seqR, seqL, cfg), propType),
		// run one global siteswap beat per beat of a normal siteswap, so the
		// faster hand throws at the tempo it would in a vanilla pattern and a
		// global 5 flies exactly as high as a 5 anywhere else. The arcs are
		// simulated ballistically against a fixed gravity, and peak height goes
		// with the square of the flight in seconds, so a tempo set any faster
		// than this flattens every throw and reads as heavy gravity.
		timeStretchFactor: globalBeat,
		repetition: { period: L },
		throws,
	};
}

// Independent validity check: simulates one structural period and verifies
// every throwing beat receives exactly one club, empty beats none, and the
// club count is an integer. Returns a list of problems (empty = valid).
export function validatePair(seqA, seqB, cfg) {
	const nA = cfg.nA, nB = cfg.nB, L = lcm(nA, nB);
	const problems = [];
	const landings = new Map();
	const add = (seq, n, m, self, other) => {
		const tick = L / n, otherTick = L / m;
		seq.throws.forEach((o, i) => {
			let target, landTick;
			if (o.kind === 'self') {
				if (o.v === 0) return;
				target = self; landTick = (i + o.v) * tick;
			} else { target = other; landTick = o.jAbs * otherTick; }
			const k = target + ':' + (((landTick % L) + L) % L);
			landings.set(k, (landings.get(k) || 0) + 1);
		});
	};
	add(seqA, nA, nB, 'A', 'B');
	add(seqB, nB, nA, 'B', 'A');
	const check = (seq, n, who) => {
		const tick = L / n;
		seq.throws.forEach((o, i) => {
			const k = who + ':' + i * tick;
			const got = landings.get(k) || 0;
			const want = (o.kind === 'self' && o.v === 0) ? 0 : 1;
			if (got !== want) problems.push(who + ' beat ' + i + ': expects ' + want + ' landing(s), got ' + got);
			landings.delete(k);
		});
	};
	check(seqA, nA, 'A');
	check(seqB, nB, 'B');
	for (const e of landings) problems.push(e[1] + ' landing(s) at ' + e[0] + ' where nobody throws');
	const clubs = clubCount(seqA, seqB, cfg);
	if (!Number.isInteger(clubs)) problems.push('club count not integer: ' + clubs);
	return problems;
}

// Timeline of both jugglers' (or hands') throws over two cycles as an svg
// string. opts.solo: rows are the two hands of one juggler (fixed hand per
// row, no per-beat hand letters); opts.labels: row labels.
export function timelineSvg(sa, sb, cfg, colors, opts) {
	const { cA, cB, cLine, cSoft } = Object.assign(
		{ cA: '#16697a', cB: '#c05621', cLine: '#ccc', cSoft: '#888' }, colors);
	const { solo, labels } = Object.assign({ solo: false, labels: ['A', 'B'] }, opts);
	const nA = cfg.nA, nB = cfg.nB;
	const cycles = 2, cw = 380, x0 = 34, W = x0 + cycles * cw + 40, H = 240;
	const yA = 62, yB = 178;
	let s = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" ' +
		'aria-label="timeline of throws over two cycles">';
	for (let c = 0; c <= cycles; c++) {
		const x = x0 + c * cw;
		s += '<line x1="' + x + '" y1="26" x2="' + x + '" y2="' + (H - 26) + '" stroke="' + cLine + '" stroke-dasharray="3 4"/>';
		if (c < cycles) s += '<text x="' + (x + 4) + '" y="20" font-size="11" fill="' + cSoft + '">cycle ' + c + '</text>';
	}
	s += '<line x1="' + x0 + '" y1="' + yA + '" x2="' + (W - 30) + '" y2="' + yA + '" stroke="' + cLine + '"/>';
	s += '<line x1="' + x0 + '" y1="' + yB + '" x2="' + (W - 30) + '" y2="' + yB + '" stroke="' + cLine + '"/>';
	s += '<text x="8" y="' + (yA + 4) + '" font-size="13" font-weight="700" fill="' + cA + '">' + labels[0] + '</text>';
	s += '<text x="8" y="' + (yB + 4) + '" font-size="13" font-weight="700" fill="' + cB + '">' + labels[1] + '</text>';
	const X = t => x0 + t * cw;
	const arcs = [], marks = [];
	const draw = (seq, n, m, y, yOther, color, self) => {
		for (let c = -1; c < cycles; c++) {
			seq.throws.forEach((o, i) => {
				const t1 = c + i / n;
				const g = ((c % 2) + 2) * n + i;
				if (t1 >= 0) {
					const hand = g % 2 ? 'L' : 'R';
					marks.push('<circle cx="' + X(t1) + '" cy="' + y + '" r="' + ((seq.recv >> i) & 1 ? 5.5 : 3.5) +
						'" fill="' + ((seq.recv >> i) & 1 ? 'none' : color) + '" stroke="' + color + '" stroke-width="1.6"/>' +
						(solo ? '' :
						'<text x="' + X(t1) + '" y="' + (y + (self === 'A' ? -34 : 40)) + '" font-size="9.5" fill="' + cSoft +
						'" text-anchor="middle">' + hand + '</text>'));
				}
				if (o.kind === 'self') {
					if (o.v === 0) return;
					const t2 = t1 + o.v / n;
					if (t2 < -0.02 || t1 > cycles) return;
					const bow = self === 'A' ? -1 : 1;
					arcs.push('<path d="M' + X(t1) + ' ' + y + ' Q' + X((t1 + t2) / 2) + ' ' +
						(y + bow * (14 + 20 * o.v / n)) + ' ' + X(t2) + ' ' + y + '" fill="none" stroke="' + color +
						'" stroke-width="1.4" opacity="0.55"/>');
				} else {
					const t2 = (c * m + o.jAbs) / m;
					if (t2 < -0.02 || t1 > cycles) return;
					const dash = o.straight ? '' : ' stroke-dasharray="5 4"';
					arcs.push('<path d="M' + X(t1) + ' ' + y + ' Q' + X((t1 + t2) / 2) + ' ' + ((y + yOther) / 2) +
						' ' + X(t2) + ' ' + yOther + '" fill="none" stroke="' + color + '" stroke-width="2"' + dash + '/>');
				}
			});
		}
	};
	draw(sa, nA, nB, yA, yB, cA, 'A');
	draw(sb, nB, nA, yB, yA, cB, 'B');
	s += arcs.join('') + marks.join('');
	s += '<text x="' + x0 + '" y="' + (H - 8) + '" font-size="11" fill="' + cSoft + '">' +
		(solo ? 'dashed arcs = crossing to the other hand (X) · open circle = catches from the other hand'
			: 'passes: solid = straight II, dashed = crossing X · open circle = receives') + '</text>';
	return s + '</svg>';
}
