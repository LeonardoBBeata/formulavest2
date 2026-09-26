const API = window.location.origin;
const token = null;
const hasSession = localStorage.getItem('auth_session') === '1';

if (!hasSession) window.location.href = "/login.html";

// elementos
const el = (id) => document.getElementById(id);

// ======================
// LOAD USER
// ======================
async function carregarPerfil() {
  const res = await fetch(`${API}/me`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const user = await res.json();

  el("nome").value = user.username;
  el("email").value = user.email;

  const safeFoto = user.foto && user.foto.startsWith('/uploads/') ? `${API}${user.foto}` : "default.png";
  el("foto-preview").src = safeFoto;

  el("avatar-top").style.backgroundImage =
    `url('${safeFoto}')`;
}

carregarPerfil();

// ======================
// UPLOAD FOTO
// ======================
el("foto-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];

  const form = new FormData();
  form.append("foto", file);

  const res = await fetch(`${API}/upload-foto`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`
    },
    body: form
  });

  const data = await res.json();

  if (data.foto) {
    el("foto-preview").src = API + data.foto;
    el("avatar-top").style.backgroundImage =
      `url('${API + data.foto}')`;
  }
});

// ======================
// SALVAR PERFIL
// ======================
el("salvar-btn").addEventListener("click", async () => {
  try {
    const res = await fetch(`${API}/atualizar-perfil`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        nome: el("nome").value,
        email: el("email").value,
        senha_atual: el("senha-atual").value,
        senha: el("senha").value
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erro ao atualizar perfil");

    if (data.email_confirmation_required) {
      const codigo = window.prompt("Digite o código enviado para o novo email:");
      if (!codigo) {
        alert("Email pendente de confirmação. Salve novamente para reenviar o código.");
        return;
      }
      const confirmacao = await fetch(`${API}/atualizar-email/confirmar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: el("email").value, codigo })
      });
      const resultado = await confirmacao.json();
      if (!confirmacao.ok) throw new Error(resultado.error || "Código inválido");
    }

    if (data.session_revoked || data.email_confirmation_required) {
      alert("Alterações concluídas. Entre novamente com suas credenciais.");
      localStorage.removeItem("auth_session");
      window.location.href = "/login.html";
      return;
    }

    el("senha-atual").value = "";
    el("senha").value = "";
    alert("Perfil atualizado!");
  } catch (error) {
    alert(error.message || "Erro ao atualizar perfil");
  }
});

// ======================
// LOGOUT
// ======================
el("logout-btn").addEventListener("click", async () => {
  await fetch('/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  localStorage.removeItem('auth_session');
  window.location.href = "/login.html";
});
