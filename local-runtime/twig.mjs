// Twing 7 targets Locutus 2. Use the patched Locutus 3 with a narrowly scoped
// Node 24 loader adapter; neither templates nor other modules are transformed.
import {createRequire, registerHooks} from 'node:module';
import {pathToFileURL, fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
const require = createRequire(import.meta.url);
const entry = pathToFileURL(require.resolve('twing')).href;
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL === entry && /^locutus\/php\/(strings|math)$/.test(specifier)) specifier += '/index';
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url !== entry) return next(url, context);
    const source = readFileSync(fileURLToPath(url), 'utf8').replace(/require\(('locutus\/[^']+')\)/g, 'localLocutus($1)');
    return {format: 'commonjs', shortCircuit: true, source: source + '\nfunction localLocutus(p) { const m = require(p); return m.default || m[p.split("/").at(-1)] || m; }\n'};
  }
});
let twing;
try {twing = require('twing');} finally {hooks.deregister();}
export const {createSynchronousEnvironment, createSynchronousArrayLoader, createSynchronousFilter, createSynchronousFunction} = twing;
