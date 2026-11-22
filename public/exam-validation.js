(() => {
  function isValidStudentQuestion(question) {
    if (!question || typeof question !== 'object' || Array.isArray(question)) return false;
    if (typeof question.enunciado !== 'string' || !question.enunciado.trim()) return false;

    const options = question.opcoes;
    if (!options || typeof options !== 'object' || Array.isArray(options)) return false;

    return ['A', 'B', 'C', 'D', 'E'].every(letter => (
      typeof options[letter] === 'string' && options[letter].trim().length > 0
    ));
  }

  const examValidation = { isValidStudentQuestion };
  if (typeof module !== 'undefined' && module.exports) module.exports = examValidation;
  if (typeof window !== 'undefined') window.ExamValidation = examValidation;
})();
