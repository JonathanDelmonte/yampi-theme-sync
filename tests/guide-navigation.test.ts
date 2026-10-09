import {describe, test, expect, vi} from 'vitest';
import {openEditorFromGuide} from '../src/browser/guide-navigation';
const source='chrome-extension://fictitious-extension/guide.html?tab=7';
function fixture() {
  return {
    runtime:{getURL:(value:string)=>`chrome-extension://fictitious-extension/${value}`,getContexts:vi.fn(async()=>[{documentId:'guide-document',frameId:0}])},
    sidePanel:{getOptions:vi.fn(async()=>({enabled:true,path:'guide.html?tab=7'}))},tabs:{update:vi.fn(async()=>({id:7}))}
  };
}
const api=(value:ReturnType<typeof fixture>)=>value as unknown as Pick<typeof chrome,'runtime'|'sidePanel'|'tabs'>;
describe('atalho explícito para o editor',()=>{
  test('painel nativo ativo navega somente sua aba para o endereço fixo',async()=>{
    const fake=fixture();await openEditorFromGuide(source,api(fake));
    expect(fake.tabs.update).toHaveBeenCalledWith(7,{url:'https://app.yampi.com.br/store/code-editor/'});
    expect(fake.tabs.update).toHaveBeenCalledTimes(1);
  });
  test('guia aberta como página comum não pode navegar outra aba',async()=>{
    const fake=fixture();fake.runtime.getContexts.mockResolvedValueOnce([]);
    await expect(openEditorFromGuide(source,api(fake))).rejects.toThrow('painel lateral ativo');expect(fake.tabs.update).not.toHaveBeenCalled();
  });
  test('aba divergente, painel fechado ou URL adulterada bloqueiam a navegação',async()=>{
    const fake=fixture();fake.sidePanel.getOptions.mockResolvedValueOnce({enabled:true,path:'guide.html?tab=8'});
    await expect(openEditorFromGuide(source,api(fake))).rejects.toThrow('painel mudou');
    fake.sidePanel.getOptions.mockResolvedValueOnce({enabled:false,path:'guide.html?tab=7'});
    await expect(openEditorFromGuide(source,api(fake))).rejects.toThrow('painel mudou');
    await expect(openEditorFromGuide(source+'&url=https://outro.invalid/',api(fake))).rejects.toThrow('pelo ícone');
    await expect(openEditorFromGuide(source.replace('tab=7','tab=-7'),api(fake))).rejects.toThrow('pelo ícone');
    expect(fake.tabs.update).not.toHaveBeenCalled();
  });
});
