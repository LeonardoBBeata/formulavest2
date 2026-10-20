const API = window.location.origin;

if (localStorage.getItem('auth_session') !== '1') {
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
  buscaProvas: '',
  ordenacaoUsuarios: 'nome_az',
  ordenacaoProfessores: 'nome_az',
  filtrosUsuarios: {
    role: 'todos',
    status: 'todos',
    empresa_id: 'todos',
    escola_id: 'todos'
  }
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
  return {
    'Content-Type': 'application/json'
  };
}

async function logout() {
  await fetch('/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  localStorage.removeItem('auth_session');
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

function normalizeDisplayName(usuario) {
  const raw = String(usuario?.username || '').trim();
  const fallback = formatRole(usuario?.role) || 'Usuário';

  if (!raw) return `${fallback} ${usuario?.id ?? ''}`.trim();

  const technicalPatterns = [
    /^(aluno|professor|diretor|coordenador|empresa_admin|formulavest_master|usuario|user)(?:_editado)?_(?:[a-z0-9-]+|\d{6,})$/i,
    /^(aluno|professor|diretor|coordenador|empresa_admin|formulavest_master|usuario|user)_[a-z0-9-]+$/i,
    /^teste_[a-z0-9-]+$/i,
    /^aluno_editado_[a-z0-9-]+$/i
  ];

  if (technicalPatterns.some((pattern) => pattern.test(raw))) {
    return fallback;
  }

  return raw.replace(/\s*\[registro-\d+\]$/i, '').trim() || `${fallback} ${usuario?.id ?? ''}`.trim();
}

function canEditUser(usuario) {
  if (!state.me || !usuario || Number(state.me.id) === Number(usuario.id)) return false;
  if (state.me.role === 'formulavest_master') return usuario.role !== 'formulavest_master';

  const roleLevel = { formulavest_master: 5, empresa_admin: 4, diretor: 3, coordenador: 2, professor: 1, aluno: 0 };
  if (Number(usuario.empresa_id) !== Number(state.me.empresa_id)) return false;
  if (['diretor', 'coordenador'].includes(state.me.role) && Number(usuario.escola_id) !== Number(state.me.escola_id)) return false;
  if (state.me.role === 'coordenador' && !['professor', 'aluno'].includes(usuario.role)) return false;
  return (roleLevel[state.me.role] || 0) > (roleLevel[usuario.role] || 0);
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

function salasPermitidasParaUsuario(usuario) {
  return allSalas().filter((sala) => {
    const periodo = periodoDaSala(sala.id);
    const escola = state.escolas.find((item) => Number(item.id) === Number(periodo?.escola_id));
    if (!escola) return false;
    if (state.me?.role === 'formulavest_master') return true;
    if (Number(escola.empresa_id) !== Number(state.me?.empresa_id)) return false;
    if (['diretor', 'coordenador'].includes(state.me?.role)) {
      return Number(escola.id) === Number(state.me?.escola_id);
    }
    return true;
  });
}

function optionsHtml(items, selected, emptyLabel) {
  const empty = emptyLabel ? `<option value="">${escapeHtml(emptyLabel)}</option>` : '';
  return `${empty}${items.map((item) => {
    const isSelected = String(item.id) === String(selected) || (selected !== '' && item.id !== undefined && item.id !== null && Number(item.id) === Number(selected));
    return `
      <option value="${item.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(item.nome)}</option>
    `;
  }).join('')}`;
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

function escolasComEmpresa(escolas = state.escolas) {
  return escolas.map((escola) => ({
    ...escola,
    nome: escola.empresa_nome ? `${escola.empresa_nome} — ${escola.nome}` : escola.nome
  }));
}

function salasDaEscola(escolaId) {
  const periodos = state.periodosByEscola.get(Number(escolaId)) || [];
  return periodos.flatMap((periodo) => (state.salasByPeriodo.get(Number(periodo.id)) || []).map((sala) => ({
    ...sala,
    nome: `${periodo.nome} — ${sala.nome}`
  })));
}

function atualizarHierarquiaNovoUsuario(resetEscola = false) {
  const empresaSelect = el('novoEmpresa');
  const escolaSelect = el('novoEscola');
  const salaSelect = el('novoSala');
  if (!escolaSelect || !salaSelect) return;

  const isMaster = state.me?.role === 'formulavest_master';
  const empresaId = isMaster ? (empresaSelect?.value || '') : (state.me?.empresa_id || '');
  const escolas = empresaId
    ? state.escolas.filter((escola) => String(escola.empresa_id) === String(empresaId))
    : [];
  const escolaAnterior = resetEscola ? '' : escolaSelect.value;
  const escolaId = escolas.some((escola) => String(escola.id) === String(escolaAnterior)) ? escolaAnterior : '';

  escolaSelect.innerHTML = optionsHtml(
    escolas,
    escolaId,
    !empresaId && isMaster ? 'Selecione a empresa primeiro' : escolas.length ? 'Selecione a escola' : 'Cadastre uma escola'
  );
  escolaSelect.disabled = !empresaId || !escolas.length;

  const salas = escolaId ? salasDaEscola(escolaId) : [];
  const salaAnterior = resetEscola ? '' : salaSelect.value;
  const salaId = salas.some((sala) => String(sala.id) === String(salaAnterior)) ? salaAnterior : '';
  salaSelect.innerHTML = optionsHtml(salas, salaId, escolaId ? (salas.length ? 'Selecione a sala' : 'Cadastre período e sala') : 'Selecione uma escola primeiro');
  salaSelect.disabled = !escolaId || !salas.length;

  const role = el('novoRole')?.value || 'aluno';
  escolaSelect.required = ['aluno', 'professor', 'diretor', 'coordenador'].includes(role);
  salaSelect.required = ['aluno', 'professor'].includes(role);
  if (empresaSelect) empresaSelect.required = isMaster;

  const ajuda = el('novoUsuarioHierarquiaAjuda');
  if (!ajuda) return;
  if (!empresaId && isMaster) ajuda.textContent = 'Escolha uma empresa para carregar somente as escolas e salas dela.';
  else if (!escolas.length) ajuda.textContent = 'Cadastre uma escola nesta empresa antes de criar esta conta.';
  else if (!escolaId) ajuda.textContent = 'Selecione a escola; as salas serão filtradas automaticamente.';
  else if (salaSelect.required && !salas.length) ajuda.textContent = 'Esta escola ainda não tem salas. Cadastre um período e uma sala na seção Estrutura.';
  else ajuda.textContent = salaSelect.required ? 'Empresa, escola e sala serão vinculadas à conta.' : 'A escola define o escopo desta função.';
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
  const campoNovoEmpresa = el('campoNovoEmpresa');
  if (campoNovoEmpresa) campoNovoEmpresa.classList.toggle('hidden', !isMaster);
  const campoEmpresaEscola = el('campoEmpresaEscola');
  if (campoEmpresaEscola) campoEmpresaEscola.classList.toggle('hidden', !isMaster);
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

function buildUsuarioFiltersQuery() {
  const params = new URLSearchParams();
  if (state.buscaUsuarios) params.set('q', state.buscaUsuarios);
  if (state.filtrosUsuarios.role !== 'todos') params.set('role', state.filtrosUsuarios.role);
  if (state.filtrosUsuarios.status !== 'todos') params.set('status', state.filtrosUsuarios.status);
  if (state.filtrosUsuarios.empresa_id !== 'todos') params.set('empresa_id', String(state.filtrosUsuarios.empresa_id));
  if (state.filtrosUsuarios.escola_id !== 'todos') params.set('escola_id', String(state.filtrosUsuarios.escola_id));
  return params.toString();
}

async function carregarUsuarios() {
  const query = buildUsuarioFiltersQuery();
  const data = await request(`/admin/usuarios${query ? `?${query}` : ''}`);
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
    <article class="list-item" data-empresa-card="${empresa.id}">
      <div>
        <strong>${escapeHtml(empresa.nome)}</strong>
        <small>ID ${empresa.id}</small>
      </div>
      <div class="list-actions">
        <button class="btn btn-secondary btn-small" data-edit-empresa="${empresa.id}" type="button">Editar</button>
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
    renderEstrutura();
    hydrateSelects();
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

function usuarioMatchesFilters(usuario) {
  const term = state.buscaUsuarios.toLowerCase();
  const roleFilter = state.filtrosUsuarios.role;
  const statusFilter = state.filtrosUsuarios.status;
  const empresaFilter = state.filtrosUsuarios.empresa_id;
  const escolaFilter = state.filtrosUsuarios.escola_id;

  if (roleFilter !== 'todos' && usuario.role !== roleFilter) return false;
  if (statusFilter === 'ativos' && Boolean(usuario.banido)) return false;
  if (statusFilter === 'banidos' && !Boolean(usuario.banido)) return false;
  if (empresaFilter !== 'todos' && String(usuario.empresa_id) !== String(empresaFilter)) return false;
  if (escolaFilter !== 'todos' && String(usuario.escola_id) !== String(escolaFilter)) return false;

  if (!term) return true;

  const text = `${usuario.username || ''} ${usuario.email || ''} ${formatRole(usuario.role)} ${usuarioEscola(usuario)?.nome || ''} ${usuarioSala(usuario)?.nome || ''}`.toLowerCase();
  return text.includes(term);
}

function syncFastFilterButtons(selector, currentValue) {
  document.querySelectorAll(selector).forEach((button) => {
    button.classList.toggle('active', button.dataset.userFastFilter === currentValue || button.dataset.professorFastFilter === currentValue);
  });
}

function sortByName(a, b) {
  const nameA = normalizeDisplayName(a).toLowerCase();
  const nameB = normalizeDisplayName(b).toLowerCase();
  return nameA.localeCompare(nameB);
}

function sortUsuarios(list, mode = state.ordenacaoUsuarios) {
  const source = [...list];
  if (mode === 'nome_za') return source.sort((a, b) => sortByName(b, a));
  if (mode === 'empresa') return source.sort((a, b) => {
    const empresaA = state.empresas.find((empresa) => Number(empresa.id) === Number(a.empresa_id))?.nome || 'Sem empresa';
    const empresaB = state.empresas.find((empresa) => Number(empresa.id) === Number(b.empresa_id))?.nome || 'Sem empresa';
    return empresaA.localeCompare(empresaB) || sortByName(a, b);
  });
  if (mode === 'status') return source.sort((a, b) => Number(Boolean(b.banido)) - Number(Boolean(a.banido)) || sortByName(a, b));
  return source.sort(sortByName);
}

function renderUsuarios() {
  const box = el('listaUsuarios');
  if (!box) return;

  const usuarios = sortUsuarios(state.usuarios.filter((usuario) => usuario.role !== 'professor').filter(usuarioMatchesFilters), state.ordenacaoUsuarios);
  const scopedUsuarios = state.usuarios.filter((usuario) => usuario.role !== 'professor');
  el('usuarios-count').textContent = `${scopedUsuarios.length} usuarios`;
  const professorCount = state.usuarios.filter((usuario) => usuario.role === 'professor').length;
  if (el('professores-count')) el('professores-count').textContent = `${professorCount} professores`;

  syncFastFilterButtons('[data-user-fast-filter]', state.filtrosUsuarios.status === 'todos' ? 'todos' : state.filtrosUsuarios.status);

  if (!usuarios.length) {
    box.innerHTML = '<div class="empty-state">Nenhum usuario encontrado.</div>';
    return;
  }

  box.innerHTML = usuarios.map((usuario) => {
    const escola = usuarioEscola(usuario);
    const sala = usuarioSala(usuario);
    const periodo = usuario.sala_id ? periodoDaSala(usuario.sala_id) : null;
    const isBanned = Boolean(usuario.banido);
    const displayName = normalizeDisplayName(usuario);

    return `
      <article class="list-item" data-user-card="${usuario.id}">
        <div>
          <strong>${escapeHtml(displayName)}</strong>
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
          ${canEditUser(usuario) ? `<button class="btn btn-secondary btn-small" type="button" data-edit-user="${usuario.id}">Editar</button>` : ''}
          <button class="btn btn-danger btn-small" type="button" data-banir="${usuario.id}">${isBanned ? 'Desbanir' : 'Banir'}</button>
          <button class="btn btn-danger btn-small" type="button" data-excluir="${usuario.id}">Excluir</button>
        </div>
      </article>
    `;
  }).join('');
}

function professorMatchesFilters(usuario) {
  const term = (el('buscaProfessores')?.value || '').toLowerCase();
  const escolaFilter = el('filtroProfessorEscola')?.value || 'todos';
  const empresaFilter = el('filtroProfessorEmpresa')?.value || 'todos';
  const statusFilter = el('filtroProfessorStatus')?.value || 'todos';

  if (empresaFilter !== 'todos' && String(usuario.empresa_id) !== String(empresaFilter)) return false;
  if (escolaFilter !== 'todos' && String(usuario.escola_id) !== String(escolaFilter)) return false;
  if (statusFilter === 'ativos' && Boolean(usuario.banido)) return false;
  if (statusFilter === 'banidos' && !Boolean(usuario.banido)) return false;

  if (!term) return true;
  const escola = usuarioEscola(usuario)?.nome || '';
  const sala = usuarioSala(usuario)?.nome || '';
  const text = `${usuario.username || ''} ${usuario.email || ''} ${escola} ${sala}`.toLowerCase();
  return text.includes(term);
}

function renderProfessores() {
  const box = el('listaProfessores');
  if (!box) return;

  const professores = state.usuarios.filter((usuario) => usuario.role === 'professor');
  const filtered = sortUsuarios(professores.filter(professorMatchesFilters), state.ordenacaoProfessores);

  el('professores-count').textContent = `${professores.length} professores`;
  syncFastFilterButtons('[data-professor-fast-filter]', state.filtrosUsuarios.status === 'todos' ? 'todos' : state.filtrosUsuarios.status);

  if (!filtered.length) {
    box.innerHTML = '<div class="empty-state">Nenhum professor encontrado.</div>';
    return;
  }

  box.innerHTML = filtered.map((usuario) => {
    const escola = usuarioEscola(usuario);
    const sala = usuarioSala(usuario);
    const periodo = usuario.sala_id ? periodoDaSala(usuario.sala_id) : null;
    const assignedSalas = Array.isArray(usuario.assigned_salas) ? usuario.assigned_salas : [];
    const displayName = normalizeDisplayName(usuario);

    return `
      <article class="list-item" data-user-card="${usuario.id}">
        <div>
          <strong>${escapeHtml(displayName)}</strong>
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
          ${canEditUser(usuario) ? `<button class="btn btn-secondary btn-small" type="button" data-edit-user="${usuario.id}">Editar</button>` : ''}
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

  const empresaAtual = usuario.empresa_id ?? state.me?.empresa_id ?? '';
  const escolaAtual = usuario.escola_id ?? '';
  const escolasFiltradas = empresaAtual
    ? state.escolas.filter((escola) => String(escola.empresa_id) === String(empresaAtual))
    : state.escolas;
  const escolaSelecionada = escolasFiltradas.some((escola) => String(escola.id) === String(escolaAtual))
    ? escolaAtual
    : '';
  const periodos = escolaSelecionada ? (state.periodosByEscola.get(Number(escolaSelecionada)) || []) : allPeriodos();
  const periodo = periodoDaSala(usuario.sala_id);
  const salas = escolaSelecionada
    ? periodos.flatMap((periodoItem) => state.salasByPeriodo.get(Number(periodoItem.id)) || [])
    : (periodo ? (state.salasByPeriodo.get(Number(periodo.id)) || []) : allSalas());
  const assignedSalas = Array.isArray(usuario.assigned_salas) ? usuario.assigned_salas : [];
  const empresaOptions = state.me?.role === 'formulavest_master' && state.empresas.length
    ? state.empresas
    : [{ id: usuario.empresa_id ?? state.me?.empresa_id, nome: 'Empresa atual' }];

  card.insertAdjacentHTML('beforeend', `
    <form class="inline-edit" data-user-edit="${usuario.id}">
      <div class="inline-edit-grid">
        <label class="field">
          <span>Nome</span>
          <input name="username" value="${escapeHtml(usuario.username || '')}" required minlength="3" />
        </label>
        <label class="field">
          <span>Email</span>
          <input name="email" type="email" value="${escapeHtml(usuario.email || '')}" required />
        </label>
        <label class="field">
          <span>Função</span>
          <select name="role">${roleOptionsHtml(usuario.role)}</select>
        </label>
        <label class="field">
          <span>Empresa</span>
          <select name="empresa_id">${optionsHtml(empresaOptions, empresaAtual, 'Sem empresa')}</select>
        </label>
        <label class="field">
          <span>Escola</span>
          <select name="escola_id">${optionsHtml(escolasFiltradas, escolaSelecionada, 'Sem escola')}</select>
        </label>
        <label class="field">
          <span>Sala</span>
          <select name="sala_id">${optionsHtml(salas, usuario.sala_id, 'Sem sala')}</select>
        </label>
        <label class="field field-wide">
          <span>Salas atribuídas</span>
          <select name="sala_ids" multiple size="4">${salaOptionsHtml(salasPermitidasParaUsuario(usuario), assignedSalas.map((item) => item.id))}</select>
          <small>Use Ctrl / Cmd para selecionar múltiplas salas.</small>
        </label>
        <label class="field field-wide">
          <span>Nova senha</span>
          <input name="senha" type="password" autocomplete="new-password" placeholder="Deixe vazio para manter" minlength="8" />
        </label>
      </div>
      <div class="form-actions wide action-row">
        <button class="btn btn-secondary btn-small" type="button" data-close-editor="${usuario.id}">Cancelar</button>
        <button class="btn btn-primary btn-small" type="submit">Salvar alterações</button>
      </div>
    </form>
  `);

  const form = card.querySelector('[data-user-edit]');
  const empresaSelect = form?.querySelector('[name="empresa_id"]');
  const escolaSelect = form?.querySelector('[name="escola_id"]');
  const salaSelect = form?.querySelector('[name="sala_id"]');

  const atualizarEscolasESalas = () => {
    if (!form) return;

    const empresaSelecionada = empresaSelect?.value || '';
    const escolasDisponiveis = empresaSelecionada
      ? state.escolas.filter((escola) => String(escola.empresa_id) === String(empresaSelecionada))
      : state.escolas;
    const escolaAtualNaLista = escolasDisponiveis.some((escola) => String(escola.id) === String(escolaSelect?.value || ''))
      ? (escolaSelect?.value || '')
      : '';

    if (escolaSelect) {
      escolaSelect.innerHTML = optionsHtml(escolasDisponiveis, escolaAtualNaLista, 'Sem escola');
    }

    const escolaIdAtual = escolaSelect?.value || '';
    const periodosDisponiveis = escolaIdAtual
      ? (state.periodosByEscola.get(Number(escolaIdAtual)) || [])
      : allPeriodos();
    const salasDisponiveis = escolaIdAtual
      ? periodosDisponiveis.flatMap((periodo) => state.salasByPeriodo.get(Number(periodo.id)) || [])
      : allSalas();

    if (salaSelect) {
      const salaAtualNaLista = salasDisponiveis.some((sala) => String(sala.id) === String(salaSelect.value || ''))
        ? (salaSelect.value || '')
        : '';
      salaSelect.innerHTML = optionsHtml(salasDisponiveis, salaAtualNaLista, 'Sem sala');
    }
  };

  empresaSelect?.addEventListener('change', atualizarEscolasESalas);
  escolaSelect?.addEventListener('change', () => {
    if (!form) return;
    const escolaIdAtual = escolaSelect.value || '';
    const periodosDisponiveis = escolaIdAtual ? (state.periodosByEscola.get(Number(escolaIdAtual)) || []) : allPeriodos();
    const salasDisponiveis = escolaIdAtual
      ? periodosDisponiveis.flatMap((periodo) => state.salasByPeriodo.get(Number(periodo.id)) || [])
      : allSalas();

    if (salaSelect) {
      const salaAtualNaLista = salasDisponiveis.some((sala) => String(sala.id) === String(salaSelect.value || ''))
        ? (salaSelect.value || '')
        : '';
      salaSelect.innerHTML = optionsHtml(salasDisponiveis, salaAtualNaLista, 'Sem sala');
    }
  });
}

async function criarUsuario(event) {
  event.preventDefault();
  const payload = {
    username: el('novoNome').value.trim(),
    email: el('novoEmail').value.trim(),
    senha: el('novaSenha').value,
    role: el('novoRole').value,
    empresa_id: state.me?.role === 'formulavest_master' ? (el('novoEmpresa')?.value || null) : undefined,
    escola_id: el('novoEscola').value || null,
    sala_id: el('novoSala').value || null
  };

  try {
    await request('/admin/criar-usuario', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    event.target.reset();
    atualizarHierarquiaNovoUsuario(true);
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
    empresa_id: data.get('empresa_id') || null,
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
            <small>${escapeHtml(escola.empresa_nome || 'Empresa')} · Escola ${escola.id}</small>
          </div>
          <button class="btn btn-secondary btn-small" type="button" data-edit-escola="${escola.id}">Editar</button>
        </div>
        <div class="nested-list">${periodosHtml}</div>
      </article>
    `;
  }).join('');
}

function hydrateSelects() {
  const periodos = allPeriodos();
  const empresaUsuario = el('novoEmpresa');
  if (empresaUsuario) {
    const isMaster = state.me?.role === 'formulavest_master';
    const empresaAtual = empresaUsuario.value || '';
    const empresasDisponiveis = isMaster
      ? state.empresas
      : [{ id: state.me?.empresa_id, nome: 'Minha empresa' }].filter((empresa) => empresa.id != null);
    empresaUsuario.innerHTML = optionsHtml(
      empresasDisponiveis,
      empresasDisponiveis.some((empresa) => String(empresa.id) === String(empresaAtual)) ? empresaAtual : (isMaster ? '' : state.me?.empresa_id),
      isMaster ? (empresasDisponiveis.length ? 'Selecione a empresa' : 'Crie uma empresa primeiro') : 'Minha empresa'
    );
    empresaUsuario.required = isMaster;
    empresaUsuario.disabled = isMaster && !empresasDisponiveis.length;
  }

  const periodosRotulados = periodos.map((periodo) => {
    const escola = state.escolas.find((item) => Number(item.id) === Number(periodo.escola_id));
    const contexto = [escola?.empresa_nome, escola?.nome].filter(Boolean).join(' — ');
    return { ...periodo, nome: contexto ? `${contexto} — ${periodo.nome}` : periodo.nome };
  });

  el('periodoEscola').innerHTML = optionsHtml(escolasComEmpresa(), '', state.escolas.length ? 'Selecione a escola' : 'Cadastre uma escola');
  el('salaPeriodo').innerHTML = optionsHtml(periodosRotulados, '', periodosRotulados.length ? 'Selecione o período' : 'Cadastre um período');

  const empresaSelect = el('empresaEscola');
  if (empresaSelect) {
    const options = state.me?.role === 'formulavest_master'
      ? state.empresas
      : [{ id: state.me?.empresa_id, nome: 'Minha empresa' }].filter((item) => item.id != null);
    empresaSelect.innerHTML = options.length
      ? optionsHtml(options, state.me?.role === 'formulavest_master' ? '' : state.me?.empresa_id, 'Selecione a empresa')
      : '<option value="">Cadastre uma empresa primeiro</option>';
  }

  const filtroEmpresa = el('filtroUsuariosEmpresa');
  if (filtroEmpresa) {
    const opts = [{ id: 'todos', nome: 'Todas as empresas' }, ...state.empresas];
    const selected = state.filtrosUsuarios.empresa_id || 'todos';
    filtroEmpresa.innerHTML = optionsHtml(opts, selected);
  }

  const filtroProfessorEmpresa = el('filtroProfessorEmpresa');
  if (filtroProfessorEmpresa) {
    const opts = [{ id: 'todos', nome: 'Todas as empresas' }, ...state.empresas];
    const selected = filtroProfessorEmpresa.value || 'todos';
    filtroProfessorEmpresa.innerHTML = optionsHtml(opts, selected);
  }

  atualizarHierarquiaNovoUsuario(true);
  hydrateAlunoSelects(true);
  atualizarFiltrosDeEscola();
}

function atualizarFiltrosDeEscola() {
  const atualizar = (selectId, empresaId, escolaAtual) => {
    const select = el(selectId);
    if (!select) return escolaAtual;
    const escolas = empresaId && empresaId !== 'todos'
      ? state.escolas.filter((escola) => String(escola.empresa_id) === String(empresaId))
      : state.escolas;
    const escolaValida = escolaAtual === 'todos' || escolas.some((escola) => String(escola.id) === String(escolaAtual));
    const selecionada = escolaValida ? escolaAtual : 'todos';
    select.innerHTML = optionsHtml([{ id: 'todos', nome: 'Todas as escolas' }, ...escolasComEmpresa(escolas)], selecionada);
    return selecionada;
  };

  state.filtrosUsuarios.escola_id = atualizar(
    'filtroUsuariosEscola',
    state.filtrosUsuarios.empresa_id,
    state.filtrosUsuarios.escola_id
  );
  atualizar(
    'filtroProfessorEscola',
    el('filtroProfessorEmpresa')?.value || 'todos',
    el('filtroProfessorEscola')?.value || 'todos'
  );
}

function hydrateAlunoSelects(resetPeriodo = false) {
  const escolaSelect = el('alunoEscola');
  const periodoSelect = el('alunoPeriodo');
  const salaSelect = el('alunoSala');
  if (!escolaSelect || !periodoSelect || !salaSelect) return;

  const escolas = state.me?.role === 'formulavest_master'
    ? state.escolas
    : state.escolas.filter((escola) => String(escola.empresa_id) === String(state.me?.empresa_id));
  const escolaId = escolas.some((escola) => String(escola.id) === String(escolaSelect.value)) ? escolaSelect.value : '';
  escolaSelect.innerHTML = optionsHtml(escolasComEmpresa(escolas), escolaId, escolas.length ? 'Selecione a escola' : 'Cadastre uma escola');

  const periodos = escolaId ? (state.periodosByEscola.get(Number(escolaId)) || []) : [];
  const periodoAtual = resetPeriodo ? '' : periodoSelect.value;
  const periodoSelecionado = periodos.some((periodo) => String(periodo.id) === String(periodoAtual)) ? periodoAtual : '';

  periodoSelect.innerHTML = optionsHtml(periodos, periodoSelecionado, periodos.length ? 'Selecione o periodo' : 'Cadastre um periodo');
  periodoSelect.disabled = !escolaId || !periodos.length;

  const salas = periodoSelecionado ? (state.salasByPeriodo.get(Number(periodoSelecionado)) || []) : [];
  salaSelect.innerHTML = optionsHtml(salas, '', salas.length ? 'Selecione a sala' : 'Selecione um período primeiro');
  salaSelect.disabled = !periodoSelecionado || !salas.length;

  const ajuda = el('alunoHierarquiaAjuda');
  if (ajuda) {
    ajuda.textContent = !escolaId
      ? 'Escolha uma escola para carregar os períodos e salas disponíveis.'
      : !periodos.length
        ? 'Esta escola ainda não tem períodos. Cadastre um na seção Estrutura.'
        : !periodoSelecionado
          ? 'Agora selecione o período do aluno.'
          : !salas.length
            ? 'Este período ainda não tem salas. Cadastre uma sala na seção Estrutura.'
            : 'Escola, período e sala serão vinculados ao novo aluno.';
  }
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
  const payload = { nome };

  if (state.me?.role === 'formulavest_master') {
    payload.empresa_id = el('empresaEscola')?.value || null;
  }

  try {
    await request('/admin/criar-escola', {
      method: 'POST',
      body: JSON.stringify(payload)
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
    escola_id: el('alunoEscola').value || null,
    periodo_id: el('alunoPeriodo').value || null,
    sala_id: el('alunoSala').value || null
  };

  try {
    await request('/admin/criar-aluno', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    event.target.reset();
    hydrateAlunoSelects(true);
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
        escola: getCsvValue(headers, row, ['escola', 'nomeescola', 'escolaid']),
        empresa: getCsvValue(headers, row, ['empresa', 'nomeempresa', 'empresaid']),
        periodo: getCsvValue(headers, row, ['periodo', 'periodoescolar', 'periodoescolar']),
        sala: getCsvValue(headers, row, ['sala', 'turma']),
        email: getCsvValue(headers, row, ['email']),
        senha: getCsvValue(headers, row, ['senha'])
      }))
      .filter((aluno) => aluno.nome && aluno.escola && aluno.periodo && aluno.sala);

    if (!alunos.length) {
      throw new Error('Nenhum aluno válido encontrado. Informe nome, escola, período e sala.');
    }

    const alunosComEscola = alunos.map((aluno) => {
      const escolaId = /^\d+$/.test(aluno.escola) ? Number(aluno.escola) : null;
      let candidatas = state.escolas.filter((escola) => escolaId
        ? Number(escola.id) === escolaId
        : normalizeHeader(escola.nome) === normalizeHeader(aluno.escola));

      if (aluno.empresa) {
        const empresaId = /^\d+$/.test(aluno.empresa)
          ? Number(aluno.empresa)
          : state.empresas.find((empresa) => normalizeHeader(empresa.nome) === normalizeHeader(aluno.empresa))?.id;
        candidatas = candidatas.filter((escola) => empresaId
          ? Number(escola.empresa_id) === Number(empresaId)
          : normalizeHeader(escola.empresa_nome) === normalizeHeader(aluno.empresa));
      }

      if (candidatas.length !== 1) {
        throw new Error(`Escola "${aluno.escola}" não encontrada ou ambígua. Informe a empresa se necessário.`);
      }

      return { ...aluno, escola_id: candidatas[0].id };
    });

    const data = await request('/admin/importar-alunos', {
      method: 'POST',
      body: JSON.stringify({ alunos: alunosComEscola })
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
      : type === 'sala'
        ? `[data-sala-card="${id}"]`
        : `[data-empresa-card="${id}"]`;
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
      : type === 'sala'
        ? allSalas().find((item) => Number(item.id) === Number(id))
        : state.empresas.find((item) => Number(item.id) === Number(id));

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

function renderCompanyEditor(id) {
  renderNameEditor('empresa', id);
}

async function salvarNome(event) {
  event.preventDefault();
  const form = event.target;
  const type = form.dataset.nameEdit;
  const id = form.dataset.id;
  const nome = new FormData(form).get('nome').trim();
  const path = type === 'empresa'
    ? `/master/empresa/${id}`
    : type === 'escola'
      ? `/admin/escola/${id}`
      : type === 'periodo'
        ? `/admin/periodo/${id}`
        : `/admin/sala/${id}`;

  try {
    await request(path, {
      method: 'PUT',
      body: JSON.stringify({ nome })
    });
    if (type === 'empresa') {
      await refreshAll();
    } else {
      await carregarEstrutura();
    }
    toast('Registro atualizado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao atualizar', 'error');
  }
}

function resetUsuarioFilters() {
  state.buscaUsuarios = '';
  state.filtrosUsuarios = {
    role: 'todos',
    status: 'todos',
    empresa_id: 'todos',
    escola_id: 'todos'
  };

  const busca = el('buscaUsuarios');
  if (busca) busca.value = '';
  ['filtroUsuariosRole', 'filtroUsuariosStatus', 'filtroUsuariosEmpresa', 'filtroUsuariosEscola'].forEach((id) => {
    const elmt = el(id);
    if (elmt) elmt.value = id === 'filtroUsuariosStatus' ? 'todos' : (id === 'filtroUsuariosRole' ? 'todos' : 'todos');
  });

  renderUsuarios();
  carregarUsuarios();
}

function resetProfessorFilters() {
  const busca = el('buscaProfessores');
  if (busca) busca.value = '';
  ['filtroProfessorEmpresa', 'filtroProfessorEscola', 'filtroProfessorStatus'].forEach((id) => {
    const elmt = el(id);
    if (elmt) elmt.value = 'todos';
  });
  renderProfessores();
}

function exportCsv(rows, filename) {
  if (!rows.length) {
    toast('Nenhum registro para exportar.', 'error');
    return;
  }

  const headers = Object.keys(rows[0]);
  const escapeCsv = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(',')]
    .concat(rows.map((row) => headers.map((header) => escapeCsv(row[header])).join(',')))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
  el('filtroUsuariosRole')?.addEventListener('change', (event) => {
    state.filtrosUsuarios.role = event.target.value;
    carregarUsuarios();
  });
  el('filtroUsuariosStatus')?.addEventListener('change', (event) => {
    state.filtrosUsuarios.status = event.target.value;
    carregarUsuarios();
  });
  el('filtroUsuariosEmpresa')?.addEventListener('change', (event) => {
    state.filtrosUsuarios.empresa_id = event.target.value || 'todos';
    if (state.me?.role !== 'formulavest_master') {
      state.filtrosUsuarios.empresa_id = 'todos';
    }
    atualizarFiltrosDeEscola();
    carregarUsuarios();
  });
  el('filtroUsuariosEscola')?.addEventListener('change', (event) => {
    state.filtrosUsuarios.escola_id = event.target.value || 'todos';
    carregarUsuarios();
  });
  el('usuariosOrdenacao')?.addEventListener('change', (event) => {
    state.ordenacaoUsuarios = event.target.value || 'nome_az';
    renderUsuarios();
  });
  document.querySelectorAll('[data-user-fast-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.userFastFilter;
      state.filtrosUsuarios.status = filter || 'todos';
      el('filtroUsuariosStatus').value = filter || 'todos';
      renderUsuarios();
      carregarUsuarios();
    });
  });
  document.querySelectorAll('[data-clear-users-filters]').forEach((button) => {
    button.addEventListener('click', resetUsuarioFilters);
  });
  document.querySelectorAll('[data-export-users]').forEach((button) => {
    button.addEventListener('click', () => {
      const rows = sortUsuarios(state.usuarios.filter((usuario) => usuario.role !== 'professor').filter(usuarioMatchesFilters), state.ordenacaoUsuarios)
        .map((usuario) => ({
          nome: normalizeDisplayName(usuario),
          email: usuario.email || '',
          funcao: formatRole(usuario.role),
          empresa: state.empresas.find((empresa) => Number(empresa.id) === Number(usuario.empresa_id))?.nome || 'Sem empresa',
          escola: usuarioEscola(usuario)?.nome || 'Sem escola',
          sala: usuarioSala(usuario)?.nome || 'Sem sala',
          status: usuario.banido ? 'Banido' : 'Ativo'
        }));
      exportCsv(rows, 'usuarios-filtrados.csv');
    });
  });

  el('buscaProvas')?.addEventListener('input', (event) => {
    state.buscaProvas = event.target.value;
    renderProvas();
  });

  el('novoEmpresa')?.addEventListener('change', () => atualizarHierarquiaNovoUsuario(true));
  el('novoEscola')?.addEventListener('change', () => atualizarHierarquiaNovoUsuario(false));
  el('novoRole')?.addEventListener('change', () => atualizarHierarquiaNovoUsuario(false));
  el('alunoEscola')?.addEventListener('change', () => hydrateAlunoSelects(true));
  el('alunoPeriodo')?.addEventListener('change', () => hydrateAlunoSelects(false));
  el('form-criar-aluno')?.addEventListener('submit', criarAluno);
  el('form-importar-alunos')?.addEventListener('submit', importarAlunos);
  el('buscaProfessores')?.addEventListener('input', () => renderProfessores());
  el('filtroProfessorEmpresa')?.addEventListener('change', () => {
    atualizarFiltrosDeEscola();
    renderProfessores();
  });
  el('filtroProfessorEscola')?.addEventListener('change', () => renderProfessores());
  el('professoresOrdenacao')?.addEventListener('change', (event) => {
    state.ordenacaoProfessores = event.target.value || 'nome_az';
    renderProfessores();
  });
  el('filtroProfessorStatus')?.addEventListener('change', () => {
    const value = el('filtroProfessorStatus')?.value || 'todos';
    state.filtrosUsuarios.status = value;
    renderProfessores();
  });
  document.querySelectorAll('[data-professor-fast-filter]').forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.dataset.professorFastFilter || 'todos';
      const select = el('filtroProfessorStatus');
      if (select) select.value = filter;
      state.filtrosUsuarios.status = filter;
      renderProfessores();
    });
  });
  document.querySelectorAll('[data-clear-professors-filters]').forEach((button) => {
    button.addEventListener('click', resetProfessorFilters);
  });
  document.querySelectorAll('[data-export-professors]').forEach((button) => {
    button.addEventListener('click', () => {
      const rows = sortUsuarios(state.usuarios.filter((usuario) => usuario.role === 'professor').filter(professorMatchesFilters), state.ordenacaoProfessores)
        .map((usuario) => ({
          nome: normalizeDisplayName(usuario),
          email: usuario.email || '',
          funcao: formatRole(usuario.role),
          empresa: state.empresas.find((empresa) => Number(empresa.id) === Number(usuario.empresa_id))?.nome || 'Sem empresa',
          escola: usuarioEscola(usuario)?.nome || 'Sem escola',
          sala: usuarioSala(usuario)?.nome || 'Sem sala',
          status: usuario.banido ? 'Banido' : 'Ativo'
        }));
      exportCsv(rows, 'professores-filtrados.csv');
    });
  });

  document.querySelector('[data-refresh]')?.addEventListener('click', refreshAll);

  document.addEventListener('submit', (event) => {
    if (event.target.matches('[data-user-edit]')) salvarUsuario(event);
    if (event.target.matches('[data-name-edit]')) salvarNome(event);
  });

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    const editUser = target.getAttribute('data-edit-user');
    const closeEditor = target.getAttribute('data-close-editor');
    const banirId = target.getAttribute('data-banir');
    const excluirId = target.getAttribute('data-excluir');
    const editEscola = target.getAttribute('data-edit-escola');
    const editPeriodo = target.getAttribute('data-edit-periodo');
    const editSala = target.getAttribute('data-edit-sala');
    const editEmpresa = target.getAttribute('data-edit-empresa');
    const removeAssignment = target.getAttribute('data-remove-assignment');
    const excluirEmpresaId = target.getAttribute('data-excluir-empresa');

    if (closeEditor) {
      const ref = document.querySelector(`[data-user-card="${closeEditor}"] .inline-edit`);
      if (ref) ref.remove();
      return;
    }
    if (removeAssignment) return removerSalaAtribuida(removeAssignment);
    if (editUser) renderUserEditor(editUser);
    if (banirId) banirUsuario(banirId);
    if (excluirId) excluirUsuario(excluirId);
    if (editEscola) renderNameEditor('escola', editEscola);
    if (editPeriodo) renderNameEditor('periodo', editPeriodo);
    if (editSala) renderNameEditor('sala', editSala);
    if (editEmpresa) renderCompanyEditor(editEmpresa);
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
