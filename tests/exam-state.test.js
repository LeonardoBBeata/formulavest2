const { updateAnswerSelection, clearCompletedExamState, createBatchesOfTen, buildEnemQuestionPlan } = require('../utils/examState');

describe('exam state helpers', () => {
  test('deve permitir trocar uma alternativa já escolhida', () => {
    const respostas = { 0: 'A', 1: 'C' };
    const next = updateAnswerSelection(respostas, 0, 'B');

    expect(next).toEqual({ 0: 'B', 1: 'C' });
    expect(next[0]).not.toBe('A');
  });

  test('deve limpar o estado da prova quando ela é finalizada', () => {
    const state = {
      questoes: [{ enunciado: 'x' }],
      provaId: 42,
      respostasUser: { 0: 'A' },
      containerIds: ['enem-container', 'personalizada-container']
    };

    expect(clearCompletedExamState(state)).toEqual({
      questoes: [],
      provaId: null,
      respostasUser: {},
      containerIds: ['enem-container', 'personalizada-container']
    });
  });

  test('deve gerar 9 blocos de 10 questões para o ENEM', () => {
    const plan = buildEnemQuestionPlan(90, 10);

    expect(plan.totalQuestions).toBe(90);
    expect(plan.batches).toHaveLength(9);
    expect(plan.batches.every(batch => batch.size === 10)).toBe(true);

    const totals = { linguagens: 0, humanas: 0, natureza: 0, matematica: 0 };
    plan.batches.forEach(batch => {
      Object.entries(batch.subjectCounts).forEach(([key, value]) => {
        totals[key] += value;
      });
    });

    expect(totals).toEqual({ linguagens: 23, humanas: 22, natureza: 23, matematica: 22 });
  });

  test('deve quebrar 90 questões em lotes de 10', () => {
    const batches = createBatchesOfTen(90, 10);
    expect(batches).toHaveLength(9);
    expect(batches.every(batch => batch.size === 10)).toBe(true);
  });
});
