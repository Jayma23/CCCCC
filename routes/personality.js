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
    const {
        user_id,
        name,
        mbti,
        age,
        gender,
        orientation,
        photo_urls = [],
        primary_index = 0
    } = req.body;

    if (!user_id || !name) {
        return res.status(400).json({ error: "Missing user_id or name." });
    }

    try {
        const mainPhotoUrl = photo_urls[primary_index] || null;

        // ✅ Step 1: 更新 users 表
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
            mainPhotoUrl,         // ✅ 将主图作为 photo 存进 users 表
            orientation || null,
            user_id
        ]);

        // ✅ Step 2: 删除旧照片记录
        await pool.query(`DELETE FROM user_photos WHERE user_id = $1`, [user_id]);

        // ✅ Step 3: 插入新照片（带主图标记）
        for (let i = 0; i < photo_urls.length; i++) {
            const url = photo_urls[i];
            if (!url) continue;

            await pool.query(
                `INSERT INTO user_photos (user_id, photo_url, is_primary)
                 VALUES ($1, $2, $3)`,
                [user_id, url, i === primary_index]
            );
        }

        res.json({ message: "User profile and photos saved successfully." });
    } catch (error) {
        console.error("Error saving profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});




module.exports = router;
