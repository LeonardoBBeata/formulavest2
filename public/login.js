const API = window.location.origin;

let loginEmail = "";
let loginSenha = "";
let cadastroEmail = "";
let tipoLogin = "aluno";

function isAdminRole(role) {
  return ['formulavest_master', 'empresa_admin', 'diretor', 'coordenador'].includes(role);
}

function mostrar(id) {
  document
    .querySelectorAll(".card")
    .forEach(c =>
      c.classList.add(
        "hidden"
      )
    );

  document
    .getElementById(id)
    .classList.remove(
      "hidden"
    );
}

// ======================
// ABRIR CADASTRO
// ======================

document
  .getElementById(
    "abrir-cadastro"
  )
  .onclick = () => {
    mostrar(
      "cadastro-box"
    );
  };

// ======================
// ABRIR RECUPERAR
// ======================

document
  .getElementById(
    "abrir-recuperar"
  )
  .onclick = () => {
    mostrar(
      "recuperar-box"
    );
  };

// ======================
// VOLTAR LOGIN
// ======================

document
  .querySelectorAll(
    ".voltar-login"
  )
  .forEach(btn => {
    btn.onclick = () => {
      mostrar(
        "login-box"
      );
    };
  });

// ======================
// LOGIN PASSO 1
// ======================

document
  .getElementById(
    "login-btn"
  )
  .onclick = async () => {

    tipoLogin =
      document.querySelector(
        'input[name="tipo-login"]:checked'
      ).value;

    loginEmail =
      document.getElementById(
        "login-email"
      ).value;

    loginSenha =
      document.getElementById(
        "login-senha"
      ).value;

    const res =
      await fetch(
        `${API}/login-iniciar`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              email:
                loginEmail,
              senha:
                loginSenha
            })
        }
      );

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      alert(
        data.error || "Erro ao fazer login"
      );
      return;
    }

    if (data.dev_codigo) {
      alert(
        `Codigo de login para teste: ${data.dev_codigo}`
      );
    }

    // ADM entra direto
    if (
      data.adminDirect
    ) {
      const res2 =
        await fetch(
          `${API}/login-confirmar`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify({
                email:
                  loginEmail,
                senha:
                  loginSenha,
                codigo: ""
              })
          }
        );

      let data2 = {};
      try {
        data2 = await res2.json();
      } catch {
        data2 = {};
      }

      if (!res2.ok) {
        alert(
          data2.error || "Erro ao confirmar login"
        );
        return;
      }

      localStorage.setItem(
        "token",
        data2.token
      );

      // redirect according to role returned
      if (data2.role === 'professor') {
        location.href = '/professor.html';
      } else if (isAdminRole(data2.role)) {
        location.href = '/admin.html';
      } else {
        location.href = '/index.html';
      }

      return;
    }

    // usuário normal
    mostrar(
      "codigo-login-box"
    );
  };

// ======================
// LOGIN PASSO 2
// ======================

document
  .getElementById(
    "confirmar-login-btn"
  )
  .onclick = async () => {

    const codigo =
      document.getElementById(
        "codigo-login"
      ).value;

    const res =
      await fetch(
        `${API}/login-confirmar`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              email:
                loginEmail,
              senha:
                loginSenha,
              codigo
            })
        }
      );

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      alert(
        data.error || "Erro ao confirmar login"
      );
      return;
    }

    localStorage.setItem(
      "token",
      data.token
    );

    // ======================
    // REDIRECIONAMENTO
    // ======================

    if (
      tipoLogin === "admin"
    ) {

      if (isAdminRole(data.role)) {
        location.href =
          "/admin.html";
      } else {
        alert(
          "Sua conta não é administrador."
        );

        localStorage.removeItem(
          "token"
        );

        mostrar(
          "login-box"
        );
      }

    } else {

      if (
        data.role ===
        "professor"
      ) {
        location.href =
          "/professor.html";

      } else {
        location.href =
          "/index.html";
      }

    }
  };

// ======================
// CADASTRO
// ======================

document
  .getElementById(
    "cadastro-btn"
  )
  .onclick = async () => {
    const btn =
      document.getElementById(
        "cadastro-btn"
      );

    btn.disabled = true;
    btn.textContent =
      "Cadastrando...";

    try {
      const username =
        document.getElementById(
          "cadastro-user"
        ).value;

      cadastroEmail =
        document.getElementById(
          "cadastro-email"
        ).value;

      const senha =
        document.getElementById(
          "cadastro-senha"
        ).value;

      const res =
        await fetch(
          `${API}/register`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body:
              JSON.stringify({
                username,
                email:
                  cadastroEmail,
                senha
              })
          }
        );

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        alert(
          data.error ||
          "Erro ao cadastrar"
        );
        return;
      }

      if (data.dev_codigo) {
        const aviso = document.getElementById('codigo-aviso');
        const mensagem = data.email_enviado
          ? `Código de verificação enviado para o seu e-mail: ${data.dev_codigo}`
          : `Não foi possível enviar o e-mail. Use este código para validar sua conta: ${data.dev_codigo}`;

        if (aviso) {
          aviso.textContent = mensagem;
          aviso.classList.remove('hidden');
        }

        alert(mensagem);
      }

      mostrar(
        "codigo-cadastro-box"
      );

    } catch (err) {
      console.error(err);
      alert(
        "Nao foi possivel conectar ao servidor. Confira se o npm run dev esta rodando."
      );
    } finally {
      btn.disabled = false;
      btn.textContent =
        "Cadastrar";
    }
  };

// ======================
// CONFIRMAR CADASTRO
// ======================

document
  .getElementById(
    "confirmar-cadastro-btn"
  )
  .onclick = async () => {

    const codigo =
      document.getElementById(
        "codigo-cadastro"
      ).value;

    const res =
      await fetch(
        `${API}/verificar-email`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              email:
                cadastroEmail,
              codigo
            })
        }
      );

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    if (!res.ok) {
      alert(
        data.error || "Erro ao confirmar cadastro"
      );
      return;
    }

    alert(
      "Conta criada!"
    );

    mostrar(
      "login-box"
    );
  };

// ======================
// RECUPERAR SENHA
// ======================

document
  .getElementById(
    "recuperar-btn"
  )
  .onclick = async () => {

    const email =
      document.getElementById(
        "recuperar-email"
      ).value;

    const res =
      await fetch(
        `${API}/forgot-password`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              email
            })
        }
      );

    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }

    alert(
      data.message ||
      data.error || "Erro ao recuperar senha"
    );
  };
