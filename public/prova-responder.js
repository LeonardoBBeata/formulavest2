const API = window.location.origin;
const token = null;
let provaSalva = null;

try {
  provaSalva = JSON.parse(sessionStorage.getItem('provaAtual') || 'null');
} catch (err) {
  provaSalva = null;
}

if (localStorage.getItem('auth_session') !== '1' || !provaSalva) {
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

    if (container) container.classList.add('hidden');
    mostrarConclusao(data);
    await verificarNovasConquistas();
  } catch (error) {
    alert(error.message || 'Erro ao finalizar prova');
    window.location.href = '/prova-codigo.html';
  }
}

async function verificarNovasConquistas() {
  try {
    const res = await fetch(`${API}/me/conquistas`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const novas = Array.isArray(data.novas_conquistas) ? data.novas_conquistas : [];
    novas.forEach((conquista, index) => {
      window.setTimeout(() => mostrarPopupConquista(conquista), index * 550);
    });
  } catch (error) {
    console.warn('Não foi possível verificar novas conquistas', error);
  }
}

function mostrarPopupConquista(conquista) {
  let stack = document.getElementById('achievement-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'achievement-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  const icones = { primeira_prova: '🎯', tres_provas: '⚡', dez_provas: '🏅', cinquenta_provas: '👑', prova_perfeita: '💯', xp_100: '✨', nivel_5: '🚀', nivel_10: '🌟', streak_3: '🔥', streak_7: '🏆' };
  const popup = document.createElement('article');
  popup.className = 'achievement-popup';
  popup.innerHTML = `
    <div class="achievement-popup__icon">${icones[conquista.chave] || '🏆'}</div>
    <div><small>CONQUISTA DESBLOQUEADA</small><strong>${escapeHtml(conquista.titulo)}</strong><p>${escapeHtml(conquista.descricao)}</p></div>
    <button class="achievement-popup__close" type="button" aria-label="Fechar">×</button>
  `;
  popup.querySelector('.achievement-popup__close')?.addEventListener('click', () => popup.remove());
  stack.appendChild(popup);
  window.setTimeout(() => popup.classList.add('is-visible'), 20);
  window.setTimeout(() => {
    popup.classList.remove('is-visible');
    window.setTimeout(() => popup.remove(), 240);
  }, 6000);
}

function mostrarConclusao(data) {
  const resultado = el('resultado-prova');
  if (!resultado) return;

  const percentual = Number(data.percentual || 0);
  const xpGanho = Number(data.xp_ganho || 0);
  const nivel = Number(data.nivel || 1);
  const subiuNivel = Boolean(data.subiu_nivel);

  resultado.innerHTML = `
    <div class="conclusao-prova__icon" aria-hidden="true">${subiuNivel ? '✨' : '🏆'}</div>
    <p class="eyebrow">Resultado da prova</p>
    <h4>${subiuNivel ? `Você chegou ao nível ${nivel}!` : 'Prova concluída!'}</h4>
    <p class="small">${subiuNivel ? 'Seu desempenho liberou um novo nível.' : 'Suas respostas foram registradas com sucesso.'}</p>
    <div class="conclusao-prova__metricas">
      <div><strong>${Number(data.acertos || 0)}/${Number(data.total || 0)}</strong><span>acertos</span></div>
      <div><strong>${percentual.toFixed(1)}%</strong><span>precisão</span></div>
      <div><strong>+${xpGanho}</strong><span>XP ganho</span></div>
      <div><strong>${nivel}</strong><span>nível atual</span></div>
    </div>
    <button id="voltar-provas-btn" class="btn btn-primary" type="button">Voltar para provas</button>
  `;
  resultado.classList.remove('hidden');
  el('voltar-provas-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('provaAtual');
    window.location.href = '/prova-codigo.html';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  el('titulo-prova').textContent = provaSalva?.titulo || 'Prova';
  tempoPorPergunta = calcularTempoPorPergunta();
  renderPerguntaAtual();
  iniciarContadorPergunta();
});
