// 在你的 respond 路由外部添加这个工具函数（例如放在文件底部）
async function generatePersonalitySummary(conversationText) {
    const messages = [
        {
            role: "system",
            content: "You're an AI analyst summarizing a user's personality based on their chat history. Return 3-5 bullet points capturing their key interests, tone, social style, and preferences."
        },
        {
            role: "user",
            content: conversationText.slice(-16000) // 避免超长文本
        }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages
    });

    return completion.choices[0].message.content;
}

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);
const maxLength = 16000;

// AI 分身回复接口
router.post('/respond', async (req, res) => {
    const { user_id, message } = req.body;
    if (!user_id || !message) {
        return res.status(400).json({ error: 'user_id and message required' });
    }

    try {
        const embedResp = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: message
        });
        const inputVector = embedResp.data[0].embedding;

        const vectorQuery = await pineconeIndex.query({
            vector: inputVector,
            topK: 1,
            filter: { user_id: user_id.toString(), source: "chat_history" },
            includeMetadata: true
        });

        const vector = vectorQuery.matches?.[0];
        const createdAt = vector?.metadata?.created_at || "";
        const personalitySummary = vector?.metadata?.summary || "The user is introspective, likes basketball, enjoys meaningful conversations.";

        const systemPrompt = `
You are a digital twin of user ${user_id}. 
Respond exactly as they would — using their tone, preferences, and emotional style.

Personality Summary (from chat history as of ${createdAt}):
${personalitySummary}

Never break character. Respond like a second brain or AI version of the user.`.trim();

        const chatHistory = await pool.query(`
            SELECT sender, message FROM chat_history
            WHERE user_id = $1 ORDER BY created_at DESC LIMIT 6
        `, [user_id]);

        const contextMessages = chatHistory.rows.reverse().map(row => ({
            role: row.sender === 'user' ? 'user' : 'assistant',
            content: row.message
        }));

        const messages = [
            { role: "system", content: systemPrompt },
            ...contextMessages,
            { role: "user", content: message }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages
        });

        const reply = response.choices[0].message.content;

        await pool.query(`
            INSERT INTO chat_history (user_id, sender, message)
            VALUES ($1, 'user', $2), ($1, 'ai', $3)
        `, [user_id, message, reply]);

        const countResult = await pool.query(
            `SELECT COUNT(*) FROM chat_history WHERE user_id = $1`,
            [user_id]
        );
        const messageCount = parseInt(countResult.rows[0].count, 10);

        if (messageCount % 50 === 0) {
            const allChats = await pool.query(
                `SELECT sender, message FROM chat_history WHERE user_id = $1 AND sender = 'user' ORDER BY created_at ASC`,
                [user_id]
            );

            const conversationText = allChats.rows.map(row =>
                `User: ${row.message}`
            ).join('\n').slice(-16000);

            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: conversationText
            });
            const vector = embeddingResponse.data[0].embedding;
            const personalitySummary = await generatePersonalitySummary(conversationText);

            if (personalitySummary !== vector?.metadata?.summary) {
                await pineconeIndex.upsert([
                    {
                        id: `chat_summary_${user_id}_${Date.now()}`,
                        values: vector,
                        metadata: {
                            user_id: user_id.toString(),
                            source: "chat_history",
                            created_at: new Date().toISOString(),
                            summary: personalitySummary
                        }
                    }
                ]);
                console.log("✅ Updated personality with summary:\n", personalitySummary);
            }
        }

        res.json({ reply });
    } catch (error) {
        console.error("🔥 AI Agent error:", error);
        res.status(500).json({ error: "AI agent failed to respond." });
    }
});

router.get('/history', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    try {
        const result = await pool.query(
            `SELECT sender, message, created_at FROM chat_history WHERE user_id = $1 ORDER BY created_at ASC`,
            [user_id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch history failed:", err);
        res.status(500).json({ error: "Failed to fetch history" });
    }
});

// 用历史聊天更新人格向量
router.post('/update-embedding-from-history', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: "Missing user_id" });

    try {
        const allChats = await pool.query(
            `SELECT sender, message FROM chat_history WHERE user_id = $1 AND sender = 'user' ORDER BY created_at ASC`,
            [user_id]
        );

        if (allChats.rows.length === 0) {
            return res.status(404).json({ error: "No chat history found for user" });
        }

        const conversationText = allChats.rows.map(row =>
            `User: ${row.message}`
        ).join('\n').slice(-16000);

        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: conversationText
        });

        const vector = embeddingResponse.data[0].embedding;
        const personalitySummary = await generatePersonalitySummary(conversationText);

        await pineconeIndex.upsert([
            {
                id: `chat_summary_${user_id}_${Date.now()}`,
                values: vector,
                metadata: {
                    user_id: user_id.toString(),
                    source: "chat_history",
                    created_at: new Date().toISOString(),
                    summary: personalitySummary
                }
            }
        ]);

        res.json({ message: "Chat history embedded and stored in Pinecone." });
    } catch (error) {
        console.error("Embedding from history failed:", error);
        res.status(500).json({ error: "Failed to update embedding from history." });
    }
});

module.exports = router;
