const express = require("express");
const router = express.Router();
const { Pool } = require("pg");
const { Configuration, OpenAIApi } = require("openai");
const { Pinecone } = require("@pinecone-database/pinecone");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);

const pinecone = new Pinecone();
const pineconeIndex = pinecone.Index(process.env.PINECONE_INDEX_NAME);

router.post("/submit-responses", async (req, res) => {
    const { user_id, responses } = req.body;

    if (!user_id || !Array.isArray(responses)) {
        return res.status(400).json({ error: "Invalid data format" });
    }

    try {
        // 1. 保存到 PostgreSQL
        const insertQuery = `
      INSERT INTO questionnaire_responses (user_id, question_id, response)
      VALUES ($1, $2, $3)
    `;
        for (const item of responses) {
            await pool.query(insertQuery, [user_id, item.questionId, item.response]);
        }

        // 2. 拼接所有回答
        const combinedText = responses.map(r => r.response).join(" ");

        // 3. 调用 OpenAI 生成 embedding
        const embeddingResponse = await openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: combinedText
        });
        const [{ embedding }] = embeddingResponse.data.data;

        // 4. 存入 Pinecone
        await pineconeIndex.upsert([
            {
                id: uuidv4(), // 或者用 user_id.toString()
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
