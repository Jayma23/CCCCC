// Utility function: Generate personality summary using GPT-3.5
async function generatePersonalitySummary(conversationText) {
    const messages = [
        {
            role: "system",
            content: `You're an AI summarizer. Based on the user's chat history, generate a short first-person summary of their personality and include their name if it's mentioned (e.g., \"I'm James...\"). Keep it natural, a little witty, and no more than 2-3 sentences. Don't sound robotic.`
        },
        {
            role: "user",
            content: conversationText.slice(-16000)
        }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages
    });

    return completion.choices[0].message.content;
}

// Utility function: Classify traits (hobbies, achievements, other traits) from conversation using GPT-3.5
async function classifyTraitsFromConversation(conversationText) {
    const messages = [
        {
            role: "system",
            content: `You are a trait classifier. From the user's chat history, extract the following fields:\n1. hobbies\n2. achievements\n3. other_traits\nReturn a JSON object like:\n{\n  \"hobbies\": \"...\",\n  \"achievements\": \"...\",\n  \"other_traits\": \"...\"\n}`
        },
        {
            role: "user",
            content: conversationText.slice(-16000)
        }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages
    });

    const raw = completion.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}

// Express router setup


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

router.post('/respond', async (req, res) => {
    const { user_id, message } = req.body;
    if (!user_id || !message) return res.status(400).json({ error: 'user_id and message required' });

    try {
        // Embed the incoming message
        const embedResp = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: message
        });
        const inputVector = embedResp.data[0].embedding;

        // Retrieve the user's latest chat_history vector
        const vectorQuery = await pineconeIndex.query({
            vector: inputVector,
            topK: 1,
            filter: { user_id: user_id.toString(), source: "chat_history" },
            includeMetadata: true
        });

        const vector = vectorQuery.matches?.[0];
        const createdAt = vector?.metadata?.created_at || "";
        const personalitySummary = vector?.metadata?.summary || "I'm still learning about the user, but they seem thoughtful and expressive.";

        // Retrieve recent chat context
        const chatHistory = await pool.query(
            `SELECT sender, message FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 6`,
            [user_id]
        );
        const contextMessages = chatHistory.rows.reverse().map(row => ({
            role: row.sender === 'user' ? 'user' : 'assistant',
            content: row.message
        }));

        const systemPrompt = `
You are a digital clone of user ${user_id}.
Speak exactly like they would — same tone, same language style, same emotional habits.
Speak in short, natural, and conversational sentences — like texting a friend.
Avoid sounding formal or generic. Inject personality: casual, witty, maybe sarcastic.
Use this personality snapshot:
[ Personality Summary as of ${createdAt} ]:
${personalitySummary}
NEVER say you're an AI. Stay in character.`.trim();

        const messages = [
            { role: "system", content: systemPrompt },
            ...contextMessages,
            { role: "user", content: message }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            max_tokens: 120,
            temperature: 0.7
        });

        const reply = response.choices[0].message.content;

        await pool.query(
            `INSERT INTO chat_history (user_id, sender, message) VALUES ($1, 'user', $2), ($1, 'ai', $3)`,
            [user_id, message, reply]
        );

        // Every 50 messages, update personality and shared traits embeddings
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
            const conversationText = allChats.rows.map(r => `User: ${r.message}`).join('\n').slice(-16000);

            // Embed and update chat_history personality vector
            const embedSummary = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: conversationText
            });
            const summaryVector = embedSummary.data[0].embedding;
            const summaryText = await generatePersonalitySummary(conversationText);

            await pineconeIndex.upsert([
                {
                    id: `chat_summary_${user_id}_${Date.now()}`,
                    values: summaryVector,
                    metadata: {
                        user_id: user_id.toString(),
                        source: "chat_history",
                        created_at: new Date().toISOString(),
                        summary: summaryText
                    }
                }
            ]);

            // Classify and store shared_traits vector
            const traits = await classifyTraitsFromConversation(conversationText);
            if (traits) {
                const traitsText = [traits.hobbies, traits.achievements, traits.other_traits].filter(Boolean).join('\n');
                const traitsEmbedding = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: traitsText
                });
                await pineconeIndex.upsert([
                    {
                        id: `shared_traits_${user_id}_${Date.now()}`,
                        values: traitsEmbedding.data[0].embedding,
                        metadata: {
                            user_id: user_id.toString(),
                            source: "shared_traits",
                            shared: true,
                            hobbies: traits.hobbies,
                            achievements: traits.achievements,
                            other_traits: traits.other_traits,
                            created_at: new Date().toISOString()
                        }
                    }
                ]);
            }
        }

        res.json({ reply });
    } catch (error) {
        console.error("🔥 AI Agent error:", error);
        res.status(500).json({ error: "AI agent failed to respond." });
    }
});


module.exports = router;
