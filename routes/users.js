const express = require('express');
const router = express.Router();

const OpenAI = require("openai");

// ✅ 新版 SDK 初始化方式
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

router.post('/suggest-reply', async (req, res) => {
  const { context } = req.body;

  const systemPrompt = `
You are an empathetic conversation assistant who helps the user reply to messages with emotional intelligence.
Given a message from someone else, generate 2 short, natural, and emotionally intelligent reply suggestions.
Each reply should sound caring, understanding, and supportive — not robotic.
Respond with just the replies as a JSON array.

Example format:
[
  "Reply option 1...",
  "Reply option 2..."
]
  `.trim();

  try {
    // ✅ 新版 SDK 调用方式
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: context }
      ],
      temperature: 0.8,
      max_tokens: 100,
    });

    const replyText = completion.choices[0].message.content.trim();
    const suggestions = JSON.parse(replyText);

    res.json({ suggestions });
  } catch (err) {
    console.error("AI Suggest Error:", err);
    res.status(500).json({ error: 'AI suggest failed' });
  }
});

module.exports = router;
