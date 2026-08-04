const API = window.location.origin;
const token = localStorage.getItem("token");

if (!token) window.location.href = "/login.html";

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
let menuLateralEncolhido = localStorage.getItem("sidebarCollapsed") === "true";

// ======================
// INIT
// ======================
window.addEventListener("DOMContentLoaded", () => {
  aplicarTema(temaAtual);
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
    });
  });
}

// ======================
// BOTÕES
// ======================
function configurarBotoes() {
  el("gerar-enem-btn")?.addEventListener("click", gerarEnem);
  el("gerar-provao-btn")?.addEventListener("click", gerarProvao);

  el("finalizar-enem-btn")?.addEventListener("click", salvarResultado);
  el("finalizar-provao-btn")?.addEventListener("click", salvarResultado);

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
    const res = await fetch(`${API}/me/conquistas`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = await res.json();
    const container = el('conquistas-container');
    if (!container) return;
    const c = data.conquistas || {};
    const hist = data.historico || [];
    container.innerHTML = `
      <div class="card">
        <h3>Sua evolução</h3>
        <p>Streak: <strong>${c.streak_days || 0}</strong> dias</p>
        <p>Nível: <strong>${data.nivel || 1}</strong></p>
        <p>Provas: <strong>${data.total || 0}</strong></p>
      </div>
      <div class="card">
        <h4>Conquistas</h4>
        <ul>
          <li>Primeira prova: ${c.primeira_prova ? '✅' : '❌'}</li>
          <li>10 provas: ${c.dez_provas ? '✅' : '❌'}</li>
          <li>50 provas: ${c.cinquenta_provas ? '✅' : '❌'}</li>
          <li>Nível 10: ${c.nivel_10 ? '✅' : '❌'}</li>
        </ul>
      </div>
      <div class="card">
        <h4>Histórico</h4>
        ${hist.length ? ('<ul>' + hist.map(h => `<li><strong>${h.titulo}</strong> — ${h.descricao} <small>(${new Date(h.criado_em).toLocaleString()})</small></li>`).join('') + '</ul>') : '<p>Sem histórico ainda.</p>'}
      </div>
    `;
    // detect new unlocks and notify
    try {
      const seenKey = 'conquistas_seen_v1';
      const seen = JSON.parse(sessionStorage.getItem(seenKey) || '[]');
      const unlocked = [];
      if (c.primeira_prova && !seen.includes('primeira_prova')) unlocked.push('Primeira prova');
      if (c.dez_provas && !seen.includes('dez_provas')) unlocked.push('10 provas');
      if (c.cinquenta_provas && !seen.includes('cinquenta_provas')) unlocked.push('50 provas');
      if (c.nivel_10 && !seen.includes('nivel_10')) unlocked.push('Nível 10');
      if (c.streak_7 && !seen.includes('streak_7')) unlocked.push('Streak 7 dias');
      if (unlocked.length) {
        mostrarToast('Nova conquista: ' + unlocked.join(', '));
        if (Notification && Notification.permission === 'granted') {
          new Notification('FórmulaVest', { body: 'Nova conquista: ' + unlocked.join(', ') });
        }
      }
      const nowSeen = new Set(seen);
      if (c.primeira_prova) nowSeen.add('primeira_prova');
      if (c.dez_provas) nowSeen.add('dez_provas');
      if (c.cinquenta_provas) nowSeen.add('cinquenta_provas');
      if (c.nivel_10) nowSeen.add('nivel_10');
      if (c.streak_7) nowSeen.add('streak_7');
      sessionStorage.setItem(seenKey, JSON.stringify(Array.from(nowSeen)));
    } catch (e) { console.warn('conquistas notify', e); }
  } catch (err) {
    console.error('Erro carregar conquistas', err);
  }
}

async function configurarAcessoProfessor() {
  const linkProfessor = el("link-professor");
  if (!linkProfessor) return;

  if (!token) {
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
    const provas = Array.isArray(data.provas) ? data.provas : [];
    const total = provas.length;

    const media =
      total > 0
        ? (provas.reduce((a, p) => a + Number(p.acertos || 0), 0) / total).toFixed(1)
        : 0;

    const melhor =
      total > 0
        ? Math.max(...provas.map(p => Number(p.acertos || 0)))
        : 0;

    const container = el("dashboard-container");
    if (container) {
      container.innerHTML = `
        <div class="card">
          <p>Total de provas: ${total}</p>
          <p>Média de acertos: ${media}</p>
          <p>Melhor score: ${melhor}</p>
        </div>
      `;
    }

    if (el("nivel-user")) el("nivel-user").innerText = data.user?.nivel ?? 1;
    if (el("xp-total")) el("xp-total").innerText = data.user?.xp ?? 0;
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
            <h3>${i + 1}º ${u.username || u.nome || 'Usuário'}</h3>
            <p>${u.xp || 0} XP</p>
          </div>
        `).join("")
        : '<div class="card"><p>Ainda não há dados de ranking.</p></div>';
    }

    if (el("ranking-list")) {
      el("ranking-list").innerHTML = data.length
        ? data.map((u, i) => `
          <div>${i + 1} - ${u.username || u.nome || 'Usuário'} | ${u.xp || 0} XP</div>
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
  const res = await fetch(`${API}/dashboard`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();

  const provas = data.provas || [];

  const labels = provas.map((_, i) => `Prova ${i + 1}`);
  const acertos = provas.map(p => p.acertos);

  const ctx = el("graficoEvolucao");
  if (!ctx) return;

  if (grafico) grafico.destroy();

  grafico = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Acertos por prova",
        data: acertos,
        borderWidth: 2,
        tension: 0.3
      }]
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

// ======================
// PROVAS
// ======================
async function gerarEnem() {
  const res = await fetch(`${API}/gerar-enem`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();

  questoes = data.questoes;
  provaId = data.prova_id;
  respostasUser = {};

  renderProva(data.questoes, "enem-container", "finalizar-enem-btn");
}

async function gerarProvao() {
  const res = await fetch(`${API}/gerar-provao`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await res.json();

  questoes = data.questoes;
  provaId = data.prova_id;
  respostasUser = {};

  renderProva(data.questoes, "provao-container", "finalizar-provao-btn");
}

// ======================
// RENDER PROVA
// ======================
function renderProva(lista, containerId, btnFinalizar) {
  const container = el(containerId);
  container.innerHTML = "";

  lista.forEach((q, i) => {
    container.innerHTML += `
      <div class="questao">
        <p><b>Q${i + 1}</b> ${q.enunciado}</p>

        ${Object.entries(q.opcoes).map(([l, t]) => `
          <div onclick="selecionar(${i}, '${l}', this)">
            ${l}) ${t}
          </div>
        `).join("")}
      </div>
    `;
  });

  el(btnFinalizar)?.classList.remove("hidden");
}

// ======================
// SELEÇÃO
// ======================
function selecionar(index, letra, elClicked) {
  if (respostasUser[index] !== undefined) return;

  respostasUser[index] = letra;

  const all = elClicked.parentElement.querySelectorAll("div");

  all.forEach(a => {
    a.onclick = null;
    a.style.opacity = a === elClicked ? "1" : "0.4";
  });
}

// ======================
// SALVAR RESULTADO
// ======================
async function salvarResultado() {
  try {
    const respostas = questoes.map((q, i) => ({
      correta: q.correta,
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

    const finalScreen = el("final-screen");
    const finalText = el("final-text");

    if (finalScreen) finalScreen.classList.remove("hidden");
    if (finalText) {
      finalText.innerHTML = `
        <p>Acertos: ${data.acertos ?? 0}</p>
        <p>Percentual: ${(Number(data.percentual) || 0).toFixed(1)}%</p>
      `;
    }

    await carregarDashboard();
    await carregarRanking();
    await carregarGrafico();
  } catch (error) {
    console.error(error);
    mostrarToast('Não foi possível salvar a prova. Tente novamente.');
  }
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

  renderPlanoDia();
  renderMetas();
}

function renderPlanoDia() {
  const container = el("plano-dia-list");
  if (!container) return;

  container.innerHTML = planoDia.map(item => `<li>✓ ${item}</li>`).join("");
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
  const precisao = Math.min(100, Math.round((concluidas / total) * 100));
  const streak = Number(localStorage.getItem("streak") || 0);

  el("stat-sessoes").innerText = sessoes;
  el("stat-metas").innerText = `${concluidas}/${total}`;
  el("stat-acertos").innerText = `${precisao}%`;
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
  temaAtual = temaAtual === "dark" ? "light" : "dark";
  localStorage.setItem("theme", temaAtual);
  aplicarTema(temaAtual);
}

function aplicarTema(theme) {
  document.body.classList.toggle("light-theme", theme === "light");
  const button = el("theme-toggle");
  if (button) {
    button.innerText = theme === "light" ? "☀️ Claro" : "🌙 Escuro";
  }
}

function inicializarNotificacoes() {
  const pill = el("notif-status");
  const summary = el("reminder-summary");
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
  el("logout-btn")?.addEventListener("click", () => {
    localStorage.removeItem("token");
    window.location.href = "/login.html";
  });
}
