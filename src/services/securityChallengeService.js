export class SecurityChallengeService {
  // Predefined security questions
  static getSecurityQuestions() {
    return [
      "What was the name of your first pet?",
      "What city were you born in?",
      "What is your mother's maiden name?",
      "What was the name of your elementary school?",
      "What was your childhood nickname?",
      "What is the name of your favorite childhood friend?",
      "What street did you grow up on?",
      "What was the make of your first car?",
      "What is your favorite book?",
      "What is the name of the company of your first job?"
    ];
  }

  // Generate random security questions (pick 3)
  static generateSecurityQuestions() {
    const allQuestions = this.getSecurityQuestions();
    const shuffled = [...allQuestions].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, 3);
  }

  // Generate math challenge
  static generateMathChallenge() {
    const operations = ['+', '-', '*'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    
    let num1, num2, answer;
    
    switch (operation) {
      case '+':
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        answer = num1 + num2;
        break;
      case '-':
        num1 = Math.floor(Math.random() * 100) + 1;
        num2 = Math.floor(Math.random() * num1) + 1;
        answer = num1 - num2;
        break;
      case '*':
        num1 = Math.floor(Math.random() * 12) + 1;
        num2 = Math.floor(Math.random() * 12) + 1;
        answer = num1 * num2;
        break;
    }

    return {
      question: `What is ${num1} ${operation} ${num2}?`,
      answer: answer.toString(),
      expression: `${num1} ${operation} ${num2}`
    };
  }

  // Verify security questions answers
  static verifySecurityQuestions(questionsWithAnswers, providedAnswers) {
    for (let i = 0; i < questionsWithAnswers.length; i++) {
      const question = questionsWithAnswers[i];
      const providedAnswer = providedAnswers[i]?.toLowerCase().trim();
      const correctAnswer = question.answer.toLowerCase().trim();
      
      if (providedAnswer !== correctAnswer) {
        return false;
      }
    }
    return true;
  }

  // Verify math challenge
  static verifyMathChallenge(challenge, providedAnswer) {
    return challenge.answer === providedAnswer.trim();
  }
}