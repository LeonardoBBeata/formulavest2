const API = window.location.origin;
const token = null;
const hasSession = localStorage.getItem('auth_session') === '1';
const FOCUS_DURATION_SECONDS = 25 * 60;
const ACTIVITY_STORAGE_KEY = 'studyActivityLog';
const FOCUS_STORAGE_KEY = 'studyFocusTimer';
const ACTIVE_EXAM_JOB_KEY = 'activeExamGenerationJob';
const DEFAULT_PLAN = [
  'Revisar 10 questões de matemática',
  'Estudar redação por 20 minutos',
  'Fazer uma revisão rápida de português'
];
const DEFAULT_GOALS = [
  { texto: 'Completar 1 simulado', feito: false, kind: 'exam' },
  { texto: 'Corrigir uma redação', feito: false, kind: 'essay' },
  { texto: 'Revisar questões erradas', feito: false, kind: 'manual' }
];

if (!hasSession) window.location.href = "/login.html";

// ======================
// STATE
// ======================
let questoes = [];
let provaId = null;
let respostasUser = {};
let grafico = null;
let focoTimer = null;
let focoSegundos = FOCUS_DURATION_SECONDS;
let focoDeadline = null;
let studyActivities = carregarArrayLocalStorage(ACTIVITY_STORAGE_KEY);
const StudyTracker = window.StudyTracker;
function carregarArrayLocalStorage(chave) {
  const armazenado = localStorage.getItem(chave);
  if (!armazenado) return [];

  try {
    const valor = JSON.parse(armazenado);
    if (Array.isArray(valor)) return valor;
  } catch (error) {
    console.warn(`Dados locais inválidos em "${chave}".`, error);
  }

  console.warn(`Dados locais inválidos em "${chave}": era esperado um array.`);
  return [];
}

let metas = carregarArrayLocalStorage("metas");
let planoDia = carregarArrayLocalStorage("planoDia");
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
  const streakAtual = Number.isFinite(Number(streak)) ? Number(streak) : Number(localStorage.getItem('streak') || 0);

  localStorage.setItem('provasConcluidas', String(Math.max(0, totalProvas)));
  localStorage.setItem('xpTotal', String(Math.max(0, totalXp)));
  localStorage.setItem('nivelAtual', String(Math.max(1, nivelAtual)));
  localStorage.setItem('streak', String(Math.max(0, streakAtual)));
  if (provaPerfeita) localStorage.setItem('ultimaProvaPerfeita', '1');
}

// ======================
// INIT
// ======================
window.addEventListener("DOMContentLoaded", async () => {
  await StudyProgress.load();
  studyActivities = carregarArrayLocalStorage(ACTIVITY_STORAGE_KEY);
  metas = carregarArrayLocalStorage('metas');
  planoDia = carregarArrayLocalStorage('planoDia');

  aplicarTema(temaAtual);
  inicializarConfiguracoes();
  aplicarEstadoMenuLateral();
  window.addEventListener("resize", aplicarEstadoMenuLateral);
  configurarAbas();
  configurarBotoes();
  configurarLogout();
  inicializarPlanejamento();
  inicializarModoFoco();
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
  retomarGeracaoProvaAtiva();
});

window.addEventListener('study-progress-sync-error', () => {
  mostrarToast('Seu progresso está neste dispositivo, mas não foi possível sincronizá-lo com sua conta.');
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
  el("pausar-foco-btn")?.addEventListener("click", pausarModoFoco);
  el("reset-foco-btn")?.addEventListener("click", reiniciarModoFoco);
  el("adicionar-meta-btn")?.addEventListener("click", adicionarMeta);
  el("marcar-sessao-btn")?.addEventListener("click", marcarSessao);
  el("plano-dia-form")?.addEventListener("submit", adicionarItemPlano);
  el("meta-form")?.addEventListener("submit", adicionarMetaDoFormulario);
  el("plano-dia-list")?.addEventListener("change", alterarEstadoPlano);
  el("metas-list")?.addEventListener("change", alterarEstadoMeta);
  el("plano-dia-list")?.addEventListener("click", removerItemPlano);
  el("metas-list")?.addEventListener("click", removerMeta);
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
    atualizarResumo();
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
    let areasComDados = 0;

    materias.forEach(([key, labelId, fillId]) => {
      const percentual = Math.min(100, Math.max(0, Number(data.percentuais?.[key] || 0)));
      const tentativas = Math.max(0, Number(data.totais?.[key] || 0));
      const label = el(labelId);
      const fill = el(fillId);
      if (tentativas > 0) areasComDados += 1;
      if (label) label.textContent = tentativas > 0 ? `${percentual}%` : 'Sem dados';
      if (fill) {
        fill.style.width = `${percentual}%`;
        fill.setAttribute('role', 'progressbar');
        fill.setAttribute('aria-valuemin', '0');
        fill.setAttribute('aria-valuemax', '100');
        fill.setAttribute('aria-valuenow', String(percentual));
        fill.setAttribute('aria-valuetext', tentativas > 0
          ? `${percentual}% em ${tentativas} atividade(s)`
          : 'Sem atividades respondidas');
      }
    });
    const status = el('trilha-status');
    if (status) {
      status.textContent = areasComDados
        ? 'Percentuais calculados com base nas suas respostas e redações corrigidas.'
        : 'Conclua um simulado ou corrija uma redação para começar sua trilha.';
    }
  } catch (error) {
    console.error(error);
    const status = el('trilha-status');
    if (status) status.textContent = 'Não foi possível carregar sua trilha agora.';
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

function aguardarGeracaoProva(jobId, container, tipo) {
  const limite = Date.now() + 60 * 60 * 1000;
  let falhasConsecutivas = 0;

  return new Promise((resolve, reject) => {
    const consultar = async () => {
      if (Date.now() >= limite) {
        reject(new Error('A geração ainda está em andamento. Recarregue a página e tente consultar novamente.'));
        return;
      }

      try {
        const response = await fetch(`${API}/geracao-prova/${encodeURIComponent(jobId)}`, {
          credentials: 'same-origin'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 400 || response.status === 404) {
            localStorage.removeItem(ACTIVE_EXAM_JOB_KEY);
          }
          if ([429, 502, 503, 504].includes(response.status) && falhasConsecutivas < 5) {
            falhasConsecutivas += 1;
            const retryAfter = Number(response.headers.get('Retry-After'));
            const delay = response.status === 429 && retryAfter > 0
              ? retryAfter * 1000
              : Math.min(15000, 3000 * falhasConsecutivas);
            setTimeout(consultar, delay);
            return;
          }
          reject(new Error(data.error || 'Não foi possível consultar a geração da prova.'));
          return;
        }

        falhasConsecutivas = 0;
        if (data.status === 'completed') {
          localStorage.removeItem(ACTIVE_EXAM_JOB_KEY);
          resolve(data);
          return;
        }
        if (data.status === 'failed') {
          localStorage.removeItem(ACTIVE_EXAM_JOB_KEY);
          reject(new Error(data.error || 'A geração da prova falhou. Tente novamente.'));
          return;
        }

        const mensagem = data.status === 'queued'
          ? 'Sua solicitação está na fila. Aguarde um momento...'
          : `Gerando questões... ${Number(data.progress || 0)}/90`;
        renderLoadingProva(container, tipo, mensagem);
        setTimeout(consultar, 12000);
      } catch (error) {
        if (falhasConsecutivas < 5) {
          falhasConsecutivas += 1;
          setTimeout(consultar, 2000 * falhasConsecutivas);
          return;
        }
        reject(error);
      }
    };

    consultar();
  });
}

function apresentarProvaGerada(data, { containerId, finalizarId }) {
  const questoesValidas = data.questoes.filter(ExamValidation.isValidStudentQuestion);
  if (questoesValidas.length !== data.questoes.length) {
    throw new Error('A prova gerada está incompleta ou inválida. Tente novamente.');
  }
  questoes = data.questoes;
  provaId = data.prova_id;
  respostasUser = {};
  renderProva(data.questoes, containerId, finalizarId);
}

async function retomarGeracaoProvaAtiva() {
  let saved;
  try {
    saved = JSON.parse(localStorage.getItem(ACTIVE_EXAM_JOB_KEY) || 'null');
  } catch (error) {
    localStorage.removeItem(ACTIVE_EXAM_JOB_KEY);
    return;
  }
  if (!saved || !/^[0-9a-f-]{36}$/i.test(saved.jobId || '')) return;
  if (!['enem-container', 'provao-container'].includes(saved.containerId)) return;

  const container = el(saved.containerId);
  const button = el(saved.botaoId);
  const tipo = saved.containerId === 'enem-container' ? 'ENEM' : 'Provão Paulista';
  if (!container) return;

  if (button) button.disabled = true;
  renderLoadingProva(container, tipo, 'Retomando a geração da sua prova...');
  try {
    const data = await aguardarGeracaoProva(saved.jobId, container, tipo);
    apresentarProvaGerada(data, saved);
  } catch (error) {
    console.error(error);
    container.innerHTML = `<div class="card">${escapeHtml(error.message || 'Erro ao gerar prova')}</div>`;
    mostrarToast(error.message || 'Erro ao gerar prova');
  } finally {
    if (button) button.disabled = false;
  }
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

    let data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = res.status === 502 || res.status === 504
        ? 'A geração demorou mais que o limite do servidor. Tente novamente.'
        : data.error || "Nao foi possivel gerar a prova";
      throw new Error(message);
    }
    if (res.status === 202 && data.job_id) {
      const tipo = containerId === 'enem-container' ? 'ENEM' : 'Provão Paulista';
      localStorage.setItem(ACTIVE_EXAM_JOB_KEY, JSON.stringify({
        jobId: data.job_id,
        containerId,
        finalizarId,
        botaoId
      }));
      renderLoadingProva(container, tipo, 'Sua solicitação está na fila. Aguarde um momento...');
      data = await aguardarGeracaoProva(data.job_id, container, tipo);
    }
    if (!data.prova_id || !Array.isArray(data.questoes) || data.questoes.length === 0) {
      throw new Error("A prova foi gerada sem questoes validas");
    }

    localStorage.removeItem(ACTIVE_EXAM_JOB_KEY);
    apresentarProvaGerada(data, { containerId, finalizarId });
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
    const provaPerfeita = Number(data.percentual || 0) >= 100;
    recordStudyActivity('exam');
    concluirMetasPorTipo('exam');
    const streakAtual = StudyTracker.summarize(studyActivities).streak;

    syncAchievementLocalState({
      provas: provasConcluidas,
      xp: xpTotal,
      nivel: nivelAtual,
      streak: streakAtual,
      provaPerfeita
    });

    localStorage.setItem("provasConcluidas", String(Math.max(0, provasConcluidas)));

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
  const botao = el("enviar-redacao");
  const feedback = el("feedback-redacao");
  if (botao) botao.disabled = true;

  try {
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não foi possível corrigir a redação.');

    if (feedback) feedback.textContent = `Nota: ${data.nota_total}\n${data.feedback || ''}`;
    recordStudyActivity('essay');
    concluirMetasPorTipo('essay');
  } catch (error) {
    console.error(error);
    if (feedback) feedback.textContent = error.message || 'Não foi possível corrigir a redação.';
  } finally {
    if (botao) botao.disabled = false;
  }
}

// ======================
// ROTINA DE ESTUDOS
// ======================
function obterResumoAtividades() {
  return StudyTracker.summarize(studyActivities);
}

function atualizarStreak() {
  const streak = obterResumoAtividades().streak;
  localStorage.setItem('streak', String(streak));
  if (el("streak-days")) el("streak-days").textContent = `${streak} dias 🔥`;
  if (el("hero-streak")) el("hero-streak").textContent = `${streak} dias`;
}

function normalizarItemPlano(item) {
  const texto = typeof item === 'string' ? item : item?.texto || item?.text || '';
  return { texto: String(texto).trim().slice(0, 120), feito: typeof item === 'object' && item?.feito === true };
}

function tipoAutomaticoDaMeta(texto) {
  const normalizado = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/simulado|prova/.test(normalizado)) return 'exam';
  if (/redacao/.test(normalizado)) return 'essay';
  return 'manual';
}

function normalizarMeta(meta) {
  const texto = String(meta?.texto || '').trim().slice(0, 100);
  const kind = ['exam', 'essay', 'manual'].includes(meta?.kind) ? meta.kind : tipoAutomaticoDaMeta(texto);
  return { texto, feito: meta?.feito === true, kind };
}

function salvarPlanejamento() {
  localStorage.setItem('planoDia', JSON.stringify(planoDia));
  localStorage.setItem('metas', JSON.stringify(metas));
  StudyProgress.scheduleSave();
}

function inicializarPlanejamento() {
  const hoje = StudyTracker.dateKey();
  const planoSalvo = localStorage.getItem('planoDia');
  const metasSalvas = localStorage.getItem('metas');
  const dataPlano = localStorage.getItem('planoDiaDate');
  const dataMetas = localStorage.getItem('metasDate');

  if (dataPlano && dataPlano !== hoje) {
    planoDia = DEFAULT_PLAN.map(texto => ({ texto, feito: false }));
  } else if (planoSalvo !== null) {
    planoDia = carregarArrayLocalStorage('planoDia')
      .map(normalizarItemPlano)
      .filter(item => item.texto);
    if (!dataPlano) planoDia = planoDia.map(item => ({ ...item, feito: false }));
  } else {
    planoDia = DEFAULT_PLAN.map(texto => ({ texto, feito: false }));
  }

  if (dataMetas && dataMetas !== hoje) {
    metas = DEFAULT_GOALS.map(meta => ({ ...meta }));
  } else if (metasSalvas !== null) {
    metas = carregarArrayLocalStorage('metas')
      .map(normalizarMeta)
      .filter(meta => meta.texto);
    if (!dataMetas) metas = metas.map(meta => ({ ...meta, feito: false }));
  } else {
    metas = DEFAULT_GOALS.map(meta => ({ ...meta }));
  }

  localStorage.setItem('planoDiaDate', hoje);
  localStorage.setItem('metasDate', hoje);
  salvarPlanejamento();
  const dataLabel = el('plano-dia-data');
  if (dataLabel) {
    dataLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(new Date());
  }
  renderPlanoDia();
  renderMetas();
}

function renderPlanoDia() {
  const container = el("plano-dia-list");
  if (!container) return;

  container.innerHTML = planoDia.length
    ? planoDia.map((item, index) => `
      <li class="${item.feito ? 'study-item-done' : ''}">
        <label class="study-item-label">
          <input type="checkbox" data-plan-toggle="${index}" ${item.feito ? 'checked' : ''} aria-label="Concluir ${escapeHtml(item.texto)}">
          <span>${escapeHtml(item.texto)}</span>
        </label>
        <button type="button" class="study-item-remove" data-remove-plan="${index}" aria-label="Remover atividade ${escapeHtml(item.texto)}">×</button>
      </li>
    `).join("")
    : '<li class="empty-state">Adicione uma atividade para organizar seu dia.</li>';
}

function renderMetas() {
  const concluidas = metas.filter(meta => meta.feito).length;
  if (el("hero-meta")) el("hero-meta").textContent = `${concluidas}/${metas.length}`;
  if (el("metas-resumo")) el("metas-resumo").textContent = `${concluidas}/${metas.length}`;
  if (el("hero-dica")) {
    el("hero-dica").textContent = !metas.length
      ? 'Adicione uma meta para hoje.'
      : concluidas === metas.length
        ? 'Todas as metas de hoje concluídas!'
        : `Faltam ${metas.length - concluidas} meta(s) para hoje.`;
  }
  const container = el('metas-list');
  if (!container) return;
  container.innerHTML = metas.length
    ? metas.map((meta, index) => `
      <li class="${meta.feito ? 'study-item-done' : ''}">
        <label class="study-item-label">
          <input type="checkbox" data-goal-toggle="${index}" ${meta.feito ? 'checked' : ''} aria-label="Concluir meta ${escapeHtml(meta.texto)}">
          <span>${escapeHtml(meta.texto)}</span>
        </label>
        <button type="button" class="study-item-remove" data-remove-goal="${index}" aria-label="Remover meta ${escapeHtml(meta.texto)}">×</button>
      </li>
    `).join("")
    : '<li class="empty-state">Você ainda não adicionou metas para hoje.</li>';
}

function adicionarMeta() {
  el('meta-input')?.focus();
}

function adicionarMetaDoFormulario(event) {
  event.preventDefault();
  const input = el('meta-input');
  const texto = String(input?.value || '').trim().slice(0, 100);
  if (!texto) return;
  metas.push({ texto, feito: false, kind: tipoAutomaticoDaMeta(texto) });
  salvarPlanejamento();
  renderMetas();
  input.value = '';
  atualizarResumo();
}

function adicionarItemPlano(event) {
  event.preventDefault();
  const input = el('plano-dia-input');
  const texto = String(input?.value || '').trim().slice(0, 120);
  if (!texto) return;
  planoDia.push({ texto, feito: false });
  salvarPlanejamento();
  renderPlanoDia();
  input.value = '';
  atualizarResumo();
}

function alterarEstadoPlano(event) {
  const input = event.target.closest?.('[data-plan-toggle]');
  const index = Number(input?.dataset.planToggle);
  if (!input || !Number.isInteger(index) || !planoDia[index]) return;
  planoDia[index].feito = input.checked;
  salvarPlanejamento();
  renderPlanoDia();
  if (input.checked) recordStudyActivity('task');
  else atualizarResumo();
}

function alterarEstadoMeta(event) {
  const input = event.target.closest?.('[data-goal-toggle]');
  const index = Number(input?.dataset.goalToggle);
  if (!input || !Number.isInteger(index) || !metas[index]) return;
  metas[index].feito = input.checked;
  salvarPlanejamento();
  renderMetas();
  if (input.checked) recordStudyActivity('task');
  else atualizarResumo();
}

function removerItemPlano(event) {
  const button = event.target.closest?.('[data-remove-plan]');
  if (!button) return;
  const index = Number(button.dataset.removePlan);
  if (!Number.isInteger(index) || !planoDia[index]) return;
  planoDia.splice(index, 1);
  salvarPlanejamento();
  renderPlanoDia();
  atualizarResumo();
}

function removerMeta(event) {
  const button = event.target.closest?.('[data-remove-goal]');
  if (!button) return;
  const index = Number(button.dataset.removeGoal);
  if (!Number.isInteger(index) || !metas[index]) return;
  metas.splice(index, 1);
  salvarPlanejamento();
  renderMetas();
  atualizarResumo();
}

function concluirMetasPorTipo(kind) {
  let mudou = false;
  metas = metas.map(meta => {
    if (meta.kind !== kind || meta.feito) return meta;
    mudou = true;
    return { ...meta, feito: true };
  });
  if (mudou) {
    salvarPlanejamento();
    renderMetas();
    atualizarResumo();
  }
}

function salvarAtividades() {
  if (studyActivities.length > 5000) studyActivities = studyActivities.slice(-5000);
  localStorage.setItem(ACTIVITY_STORAGE_KEY, JSON.stringify(studyActivities));
  StudyProgress.scheduleSave();
}

function recordStudyActivity(kind, minutes = 0) {
  studyActivities.push({
    id: window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: StudyTracker.dateKey(),
    kind,
    minutes: Math.max(0, Math.min(1440, Math.round(Number(minutes) || 0)))
  });
  salvarAtividades();
  atualizarStreak();
  atualizarResumo();
  renderAcompanhamentoSemanal();
}

function renderAcompanhamentoSemanal() {
  const stats = obterResumoAtividades();
  const chart = el('weekly-chart');
  const summary = el('weekly-summary');
  const tip = el('weekly-tip');
  const maxSessions = Math.max(1, ...stats.week.days.map(day => day.sessions));

  if (chart) {
    chart.innerHTML = stats.week.days.map(day => {
      const height = day.sessions
        ? Math.max(12, Math.round((day.sessions / maxSessions) * 100))
        : day.active ? 8 : 0;
      return `
        <div class="weekly-day" title="${day.sessions} sessão(ões), ${day.minutes} min">
          <div class="weekly-day-track">
            <div class="weekly-day-fill ${day.active ? 'is-active' : ''}" style="height:${height}%"></div>
          </div>
          <span>${escapeHtml(day.label)}</span>
          <span class="weekly-day-count">${day.sessions}</span>
        </div>
      `;
    }).join('');
  }

  if (summary) {
    summary.textContent = `${stats.week.activeDays}/7 dias ativos · ${stats.week.sessions} sessões · ${stats.week.minutes} min registrados`;
  }
  if (tip) {
    tip.textContent = stats.week.activeDays === 7
      ? 'Excelente! Você estudou todos os dias desta semana.'
      : stats.week.activeDays
        ? `Você estudou em ${stats.week.activeDays} de 7 dias nesta semana. Continue no seu ritmo.`
        : 'Ainda sem sessões nesta semana. Inicie o modo foco ou registre uma sessão.';
  }
}

function atualizarResumo() {
  const stats = obterResumoAtividades();
  atualizarPainelEstatisticas();
  const resumo = el("resumo-hoje");
  if (!resumo) return;

  const metasConcluidas = metas.filter(meta => meta.feito).length;
  const planoConcluido = planoDia.filter(item => item.feito).length;
  const proximaAtividade = planoDia.find(item => !item.feito);
  const dica = proximaAtividade
    ? `Próximo passo: ${proximaAtividade.texto}`
    : planoDia.length
      ? 'Seu plano do dia está concluído. Bom trabalho!'
      : 'Adicione uma atividade ao plano do dia para começar.';

  resumo.innerHTML = `
    <div>📈 Metas de hoje: <strong>${metasConcluidas}/${metas.length}</strong></div>
    <div>🗓️ Plano do dia: <strong>${planoConcluido}/${planoDia.length}</strong></div>
    <div>⏱️ Hoje: <strong>${stats.today.sessions}</strong> sessão(ões) · <strong>${stats.today.minutes}</strong> min</div>
    <div>🔥 Sequência: <strong>${stats.streak}</strong> dia(s)</div>
    <div>💡 ${escapeHtml(dica)}</div>
  `;
}

function atualizarPainelEstatisticas() {
  const stats = obterResumoAtividades();
  const concluidas = metas.filter(meta => meta.feito).length;
  if (el("stat-sessoes")) el("stat-sessoes").textContent = stats.week.sessions;
  if (el("stat-metas")) el("stat-metas").textContent = `${concluidas}/${metas.length}`;
  if (el("stat-ritmo")) el("stat-ritmo").textContent = `${stats.streak} dias`;
}

function inicializarAcompanhamento() {
  renderAcompanhamentoSemanal();
  atualizarPainelEstatisticas();
}

function marcarSessao() {
  recordStudyActivity('manual', 25);
  mostrarToast('Sessão de 25 minutos registrada.');
}

function formatarTempoFoco() {
  const mins = String(Math.floor(focoSegundos / 60)).padStart(2, '0');
  const secs = String(focoSegundos % 60).padStart(2, '0');
  if (el('focus-timer')) el('focus-timer').textContent = `${mins}:${secs}`;
}

function atualizarControlesFoco() {
  const emAndamento = Boolean(focoTimer);
  const iniciar = el('iniciar-foco-btn');
  const pausar = el('pausar-foco-btn');
  const status = el('focus-status');
  if (iniciar) {
    iniciar.disabled = emAndamento;
    iniciar.textContent = emAndamento
      ? '⏱ Foco em andamento'
      : focoSegundos < FOCUS_DURATION_SECONDS
        ? 'Retomar foco'
        : '⏱ Iniciar foco 25 min';
  }
  if (pausar) pausar.disabled = !emAndamento;
  if (status) {
    status.textContent = emAndamento
      ? 'Sessão em andamento. Você pode pausar quando precisar.'
      : focoSegundos < FOCUS_DURATION_SECONDS
        ? 'Sessão pausada. Retome quando estiver pronto.'
        : 'Uma sessão de foco dura 25 minutos.';
  }
}

function salvarEstadoFoco() {
  localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(focoTimer
    ? { running: true, deadline: focoDeadline }
    : { running: false, remainingSeconds: focoSegundos }));
}

function atualizarRelogioFoco() {
  focoSegundos = Math.max(0, Math.ceil((focoDeadline - Date.now()) / 1000));
  formatarTempoFoco();
  if (focoSegundos <= 0) concluirModoFoco();
}

function iniciarRelogioFoco() {
  if (focoTimer) return;
  focoTimer = setInterval(atualizarRelogioFoco, 250);
  atualizarControlesFoco();
}

function inicializarModoFoco() {
  let estado = null;
  try {
    estado = JSON.parse(localStorage.getItem(FOCUS_STORAGE_KEY) || 'null');
  } catch (error) {
    console.warn('Estado do modo foco inválido; iniciando uma sessão nova.', error);
  }

  if (estado?.running && Number.isFinite(Number(estado.deadline))) {
    focoDeadline = Number(estado.deadline);
    focoSegundos = Math.max(0, Math.ceil((focoDeadline - Date.now()) / 1000));
    if (focoSegundos <= 0) {
      concluirModoFoco();
      return;
    }
    iniciarRelogioFoco();
  } else if (Number.isFinite(Number(estado?.remainingSeconds))) {
    focoSegundos = Math.max(0, Math.min(FOCUS_DURATION_SECONDS, Math.ceil(Number(estado.remainingSeconds))));
  }

  formatarTempoFoco();
  atualizarControlesFoco();
}

function iniciarModoFoco() {
  if (focoTimer) return;
  focoDeadline = Date.now() + focoSegundos * 1000;
  salvarEstadoFoco();
  iniciarRelogioFoco();
}

function pausarModoFoco() {
  if (!focoTimer) return;
  focoSegundos = Math.max(0, Math.ceil((focoDeadline - Date.now()) / 1000));
  clearInterval(focoTimer);
  focoTimer = null;
  focoDeadline = null;
  salvarEstadoFoco();
  formatarTempoFoco();
  atualizarControlesFoco();
}

function reiniciarModoFoco() {
  if (focoTimer) clearInterval(focoTimer);
  focoTimer = null;
  focoDeadline = null;
  focoSegundos = FOCUS_DURATION_SECONDS;
  salvarEstadoFoco();
  formatarTempoFoco();
  atualizarControlesFoco();
}

function concluirModoFoco() {
  if (focoTimer) clearInterval(focoTimer);
  focoTimer = null;
  focoDeadline = null;
  focoSegundos = FOCUS_DURATION_SECONDS;
  salvarEstadoFoco();
  formatarTempoFoco();
  atualizarControlesFoco();
  recordStudyActivity('focus', 25);
  mostrarToast('Sessão de foco concluída. Pausa merecida!');
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
