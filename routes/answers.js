// routes/answers.js
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

router.post('/', async (req, res) => {
    const { user_id, answers } = req.body;
    if (!user_id || !answers) {
        return res.status(400).json({ error: 'Missing user_id or answers' });
    }

    try {
        const insertQuery = `
            INSERT INTO personality_responses (user_id, question_id, answer)
            VALUES ($1, $2, $3)
        `;

        for (const [questionId, answer] of Object.entries(answers)) {
            await pool.query(insertQuery, [user_id, questionId, answer]);
        }

        res.status(200).json({ message: 'Answers saved successfully' });
    } catch (err) {
        console.error('Error saving answers:', err);
        res.status(500).json({ error: 'Failed to save answers' });
    }
});

module.exports = router;
