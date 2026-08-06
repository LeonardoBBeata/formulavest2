function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function carregarHistorico(){
    const res = await fetch('/provas');
    const data = await res.json();
    const container = document.getElementById('resultado');

    if(!data.provas || data.provas.length === 0){
        container.innerHTML = "<p>Nenhuma prova realizada ainda.</p>";
        return;
    }

    container.innerHTML = data.provas.map((p,i)=>{
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

        const percAcertos = Math.round((acertos / p.questoes.length) * 100);

        return `<div class="prova-card">
                    <h3>Prova ${i+1} - ${escapeHtml(new Date(p.data).toLocaleString())}</h3>
                    <div class="progresso">
                        <div class="progresso-fill" style="width:${percAcertos}%">${percAcertos}%</div>
                    </div>
                    ${questoesHTML}
                </div>`;
    }).join('');
}

document.getElementById('logout-btn').addEventListener('click', async ()=>{
    await fetch('/logout',{method:'POST'});
    location.href='/';
});

carregarHistorico();