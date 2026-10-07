import 'fake-indexeddb/auto';
import {beforeEach, describe, test, expect} from 'vitest';
import {saveJournal, journalHistory, clearLocal, contextKey, put, get} from '../src/storage';
import {demoSnapshot} from '../src/demo/sample';
import type {Journal} from '../src/core/model';
const entry = (id: string): Journal => ({version: 1, id, context: demoSnapshot.context, startedAt: '2026-10-07T00:00:00Z', status: 'stopped', selected: ['templates/home.twig'], verified: [], pending: 'templates/home.twig', before: {'templates/home.twig': 'original'}, after: {'templates/home.twig': 'editado'}});
beforeEach(clearLocal);
describe('histórico persistido e isolamento de lojas', () => {
  test('preserva envios antigos e atualiza o mesmo registro sem duplicar', async () => {
    await saveJournal(entry('a')); await saveJournal(entry('b')); await saveJournal({...entry('b'), status: 'completed', verified: ['templates/home.twig']});
    const history = await journalHistory(demoSnapshot.context);
    expect(history.map(j => j.id)).toEqual(['b', 'a']); expect(history[0].status).toBe('completed'); expect(history[1].pending).toBe('templates/home.twig');
  });
  test('envios concorrentes não perdem um registro', async () => {
    await Promise.all([saveJournal(entry('a')), saveJournal(entry('b'))]);
    expect((await journalHistory(demoSnapshot.context)).map(j => j.id).sort()).toEqual(['a', 'b']);
  });
  test('lojas diferentes têm históricos e originais independentes', async () => {
    const other = {...demoSnapshot.context, previewOrigin: 'https://outra.invalid'};
    await saveJournal(entry('a')); await saveJournal({...entry('b'), context: other});
    await put('baseline:' + await contextKey(demoSnapshot.context), demoSnapshot);
    expect((await journalHistory(other)).map(j => j.id)).toEqual(['b']); expect((await journalHistory(demoSnapshot.context)).map(j => j.id)).toEqual(['a']);
    expect(await get('baseline:' + await contextKey(other))).toBeUndefined();
  });
});
