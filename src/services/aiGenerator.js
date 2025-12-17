/**
 * AI Question Generator supporting multiple providers
 * Supports: Groq, Gemini (both free)
 */

const DEFAULT_QUESTIONS_COUNT = 5;
const DEFAULT_TIME_LIMIT = 30;

const PROVIDERS = {
  GROQ: 'groq',
  GEMINI: 'gemini'
};

/**
 * Build the prompt for question generation
 */
function buildPrompt(topic, batchCount) {
  return `Создай ${batchCount} вопросов для квиза на тему "${topic}". 

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
}

/**
 * Parse AI response and extract JSON
 */
function parseAIResponse(content) {
  let jsonContent = content;
  if (content.includes('```json')) {
    jsonContent = content.split('```json')[1].split('```')[0].trim();
  } else if (content.includes('```')) {
    jsonContent = content.split('```')[1].split('```')[0].trim();
  }

  try {
    return JSON.parse(jsonContent);
  } catch (parseError) {
    // Try to find JSON array in the response
    const jsonMatch = jsonContent.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('Failed to parse AI response as JSON');
  }
}

/**
 * Validate and format questions
 */
function formatQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) {
    throw new Error('AI returned invalid format: expected array');
  }

  return rawQuestions.map((q, index) => ({
    text: q.text || `Вопрос ${index + 1}`,
    time_limit: q.time_limit || DEFAULT_TIME_LIMIT,
    answers: (q.answers || []).map((a, aIndex) => ({
      text: a.text || `Вариант ${aIndex + 1}`,
      is_correct: a.is_correct === true
    }))
  })).filter(q => q.text && q.answers.length >= 2);
}

/**
 * Generate questions using Groq API
 */
async function generateWithGroq(topic, batchCount) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured. Please set it in environment variables.');
  }

  const prompt = buildPrompt(topic, batchCount);

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
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

  const questions = parseAIResponse(content);
  return formatQuestions(questions);
}


/**
 * Generate questions using Google Gemini API
 */
async function generateWithGemini(topic, batchCount) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured. Please set it in environment variables.');
  }

  const prompt = buildPrompt(topic, batchCount);

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Ты помощник для создания вопросов квизов. Отвечай только валидным JSON без дополнительного текста.\n\n${prompt}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4000,
      }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!content) {
    throw new Error('No content received from AI');
  }

  const questions = parseAIResponse(content);
  return formatQuestions(questions);
}


/**
 * Generate a batch of questions using specified provider
 */
async function generateQuestionsBatch(topic, batchCount, provider = PROVIDERS.GROQ) {
  try {
    switch (provider) {
      case PROVIDERS.GROQ:
        return await generateWithGroq(topic, batchCount);
      case PROVIDERS.GEMINI:
        return await generateWithGemini(topic, batchCount);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`AI generation error (${provider}):`, error);
    throw new Error(`Failed to generate questions with ${provider}: ${error.message}`);
  }
}

/**
 * Generate quiz questions using AI
 * Splits large requests into multiple batches if needed
 * @param {string} topic - The topic/theme of the quiz
 * @param {number} count - Number of questions to generate (default: 5)
 * @param {string} provider - AI provider to use (default: 'groq')
 * @returns {Promise<Array>} Array of generated questions
 */
async function generateQuestions(topic, count = DEFAULT_QUESTIONS_COUNT, provider = PROVIDERS.GROQ) {
  const MAX_QUESTIONS_PER_BATCH = 10; // API limit per request
  const allQuestions = [];

  // Split into batches if needed
  const batches = [];
  let remaining = count;
  
  while (remaining > 0) {
    const batchSize = Math.min(remaining, MAX_QUESTIONS_PER_BATCH);
    batches.push(batchSize);
    remaining -= batchSize;
  }

  // Generate questions in batches
  for (let i = 0; i < batches.length; i++) {
    const batchCount = batches[i];
    // eslint-disable-next-line no-console
    console.log(`Generating batch ${i + 1}/${batches.length} with ${batchCount} questions using ${provider}...`);
    
    const batchQuestions = await generateQuestionsBatch(topic, batchCount, provider);
    allQuestions.push(...batchQuestions);
    
    // Small delay between batches to avoid rate limiting
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  return allQuestions.slice(0, count); // Ensure we return exactly the requested count
}

module.exports = {
  generateQuestions,
  PROVIDERS
};
