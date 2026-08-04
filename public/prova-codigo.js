const API = window.location.origin;
const token = localStorage.getItem('token');

if (!token) {
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

  try {
    const res = await fetch(`${API}/provas-prontas/entrar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
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
