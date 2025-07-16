const express = require('express');
const router = express.Router();
const OpenAI = require("openai");

// ✅ 新版 SDK 初始化方式
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// 🚀 智能回复建议路由
router.post('/suggest-reply', async (req, res) => {
  try {
    const { context, conversationHistory = [], userProfile = {} } = req.body;

    // 验证输入
    if (!context || typeof context !== 'string') {
      return res.status(400).json({ error: 'Context is required and must be a string' });
    }

    // 🚀 构建更智能的系统提示
    const systemPrompt = `
You are an emotionally intelligent conversation assistant that helps users reply to messages naturally and appropriately.

Your task:
1. Analyze the given message context
2. Generate 2-3 short, natural, and contextually appropriate reply suggestions
3. Each reply should be empathetic, engaging, and feel human-written
4. Vary the tone and style of replies (casual, supportive, curious, etc.)
5. Keep replies concise (under 50 words each)
6. Avoid overly formal or robotic language

Response format: Return ONLY a JSON array of reply strings.
Example: ["That sounds amazing! 😊", "I'd love to hear more about that", "Hope everything goes well!"]

Guidelines:
- Use appropriate emojis when they fit naturally
- Match the conversational tone of the original message
- Provide diverse response options (emotional, practical, curious)
- Avoid controversial topics or overly personal responses
- Keep responses authentic and conversational
    `.trim();

    // 🚀 构建上下文消息
    let contextMessage = `Message to reply to: "${context}"`;

    // 如果有对话历史，添加上下文
    if (conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-5).map(msg =>
          `${msg.isMe ? 'Me' : 'Them'}: ${msg.message}`
      ).join('\n');
      contextMessage += `\n\nRecent conversation:\n${recentHistory}`;
    }

    // 🚀 API调用
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextMessage }
      ],
      temperature: 0.8,
      max_tokens: 150,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const replyText = completion.choices[0].message.content.trim();

    // 🚀 解析响应
    let suggestions;
    try {
      suggestions = JSON.parse(replyText);

      // 验证响应格式
      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        throw new Error('Invalid suggestions format');
      }

      // 过滤和清理建议
      suggestions = suggestions
          .filter(suggestion => typeof suggestion === 'string' && suggestion.trim().length > 0)
          .map(suggestion => suggestion.trim())
          .slice(0, 3); // 最多3个建议

    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      // 提供后备建议
      suggestions = [
        "Thanks for sharing! 😊",
        "That's interesting!",
        "I'd love to know more"
      ];
    }

    // 🚀 记录使用情况（可选）
    console.log(`AI Reply Suggestions Generated: ${suggestions.length} suggestions for context: "${context.substring(0, 50)}..."`);

    res.json({
      suggestions,
      metadata: {
        model: "gpt-3.5-turbo",
        timestamp: new Date().toISOString(),
        context_length: context.length
      }
    });

  } catch (error) {
    console.error("AI Suggest Reply Error:", error);

    // 🚀 提供后备建议，确保用户体验不中断
    const fallbackSuggestions = [
      "Thanks for letting me know! 😊",
      "That's really interesting",
      "I appreciate you sharing that"
    ];

    res.status(500).json({
      error: 'AI suggest temporarily unavailable',
      suggestions: fallbackSuggestions,
      fallback: true
    });
  }
});

// 🚀 健康检查路由
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'AI Reply Suggestions',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;