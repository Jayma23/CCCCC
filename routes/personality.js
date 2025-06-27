const OpenAI = require("openai");
const { Pool } = require("pg");
const { Pinecone } = require("@pinecone-database/pinecone");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();
const express = require("express");
const router = express.Router();


// PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,

});

const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

router.post("/submit-responses", async (req, res) => {
    const { user_id, responses } = req.body;

    if (!user_id || !Array.isArray(responses)) {
        return res.status(400).json({ error: "Invalid data format" });
    }

    try {
        // 1. 保存到PostgreSQL
        const insertQuery = `
            INSERT INTO personality_responses (user_id, question_id, response)
            VALUES ($1, $2, $3)
        `;
        for (const item of responses) {
            await pool.query(insertQuery, [user_id, item.question_id, item.response]);
        }

        // 2. 拼接所有回答
        const combinedText = responses.map(r => r.response).join(" ");

        // 3. 调用 OpenAI v4 生成 embedding
        const embeddingResponse = await openai.embeddings.create({
            model: "text-embedding-3-small", // 推荐使用新版
            input: combinedText
        });

        const embedding = embeddingResponse.data[0].embedding;

        // 4. 存入 Pinecone
        await pineconeIndex.upsert([
            {
                id: uuidv4(),
                values: embedding,
                metadata: {
                    user_id: user_id.toString(),
                    created_at: new Date().toISOString()
                }
            }
        ]);

        res.json({ message: "Responses and embedding saved successfully." });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = router;
