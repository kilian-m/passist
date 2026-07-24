<script>
	import { onMount } from 'svelte';
	import { useLocalStorage, defaults } from '$lib/passist.mjs';
	import AnimationWidget from '$lib/AnimationWidget.svelte';
	import InputField from '$lib/InputField.svelte';
	import Icon from '$lib/Icon.svelte';
	import Jif from '$lib/jif.mjs';
	import { base } from '$app/paths';

	/*
	TODO import CausalDiagramWidget from '$lib/CausalDiagramWidget.svelte';
	 */

	let jif;
	let jsonValid = true;
	let jifString = '{}';
	let fileinput;
	let savelink;
	let name;
	let error = '';
	let warnings = [];
	let animationSpeed = defaults.animationSpeed;

	if (useLocalStorage)
		jifString = localStorage.getItem('jif', null);

	/*
	 * load jif from url fragment: #jif=<payload>
	 * payload is either uri-encoded json or base64url encoded raw deflate
	 * (as produced for example by the polyrhythm passing generator)
	 */
	async function decodeJifFragment(payload) {
		const raw = decodeURIComponent(payload);
		if (raw.trimStart().startsWith('{'))
			return raw;
		const base64 = raw.replaceAll('-', '+').replaceAll('_', '/');
		const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
		const stream = new Blob([bytes]).stream()
			.pipeThrough(new DecompressionStream('deflate-raw'));
		return await new Response(stream).text();
	}

	$: {
		try {
			warnings = [];
			error = '';

			if (jifString) {
				// TODO: would a destructuring assignment work?
				const complete = Jif.complete(jifString, { expand:true });
				jif = complete.jif;
				warnings = complete.warnings;

				jsonValid = true;
				name = (jif && jif.meta && jif.meta.name) || "";
				if (useLocalStorage)
					localStorage.setItem('jif', jifString);
			} else {
				jif = null;
			}
		} catch (e) {
			jsonValid = false;
			error = e.message;
		}
	}
	onMount(async () => {
		const match = window.location.hash.match(/^#jif=(.*)$/s);
		if (match) {
			try {
				jifString = await decodeJifFragment(match[1]);
			} catch (e) {
				error = 'failed to load jif from url: ' + e;
			}
		}
		console.log(jif);
	});

	function loadFile() {
		fileinput.click();
	}
	const onFileSelected =(e) => {
		const file = e.target.files[0];
		if (!file)
			return;
		const reader = new FileReader();
		reader.onload = e => {
			jifString = e.target.result;
		};
		reader.readAsText(file);
	};

	function save() {
		if (!jif)
			return;
		var data = new Blob([jifString], {type: 'application/jif+json'});
		var url = window.URL.createObjectURL(data);
		savelink.href = url;
	}
</script>

<style>
	.horizontal-split { display:grid; grid-template-columns: 50% 50%; }
	.left   { grid-column:1 }
	.right  { grid-column:2 }
	.input  { width:100%; height:30em }
	.invalid { color:#dc3545 }
	.error   { color:red }
	.warnings { color:orange }
	.animation-controls { display:flex; flex-flow:row wrap }
</style>

<div class=horizontal-split>

<textarea class="left input" class:invalid={!jsonValid} bind:value={jifString}></textarea>

<div class="right" >
{#if jif}
	<AnimationWidget
		{jif}
		animationSpeed={parseFloat(animationSpeed)}
	/>
	<p class=animation-controls>
		<InputField
			bind:value={animationSpeed}
			type=range
			id=animationspeed
			label='Animation speed'
			step=0.1
			min=0.1
			max=2
			defaultValue={defaults.animationSpeed}
		/>
	</p>
{/if}
</div>

</div>
<p>
	<button class="load pure-button" on:click={loadFile}>
		<Icon type=load /> load
	</button>
	<a
		href="{base}/jif"
		bind:this={savelink}
		class="save pure-button"
		download={(name || "pattern").trim().replaceAll(/\W+/g, "_") + ".jif"}
		on:click={save}
	>
		<Icon type=save /> save
	</a>
	<input style="display:none" type="file" on:change={onFileSelected} bind:this={fileinput} >
</p>

{#if error || warnings.length}
	<p class=error>{error}</p>
	{#if warnings.length}
	<ul class=warnings>
		{#each warnings as warning}
		<li>{warning}</li>
		{/each}
	</ul>
	{/if}
{/if}
