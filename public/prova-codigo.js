const API = window.location.origin;
const token = (() => {
  try {
    return localStorage.getItem('access_token');
  } catch (error) {
    return null;
  }
})();

function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers
  });
}

if (localStorage.getItem('auth_session') !== '1') {
  window.location.href = '/login.html';
}

function el(id) { return document.getElementById(id); }

el('entrar-prova-btn')?.addEventListener('click', async () => {
  const codigo = el('codigo-prova').value.trim().toUpperCase();
  const status = el('status-text');

  if (!codigo) {
    status.textContent = 'Informe o código da prova.';
    return;
  }

  sessionStorage.removeItem('provaAtual');

  try {
    const res = await apiFetch(`${API}/provas-prontas/entrar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo })
    });

    const data = await res.json();

    if (!res.ok) {
      status.textContent = data.error || 'Erro ao entrar na prova';
      return;
    }

    const prova = data.prova;
    sessionStorage.setItem('provaAtual', JSON.stringify(prova));
    status.textContent = `Prova carregada: ${prova.titulo}`;
    window.location.href = '/prova-responder.html';
  } catch (error) {
    console.error(error);
    status.textContent = 'Não foi possível entrar na prova.';
  }
});
