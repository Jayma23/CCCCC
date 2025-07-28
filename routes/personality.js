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
        selected_cards,
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
                form_submitted = true,
                selected_cards = $8
            WHERE id = $9
        `;

        await pool.query(updateUserQuery, [
            name,
            mbti || null,
            age || null,
            gender || null,
            mainPhotoUrl,         // ✅ 将主图作为 photo 存进 users 表
            orientation || null,
            height || null,
            user_id,
            selected_cards || null
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
        photo_urls = []
    } = req.body;

    if (!user_id || !name) {
        return res.status(400).json({ error: 'Missing required fields: user_id, name' });
    }

    try {
        // 主图设为第 1 张有效图
        const primaryUrl = photo_urls.find(p => p) || null;

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
        for (let i = 0; i < photo_urls.length; i++) {
            const url = photo_urls[i];
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

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
        // 1. 获取基本用户信息和照片
        const userResult = await pool.query(`
            SELECT id, name, height, age, gender, sexual_orientation AS orientation, photo, selected_card_url
            FROM users
            WHERE id = $1
        `, [user_id]);

        if (userResult.rowCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // 2. 获取照片列表
        const photosResult = await pool.query(`
            SELECT photo_url
            FROM user_photos
            WHERE user_id = $1
            ORDER BY is_primary DESC, uploaded_at ASC
        `, [user_id]);

        const photo_urls = photosResult.rows.map(row => row.photo_url);
        while (photo_urls.length < 5) {
            photo_urls.push(null);
        }

        // 3. 获取详细档案信息
        const profileResult = await pool.query(`
            SELECT name, birthday, height, gender, sexual_orientation,
                   phone, zip_code, ethnicity
            FROM user_profiles WHERE user_id = $1
        `, [user_id]);

        // 4. 获取偏好设置
        const preferencesResult = await pool.query(`
            SELECT interested_in_genders, dating_intentions,
                   ethnicity_attraction, preferred_areas, age_min, age_max
            FROM user_preferences WHERE user_id = $1
        `, [user_id]);

        // 5. 获取个性信息
        const personalityResult = await pool.query(`
            SELECT about_me, hobbies, lifestyle, values,
                   future_goals, perfect_date, green_flags, red_flags,
                   physical_attraction_traits, extroversion_score
            FROM user_personality WHERE user_id = $1
        `, [user_id]);

        // 6. 整合所有数据
        const profile = profileResult.rows[0] || {};
        const preferences = preferencesResult.rows[0] || {};
        const personality = personalityResult.rows[0] || {};

        // 7. 构造questionnaire_answers格式
        const questionnaire_answers = {
            // 基本信息
            name: profile.name || user.name,
            phone: profile.phone || '',
            birthday: profile.birthday || '',
            gender: profile.gender || user.gender,
            sexuality: profile.sexual_orientation || user.orientation,
            ethnicity: profile.ethnicity || [],
            height: profile.height || user.height,
            zipCode: profile.zip_code || '',
            extroversion: personality.extroversion_score || 5,

            // 地区偏好
            selectedAreas: preferences.preferred_areas || [],

            // 约会偏好
            datingIntentions: preferences.dating_intentions || [],
            interestedIn: preferences.interested_in_genders || [],
            ethnicityAttraction: preferences.ethnicity_attraction || [],
            ageRange: [preferences.age_min || 18, preferences.age_max || 30],

            // 偏好描述
            greenFlags: personality.green_flags || '',
            redFlags: personality.red_flags || '',
            physicalAttraction: personality.physical_attraction_traits || '',

            // 个性描述
            hobbies: personality.hobbies || '',
            aboutMe: personality.about_me || '',
            lifestyle: personality.lifestyle || '',
            values: personality.values || '',
            futureGoals: personality.future_goals || '',
            perfectDate: personality.perfect_date || ''
        };

        // 8. 返回完整数据
        res.json({
            // 基本用户信息
            ...user,
            photo_urls,

            // 问卷答案（用于前端表单填充）
            questionnaire_answers
        });

    } catch (err) {
        console.error('❌ Error fetching profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/update-matching-profile', async (req, res) => {
    const { user_id, questionnaire_answers } = req.body;

    if (!user_id || !questionnaire_answers) {
        return res.status(400).json({ error: 'Missing user_id or questionnaire_answers' });
    }

    const {
        name, birthday, height, gender, sexuality, phone, zipCode,
        ethnicity = [], selectedAreas = [],
        interestedIn = [], datingIntentions = [], ethnicityAttraction = [], ageRange = [18, 30],
        greenFlags = '', redFlags = '', physicalAttraction = '',
        aboutMe = '', hobbies = '', lifestyle = '', values = '',
        futureGoals = '', perfectDate = '', extroversion = 5
    } = questionnaire_answers;

    try {
        await pool.query('BEGIN');

        // 更新 user_profiles
        await pool.query(`
            INSERT INTO user_profiles (
                user_id, name, birthday, height, gender, sexual_orientation,
                phone, zip_code, ethnicity
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
            ON CONFLICT (user_id) DO UPDATE SET
                name = EXCLUDED.name,
                birthday = EXCLUDED.birthday,
                height = EXCLUDED.height,
                gender = EXCLUDED.gender,
                sexual_orientation = EXCLUDED.sexual_orientation,
                phone = EXCLUDED.phone,
                zip_code = EXCLUDED.zip_code,
                ethnicity = EXCLUDED.ethnicity,
                updated_at = NOW()
        `, [user_id, name, birthday || null, height, gender, sexuality, phone, zipCode, ethnicity]);

        // 更新 user_preferences
        await pool.query(`
            INSERT INTO user_preferences (
                user_id, interested_in_genders, dating_intentions,
                ethnicity_attraction, preferred_areas, age_min, age_max
            ) VALUES ($1,$2,$3,$4,$5,$6,$7)
            ON CONFLICT (user_id) DO UPDATE SET
                interested_in_genders = EXCLUDED.interested_in_genders,
                dating_intentions = EXCLUDED.dating_intentions,
                ethnicity_attraction = EXCLUDED.ethnicity_attraction,
                preferred_areas = EXCLUDED.preferred_areas,
                age_min = EXCLUDED.age_min,
                age_max = EXCLUDED.age_max,
                updated_at = NOW()
        `, [user_id, interestedIn, datingIntentions, ethnicityAttraction, selectedAreas, ageRange[0], ageRange[1]]);

        // 更新 user_personality
        await pool.query(`
            INSERT INTO user_personality (
                user_id, about_me, hobbies, lifestyle, values,
                future_goals, perfect_date, green_flags, red_flags,
                physical_attraction_traits, extroversion_score, completed_at
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                about_me = EXCLUDED.about_me,
                hobbies = EXCLUDED.hobbies,
                lifestyle = EXCLUDED.lifestyle,
                values = EXCLUDED.values,
                future_goals = EXCLUDED.future_goals,
                perfect_date = EXCLUDED.perfect_date,
                green_flags = EXCLUDED.green_flags,
                red_flags = EXCLUDED.red_flags,
                physical_attraction_traits = EXCLUDED.physical_attraction_traits,
                extroversion_score = EXCLUDED.extroversion_score,
                completed_at = NOW()
        `, [user_id, aboutMe, hobbies, lifestyle, values, futureGoals, perfectDate, greenFlags, redFlags, physicalAttraction, extroversion]);

        await pool.query('COMMIT');
        res.json({ message: 'Matching profile updated successfully' });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('❌ Error updating matching profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/save-profile', async (req, res) => {
    const { user_id, questionnaire_answers } = req.body;

    if (!user_id || !questionnaire_answers) {
        return res.status(400).json({ error: 'Missing user_id or questionnaire_answers' });
    }

    const {
        name, birthday, height, gender, sexual_orientation, phone, zipCode,
        ethnicity = [], selectedAreas = [],
        interestedIn = [], datingIntentions = [], ethnicityAttraction = [], ageRange = [18, 30],
        greenFlags = '', redFlags = '', physicalAttraction = '',
        aboutMe = '', hobbies = '', lifestyle = '', values = '',
        futureGoals = '', perfectDate = '', extroversion = 5
    } = questionnaire_answers;

    try {
        await pool.query('BEGIN');

        // user_profiles
        await pool.query(`
      INSERT INTO user_profiles (
        user_id, name, birthday, height, gender, sexual_orientation,
        phone, zip_code, ethnicity
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (user_id) DO UPDATE SET
        name = EXCLUDED.name,
        birthday = EXCLUDED.birthday,
        height = EXCLUDED.height,
        gender = EXCLUDED.gender,
        sexual_orientation = EXCLUDED.sexual_orientation,
        phone = EXCLUDED.phone,
        zip_code = EXCLUDED.zip_code,
        ethnicity = EXCLUDED.ethnicity
    `, [user_id, name, birthday || null, height, gender, sexual_orientation, phone, zipCode, ethnicity]);

        // user_preferences
        await pool.query(`
      INSERT INTO user_preferences (
        user_id, interested_in_genders, dating_intentions,
        ethnicity_attraction, preferred_areas, age_min, age_max
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id) DO UPDATE SET
        interested_in_genders = EXCLUDED.interested_in_genders,
        dating_intentions = EXCLUDED.dating_intentions,
        ethnicity_attraction = EXCLUDED.ethnicity_attraction,
        preferred_areas = EXCLUDED.preferred_areas,
        age_min = EXCLUDED.age_min,
        age_max = EXCLUDED.age_max
    `, [user_id, interestedIn, datingIntentions, ethnicityAttraction, selectedAreas, ageRange[0], ageRange[1]]);

        // user_personality
        await pool.query(`
      INSERT INTO user_personality (
        user_id, about_me, hobbies, lifestyle, values,
        future_goals, perfect_date, green_flags, red_flags,
        physical_attraction_traits, extroversion_score, completed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        about_me = EXCLUDED.about_me,
        hobbies = EXCLUDED.hobbies,
        lifestyle = EXCLUDED.lifestyle,
        values = EXCLUDED.values,
        future_goals = EXCLUDED.future_goals,
        perfect_date = EXCLUDED.perfect_date,
        green_flags = EXCLUDED.green_flags,
        red_flags = EXCLUDED.red_flags,
        physical_attraction_traits = EXCLUDED.physical_attraction_traits,
        extroversion_score = EXCLUDED.extroversion_score,
        completed_at = NOW()
    `, [user_id, aboutMe, hobbies, lifestyle, values, futureGoals, perfectDate, greenFlags, redFlags, physicalAttraction, extroversion]);

        await pool.query('COMMIT');
        res.json({ message: 'Profile saved successfully' });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error('❌ Error saving profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/get__profile/:user_id', async (req, res) => {
    const user_id = req.params.user_id;

    if (!user_id) {
        return res.status(400).json({ error: 'Missing user_id' });
    }

    try {
        // 1. 查询 user_profiles
        const profileResult = await pool.query(`
            SELECT name, birthday, height, gender, sexual_orientation,
                   phone, zip_code, ethnicity
            FROM user_profiles WHERE user_id = $1
        `, [user_id]);

        // 2. 查询 user_preferences
        const preferencesResult = await pool.query(`
            SELECT interested_in_genders, dating_intentions,
                   ethnicity_attraction, preferred_areas, age_min, age_max
            FROM user_preferences WHERE user_id = $1
        `, [user_id]);

        // 3. 查询 user_personality
        const personalityResult = await pool.query(`
            SELECT about_me, hobbies, lifestyle, values,
                   future_goals, perfect_date, green_flags, red_flags,
                   physical_attraction_traits, extroversion_score
            FROM user_personality WHERE user_id = $1
        `, [user_id]);

        // 如果都没有数据，返回提示
        if (
            profileResult.rows.length === 0 &&
            preferencesResult.rows.length === 0 &&
            personalityResult.rows.length === 0
        ) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        // 统一整合返回
        const result = {
            user_id,
            ...profileResult.rows[0],
            ...preferencesResult.rows[0],
            ...personalityResult.rows[0],
        };

        res.json(result);

    } catch (err) {
        console.error('❌ Error fetching profile:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});





module.exports = router;
