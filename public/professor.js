const API = window.location.origin;
const token = localStorage.getItem('token');

if (!token) {
  window.location.href = '/login.html';
}

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function verificarAcessoProfessor() {
  if (!token) {
    window.location.href = '/login.html';
    return false;
  }

  try {
    const res = await fetch(`${API}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      window.location.href = '/index.html';
      return false;
    }

    const data = await res.json();

    if (data.role !== 'professor') {
      window.location.href = '/index.html';
      return false;
    }

    return true;
  } catch (error) {
    console.error(error);
    window.location.href = '/index.html';
    return false;
  }
}

let activeSession = null;
let roundTimer = null;
let livePoll = null;
let periodosSelectEl = null;
let salasSelectEl = null;

function el(id) { return document.getElementById(id); }

function mostrarMensagem(texto) {
  const pill = el('status-pill');
  if (pill) pill.textContent = texto;
}

function preencherQuestaoNoCard(card, questao) {
  if (!questao) return;
  card.querySelector('[data-enunciado]').value = questao.enunciado || '';
  card.querySelector('[data-materia]').value = questao.materia || '';
  card.querySelector('[data-assunto]').value = questao.assunto || '';
  card.querySelector('[data-dificuldade]').value = questao.dificuldade || '';
  card.querySelector('[data-explicacao]').value = questao.explicacao || '';
  ['A', 'B', 'C', 'D'].forEach((letra) => {
    const input = card.querySelector(`[data-opcao="${letra}"]`);
    if (input) input.value = questao.opcoes?.[letra] || '';
  });
  const correta = String(questao.correta || 'A').toUpperCase();
  if (card.querySelector(`[data-correta] option[value="${correta}"]`)) {
    card.querySelector('[data-correta]').value = correta;
  }
}

function criarQuestaoCard(index = 0) {
  const card = document.createElement('div');
  card.className = 'questao-card';
  card.innerHTML = `
    <div class="questao-top">
      <strong>Questão ${index + 1}</strong>
      <button class="btn btn-secondary small" type="button" data-remove>Remover</button>
    </div>
    <label>
      <span>Tipo de questão</span>
      <select data-tipo-questao>
        <option value="manual">Criar do zero</option>
        <option value="ia">Gerar via IA</option>
      </select>
    </label>
    <div class="questao-ia" style="display:none">
      <label>
        <span>Prompt da IA</span>
        <input data-ia-prompt type="text" placeholder="Ex: questão de matemática do ENEM 2019" />
      </label>
      <button class="btn btn-secondary small" type="button" data-gerar-ia>Gerar questão</button>
    </div>
    <div class="questao-manual">
      <label>
        <span>Enunciado</span>
        <textarea data-enunciado required></textarea>
      </label>
      <label>
        <span>Matéria</span>
        <input data-materia type="text" placeholder="Ex.: Matemática" />
      </label>
      <label>
        <span>Assunto</span>
        <input data-assunto type="text" placeholder="Ex.: Funções" />
      </label>
      <label>
        <span>Dificuldade</span>
        <select data-dificuldade>
          <option value="">Selecione</option>
          <option value="facil">Fácil</option>
          <option value="medio">Médio</option>
          <option value="dificil">Difícil</option>
        </select>
      </label>
      <label>
        <span>Explicação</span>
        <textarea data-explicacao rows="3" placeholder="Explique a resposta correta"></textarea>
      </label>
      <div class="opcoes-grid">
        <label><span>Alternativa A</span><input data-opcao="A" required /></label>
        <label><span>Alternativa B</span><input data-opcao="B" required /></label>
        <label><span>Alternativa C</span><input data-opcao="C" required /></label>
        <label><span>Alternativa D</span><input data-opcao="D" required /></label>
      </div>
      <label>
        <span>Resposta correta</span>
        <select data-correta>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="D">D</option>
        </select>
      </label>
    </div>
  `;

  const tipoSelect = card.querySelector('[data-tipo-questao]');
  const iaSection = card.querySelector('.questao-ia');
  const manualSection = card.querySelector('.questao-manual');
  const gerarBtn = card.querySelector('[data-gerar-ia]');
  const promptInput = card.querySelector('[data-ia-prompt]');

  function atualizarModo() {
    const tipo = tipoSelect.value;
    const isIa = tipo === 'ia';
    iaSection.style.display = isIa ? 'block' : 'none';
    manualSection.style.display = isIa ? 'none' : 'block';
  }

  tipoSelect.addEventListener('change', atualizarModo);
  atualizarModo();

  gerarBtn.addEventListener('click', async () => {
    const prompt = promptInput.value.trim();
    if (!prompt) {
      alert('Informe um prompt para a IA.');
      return;
    }

    gerarBtn.disabled = true;
    gerarBtn.textContent = 'Gerando...';

    try {
      const res = await fetch(`${API}/professor/provas/gerar-questao-ia`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar questão via IA');
      }

      preencherQuestaoNoCard(card, data.questao);
      tipoSelect.value = 'manual';
      atualizarModo();
      alert('Questão gerada com sucesso! Revise e ajuste se necessário.');
    } catch (err) {
      console.error(err);
      alert(err.message || 'Erro ao gerar questão via IA');
    } finally {
      gerarBtn.disabled = false;
      gerarBtn.textContent = 'Gerar questão';
    }
  });

  card.querySelector('[data-remove]').addEventListener('click', () => {
    card.remove();
    reindexarQuestoes();
  });

  return card;
}

function reindexarQuestoes() {
  const cards = [...document.querySelectorAll('.questao-card')];
  cards.forEach((card, index) => {
    card.querySelector('strong').textContent = `Questão ${index + 1}`;
  });
}

function montarQuestaoDoCard(card) {
  const enunciado = card.querySelector('[data-enunciado]').value.trim();
  const materia = card.querySelector('[data-materia]').value.trim();
  const assunto = card.querySelector('[data-assunto]').value.trim();
  const dificuldade = card.querySelector('[data-dificuldade]').value;
  const explicacao = card.querySelector('[data-explicacao]').value.trim();
  const correta = card.querySelector('[data-correta]').value;
  const opcoes = {};

  ['A', 'B', 'C', 'D'].forEach(letra => {
    opcoes[letra] = card.querySelector(`[data-opcao="${letra}"]`).value.trim();
  });

  return { enunciado, materia, assunto, dificuldade, explicacao, correta, opcoes };
}

function coletarQuestoes() {
  return [...document.querySelectorAll('.questao-card')].map(montarQuestaoDoCard).filter(q => q.enunciado);
}

function adicionarQuestao() {
  const container = el('questoes-container');
  if (!container) return;
  container.appendChild(criarQuestaoCard(container.children.length));
}

async function importarProvaArquivo() {
  const arquivoInput = el('prova-arquivo');
  const quantidadeInput = el('prova-arquivo-quantidade');
  const importarBtn = el('importar-arquivo-btn');

  if (!arquivoInput?.files?.length) {
    alert('Selecione um arquivo PDF ou Word para importar.');
    return;
  }

  const arquivo = arquivoInput.files[0];
  const quantidade = Number(quantidadeInput?.value) || 10;

  importarBtn.disabled = true;
  importarBtn.textContent = 'Importando...';

  try {
    const formData = new FormData();
    formData.append('arquivo', arquivo);
    formData.append('quantidade', quantidade);

    const res = await fetch(`${API}/professor/provas/importar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao importar arquivo');
    }

    if (!Array.isArray(data.questoes) || data.questoes.length === 0) {
      throw new Error('Nenhuma questão foi gerada a partir do arquivo');
    }

    const container = el('questoes-container');
    if (!container) throw new Error('Container de questoes nao encontrado');
    container.innerHTML = '';

    data.questoes.forEach((questao, index) => {
      const card = criarQuestaoCard(index);
      preencherQuestaoNoCard(card, questao);
      container.appendChild(card);
    });

    reindexarQuestoes();
    alert('Prova importada com sucesso. Revise as questões antes de salvar.');
  } catch (err) {
    console.error(err);
    alert(err.message || 'Erro ao importar arquivo');
  } finally {
    importarBtn.disabled = false;
    importarBtn.textContent = 'Importar arquivo';
  }
}

function calcularTempoPorPergunta(prova) {
  const total = Array.isArray(prova?.questoes) ? prova.questoes.length : 1;
  const tempoBase = Number(prova?.tempo_minutos || 10) * 60;
  return Math.max(10, Math.ceil(tempoBase / total));
}

function renderLiveSession() {
  const panel = el('sessao-ao-vivo');
  const codePill = el('live-code-pill');
  const roundCard = el('live-round-card');
  const ranking = el('ranking-live');
  const xlsBtn = el('download-xls-btn');

  if (!panel || !activeSession?.prova) {
    panel?.classList.add('hidden');
    if (xlsBtn) xlsBtn.disabled = true;
    return;
  }

  panel.classList.remove('hidden');
  codePill.textContent = escapeHtml(activeSession.prova.codigo || 'Sem código');

  const sessionFinished = !activeSession.started && activeSession.currentIndex >= 0 && activeSession.currentIndex === activeSession.prova.questoes.length - 1;
  if (xlsBtn) xlsBtn.disabled = !sessionFinished;

  if (!activeSession.started && activeSession.currentIndex < 0) {
    roundCard.innerHTML = `
      <div class="status-pill" style="display:inline-block; margin-bottom:8px;">Aguardando início</div>
      <h4>${escapeHtml(activeSession.prova.titulo)}</h4>
      <p>Publique o código para os alunos entrarem e clique em iniciar rodada para começar a transmissão.</p>
    `;
    ranking.innerHTML = '<p class="small">O placar aparecerá aqui assim que os alunos responderem.</p>';
    return;
  }

  if (sessionFinished) {
    roundCard.innerHTML = `
      <div class="status-pill" style="display:inline-block; margin-bottom:8px;">Prova encerrada</div>
      <h4>Prova encerrada</h4>
      <p>O placar final já pode ser acompanhado abaixo.</p>
    `;
    return;
  }

  const pergunta = activeSession.prova.questoes?.[activeSession.currentIndex];
  if (!pergunta) {
    roundCard.innerHTML = `
      <div class="status-pill" style="display:inline-block; margin-bottom:8px;">Fim da rodada</div>
      <h4>Erro de sessão</h4>
      <p>Não foi possível exibir a pergunta atual.</p>
    `;
    return;
  }

  const options = Object.entries(pergunta.opcoes || {}).map(([letra, texto]) => `<div class="podium-item">${escapeHtml(letra)}) ${escapeHtml(texto)}</div>`).join('');
  roundCard.innerHTML = `
    <div class="status-pill" style="display:inline-block; margin-bottom:8px;">Rodada ${activeSession.currentIndex + 1}/${activeSession.prova.questoes.length}</div>
    <h4>${escapeHtml(pergunta.enunciado)}</h4>
    <p>Tempo restante: <strong>${escapeHtml(String(activeSession.timeLeft))}s</strong></p>
    <div>${options}</div>
    ${activeSession.showCorrectAnswer ? `<div class="correct-feedback">Resposta correta: <strong>${escapeHtml(pergunta.correta)}</strong></div>` : ''}
  `;
}

function animarRodada() {
  const roundCard = el('live-round-card');
  roundCard?.classList.remove('is-animating');
  void roundCard?.offsetWidth;
  roundCard?.classList.add('is-animating');
  setTimeout(() => roundCard?.classList.remove('is-animating'), 320);
}

function renderTurmas(salas) {
  const container = el('turmas-container');
  if (!container) return;

  if (!salas || salas.length === 0) {
    container.innerHTML = '<p class="small">Nenhuma sala atribuída.</p>';
    return;
  }

  container.innerHTML = salas.map((sala) => `
    <div class="turma-card">
      <strong>${escapeHtml(sala.periodo_nome || '')} — ${escapeHtml(sala.nome)}</strong>
      <span class="small">Sala ID ${Number(sala.id)}</span>
    </div>
  `).join('');
}

function iniciarCronometroRodada() {
  if (roundTimer) clearInterval(roundTimer);
  const total = activeSession?.tempoPorPergunta || 20;
  activeSession.timeLeft = total;
  renderLiveSession();
  roundTimer = setInterval(() => {
    if (!activeSession || !activeSession.started) return;
    activeSession.timeLeft -= 1;
    if (activeSession.timeLeft <= 0) {
      clearInterval(roundTimer);
      mostrarRespostaCorreta();
      setTimeout(avancarPergunta, 1400);
      return;
    }
    renderLiveSession();
  }, 1000);
}

function avancarPergunta() {
  if (!activeSession?.prova?.questoes?.length) return;
  if (activeSession.currentIndex < activeSession.prova.questoes.length - 1) {
    activeSession.currentIndex += 1;
    activeSession.showCorrectAnswer = false;
    animarRodada();
    iniciarCronometroRodada();
  } else {
    activeSession.started = false;
    activeSession.currentIndex = activeSession.prova.questoes.length - 1;
    clearInterval(roundTimer);
    renderLiveSession();
    mostrarMensagem('Rodada finalizada');
    mostrarPodium();
  }
}

function mostrarPodium() {
  const ranking = el('ranking-live');
  if (!ranking) return;
  const rankingItens = ranking.querySelectorAll('.rank-item');
  if (!rankingItens.length) {
    ranking.innerHTML = '<p class="small">Ainda não houveram respostas suficientes para montar o podium.</p>';
    return;
  }

  const podium = Array.from(rankingItens).slice(0, 3).map((item, index) => {
    const className = index === 0 ? 'gold' : index === 1 ? 'silver' : 'bronze';
    const title = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
    return `<div class="podium-item ${className}">${title} ${escapeHtml(item.textContent || '')}</div>`;
  }).join('');

  ranking.innerHTML = podium;
}

function iniciarRodadaAoVivo() {
  if (!activeSession?.prova) return;
  activeSession.started = true;
  activeSession.currentIndex = 0;
  activeSession.showCorrectAnswer = false;
  activeSession.tempoPorPergunta = calcularTempoPorPergunta(activeSession.prova);
  iniciarCronometroRodada();
  renderLiveSession();
  mostrarMensagem('Rodada iniciada');
}

function mostrarRespostaCorreta() {
  if (!activeSession?.prova?.questoes?.[activeSession.currentIndex]) return;
  activeSession.showCorrectAnswer = true;
  renderLiveSession();
}

async function carregarPlacar() {
  if (!activeSession?.prova?.id) return;
  try {
    const res = await fetch(`${API}/professor/provas/${activeSession.prova.id}/placar`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    const ranking = el('ranking-live');
    if (!ranking) return;

    if (!data.resultados || data.resultados.length === 0) {
      ranking.innerHTML = '<p class="small">O placar aparecerá aqui assim que os alunos responderem.</p>';
      return;
    }

    ranking.innerHTML = data.resultados.map((resultado, index) => `
      <div class="rank-item">
        <strong>#${index + 1} ${escapeHtml(resultado.username || resultado.email || 'Aluno')}</strong>
        <span class="small">${Number(resultado.acertos)}/${Number(resultado.total)} • ${Number(resultado.percentual || 0).toFixed(1)}%</span>
      </div>
    `).join('');
  } catch (error) {
    console.error(error);
  }
}

async function carregarProvas() {
  try {
    const res = await fetch(`${API}/professor/provas`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();

    const container = el('provas-list');
    if (!container) return;

    if (!data.provas || data.provas.length === 0) {
      container.innerHTML = '<p class="small">Nenhuma prova criada ainda.</p>';
      return;
    }

    container.innerHTML = data.provas.map(prova => `
      <div class="prova-item">
        <div>
          <strong>${escapeHtml(prova.titulo)}</strong>
          <div class="prova-meta">${Number(prova.tempo_minutos)} min • Status: ${escapeHtml(prova.status || 'rascunho')} • Código: ${escapeHtml(prova.codigo || '—')}</div>
        </div>
        <div class="prova-actions">
          <button class="btn btn-primary small" data-iniciar="${prova.id}">Transmitir</button>
          <button class="btn btn-warning small" data-encerrar="${prova.id}">Parar</button>
          <button class="btn btn-secondary small" data-exportar-pdf="${prova.id}">Exportar PDF</button>
          <button class="btn btn-secondary small" data-exportar-xls="${prova.id}">Exportar XLSX</button>
        </div>
      </div>
    `).join('');

    container.querySelectorAll('[data-iniciar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-iniciar');
        const res = await fetch(`${API}/professor/provas/${id}/iniciar`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.ok) {
          activeSession = { prova: data.prova, currentIndex: -1, started: false, timeLeft: 0 };
          renderLiveSession();
          carregarPlacar();
          if (livePoll) clearInterval(livePoll);
          livePoll = setInterval(carregarPlacar, 3000);
          mostrarMensagem(`Código: ${data.prova.codigo}`);
          alert(`Prova transmitida! Código: ${data.prova.codigo}`);
        } else {
          alert(data.error || 'Erro ao transmitir prova');
        }
      });
    });

    container.querySelectorAll('[data-encerrar]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-encerrar');
        if (!confirm('Encerrar transmissão dessa prova?')) return;
        const res = await fetch(`${API}/professor/provas/${id}/encerrar`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.ok) {
          mostrarMensagem('Transmissão encerrada');
          carregarProvas();
        } else {
          alert(data.error || 'Erro ao encerrar');
        }
      });
    });

    container.querySelectorAll('[data-exportar-pdf]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-exportar-pdf');
        btn.disabled = true;
        const textoOriginal = btn.textContent;
        btn.textContent = 'Gerando...';
        try {
          const res = await fetch(`${API}/professor/provas/${id}/pdf`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Erro ao gerar PDF da prova');
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `prova_${id}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error(err);
          alert(err.message || 'Erro ao gerar PDF da prova');
        } finally {
          btn.disabled = false;
          btn.textContent = textoOriginal;
        }
      });
    });

    container.querySelectorAll('[data-exportar-xls]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-exportar-xls');
        btn.disabled = true;
        const textoOriginal = btn.textContent;
        btn.textContent = 'Gerando...';
        try {
          const res = await fetch(`${API}/professor/provas/${id}/xls`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Erro ao gerar planilha da prova');
          }
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `prova_${id}_relatorio.xlsx`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
        } catch (err) {
          console.error(err);
          alert(err.message || 'Erro ao gerar planilha da prova');
        } finally {
          btn.disabled = false;
          btn.textContent = textoOriginal;
        }
      });
    });
  } catch (error) {
    console.error(error);
    mostrarMensagem('Erro ao carregar provas');
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const autorizado = await verificarAcessoProfessor();
  if (!autorizado) return;
  adicionarQuestao();
  el('add-question-btn')?.addEventListener('click', adicionarQuestao);
  el('importar-arquivo-btn')?.addEventListener('click', importarProvaArquivo);
  el('start-round-btn')?.addEventListener('click', iniciarRodadaAoVivo);
  el('next-round-btn')?.addEventListener('click', () => {
    mostrarRespostaCorreta();
    setTimeout(avancarPergunta, 900);
  });
  el('download-xls-btn')?.addEventListener('click', async () => {
    if (!activeSession?.prova?.id) {
      alert('Nenhuma prova finalizada para exportar.');
      return;
    }
    try {
      const res = await fetch(`${API}/professor/provas/${activeSession.prova.id}/xls`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao gerar relatório XLS');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prova_${activeSession.prova.id}_relatorio.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert(err.message || 'Erro ao gerar relatório XLS');
    }
  });
  el('fullscreen-btn')?.addEventListener('click', () => {
    const elDoc = document.documentElement;
    if (!document.fullscreenElement) {
      elDoc.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  });

  document.querySelectorAll('.menu-btn, .tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.dataset.section;
      if (!section) return;
      document.querySelectorAll('.menu-btn, .tab-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.section === section));
      document.querySelectorAll('.page-section').forEach((sectionEl) => sectionEl.classList.add('hidden'));
      const target = document.getElementById(section);
      if (target) target.classList.remove('hidden');
    });
  });

  el('prova-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const questoes = coletarQuestoes();

    if (!questoes.length) {
      alert('Adicione ao menos uma questão');
      return;
    }

    const titulo = el('titulo-prova').value.trim();
    const tempo = Number(el('tempo-prova').value);
    const salaId = el('prova-sala-select')?.value;

    if (!salaId) {
      alert('Selecione uma sala para a prova');
      return;
    }

    try {
      const res = await fetch(`${API}/professor/provas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ titulo, tempo_minutos: tempo, sala_id: Number(salaId), questoes })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar prova');

      mostrarMensagem('Prova criada com sucesso');
      el('prova-form').reset();
      el('questoes-container').innerHTML = '';
      adicionarQuestao();
      carregarProvas();
    } catch (error) {
      console.error(error);
      alert(error.message || 'Erro ao salvar prova');
    }
  });

  // load turma controls and assignments
  try {
    const [periodosRes, salasRes] = await Promise.all([
      fetch(`${API}/professor/periodos`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/professor/salas`, { headers: { Authorization: `Bearer ${token}` } })
    ]);

    const periodosData = await periodosRes.json();
    const salasData = await salasRes.json();

    periodosSelectEl = el('periodos-select');
    salasSelectEl = el('salas-select');
    const provaSalaSelect = el('prova-sala-select');
    const periodos = periodosData.periodos || [];
    const salas = salasData.salas || [];

    const updateSalas = () => {
      const selectedPeriodo = periodosSelectEl.value;
      const visibleSalas = selectedPeriodo
        ? salas.filter((sala) => String(sala.periodo_id) === String(selectedPeriodo))
        : salas;

      salasSelectEl.innerHTML = visibleSalas.map((s) => `<option value="${s.id}">${s.periodo_nome} — ${s.nome}</option>`).join('');
      renderTurmas(visibleSalas);
    };

    const updateProvaSalaOptions = () => {
      if (!provaSalaSelect) return;
      provaSalaSelect.innerHTML = `
        <option value="">Selecione uma sala</option>
        ${salas.map((s) => `<option value="${s.id}">${escapeHtml(s.periodo_nome)} — ${escapeHtml(s.nome)}</option>`).join('')}
      `;
    };

    periodosSelectEl.innerHTML = `<option value="">Todos os períodos</option>${periodos.map(p => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join('')}`;
    updateSalas();
    updateProvaSalaOptions();
    periodosSelectEl.addEventListener('change', updateSalas);

    el('criar-sala-btn')?.addEventListener('click', async () => {
      const periodoId = periodosSelectEl.value;
      const nome = el('nova-sala-nome')?.value?.trim();
      if (!periodoId) return alert('Selecione um período');
      if (!nome) return alert('Informe o nome da nova sala');
      try {
        const res = await fetch(`${API}/professor/salas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ periodo_id: periodoId, nome })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro criar sala');
        alert('Sala criada');
        window.location.reload();
      } catch (err) {
        console.error(err);
        alert(err.message || 'Erro criar sala');
      }
    });

    el('export-periodo-btn')?.addEventListener('click', async () => {
      const periodoId = periodosSelectEl.value;
      if (!periodoId) return alert('Selecione um período');
      try {
        const url = `${API}/professor/export/periodo/${periodoId}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Erro exportar');
        }
        const blob = await res.blob();
        const a = document.createElement('a');
        const obj = URL.createObjectURL(blob);
        a.href = obj; a.download = `periodo_${periodoId}_export.xlsx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(obj);
      } catch (err) {
        console.error(err); alert(err.message || 'Erro exportar');
      }
    });

    el('export-sala-btn')?.addEventListener('click', async () => {
      const salaId = salasSelectEl.value;
      if (!salaId) return alert('Selecione uma sala');
      try {
        const url = `${API}/professor/export/sala/${salaId}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Erro exportar');
        }
        const blob = await res.blob();
        const a = document.createElement('a');
        const obj = URL.createObjectURL(blob);
        a.href = obj; a.download = `sala_${salaId}_export.xlsx`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(obj);
      } catch (err) {
        console.error(err); alert(err.message || 'Erro exportar');
      }
    });

    el('encerrar-todas-btn')?.addEventListener('click', async () => {
      if (!confirm('Encerrar todas as transmissões ativas que você iniciou?')) return;
      try {
        const res = await fetch(`${API}/professor/provas/encerrar-todas`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Erro encerrar todas');
        alert(`Encerradas: ${data.encerradas}`);
        carregarProvas();
      } catch (err) {
        console.error(err); alert(err.message || 'Erro encerrar todas');
      }
    });
  } catch (err) {
    console.error('Erro carregar turmas', err);
  }

  el('logout-btn')?.addEventListener('click', () => {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  });

  carregarProvas();
});
