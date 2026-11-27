const { normalizeStudyProgress } = require('../services/studyProgress');

const validProgress = {
  activities: [{ id: 'activity-1', date: '2026-11-27', kind: 'focus', minutes: 25 }],
  planDate: '2026-11-27',
  plan: [{ texto: 'Revisar matemática', feito: false }],
  goalsDate: '2026-11-27',
  goals: [{ texto: 'Completar um simulado', feito: true, kind: 'exam' }],
  lessons: {
    porcentagem: { score: 2, total: 2, completedAt: '2026-11-27T12:00:00.000Z' }
  }
};

describe('normalização do progresso de estudo', () => {
  test('mantém apenas os campos de progresso aceitos', () => {
    expect(normalizeStudyProgress({ ...validProgress, ignored: 'field' })).toEqual(validProgress);
  });

  test.each([
    { ...validProgress, activities: Array(5001).fill(validProgress.activities[0]) },
    { ...validProgress, activities: [{ ...validProgress.activities[0], date: '2026-02-30' }] },
    { ...validProgress, goals: [{ texto: 'Meta', feito: false, kind: 'admin' }] },
    { ...validProgress, lessons: { quimica: { score: 1, total: 1, completedAt: '2026-11-27' } } },
    { ...validProgress, lessons: { porcentagem: { score: 3, total: 2, completedAt: '2026-11-27' } } }
  ])('rejeita dados inválidos ou fora dos limites', progress => {
    expect(normalizeStudyProgress(progress)).toBeNull();
  });
});
