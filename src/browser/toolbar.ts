export const EDITOR_URL = 'https://app.yampi.com.br/store/code-editor/';
export const GUIDE_TITLE = 'Abra o Editor de código da Yampi. Clique para ver como baixar ou enviar arquivos.';
export const EDITOR_TITLE = 'Editor de código da Yampi: clique para baixar arquivos ou enviar alterações.';
export function isEditorURL(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.origin === 'https://app.yampi.com.br' && /^\/store\/code-editor\/?$/.test(url.pathname);
  } catch {return false;}
}
