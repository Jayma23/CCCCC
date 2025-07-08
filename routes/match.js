const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 通用匹配上传路由
router.post('/:type', async (req, res) => {
    const { type } = req.params; // 'quick' or 'detailed'
    const { user_id, photo_urls } = req.body;

    if (!user_id || !Array.isArray(photo_urls) || photo_urls.length !== 5) {
        return res.status(400).json({ error: 'user_id and 5 photo_urls required' });
    }

    if (!['quick', 'detailed'].includes(type)) {
        return res.status(400).json({ error: 'Invalid match type' });
    }

    try {
        // 1. 删除旧照片（如果有）
        await pool.query('DELETE FROM match_photos WHERE user_id = $1 AND match_type = $2', [user_id, type]);

        // 2. 插入新照片
        const inserts = photo_urls.map((url, index) => {
            return pool.query(
                'INSERT INTO match_photos (user_id, url, match_type, slot) VALUES ($1, $2, $3, $4)',
                [user_id, url, type, index]
            );
        });

        await Promise.all(inserts);

        res.json({ message: 'Photos uploaded successfully' });
    } catch (err) {
        console.error('Match photo upload error:', err);
        res.status(500).json({ error: 'Failed to save photos' });
    }
});

module.exports = router;
