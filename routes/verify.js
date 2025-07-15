const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 假设这是 Face Verification 逻辑
router.post('/identity', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
        // 👉 在这里接入真实的face verification逻辑
        const verificationSuccess = true; // 假设验证通过

        if (verificationSuccess) {
            await pool.query(
                'UPDATE users SET verify = true WHERE id = $1',
                [user_id]
            );
            return res.json({ verified: true, message: 'User identity verified successfully' });
        } else {
            return res.json({ verified: false, message: 'Face does not match our records' });
        }
    } catch (err) {
        console.error('Verification error:', err);
        return res.status(500).json({ error: 'Server error during verification' });
    }
});

module.exports = router;
