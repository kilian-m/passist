<script>
	import { onMount } from 'svelte';
	import { defaults, useLocalStorage } from '$lib/passist.mjs';
	import { base } from '$app/paths';
	import { goto, replaceState } from '$app/navigation';
	import AnimationWidget from '$lib/AnimationWidget.svelte';
	import InputField from '$lib/InputField.svelte';
	import Jif from '$lib/jif.mjs';
	import {
		generateSolo, buildJifSolo, validatePair, soloJugglingSpeed,
		soloHandSeq, soloNotation, soloNotationGrid, normalizeSoloNotation, soloNotationBeats,
		timelineSvg, causalSvg, seqToken,
	} from '$lib/polyrhythm.mjs';

	// tempo of the faster hand, with the speed slider where it starts. Balls run
	// quicker than clubs, as they do in hand
	const fastHandThrowsPerMinute = { ball: 100, club: 85 };

	// left hand faster by default, as in the notation's examples
	let nR = 2, nL = 3, minHeight = 2, maxHeight = 10;
	let includeHolds = false, allowZero = false;

	// pattern + settings live in the url so they can be saved and shared; the
	// pattern as its (unadjusted) notation, e.g. ?p=({4II,4X,5X},{2X,3X}), which
	// also sets the beats per hand. Older links name each hand's sequence by
	// internal tokens in r and l.
	let pendingP = null, pendingR = null, pendingL = null;
	if (typeof window !== 'undefined') {
		const q = new URLSearchParams(window.location.search);
		if (q.has('nr')) nR = +q.get('nr');
		if (q.has('nl')) nL = +q.get('nl');
		pendingP = q.get('p');
		const beats = pendingP && soloNotationBeats(pendingP);
		if (beats) [nL, nR] = beats;
		if (q.has('hmin')) minHeight = +q.get('hmin');
		if (q.has('hmax')) maxHeight = +q.get('hmax');
		if (q.get('holds') === '1') includeHolds = true;
		if (q.get('zero') === '1') allowZero = true;
		pendingR = q.get('r');
		pendingL = q.get('l');
	}
	let propType = 'ball';
	$: jugglingSpeed = soloJugglingSpeed(fastHandThrowsPerMinute[propType], defaults.animationSpeed);
	let ballFilter = -1;
	let res = null, genError = '', genInfo = '';
	let sel = null;      // selected pattern object from res.patterns
	let shown = 1;
	const PAGE = 100;
	let animationSpeed = defaults.animationSpeed;

	const handColors = { cA: '#c05621', cB: '#16697a' };
	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || lo));

	$: regenerate(nR, nL, minHeight, maxHeight, includeHolds, allowZero);
	function regenerate() {
		genError = '';
		try {
			const t0 = Date.now();
			res = generateSolo({
				nR: clamp(nR, 1, 9), nL: clamp(nL, 1, 9),
				minHeight: clamp(minHeight, 1, 18),
				maxHeight: clamp(maxHeight, 2, 24),
				includeHolds, allowZero,
			});
			genInfo = res.patterns.length.toLocaleString() + ' patterns (' + (Date.now() - t0) + ' ms)';
		} catch (e) {
			res = null;
			genError = e.message || String(e);
		}
		sel = null;
		shown = 1;
		if (res && pendingP != null) {
			const want = normalizeSoloNotation(pendingP);
			sel = res.patterns.find(p =>
				normalizeSoloNotation(soloNotation(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg, false, 'ascii')) === want) || null;
		} else if (res && pendingR != null) {
			sel = res.patterns.find(p =>
				seqToken(res.seqsA[p.ia]) === pendingR && seqToken(res.seqsB[p.ib]) === pendingL) || null;
		}
		pendingP = pendingR = pendingL = null;
		// make a linked pattern visible even when it is far down the list
		if (sel) shown = Math.floor(res.patterns.indexOf(sel) / PAGE) + 1;
	}

	let mounted = false;
	onMount(() => { mounted = true; });
	$: if (mounted) syncUrl(res, sel);
	function syncUrl() {
		if (!res) return;
		const q = new URLSearchParams();
		q.set('nr', res.cfg.nR); q.set('nl', res.cfg.nL);
		q.set('hmin', res.cfg.minHeight); q.set('hmax', res.cfg.maxHeight);
		if (res.cfg.includeHolds) q.set('holds', '1');
		if (res.cfg.allowZero) q.set('zero', '1');
		let search = q.toString();
		// brackets, commas and slashes are fine in a query and keep it readable
		if (sel)
			search += '&p=' + encodeURIComponent(soloNotation(res.seqsA[sel.ia], res.seqsB[sel.ib], res.cfg, false, 'ascii'))
				.replace(/%(28|29|2C|7B|7D|2F)/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
		try { replaceState('?' + search, {}); }
		catch { history.replaceState(history.state, '', '?' + search); }
	}

	$: ballOptions = res ? [...new Set(res.patterns.map(p => p.balls))].sort((a, b) => a - b) : [];
	$: if (res && ballFilter >= 0 && !ballOptions.includes(ballFilter)) ballFilter = -1;
	$: list = res ? res.patterns.filter(p => ballFilter < 0 || p.balls === ballFilter) : [];
	$: if (res && (!sel || !list.includes(sel))) sel = list[0] || null;

	$: pattern = (sel && res) ? buildPattern(sel, propType) : null;
	function buildPattern(p, pt) {
		const sa = res.seqsA[p.ia], sb = res.seqsB[p.ib];
		const jifRaw = buildJifSolo(sa, sb, res.cfg, pt);
		const swapped = Object.assign({}, res.cfg, { nA: res.cfg.nB, nB: res.cfg.nA });
		const problems = validatePair(sa, sb, res.cfg);
		let completed = null, warnings = [];
		try {
			const c = Jif.complete(jifRaw, { expand: true, propType: pt });
			completed = c.jif; warnings = c.warnings;
		} catch (e) {
			warnings = [String(e)];
		}
		return {
			sa, sb, jifRaw, completed, warnings, problems,
			jifString: JSON.stringify(jifRaw, null, 2),
			balls: p.balls, nCross: p.nCross,
			periodTicks: jifRaw.repetition.period,
			// left hand on top, as in the notation
			svg: timelineSvg(sb, sa, swapped, handColors, { solo: true, labels: ['L', 'R'] }),
			causal: causalSvg(sb, sa, swapped, handColors, { labels: ['L', 'R'] }),
			grids: [soloNotationGrid(sa, sb, res.cfg, false, true), soloNotationGrid(sa, sb, res.cfg, true, true)],
		};
	}

	function openInJifPage() {
		if (!pattern) return;
		if (useLocalStorage)
			localStorage.setItem('jif', pattern.jifString);
		goto(base + '/jif');
	}
	let savelink;
	function saveJif() {
		if (!pattern) return;
		savelink.href = window.URL.createObjectURL(new Blob([pattern.jifString], { type: 'application/jif+json' }));
	}
	$: saveName = pattern ?
		('solo-poly-' + res.cfg.nA + '-' + res.cfg.nB + '-' + soloHandSeq(pattern.sa) + '-' + soloHandSeq(pattern.sb)).replace(/[^\w.-]+/g, '_') + '.jif'
		: 'pattern.jif';
</script>

<style>
	.tabs { display:flex; gap:0.3em; margin-bottom:1em }
	.tabs a { padding:0.3em 1.1em; border:1px solid #ddd; border-radius:4px 4px 0 0; border-bottom:none;
		text-decoration:none; color:#555; background:#f0f0f0 }
	.tabs a.active { background:#fff; color:#16697a; font-weight:700; border-color:#bbb }

	.controls { display:flex; flex-wrap:wrap; align-items:flex-end; gap:0 0.5em }
	.checks { display:flex; flex-wrap:wrap; gap:1.5em; margin:0 1em 1em 0; align-items:center }
	.geninfo { color:#666; font-size:0.85em; margin-bottom:1em }
	.generror { color:#dc3545; margin-bottom:1em }

	.panel { border:1px solid #ddd; border-radius:4px; overflow:hidden; background:#fff; max-width:70em }
	.phead { display:flex; justify-content:space-between; align-items:center; gap:0.5em;
		padding:0.4em 0.7em; border-bottom:1px solid #ddd; background:#f7f7f7;
		font-size:0.8em; text-transform:uppercase; letter-spacing:0.06em; color:#555 }
	.phead select { font-size:1em; max-width:10em }
	.list { max-height:26em; overflow-y:auto }
	.row { display:grid; grid-template-columns:0.8fr 0.8fr 1.4fr 1.4fr auto; gap:0.8em; align-items:center;
		padding:0.35em 0.7em; cursor:pointer; border-bottom:1px solid #eee; font-size:0.95em }
	.row.hdr { cursor:default; font-size:0.75em; text-transform:uppercase; letter-spacing:0.05em;
		color:#888; background:#fbfbfb; position:sticky; top:0 }
	@media (max-width:50em) { .row { grid-template-columns:1fr 1fr; } .row .not, .row .adj { grid-column:1 / -1 } }
	.row:hover:not(.hdr) { background:#f0f6f8 }
	.row.sel { background:#e3eff1; box-shadow:inset 3px 0 0 #16697a }
	.row .meta { font-size:0.8em; color:#888; white-space:nowrap; text-align:right }
	.seqstr { font-family:ui-monospace, Menlo, Consolas, monospace; font-variant-numeric:tabular-nums;
		white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
	.seqstr :global(sub.orient) { font-size:0.6em }
	.seqstr :global(.frac) { display:inline-flex; flex-direction:column; align-items:center;
		font-size:0.48em; line-height:1.1; vertical-align:middle; margin:0 0.1em }
	.seqstr :global(.frac .fn) { border-bottom:1px solid currentColor; padding:0 0.2em }
	.hR, .seqstr :global(.hR) { color:#16697a }
	.hL, .seqstr :global(.hL) { color:#c05621 }
	.more { width:100%; border:none; background:#f0f0f0; padding:0.4em; cursor:pointer }
	.empty { padding:1.5em; text-align:center; color:#888 }

	.pattern { margin-top:1em }
	.credit { margin-top:0.8em; font-size:0.8em; color:#888 }
	.notations { display:flex; flex-wrap:wrap; gap:0.6em 2.5em; margin:0.2em 0 0.6em }
	.notwrap { overflow-x:auto; max-width:100% }
	.notlabel { font-size:0.75em; text-transform:uppercase; letter-spacing:0.05em; color:#888 }
	.notgrid { display:inline-grid; font-size:1.4em; overflow:visible; row-gap:0.1em }
	.notgrid > span { padding-right:0.35em }
	.notgrid .brace { text-align:right; padding-right:0 }
	.patstr { display:grid; grid-template-columns:auto 1fr; gap:0.2em 0.8em; align-items:baseline }
	.patstr .who { font-weight:700 }
	.patstr .who.r { color:#16697a } .patstr .who.l { color:#c05621 }
	.patstr .seqstr { font-size:1.4em; overflow-x:auto; text-overflow:clip }
	.badges { display:flex; flex-wrap:wrap; gap:0.5em; margin:0.6em 0; font-size:0.85em }
	.badge { padding:0.1em 0.7em; border-radius:99px; background:#f0f0f0; border:1px solid #ddd; color:#555 }
	.badge.ok { color:#2f7d4f; border-color:#2f7d4f }
	.badge.err { color:#b3382f; border-color:#b3382f }
	.svgwrap { overflow-x:auto; margin:0.5em 0 }
	.jifbtns { display:flex; flex-wrap:wrap; gap:0.6em; margin:0.6em 0 }
	.warnings { color:orange }
	.animwrap { max-width:56em }
	.animbox { height:26em }
	label.pure-button { margin:0 }
</style>

<h1>Solo polyrhythmic juggling</h1>

<div class=tabs>
	<a href="{base}/polyrhythm">Passing</a>
	<a href="{base}/polyrhythm/solo" class=active aria-current=page>Solo</a>
</div>

<p>
	One juggler, hands at different tempos: the <b class=hL>left hand</b> throws {nL}
	and the <b class=hR>right hand</b> {nR} times per cycle.
</p>

<div class=controls>
	<InputField bind:value={nR} type=number id=nr label="beats right" min=1 max=9 defaultValue=2 />
	<InputField bind:value={nL} type=number id=nl label="beats left" min=1 max=9 defaultValue=3 />
	<InputField bind:value={minHeight} type=number id=minheight label="min height" min=1 max=18 step=1 defaultValue=2 />
	<InputField bind:value={maxHeight} type=number id=maxheight label="max height" min=2 max=24 step=1 defaultValue=10 />
</div>
<div class=checks>
	<label><input type=checkbox bind:checked={includeHolds}> include holds (same-hand 2s)</label>
	<label><input type=checkbox bind:checked={allowZero}> allow 0 (empty beat)</label>
</div>
{#if genError}<div class=generror>{genError}</div>{:else}<div class=geninfo>{genInfo}</div>{/if}

{#if res}
<div class=panel>
	<div class=phead><span>Patterns</span>
		<select bind:value={ballFilter} on:change={() => shown = 1}>
			<option value={-1}>any # balls</option>
			{#each ballOptions as b}<option value={b}>{b} ball{b == 1 ? '' : 's'}</option>{/each}
		</select>
	</div>
	<div class=list>
		<div class="row hdr">
			<span class=hR>right hand</span><span class=hL>left hand</span>
			<span class=not>notation</span><span class=adj>dwell adjusted</span><span></span>
		</div>
		{#each list.slice(0, shown * PAGE) as p (p.ia + ':' + p.ib)}
		<div class=row class:sel={sel === p} on:click={() => sel = p}
			on:keydown={e => (e.key == 'Enter' || e.key == ' ') && (sel = p)} tabindex=0 role=button>
			<span class="seqstr hR">{@html soloHandSeq(res.seqsA[p.ia], true)}</span>
			<span class="seqstr hL">{@html soloHandSeq(res.seqsB[p.ib], true)}</span>
			<span class="seqstr not">{@html soloNotation(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg, false, true)}</span>
			<span class="seqstr adj">{@html soloNotation(res.seqsA[p.ia], res.seqsB[p.ib], res.cfg, true, true)}</span>
			<span class=meta>{p.balls} ball{p.balls == 1 ? '' : 's'} · {p.nCross} ✕</span>
		</div>
		{/each}
		{#if list.length > shown * PAGE}
		<button class=more on:click={() => shown++}>show more ({(list.length - shown * PAGE).toLocaleString()} hidden)</button>
		{/if}
		{#if !list.length}<div class=empty>no patterns match</div>{/if}
	</div>
</div>
{/if}

{#if pattern}
<div class=pattern>
	<div class=patstr>
		<span class="who l">L</span><span class=seqstr>{@html soloHandSeq(pattern.sb, true)}</span>
		<span class="who r">R</span><span class=seqstr>{@html soloHandSeq(pattern.sa, true)}</span>
	</div>
	<div class=credit>notation by @don_kuehleon</div>
	<div class=notations>
		{#each pattern.grids as g, k}
		<div class=notwrap>
			<div class=notlabel>{k ? 'dwell adjusted' : 'notation'}</div>
			<div class="seqstr notgrid" style="grid-template-columns:auto repeat({g.ticks}, 1fr) auto">
				{#each g.rows as row, r}
				<span class=brace style="grid-row:{r + 1}; grid-column:1">{r ? '{' : '({'}</span>
				{#each row as c, i}
				<span class={r ? 'hR' : 'hL'} style="grid-row:{r + 1}; grid-column:{c.col + 2} / span {c.span}">{@html c.label}{i < row.length - 1 ? ',' : ''}</span>
				{/each}
				<span style="grid-row:{r + 1}; grid-column:{g.ticks + 2}">{r ? '})' + (k ? '°' : '') : '},'}</span>
				{/each}
			</div>
		</div>
		{/each}
	</div>
	<div class=badges>
		<span class=badge>{pattern.balls} ball{pattern.balls == 1 ? '' : 's'}</span>
		<span class=badge>{pattern.nCross} crossing throw{pattern.nCross == 1 ? '' : 's'} per cycle</span>
		<span class=badge>period {pattern.periodTicks} ticks = 1 cycle</span>
		{#if pattern.problems.length}
			<span class="badge err">✗ {pattern.problems[0]}</span>
		{:else}
			<span class="badge ok">✓ verified valid</span>
		{/if}
	</div>

	{#if pattern.completed}
	<div class=animwrap>
		<div class=animbox>
			<AnimationWidget jif={pattern.completed} {jugglingSpeed} animationSpeed={parseFloat(animationSpeed)} />
		</div>
		<div class=controls>
			<InputField id=proptype type=custom label="Prop type">
				<label class="pure-button" class:pure-button-active={propType == 'ball'}>
					<input type="radio" bind:group={propType} value="ball" autocomplete="off"> Balls
				</label>
				<label class="pure-button" class:pure-button-active={propType == 'club'}>
					<input type="radio" bind:group={propType} value="club" autocomplete="off"> Clubs
				</label>
			</InputField>
			<InputField
				bind:value={animationSpeed}
				type=range
				id=animationspeed
				label='Animation speed'
				step=0.1 min=0.1 max=2
				defaultValue={defaults.animationSpeed}
			/>
		</div>
	</div>
	{/if}
	{#if pattern.warnings.length}
	<ul class=warnings>{#each pattern.warnings as w}<li>{w}</li>{/each}</ul>
	{/if}

	<div class=svgwrap>{@html pattern.svg}</div>
	<div class=svgwrap>{@html pattern.causal}</div>

	<div class=jifbtns>
		<button class=pure-button on:click={openInJifPage}>open in jif editor</button>
		<a href="{base}/jif" bind:this={savelink} class=pure-button download={saveName} on:click={saveJif}>save .jif</a>
	</div>
</div>
{/if}
