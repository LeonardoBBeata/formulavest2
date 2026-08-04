const API = window.location.origin;

if (!localStorage.getItem('token')) {
  window.location.href = '/login.html';
}

const state = {
  me: null,
  usuarios: [],
  provas: [],
  escolas: [],
  empresas: [],
  periodosByEscola: new Map(),
  salasByPeriodo: new Map(),
  buscaUsuarios: '',
  buscaProvas: ''
};

const adminRoles = ['formulavest_master', 'empresa_admin', 'diretor', 'coordenador'];

const roleLabels = {
  formulavest_master: 'Master',
  empresa_admin: 'Admin da empresa',
  diretor: 'Diretor',
  coordenador: 'Coordenador',
  professor: 'Professor',
  aluno: 'Aluno'
};

const roleOptions = ['aluno', 'professor', 'coordenador', 'diretor', 'empresa_admin'];

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function authHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

function setBusy(isBusy, label = 'Sincronizando') {
  const status = el('sync-status');
  if (status) status.textContent = isBusy ? label : 'Online';
  document.querySelectorAll('[data-refresh]').forEach((button) => {
    button.disabled = isBusy;
  });
}

function toast(message, type = 'success') {
  const box = el('toast');
  if (!box) return;

  box.textContent = message;
  box.className = `toast ${type === 'error' ? 'error' : ''}`;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => box.classList.add('hidden'), 3600);
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get('content-type') || '';
  let data = {};

  try {
    const rawBody = await response.text();
    data = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    data = {};
  }

  if (response.status === 401) {
    logout();
    throw new Error('Sessao expirada');
  }

  if (!response.ok) {
    throw new Error(data.error || 'Nao foi possivel concluir a operacao');
  }

  return data;
}

function mostrar(sectionId) {
  const section = el(sectionId);
  if (!section) return;

  document.querySelectorAll('.pagina').forEach((pagina) => pagina.classList.add('hidden'));
  section.classList.remove('hidden');

  document.querySelectorAll('[data-section]').forEach((button) => {
    button.classList.toggle('active', button.dataset.section === sectionId);
  });

  if (sectionId === 'usuarios') renderUsuarios();
  if (sectionId === 'professores') renderProfessores();

  const title = el('page-title');
  if (title) title.textContent = section.dataset.title || 'Central de gestao';
}

function formatRole(role) {
  return roleLabels[role] || role || 'Aluno';
}

function formatDate(value) {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sem data' : date.toLocaleDateString('pt-BR');
}

function usuarioEscola(usuario) {
  return state.escolas.find((escola) => Number(escola.id) === Number(usuario.escola_id));
}

function usuarioSala(usuario) {
  for (const salas of state.salasByPeriodo.values()) {
    const sala = salas.find((item) => Number(item.id) === Number(usuario.sala_id));
    if (sala) return sala;
  }
  return null;
}

function periodoDaSala(salaId) {
  for (const periodos of state.periodosByEscola.values()) {
    for (const periodo of periodos) {
      const salas = state.salasByPeriodo.get(Number(periodo.id)) || [];
      if (salas.some((sala) => Number(sala.id) === Number(salaId))) {
        return periodo;
      }
    }
  }
  return null;
}

function optionsHtml(items, selected, emptyLabel) {
  const empty = emptyLabel ? `<option value="">${emptyLabel}</option>` : '';
  return `${empty}${items.map((item) => `
    <option value="${item.id}" ${Number(item.id) === Number(selected) ? 'selected' : ''}>${escapeHtml(item.nome)}</option>
  `).join('')}`;
}

function salaOptionsHtml(salas, selectedIds = []) {
  const chosen = selectedIds.map((id) => Number(id));
  return salas.map((sala) => `
    <option value="${sala.id}" ${chosen.includes(Number(sala.id)) ? 'selected' : ''}>${escapeHtml(sala.periodo_nome || '')} — ${escapeHtml(sala.nome)}</option>
  `).join('');
}

function roleOptionsHtml(selected) {
  return roleOptions.map((role) => `
    <option value="${role}" ${role === selected ? 'selected' : ''}>${formatRole(role)}</option>
  `).join('');
}

function allPeriodos() {
  return [...state.periodosByEscola.values()].flat();
}

function allSalas() {
  return [...state.salasByPeriodo.values()].flat();
}

function renderRankingBars(data) {
  const container = el('ranking-bars');
  if (!container) return;

  const labels = data.labels || [];
  const values = data.values || [];

  if (!labels.length) {
    container.innerHTML = '<div class="empty-state">Ainda nao ha dados suficientes para montar o ranking.</div>';
    return;
  }

  const rows = labels.map((label, index) => ({
    label,
    value: Number(values[index] || 0)
  })).sort((a, b) => b.value - a.value);

  const max = Math.max(...rows.map((row) => row.value), 1);
  container.innerHTML = rows.slice(0, 8).map((row) => {
    const width = Math.max(6, (row.value / max) * 100);
    return `
      <div class="rank-row">
        <strong title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</strong>
        <div class="rank-bar"><div class="rank-fill" style="width:${width}%"></div></div>
        <span>${row.value}</span>
      </div>
    `;
  }).join('');
}

function toggleMasterViews(isMaster) {
  document.querySelectorAll('.master-only').forEach((element) => {
    element.classList.toggle('hidden', !isMaster);
  });
}

async function verificarAdmin() {
  const data = await request('/me');

  if (!adminRoles.includes(data.role)) {
    toast('Sem permissao para acessar o painel admin.', 'error');
    window.setTimeout(logout, 1000);
    return false;
  }

  state.me = data;
  el('admin-name').textContent = data.username || 'Administrador';
  el('admin-role').textContent = formatRole(data.role);
  toggleMasterViews(data.role === 'formulavest_master');
  return true;
}

async function carregarStats() {
  const data = await request('/admin/stats');
  el('totalProvas').textContent = data.totalProvas ?? 0;
  el('media').textContent = data.media ?? '0';
  renderRankingBars(data);
}

async function carregarUsuarios() {
  const data = await request('/admin/usuarios');
  state.usuarios = data.usuarios || [];
  el('totalUsuarios').textContent = state.usuarios.length;
  renderUsuarios();
  renderProfessores();
}

async function carregarProvas() {
  const data = await request('/admin/provas');
  state.provas = data.provas || [];
  renderProvas();
}

async function carregarEstrutura() {
  const data = await request('/admin/escolas');
  state.escolas = data.escolas || [];

  state.periodosByEscola.clear();
  state.salasByPeriodo.clear();

  await Promise.all(state.escolas.map(async (escola) => {
    try {
      const periodosData = await request(`/admin/periodos/${escola.id}`);
      const periodos = periodosData.periodos || [];
      state.periodosByEscola.set(Number(escola.id), periodos);

      await Promise.all(periodos.map(async (periodo) => {
        try {
          const salasData = await request(`/admin/salas/${periodo.id}`);
          state.salasByPeriodo.set(Number(periodo.id), salasData.salas || []);
        } catch {
          state.salasByPeriodo.set(Number(periodo.id), []);
        }
      }));
    } catch {
      state.periodosByEscola.set(Number(escola.id), []);
    }
  }));

  renderEstrutura();
  hydrateSelects();
  renderUsuarios();
}

async function carregarMasterStats() {
  const data = await request('/master/stats');
  const empresasEl = el('totalEmpresas');
  if (empresasEl) empresasEl.textContent = data.totalEmpresas ?? 0;
  el('totalUsuarios').textContent = data.totalUsuarios ?? 0;
  el('totalProvas').textContent = data.totalProvas ?? 0;
}

function hydrateEmpresasSelect() {
  const select = el('adminEmpresaId');
  if (!select) return;

  select.innerHTML = state.empresas.length
    ? `<option value="">Selecione a empresa</option>${state.empresas.map((empresa) => `
        <option value="${empresa.id}">#${empresa.id} - ${escapeHtml(empresa.nome)}</option>
      `).join('')}`
    : '<option value="">Crie uma empresa primeiro</option>';
}

function renderEmpresas() {
  const box = el('listaEmpresas');
  if (!box) return;

  el('empresas-count').textContent = `${state.empresas.length} empresas`;
  hydrateEmpresasSelect();

  if (!state.empresas.length) {
    box.innerHTML = '<div class="empty-state">Nenhuma empresa cadastrada ainda.</div>';
    return;
  }

  box.innerHTML = state.empresas.map((empresa) => `
    <article class="list-item">
      <div>
        <strong>${escapeHtml(empresa.nome)}</strong>
        <small>ID ${empresa.id}</small>
      </div>
      <div class="list-actions">
        <button class="btn btn-danger btn-small" data-excluir-empresa="${empresa.id}" type="button">Excluir</button>
      </div>
    </article>
  `).join('');
}

async function carregarEmpresas() {
  const data = await request('/master/empresas');
  state.empresas = data.empresas || [];
  renderEmpresas();
}

async function refreshAll() {
  try {
    setBusy(true);
    const tasks = [carregarStats(), carregarUsuarios(), carregarProvas(), carregarEstrutura()];

    if (state.me?.role === 'formulavest_master') {
      tasks.push(carregarMasterStats(), carregarEmpresas());
    }

    await Promise.all(tasks);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao atualizar painel', 'error');
  } finally {
    setBusy(false);
  }
}

async function criarEmpresa(event) {
  event.preventDefault();
  const nome = el('empresaNome').value.trim();

  try {
    await request('/master/criar-empresa', {
      method: 'POST',
      body: JSON.stringify({ nome })
    });
    event.target.reset();
    await refreshAll();
    toast('Empresa criada.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar empresa', 'error');
  }
}

async function excluirEmpresa(id) {
  if (!window.confirm('Excluir empresa? Todos os dados vinculados podem ser removidos.')) return;

  try {
    await request(`/master/empresa/${id}`, { method: 'DELETE' });
    await refreshAll();
    toast('Empresa excluida.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao excluir empresa', 'error');
  }
}

async function criarEmpresaAdmin(event) {
  event.preventDefault();
  const payload = {
    username: el('adminNome').value.trim(),
    email: el('adminEmail').value.trim(),
    senha: el('adminSenha').value,
    empresa_id: el('adminEmpresaId').value
  };

  try {
    await request('/master/criar-admin', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    event.target.reset();
    await refreshAll();
    toast('Admin criado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar admin', 'error');
  }
}

function renderUsuarios() {
  const box = el('listaUsuarios');
  if (!box) return;

  const alunos = state.usuarios.filter((usuario) => usuario.role === 'aluno');
  const term = state.buscaUsuarios.toLowerCase();
  const usuarios = alunos.filter((usuario) => {
    const text = `${usuario.username || ''} ${usuario.email || ''}`.toLowerCase();
    return text.includes(term);
  });

  el('usuarios-count').textContent = `${alunos.length} alunos`;
  const professorCount = state.usuarios.filter((usuario) => usuario.role === 'professor').length;
  if (el('professores-count')) el('professores-count').textContent = `${professorCount} professores`;

  if (!usuarios.length) {
    box.innerHTML = '<div class="empty-state">Nenhum usuario encontrado.</div>';
    return;
  }

  box.innerHTML = usuarios.map((usuario) => {
    const escola = usuarioEscola(usuario);
    const sala = usuarioSala(usuario);
    const periodo = usuario.sala_id ? periodoDaSala(usuario.sala_id) : null;
    const isBanned = Boolean(usuario.banido);

    return `
      <article class="list-item" data-user-card="${usuario.id}">
        <div>
          <strong>${escapeHtml(usuario.username || 'Sem nome')}</strong>
          <small>${escapeHtml(usuario.email || 'Sem email')}</small>
          <small>
            ${escapeHtml(escola?.nome || 'Sem escola')} ·
            ${escapeHtml(periodo?.nome || 'Sem periodo')} ·
            ${escapeHtml(sala?.nome || 'Sem sala')}
          </small>
        </div>
        <div class="list-actions">
          <span class="badge ${usuario.role || 'aluno'}">${formatRole(usuario.role)}</span>
          ${isBanned ? '<span class="badge warn">Banido</span>' : '<span class="badge">Ativo</span>'}
          <button class="btn btn-danger btn-small" type="button" data-banir="${usuario.id}">${isBanned ? 'Desbanir' : 'Banir'}</button>
          <button class="btn btn-danger btn-small" type="button" data-excluir="${usuario.id}">Excluir</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderProfessores() {
  const box = el('listaProfessores');
  if (!box) return;

  const term = (el('buscaProfessores')?.value || '').toLowerCase();
  const professores = state.usuarios.filter((usuario) => usuario.role === 'professor');
  const filtered = professores.filter((usuario) => {
    const escola = usuarioEscola(usuario)?.nome || '';
    const sala = usuarioSala(usuario)?.nome || '';
    const text = `${usuario.username || ''} ${usuario.email || ''} ${escola} ${sala}`.toLowerCase();
    return text.includes(term);
  });

  el('professores-count').textContent = `${professores.length} professores`;

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state">Nenhum professor encontrado.</div>';
    return;
  }

  box.innerHTML = filtered.map((usuario) => {
    const escola = usuarioEscola(usuario);
    const sala = usuarioSala(usuario);
    const periodo = usuario.sala_id ? periodoDaSala(usuario.sala_id) : null;
    const assignedSalas = Array.isArray(usuario.assigned_salas) ? usuario.assigned_salas : [];

    return `
      <article class="list-item" data-user-card="${usuario.id}">
        <div>
          <strong>${escapeHtml(usuario.username || 'Sem nome')}</strong>
          <small>${escapeHtml(usuario.email || 'Sem email')}</small>
          <small>${escapeHtml(escola?.nome || 'Sem escola')} · ${escapeHtml(periodo?.nome || 'Sem periodo')}</small>
          <div class="badge-row">
            ${assignedSalas.length ? assignedSalas.map((s) => `
              <span class="badge-sala">
                ${escapeHtml(s.periodo_nome || '')} — ${escapeHtml(s.nome)}
                <button type="button" class="badge-sala-remove" data-remove-assignment="${usuario.id}|${s.id}" aria-label="Remover sala">&times;</button>
              </span>
            `).join('') : '<span class="badge-sala">Nenhuma sala atribuída</span>'}
          </div>
        </div>
        <div class="list-actions">
          <button class="btn btn-secondary btn-small" type="button" data-edit-user="${usuario.id}">Editar</button>
        </div>
      </article>
    `;
  }).join('');
}

function renderUserEditor(id) {
  const usuario = state.usuarios.find((item) => Number(item.id) === Number(id));
  const card = document.querySelector(`[data-user-card="${id}"]`);
  if (!usuario || !card) return;

  const existing = card.querySelector('.inline-edit');
  if (existing) {
    existing.remove();
    return;
  }

  document.querySelectorAll('[data-user-card] .inline-edit').forEach((form) => form.remove());

  const periodos = usuario.escola_id ? (state.periodosByEscola.get(Number(usuario.escola_id)) || []) : allPeriodos();
  const periodo = periodoDaSala(usuario.sala_id);
  const salas = periodo ? (state.salasByPeriodo.get(Number(periodo.id)) || []) : allSalas();
  const assignedSalas = Array.isArray(usuario.assigned_salas) ? usuario.assigned_salas : [];

  card.insertAdjacentHTML('beforeend', `
    <form class="inline-edit" data-user-edit="${usuario.id}">
      <label>
        <span>Nome</span>
        <input name="username" value="${escapeHtml(usuario.username || '')}" required minlength="3" />
      </label>
      <label>
        <span>Email</span>
        <input name="email" type="email" value="${escapeHtml(usuario.email || '')}" required />
      </label>
      <label>
        <span>Funcao</span>
        <select name="role">${roleOptionsHtml(usuario.role)}</select>
      </label>
      <label>
        <span>Escola</span>
        <select name="escola_id">${optionsHtml(state.escolas, usuario.escola_id, 'Sem escola')}</select>
      </label>
      <label>
        <span>Sala</span>
        <select name="sala_id">${optionsHtml(salas, usuario.sala_id, 'Sem sala')}</select>
      </label>
      <label>
        <span>Salas atribuídas</span>
        <select name="sala_ids" multiple size="4">${salaOptionsHtml(allSalas(), assignedSalas.map((item) => item.id))}</select>
        <small>Use Ctrl / Cmd para selecionar múltiplas salas.</small>
      </label>
      <label>
        <span>Nova senha</span>
        <input name="senha" type="password" placeholder="Deixe vazio para manter" minlength="8" />
      </label>
      <div class="form-actions wide">
        <button class="btn btn-primary" type="submit">Salvar alteracoes</button>
      </div>
    </form>
  `);
}

async function criarUsuario(event) {
  event.preventDefault();
  const payload = {
    username: el('novoNome').value.trim(),
    email: el('novoEmail').value.trim(),
    senha: el('novaSenha').value,
    role: el('novoRole').value,
    escola_id: el('novoEscola').value || null,
    sala_id: el('novoSala').value || null
  };

  try {
    await request('/admin/criar-usuario', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    event.target.reset();
    await carregarUsuarios();
    toast('Usuario criado com sucesso.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar usuario', 'error');
  }
}

async function salvarUsuario(event) {
  event.preventDefault();
  const form = event.target;
  const id = form.dataset.userEdit;
  const data = new FormData(form);
  const senha = data.get('senha');
  const salaIds = Array.from(form.querySelector('[name="sala_ids"]')?.selectedOptions || []).map((option) => option.value).filter(Boolean);

  const payload = {
    username: String(data.get('username') || '').trim(),
    email: String(data.get('email') || '').trim(),
    role: data.get('role'),
    escola_id: data.get('escola_id') || null,
    sala_id: data.get('sala_id') || null,
    sala_ids: salaIds
  };

  if (senha) payload.senha = senha;

  try {
    await request(`/admin/usuario/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    await carregarUsuarios();
    toast('Usuario atualizado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao editar usuario', 'error');
  }
}

async function removerSalaAtribuida(payload) {
  const [usuarioId, salaId] = payload.split('|').map(Number);
  if (!usuarioId || !salaId) return;

  const usuario = state.usuarios.find((item) => Number(item.id) === Number(usuarioId));
  if (!usuario) return;

  const assignedSalas = Array.isArray(usuario.assigned_salas) ? usuario.assigned_salas.map((item) => Number(item.id)) : [];
  const nextAssigned = assignedSalas.filter((id) => id !== Number(salaId));

  try {
    await request(`/admin/usuario/${usuarioId}`, {
      method: 'PUT',
      body: JSON.stringify({
        username: usuario.username,
        email: usuario.email,
        role: usuario.role,
        escola_id: usuario.escola_id || null,
        sala_id: usuario.sala_id || null,
        sala_ids: nextAssigned
      })
    });
    await carregarUsuarios();
    toast('Sala removida do professor.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao remover sala atribuída', 'error');
  }
}

async function banirUsuario(id) {
  try {
    await request(`/admin/usuario/${id}/banir`, { method: 'PUT' });
    await carregarUsuarios();
    toast('Status do usuario atualizado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao alterar status', 'error');
  }
}

async function excluirUsuario(id) {
  if (!window.confirm('Deseja excluir este usuario?')) return;

  try {
    await request(`/admin/usuario/${id}`, { method: 'DELETE' });
    await carregarUsuarios();
    toast('Usuario excluido.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao excluir usuario', 'error');
  }
}

function renderProvas() {
  const box = el('listaProvas');
  if (!box) return;

  const term = state.buscaProvas.toLowerCase();
  const provas = state.provas.filter((prova) => {
    const title = prova.titulo || `Prova #${prova.id || ''}`;
    const text = `${title} ${prova.username || ''}`.toLowerCase();
    return text.includes(term);
  });

  el('provas-count').textContent = `${state.provas.length} provas`;

  if (!provas.length) {
    box.innerHTML = '<div class="empty-state">Nenhuma prova registrada ate o momento.</div>';
    return;
  }

  box.innerHTML = provas.map((prova) => {
    const percentual = Number(prova.percentual || 0);
    const title = prova.titulo || `Prova #${prova.id}`;
    return `
      <article class="list-item">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <small>${escapeHtml(prova.username || 'Usuario')}</small>
          <small>${prova.acertos ?? 0}/${prova.total ?? 0} acertos · ${percentual.toFixed(1)}%</small>
        </div>
        <span class="badge">${formatDate(prova.criado_em || prova.data)}</span>
      </article>
    `;
  }).join('');
}

function renderEstrutura() {
  const box = el('listaEstrutura');
  if (!box) return;

  el('escolas-count').textContent = `${state.escolas.length} escolas`;

  if (!state.escolas.length) {
    box.innerHTML = '<div class="empty-state">Nenhuma escola cadastrada ainda.</div>';
    return;
  }

  box.innerHTML = state.escolas.map((escola) => {
    const periodos = state.periodosByEscola.get(Number(escola.id)) || [];
    const periodosHtml = periodos.length
      ? periodos.map((periodo) => {
        const salas = state.salasByPeriodo.get(Number(periodo.id)) || [];
        const salasHtml = salas.length
          ? salas.map((sala) => `
              <div class="nested-item" data-sala-card="${sala.id}">
                <div class="structure-head">
                  <div>
                    <strong>${escapeHtml(sala.nome)}</strong>
                  </div>
                  <button class="btn btn-secondary btn-small" type="button" data-edit-sala="${sala.id}">Editar</button>
                </div>
              </div>
            `).join('')
          : '<div class="nested-item"><small>Nenhuma sala.</small></div>';

        return `
          <div class="nested-item" data-periodo-card="${periodo.id}">
            <div class="structure-head">
              <div>
                <strong>${escapeHtml(periodo.nome)}</strong>
                <small>${salas.length ? `${salas.length} sala(s)` : 'Nenhuma sala'}</small>
              </div>
              <button class="btn btn-secondary btn-small" type="button" data-edit-periodo="${periodo.id}">Editar</button>
            </div>
            <div class="nested-list">${salasHtml}</div>
          </div>
        `;
      }).join('')
      : '<div class="nested-item"><small>Nenhum periodo cadastrado.</small></div>';

    return `
      <article class="structure-card" data-escola-card="${escola.id}">
        <div class="structure-head">
          <div>
            <strong>${escapeHtml(escola.nome)}</strong>
            <small>ID ${escola.id}</small>
          </div>
          <button class="btn btn-secondary btn-small" type="button" data-edit-escola="${escola.id}">Editar</button>
        </div>
        <div class="nested-list">${periodosHtml}</div>
      </article>
    `;
  }).join('');
}

function hydrateSelects() {
  const escolasOptions = optionsHtml(state.escolas, '', 'Sem escola');
  const escolasRequired = optionsHtml(state.escolas, '', state.escolas.length ? 'Selecione a escola' : 'Cadastre uma escola');
  const periodos = allPeriodos();
  const salas = allSalas();

  el('novoEscola').innerHTML = escolasOptions;
  el('periodoEscola').innerHTML = escolasRequired;
  el('salaPeriodo').innerHTML = optionsHtml(periodos, '', periodos.length ? 'Selecione o periodo' : 'Cadastre um periodo');
  el('novoSala').innerHTML = optionsHtml(salas, '', 'Sem sala');
  hydrateAlunoSelects();
}

function hydrateAlunoSelects() {
  const periodoSelect = el('alunoPeriodo');
  const salaSelect = el('alunoSala');
  if (!periodoSelect || !salaSelect) return;

  const periodos = allPeriodos();
  const periodoSelecionado = periodoSelect.value || '';
  const salas = periodoSelecionado
    ? (state.salasByPeriodo.get(Number(periodoSelecionado)) || [])
    : [];

  periodoSelect.innerHTML = optionsHtml(periodos, periodoSelecionado, periodos.length ? 'Selecione o periodo' : 'Cadastre um periodo');
  salaSelect.innerHTML = optionsHtml(salas, '', salas.length ? 'Selecione a sala' : 'Sem sala');
}

function normalizeHeader(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => String(cell).trim())) {
        rows.push(row);
      }
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    if (row.some((cell) => String(cell).trim())) {
      rows.push(row);
    }
  }

  return rows;
}

function getCsvValue(headers, row, aliases) {
  const headerIndex = headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
  return headerIndex >= 0 ? (row[headerIndex] || '').trim() : '';
}

async function criarEscola(event) {
  event.preventDefault();
  const nome = el('nomeEscola').value.trim();

  try {
    await request('/admin/criar-escola', {
      method: 'POST',
      body: JSON.stringify({ nome })
    });
    event.target.reset();
    await carregarEstrutura();
    toast('Escola criada.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar escola', 'error');
  }
}

async function criarPeriodo(event) {
  event.preventDefault();
  const escola_id = el('periodoEscola').value;
  const nome = el('nomePeriodo').value.trim();

  try {
    await request('/admin/criar-periodo', {
      method: 'POST',
      body: JSON.stringify({ escola_id, nome })
    });
    event.target.reset();
    await carregarEstrutura();
    toast('Periodo criado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar periodo', 'error');
  }
}

async function criarSala(event) {
  event.preventDefault();
  const periodo_id = el('salaPeriodo').value;
  const nome = el('nomeSala').value.trim();

  try {
    await request('/admin/criar-sala', {
      method: 'POST',
      body: JSON.stringify({ periodo_id, nome })
    });
    event.target.reset();
    await carregarEstrutura();
    toast('Sala criada.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar sala', 'error');
  }
}

async function criarAluno(event) {
  event.preventDefault();
  const payload = {
    nome: el('alunoNome').value.trim(),
    email: el('alunoEmail').value.trim(),
    senha: el('alunoSenha').value,
    periodo_id: el('alunoPeriodo').value || null,
    sala_id: el('alunoSala').value || null
  };

  try {
    await request('/admin/criar-aluno', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    event.target.reset();
    hydrateAlunoSelects();
    await carregarUsuarios();
    toast('Aluno criado com sucesso.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar aluno', 'error');
  }
}

async function importarAlunos(event) {
  event.preventDefault();
  const file = el('arquivoAlunos').files?.[0];
  if (!file) {
    toast('Selecione um arquivo CSV.', 'error');
    return;
  }

  try {
    const text = await file.text();
    const rows = parseCsv(text);

    if (!rows.length) {
      throw new Error('Arquivo vazio');
    }

    const headers = rows[0];
    const alunos = rows.slice(1)
      .filter((row) => row.some((cell) => String(cell).trim()))
      .map((row) => ({
        nome: getCsvValue(headers, row, ['nomedoaluno', 'nomealuno', 'nome', 'aluno']),
        periodo: getCsvValue(headers, row, ['periodo', 'periodoescolar', 'periodoescolar']),
        sala: getCsvValue(headers, row, ['sala', 'turma']),
        email: getCsvValue(headers, row, ['email']),
        senha: getCsvValue(headers, row, ['senha'])
      }))
      .filter((aluno) => aluno.nome && aluno.periodo && aluno.sala);

    if (!alunos.length) {
      throw new Error('Nenhum aluno válido encontrado na planilha');
    }

    const data = await request('/admin/importar-alunos', {
      method: 'POST',
      body: JSON.stringify({ alunos })
    });

    event.target.reset();
    await carregarUsuarios();
    toast(data.erros?.length ? `Importacao concluida. ${data.criados} alunos criados e ${data.erros.length} linhas com erro.` : `Importacao concluida. ${data.criados} alunos criados.`);
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao importar alunos', 'error');
  }
}

function renderNameEditor(type, id) {
  const selector = type === 'escola'
    ? `[data-escola-card="${id}"]`
    : type === 'periodo'
      ? `[data-periodo-card="${id}"]`
      : `[data-sala-card="${id}"]`;
  const card = document.querySelector(selector);
  if (!card) return;

  const existing = card.querySelector(':scope > .inline-edit');
  if (existing) {
    existing.remove();
    return;
  }

  const source = type === 'escola'
    ? state.escolas.find((item) => Number(item.id) === Number(id))
    : type === 'periodo'
      ? allPeriodos().find((item) => Number(item.id) === Number(id))
      : allSalas().find((item) => Number(item.id) === Number(id));

  if (!source) return;

  card.insertAdjacentHTML('beforeend', `
    <form class="inline-edit full" data-name-edit="${type}" data-id="${id}">
      <label>
        <span>Novo nome</span>
        <input name="nome" value="${escapeHtml(source.nome)}" required minlength="2" />
      </label>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">Salvar</button>
      </div>
    </form>
  `);
}

async function salvarNome(event) {
  event.preventDefault();
  const form = event.target;
  const type = form.dataset.nameEdit;
  const id = form.dataset.id;
  const nome = new FormData(form).get('nome').trim();
  const path = type === 'escola'
    ? `/admin/escola/${id}`
    : type === 'periodo'
      ? `/admin/periodo/${id}`
      : `/admin/sala/${id}`;

  try {
    await request(path, {
      method: 'PUT',
      body: JSON.stringify({ nome })
    });
    await carregarEstrutura();
    toast('Registro atualizado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao atualizar', 'error');
  }
}

function bindEvents() {
  document.querySelectorAll('.nav-btn, .quick-item').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.section) mostrar(button.dataset.section);
    });
  });

  el('logout-btn')?.addEventListener('click', logout);
  el('form-criar-usuario')?.addEventListener('submit', criarUsuario);
  el('form-criar-escola')?.addEventListener('submit', criarEscola);
  el('form-criar-periodo')?.addEventListener('submit', criarPeriodo);
  el('form-criar-sala')?.addEventListener('submit', criarSala);
  el('form-criar-empresa')?.addEventListener('submit', criarEmpresa);
  el('form-criar-admin')?.addEventListener('submit', criarEmpresaAdmin);

  el('buscaUsuarios')?.addEventListener('input', (event) => {
    state.buscaUsuarios = event.target.value;
    renderUsuarios();
  });

  el('buscaProvas')?.addEventListener('input', (event) => {
    state.buscaProvas = event.target.value;
    renderProvas();
  });

  el('novoEscola')?.addEventListener('change', (event) => {
    const escolaId = event.target.value;
    const periodos = escolaId ? (state.periodosByEscola.get(Number(escolaId)) || []) : allPeriodos();
    const salas = periodos.flatMap((periodo) => state.salasByPeriodo.get(Number(periodo.id)) || []);
    el('novoSala').innerHTML = optionsHtml(salas, '', 'Sem sala');
  });

  el('alunoPeriodo')?.addEventListener('change', hydrateAlunoSelects);
  el('form-criar-aluno')?.addEventListener('submit', criarAluno);
  el('form-importar-alunos')?.addEventListener('submit', importarAlunos);
  el('buscaProfessores')?.addEventListener('input', () => renderProfessores());

  document.querySelector('[data-refresh]')?.addEventListener('click', refreshAll);

  document.addEventListener('submit', (event) => {
    if (event.target.matches('[data-user-edit]')) salvarUsuario(event);
    if (event.target.matches('[data-name-edit]')) salvarNome(event);
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    const editUser = target.getAttribute('data-edit-user');
    const banirId = target.getAttribute('data-banir');
    const excluirId = target.getAttribute('data-excluir');
    const editEscola = target.getAttribute('data-edit-escola');
    const editPeriodo = target.getAttribute('data-edit-periodo');
    const editSala = target.getAttribute('data-edit-sala');
    const removeAssignment = target.getAttribute('data-remove-assignment');
    const excluirEmpresaId = target.getAttribute('data-excluir-empresa');

    if (removeAssignment) return removerSalaAtribuida(removeAssignment);
    if (editUser) renderUserEditor(editUser);
    if (banirId) banirUsuario(banirId);
    if (excluirId) excluirUsuario(excluirId);
    if (editEscola) renderNameEditor('escola', editEscola);
    if (editPeriodo) renderNameEditor('periodo', editPeriodo);
    if (editSala) renderNameEditor('sala', editSala);
    if (excluirEmpresaId) excluirEmpresa(excluirEmpresaId);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();

  try {
    setBusy(true, 'Validando');
    const autorizado = await verificarAdmin();
    if (!autorizado) return;
    await refreshAll();
    mostrar('dashboard');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao abrir painel admin', 'error');
  } finally {
    setBusy(false);
  }
});
