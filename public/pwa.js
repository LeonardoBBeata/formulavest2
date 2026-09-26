if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW failed', err));
  });
}

let deferredPrompt;
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredPrompt = event;
  const banner = document.createElement('div');
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-icon">⬇</div>
    <div class="install-copy">
      <strong>Instale o FórmulaVest</strong>
      <span>Tenha acesso rápido na tela inicial.</span>
    </div>
    <button type="button" class="install-primary">Instalar</button>
    <button type="button" class="install-dismiss" aria-label="Fechar">✕</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('.install-primary').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    banner.remove();
  });
  banner.querySelector('.install-dismiss').addEventListener('click', () => banner.remove());
});

window.addEventListener('appinstalled', () => {
  document.querySelector('.install-banner')?.remove();
});

window.ativarLembretesDeEstudo = async () => {
  if (!('Notification' in window)) return false;
  const permission = await Notification.requestPermission();
  localStorage.setItem('notificacoesAtivas', String(permission === 'granted'));
  return permission === 'granted';
};
