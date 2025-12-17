/**
 * AI Question Generator using Groq API (free tier)
 * Generates quiz questions based on topic/theme
 */

const DEFAULT_QUESTIONS_COUNT = 5;
const DEFAULT_TIME_LIMIT = 30;

/**
 * Generate quiz questions using AI
 * @param {string} topic - The topic/theme of the quiz
 * @param {number} count - Number of questions to generate (default: 5)
 * @returns {Promise<Array>} Array of generated questions
 */
async function generateQuestions(topic, count = DEFAULT_QUESTIONS_COUNT) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured. Please set it in environment variables.');
  }

  const prompt = `Создай ${count} вопросов для квиза на тему "${topic}". 

Каждый вопрос должен иметь:
- Текст вопроса (интересный и понятный)
- 4 варианта ответа (один правильный, три неправильных)
- Время на ответ: ${DEFAULT_TIME_LIMIT} секунд

Верни результат ТОЛЬКО в формате JSON массива, без дополнительного текста:
[
  {
    "text": "Текст вопроса",
    "time_limit": ${DEFAULT_TIME_LIMIT},
    "answers": [
      {"text": "Правильный ответ", "is_correct": true},
      {"text": "Неправильный ответ 1", "is_correct": false},
      {"text": "Неправильный ответ 2", "is_correct": false},
      {"text": "Неправильный ответ 3", "is_correct": false}
    ]
  }
]

Важно: верни ТОЛЬКО валидный JSON, без markdown форматирования, без объяснений.`;

  try {
    // Use Groq API (free tier)
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-70b-versatile', // Free model on Groq
        messages: [
          {
            role: 'system',
            content: 'Ты помощник для создания вопросов квизов. Отвечай только валидным JSON без дополнительного текста.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('No content received from AI');
    }

    // Extract JSON from response (remove markdown code blocks if present)
    let jsonContent = content;
    if (content.startsWith('```json')) {
      jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    } else if (content.startsWith('```')) {
      jsonContent = content.replace(/```\n?/g, '').trim();
    }

    const questions = JSON.parse(jsonContent);

    // Validate and format questions
    if (!Array.isArray(questions)) {
      throw new Error('AI returned invalid format: expected array');
    }

    return questions.map((q, index) => ({
      text: q.text || `Вопрос ${index + 1}`,
      time_limit: q.time_limit || DEFAULT_TIME_LIMIT,
      answers: (q.answers || []).map((a, aIndex) => ({
        text: a.text || `Вариант ${aIndex + 1}`,
        is_correct: a.is_correct === true
      }))
    })).filter(q => q.text && q.answers.length >= 2);

  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('AI generation error:', error);
    throw new Error(`Failed to generate questions: ${error.message}`);
  }
}

module.exports = {
  generateQuestions
};

