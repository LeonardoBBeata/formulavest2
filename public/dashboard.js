function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let paginaAtual = 1;
let temMais = false;

async function carregarHistorico(anexar = false){
    if (localStorage.getItem('auth_session') !== '1') {
        window.location.replace('/login.html');
        return;
    }
    const res = await fetch(`/provas?page=${paginaAtual}&limit=10`);
    if (res.status === 401 || res.status === 403) {
        localStorage.removeItem('auth_session');
        window.location.replace('/login.html');
        return;
    }
    if (!res.ok) throw new Error('Não foi possível carregar o histórico');
    const data = await res.json();
    const container = document.getElementById('resultado');

    if(!data.provas || data.provas.length === 0){
        container.innerHTML = "<p>Nenhuma prova realizada ainda.</p>";
        return;
    }

    const provasHtml = data.provas.map((p,i)=>{
        let acertos = 0;
        const questoesHTML = p.questoes.map((q,j)=>{
            const selecionada = q.selecionada || 'Não respondida';
            if(selecionada === q.correta) acertos++;

            const opcoesHTML = Object.entries(q.opcoes).map(([letra,texto])=>{
                let classe = letra===q.correta ? 'certa' : (letra===selecionada ? 'selecionada' : '');
                return `<p class="alternativa ${escapeHtml(classe)}">${escapeHtml(letra)}) ${escapeHtml(texto)}</p>`;
            }).join('');

            return `<div class="questao">
                        <p class="enunciado">Q${j+1}: ${escapeHtml(q.enunciado)}</p>
                        ${opcoesHTML}
                        <p><strong>Sua resposta:</strong> ${escapeHtml(selecionada)} | <strong>Correta:</strong> ${escapeHtml(q.correta)}</p>
                    </div>`;
        }).join('');

        const percAcertos = p.questoes.length ? Math.round((acertos / p.questoes.length) * 100) : 0;

        return `<div class="prova-card">
                    <h3>Prova ${i+1} - ${escapeHtml(new Date(p.criado_em || p.data).toLocaleString())}</h3>
                    <div class="progresso">
                        <div class="progresso-fill" style="width:${percAcertos}%">${percAcertos}%</div>
                    </div>
                    ${questoesHTML}
                </div>`;
    }).join('');
    container.innerHTML = anexar ? container.innerHTML + provasHtml : provasHtml;

    temMais = Boolean(data.has_more);
    const actions = document.getElementById('historico-actions');
    if (actions) {
      actions.innerHTML = temMais ? '<button id="carregar-mais" class="btn-blue" type="button">Carregar mais provas</button>' : '';
      document.getElementById('carregar-mais')?.addEventListener('click', () => {
        paginaAtual += 1;
        carregarHistorico(true);
      });
    }
}

document.getElementById('logout-btn').addEventListener('click', async ()=>{
    await fetch('/logout',{method:'POST', credentials: 'same-origin'});
    localStorage.removeItem('auth_session');
    location.href='/';
});

carregarHistorico();
