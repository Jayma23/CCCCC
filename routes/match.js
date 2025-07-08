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
router.post('/quick', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    try {
        // 获取当前用户性别
        const userRes = await pool.query('SELECT gender FROM users WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const gender = userRes.rows[0].gender;

        // 查找一个异性的等待用户
        const matchRes = await pool.query(
            'SELECT * FROM quick_match_queue WHERE gender != $1 ORDER BY created_at LIMIT 1',
            [gender]
        );

        if (matchRes.rows.length === 0) {
            // 没人可匹配，加入队列
            await pool.query(
                'INSERT INTO quick_match_queue (user_id, gender) VALUES ($1, $2)',
                [user_id, gender]
            );
            return res.json({ status: 'waiting' });
        } else {
            // 找到一个匹配者
            const match = matchRes.rows[0];
            const matchedUserId = match.user_id;

            // 清除队列中对方
            await pool.query('DELETE FROM quick_match_queue WHERE user_id = $1', [matchedUserId]);

            // 创建 chat_room
            const chatRoomRes = await pool.query(`
        INSERT INTO chat_rooms (user1_id, user2_id, is_anonymous)
        VALUES ($1, $2, true)
        RETURNING id
      `, [user_id, matchedUserId]);

            const chat_id = chatRoomRes.rows[0].id;

            return res.json({
                status: 'matched',
                chat_id,
                partner: {
                    user_id: matchedUserId,
                    anonymous: true
                }
            });
        }
    } catch (err) {
        console.error('Quick match error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});


module.exports = router;
