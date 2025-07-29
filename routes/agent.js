// Utility function: Generate personality summary using GPT-3.5
async function generatePersonalitySummary(conversationText) {
    const messages = [
        {
            role: "system",
            content: `You're an AI summarizer. Based on the user's chat history, generate a short first-person summary of their personality and include their name if it's mentioned (e.g., \"I'm James...\"). Keep it natural, a little witty, and no more than 2-3 sentences. Don't sound robotic.`
        },
        {
            role: "user",
            content: conversationText.slice(-16000)
        }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages
    });

    return completion.choices[0].message.content;
}

// Utility function: Classify traits (hobbies, achievements, other traits) from conversation using GPT-3.5
async function classifyTraitsFromConversation(conversationText) {
    const messages = [
        {
            role: "system",
            content: `You are a trait classifier. From the user's chat history, extract the following fields:\n1. hobbies\n2. achievements\n3. other_traits\nReturn a JSON object like:\n{\n  \"hobbies\": \"...\",\n  \"achievements\": \"...\",\n  \"other_traits\": \"...\"\n}`
        },
        {
            role: "user",
            content: conversationText.slice(-16000)
        }
    ];

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages
    });

    const raw = completion.choices[0].message.content;
    const jsonMatch = raw.match(/\{[\s\S]*?\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}
async function generateCard({ name, photoUrl, description }, outputPath) {
    const width = 800;
    const height = 1000;

    // 1. 初始化 pureimage 画布
    const img = PImage.make(width, height);
    const ctx = img.getContext('2d');

    // 2. 背景填充
    ctx.fillStyle = '#fde4ec'; // 粉色背景
    ctx.fillRect(0, 0, width, height);

    // 3. 写文字（名字）


    ctx.font = '32pt OpenSans';
    ctx.fillStyle = '#222';
    ctx.fillText(`Your date: ${name}`, 280, 120);

    // 4. 写描述文字
    ctx.font = '20pt OpenSans';
    wrapText(ctx, description, 280, 180, 420, 30);

    // 5. 用 Jimp 加载头像 + 画到 pureimage 上
    const avatar = await Jimp.read(photoUrl);
    avatar.resize(240, 240);
    const circular = await circularCrop(avatar);

    circular.scan(0, 0, circular.bitmap.width, circular.bitmap.height, function (x, y, idx) {
        const r = this.bitmap.data[idx];
        const g = this.bitmap.data[idx + 1];
        const b = this.bitmap.data[idx + 2];
        const a = this.bitmap.data[idx + 3];
        ctx.setPixelColor(PImage.rgbaToInt(r, g, b, a), 80 + x, 80 + y);

    });

    // 6. 保存输出
    await PImage.encodePNGToStream(img, fs.createWriteStream(outputPath));
}
async function circularCrop(image) {
    const size = image.bitmap.width;
    const mask = await new Jimp(size, size, 0x00000000);
    mask.scan(0, 0, size, size, function (x, y, idx) {
        const dx = x - size / 2;
        const dy = y - size / 2;
        if (dx * dx + dy * dy <= (size / 2) ** 2) {
            this.bitmap.data[idx + 3] = 255;
        }
    });
    return image.mask(mask, 0, 0);
}

// Express router setup
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { Pinecone } = require('@pinecone-database/pinecone');
const OpenAI = require('openai');
require('dotenv').config();
const path = require('path');
const PImage = require('pureimage');
const Jimp = require('jimp');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

router.post('/respond', async (req, res) => {
    const { user_id, message } = req.body;
    if (!user_id || !message) return res.status(400).json({ error: 'user_id and message required' });

    try {
        // Embed the incoming message
        const embedResp = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: message
        });
        const inputVector = embedResp.data[0].embedding;

        // Retrieve the user's latest chat_history vector
        const vectorQuery = await pineconeIndex.query({
            vector: inputVector,
            topK: 1,
            filter: { user_id: user_id.toString(), source: "chat_history" },
            includeMetadata: true
        });

        const vector = vectorQuery.matches?.[0];
        const createdAt = vector?.metadata?.created_at || "";
        const personalitySummary = vector?.metadata?.summary || "I'm still learning about the user, but they seem thoughtful and expressive.";

        // Retrieve recent chat context
        const chatHistory = await pool.query(
            `SELECT sender, message FROM chat_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 6`,
            [user_id]
        );
        const contextMessages = chatHistory.rows.reverse().map(row => ({
            role: row.sender === 'user' ? 'user' : 'assistant',
            content: row.message
        }));

        const systemPrompt = `
You are a digital clone of user ${user_id}.
Speak exactly like they would — same tone, same language style, same emotional habits.
Speak in short, natural, and conversational sentences — like texting a friend.
Avoid sounding formal or generic. Inject personality: casual, witty, maybe sarcastic.
Use this personality snapshot:
[ Personality Summary as of ${createdAt} ]:
${personalitySummary}
NEVER say you're an AI. Stay in character.`.trim();

        const messages = [
            { role: "system", content: systemPrompt },
            ...contextMessages,
            { role: "user", content: message }
        ];

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages,
            max_tokens: 120,
            temperature: 0.7
        });

        const reply = response.choices[0].message.content;

        await pool.query(
            `INSERT INTO chat_history (user_id, sender, message) VALUES ($1, 'user', $2), ($1, 'ai', $3)`,
            [user_id, message, reply]
        );

        // Every 50 messages, update personality and shared traits embeddings
        const countResult = await pool.query(
            `SELECT COUNT(*) FROM chat_history WHERE user_id = $1`,
            [user_id]
        );
        const messageCount = parseInt(countResult.rows[0].count, 10);

        if (messageCount % 50 === 0) {
            const allChats = await pool.query(
                `SELECT sender, message FROM chat_history WHERE user_id = $1 AND sender = 'user' ORDER BY created_at ASC`,
                [user_id]
            );
            const conversationText = allChats.rows.map(r => `User: ${r.message}`).join('\n').slice(-16000);

            // Embed and update chat_history personality vector
            const embedSummary = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: conversationText
            });
            const summaryVector = embedSummary.data[0].embedding;
            const summaryText = await generatePersonalitySummary(conversationText);

            await pineconeIndex.upsert([
                {
                    id: `chat_summary_${user_id}_${Date.now()}`,
                    values: summaryVector,
                    metadata: {
                        user_id: user_id.toString(),
                        source: "chat_history",
                        created_at: new Date().toISOString(),
                        summary: summaryText
                    }
                }
            ]);

            // Classify and store shared_traits vector
            const traits = await classifyTraitsFromConversation(conversationText);
            if (traits) {
                const traitsText = [traits.hobbies, traits.achievements, traits.other_traits].filter(Boolean).join('\n');
                const traitsEmbedding = await openai.embeddings.create({
                    model: "text-embedding-3-small",
                    input: traitsText
                });
                await pineconeIndex.upsert([
                    {
                        id: `shared_traits_${user_id}_${Date.now()}`,
                        values: traitsEmbedding.data[0].embedding,
                        metadata: {
                            user_id: user_id.toString(),
                            source: "shared_traits",
                            shared: true,
                            hobbies: traits.hobbies,
                            achievements: traits.achievements,
                            other_traits: traits.other_traits,
                            created_at: new Date().toISOString()
                        }
                    }
                ]);
            }
        }

        res.json({ reply });
    } catch (error) {
        console.error("🔥 AI Agent error:", error);
        res.status(500).json({ error: "AI agent failed to respond." });
    }
});
router.post('/Gcard', async (req, res) => {
    const { name, description, photoUrl } = req.body;

    try {
        // 读取用户头像
        const avatar = await Jimp.read(photoUrl);
        avatar.resize(120, 120); // 缩小一点

        // 创建画布
        const width = 400;
        const height = 600;
        const img = PImage.make(width, height);
        const ctx = img.getContext('2d');

        // 背景
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);

        // 头像
        const buffer = await avatar.getBufferAsync(Jimp.MIME_PNG);
        const avatarImg = await PImage.decodePNGFromStream(BufferToStream(buffer));
        ctx.drawImage(avatarImg, 140, 40); // 居中

        // 使用默认字体（系统 fallback 字体）
        ctx.fillStyle = '#333';
        ctx.font = '24pt sans-serif';  // ✅ 不再加载任何文件
        ctx.fillText(name || 'Anonymous', 50, 200);

        ctx.font = '18pt sans-serif';
        drawMultilineText(ctx, description || '', 50, 250, 300, 24);

        // 检查 cards 文件夹存在性
        const cardsDir = path.join(__dirname, '../cards');
        if (!fs.existsSync(cardsDir)) {
            fs.mkdirSync(cardsDir, { recursive: true });
        }

        const fileName = `card_${uuidv4()}.png`;
        const filePath = path.join(cardsDir, fileName);
        const out = fs.createWriteStream(filePath);

        await PImage.encodePNGToStream(img, out);

        out.on('finish', () => {
            res.json({ url: `https://ccbackendx-2.onrender.com/cards/${fileName}` });
        });

    } catch (err) {
        console.error('生成失败:', err);
        res.status(500).json({ error: 'Card generation failed' });
    }
});


// 把 buffer 变成 stream 的工具函数
function BufferToStream(buffer) {
    const stream = require('stream');
    const duplex = new stream.Duplex();
    duplex.push(buffer);
    duplex.push(null);
    return duplex;
}

// 支持自动换行写字
function drawMultilineText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        const width = ctx.measureText(testLine).width;
        if (width > maxWidth && i > 0) {
            ctx.fillText(line, x, y);
            line = words[i] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

module.exports = router;
