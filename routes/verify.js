const express = require('express');
const router = express.Router();
const axios = require('axios');
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Azure Face API config
const AZURE_FACE_API_KEY = process.env.AZURE_FACE_API_KEY;
const AZURE_FACE_API_ENDPOINT = process.env.AZURE_FACE_API_ENDPOINT;

router.post('/identity', async (req, res) => {
    const { user_id, selfie_url } = req.body;

    if (!user_id || !selfie_url) {
        return res.status(400).json({ error: 'Missing user_id or selfie_url' });
    }

    try {
        // 1. 获取用户 Cloudinary 存储的主照片
        const userResult = await pool.query('SELECT photo FROM users WHERE id = $1', [user_id]);
        const storedPhotoUrl = userResult.rows[0]?.photo;

        if (!storedPhotoUrl) {
            return res.status(404).json({ error: 'User stored photo not found' });
        }

        // 2. 请求 Azure Face API 对比
        const faceApiUrl = `${AZURE_FACE_API_ENDPOINT}/face/v1.0/verify`;

        // 先检测两张图的 faceId
        const detectFace = async (imageUrl) => {
            const detectUrl = `${AZURE_FACE_API_ENDPOINT}/face/v1.0/detect`;
            const response = await axios.post(
                detectUrl,
                { url: imageUrl },
                {
                    params: { returnFaceId: true },
                    headers: {
                        'Ocp-Apim-Subscription-Key': AZURE_FACE_API_KEY,
                        'Content-Type': 'application/json',
                    },
                }
            );
            return response.data[0]?.faceId;
        };

        const selfieFaceId = await detectFace(selfie_url);
        const storedFaceId = await detectFace(storedPhotoUrl);

        if (!selfieFaceId || !storedFaceId) {
            return res.status(400).json({ error: 'Could not detect face in one of the images' });
        }

        const verifyResponse = await axios.post(
            faceApiUrl,
            {
                faceId1: selfieFaceId,
                faceId2: storedFaceId
            },
            {
                headers: {
                    'Ocp-Apim-Subscription-Key': AZURE_FACE_API_KEY,
                    'Content-Type': 'application/json',
                }
            }
        );

        const isIdentical = verifyResponse.data.isIdentical;
        const confidence = verifyResponse.data.confidence;

        if (isIdentical && confidence >= 0.75) {
            await pool.query('UPDATE users SET verify = true WHERE id = $1', [user_id]);
            return res.json({ verified: true, confidence, message: 'User identity verified successfully' });
        } else {
            return res.json({ verified: false, confidence, message: 'Face does not match our records' });
        }
    } catch (err) {
        console.error('Verification error:', err);
        return res.status(500).json({ error: 'Server error during verification' });
    }
});

module.exports = router;
