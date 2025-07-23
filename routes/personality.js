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
    console.log('📥 Incoming profile data:', req.body);
    const {
        user_id,
        name,
        mbti,
        age,
        gender,
        height,
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
                height = $7,
                form_submitted = true
            WHERE id = $8
        `;

        await pool.query(updateUserQuery, [
            name,
            mbti || null,
            age || null,
            gender || null,
            mainPhotoUrl,         // ✅ 将主图作为 photo 存进 users 表
            orientation || null,
            height || null,
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
router.put('/update-profile', async (req, res) => {
    const {
        user_id,
        name,
        height,
        age,
        gender,
        orientation,
        photos = []
    } = req.body;

    if (!user_id || !name || photos.length === 0) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        // 主图设为第 1 张有效图
        const primaryUrl = photos.find(p => p) || null;

        // 更新 users 表
        await pool.query(`
            UPDATE users
            SET name = $1,
                height = $2,
                age = $3,
                gender = $4,
                sexual_orientation = $5,
                photo = $6
            WHERE id = $7
        `, [name, height, age, gender, orientation, primaryUrl, user_id]);

        // 删除旧图
        await pool.query(`DELETE FROM user_photos WHERE user_id = $1`, [user_id]);

        // 重新插入照片
        for (let i = 0; i < photos.length; i++) {
            const url = photos[i];
            if (!url) continue;

            await pool.query(`
                INSERT INTO user_photos (user_id, photo_url, is_primary)
                VALUES ($1, $2, $3)
            `, [user_id, url, i === 0]);  // 第一张是主图
        }

        res.json({ message: 'Profile updated successfully' });

    } catch (err) {
        console.error('❌ Error updating profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/get-profile/:user_id', async (req, res) => {
    const user_id = req.params.user_id;

    try {
        // 获取基本信息
        const userResult = await pool.query(`
            SELECT id, name, height, age, gender, sexual_orientation AS orientation, photo
            FROM users
            WHERE id = $1
        `, [user_id]);

        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // 获取照片列表（按主图优先排序）
        const photosResult = await pool.query(`
            SELECT photo_url
            FROM user_photos
            WHERE user_id = $1
            ORDER BY is_primary DESC, uploaded_at ASC
        `, [user_id]);

        const photos = photosResult.rows.map(row => row.photo_url);

        // 确保总是返回 5 个槽位（空补 null）
        while (photos.length < 5) {
            photos.push(null);
        }

        res.json({
            ...user,
            photos
        });

    } catch (err) {
        console.error('❌ Error loading profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});





module.exports = router;
