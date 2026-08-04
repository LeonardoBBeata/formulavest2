const API = window.location.origin;

if (!localStorage.getItem('token')) {
  window.location.href = '/login.html';
}

const state = {
  empresas: []
};

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

  el('page-title').textContent = section.dataset.title || 'Dashboard geral';
}

async function verificarMaster() {
  const data = await request('/me');

  if (data.role !== 'formulavest_master') {
    toast('Sem permissao para acessar o painel master.', 'error');
    window.setTimeout(logout, 1000);
    return false;
  }

  el('master-name').textContent = data.username || 'Master';
  return true;
}

async function carregarDashboard() {
  const data = await request('/master/stats');
  el('totalEmpresas').textContent = data.totalEmpresas ?? 0;
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
    await Promise.all([carregarDashboard(), carregarEmpresas()]);
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
    toast('Admin criado.');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao criar admin', 'error');
  }
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.section) mostrar(button.dataset.section);
    });
  });

  el('logout-btn')?.addEventListener('click', logout);
  el('form-criar-empresa')?.addEventListener('submit', criarEmpresa);
  el('form-criar-admin')?.addEventListener('submit', criarEmpresaAdmin);
  document.querySelector('[data-refresh]')?.addEventListener('click', refreshAll);

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    const empresaId = target?.getAttribute('data-excluir-empresa');
    if (empresaId) excluirEmpresa(empresaId);
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  bindEvents();

  try {
    setBusy(true, 'Validando');
    const autorizado = await verificarMaster();
    if (!autorizado) return;
    await refreshAll();
    mostrar('dashboard');
  } catch (error) {
    console.error(error);
    toast(error.message || 'Erro ao abrir painel master', 'error');
  } finally {
    setBusy(false);
  }
});
