const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const PImage = require('pureimage');
const Jimp = require('jimp');
const stream = require('stream');

// 注册中文字体
const fontPath = path.join(__dirname, '../assets/NotoSansSC-VariableFont_wght.ttf');
const notoFont = PImage.registerFont(fontPath, 'NotoSansSC');
notoFont.loadSync(); // ⚠️ 同步加载字体

// 工具函数：buffer 转 stream
function BufferToStream(buffer) {
    const duplex = new stream.Duplex();
    duplex.push(buffer);
    duplex.push(null);
    return duplex;
}

// 工具函数：多行文字绘制
function drawMultilineText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/[\s]+/);
    let line = '';

    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && i > 0) {
            ctx.fillText(line, x, y);
            line = words[i] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

// 卡牌生成接口
router.post('/Gcard', async (req, res) => {
    const { name, description, photoUrl } = req.body;

    try {
        // 1. 加载头像
        const avatar = await Jimp.read(photoUrl);
        avatar.resize(120, 120);
        const buffer = await avatar.getBufferAsync(Jimp.MIME_PNG);
        const avatarImg = await PImage.decodePNGFromStream(BufferToStream(buffer));

        // 2. 创建画布
        const width = 400;
        const height = 600;
        const img = PImage.make(width, height);
        const ctx = img.getContext('2d');

        // 3. 背景
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);

        // 4. 绘制头像
        ctx.drawImage(avatarImg, 140, 40);

        // 5. 绘制名字
        ctx.fillStyle = '#333';
        ctx.font = '24pt NotoSansSC';
        ctx.fillText(name || 'Anonymous', 50, 200);

        // 6. 绘制描述
        ctx.font = '18pt NotoSansSC';
        drawMultilineText(ctx, description || '', 50, 250, 300, 26);

        // 7. 编码为 Buffer 并直接返回
        const imageBuffer = await encodePNGToBuffer(img);
        res.setHeader('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (err) {
        console.error('生成失败:', err);
        res.status(500).json({ error: 'Card generation failed' });
    }
});

// 编码 PNG 为 Buffer
function encodePNGToBuffer(img) {
    const bufferStream = new stream.PassThrough();
    const chunks = [];

    return new Promise((resolve, reject) => {
        bufferStream.on('data', chunk => chunks.push(chunk));
        bufferStream.on('end', () => resolve(Buffer.concat(chunks)));
        bufferStream.on('error', reject);

        PImage.encodePNGToStream(img, bufferStream).catch(reject);
    });
}

module.exports = router;
