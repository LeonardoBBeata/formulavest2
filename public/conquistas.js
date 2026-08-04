const API = window.location.origin;
const token = localStorage.getItem('token');

function el(id){return document.getElementById(id);} 

document.addEventListener('DOMContentLoaded', async () => {
  if (!token) return window.location.href = '/login.html';
  await carregarBadges();
  await carregarHistorico();
  document.getElementById('badge-modal-close')?.addEventListener('click', ()=> el('badge-modal').classList.add('hidden'));
});

const BADGES = [
  { key:'primeira_prova', title:'Primeira Prova', desc:'Concluiu a primeira prova.', icon:'🎉' },
  { key:'dez_provas', title:'10 Provas', desc:'Concluiu 10 provas.', icon:'🔟' },
  { key:'cinquenta_provas', title:'50 Provas', desc:'Concluiu 50 provas.', icon:'🏅' },
  { key:'nivel_10', title:'Nível 10', desc:'Alcançou o nível 10.', icon:'🚀' },
  { key:'streak_7', title:'Streak 7 dias', desc:'Estudou 7 dias seguidos.', icon:'🔥' }
];

async function carregarBadges(){
  try{
    const res = await fetch(`${API}/me/conquistas`, { headers: { Authorization: `Bearer ${token}` } });
    if(!res.ok) return;
    const data = await res.json();
    const c = data.conquistas || {};
    const grid = el('badges-grid');
    grid.innerHTML = '';
    BADGES.forEach(b => {
      const ok = !!c[b.key];
      const item = document.createElement('div');
      item.className = 'badge-item';
      item.innerHTML = `
        <div class="badge-ico ${ok ? 'badge-success' : 'badge-locked'}">${b.icon}</div>
        <div class="badge-title">${b.title}</div>
        <div class="badge-sub">${ok ? 'Conquistado' : 'Bloqueado'}</div>
        <div class="badge-actions">
          <button class="btn-share">Compartilhar</button>
          <button class="btn-secondary-ghost">Detalhes</button>
        </div>
      `;
        const shareBtn = item.querySelector('.btn-share');
        const detBtn = item.querySelector('.btn-secondary-ghost');
        shareBtn?.addEventListener('click', (e) => { e.stopPropagation(); shareBadge(b, ok, data.historico || []); });
        detBtn?.addEventListener('click', (e) => { e.stopPropagation(); mostrarDetalhe(b, ok, data.historico || []); });
        item.addEventListener('click', ()=> mostrarDetalhe(b, ok, data.historico || []));
      grid.appendChild(item);
    });
  }catch(e){console.error('Erro carregar badges', e);}
}

function mostrarDetalhe(badge, unlocked, historico){
  const modal = el('badge-modal');
  const content = el('badge-modal-content');
  let unlockedAt = null;
  if (historico && Array.isArray(historico)){
    const found = historico.find(h => h.chave === badge.key);
    if (found) unlockedAt = found.criado_em;
  }
  content.innerHTML = `
    <div style="display:flex; gap:16px; align-items:center;">
      <div style="flex:0 0 96px;">
        <div class="badge-ico ${unlocked ? 'badge-success' : 'badge-locked'}" style="width:96px;height:96px;font-size:40px">${badge.icon}</div>
      </div>
      <div>
        <h3 style="margin:0">${badge.title}</h3>
        <p style="margin:8px 0; color:#666">${badge.desc}</p>
        <p style="margin:6px 0;">Status: <strong>${unlocked ? 'Conquistado' : 'Bloqueado'}</strong></p>
        ${unlockedAt ? `<p style="margin:6px 0;">Conquistado em: <strong>${new Date(unlockedAt).toLocaleString()}</strong></p>` : ''}
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button id="modal-share-btn" class="btn-share">Compartilhar</button>
          <button id="modal-close-btn" class="btn-secondary-ghost">Fechar</button>
        </div>
      </div>
    </div>
  `;
  modal.classList.remove('hidden');
  document.getElementById('modal-close-btn')?.addEventListener('click', ()=> modal.classList.add('hidden'));
  document.getElementById('modal-share-btn')?.addEventListener('click', ()=> shareBadge(badge, unlocked, historico));
}

function shareBadge(badge, unlocked, historico){
  // create canvas image for share/download
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 630; // social card size
  const ctx = canvas.getContext('2d');
  // background
  const grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
  grad.addColorStop(0, '#0366d6'); grad.addColorStop(1,'#00c6ff');
  ctx.fillStyle = grad; ctx.fillRect(0,0,canvas.width,canvas.height);

  // white card
  ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(40,40,canvas.width-80,canvas.height-80);

  // badge circle
  const cx = 200, cy = canvas.height/2, r = 140;
  const g2 = ctx.createLinearGradient(cx-r, cy-r, cx+r, cy+r);
  g2.addColorStop(0,'#FFD166'); g2.addColorStop(1,'#EF476F');
  ctx.fillStyle = g2;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();

  // badge icon (emoji)
  ctx.font = '96px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff'; ctx.fillText(badge.icon, cx, cy+6);

  // title and desc
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = '48px sans-serif';
  ctx.fillText(badge.title, 380, cy - 20);
  ctx.font = '22px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.95)';
  wrapText(ctx, badge.desc, 380, cy + 20, canvas.width - 420, 28);

  // footer
  const dateText = (()=>{
    const found = historico.find(h=>h.chave===badge.key);
    return found ? new Date(found.criado_em).toLocaleDateString() : '';
  })();
  ctx.font = '18px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(dateText ? `Conquistado em ${dateText}` : 'Conquista desbloqueada', 380, canvas.height - 80);

  // download or share
  canvas.toBlob((blob)=>{
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], 'conquista.png', { type: blob.type })] })) {
      const file = new File([blob], `${badge.key}.png`, { type: blob.type });
      navigator.share({ files: [file], title: badge.title, text: badge.desc }).catch(err=>console.warn('share failed', err));
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${badge.key}.png`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    }
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && n > 0) {
      ctx.fillText(line, x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

async function carregarHistorico(){
  try{
    const res = await fetch(`${API}/me/conquistas/historico`, { headers: { Authorization: `Bearer ${token}` } });
    if(!res.ok) return el('hist-list').innerText = 'Não foi possível carregar histórico';
    const data = await res.json();
    const list = data.historico || [];
    if (!list.length) return el('hist-list').innerHTML = '<p class="muted">Sem histórico ainda.</p>';
    const html = '<ul class="historic-list">' + list.map(h => `<li><strong>${h.titulo}</strong> — ${h.descricao} <small style="color:#888">(${new Date(h.criado_em).toLocaleString()})</small></li>`).join('') + '</ul>';
    el('hist-list').innerHTML = html;
  }catch(e){ console.error('Erro histórico', e); el('hist-list').innerText = 'Erro ao carregar histórico'; }
}
