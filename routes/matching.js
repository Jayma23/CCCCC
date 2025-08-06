const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const OpenAI = require("openai");
require("dotenv").config();

// PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// 1. Bind matched users to prevent them from appearing in other matches
router.post("/bind-matched-users", async (req, res) => {
    console.log('🔗 Binding matched users:', req.body);
    const { user1_id, user2_id, match_score, match_analysis } = req.body;

    if (!user1_id || !user2_id) {
        return res.status(400).json({ 
            error: "Missing required fields: user1_id, user2_id" 
        });
    }

    if (user1_id === user2_id) {
        return res.status(400).json({ 
            error: "Cannot bind user with themselves" 
        });
    }

    // Check if similarity score reaches 50%
    if (!match_score || match_score < 50) {
        return res.status(400).json({ 
            error: "Match score must be at least 50% to bind users. Current score: " + (match_score || 0) + "%" 
        });
    }

    try {
        // Check if users are already matched
        const existingMatch = await pool.query(`
            SELECT * FROM user_matches 
            WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)
        `, [user1_id, user2_id]);

        if (existingMatch.rows.length > 0) {
            return res.status(400).json({ 
                error: "Users are already matched" 
            });
        }

        // Create match binding record
        await pool.query(`
            INSERT INTO user_matches (user1_id, user2_id, match_score, match_analysis, is_bound)
            VALUES ($1, $2, $3, $4, true)
        `, [user1_id, user2_id, match_score, match_analysis || '']);

        // Update user status to matched
        await pool.query(`
            UPDATE users 
            SET match_status = 'matched', matched_at = NOW()
            WHERE id IN ($1, $2)
        `, [user1_id, user2_id]);

        // Get user information for notification
        const user1Info = await pool.query('SELECT name, photo FROM users WHERE id = $1', [user1_id]);
        const user2Info = await pool.query('SELECT name, photo FROM users WHERE id = $1', [user2_id]);

        // Generate personality summaries for both users
        const user1Data = await getUserCompleteData(user1_id);
        const user2Data = await getUserCompleteData(user2_id);
        const user1Personality = user1Data ? await generatePersonalitySummary(user1Data) : '';
        const user2Personality = user2Data ? await generatePersonalitySummary(user2Data) : '';

        res.json({
            success: true,
            message: "Users successfully bound together",
            user1: {
                ...user1Info.rows[0],
                personality_summary: user1Personality
            },
            user2: {
                ...user2Info.rows[0],
                personality_summary: user2Personality
            },
            match_score,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error binding matched users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 2. Update user match status (available/unavailable/matched)
router.put("/update-match-status", async (req, res) => {
    console.log('🔄 Updating user match status:', req.body);
    const { user_id, match_status } = req.body;

    if (!user_id || !match_status) {
        return res.status(400).json({ 
            error: "Missing required fields: user_id, match_status" 
        });
    }

    if (!['available', 'unavailable', 'matched'].includes(match_status)) {
        return res.status(400).json({ 
            error: "Invalid match_status. Must be 'available', 'unavailable', or 'matched'" 
        });
    }

    try {
        // Update user match status
        const result = await pool.query(`
            UPDATE users 
            SET match_status = $1, 
                status_updated_at = NOW()
            WHERE id = $2
            RETURNING id, name, match_status, status_updated_at
        `, [match_status, user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            success: true,
            message: "User match status updated successfully",
            user: result.rows[0],
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error updating user match status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 3. Generate personal summary and dating advice
router.post("/generate-personal-summary", async (req, res) => {
    console.log('📝 Generating personal summary:', req.body);
    const { user_id, target_user_id } = req.body;

    if (!user_id || !target_user_id) {
        return res.status(400).json({ 
            error: "Missing required fields: user_id, target_user_id" 
        });
    }

    try {
        // Get complete user information
        const userData = await getUserCompleteData(user_id);
        const targetUserData = await getUserCompleteData(target_user_id);

        if (!userData || !targetUserData) {
            return res.status(404).json({ error: "One or both users not found" });
        }

        // Generate personal summary
        const personalSummary = await generatePersonalSummary(userData);
        
        // Generate personality summary
        const personalitySummary = await generatePersonalitySummary(userData);
        
        // Generate dating advice
        const datingAdvice = await generateDatingAdvice(userData, targetUserData);

        // Get user photos
        const userPhotos = await getUserPhotos(user_id);
        const targetUserPhotos = await getUserPhotos(target_user_id);

        res.json({
            success: true,
            user_summary: personalSummary,
            personality_summary: personalitySummary,
            dating_advice: datingAdvice,
            user_photos: userPhotos,
            target_user_photos: targetUserPhotos,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error generating personal summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 4. Get complete user data
async function getUserCompleteData(user_id) {
    try {
        // Get basic user information
        const userResult = await pool.query(`
            SELECT id, name, age, gender, sexual_orientation as orientation, 
                   height, photo, mbti, form_submitted, match_status
            FROM users 
            WHERE id = $1
        `, [user_id]);

        if (userResult.rows.length === 0) {
            return null;
        }

        const user = userResult.rows[0];

        // Get detailed profile information
        const profileResult = await pool.query(`
            SELECT name, birthday, height, gender, sexual_orientation,
                   phone, zip_code, ethnicity
            FROM user_profiles 
            WHERE user_id = $1
        `, [user_id]);

        // Get preference settings
        const preferencesResult = await pool.query(`
            SELECT interested_in_genders, dating_intentions,
                   ethnicity_attraction, preferred_areas, age_min, age_max
            FROM user_preferences 
            WHERE user_id = $1
        `, [user_id]);

        // Get personality information
        const personalityResult = await pool.query(`
            SELECT about_me, hobbies, lifestyle, values,
                   future_goals, perfect_date, green_flags, red_flags,
                   physical_attraction_traits, extroversion_score
            FROM user_personality 
            WHERE user_id = $1
        `, [user_id]);

        // Integrate all data
        const profile = profileResult.rows[0] || {};
        const preferences = preferencesResult.rows[0] || {};
        const personality = personalityResult.rows[0] || {};

        return {
            user_id: user.id,
            name: profile.name || user.name,
            age: user.age,
            gender: profile.gender || user.gender,
            orientation: profile.sexual_orientation || user.orientation,
            height: profile.height || user.height,
            mbti: user.mbti,
            photo: user.photo,
            match_status: user.match_status,
            phone: profile.phone || '',
            zip_code: profile.zip_code || '',
            birthday: profile.birthday || '',
            ethnicity: profile.ethnicity || [],
            interested_in_genders: preferences.interested_in_genders || [],
            dating_intentions: preferences.dating_intentions || [],
            ethnicity_attraction: preferences.ethnicity_attraction || [],
            preferred_areas: preferences.preferred_areas || [],
            age_range: [preferences.age_min || 18, preferences.age_max || 30],
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

// 5. Generate personal summary
async function generatePersonalSummary(userData) {
    try {
        const prompt = `
Generate a concise personal summary (under 50 words) for the following user, highlighting their most attractive characteristics:

User Information:
- Name: ${userData.name}
- Age: ${userData.age} years old
- Gender: ${userData.gender}
- Personality: ${userData.mbti || 'Unknown'}
- Hobbies: ${userData.hobbies || 'None'}
- Personal Description: ${userData.about_me || 'None'}
- Ideal Date: ${userData.perfect_date || 'None'}
- Values: ${userData.values || 'None'}

Please generate an attractive personal summary that highlights their unique charm and personality traits.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a professional personal summary generator, skilled at describing a person's characteristics in a concise and interesting way."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 100,
            temperature: 0.7
        });

        return response.choices[0].message.content.trim();
        
    } catch (error) {
        console.error('Error generating personal summary:', error);
        return `${userData.name}, ${userData.age} years old, ${userData.gender}, looking forward to meeting you!`;
    }
}

// 6. Generate dating advice
async function generateDatingAdvice(userData, targetUserData) {
    try {
        const prompt = `
Based on the information of the following two users, provide 3-5 specific suggestions for their first date:

User A Information:
- Name: ${userData.name}
- Age: ${userData.age} years old
- Hobbies: ${userData.hobbies || 'None'}
- Ideal Date: ${userData.perfect_date || 'None'}
- Personality: ${userData.mbti || 'Unknown'}

User B Information:
- Name: ${targetUserData.name}
- Age: ${targetUserData.age} years old
- Hobbies: ${targetUserData.hobbies || 'None'}
- Ideal Date: ${targetUserData.perfect_date || 'None'}
- Personality: ${targetUserData.mbti || 'Unknown'}

Please provide:
1. Suitable date location suggestions
2. Conversation topic suggestions
3. Important reminders
4. Date timing suggestions

Please answer in English with practical and specific advice.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a professional dating consultant, skilled at providing personalized dating advice for people with different personalities and interests."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 300,
            temperature: 0.8
        });

        return response.choices[0].message.content.trim();
        
    } catch (error) {
        console.error('Error generating dating advice:', error);
        return "Suggest choosing a comfortable cafe or restaurant for the first meeting, maintain a relaxed and pleasant atmosphere, and learn more about each other's interests.";
    }
}

// 7. Get user photos
async function getUserPhotos(user_id) {
    try {
        const result = await pool.query(`
            SELECT photo_url, is_primary
            FROM user_photos 
            WHERE user_id = $1
            ORDER BY is_primary DESC, uploaded_at ASC
        `, [user_id]);

        return result.rows;
    } catch (error) {
        console.error('Error getting user photos:', error);
        return [];
    }
}

// 8. Generate personality summary
async function generatePersonalitySummary(userData) {
    try {
        const prompt = `
Generate a concise personality summary (under 60 words) for the following user, highlighting their key personality traits and characteristics:

User Information:
- Name: ${userData.name}
- Age: ${userData.age} years old
- Gender: ${userData.gender}
- MBTI: ${userData.mbti || 'Unknown'}
- Hobbies: ${userData.hobbies || 'None'}
- Lifestyle: ${userData.lifestyle || 'Not specified'}
- Values: ${userData.values || 'Not specified'}
- About Me: ${userData.about_me || 'Not specified'}
- Perfect Date: ${userData.perfect_date || 'Not specified'}
- Extroversion Score: ${userData.extroversion_score || 'Not specified'}

Please create an engaging personality summary that captures their unique character and what makes them special. Focus on their personality traits, interests, and what they're looking for in a relationship.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a professional personality analyst, skilled at creating engaging and accurate personality summaries that highlight a person's unique characteristics and charm."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 120,
            temperature: 0.7
        });

        return response.choices[0].message.content.trim();
        
    } catch (error) {
        console.error('Error generating personality summary:', error);
        return `${userData.name} is a ${userData.age}-year-old ${userData.gender} with a unique personality. They enjoy ${userData.hobbies || 'various activities'} and are looking for a meaningful connection.`;
    }
}

// Calculate match score
async function calculateMatchScore(user1, user2) {
    let totalScore = 0;
    let maxScore = 0;
    const scores = {};

    // 1. Basic preference matching (30%)
    const basicPreferenceScore = calculateBasicPreferenceScore(user1, user2);
    scores.basic_preference = basicPreferenceScore;
    totalScore += basicPreferenceScore * 0.3;
    maxScore += 100 * 0.3;

    // 2. Age matching (15%)
    const ageScore = calculateAgeScore(user1, user2);
    scores.age = ageScore;
    totalScore += ageScore * 0.15;
    maxScore += 100 * 0.15;

    // 3. Location matching (10%)
    const locationScore = calculateLocationScore(user1, user2);
    scores.location = locationScore;
    totalScore += locationScore * 0.1;
    maxScore += 100 * 0.1;

    // 4. Interests matching (15%)
    const interestsScore = calculateInterestsScore(user1, user2);
    scores.interests = interestsScore;
    totalScore += interestsScore * 0.15;
    maxScore += 100 * 0.15;

    // 5. Values matching (15%)
    const valuesScore = calculateValuesScore(user1, user2);
    scores.values = valuesScore;
    totalScore += valuesScore * 0.15;
    maxScore += 100 * 0.15;

    // 6. Personality matching (15%)
    const personalityScore = calculatePersonalityScore(user1, user2);
    scores.personality = personalityScore;
    totalScore += personalityScore * 0.15;
    maxScore += 100 * 0.15;

    const finalScore = Math.round((totalScore / maxScore) * 100);
    scores.final = finalScore;

    return {
        overall: finalScore,
        breakdown: scores
    };
}

// Calculate basic preference match score
function calculateBasicPreferenceScore(user1, user2) {
    let score = 0;
    let totalChecks = 0;

    // Check gender preferences
    if (user1.interested_in_genders && user1.interested_in_genders.includes(user2.gender) && 
        user2.interested_in_genders && user2.interested_in_genders.includes(user1.gender)) {
        score += 40;
    }
    totalChecks++;

    // Check sexual orientation compatibility with proper gender matching
    const isCompatible = checkOrientationCompatibility(user1, user2);
    if (isCompatible) {
        score += 30;
    }
    totalChecks++;

    // Check dating intentions
    if (user1.dating_intentions && user2.dating_intentions) {
        const commonIntentions = user1.dating_intentions.filter(intention => 
            user2.dating_intentions.includes(intention)
        );
        if (commonIntentions.length > 0) {
            score += (commonIntentions.length / Math.max(user1.dating_intentions.length, user2.dating_intentions.length)) * 30;
        }
    }
    totalChecks++;

    return Math.round(score);
}

// Check orientation compatibility with proper gender matching
function checkOrientationCompatibility(user1, user2) {
    const gender1 = user1.gender?.toLowerCase();
    const gender2 = user2.gender?.toLowerCase();
    const orientation1 = user1.orientation?.toLowerCase();
    const orientation2 = user2.orientation?.toLowerCase();

    // If either user is bisexual, they can match with anyone
    if (orientation1 === 'bisexual' || orientation2 === 'bisexual') {
        return true;
    }

    // For heterosexual matching (male-female or female-male)
    if (orientation1 === 'heterosexual' && orientation2 === 'heterosexual') {
        return (gender1 === 'male' && gender2 === 'female') || (gender1 === 'female' && gender2 === 'male');
    }

    // For homosexual matching (male-male or female-female)
    if (orientation1 === 'homosexual' && orientation2 === 'homosexual') {
        return gender1 === gender2;
    }

    // Mixed orientations - check if they can be compatible
    if (orientation1 === 'heterosexual' && orientation2 === 'homosexual') {
        return false; // Heterosexual and homosexual are not compatible
    }

    if (orientation1 === 'homosexual' && orientation2 === 'heterosexual') {
        return false; // Homosexual and heterosexual are not compatible
    }

    // If orientations are the same but not specified above, allow the match
    if (orientation1 === orientation2) {
        return true;
    }

    return false;
}

// Calculate age match score
function calculateAgeScore(user1, user2) {
    const age1 = user1.age;
    const age2 = user2.age;
    
    // Check if age is within the other person's preference range
    const age1InRange = age1 >= user2.age_range[0] && age1 <= user2.age_range[1];
    const age2InRange = age2 >= user1.age_range[0] && age2 <= user1.age_range[1];
    
    if (age1InRange && age2InRange) {
        return 100;
    } else if (age1InRange || age2InRange) {
        return 50;
    } else {
        const ageDiff = Math.abs(age1 - age2);
        if (ageDiff <= 5) return 30;
        else if (ageDiff <= 10) return 20;
        else return 10;
    }
}

// Calculate location match score
function calculateLocationScore(user1, user2) {
    const areas1 = user1.preferred_areas || [];
    const areas2 = user2.preferred_areas || [];
    
    if (areas1.length === 0 || areas2.length === 0) {
        return 50; // Medium score if no preferred areas
    }
    
    const commonAreas = areas1.filter(area => areas2.includes(area));
    if (commonAreas.length > 0) {
        return Math.round((commonAreas.length / Math.max(areas1.length, areas2.length)) * 100);
    }
    
    return 20; // No common areas
}

// Calculate interests match score
function calculateInterestsScore(user1, user2) {
    const hobbies1 = user1.hobbies ? user1.hobbies.split(',').map(h => h.trim()) : [];
    const hobbies2 = user2.hobbies ? user2.hobbies.split(',').map(h => h.trim()) : [];
    
    if (hobbies1.length === 0 || hobbies2.length === 0) {
        return 50;
    }
    
    const commonHobbies = hobbies1.filter(hobby => 
        hobbies2.some(h => h.toLowerCase().includes(hobby.toLowerCase()) || 
                          hobby.toLowerCase().includes(h.toLowerCase()))
    );
    
    return Math.round((commonHobbies.length / Math.max(hobbies1.length, hobbies2.length)) * 100);
}

// Calculate values match score
function calculateValuesScore(user1, user2) {
    const values1 = user1.values ? user1.values.split(',').map(v => v.trim()) : [];
    const values2 = user2.values ? user2.values.split(',').map(v => v.trim()) : [];
    
    if (values1.length === 0 || values2.length === 0) {
        return 50;
    }
    
    const commonValues = values1.filter(value => 
        values2.some(v => v.toLowerCase().includes(value.toLowerCase()) || 
                         value.toLowerCase().includes(v.toLowerCase()))
    );
    
    return Math.round((commonValues.length / Math.max(values1.length, values2.length)) * 100);
}

// Calculate personality match score
function calculatePersonalityScore(user1, user2) {
    let score = 0;
    
    // MBTI matching
    if (user1.mbti && user2.mbti) {
        const mbti1 = user1.mbti.toUpperCase();
        const mbti2 = user2.mbti.toUpperCase();
        
        // Perfect match
        if (mbti1 === mbti2) {
            score += 40;
        }
        // Partial match (first two letters same)
        else if (mbti1.substring(0, 2) === mbti2.substring(0, 2)) {
            score += 25;
        }
        // Compatibility match
        else if ((mbti1.includes('E') && mbti2.includes('I')) || 
                 (mbti1.includes('I') && mbti2.includes('E'))) {
            score += 20;
        }
    }
    
    // Extroversion score matching
    if (user1.extroversion_score && user2.extroversion_score) {
        const extroDiff = Math.abs(user1.extroversion_score - user2.extroversion_score);
        if (extroDiff <= 2) score += 30;
        else if (extroDiff <= 4) score += 20;
        else score += 10;
    }
    
    // Lifestyle matching
    if (user1.lifestyle && user2.lifestyle) {
        const lifestyle1 = user1.lifestyle.toLowerCase();
        const lifestyle2 = user2.lifestyle.toLowerCase();
        if (lifestyle1.includes(lifestyle2) || lifestyle2.includes(lifestyle1)) {
            score += 30;
        }
    }
    
    return Math.min(score, 100);
}

// 8. 获取可匹配的用户列表（推荐5个最合适的用户）
router.get("/available-users/:user_id", async (req, res) => {
    const { user_id } = req.params;
    const { min_score = 50, recommendation_count = 5 } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        // 获取当前用户信息
        const currentUser = await getUserCompleteData(user_id);
        if (!currentUser) {
            return res.status(404).json({ error: "User not found." });
        }

        // 获取可匹配的用户（排除已匹配的用户）
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.name, u.age, u.gender, u.photo, u.mbti
            FROM users u
            WHERE u.id != $1 
              AND u.form_submitted = true 
              AND u.match_status = 'available'
              AND u.id NOT IN (
                  SELECT DISTINCT user1_id FROM user_matches WHERE user2_id = $1
                  UNION
                  SELECT DISTINCT user2_id FROM user_matches WHERE user1_id = $1
              )
              AND u.id NOT IN (
                  SELECT DISTINCT user1_id FROM user_matches WHERE user2_id IN (
                      SELECT user1_id FROM user_matches WHERE user2_id = $1
                      UNION
                      SELECT user2_id FROM user_matches WHERE user1_id = $1
                  )
                  UNION
                  SELECT DISTINCT user2_id FROM user_matches WHERE user1_id IN (
                      SELECT user1_id FROM user_matches WHERE user2_id = $1
                      UNION
                      SELECT user2_id FROM user_matches WHERE user1_id = $1
                  )
              )
            ORDER BY u.created_at DESC
            LIMIT 50
        `, [user_id]);

        // Calculate match scores and filter by minimum score with orientation compatibility check
        const availableUsersWithScore = [];
        for (const user of result.rows) {
            const potentialUserData = await getUserCompleteData(user.id);
            if (potentialUserData) {
                // Check orientation compatibility first
                if (checkOrientationCompatibility(currentUser, potentialUserData)) {
                    const matchScore = await calculateMatchScore(currentUser, potentialUserData);
                    if (matchScore.overall >= min_score) {
                        // Generate personality summary for the recommended user
                        const personalitySummary = await generatePersonalitySummary(potentialUserData);
                        
                        availableUsersWithScore.push({
                            ...user,
                            match_score: matchScore.overall,
                            score_breakdown: matchScore.breakdown,
                            personality_summary: personalitySummary
                        });
                    }
                }
            }
        }

        // 按相似度排序并取前5个
        availableUsersWithScore.sort((a, b) => b.match_score - a.match_score);
        const topRecommendations = availableUsersWithScore.slice(0, recommendation_count);

        res.json({
            success: true,
            user_id,
            recommendations: topRecommendations,
            total_available: availableUsersWithScore.length,
            recommendation_count: topRecommendations.length,
            min_score_threshold: min_score,
            message: `为您推荐了${topRecommendations.length}个最合适的用户`
        });

    } catch (error) {
        console.error('❌ Error getting available users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 9. Get user match history
router.get("/match-history/:user_id", async (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        const result = await pool.query(`
            SELECT 
                um.*,
                u1.name as user1_name,
                u2.name as user2_name,
                u1.photo as user1_photo,
                u2.photo as user2_photo
            FROM user_matches um
            JOIN users u1 ON um.user1_id = u1.id
            JOIN users u2 ON um.user2_id = u2.id
            WHERE (um.user1_id = $1 OR um.user2_id = $1)
              AND um.is_bound = true
            ORDER BY um.created_at DESC
        `, [user_id]);

        res.json({
            success: true,
            user_id,
            match_history: result.rows
        });

    } catch (error) {
        console.error('❌ Error fetching match history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 10. 重置用户匹配状态为可匹配
router.put("/reset-match-status/:user_id", async (req, res) => {
    const { user_id } = req.params;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        // 检查用户是否存在
        const userCheck = await pool.query('SELECT id, name, match_status FROM users WHERE id = $1', [user_id]);
        
        if (userCheck.rows.length === 0) {
            return res.status(404).json({ error: "User not found." });
        }

        const currentUser = userCheck.rows[0];
        
        // 如果用户已经是available状态，直接返回
        if (currentUser.match_status === 'available') {
            return res.json({
                success: true,
                message: "User is already available for matching",
                user: {
                    id: currentUser.id,
                    name: currentUser.name,
                    match_status: currentUser.match_status
                },
                timestamp: new Date().toISOString()
            });
        }

        // 重置用户状态为available
        const result = await pool.query(`
            UPDATE users 
            SET match_status = 'available', 
                status_updated_at = NOW(),
                matched_at = NULL
            WHERE id = $1
            RETURNING id, name, match_status, status_updated_at
        `, [user_id]);

        // 如果用户之前是matched状态，需要解除绑定关系
        if (currentUser.match_status === 'matched') {
            await pool.query(`
                UPDATE user_matches 
                SET is_bound = false
                WHERE (user1_id = $1 OR user2_id = $1) AND is_bound = true
            `, [user_id]);
        }

        res.json({
            success: true,
            message: "User match status reset to available successfully",
            user: result.rows[0],
            previous_status: currentUser.match_status,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error resetting user match status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 11. 检查两个用户的相似度
router.post("/check-compatibility", async (req, res) => {
    const { user1_id, user2_id } = req.body;

    if (!user1_id || !user2_id) {
        return res.status(400).json({ 
            error: "Missing required fields: user1_id, user2_id" 
        });
    }

    if (user1_id === user2_id) {
        return res.status(400).json({ 
            error: "Cannot check compatibility with themselves" 
        });
    }

    try {
        // 获取两个用户的完整信息
        const user1Data = await getUserCompleteData(user1_id);
        const user2Data = await getUserCompleteData(user2_id);

        if (!user1Data || !user2Data) {
            return res.status(404).json({ error: "One or both users not found" });
        }

        // 计算匹配分数
        const matchScore = await calculateMatchScore(user1Data, user2Data);

        // 判断是否达到匹配标准
        const isCompatible = matchScore.overall >= 50;

        res.json({
            success: true,
            user1_id,
            user2_id,
            match_score: matchScore.overall,
            score_breakdown: matchScore.breakdown,
            is_compatible: isCompatible,
            compatibility_message: isCompatible 
                ? `匹配度${matchScore.overall}%，达到匹配标准！` 
                : `匹配度${matchScore.overall}%，未达到50%的匹配标准。`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error checking compatibility:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// 12. 获取推荐用户（专门用于推荐功能）
router.get("/recommendations/:user_id", async (req, res) => {
    const { user_id } = req.params;
    const { count = 5, min_score = 50 } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        // 获取当前用户信息
        const currentUser = await getUserCompleteData(user_id);
        if (!currentUser) {
            return res.status(404).json({ error: "User not found." });
        }

        // 获取可匹配的用户（排除已匹配的用户）
        const result = await pool.query(`
            SELECT DISTINCT u.id, u.name, u.age, u.gender, u.photo, u.mbti
            FROM users u
            WHERE u.id != $1 
              AND u.form_submitted = true 
              AND u.match_status = 'available'
              AND u.id NOT IN (
                  SELECT DISTINCT user1_id FROM user_matches WHERE user2_id = $1
                  UNION
                  SELECT DISTINCT user2_id FROM user_matches WHERE user1_id = $1
              )
              AND u.id NOT IN (
                  SELECT DISTINCT user1_id FROM user_matches WHERE user2_id IN (
                      SELECT user1_id FROM user_matches WHERE user2_id = $1
                      UNION
                      SELECT user2_id FROM user_matches WHERE user1_id = $1
                  )
                  UNION
                  SELECT DISTINCT user2_id FROM user_matches WHERE user1_id IN (
                      SELECT user1_id FROM user_matches WHERE user2_id = $1
                      UNION
                      SELECT user2_id FROM user_matches WHERE user1_id = $1
                  )
              )
            ORDER BY u.created_at DESC
            LIMIT 100
        `, [user_id]);

        // Calculate match scores and filter by minimum score with orientation compatibility check
        const allCompatibleUsers = [];
        for (const user of result.rows) {
            const potentialUserData = await getUserCompleteData(user.id);
            if (potentialUserData) {
                // Check orientation compatibility first
                if (checkOrientationCompatibility(currentUser, potentialUserData)) {
                    const matchScore = await calculateMatchScore(currentUser, potentialUserData);
                    if (matchScore.overall >= min_score) {
                        // Generate personality summary for the recommended user
                        const personalitySummary = await generatePersonalitySummary(potentialUserData);
                        
                        allCompatibleUsers.push({
                            ...user,
                            match_score: matchScore.overall,
                            score_breakdown: matchScore.breakdown,
                            personality_summary: personalitySummary
                        });
                    }
                }
            }
        }

        // 按相似度排序并取前N个推荐
        allCompatibleUsers.sort((a, b) => b.match_score - a.match_score);
        const recommendations = allCompatibleUsers.slice(0, count);

        res.json({
            success: true,
            user_id,
            recommendations: recommendations,
            total_compatible: allCompatibleUsers.length,
            recommendation_count: recommendations.length,
            min_score_threshold: min_score,
            message: `为您推荐了${recommendations.length}个最合适的用户`,
            recommendation_summary: {
                highest_score: recommendations.length > 0 ? recommendations[0].match_score : 0,
                average_score: recommendations.length > 0 ? 
                    Math.round(recommendations.reduce((sum, user) => sum + user.match_score, 0) / recommendations.length) : 0,
                score_range: recommendations.length > 0 ? 
                    `${recommendations[recommendations.length - 1].match_score}% - ${recommendations[0].match_score}%` : "无推荐"
            }
        });

    } catch (error) {
        console.error('❌ Error getting recommendations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router; 