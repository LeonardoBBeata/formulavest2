function updateAnswerSelection(existingAnswers = {}, questionIndex, letra) {
  const nextAnswers = { ...(existingAnswers || {}) };

  if (letra === null || letra === undefined || letra === '') {
    delete nextAnswers[questionIndex];
    return nextAnswers;
  }

  nextAnswers[questionIndex] = String(letra).toUpperCase();
  return nextAnswers;
}

function clearCompletedExamState(state = {}) {
  return {
    ...state,
    questoes: [],
    provaId: null,
    respostasUser: {}
  };
}

function createBatchesOfTen(totalQuestions = 90, batchSize = 10) {
  const safelyTotal = Math.max(1, Number(totalQuestions) || 0);
  const safelyBatch = Math.max(1, Number(batchSize) || 10);
  const totalBatches = Math.ceil(safelyTotal / safelyBatch);

  return Array.from({ length: totalBatches }, (_, index) => {
    const start = index * safelyBatch;
    const remaining = safelyTotal - start;
    return {
      index: index + 1,
      size: Math.min(safelyBatch, remaining),
      start,
      end: Math.min(start + safelyBatch, safelyTotal)
    };
  });
}

function buildEnemQuestionPlan(totalQuestions = 90, batchSize = 10) {
  const batches = createBatchesOfTen(totalQuestions, batchSize);
  const subjectMatrix = [
    { key: 'linguagens', label: 'Linguagens e Códigos', count: 23 },
    { key: 'humanas', label: 'Ciências Humanas', count: 22 },
    { key: 'natureza', label: 'Ciências da Natureza', count: 23 },
    { key: 'matematica', label: 'Matemática', count: 22 }
  ];

  const subjectCountsByBatch = [
    { linguagens: 3, humanas: 2, natureza: 3, matematica: 2 },
    { linguagens: 3, humanas: 2, natureza: 3, matematica: 2 },
    { linguagens: 3, humanas: 2, natureza: 3, matematica: 2 },
    { linguagens: 3, humanas: 2, natureza: 3, matematica: 2 },
    { linguagens: 3, humanas: 2, natureza: 3, matematica: 2 },
    { linguagens: 2, humanas: 3, natureza: 2, matematica: 3 },
    { linguagens: 2, humanas: 3, natureza: 2, matematica: 3 },
    { linguagens: 2, humanas: 3, natureza: 2, matematica: 3 },
    { linguagens: 2, humanas: 3, natureza: 2, matematica: 3 }
  ];

  return {
    totalQuestions: totalQuestions,
    batchSize,
    batches: batches.map((batch, index) => ({
      ...batch,
      subjectCounts: subjectCountsByBatch[index] || { linguagens: 0, humanas: 0, natureza: 0, matematica: 0 }
    })),
    subjects: subjectMatrix
  };
}

module.exports = {
  updateAnswerSelection,
  clearCompletedExamState,
  createBatchesOfTen,
  buildEnemQuestionPlan
};
