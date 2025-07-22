const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const socketIO = require('socket.io');
// 连接数据库
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// 搞一个ChatRoom
router.post('/create-or-get-room', async (req, res) => {
    const { user1_id, user2_id } = req.body;
    if (!user1_id || !user2_id) return res.status(400).json({ error: 'Missing user IDs' });

    try {
        const result = await pool.query(`
      SELECT * FROM chat_rooms
      WHERE (user1_id = $1 AND user2_id = $2)
         OR (user1_id = $2 AND user2_id = $1)
    `, [user1_id, user2_id]);

        if (result.rows.length > 0) {
            return res.json({ chat_id: result.rows[0].id });
        }

        const newChatId = uuidv4();
        await pool.query(`
      INSERT INTO chat_rooms (id, user1_id, user2_id)
      VALUES ($1, $2, $3)
    `, [newChatId, user1_id, user2_id]);

        res.json({ chat_id: newChatId });
    } catch (err) {
        console.error('create-or-get-room error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 加载聊天记录
router.get('/messages/:chat_id', async (req, res) => {
    const { chat_id } = req.params;
    try {
        const result = await pool.query(`
      SELECT * FROM chat_messages
      WHERE chat_id = $1
      ORDER BY timestamp ASC
    `, [chat_id]);
        res.json({ messages: result.rows });
    } catch (err) {
        console.error('get messages error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// 发消息
router.post('/send-message', async (req, res) => {
    const { chat_id, sender_id, content } = req.body;
    if (!chat_id || !sender_id || !content)
        return res.status(400).json({ error: 'Missing fields' });

    try {
        await pool.query(`
            INSERT INTO chat_messages (chat_id, sender_id, message)
            VALUES ($1, $2, $3)
        `, [chat_id, sender_id, content]);

        await pool.query(`
  UPDATE chat_rooms SET last_updated = NOW() WHERE id = $1
`, [chat_id]);
        res.json({ success: true });
    } catch (err) {
        console.error('send-message error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
router.get('/list', async (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });

    try {
        const result = await pool.query(`
      SELECT
        r.id AS chat_id,
        CASE
          WHEN r.user1_id = $1 THEN r.user2_id
          ELSE r.user1_id
        END AS partner_id,
        COALESCE(u.name, 'Anonymous') AS partner_name,
        COALESCE(u.photo, '') AS partner_photo,

          m.message AS last_message,
        m.timestamp AS last_updated
      FROM chat_rooms r
      JOIN users u
        ON u.id = CASE
          WHEN r.user1_id = $1 THEN r.user2_id
          ELSE r.user1_id
        END
      LEFT JOIN LATERAL (
        SELECT message, timestamp
        FROM chat_messages
        WHERE chat_id = r.id
        ORDER BY timestamp DESC
        LIMIT 1
      ) m ON true
      WHERE r.user1_id = $1 OR r.user2_id = $1
      ORDER BY m.timestamp DESC NULLS LAST
    `, [user_id]);

        res.json({ chats: result.rows });
    } catch (err) {
        console.error('/chatroom/list error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
