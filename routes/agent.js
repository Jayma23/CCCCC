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
const maxLength = 16000; // characters，适当限制
//const truncatedText = conversationText.slice(-maxLength); // 保留最新内容
const personalitySummary = await generatePersonalitySummary(conversationText);
// AI 分身回复接口
router.post('/respond', async (req, res) => {
    const { user_id, message } = req.body;
    if (!user_id || !message) {
        return res.status(400).json({ error: 'user_id and message required' });
    }

    try {
        // 1. 生成输入向量
        const embedResp = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: message
        });
        const inputVector = embedResp.data[0].embedding;

        // 2. 查询用户人格向量（最新的一条）
        const vectorQuery = await pineconeIndex.query({
            vector: inputVector,
            topK: 1,
            filter: { user_id: user_id.toString(), source: "chat_history" },
            includeMetadata: true
        });

        const vector = vectorQuery.matches?.[0];
        const createdAt = vector?.metadata?.created_at || "";
        const personalitySummary = vector?.metadata?.summary || "The user is introspective, likes basketball, enjoys meaningful conversations.";

        // 3. 构造 system prompt
        const systemPrompt = `
You are a digital twin of user ${user_id}. 
Respond exactly as they would — using their tone, preferences, and emotional style.

Personality Summary (from chat history as of ${createdAt}):
${personalitySummary}

Never break character. Respond like a second brain or AI version of the user.
        `.trim();

        // 4. 获取最近 6 轮上下文（按时间升序）
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

        // 5. 调用 ChatGPT 生成回复
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages
        });

        const reply = response.choices[0].message.content;

        // 6. 存入 chat_history
        await pool.query(`
            INSERT INTO chat_history (user_id, sender, message)
            VALUES ($1, 'user', $2), ($1, 'ai', $3)
        `, [user_id, message, reply]);

        // 7. 每 20 轮更新一次人格向量
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM chat_history WHERE user_id = $1`,
            [user_id]
        );
        const messageCount = parseInt(countResult.rows[0].count, 10);

        if (messageCount % 20 === 0) {
            const allChats = await pool.query(
                `SELECT sender, message FROM chat_history WHERE user_id = $1 ORDER BY created_at ASC`,
                [user_id]
            );
            const conversationText = allChats.rows.map(row =>
                `${row.sender === 'user' ? 'User' : 'AI'}: ${row.message}`
            ).join('\n').slice(-16000); // truncate

            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: conversationText
            });

            const vector = embeddingResponse.data[0].embedding;

            await pineconeIndex.upsert([
                {
                    id: `chat_summary_${user_id}_${Date.now()}`,
                    values: vector,
                    metadata: {
                        user_id: user_id.toString(),
                        source: "chat_history",
                        created_at: new Date().toISOString(),
                        summary: personalitySummary // 可以自动生成
                    }
                }
            ]);
            console.log(`✅ Updated personality embedding for user ${user_id}`);
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
        // 1. 获取所有聊天记录
        const allChats = await pool.query(
            `SELECT sender, message FROM chat_history WHERE user_id = $1 ORDER BY created_at ASC`,
            [user_id]
        );

        if (allChats.rows.length === 0) {
            return res.status(404).json({ error: "No chat history found for user" });
        }

        // 2. 拼接为大文本
        const conversationText = allChats.rows.map(row =>
            `${row.sender === 'user' ? 'User' : 'AI'}: ${row.message}`
        ).join('\n');

        // 3. 获取 embedding
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: conversationText
        });

        const vector = embeddingResponse.data[0].embedding;

        // 4. 存入 Pinecone
        await pineconeIndex.upsert([
            {
                id: `chat_summary_${user_id}_${Date.now()}`,
                values: vector,
                metadata: {
                    user_id: user_id.toString(),
                    source: "chat_history",
                    created_at: new Date().toISOString()
                }
            }
        ]);

        res.json({ message: "Chat history embedded and stored in Pinecone." });
    } catch (error) {
        console.error("Embedding from history failed:", error);
        res.status(500).json({ error: "Failed to update embedding from history." });
    }
});

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

// 在 /respond 的更新 embedding 部分，调用这个函数生成 summary：
if (messageCount % 20 === 0) {
    const allChats = await pool.query(
        `SELECT sender, message FROM chat_history WHERE user_id = $1 ORDER BY created_at ASC`,
        [user_id]
    );
    const conversationText = allChats.rows.map(row =>
        `${row.sender === 'user' ? 'User' : 'AI'}: ${row.message}`
    ).join('\n').slice(-16000);

    const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: conversationText
    });
    const vector = embeddingResponse.data[0].embedding;

    // 🧠 自动生成人格总结（注入 metadata）
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
    console.log("✅ Updated personality with summary:\n", personalitySummary);
}

module.exports = router;
