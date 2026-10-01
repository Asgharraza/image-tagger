const fs = require('fs');
const OpenAI = require('openai');

const client = new OpenAI({
  baseURL: process.env.LLM_BASE_URL,
  apiKey: process.env.OPENROUTER_API_KEY,
  timeout: 45000
});

async function tagImage(filePath, mimeType) {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const res = await client.chat.completions.create({
    model: process.env.LLM_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: 'You tag images. Return ONLY JSON in this shape: {"tags":["tag1","tag2",...]}. Use 3 to 8 short lowercase tags. No extra text.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'List tags for this image.' },
          { type: 'image_url', image_url: { url: dataUrl } }
        ]
      }
    ]
  });

  return {
    raw: res.choices[0].message.content,
    usage: res.usage
  };
}

module.exports = { tagImage };