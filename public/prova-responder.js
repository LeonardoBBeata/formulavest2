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
let bloqueado = false;

function el(id) { return document.getElementById(id); }

function calcularTempoPorPergunta() {
  const total = provaSalva?.questoes?.length || 1;
  const tempoBase = Number(provaSalva?.tempo_minutos || 10) * 60;
  return Math.max(10, Math.ceil(tempoBase / total));
}

function atualizarProgresso() {
  const total = provaSalva?.questoes?.length || 1;
  const percentual = Math.min(100, Math.round(((currentQuestionIndex) / total) * 100));
  const fill = el('progresso-fill');
  const texto = el('progresso-texto');
  if (fill) fill.style.width = `${percentual}%`;
  if (texto) texto.textContent = `Questão ${currentQuestionIndex + 1} de ${total}`;
}

function renderPerguntaAtual() {
  const container = el('questoes-container');
  if (!container || !provaSalva?.questoes?.length) return;

  bloqueado = false;
  atualizarProgresso();

  const questao = provaSalva.questoes[currentQuestionIndex];
  container.innerHTML = `
    <div class="questao-card responder-questao-card">
      <div class="questao-top">
        <strong>${currentQuestionIndex + 1}. ${escapeHtml(questao.enunciado)}</strong>
      </div>
      <div class="opcoes-selecao">
        ${Object.entries(questao.opcoes || {}).map(([letra, texto]) => `
          <button class="selection-box" type="button" data-opcao-item="${escapeHtml(letra)}" data-resposta="${escapeHtml(letra)}">
            <span class="selection-box__marker"><span class="opcao-letra">${escapeHtml(letra)}</span></span>
            <span class="opcao-texto">${escapeHtml(texto)}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.selection-box').forEach((box) => {
    box.addEventListener('click', () => {
      if (bloqueado) return;
      bloqueado = true;

      container.querySelectorAll('.selection-box').forEach((item) => {
        item.classList.remove('selecionada');
        item.setAttribute('aria-pressed', 'false');
      });
      box.classList.add('selecionada');
      box.setAttribute('aria-pressed', 'true');

      setTimeout(() => responderPergunta(box.dataset.resposta), 220);
    });
  });
}

function iniciarContadorPergunta() {
  if (timerId) clearInterval(timerId);
  timeLeft = tempoPorPergunta;
  const pill = el('tempo-restante');

  const atualizar = () => {
    if (pill) {
      pill.textContent = `${timeLeft}s`;
      pill.classList.toggle('tempo-alerta', timeLeft <= 5);
    }
    if (timeLeft <= 0) {
      clearInterval(timerId);
      if (!bloqueado) {
        bloqueado = true;
        responderPergunta(null);
      }
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

  const container = el('questoes-container');
  if (container) {
    container.innerHTML = `
      <div class="questao-card responder-questao-card" style="text-align:center;">
        <strong>Enviando suas respostas...</strong>
      </div>
    `;
  }

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

    const fill = el('progresso-fill');
    if (fill) fill.style.width = '100%';
    const texto = el('progresso-texto');
    if (texto) texto.textContent = 'Prova finalizada';

    if (container) {
      container.innerHTML = `
        <div class="questao-card responder-questao-card resultado-final" style="text-align:center;">
          <h4>Prova finalizada!</h4>
          <p class="small">Você acertou <strong>${data.acertos}</strong> de <strong>${data.total}</strong> questões.</p>
          <p class="small">Percentual: <strong>${Number(data.percentual || 0).toFixed(1)}%</strong></p>
        </div>
      `;
    }

    setTimeout(() => {
      window.location.href = '/prova-codigo.html';
    }, 2500);
  } catch (error) {
    alert(error.message || 'Erro ao finalizar prova');
    window.location.href = '/prova-codigo.html';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  el('titulo-prova').textContent = provaSalva?.titulo || 'Prova';
  tempoPorPergunta = calcularTempoPorPergunta();
  renderPerguntaAtual();
  iniciarContadorPergunta();
});
