import {openEditorFromGuide} from './browser/guide-navigation';
const button = document.getElementById('open-editor') as HTMLButtonElement;
const detail = document.getElementById('guide-detail')!;
button.addEventListener('click', async () => {
  button.disabled = true;
  try {
    await openEditorFromGuide(location.href);
    detail.textContent = 'Quando o editor carregar, clique novamente no ícone da extensão.';
  } catch (error) {
    detail.textContent = error instanceof Error ? error.message : 'Não foi possível abrir o editor. Tente novamente.';
    detail.classList.add('guide-error'); button.disabled = false;
  }
});
document.body.dataset.guideReady = 'true';
