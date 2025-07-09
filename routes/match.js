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
router.post('/detailed', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    try {
        // 获取当前用户性别
        const userRes = await pool.query('SELECT gender FROM users WHERE id = $1', [user_id]);
        if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const gender = userRes.rows[0].gender;

        // 查找 match_photos 表中一个异性并且上传过 detailed 照片的用户（排除自己）
        const matchCandidate = await pool.query(`
            SELECT DISTINCT user_id FROM match_photos 
            WHERE user_id != $1 AND match_type = 'detailed' AND user_id IN (
                SELECT id FROM users WHERE gender != $2
            )
            LIMIT 1
        `, [user_id, gender]);

        if (matchCandidate.rows.length === 0) {
            return res.status(200).json({ status: 'waiting', message: 'No match found, please try again later.' });
        }

        const matchedUserId = matchCandidate.rows[0].user_id;

        // 创建 chat_room（不匿名）
        const chatRoomRes = await pool.query(`
            INSERT INTO chat_rooms (user1_id, user2_id, is_anonymous)
            VALUES ($1, $2, false)
            RETURNING id
        `, [user_id, matchedUserId]);

        const chat_id = chatRoomRes.rows[0].id;

        return res.json({
            status: 'matched',
            chat_id,
            partner: {
                user_id: matchedUserId,
                anonymous: false
            }
        });

    } catch (err) {
        console.error('Detailed match error:', err);
        res.status(500).json({ error: 'Server error' });
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
router.get('/status/:user_id', async (req, res) => {
    const { user_id } = req.params;

    try {
        // 找这个用户参与的匿名 chat_room
        const result = await pool.query(
            `SELECT * FROM chat_rooms 
             WHERE (user1_id = $1 OR user2_id = $1) AND is_anonymous = true
             ORDER BY created_at DESC LIMIT 1`,
            [user_id]
        );

        if (result.rows.length === 0) {
            return res.json({ status: 'waiting' });
        }

        const chat = result.rows[0];
        const partner_id = chat.user1_id === parseInt(user_id) ? chat.user2_id : chat.user1_id;

        return res.json({
            status: 'matched',
            chat_id: chat.id,
            partner: {
                user_id: partner_id,
                anonymous: true
            }
        });

    } catch (err) {
        console.error('Check match status error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});



module.exports = router;
