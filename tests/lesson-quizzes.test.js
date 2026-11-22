const { gradeAnswers, lessonIds, subjectIds } = require('../public/lesson-quizzes');

describe('lições interativas', () => {
  test('oferece lições para as cinco matérias solicitadas', () => {
    expect(subjectIds).toEqual(['portugues', 'matematica', 'historia', 'geografia', 'ingles']);
    expect(lessonIds).toHaveLength(10);
  });

  test('calcula acertos e explicações para uma lição concluída', () => {
    expect(gradeAnswers('porcentagem', { 0: 'C', 1: 'C' })).toMatchObject({
      allAnswered: true,
      score: 2,
      total: 2,
      answers: [
        { selected: 'C', correct: 'C', isCorrect: true },
        { selected: 'C', correct: 'C', isCorrect: true }
      ]
    });
  });

  test('avalia a raiz e o valor de uma função do primeiro grau corretamente', () => {
    expect(gradeAnswers('funcao-primeiro-grau', { 0: 'B', 1: 'B' })).toMatchObject({
      allAnswered: true,
      score: 2,
      total: 2
    });
  });

  test('não considera concluída uma lição com questão sem resposta', () => {
    expect(gradeAnswers('simple-present', { 0: 'B' })).toMatchObject({
      allAnswered: false,
      score: 1,
      total: 2
    });
  });

  test('rejeita identificador de lição desconhecido', () => {
    expect(() => gradeAnswers('quimica', {})).toThrow('Lição desconhecida: quimica');
  });
});
