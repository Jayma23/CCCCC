// routes/personality.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 保存问卷回答
router.post('/submit-responses', async (req, res) => {
    const { userId, answers } = req.body;

    if (!userId || !Array.isArray(answers)) {
        return res.status(400).json({ error: "Invalid input" });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        for (const answer of answers) {
            const { questionId, response } = answer;
            await client.query(
                `INSERT INTO personality_responses (user_id, question_id, response) VALUES ($1, $2, $3)`,
                [userId, questionId, response]
            );
        }

        await client.query('COMMIT');
        res.status(200).json({ message: "Responses saved successfully" });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Failed to save responses" });
    } finally {
        client.release();
    }
});

module.exports = router;
