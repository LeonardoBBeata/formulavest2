const { buildConquistaState } = require('../routes/user');
const { normalizeUserRole } = require('../middlewares/auth');

describe('buildConquistaState', () => {
  test('calcula streak e conquistas de forma consistente', () => {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const isoYesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const isoTwoDaysAgo = new Date(today.getTime() - 86400000 * 2).toISOString().slice(0, 10);
    const isoThreeDaysAgo = new Date(today.getTime() - 86400000 * 3).toISOString().slice(0, 10);
    const isoFourDaysAgo = new Date(today.getTime() - 86400000 * 4).toISOString().slice(0, 10);
    const isoFiveDaysAgo = new Date(today.getTime() - 86400000 * 5).toISOString().slice(0, 10);
    const isoSixDaysAgo = new Date(today.getTime() - 86400000 * 6).toISOString().slice(0, 10);

    const provas = [
      { data: isoToday, total: 10, percentual: 100 },
      { data: isoYesterday, total: 10, percentual: 80 },
      { data: isoTwoDaysAgo, total: 10, percentual: 75 },
      { data: isoThreeDaysAgo, total: 10, percentual: 90 },
      { data: isoFourDaysAgo, total: 10, percentual: 60 },
      { data: isoFiveDaysAgo, total: 10, percentual: 70 },
      { data: isoSixDaysAgo, total: 10, percentual: 100 }
    ];

    const state = buildConquistaState({
      provas,
      xp: 250,
      nivel: 8,
      existing: new Set(),
      lastActive: new Date()
    });

    expect(state.total).toBe(7);
    expect(state.conquistas.primeira_prova).toBe(true);
    expect(state.conquistas.xp_100).toBe(true);
    expect(state.conquistas.nivel_5).toBe(true);
    expect(state.conquistas.streak_3).toBe(true);
    expect(state.conquistas.streak_7).toBe(true);
    expect(state.conquistas.streak_days).toBe(7);
    expect(state.novas_conquistas.some(item => item.chave === 'streak_7')).toBe(true);
  });

  test('normaliza roles vazios para aluno', () => {
    expect(normalizeUserRole(null)).toBe('aluno');
    expect(normalizeUserRole('   ')).toBe('aluno');
    expect(normalizeUserRole('aluno')).toBe('aluno');
  });
});
