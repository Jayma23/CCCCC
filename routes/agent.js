const express = require('express');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');
const router = express.Router();

// ✅ 注册中文字体（相对路径）
registerFont(path.join(__dirname, '../assets/NotoSansSC-VariableFont_wght.ttf'), {
    family: 'NotoSansSC'
});

router.post('/Gcard', async (req, res) => {
    const { name = '匿名用户', description = '', photoUrl } = req.body;

    try {
        // 画布设置
        const width = 400;
        const height = 600;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // 背景
        ctx.fillStyle = '#fef3f3';
        ctx.fillRect(0, 0, width, height);

        // 加载头像
        const avatar = await loadImage(photoUrl);
        ctx.beginPath();
        ctx.arc(200, 120, 60, 0, Math.PI * 2, true); // 圆形头像裁剪
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, 140, 60, 120, 120);
        ctx.restore();

        // 名字
        ctx.fillStyle = '#333';
        ctx.font = 'bold 24px "NotoSansSC"';
        ctx.fillText(name, 50, 220);

        // 描述
        ctx.font = '18px "NotoSansSC"';
        drawMultilineText(ctx, description, 50, 260, 300, 26);

        // 输出为 PNG stream
        res.setHeader('Content-Type', 'image/png');
        canvas.pngStream().pipe(res);
    } catch (err) {
        console.error('🛑 卡牌生成失败:', err);
        res.status(500).json({ error: 'Card generation failed' });
    }
});

// 多行换行工具
function drawMultilineText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    let line = '';
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

module.exports = router;
