// Utility functions for generating various challenges

export class ChallengeUtils {
  // Generate simple captcha-like text challenge
  static generateTextChallenge() {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let challenge = '';
    for (let i = 0; i < 6; i++) {
      challenge += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return {
      question: `Enter the following characters: ${challenge}`,
      answer: challenge
    };
  }

  // Generate sequence challenge
  static generateSequenceChallenge() {
    const start = Math.floor(Math.random() * 10) + 1;
    const sequence = [start, start + 2, start + 4, start + 6];
    return {
      question: `Complete the sequence: ${start}, ${start + 2}, ${start + 4}, ?`,
      answer: (start + 6).toString()
    };
  }

  // Generate word problem
  static generateWordProblem() {
    const problems = [
      {
        question: "If you have 5 apples and you buy 3 more, how many apples do you have?",
        answer: "8"
      },
      {
        question: "What is 15 divided by 3?",
        answer: "5"
      },
      {
        question: "If a train travels 60 miles in 1 hour, how far will it travel in 2 hours?",
        answer: "120"
      },
      {
        question: "What is 25% of 100?",
        answer: "25"
      }
    ];
    return problems[Math.floor(Math.random() * problems.length)];
  }

  // Get random challenge (mix of different types)
  static getRandomChallenge() {
    const challenges = [
      this.generateMathChallenge(),
      this.generateTextChallenge(),
      this.generateSequenceChallenge(),
      this.generateWordProblem()
    ];
    return challenges[Math.floor(Math.random() * challenges.length)];
  }

  // Alias for math challenge (compatibility)
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
      type: 'math'
    };
  }
}