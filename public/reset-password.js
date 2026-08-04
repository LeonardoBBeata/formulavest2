const API = window.location.origin;

const params =
  new URLSearchParams(
    window.location.search
  );

const token =
  params.get("token");

if (!token) {
  document.getElementById(
    "mensagem"
  ).textContent =
    "Token inválido.";
}

document
  .getElementById("salvar-btn")
  .addEventListener(
    "click",
    async () => {

      const senha =
        document.getElementById(
          "nova-senha"
        ).value;

      const confirmar =
        document.getElementById(
          "confirmar-senha"
        ).value;

      if (!senha || senha.length < 8) {
        alert(
          "Senha precisa ter pelo menos 8 caracteres"
        );
        return;
      }

      if (senha !== confirmar) {
        alert(
          "As senhas não coincidem"
        );
        return;
      }

      try {
        const res =
          await fetch(
            `${API}/reset-password`,
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body:
                JSON.stringify({
                  token,
                  senha
                })
            }
          );

        const data =
          await res.json();

        if (!res.ok) {
          alert(
            data.error
          );
          return;
        }

        document.getElementById(
          "mensagem"
        ).textContent =
          "Senha alterada com sucesso.";

        setTimeout(() => {
          window.location.href =
            "/login.html";
        }, 2000);

      } catch (err) {
        console.error(err);

        alert(
          "Erro ao redefinir senha"
        );
      }
    }
  );
