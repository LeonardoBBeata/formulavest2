const { isValidStudentQuestion } = require('../public/exam-validation');

describe('validação de questões para o aluno', () => {
  test('aceita questão sem gabarito exposto quando enunciado e alternativas estão completos', () => {
    expect(isValidStudentQuestion({
      enunciado: 'Qual é a resposta?',
      opcoes: { A: 'Uma', B: 'Duas', C: 'Três', D: 'Quatro', E: 'Cinco' }
    })).toBe(true);
  });

  test.each([
    null,
    [],
    { enunciado: '', opcoes: { A: 'a', B: 'b', C: 'c', D: 'd', E: 'e' } },
    { enunciado: 'Pergunta', opcoes: { A: 'a', B: 'b', C: 'c', D: 'd' } },
    { enunciado: 'Pergunta', opcoes: ['a', 'b', 'c', 'd', 'e'] }
  ])('rejeita questão com formato incompleto: %j', question => {
    expect(isValidStudentQuestion(question)).toBe(false);
  });
});
