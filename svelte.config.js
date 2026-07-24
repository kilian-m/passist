import staticAdapter from '@sveltejs/adapter-static';

export default {
	kit: {
		adapter: staticAdapter({
			fallback: '404.html',
		}),
		paths: {
			base: process.env.BASE_PATH || '',
		},
	},
};
