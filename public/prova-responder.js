const API = window.location.origin;
const token = localStorage.getItem('token');
let provaSalva = null;

try {
  provaSalva = JSON.parse(sessionStorage.getItem('provaAtual') || 'null');
} catch (err) {
  provaSalva = null;
}

if (!token || !provaSalva) {
  window.location.href = '/prova-codigo.html';
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let respostas = [];
let currentQuestionIndex = 0;
let timerId = null;
let timeLeft = 0;
let tempoPorPergunta = 20;

function el(id) { return document.getElementById(id); }

function calcularTempoPorPergunta() {
  const total = provaSalva?.questoes?.length || 1;
  const tempoBase = Number(provaSalva?.tempo_minutos || 10) * 60;
  return Math.max(10, Math.ceil(tempoBase / total));
}

function renderPerguntaAtual() {
  const container = el('questoes-container');
  if (!container || !provaSalva?.questoes?.length) return;

  const questao = provaSalva.questoes[currentQuestionIndex];
  container.innerHTML = `
    <div class="questao-card">
      <div class="questao-top">
        <strong>${currentQuestionIndex + 1}. ${escapeHtml(questao.enunciado)}</strong>
      </div>
      <div class="opcoes-grid">
        ${Object.entries(questao.opcoes || {}).map(([letra, texto]) => `
          <button class="btn btn-secondary" type="button" data-resposta="${escapeHtml(letra)}">${escapeHtml(letra)}) ${escapeHtml(texto)}</button>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('[data-resposta]').forEach(botao => {
    botao.addEventListener('click', () => responderPergunta(botao.getAttribute('data-resposta')));
  });
}

function iniciarContadorPergunta() {
  if (timerId) clearInterval(timerId);
  timeLeft = tempoPorPergunta;
  const pill = el('tempo-restante');

  const atualizar = () => {
    if (pill) pill.textContent = `${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(timerId);
      responderPergunta(null);
      return;
    }
    timeLeft -= 1;
  };

  atualizar();
  timerId = setInterval(atualizar, 1000);
}

async function responderPergunta(resposta) {
  if (timerId) clearInterval(timerId);

  respostas[currentQuestionIndex] = resposta;
  const payload = {
    perguntaIndex: currentQuestionIndex,
    resposta,
    respostas
  };

  try {
    await fetch(`${API}/provas-prontas/${provaSalva.id}/responder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(error);
  }

  if (currentQuestionIndex < provaSalva.questoes.length - 1) {
    currentQuestionIndex += 1;
    renderPerguntaAtual();
    iniciarContadorPergunta();
  } else {
    finalizar();
  }
}

async function finalizar() {
  const payload = respostas.map((letra, index) => ({ id: index, selecionada: letra }));
  try {
    const res = await fetch(`${API}/provas-prontas/${provaSalva.id}/finalizar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ respostas: payload })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erro ao finalizar');

    alert(`Prova finalizada! Acertos: ${data.acertos}/${data.total}`);
    window.location.href = '/prova-codigo.html';
  } catch (error) {
    alert(error.message || 'Erro ao finalizar prova');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  el('titulo-prova').textContent = provaSalva?.titulo || 'Prova';
  tempoPorPergunta = calcularTempoPorPergunta();
  renderPerguntaAtual();
  iniciarContadorPergunta();
  el('finalizar-btn')?.addEventListener('click', finalizar);
});
