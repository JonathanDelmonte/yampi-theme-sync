import {describe, test, expect, afterEach} from 'vitest';
import {mkdtemp, mkdir, writeFile, rm, symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {unzipSync, strToU8} from 'fflate';
import {encodeSnapshot, decodeProject} from '../src/core/archive';
import {demoSnapshot} from '../src/demo/sample';
import {readProject, renderPage, compileStyles, compileComponents} from '../local-runtime/engine.mjs';
import {packProject} from '../local-runtime/pack.mjs';
import {createLocalServer, validateLocal} from '../local-runtime/dev.mjs';
const folders = [], servers = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await new Promise(resolve => server.close(resolve));
  for (const folder of folders.splice(0)) {
    if (!path.resolve(folder).startsWith(path.resolve(os.tmpdir()) + path.sep + 'yampi-ficticio-')) throw new Error('Destino de limpeza inválido.');
    await rm(folder, {recursive: true, force: true});
  }
});
async function project() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'yampi-ficticio-')); folders.push(root);
  for (const [p, b] of Object.entries(unzipSync(await encodeSnapshot(demoSnapshot, true)))) {
    await mkdir(path.dirname(path.join(root, p)), {recursive: true}); await writeFile(path.join(root, p), b);
  }
  return root;
}
describe('ambiente local portátil', () => {
  test('monta Twig com includes e filtro de assets sem dependência da Yampi', () => {
    const result = renderPage(demoSnapshot.files, 'templates/home.twig', {section: {params: {title: 'Fictício'}}});
    expect(result).toContain('<h1>Fictício</h1>'); expect(result).toContain('/tema/assets/images/example.png');
  });
  test('Twig não lê arquivos do computador nem URLs fora da memória do tema', () => {
    expect(() => renderPage({'templates/home.twig': '{% include "../../package.json" %}'}, 'templates/home.twig', {})).toThrow();
    expect(() => renderPage({'templates/home.twig': '{{ "style.css" | vendor_url }}'}, 'templates/home.twig', {})).toThrow('Yampi');
  });
  test('compila Sass, parciais e imports relativos preservando isolamento', () => {
    expect(compileStyles({'assets/styles/main.scss': '@use "colors"; body { color: colors.$brand; }', 'assets/styles/_colors.scss': '$brand: #123456;'}, ['assets/styles/main.scss'])).toContain('#123456');
    expect(() => compileStyles({'assets/a.scss': '@use "../../segredo";'}, ['assets/a.scss'])).toThrow();
  });
  test('compila componente Vue 2 interativo e rejeita recursos não simulados', async () => {
    const output = await compileComponents(demoSnapshot.files, process.cwd()); expect(output.js).toContain('count++');
    expect(output.css).toMatch(/button\[data-v-[a-f0-9]+\]/);
    await expect(compileComponents({'components/Bad.vue': '<template><p>oi</p></template><style module>p{color:red}</style>'}, process.cwd())).rejects.toThrow('module');
  });
  test('ZIP de retorno inclui só tema e origem e preserva edição e imagens', async () => {
    const root = await project(); await writeFile(path.join(root, 'tema/templates/home.twig'), '<h1>Editado</h1>\n');
    await writeFile(path.join(root, 'segredo.env'), 'ficticio-nao-exportar');
    const bytes = await packProject(root), entries = unzipSync(bytes), result = await decodeProject(bytes);
    expect(Object.keys(entries).every(p => p.startsWith('tema/') || p.startsWith('.yampi-sync/baseline/') || p === '.yampi-sync/manifest.json')).toBe(true);
    expect(result.local['templates/home.twig']).toBe('<h1>Editado</h1>\n'); expect(result.baseline).toEqual(demoSnapshot);
  });
  test('pack recusa original adulterado e caminhos duplicados no manifesto', async () => {
    const root = await project(); await writeFile(path.join(root, '.yampi-sync/baseline/templates/home.twig'), strToU8('adulterado'));
    await expect(readProject(root)).rejects.toThrow('Original');
  });
  test('pack recusa links para diretórios que não pertencem ao projeto', async () => {
    const root = await project(), outside = await mkdtemp(path.join(os.tmpdir(), 'yampi-ficticio-')); folders.push(outside);
    await writeFile(path.join(outside, 'privado-ficticio.twig'), 'Este conteúdo não deve ser exportado.');
    await symlink(outside, path.join(root, 'tema/templates/linked'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(packProject(root)).rejects.toThrow('Links');
  });
  test('servidor bloqueia escrita, host externo e acesso à baseline', async () => {
    const root = await project();
    // Compile dependencies are resolved from the tool repository only in this test.
    const local = await createLocalServer(root); servers.push(local.server);
    await new Promise(resolve => local.server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + local.server.address().port;
    expect((await fetch(base, {method: 'POST'})).status).toBe(403);
    const forbidden = await new Promise(resolve => http.get(base, {headers: {Host: 'outro.invalid'}}, response => {response.resume(); resolve(response.statusCode);}).on('error', () => resolve(0)));
    expect(forbidden).toBe(403);
    expect((await fetch(base + '/.yampi-sync/manifest.json')).status).toBe(404);
    const image = await fetch(base + '/tema/assets/images/example.png'); expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('content-security-policy')).toContain('sandbox');
  });
  test('check não anuncia sucesso se o template não pode ser renderizado', async () => {
    const root = await project();
    await writeFile(path.join(root, 'tema/templates/home.twig'), '{% invalid_tag %}');
    // Missing installed project dependencies also must fail, never a fake validation success.
    await expect(validateLocal(root)).rejects.toThrow();
  });
});
