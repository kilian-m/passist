# passist — polyrhythm fork
passing siteswap assistant

Fork of [helbling/passist](https://github.com/helbling/passist) with support for
animating **polyrhythmic passing patterns** (jugglers running at different tempos,
e.g. 5 beats against 7 per cycle):

- the Jif page can load a pattern from the URL fragment
  (`/jif#jif=<uri-encoded json>` or `#jif=<base64url raw-deflate json>`),
  so generators can deep-link directly into the animation
- the animation judges dwell times and spin counts per juggler
  (smallest gap between a juggler's own throws) instead of using one global
  time-stretch factor, which makes mixed-tempo patterns look right
- static SPA build deployable to GitHub Pages (`BASE_PATH=/passist VITE_BASE_URL=/passist VITE_SERVERTYPE=static npx vite build`)

Patterns for it can be generated with the polyrhythmic passing generator
(siteswap-style sequences per juggler with matching pass/receive interfaces).

Upstream: https://passist.org/

Work in progress..

# Features
- Siteswap generator
- Start configuration calculator
- Causal Diagrams
- Web App that works offline
- Reusable js components
- 3d Animation

# Planned
- API
- Causal Diagram Editor

# Usage
```
 npm clean-install
 npm run build
 node build
 open http://localhost:3000
```

# Tools used

This project builds upon the follwing open source tools. Many thanks to its creators!

- [svelte](https://svelte.dev/) for handling state
- [svelte-kit](https://kit.svelte.dev/) for building the web application
- [three.js](https://threejs.org/) for doing all the complicated 3d stuff
- [bytesize-icons](https://danklammer.com/bytesize-icons/) for the iconset
- [Pure.css](https://purecss.io/) as a good css base
- [Svelte-DragDropList](https://github.com/jwlarocque/svelte-dragdroplist) for hand order drag and drop

# License

Copyright © 2026 Christian Helbling (helch at [same five letters again] dot ch)

Licensed under the GPLv3: http://www.gnu.org/licenses/gpl-3.0.html
