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
                form_submitted = true 
            WHERE id = $8
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
router.post("/preference", async (req, res) => {
    console.log('📥 Incoming profile data:', req.body);
    const {
        distance,
        user_id,
        photo_urls,


    } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id or name." });
    }

    try {


        // ✅ Step 1: 更新 users 表
        const updateUserQuery = `
            UPDATE users
            SET
                 distance = $1,
                 selected_card_url = $2
                
            WHERE id = $3
        `;

        await pool.query(updateUserQuery, [

             distance || 0,
            photo_urls || null,
            user_id

        ]);

        // ✅ Step 2: 删除旧照片记录


        res.json({ message: "User profile and photos saved successfully." });
    } catch (error) {
        console.error("Error saving profile:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

// 新增：完整的用户数据处理和embedding上传路由
router.post("/process-user-embedding", async (req, res) => {
    console.log('📥 Processing user embedding data:', req.body);
    const { user_id } = req.body;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        // 1. 从各个数据库表获取用户完整数据
        const userData = await getUserCompleteData(user_id);
        
        if (!userData) {
            return res.status(404).json({ error: "User data not found." });
        }

        // 2. 生成embedding文本
        const embeddingText = generateEmbeddingText(userData);
        
        // 3. 获取embedding向量
        const embeddingResponse = await openai.embeddings.create({
            input: embeddingText,
            model: 'text-embedding-3-small'
        });

        const vector = embeddingResponse.data[0].embedding;

        // 4. 上传到Pinecone（使用用户ID作为唯一标识）
        await pineconeIndex.upsert([
            {
                id: `user_${user_id}`,
                values: vector,
                metadata: { 
                    user_id,
                    name: userData.name,
                    age: userData.age,
                    gender: userData.gender,
                    orientation: userData.orientation,
                    timestamp: new Date().toISOString()
                }
            }
        ]);

        // 5. 保存到用户专属的完整档案表
        await saveUserCompleteProfile(user_id, userData, vector, embeddingText);

        res.json({ 
            success: true,
            message: "User embedding processed and saved successfully",
            user_id,
            embedding_length: vector.length
        });

    } catch (error) {
        console.error('❌ Error processing user embedding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 新增：处理personality上传的数据并存储到对应数据库
router.post("/upload-personality-data", async (req, res) => {
    console.log('📥 Uploading personality data:', req.body);
    const { 
        user_id, 
        data_name, 
        data_content,
        data_type = 'text' // 支持 text, array, object 等类型
    } = req.body;

    if (!user_id || !data_name || data_content === undefined) {
        return res.status(400).json({ 
            error: "Missing required fields: user_id, data_name, data_content" 
        });
    }

    try {
        // 根据数据名称确定存储位置
        const result = await storePersonalityData(user_id, data_name, data_content, data_type);
        
        res.json({
            success: true,
            message: `Data '${data_name}' stored successfully for user ${user_id}`,
            user_id,
            data_name,
            stored_in: result.table_name
        });

    } catch (error) {
        console.error('❌ Error uploading personality data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 新增：批量上传personality数据
router.post("/upload-batch-personality-data", async (req, res) => {
    console.log('📥 Uploading batch personality data:', req.body);
    const { user_id, data_items } = req.body;

    if (!user_id || !data_items || !Array.isArray(data_items)) {
        return res.status(400).json({ 
            error: "Missing required fields: user_id, data_items (array)" 
        });
    }

    try {
        const results = [];
        
        for (const item of data_items) {
            const { data_name, data_content, data_type = 'text' } = item;
            
            if (!data_name || data_content === undefined) {
                results.push({ 
                    data_name, 
                    status: 'error', 
                    error: 'Missing data_name or data_content' 
                });
                continue;
            }

            try {
                const result = await storePersonalityData(user_id, data_name, data_content, data_type);
                results.push({ 
                    data_name, 
                    status: 'success', 
                    stored_in: result.table_name 
                });
            } catch (error) {
                results.push({ 
                    data_name, 
                    status: 'error', 
                    error: error.message 
                });
            }
        }

        res.json({
            success: true,
            message: `Batch upload completed for user ${user_id}`,
            user_id,
            results
        });

    } catch (error) {
        console.error('❌ Error uploading batch personality data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 新增：获取用户的所有personality数据
router.get("/user-personality-data/:user_id", async (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        // 获取所有相关表的数据
        const userData = await getUserCompleteData(user_id);
        
        if (!userData) {
            return res.status(404).json({ error: "User data not found." });
        }

        // 格式化返回数据
        const formattedData = {
            user_id,
            basic_info: {
                name: userData.name,
                age: userData.age,
                gender: userData.gender,
                orientation: userData.orientation,
                height: userData.height,
                mbti: userData.mbti,
                photo: userData.photo
            },
            contact_info: {
                phone: userData.phone,
                zip_code: userData.zip_code,
                birthday: userData.birthday,
                ethnicity: userData.ethnicity
            },
            preferences: {
                interested_in_genders: userData.interested_in_genders,
                dating_intentions: userData.dating_intentions,
                ethnicity_attraction: userData.ethnicity_attraction,
                preferred_areas: userData.preferred_areas,
                age_range: userData.age_range
            },
            personality: {
                about_me: userData.about_me,
                hobbies: userData.hobbies,
                lifestyle: userData.lifestyle,
                values: userData.values,
                future_goals: userData.future_goals,
                perfect_date: userData.perfect_date,
                green_flags: userData.green_flags,
                red_flags: userData.red_flags,
                physical_attraction_traits: userData.physical_attraction_traits,
                extroversion_score: userData.extroversion_score
            },
            photos: userData.photos
        };

        res.json(formattedData);

    } catch (error) {
        console.error('❌ Error fetching user personality data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 新增：删除用户的特定personality数据
router.delete("/delete-personality-data", async (req, res) => {
    const { user_id, data_name } = req.body;

    if (!user_id || !data_name) {
        return res.status(400).json({ 
            error: "Missing required fields: user_id, data_name" 
        });
    }

    try {
        const result = await deletePersonalityData(user_id, data_name);
        
        res.json({
            success: true,
            message: `Data '${data_name}' deleted successfully for user ${user_id}`,
            user_id,
            data_name,
            deleted_from: result.table_name
        });

    } catch (error) {
        console.error('❌ Error deleting personality data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 辅助函数：从各个数据库表获取用户完整数据
async function getUserCompleteData(user_id) {
    try {
        // 获取基本用户信息
        const userResult = await pool.query(`
            SELECT id, name, age, gender, sexual_orientation as orientation, 
                   height, photo, mbti, form_submitted
            FROM users 
            WHERE id = $1
        `, [user_id]);

        if (userResult.rows.length === 0) {
            return null;
        }

        const user = userResult.rows[0];

        // 获取用户照片
        const photosResult = await pool.query(`
            SELECT photo_url, is_primary
            FROM user_photos 
            WHERE user_id = $1
            ORDER BY is_primary DESC, uploaded_at ASC
        `, [user_id]);

        // 获取详细档案信息
        const profileResult = await pool.query(`
            SELECT name, birthday, height, gender, sexual_orientation,
                   phone, zip_code, ethnicity
            FROM user_profiles 
            WHERE user_id = $1
        `, [user_id]);

        // 获取偏好设置
        const preferencesResult = await pool.query(`
            SELECT interested_in_genders, dating_intentions,
                   ethnicity_attraction, preferred_areas, age_min, age_max
            FROM user_preferences 
            WHERE user_id = $1
        `, [user_id]);

        // 获取个性信息
        const personalityResult = await pool.query(`
            SELECT about_me, hobbies, lifestyle, values,
                   future_goals, perfect_date, green_flags, red_flags,
                   physical_attraction_traits, extroversion_score
            FROM user_personality 
            WHERE user_id = $1
        `, [user_id]);

        // 整合所有数据
        const profile = profileResult.rows[0] || {};
        const preferences = preferencesResult.rows[0] || {};
        const personality = personalityResult.rows[0] || {};
        const photos = photosResult.rows || [];

        return {
            // 基本信息
            user_id: user.id,
            name: profile.name || user.name,
            age: user.age,
            gender: profile.gender || user.gender,
            orientation: profile.sexual_orientation || user.orientation,
            height: profile.height || user.height,
            mbti: user.mbti,
            photo: user.photo,
            photos: photos,
            
            // 联系信息
            phone: profile.phone || '',
            zip_code: profile.zip_code || '',
            birthday: profile.birthday || '',
            ethnicity: profile.ethnicity || [],
            
            // 偏好设置
            interested_in_genders: preferences.interested_in_genders || [],
            dating_intentions: preferences.dating_intentions || [],
            ethnicity_attraction: preferences.ethnicity_attraction || [],
            preferred_areas: preferences.preferred_areas || [],
            age_range: [preferences.age_min || 18, preferences.age_max || 30],
            
            // 个性信息
            about_me: personality.about_me || '',
            hobbies: personality.hobbies || '',
            lifestyle: personality.lifestyle || '',
            values: personality.values || '',
            future_goals: personality.future_goals || '',
            perfect_date: personality.perfect_date || '',
            green_flags: personality.green_flags || '',
            red_flags: personality.red_flags || '',
            physical_attraction_traits: personality.physical_attraction_traits || '',
            extroversion_score: personality.extroversion_score || 5
        };
    } catch (error) {
        console.error('Error getting user complete data:', error);
        throw error;
    }
}

// 辅助函数：生成embedding文本
function generateEmbeddingText(userData) {
    const sections = [
        // 基本信息
        `Name: ${userData.name}`,
        `Age: ${userData.age}`,
        `Gender: ${userData.gender}`,
        `Orientation: ${userData.orientation}`,
        `Height: ${userData.height}`,
        `MBTI: ${userData.mbti || 'Not specified'}`,
        
        // 个性描述
        `About me: ${userData.about_me}`,
        `Hobbies: ${userData.hobbies}`,
        `Lifestyle: ${userData.lifestyle}`,
        `Values: ${userData.values}`,
        `Future goals: ${userData.future_goals}`,
        `Perfect date: ${userData.perfect_date}`,
        
        // 偏好和标志
        `Green flags: ${userData.green_flags}`,
        `Red flags: ${userData.red_flags}`,
        `Physical attraction traits: ${userData.physical_attraction_traits}`,
        
        // 约会偏好
        `Interested in: ${userData.interested_in_genders.join(', ')}`,
        `Dating intentions: ${userData.dating_intentions.join(', ')}`,
        `Preferred areas: ${userData.preferred_areas.join(', ')}`,
        `Age range: ${userData.age_range[0]}-${userData.age_range[1]}`,
        `Ethnicity attraction: ${userData.ethnicity_attraction.join(', ')}`,
        
        // 个人特征
        `Extroversion score: ${userData.extroversion_score}/10`,
        `Ethnicity: ${userData.ethnicity.join(', ')}`
    ];

    return sections.filter(section => section.split(': ')[1] && section.split(': ')[1] !== '').join('. ');
}

// 辅助函数：保存用户完整档案到数据库
async function saveUserCompleteProfile(user_id, userData, vector, embeddingText) {
    try {
        // 创建或更新用户完整档案表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_complete_profiles (
                user_id integer PRIMARY KEY,
                name VARCHAR(255),
                age INTEGER,
                gender VARCHAR(50),
                orientation VARCHAR(50),
                height INTEGER,
                mbti VARCHAR(10),
                photo TEXT,
                photos JSONB,
                phone VARCHAR(20),
                zip_code VARCHAR(10),
                birthday DATE,
                ethnicity TEXT[],
                interested_in_genders TEXT[],
                dating_intentions TEXT[],
                ethnicity_attraction TEXT[],
                preferred_areas TEXT[],
                age_range INTEGER[],
                about_me TEXT,
                hobbies TEXT,
                lifestyle TEXT,
                values TEXT,
                future_goals TEXT,
                perfect_date TEXT,
                green_flags TEXT,
                red_flags TEXT,
                physical_attraction_traits TEXT,
                extroversion_score INTEGER,
                embedding_text TEXT,
                embedding_vector JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // 插入或更新用户完整档案
        await pool.query(`
            INSERT INTO user_complete_profiles (
                user_id, name, age, gender, orientation, height, mbti, photo, photos,
                phone, zip_code, birthday, ethnicity,
                interested_in_genders, dating_intentions, ethnicity_attraction, 
                preferred_areas, age_range,
                about_me, hobbies, lifestyle, values, future_goals, perfect_date,
                green_flags, red_flags, physical_attraction_traits, extroversion_score,
                embedding_text, embedding_vector, updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9,
                $10, $11, $12, $13,
                $14, $15, $16, $17, $18,
                $19, $20, $21, $22, $23, $24,
                $25, $26, $27, $28,
                $29, $30, NOW()
            )
            ON CONFLICT (user_id) DO UPDATE SET
                name = EXCLUDED.name,
                age = EXCLUDED.age,
                gender = EXCLUDED.gender,
                orientation = EXCLUDED.orientation,
                height = EXCLUDED.height,
                mbti = EXCLUDED.mbti,
                photo = EXCLUDED.photo,
                photos = EXCLUDED.photos,
                phone = EXCLUDED.phone,
                zip_code = EXCLUDED.zip_code,
                birthday = EXCLUDED.birthday,
                ethnicity = EXCLUDED.ethnicity,
                interested_in_genders = EXCLUDED.interested_in_genders,
                dating_intentions = EXCLUDED.dating_intentions,
                ethnicity_attraction = EXCLUDED.ethnicity_attraction,
                preferred_areas = EXCLUDED.preferred_areas,
                age_range = EXCLUDED.age_range,
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
                embedding_text = EXCLUDED.embedding_text,
                embedding_vector = EXCLUDED.embedding_vector,
                updated_at = NOW()
        `, [
            user_id, userData.name, userData.age, userData.gender, userData.orientation,
            userData.height, userData.mbti, userData.photo, JSON.stringify(userData.photos),
            userData.phone, userData.zip_code, userData.birthday, userData.ethnicity,
            userData.interested_in_genders, userData.dating_intentions, userData.ethnicity_attraction,
            userData.preferred_areas, userData.age_range,
            userData.about_me, userData.hobbies, userData.lifestyle, userData.values,
            userData.future_goals, userData.perfect_date,
            userData.green_flags, userData.red_flags, userData.physical_attraction_traits,
            userData.extroversion_score,
            embeddingText, JSON.stringify(vector)
        ]);

        console.log(`✅ User complete profile saved for user: ${user_id}`);
    } catch (error) {
        console.error('Error saving user complete profile:', error);
        throw error;
    }
}

// 新增：获取用户embedding信息的路由
router.get("/user-embedding/:user_id", async (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        // 从Pinecone获取embedding
        const pineconeResult = await pineconeIndex.fetch([`user_${user_id}`]);
        
        // 从数据库获取完整档案
        const dbResult = await pool.query(`
            SELECT * FROM user_complete_profiles WHERE user_id = $1
        `, [user_id]);

        if (dbResult.rows.length === 0) {
            return res.status(404).json({ error: "User profile not found." });
        }

        const userProfile = dbResult.rows[0];
        const embedding = pineconeResult.vectors[`user_${user_id}`];

        res.json({
            user_id,
            profile: userProfile,
            embedding: embedding ? {
                id: embedding.id,
                values: embedding.values,
                metadata: embedding.metadata
            } : null
        });

    } catch (error) {
        console.error('❌ Error fetching user embedding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 新增：批量处理所有用户的embedding
router.post("/process-all-users-embedding", async (req, res) => {
    try {
        // 获取所有已提交表单的用户
        const usersResult = await pool.query(`
            SELECT id FROM users WHERE form_submitted = true
        `);

        const results = [];
        for (const user of usersResult.rows) {
            try {
                // 处理每个用户的embedding
                const userData = await getUserCompleteData(user.id);
                if (userData) {
                    const embeddingText = generateEmbeddingText(userData);
                    const embeddingResponse = await openai.embeddings.create({
                        input: embeddingText,
                        model: 'text-embedding-3-small'
                    });
                    const vector = embeddingResponse.data[0].embedding;

                    // 上传到Pinecone
                    await pineconeIndex.upsert([
                        {
                            id: `user_${user.id}`,
                            values: vector,
                            metadata: { 
                                user_id: user.id,
                                name: userData.name,
                                age: userData.age,
                                gender: userData.gender,
                                orientation: userData.orientation,
                                timestamp: new Date().toISOString()
                            }
                        }
                    ]);

                    // 保存到数据库
                    await saveUserCompleteProfile(user.id, userData, vector, embeddingText);

                    results.push({ user_id: user.id, status: 'success' });
                }
            } catch (error) {
                console.error(`Error processing user ${user.id}:`, error);
                results.push({ user_id: user.id, status: 'error', error: error.message });
            }
        }

        res.json({
            success: true,
            message: `Processed ${results.length} users`,
            results
        });

    } catch (error) {
        console.error('❌ Error processing all users embedding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 辅助函数：删除用户的特定数据
async function deletePersonalityData(user_id, data_name) {
    try {
        // 数据名称到数据库表的映射（与存储时相同）
        const dataMapping = {
            'name': { table: 'users', column: 'name' },
            'age': { table: 'users', column: 'age' },
            'gender': { table: 'users', column: 'gender' },
            'height': { table: 'users', column: 'height' },
            'mbti': { table: 'users', column: 'mbti' },
            'orientation': { table: 'users', column: 'sexual_orientation' },
            'photo': { table: 'users', column: 'photo' },
            'birthday': { table: 'user_profiles', column: 'birthday' },
            'phone': { table: 'user_profiles', column: 'phone' },
            'zip_code': { table: 'user_profiles', column: 'zip_code' },
            'ethnicity': { table: 'user_profiles', column: 'ethnicity' },
            'interested_in_genders': { table: 'user_preferences', column: 'interested_in_genders' },
            'dating_intentions': { table: 'user_preferences', column: 'dating_intentions' },
            'ethnicity_attraction': { table: 'user_preferences', column: 'ethnicity_attraction' },
            'preferred_areas': { table: 'user_preferences', column: 'preferred_areas' },
            'age_min': { table: 'user_preferences', column: 'age_min' },
            'age_max': { table: 'user_preferences', column: 'age_max' },
            'about_me': { table: 'user_personality', column: 'about_me' },
            'hobbies': { table: 'user_personality', column: 'hobbies' },
            'lifestyle': { table: 'user_personality', column: 'lifestyle' },
            'values': { table: 'user_personality', column: 'values' },
            'future_goals': { table: 'user_personality', column: 'future_goals' },
            'perfect_date': { table: 'user_personality', column: 'perfect_date' },
            'green_flags': { table: 'user_personality', column: 'green_flags' },
            'red_flags': { table: 'user_personality', column: 'red_flags' },
            'physical_attraction_traits': { table: 'user_personality', column: 'physical_attraction_traits' },
            'extroversion_score': { table: 'user_personality', column: 'extroversion_score' }
        };

        const mapping = dataMapping[data_name];
        if (!mapping) {
            throw new Error(`Unknown data name: ${data_name}`);
        }

        const { table, column } = mapping;
        
        // 将字段设置为NULL或默认值
        if (table === 'users') {
            await pool.query(`
                UPDATE users 
                SET ${column} = NULL, updated_at = NOW()
                WHERE id = $1
            `, [user_id]);
        } else {
            await pool.query(`
                UPDATE ${table} 
                SET ${column} = NULL, updated_at = NOW()
                WHERE user_id = $1
            `, [user_id]);
        }

        console.log(`✅ Data '${data_name}' deleted from ${table}.${column} for user ${user_id}`);
        
        return { table_name: table, column_name: column };

    } catch (error) {
        console.error('Error deleting personality data:', error);
        throw error;
    }
}

// 辅助函数：根据数据名称存储到对应的数据库表
async function storePersonalityData(user_id, data_name, data_content, data_type) {
    try {
        // 数据名称到数据库表的映射
        const dataMapping = {
            // 基本信息
            'name': { table: 'users', column: 'name' },
            'age': { table: 'users', column: 'age' },
            'gender': { table: 'users', column: 'gender' },
            'height': { table: 'users', column: 'height' },
            'mbti': { table: 'users', column: 'mbti' },
            'orientation': { table: 'users', column: 'sexual_orientation' },
            'photo': { table: 'users', column: 'photo' },
            
            // 详细档案信息
            'birthday': { table: 'user_profiles', column: 'birthday' },
            'phone': { table: 'user_profiles', column: 'phone' },
            'zip_code': { table: 'user_profiles', column: 'zip_code' },
            'ethnicity': { table: 'user_profiles', column: 'ethnicity' },
            
            // 偏好设置
            'interested_in_genders': { table: 'user_preferences', column: 'interested_in_genders' },
            'dating_intentions': { table: 'user_preferences', column: 'dating_intentions' },
            'ethnicity_attraction': { table: 'user_preferences', column: 'ethnicity_attraction' },
            'preferred_areas': { table: 'user_preferences', column: 'preferred_areas' },
            'age_min': { table: 'user_preferences', column: 'age_min' },
            'age_max': { table: 'user_preferences', column: 'age_max' },
            
            // 个性信息
            'about_me': { table: 'user_personality', column: 'about_me' },
            'hobbies': { table: 'user_personality', column: 'hobbies' },
            'lifestyle': { table: 'user_personality', column: 'lifestyle' },
            'values': { table: 'user_personality', column: 'values' },
            'future_goals': { table: 'user_personality', column: 'future_goals' },
            'perfect_date': { table: 'user_personality', column: 'perfect_date' },
            'green_flags': { table: 'user_personality', column: 'green_flags' },
            'red_flags': { table: 'user_personality', column: 'red_flags' },
            'physical_attraction_traits': { table: 'user_personality', column: 'physical_attraction_traits' },
            'extroversion_score': { table: 'user_personality', column: 'extroversion_score' }
        };

        const mapping = dataMapping[data_name];
        if (!mapping) {
            throw new Error(`Unknown data name: ${data_name}`);
        }

        const { table, column } = mapping;
        
        // 处理数据内容
        let processedContent = data_content;
        if (data_type === 'array' && typeof data_content === 'string') {
            try {
                processedContent = JSON.parse(data_content);
            } catch (e) {
                processedContent = data_content.split(',').map(item => item.trim());
            }
        } else if (data_type === 'object' && typeof data_content === 'string') {
            try {
                processedContent = JSON.parse(data_content);
            } catch (e) {
                processedContent = data_content;
            }
        }

        // 根据表名执行不同的插入/更新操作
        if (table === 'users') {
            await pool.query(`
                UPDATE users 
                SET ${column} = $1, updated_at = NOW()
                WHERE id = $2
            `, [processedContent, user_id]);
        } else {
            // 对于其他表，使用 UPSERT 操作
            const upsertQuery = `
                INSERT INTO ${table} (user_id, ${column}, created_at, updated_at)
                VALUES ($1, $2, NOW(), NOW())
                ON CONFLICT (user_id) DO UPDATE SET
                    ${column} = EXCLUDED.${column},
                    updated_at = NOW()
            `;
            await pool.query(upsertQuery, [user_id, processedContent]);
        }

        console.log(`✅ Data '${data_name}' stored in ${table}.${column} for user ${user_id}`);
        
        return { table_name: table, column_name: column };

    } catch (error) {
        console.error('Error storing personality data:', error);
        throw error;
    }
}


module.exports = router;
