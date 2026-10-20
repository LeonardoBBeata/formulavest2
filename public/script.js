const API = window.location.origin;
const token = null;
const hasSession = localStorage.getItem('auth_session') === '1';

if (!hasSession) window.location.href = "/login.html";

// ======================
// STATE
// ======================
let questoes = [];
let provaId = null;
let respostasUser = {};
let grafico = null;
let focoTimer = null;
let focoSegundos = 25 * 60;
let metas = JSON.parse(localStorage.getItem("metas") || "[]");
let planoDia = JSON.parse(localStorage.getItem("planoDia") || "[]");
let notificacoesAtivas = localStorage.getItem("notificacoesAtivas") === "true";
let temaAtual = localStorage.getItem("theme") || "dark";
let escalaFonte = localStorage.getItem("fontScale") || "normal";
let movimentoReduzido = localStorage.getItem("reduceMotion") === "true";
let menuLateralEncolhido = localStorage.getItem("sidebarCollapsed") === "true";

const ACHIEVEMENTS = [
  { key: 'primeira_prova', icon: '🎯', title: 'Primeiros passos', desc: 'Concluiu a primeira prova.' },
  { key: 'tres_provas', icon: '⚡', title: 'Em ritmo', desc: 'Concluiu 3 provas.' },
  { key: 'dez_provas', icon: '🏅', title: '10 provas', desc: 'Concluiu 10 provas.' },
  { key: 'cinquenta_provas', icon: '👑', title: 'Veterano', desc: 'Concluiu 50 provas.' },
  { key: 'prova_perfeita', icon: '💯', title: 'Nota máxima', desc: 'Acertou uma prova inteira.' },
  { key: 'xp_100', icon: '✨', title: '100 XP', desc: 'Alcançou seus primeiros 100 XP.' },
  { key: 'nivel_5', icon: '🚀', title: 'Nível 5', desc: 'Chegou ao nível 5.' },
  { key: 'nivel_10', icon: '🌟', title: 'Nível 10', desc: 'Chegou ao nível 10.' },
  { key: 'streak_3', icon: '🔥', title: 'Constância', desc: 'Estudou por 3 dias seguidos.' },
  { key: 'streak_7', icon: '🏆', title: 'Semana imparável', desc: 'Estudou por 7 dias seguidos.' }
];

function updateAnswerSelection(existingAnswers = {}, questionIndex, letra) {
  const nextAnswers = { ...(existingAnswers || {}) };

  if (letra === null || letra === undefined || letra === '') {
    delete nextAnswers[questionIndex];
    return nextAnswers;
  }

  nextAnswers[questionIndex] = String(letra).toUpperCase();
  return nextAnswers;
}

function clearCompletedExamState(state = {}) {
  return {
    ...state,
    questoes: [],
    provaId: null,
    respostasUser: {}
  };
}

function syncAchievementLocalState({ provas, xp, nivel, streak, provaPerfeita }) {
  const totalProvas = Number(provas || localStorage.getItem('provasConcluidas') || 0);
  const totalXp = Number(xp || localStorage.getItem('xpTotal') || 0);
  const nivelAtual = Number(nivel || localStorage.getItem('nivelAtual') || 1);
  const streakAtual = Number(streak || localStorage.getItem('streak') || 0);

  localStorage.setItem('provasConcluidas', String(Math.max(0, totalProvas)));
  localStorage.setItem('xpTotal', String(Math.max(0, totalXp)));
  localStorage.setItem('nivelAtual', String(Math.max(1, nivelAtual)));
  localStorage.setItem('streak', String(Math.max(0, streakAtual)));
  if (provaPerfeita) localStorage.setItem('ultimaProvaPerfeita', '1');
}

// ======================
// INIT
// ======================
function sincronizarMetasComProgresso(totalProvas = Number(localStorage.getItem("provasConcluidas") || 0)) {
  if (!Array.isArray(metas) || !metas.length) {
    metas = [
      { texto: "Completar 1 simulado", feito: false },
      { texto: "Estudar redação", feito: false },
      { texto: "Revisar erradas", feito: false }
    ];
  }

  metas = metas.map((meta, index) => {
    const texto = String(meta.texto || '').toLowerCase();
    let feito = Boolean(meta.feito);

    if (texto.includes('simulado')) feito = totalProvas >= 1;
    else if (texto.includes('redação') || texto.includes('redacao')) feito = totalProvas >= 2;
    else if (texto.includes('erradas') || texto.includes('revisar')) feito = totalProvas >= 3;

    if (index === 0 && !texto.includes('simulado') && !texto.includes('redacao') && !texto.includes('erradas') && !texto.includes('revisar')) {
      feito = totalProvas >= 1;
    }

    return { ...meta, feito };
  });

  localStorage.setItem("metas", JSON.stringify(metas));
  localStorage.setItem("provasConcluidas", String(Math.max(0, totalProvas)));
  renderMetas();
  atualizarResumo();
}

window.addEventListener("DOMContentLoaded", () => {
  aplicarTema(temaAtual);
  inicializarConfiguracoes();
  aplicarEstadoMenuLateral();
  window.addEventListener("resize", aplicarEstadoMenuLateral);
  configurarAbas();
  configurarBotoes();
  configurarLogout();
  inicializarPlanejamento();
  inicializarAcompanhamento();
  inicializarNotificacoes();
  inicializarBoasVindas();

  configurarAcessoProfessor();
  carregarDashboard();
  carregarConquistas();
  carregarRanking();
  carregarGrafico();
  carregarTrilhaMaterias();
  atualizarStreak();
  atualizarResumo();
});

// poll conquistas periodically to show real-time notifications
setInterval(() => {
  try { carregarConquistas(); } catch (e) { /* ignore */ }
}, 30000);

// ======================
// HELPERS
// ======================
const el = (id) => document.getElementById(id);

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ======================
// ABAS
// ======================
function configurarAbas() {
  document.querySelectorAll(".sidebar li").forEach(item => {
    item.addEventListener("click", () => {
      const alvo = item.dataset.section;
      if (!alvo) return;

      document.querySelectorAll(".sidebar li").forEach(i => i.classList.remove("active"));
      document.querySelectorAll(".section").forEach(s => s.classList.add("hidden"));

      item.classList.add("active");
      el(alvo)?.classList.remove("hidden");
      if (menuMobileAtivo()) fecharMenuMobile();
    });
  });
}

// ======================
// BOTÕES
// ======================
function configurarBotoes() {
  el("gerar-enem-btn")?.addEventListener("click", gerarEnem);
  el("gerar-provao-btn")?.addEventListener("click", gerarProvao);
  el("gerar-personalizada-btn")?.addEventListener("click", gerarProvaPersonalizada);

  el("finalizar-enem-btn")?.addEventListener("click", salvarResultado);
  el("finalizar-provao-btn")?.addEventListener("click", salvarResultado);
  el("finalizar-personalizada-btn")?.addEventListener("click", salvarResultado);
  el("close-final-screen-btn")?.addEventListener("click", () => {
    limparSessaoProva();
    el("final-screen")?.classList.add("hidden");
    ativarSecao("personalizadas");
  });

  el("enviar-redacao")?.addEventListener("click", corrigirRedacao);
  el("iniciar-foco-btn")?.addEventListener("click", iniciarModoFoco);
  el("adicionar-meta-btn")?.addEventListener("click", adicionarMeta);
  el("marcar-sessao-btn")?.addEventListener("click", marcarSessao);
  el("theme-toggle")?.addEventListener("click", alternarTema);
  el("notify-btn")?.addEventListener("click", alternarNotificacoes);
  el("mobile-menu-btn")?.addEventListener("click", alternarMenuLateral);
  el("mobile-overlay")?.addEventListener("click", fecharMenuMobile);
}

// Entrar com código (mini) - disponível no dashboard
el('codigo-entrar-mini-btn')?.addEventListener('click', async () => {
  const input = el('codigo-prova-mini');
  const status = el('codigo-mini-status');
  if (!input) return;
  const codigo = (input.value || '').trim().toUpperCase();
  if (!codigo) { status.textContent = 'Informe o código.'; return; }
  try {
    const res = await fetch(`${API}/provas-prontas/entrar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ codigo })
    });
    const data = await res.json();
    if (!res.ok) { status.textContent = data.error || 'Erro ao entrar na prova'; return; }
    sessionStorage.setItem('provaAtual', JSON.stringify(data.prova));
    status.textContent = `Prova carregada: ${data.prova.titulo}`;
    window.location.href = '/prova-responder.html';
  } catch (err) { console.error(err); status.textContent = 'Não foi possível entrar na prova.'; }
});

// carregar conquistas do usuário e renderizar na aba
async function carregarConquistas() {
  try {
    const fallback = {
      primeiro: Number(localStorage.getItem('provasConcluidas') || 0) >= 1,
      streak_3: Number(localStorage.getItem('streak') || 0) >= 3,
      streak_7: Number(localStorage.getItem('streak') || 0) >= 7,
      xp_100: Number(localStorage.getItem('xpTotal') || 0) >= 100,
      nivel_5: Number(localStorage.getItem('nivelAtual') || 1) >= 5,
      nivel_10: Number(localStorage.getItem('nivelAtual') || 1) >= 10,
      primeira_prova: Number(localStorage.getItem('provasConcluidas') || 0) >= 1,
      tres_provas: Number(localStorage.getItem('provasConcluidas') || 0) >= 3,
      dez_provas: Number(localStorage.getItem('provasConcluidas') || 0) >= 10,
      cinquenta_provas: Number(localStorage.getItem('provasConcluidas') || 0) >= 50,
      prova_perfeita: localStorage.getItem('ultimaProvaPerfeita') === '1'
    };

    const res = await fetch(`${API}/me/conquistas`, { headers: { Authorization: `Bearer ${token}` }, credentials: 'same-origin' });
    const data = res.ok ? await res.json() : {};
    const container = el('conquistas-container');
    if (!container) return;
    const c = { ...fallback, ...(data.conquistas || {}) };
    const hist = Array.isArray(data.historico) ? data.historico : [];
    const desbloqueadas = ACHIEVEMENTS.filter(item => !!c[item.key]).length;
    container.innerHTML = `
      <div class="card">
        <h3>Sua evolução</h3>
        <p>Streak: <strong>${c.streak_days || 0}</strong> dias</p>
        <p>Nível: <strong>${data.nivel || 1}</strong></p>
        <p>Provas: <strong>${data.total || 0}</strong></p>
        <p>Conquistas: <strong>${desbloqueadas}/${ACHIEVEMENTS.length}</strong></p>
      </div>
      <div class="card conquistas-resumo">
        <h4>Todas as conquistas</h4>
        <div class="conquistas-mini-grid">
          ${ACHIEVEMENTS.map(achievement => `
            <button type="button" class="conquista-mini ${c[achievement.key] ? 'conquistada' : 'bloqueada'}" data-achievement-key="${achievement.key}" title="${escapeHtml(achievement.desc)}">
              <span>${achievement.icon}</span>
              <small>${escapeHtml(achievement.title)}</small>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="card">
        <h4>Histórico</h4>
        ${hist.length ? ('<ul>' + hist.map(h => `<li><strong>${escapeHtml(h.titulo)}</strong> — ${escapeHtml(h.descricao)} <small>(${escapeHtml(new Date(h.criado_em).toLocaleString())})</small></li>`).join('') + '</ul>') : '<p>Sem histórico ainda.</p>'}
      </div>
    `;

    container.querySelectorAll('[data-achievement-key]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.getAttribute('data-achievement-key');
        const achievement = ACHIEVEMENTS.find(item => item.key === key);
        if (!achievement) return;
        const unlocked = !!c[key];
        const historicEntry = (hist || []).find(item => item.chave === key);
        const statusText = unlocked ? 'Conquistada' : 'Ainda não adquirida';
        const unlockedAt = historicEntry ? new Date(historicEntry.criado_em).toLocaleString() : 'Ainda não desbloqueada';

        mostrarDetalheConquista({
          ...achievement,
          unlocked,
          statusText,
          unlockedAt,
          description: achievement.desc
        });
      });
    });
    (data.novas_conquistas || []).forEach((achievement, index) => {
      const definition = ACHIEVEMENTS.find(item => item.key === achievement.chave);
      window.setTimeout(() => mostrarPopupConquista({
        ...achievement,
        icon: definition?.icon || '🏆'
      }), index * 600);
    });
  } catch (err) {
    console.error('Erro carregar conquistas', err);
  }
}

function mostrarDetalheConquista(achievement) {
  let modal = document.getElementById('achievement-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'achievement-detail-modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(10, 18, 24, 0.6)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.zIndex = '3000';
    modal.style.padding = '16px';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:480px;width:100%;padding:24px;position:relative;box-shadow:0 18px 60px rgba(0,0,0,.25);color:#111827;">
        <button type="button" id="achievement-detail-close" style="position:absolute;top:12px;right:12px;border:none;background:transparent;cursor:pointer;font-size:22px;">×</button>
        <div id="achievement-detail-content"></div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('#achievement-detail-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (event) => {
      if (event.target === modal) modal.remove();
    });
  }

  const content = modal.querySelector('#achievement-detail-content');
  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">
      <div style="width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;background:${achievement.unlocked ? 'linear-gradient(135deg,#36D1DC,#5B86E5)' : '#e5e7eb'};color:${achievement.unlocked ? '#fff' : '#6b7280'};">${achievement.icon}</div>
      <div>
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">Conquista</div>
        <h3 style="margin:4px 0 0;font-size:24px;">${escapeHtml(achievement.title)}</h3>
      </div>
    </div>
    <p style="margin:0 0 12px;line-height:1.5;color:#374151;">${escapeHtml(achievement.description)}</p>
    <p style="margin:8px 0;color:#111827;"><strong>Status:</strong> ${escapeHtml(achievement.statusText)}</p>
    <p style="margin:8px 0;color:#111827;"><strong>Desbloqueio:</strong> ${escapeHtml(achievement.unlockedAt)}</p>
  `;

  modal.style.display = 'flex';
}

function mostrarPopupConquista(achievement) {
  let stack = el('achievement-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'achievement-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }

  const popup = document.createElement('article');
  popup.className = 'achievement-popup';
  popup.innerHTML = `
    <div class="achievement-popup__icon">${escapeHtml(achievement.icon || '🏆')}</div>
    <div><small>CONQUISTA DESBLOQUEADA</small><strong>${escapeHtml(achievement.titulo)}</strong><p>${escapeHtml(achievement.descricao)}</p></div>
    <button type="button" class="achievement-popup__close" aria-label="Fechar">×</button>
  `;
  popup.querySelector('.achievement-popup__close')?.addEventListener('click', () => popup.remove());
  stack.appendChild(popup);
  window.setTimeout(() => popup.classList.add('is-visible'), 30);
  window.setTimeout(() => {
    popup.classList.remove('is-visible');
    window.setTimeout(() => popup.remove(), 240);
  }, 6000);
}

async function configurarAcessoProfessor() {
  const linkProfessor = el("link-professor");
  if (!linkProfessor) return;

  if (!hasSession) {
    linkProfessor.classList.add("hidden");
    return;
  }

  try {
    const res = await fetch(`${API}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      linkProfessor.classList.add("hidden");
      return;
    }

    const data = await res.json();
    linkProfessor.classList.toggle("hidden", data.role !== "professor");
  } catch (error) {
    console.error(error);
    linkProfessor.classList.add("hidden");
  }
}

function inicializarBoasVindas() {
  const modal = el("welcome-modal");
  if (!modal) return;

  const jaViu = localStorage.getItem("welcomeSeen") === "true";
  if (jaViu) return;

  setTimeout(() => {
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }, 450);

  el("welcome-start-btn")?.addEventListener("click", () => {
    fecharBoasVindas();
    mostrarToast("Vamos começar! Seu plano já está pronto para você.");
  });

  el("welcome-dismiss-btn")?.addEventListener("click", () => fecharBoasVindas());
  modal.addEventListener("click", event => {
    if (event.target === modal) fecharBoasVindas();
  });
}

function fecharBoasVindas() {
  const modal = el("welcome-modal");
  if (!modal) return;

  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  localStorage.setItem("welcomeSeen", "true");
}

// ======================
// DASHBOARD
// ======================
async function carregarDashboard() {
  try {
    const res = await fetch(`${API}/dashboard`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Não foi possível carregar o dashboard');

    const data = await res.json();
    const resumo = data.resumo || {};
    const total = Number(resumo.total_provas || 0);
    const media = Number(resumo.percentual_geral || 0);
    const melhor = Number(resumo.melhor_percentual || 0);

    localStorage.setItem("provasConcluidas", String(Math.max(0, total)));
    sincronizarMetasComProgresso(total);

    const container = el("dashboard-container");
    if (container) {
      container.innerHTML = `
        <div class="card">
          <p>Total de provas concluídas: <strong>${total}</strong></p>
          <p>Precisão geral: <strong>${media.toFixed(1)}%</strong></p>
          <p>Melhor resultado: <strong>${melhor.toFixed(1)}%</strong></p>
        </div>
      `;
    }

    const xp = Number(data.user?.xp || 0);
    const nivel = Number(data.user?.nivel || 1);
    const xpNoNivel = xp % 100;
    if (el("nivel-user")) el("nivel-user").innerText = nivel;
    if (el("xp-total")) el("xp-total").innerText = `${xp} XP`;
    if (el("xp-bar-fill")) el("xp-bar-fill").style.width = `${xpNoNivel}%`;
    if (el("stat-acertos")) el("stat-acertos").innerText = `${media.toFixed(0)}%`;
    if (el("stat-sessoes")) el("stat-sessoes").innerText = total;
  } catch (error) {
    console.error(error);
    const container = el("dashboard-container");
    if (container) container.innerHTML = '<div class="card"><p>Não foi possível carregar o dashboard no momento.</p></div>';
  }
}

// ======================
// RANKING
// ======================
async function carregarRanking() {
  try {
    const res = await fetch(`${API}/ranking`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('Não foi possível carregar o ranking');

    const payload = await res.json().catch(() => []);
    const data = Array.isArray(payload) ? payload : [];
    const top3 = data.slice(0, 3);

    if (el("top3")) {
      el("top3").innerHTML = top3.length
        ? top3.map((u, i) => `
          <div class="card">
            <h3>${i + 1}º ${escapeHtml(u.username || u.nome || 'Usuário')}</h3>
            <p>${Number(u.xp || 0)} XP</p>
          </div>
        `).join("")
        : '<div class="card"><p>Ainda não há dados de ranking.</p></div>';
    }

    if (el("ranking-list")) {
      el("ranking-list").innerHTML = data.length
        ? data.map((u, i) => `
          <div>${i + 1} - ${escapeHtml(u.username || u.nome || 'Usuário')} | ${Number(u.xp || 0)} XP</div>
        `).join("")
        : '<div>Nenhum usuário encontrado no ranking.</div>';
    }
  } catch (error) {
    console.error(error);
    if (el("top3")) el("top3").innerHTML = '<div class="card"><p>Ranking indisponível no momento.</p></div>';
    if (el("ranking-list")) el("ranking-list").innerHTML = '<div>Ranking indisponível no momento.</div>';
  }
}

// ======================
// GRÁFICO SIMPLES (EVOLUÇÃO DE ACERTOS)
// ======================
async function carregarGrafico() {
  if (typeof Chart === 'undefined') return;

  const res = await fetch(`${API}/provas?limit=50`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return;

  const data = await res.json();
  const provas = Array.isArray(data.provas) ? [...data.provas].reverse() : [];
  const labels = provas.map((prova, index) => {
    const dataProva = prova.criado_em ? new Date(prova.criado_em) : null;
    return dataProva && !Number.isNaN(dataProva.getTime())
      ? dataProva.toLocaleDateString('pt-BR')
      : `Prova ${index + 1}`;
  });
  const percentuais = provas.map(prova => Number(prova.percentual || 0));

  const ctx = el("graficoEvolucao");
  if (!ctx) return;

  if (grafico) grafico.destroy();

  grafico = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Precisão por prova (%)",
        data: percentuais,
        borderWidth: 2,
        tension: 0.3
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

async function carregarTrilhaMaterias() {
  try {
    const response = await fetch(`${API}/grafico`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Não foi possível carregar a trilha por matéria');

    const data = await response.json();
    const materias = [
      ['matematica', 'prog-matematica', 'fill-matematica'],
      ['portugues', 'prog-portugues', 'fill-portugues'],
      ['redacao', 'prog-redacao', 'fill-redacao']
    ];

    materias.forEach(([key, labelId, fillId]) => {
      const percentual = Math.min(100, Math.max(0, Number(data.percentuais?.[key] || 0)));
      const label = el(labelId);
      const fill = el(fillId);
      if (label) label.textContent = `${percentual}%`;
      if (fill) {
        fill.style.width = `${percentual}%`;
        fill.setAttribute('role', 'progressbar');
        fill.setAttribute('aria-valuemin', '0');
        fill.setAttribute('aria-valuemax', '100');
        fill.setAttribute('aria-valuenow', String(percentual));
      }
    });
  } catch (error) {
    console.error(error);
  }
}

// ======================
// PROVAS
// ======================
async function gerarEnem() {
  await gerarProvaAluno({
    endpoint: "/gerar-enem",
    containerId: "enem-container",
    finalizarId: "finalizar-enem-btn",
    botaoId: "gerar-enem-btn"
  });
}

async function gerarProvao() {
  await gerarProvaAluno({
    endpoint: "/gerar-provao",
    containerId: "provao-container",
    finalizarId: "finalizar-provao-btn",
    botaoId: "gerar-provao-btn"
  });
}

async function gerarProvaPersonalizada() {
  const curso = el("curso-personalizado")?.value?.trim();
  const faculdade = el("faculdade-personalizado")?.value?.trim();
  const quantidade = Number(el("quantidade-personalizada")?.value || 10);
  const botao = el("gerar-personalizada-btn");
  const container = el("personalizada-container");

  if (!curso || !faculdade) {
    mostrarToast("Preencha curso e faculdade para gerar a prova.");
    return;
  }

  if (botao) {
    botao.disabled = true;
    botao.textContent = "Gerando...";
  }

  if (container) {
    renderLoadingProva(container, 'Prova personalizada', 'Montando sua prova sob medida...');
  }

  el("finalizar-personalizada-btn")?.classList.add("hidden");

  try {
    const res = await fetch(`${API}/gerar-prova`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ curso, faculdade, quantidade: Math.min(Math.max(quantidade, 1), 50) })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Nao foi possivel gerar a prova personalizada");
    if (!data.prova_id || !Array.isArray(data.questoes) || data.questoes.length === 0) {
      throw new Error("A prova personalizada foi gerada sem questões válidas");
    }

    questoes = data.questoes;
    provaId = data.prova_id;
    respostasUser = {};
    renderProva(data.questoes, "personalizada-container", "finalizar-personalizada-btn");
    ativarSecao("personalizadas");
  } catch (error) {
    console.error(error);
    if (container) {
      container.innerHTML = `<div class="card">${escapeHtml(error.message || "Erro ao gerar prova personalizada")}</div>`;
    }
    mostrarToast(error.message || "Erro ao gerar prova personalizada");
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = "Gerar prova";
    }
  }
}

function ativarSecao(chave) {
  document.querySelectorAll(".sidebar li").forEach(item => {
    const ativo = item.dataset.section === chave;
    item.classList.toggle("active", ativo);
  });

  document.querySelectorAll(".section").forEach(section => {
    section.classList.toggle("hidden", section.id !== chave);
  });
}

function limparSessaoProva() {
  const reset = clearCompletedExamState({ questoes, provaId, respostasUser });
  questoes = reset.questoes;
  provaId = reset.provaId;
  respostasUser = reset.respostasUser;

  ["enem-container", "provao-container", "personalizada-container"].forEach(id => {
    const container = el(id);
    if (container) container.innerHTML = "";
  });

  ["finalizar-enem-btn", "finalizar-provao-btn", "finalizar-personalizada-btn"].forEach(id => {
    el(id)?.classList.add("hidden");
  });
}

function renderLoadingProva(container, tipo = 'Prova', mensagem = 'Gerando sua prova...') {
  if (!container) return;

  container.innerHTML = `
    <div class="exam-loading-card">
      <div class="exam-loading-spinner" aria-hidden="true"></div>
      <div class="exam-loading-content">
        <h3>${escapeHtml(tipo)}</h3>
        <p>${escapeHtml(mensagem)}</p>
        <div class="exam-loading-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  `;
}

async function gerarProvaAluno({ endpoint, containerId, finalizarId, botaoId }) {
  const container = el(containerId);
  const botao = el(botaoId);
  const textoOriginal = botao?.textContent || "";

  if (botao) {
    botao.disabled = true;
    botao.textContent = "Gerando...";
  }

  if (container) {
    const tipo = containerId === 'enem-container' ? 'ENEM' : containerId === 'provao-container' ? 'Provão Paulista' : 'Prova';
    renderLoadingProva(container, tipo, 'Montando as questões e organizando os blocos...');
  }

  el(finalizarId)?.classList.add("hidden");

  try {
    const res = await fetch(`${API}${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Nao foi possivel gerar a prova");
    if (!data.prova_id || !Array.isArray(data.questoes) || data.questoes.length === 0) {
      throw new Error("A prova foi gerada sem questoes validas");
    }

    const questoesValidas = data.questoes.filter((questao) => {
      if (!questao || typeof questao !== 'object') return false;
      return Boolean(questao.enunciado) && Boolean(questao.opcoes) && ['A', 'B', 'C', 'D', 'E'].includes(String(questao.correta || '').toUpperCase());
    });

    if (questoesValidas.length < data.questoes.length) {
      throw new Error('A prova gerada está incompleta ou inválida. Tente novamente.');
    }

    questoes = data.questoes;
    provaId = data.prova_id;
    respostasUser = {};

    renderProva(data.questoes, containerId, finalizarId);
  } catch (error) {
    console.error(error);
    if (container) {
      container.innerHTML = `<div class="card">${escapeHtml(error.message || "Erro ao gerar prova")}</div>`;
    }
    mostrarToast(error.message || "Erro ao gerar prova");
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }
}

// ======================
// RENDER PROVA
// ======================
function renderProva(lista, containerId, btnFinalizar) {
  const container = el(containerId);
  if (!container) return;
  container.innerHTML = "";

  const total = Array.isArray(lista) ? lista.length : 0;
  const tipo = containerId === 'enem-container' ? 'ENEM' : containerId === 'provao-container' ? 'Provão Paulista' : 'Prova personalizada';
  const resumo = `
    <div class="card" style="margin-bottom: 16px; background:#f6f8ff; border:1px solid #dfe6ff;">
      <strong>${tipo}</strong>
      <div style="margin-top: 6px; color:#4b5563; font-size: 14px;">${total} questões • 9 blocos de 10</div>
    </div>
  `;

  if (!Array.isArray(lista) || lista.length === 0) {
    container.innerHTML = '<div class="card">Nenhuma questao encontrada para esta prova.</div>';
    return;
  }

  container.insertAdjacentHTML('beforeend', resumo);

  lista.forEach((q, i) => {
    const opcoes = q && typeof q.opcoes === "object" && !Array.isArray(q.opcoes)
      ? Object.entries(q.opcoes).filter(([letra, texto]) => letra && texto != null)
      : [];

    if (!q?.enunciado || opcoes.length < 2) return;

    container.innerHTML += `
      <div class="questao">
        <p><b>Q${i + 1}</b> ${escapeHtml(q.enunciado)}</p>

        <div class="alternativas">
        ${opcoes.map(([l, t]) => `
          <button class="alternativa" type="button" data-questao="${i}" data-letra="${escapeHtml(l)}">
            ${escapeHtml(l)}) ${escapeHtml(t)}
          </button>
        `).join("")}
        </div>
      </div>
    `;
  });

  if (!container.children.length) {
    container.innerHTML = '<div class="card">A IA retornou questões incompletas. Gere a prova novamente.</div>';
    return;
  }

  container.querySelectorAll(".alternativa").forEach(botao => {
    botao.addEventListener("click", () => {
      selecionar(Number(botao.dataset.questao), botao.dataset.letra, botao);
    });
  });

  el(btnFinalizar)?.classList.remove("hidden");
}

// ======================
// SELEÇÃO
// ======================
function selecionar(index, letra, elClicked) {
  respostasUser = updateAnswerSelection(respostasUser, index, letra);

  const all = elClicked.parentElement.querySelectorAll(".alternativa");
  all.forEach(a => {
    const isSelected = String(respostasUser[index] || '') === String(a.dataset.letra || '');
    a.classList.toggle('selecionada', isSelected);
    a.disabled = false;
    a.style.opacity = isSelected ? '1' : '0.95';
    a.setAttribute('aria-pressed', String(isSelected));
  });

  elClicked.classList.add('selecionada');
}

// ======================
// SALVAR RESULTADO
// ======================
async function salvarResultado() {
  try {
    const respostas = questoes.map((q, i) => ({
      selecionada: respostasUser[i] || null
    }));

    const res = await fetch(`${API}/salvar-prova`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ prova_id: provaId, questoes: respostas })
    });

    if (!res.ok) throw new Error('Não foi possível salvar a prova');

    const data = await res.json();

    const provasConcluidas = Number(localStorage.getItem("provasConcluidas") || 0) + 1;
    const xpTotal = Number(localStorage.getItem('xpTotal') || 0) + Number(data.xp_ganho || 0);
    const nivelAtual = Number(data.nivel || Number(localStorage.getItem('nivelAtual') || 1));
    const streakAtual = Number(localStorage.getItem('streak') || 0) + 1;
    const provaPerfeita = Number(data.percentual || 0) >= 100;

    syncAchievementLocalState({
      provas: provasConcluidas,
      xp: xpTotal,
      nivel: nivelAtual,
      streak: streakAtual,
      provaPerfeita
    });

    localStorage.setItem("provasConcluidas", String(Math.max(0, provasConcluidas)));
    sincronizarMetasComProgresso(provasConcluidas);

    limparSessaoProva();
    mostrarResultadoDaProva(data);

    await carregarDashboard();
    await carregarRanking();
    await carregarGrafico();
    await carregarTrilhaMaterias();
    await carregarConquistas();
  } catch (error) {
    console.error(error);
    mostrarToast('Não foi possível salvar a prova. Tente novamente.');
  }
}

function mostrarResultadoDaProva(data) {
  const total = Number(data.total || questoes.length || 0);
  const acertos = Number(data.acertos || 0);
  const percentual = Number(data.percentual || 0);
  const xpGanho = Number(data.xp_ganho || 0);
  const nivel = Number(data.nivel || 1);
  const subiuNivel = Boolean(data.subiu_nivel);
  const finalScreen = el("final-screen");
  const finalText = el("final-text");
  const mensagem = el("resultado-mensagem");
  const titulo = el("resultado-title");

  if (titulo) titulo.textContent = subiuNivel ? `Nível ${nivel} desbloqueado!` : "Resultado disponível";
  if (mensagem) {
    mensagem.textContent = subiuNivel
      ? "Seu desempenho fez você subir de nível. Continue nessa sequência!"
      : percentual >= 70
        ? "Ótimo desempenho — você está no caminho certo."
        : "Cada questão respondida fortalece a sua preparação.";
  }
  if (finalText) {
    finalText.innerHTML = `
      <div><strong>${acertos}/${total}</strong><span>acertos</span></div>
      <div><strong>${percentual.toFixed(1)}%</strong><span>precisão</span></div>
      <div><strong>+${xpGanho}</strong><span>XP ganho</span></div>
      <div><strong>${nivel}</strong><span>nível atual</span></div>
    `;
  }
  finalScreen?.classList.remove("hidden");
}

// ======================
// REDAÇÃO
// ======================
async function corrigirRedacao() {
  const tema = el("tema-redacao").value;
  const texto = el("texto-redacao").value;

  const res = await fetch(`${API}/corrigir-redacao`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ tema, texto })
  });

  const data = await res.json();

  el("feedback-redacao").innerText =
    `Nota: ${data.nota_total}\n${data.feedback}`;
}

// ======================
// STREAK
// ======================
function atualizarStreak() {
  const streak = Number(localStorage.getItem("streak") || 0);
  el("streak-days").innerText = `${streak} dias 🔥`;
  el("hero-streak").innerText = `${streak} dias`;
}

function inicializarPlanejamento() {
  if (!planoDia.length) {
    planoDia = [
      "Revisar 10 questões de matemática",
      "Estudar redação por 20 minutos",
      "Fazer uma revisão rápida de português"
    ];
    localStorage.setItem("planoDia", JSON.stringify(planoDia));
  }

  if (!metas.length) {
    metas = [
      { texto: "Completar 1 simulado", feito: false },
      { texto: "Estudar redação", feito: false },
      { texto: "Revisar erradas", feito: false }
    ];
    localStorage.setItem("metas", JSON.stringify(metas));
  }

  sincronizarMetasComProgresso(Number(localStorage.getItem("provasConcluidas") || 0));
  renderPlanoDia();
}

function renderPlanoDia() {
  const container = el("plano-dia-list");
  if (!container) return;

  container.innerHTML = planoDia.map(item => `<li>✓ ${escapeHtml(item)}</li>`).join("");
}

function renderMetas() {
  const concluidas = metas.filter(m => m.feito).length;
  el("hero-meta").innerText = `${concluidas}/${metas.length}`;
  el("hero-dica").innerText = concluidas === metas.length ? "Parabéns! Meta diária concluída." : "Uma pequena vitória por vez.";
}

function adicionarMeta() {
  const texto = prompt("Qual meta você quer adicionar hoje?");
  if (!texto) return;

  metas.push({ texto, feito: false });
  localStorage.setItem("metas", JSON.stringify(metas));
  renderMetas();
}

function iniciarModoFoco() {
  if (focoTimer) return;

  focoTimer = setInterval(() => {
    focoSegundos -= 1;
    const mins = String(Math.floor(focoSegundos / 60)).padStart(2, "0");
    const secs = String(focoSegundos % 60).padStart(2, "0");
    const timer = el("focus-timer");
    if (timer) timer.innerText = `${mins}:${secs}`;

    if (focoSegundos <= 0) {
      clearInterval(focoTimer);
      focoTimer = null;
      focoSegundos = 25 * 60;
      if (el("focus-timer")) el("focus-timer").innerText = "25:00";
      alert("Sessão de foco concluída! Você merece uma pausa.");
    }
  }, 1000);
}

function atualizarResumo() {
  const resumo = el("resumo-hoje");
  if (!resumo) return;

  const concluida = metas.filter(m => m.feito).length;
  resumo.innerHTML = `
    <div>📈 Progresso de metas: ${concluida}/${metas.length}</div>
    <div>🎯 Estilo de estudo: foco e repetição</div>
    <div>💡 Dica: finalize uma atividade por vez para manter o ritmo.</div>
  `;
  atualizarPainelEstatisticas();
}

function atualizarPainelEstatisticas() {
  const sessoes = Number(localStorage.getItem("sessoesSemana") || 0);
  const concluidas = metas.filter(m => m.feito).length;
  const total = metas.length || 1;
  const streak = Number(localStorage.getItem("streak") || 0);

  el("stat-metas").innerText = `${concluidas}/${total}`;
  el("stat-ritmo").innerText = `${streak} dias`;
}

function inicializarAcompanhamento() {
  const semana = Number(localStorage.getItem("sessoesSemana") || 0);
  const tip = el("weekly-tip");
  if (tip) {
    tip.innerText = semana >= 5
      ? "Excelente! Você manteve uma semana consistente de estudos."
      : `Você registrou ${semana} sessões esta semana. Continue assim.`;
  }

  const progresso = [
    { id: "matematica", valor: 68 },
    { id: "portugues", valor: 54 },
    { id: "redacao", valor: 41 }
  ];

  progresso.forEach(item => {
    const label = el(`prog-${item.id}`);
    const fill = el(`fill-${item.id}`);
    if (label) label.innerText = `${item.valor}%`;
    if (fill) fill.style.width = `${item.valor}%`;
  });
}

function marcarSessao() {
  const atual = Number(localStorage.getItem("sessoesSemana") || 0) + 1;
  localStorage.setItem("sessoesSemana", atual);
  const tip = el("weekly-tip");
  if (tip) {
    tip.innerText = `Sessão registrada! Total desta semana: ${atual}`;
  }
  atualizarPainelEstatisticas();
  mostrarToast("Sessão adicionada ao seu planejamento.");
}

function alternarTema() {
  const temaVisivel = document.body.classList.contains("light-theme") ? "light" : "dark";
  definirTema(temaVisivel === "dark" ? "light" : "dark");
}

function aplicarTema(theme) {
  const temaPreferencia = ["light", "dark", "system"].includes(theme) ? theme : "dark";
  const prefereClaro = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  const temaAplicado = temaPreferencia === "system" ? (prefereClaro ? "light" : "dark") : temaPreferencia;
  temaAtual = temaPreferencia;
  document.body.classList.toggle("light-theme", temaAplicado === "light");
  document.documentElement.style.colorScheme = temaAplicado;
  const button = el("theme-toggle");
  if (button) {
    button.innerText = temaAplicado === "light" ? "☀️ Claro" : "🌙 Escuro";
  }
  document.querySelectorAll("[data-theme-choice]").forEach((choice) => {
    choice.setAttribute("aria-pressed", String(choice.dataset.themeChoice === temaPreferencia));
  });
}

function definirTema(theme) {
  temaAtual = theme;
  localStorage.setItem("theme", temaAtual);
  aplicarTema(temaAtual);
  el("settings-saved")?.classList.add("is-visible");
}

function aplicarEscalaFonte(scale) {
  const escala = { small: "15px", normal: "16px", large: "18px" };
  escalaFonte = Object.prototype.hasOwnProperty.call(escala, scale) ? scale : "normal";
  document.documentElement.style.fontSize = escala[escalaFonte];
  localStorage.setItem("fontScale", escalaFonte);
  document.querySelectorAll("[data-font-scale]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.fontScale === escalaFonte));
  });
}

function aplicarMovimentoReducido(reduced) {
  movimentoReduzido = Boolean(reduced);
  document.body.classList.toggle("reduce-motion", movimentoReduzido);
  localStorage.setItem("reduceMotion", String(movimentoReduzido));
}

function inicializarConfiguracoes() {
  aplicarEscalaFonte(escalaFonte);
  aplicarMovimentoReducido(movimentoReduzido);

  document.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => definirTema(button.dataset.themeChoice));
  });
  document.querySelectorAll("[data-font-scale]").forEach((button) => {
    button.addEventListener("click", () => aplicarEscalaFonte(button.dataset.fontScale));
  });
  el("pref-reduced-motion")?.addEventListener("change", (event) => {
    aplicarMovimentoReducido(event.target.checked);
  });
  el("pref-notifications")?.addEventListener("change", () => alternarNotificacoes());

  const media = window.matchMedia?.("(prefers-color-scheme: light)");
  media?.addEventListener?.("change", () => {
    if (temaAtual === "system") aplicarTema("system");
  });
}

function inicializarNotificacoes() {
  const pill = el("notif-status");
  const summary = el("reminder-summary");
  const settingToggle = el("pref-notifications");
  if (settingToggle) settingToggle.checked = notificacoesAtivas;
  if (pill) {
    pill.innerText = notificacoesAtivas ? "Lembretes ativos" : "Lembretes desativados";
    pill.style.background = notificacoesAtivas ? "rgba(52, 211, 153, 0.16)" : "rgba(239, 68, 68, 0.16)";
  }
  if (summary) {
    summary.innerText = notificacoesAtivas
      ? "Próximo lembrete em 90 minutos"
      : "Ative os lembretes para receber estímulos diários";
  }
}

function alternarNotificacoes() {
  notificacoesAtivas = !notificacoesAtivas;
  localStorage.setItem("notificacoesAtivas", String(notificacoesAtivas));
  inicializarNotificacoes();
  mostrarToast(notificacoesAtivas ? "Lembretes ativados." : "Lembretes desativados.");
  if (notificacoesAtivas) pedirPermissaoNotificacoes();
}

function menuMobileAtivo() {
  return window.matchMedia("(max-width: 900px)").matches;
}

function aplicarEstadoMenuLateral() {
  const container = document.querySelector(".app-container");
  const sidebar = document.querySelector(".sidebar");
  const button = el("mobile-menu-btn");

  if (!container || !sidebar) return;

  if (menuMobileAtivo()) {
    container.classList.remove("sidebar-collapsed");
    sidebar.classList.remove("sidebar-collapsed");
    const isOpen = sidebar.classList.contains("open");
    button?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    return;
  }

  container.classList.toggle("sidebar-collapsed", menuLateralEncolhido);
  sidebar.classList.toggle("sidebar-collapsed", menuLateralEncolhido);
  sidebar.classList.remove("open");
  button?.setAttribute("aria-expanded", menuLateralEncolhido ? "false" : "true");
  button?.setAttribute("title", menuLateralEncolhido ? "Expandir menu lateral" : "Recolher menu lateral");
}

function fecharMenuMobile() {
  document.querySelector(".sidebar")?.classList.remove("open");
  document.getElementById("mobile-overlay")?.classList.add("hidden");
  el("mobile-menu-btn")?.setAttribute("aria-expanded", "false");
}

function alternarMenuLateral() {
  if (menuMobileAtivo()) {
    const sidebar = document.querySelector(".sidebar");
    const isOpen = sidebar?.classList.toggle("open") || false;
    document.getElementById("mobile-overlay")?.classList.toggle("hidden", !isOpen);
    el("mobile-menu-btn")?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    return;
  }

  menuLateralEncolhido = !menuLateralEncolhido;
  localStorage.setItem("sidebarCollapsed", String(menuLateralEncolhido));
  aplicarEstadoMenuLateral();
}

function mostrarToast(message) {
  const stack = el("toast-stack");
  if (!stack) return;
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerText = message;
  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function pedirPermissaoNotificacoes() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') return;
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      mostrarToast('Notificações ativadas para lembretes.');
    }
  });
}

if (notificacoesAtivas) {
  pedirPermissaoNotificacoes();
}

// ======================
// LOGOUT
// ======================
function configurarLogout() {
  el("logout-btn")?.addEventListener("click", async () => {
    await fetch('/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
    localStorage.removeItem('auth_session');
    window.location.href = "/login.html";
  });
}
