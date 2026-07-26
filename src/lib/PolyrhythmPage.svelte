<script>
	import { onMount } from 'svelte';
	import { defaults, useLocalStorage } from '$lib/passist.mjs';
	import { base } from '$app/paths';
	import { goto, replaceState } from '$app/navigation';
	import AnimationWidget from '$lib/AnimationWidget.svelte';
	import InputField from '$lib/InputField.svelte';
	import Jif from '$lib/jif.mjs';
	import {
		generate, buildJif, validatePair, seqString, clubCount,
		maskToBeats, popcount, lcm, timelineSvg, seqToken,
	} from '$lib/polyrhythm.mjs';

	let nA = 5, nB = 7, selfMax = 4, passMin = 2.5, passMax = 4.5;
	let allowZero = false, excludeHolds = true;
	let propType = 'club';
	let res = null, genError = '', genInfo = '';
	let itf = null;         // selected interface object
	let selA = null, selB = null; // selected sequence indices (into res.seqsA/B)
	let passFilter = -1, clubFilter = -1, filterA = '', filterB = '';
	let pageA = 1, pageB = 1;
	const PAGE = 200;
	let animationSpeed = defaults.animationSpeed;

	function doGenerate() {
		genError = '';
		try {
			const t0 = Date.now();
			res = generate({
				nA: clamp(nA, 2, 9), nB: clamp(nB, 2, 9),
				selfMax: clamp(selfMax, 1, 9),
				passMin: +passMin || 2.5, passMax: +passMax || 4.5,
				allowZero, excludeHolds,
			});
			genInfo = res.seqsA.length.toLocaleString() + ' A-sequences, ' +
				res.seqsB.length.toLocaleString() + ' B-sequences, ' +
				res.interfaces.filter(i => i.nPasses > 0).length + ' interfaces with passes (' +
				(Date.now() - t0) + ' ms)';
			passFilter = -1;
			if (!applyPendingSelection())
				selectInterface(res.interfaces.find(i => i.nPasses > 0) || null);
		} catch (e) {
			res = null; itf = null; selA = selB = null;
			genError = e.message || String(e);
		}
	}

	// pattern + settings live in the url so they can be saved and shared
	let pendingA = null, pendingB = null;
	function applyPendingSelection() {
		const tokA = pendingA, tokB = pendingB;
		pendingA = pendingB = null;
		if (tokA == null || tokB == null) return false;
		const iA = res.seqsA.findIndex(s => seqToken(s) === tokA);
		const iB = res.seqsB.findIndex(s => seqToken(s) === tokB);
		if (iA < 0 || iB < 0) return false;
		const sa = res.seqsA[iA], sb = res.seqsB[iB];
		if (sb.recv !== sa.out || sb.out !== sa.recv) return false;
		const found = res.interfaces.find(i => i.SA === sa.recv && i.SB === sa.out);
		if (!found) return false;
		selectInterface(found);
		selA = iA;
		selB = iB;
		return true;
	}

	let mounted = false;
	$: if (mounted) syncUrl(res, selA, selB);
	function syncUrl() {
		if (!res) return;
		const q = new URLSearchParams();
		q.set('na', res.cfg.nA); q.set('nb', res.cfg.nB);
		q.set('smax', res.cfg.selfMax);
		q.set('pmin', res.cfg.passMin); q.set('pmax', res.cfg.passMax);
		if (!res.cfg.excludeHolds) q.set('holds', '1');
		if (res.cfg.allowZero) q.set('zero', '1');
		if (selA != null && selB != null) {
			q.set('a', seqToken(res.seqsA[selA]));
			q.set('b', seqToken(res.seqsB[selB]));
		}
		try { replaceState('?' + q.toString(), {}); }
		catch { history.replaceState(history.state, '', '?' + q.toString()); }
	}
	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, +v || lo));

	function selectInterface(newItf) {
		itf = newItf;
		clubFilter = -1; filterA = ''; filterB = '';
		pageA = pageB = 1;
		selA = itf ? itf.aIdx[0] : null;
		selB = itf ? itf.bIdx[0] : null;
	}
	function selectA(i) { selA = i; pageB = 1; }
	function selectB(i) { selB = i; }

	onMount(() => {
		const q = new URLSearchParams(window.location.search);
		if (q.has('na')) nA = +q.get('na');
		if (q.has('nb')) nB = +q.get('nb');
		if (q.has('smax')) selfMax = +q.get('smax');
		if (q.has('pmin')) passMin = +q.get('pmin');
		if (q.has('pmax')) passMax = +q.get('pmax');
		if (q.get('holds') === '1') excludeHolds = false;
		if (q.get('zero') === '1') allowZero = true;
		pendingA = q.get('a');
		pendingB = q.get('b');
		doGenerate();
		mounted = true;
	});

	$: interfaces = res ? res.interfaces.filter(i =>
		i.nPasses > 0 && (passFilter < 0 || i.nPasses == passFilter)) : [];
	$: passCounts = res ? [...new Set(res.interfaces.map(i => i.nPasses))].filter(c => c > 0).sort((a, b) => a - b) : [];

	$: den = res ? res.cfg.nA * res.cfg.nB : 1;
	$: listA = (itf && res) ? itf.aIdx.filter(i =>
		!filterA || seqString(res.seqsA[i]).includes(filterA)) : [];
	$: listB = (itf && res) ? itf.bIdx.filter(i => {
		if (clubFilter >= 0 && selA != null && res.seqsB[i].num !== clubFilter * den - res.seqsA[selA].num)
			return false;
		return !filterB || seqString(res.seqsB[i]).includes(filterB);
	}) : [];
	$: clubOptions = itf && res ? clubRange() : [];
	function clubRange() {
		const aNums = itf.aIdx.map(i => res.seqsA[i].num), bNums = itf.bIdx.map(i => res.seqsB[i].num);
		const lo = Math.ceil((Math.min(...aNums) + Math.min(...bNums)) / den);
		const hi = Math.floor((Math.max(...aNums) + Math.max(...bNums)) / den);
		const r = [];
		for (let c = lo; c <= hi; c++) r.push(c);
		return r;
	}

	$: seqA = (res && selA != null) ? res.seqsA[selA] : null;
	$: seqB = (res && selB != null) ? res.seqsB[selB] : null;
	$: pattern = (seqA && seqB) ? buildPattern(seqA, seqB, propType) : null;
	function buildPattern(sa, sb, pt) {
		const jifRaw = buildJif(sa, sb, res.cfg, null, pt);
		const problems = validatePair(sa, sb, res.cfg);
		let completed = null, warnings = [];
		try {
			const c = Jif.complete(jifRaw, { expand: true, propType: pt });
			completed = c.jif; warnings = c.warnings;
		} catch (e) {
			warnings = [String(e)];
		}
		return {
			jifRaw, completed, warnings, problems,
			jifString: JSON.stringify(jifRaw, null, 2),
			clubs: clubCount(sa, sb, res.cfg),
			nPasses: popcount(sa.out),
			periodTicks: jifRaw.repetition.period,
			cycles: jifRaw.repetition.period / lcm(res.cfg.nA, res.cfg.nB),
			svg: timelineSvg(sa, sb, res.cfg),
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
		('poly-' + res.cfg.nA + '-' + res.cfg.nB + '-' + seqString(seqA) + '-' + seqString(seqB)).replace(/[^\w.-]+/g, '_') + '.jif'
		: 'pattern.jif';
</script>

<style>
	.tabs { display:flex; gap:0.3em; margin-bottom:1em }
	.tabs a { padding:0.3em 1.1em; border:1px solid #ddd; border-radius:4px 4px 0 0; border-bottom:none;
		text-decoration:none; color:#555; background:#f0f0f0 }
	.tabs a.active { background:#fff; color:#16697a; font-weight:700; border-color:#bbb }
	.controls { display:flex; flex-wrap:wrap; align-items:flex-end; gap:0 0.5em }
	.checks { display:flex; gap:1.5em; margin:0 1em 1em 0; align-items:center }
	.geninfo { color:#666; font-size:0.85em; margin-bottom:1em }
	.generror { color:#dc3545; margin-bottom:1em }

	.cols { display:grid; grid-template-columns: 21em 1fr 1fr; gap:0.8em; align-items:start }
	@media (max-width:60em) { .cols { grid-template-columns: 1fr } }
	.panel { border:1px solid #ddd; border-radius:4px; overflow:hidden; background:#fff }
	.phead { display:flex; justify-content:space-between; align-items:center; gap:0.5em;
		padding:0.4em 0.7em; border-bottom:1px solid #ddd; background:#f7f7f7;
		font-size:0.8em; text-transform:uppercase; letter-spacing:0.06em; color:#555 }
	.phead select, .phead input { font-size:1em; max-width:9em }
	.list { max-height:24em; overflow-y:auto }
	.row { display:flex; gap:0.6em; align-items:center; padding:0.35em 0.7em;
		cursor:pointer; border-bottom:1px solid #eee; font-size:0.95em }
	.row:hover { background:#f0f6f8 }
	.row.sel { background:#e3eff1; box-shadow:inset 3px 0 0 #16697a }
	.rowB .row.sel { background:#f9ebe2; box-shadow:inset 3px 0 0 #c05621 }
	.row .meta { font-size:0.8em; color:#888; white-space:nowrap; margin-left:auto }
	.seqstr { font-family:ui-monospace, Menlo, Consolas, monospace; font-variant-numeric:tabular-nums;
		white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
	.seqstr :global(sub.orient) { font-size:0.6em }
	.seqstr :global(.frac) { display:inline-flex; flex-direction:column; align-items:center;
		font-size:0.48em; line-height:1.1; vertical-align:middle; margin:0 0.1em }
	.seqstr :global(.frac .fn) { border-bottom:1px solid currentColor; padding:0 0.2em }
	.seqstr :global(.recv) { border-bottom:2px dotted currentColor }
	.more { width:100%; border:none; background:#f0f0f0; padding:0.4em; cursor:pointer }
	.empty { padding:1.5em; text-align:center; color:#888 }

	.mini { display:flex; flex-direction:column; gap:2px; width:7em; flex:none }
	.mini .r { display:flex; gap:1px }
	.mini .c { flex:1; height:8px; border-radius:2px; background:#eee; border:1px solid #ddd }
	.mini .rA .c.on { background:#16697a; border-color:#16697a }
	.mini .rB .c.on { background:#c05621; border-color:#c05621 }

	.pattern { margin-top:1em }
	.patstr { display:grid; grid-template-columns:auto 1fr; gap:0.2em 0.8em; align-items:baseline }
	.patstr .who { font-weight:700 }
	.patstr .who.a { color:#16697a } .patstr .who.b { color:#c05621 }
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

<h1>Polyrhythmic passing patterns</h1>

<div class=tabs>
	<a href="{base}/polyrhythm" class=active aria-current=page>Passing</a>
	<a href="{base}/polyrhythm/solo">Solo</a>
</div>

<p>
	Juggler <b style="color:#16697a">A</b> and juggler <b style="color:#c05621">B</b> share a common
	cycle but throw at different tempos ({nA} against {nB} beats per cycle). Throw values are counted
	in the <b>thrower's own beats</b>; passes must land on the partner's grid, so they carry fractions.
	<sub>II</sub> = straight pass, <sub>X</sub> = crossing,
	<span class="seqstr"><span class="recv">dotted</span></span> = beat receives a pass.
	Pick an interface (which beats receive), then one sequence per juggler.
</p>

<div class=controls>
	<InputField bind:value={nA} type=number id=nA label="beats A" min=2 max=9 defaultValue=5 />
	<InputField bind:value={nB} type=number id=nB label="beats B" min=2 max=9 defaultValue=7 />
	<InputField bind:value={selfMax} type=number id=selfmax label="max self" min=1 max=9 defaultValue=4 />
	<InputField bind:value={passMin} type=number id=passmin label="min pass" min=1 max=9 step=0.5 defaultValue=2.5 />
	<InputField bind:value={passMax} type=number id=passmax label="max pass" min=2 max=10 step=0.5 defaultValue=4.5 />
</div>
<div class=checks>
	<label><input type=checkbox bind:checked={excludeHolds}> exclude holds (no 2s)</label>
	<label><input type=checkbox bind:checked={allowZero}> allow 0 (empty beat)</label>
	<button class="pure-button pure-button-primary" on:click={doGenerate}>Generate</button>
</div>
{#if genError}<div class=generror>{genError}</div>{:else}<div class=geninfo>{genInfo}</div>{/if}

{#if res}
<div class=cols>
	<div class=panel>
		<div class=phead><span>Interfaces</span>
			<select bind:value={passFilter}>
				<option value={-1}>any # passes</option>
				{#each passCounts as c}<option value={c}>{c} pass{c > 1 ? 'es' : ''}</option>{/each}
			</select>
		</div>
		<div class=list>
			{#each interfaces as i (i.SA + ':' + i.SB)}
			<div class=row class:sel={itf === i} on:click={() => selectInterface(i)}
				on:keydown={e => (e.key == 'Enter' || e.key == ' ') && selectInterface(i)} tabindex=0 role=button>
				<div class=mini>
					<div class="r rA">{#each Array(res.cfg.nA) as _, b}<div class=c class:on={(i.SA >> b) & 1}></div>{/each}</div>
					<div class="r rB">{#each Array(res.cfg.nB) as _, b}<div class=c class:on={(i.SB >> b) & 1}></div>{/each}</div>
				</div>
				<div>
					<div style="font-size:0.85em">A&thinsp;@&thinsp;{maskToBeats(i.SA, res.cfg.nA).join(',')}
						&nbsp; B&thinsp;@&thinsp;{maskToBeats(i.SB, res.cfg.nB).join(',')}</div>
					<div class=meta>{i.nPasses} pass{i.nPasses > 1 ? 'es' : ''} each · {i.aIdx.length.toLocaleString()} × {i.bIdx.length.toLocaleString()}</div>
				</div>
			</div>
			{/each}
			{#if !interfaces.length}<div class=empty>no interfaces match</div>{/if}
		</div>
	</div>

	<div class=panel>
		<div class=phead><span style="color:#16697a">Sequences A</span>
			<input placeholder="filter…" bind:value={filterA} on:input={() => pageA = 1}></div>
		<div class=list>
			{#each listA.slice(0, pageA * PAGE) as i (i)}
			<div class=row class:sel={selA === i} on:click={() => selectA(i)}
				on:keydown={e => (e.key == 'Enter' || e.key == ' ') && selectA(i)} tabindex=0 role=button>
				<span class=seqstr>{@html seqString(res.seqsA[i], true, true)}</span>
				<span class=meta>{Math.round(100 * res.seqsA[i].num / den) / 100}</span>
			</div>
			{/each}
			{#if listA.length > pageA * PAGE}
			<button class=more on:click={() => pageA++}>show more ({(listA.length - pageA * PAGE).toLocaleString()} hidden)</button>
			{/if}
			{#if !listA.length}<div class=empty>no sequences match</div>{/if}
		</div>
	</div>

	<div class="panel rowB">
		<div class=phead><span style="color:#c05621">Sequences B</span>
			<span style="display:flex;gap:0.4em">
			<select bind:value={clubFilter} on:change={() => pageB = 1} title="total clubs with the selected A sequence">
				<option value={-1}>any clubs</option>
				{#each clubOptions as c}<option value={c}>{c} clubs</option>{/each}
			</select>
			<input placeholder="filter…" bind:value={filterB} on:input={() => pageB = 1}></span></div>
		<div class=list>
			{#each listB.slice(0, pageB * PAGE) as i (i)}
			<div class=row class:sel={selB === i} on:click={() => selectB(i)}
				on:keydown={e => (e.key == 'Enter' || e.key == ' ') && selectB(i)} tabindex=0 role=button>
				<span class=seqstr>{@html seqString(res.seqsB[i], true, true)}</span>
				<span class=meta>{Math.round(100 * res.seqsB[i].num / den) / 100}</span>
			</div>
			{/each}
			{#if listB.length > pageB * PAGE}
			<button class=more on:click={() => pageB++}>show more ({(listB.length - pageB * PAGE).toLocaleString()} hidden)</button>
			{/if}
			{#if !listB.length}<div class=empty>no sequences match</div>{/if}
		</div>
	</div>
</div>
{/if}

{#if pattern}
<div class=pattern>
	<div class=patstr>
		<span class="who a">A</span><span class=seqstr>{@html seqString(seqA, true, true)}</span>
		<span class="who b">B</span><span class=seqstr>{@html seqString(seqB, true, true)}</span>
	</div>
	<div class=badges>
		<span class=badge>{pattern.clubs} {propType == 'ball' ? 'balls' : 'clubs'}</span>
		<span class=badge>{pattern.nPasses} pass{pattern.nPasses == 1 ? '' : 'es'} each per cycle</span>
		<span class=badge>period {pattern.periodTicks} ticks = {pattern.cycles} cycles</span>
		{#if pattern.problems.length}
			<span class="badge err">✗ {pattern.problems[0]}</span>
		{:else}
			<span class="badge ok">✓ verified valid</span>
		{/if}
	</div>

	{#if pattern.completed}
	<div class=animwrap>
		<div class=animbox>
			<AnimationWidget jif={pattern.completed} animationSpeed={parseFloat(animationSpeed)} />
		</div>
		<div class=controls>
			<InputField id=proptype type=custom label="Prop type">
				<label class="pure-button" class:pure-button-active={propType == 'club'}>
					<input type="radio" bind:group={propType} value="club" autocomplete="off"> Clubs
				</label>
				<label class="pure-button" class:pure-button-active={propType == 'ball'}>
					<input type="radio" bind:group={propType} value="ball" autocomplete="off"> Balls
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

	<div class=jifbtns>
		<button class=pure-button on:click={openInJifPage}>open in jif editor</button>
		<a href="{base}/jif" bind:this={savelink} class=pure-button download={saveName} on:click={saveJif}>save .jif</a>
	</div>
</div>
{/if}
