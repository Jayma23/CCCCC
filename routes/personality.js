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
    const { user_id, name, mbti, age, gender, orientation, photo } = req.body;

    if (!user_id || !name) {
        return res.status(400).json({ error: "Missing user_id or name." });
    }

    try {
        // 直接更新 users 表
        const updateUserQuery = `
            UPDATE users
            SET
                name = $1,
                mbti = $2,
                age = $3,
                gender = $4,
                photo = $5,
                sexual_orientation = $6,
                form_submitted = true
            WHERE id = $7
        `;

        await pool.query(updateUserQuery, [
            name,
            mbti || null,
            age || null,
            gender || null,
            photo || null,
            orientation || null,
            user_id
        ]);

        res.json({ message: "User profile saved successfully." });
    } catch (error) {
        console.error("Error saving profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});



module.exports = router;
