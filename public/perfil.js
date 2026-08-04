const API = window.location.origin;
const token = localStorage.getItem("token");

if (!token) window.location.href = "/login.html";

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

  el("foto-preview").src = user.foto || "default.png";

  el("avatar-top").style.backgroundImage =
    `url('${user.foto || "default.png"}')`;
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
  const res = await fetch(`${API}/atualizar-perfil`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      nome: el("nome").value,
      email: el("email").value,
      senha: el("senha").value
    })
  });

  const data = await res.json();

  alert("Perfil atualizado!");
});

// ======================
// LOGOUT
// ======================
el("logout-btn").addEventListener("click", () => {
  localStorage.removeItem("token");
  window.location.href = "/login.html";
});
