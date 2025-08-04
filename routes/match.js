const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { Pinecone } = require("@pinecone-database/pinecone");
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

// Pinecone
const pinecone = new Pinecone({
    apiKey: process.env.PINECONE_API_KEY,
});
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

// Smart matching function for two users
router.post("/match-two-users", async (req, res) => {
    console.log('🎯 Starting user matching:', req.body);
    const { user1_id, user2_id } = req.body;

    if (!user1_id || !user2_id) {
        return res.status(400).json({ 
            error: "Missing required fields: user1_id, user2_id" 
        });
    }

    if (user1_id === user2_id) {
        return res.status(400).json({ 
            error: "Cannot match user with themselves" 
        });
    }

    try {
        // 1. Get complete data for both users
        const user1Data = await getUserCompleteData(user1_id);
        const user2Data = await getUserCompleteData(user2_id);

        if (!user1Data || !user2Data) {
            return res.status(404).json({ 
                error: "One or both users not found" 
            });
        }

        // 2. Calculate match score
        const matchScore = await calculateMatchScore(user1Data, user2Data);

        // 3. Generate match analysis report
        const matchAnalysis = await generateMatchAnalysis(user1Data, user2Data, matchScore);

        // 4. Save match record
        await saveMatchRecord(user1_id, user2_id, matchScore, matchAnalysis);

        res.json({
            success: true,
            user1_id,
            user2_id,
            match_score: matchScore,
            match_analysis: matchAnalysis,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error matching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get complete user data
async function getUserCompleteData(user_id) {
    try {
        // Get basic user information
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

        // Get user photos
        const photosResult = await pool.query(`
            SELECT photo_url, is_primary
            FROM user_photos 
            WHERE user_id = $1
            ORDER BY is_primary DESC, uploaded_at ASC
        `, [user_id]);

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
        const photos = photosResult.rows || [];

        return {
            user_id: user.id,
            name: profile.name || user.name,
            age: user.age,
            gender: profile.gender || user.gender,
            orientation: profile.sexual_orientation || user.orientation,
            height: profile.height || user.height,
            mbti: user.mbti,
            photo: user.photo,
            photos: photos,
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

    // 6. Embedding similarity (15%)
    const embeddingScore = await calculateEmbeddingScore(user1.user_id, user2.user_id);
    scores.embedding = embeddingScore;
    totalScore += embeddingScore * 0.15;
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
    if (user1.interested_in_genders.includes(user2.gender) && 
        user2.interested_in_genders.includes(user1.gender)) {
        score += 40;
    }
    totalChecks++;

    // Check sexual orientation compatibility
    if (user1.orientation === user2.orientation || 
        (user1.orientation === 'bisexual' || user2.orientation === 'bisexual')) {
        score += 30;
    }
    totalChecks++;

    // Check dating intentions
    const commonIntentions = user1.dating_intentions.filter(intention => 
        user2.dating_intentions.includes(intention)
    );
    if (commonIntentions.length > 0) {
        score += (commonIntentions.length / Math.max(user1.dating_intentions.length, user2.dating_intentions.length)) * 30;
    }
    totalChecks++;

    return Math.round(score);
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

// Calculate embedding similarity score
async function calculateEmbeddingScore(user1_id, user2_id) {
    try {
        // Get embeddings from Pinecone
        const result1 = await pineconeIndex.fetch([`user_${user1_id}`]);
        const result2 = await pineconeIndex.fetch([`user_${user2_id}`]);
        
        const embedding1 = result1.vectors[`user_${user1_id}`];
        const embedding2 = result2.vectors[`user_${user2_id}`];
        
        if (!embedding1 || !embedding2) {
            return 50; // Medium score if no embeddings
        }
        
        // Calculate cosine similarity
        const similarity = calculateCosineSimilarity(embedding1.values, embedding2.values);
        
        // Convert similarity to 0-100 score
        return Math.round(similarity * 100);
        
    } catch (error) {
        console.error('Error calculating embedding similarity:', error);
        return 50;
    }
}

// Calculate cosine similarity
function calculateCosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
        return 0;
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }
    
    norm1 = Math.sqrt(norm1);
    norm2 = Math.sqrt(norm2);
    
    if (norm1 === 0 || norm2 === 0) {
        return 0;
    }
    
    return dotProduct / (norm1 * norm2);
}

// Generate match analysis report
async function generateMatchAnalysis(user1, user2, matchScore) {
    try {
        const prompt = `
Analyze the matching situation of the following two users and generate a detailed analysis report:

User 1 Information:
- Name: ${user1.name}
- Age: ${user1.age}
- Gender: ${user1.gender}
- Orientation: ${user1.orientation}
- Hobbies: ${user1.hobbies}
- Values: ${user1.values}
- Future Goals: ${user1.future_goals}
- Perfect Date: ${user1.perfect_date}

User 2 Information:
- Name: ${user2.name}
- Age: ${user2.age}
- Gender: ${user2.gender}
- Orientation: ${user2.orientation}
- Hobbies: ${user2.hobbies}
- Values: ${user2.values}
- Future Goals: ${user2.future_goals}
- Perfect Date: ${user2.perfect_date}

Match Score: ${matchScore.overall}/100

Please generate a detailed analysis report including:
1. Overall match evaluation
2. Analysis of each dimension (basic preferences, age, location, interests, values, personality similarity)
3. Potential advantages and challenges
4. Suggested dating activities
5. Match recommendations

Please answer in English with clear formatting.
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content: "You are a professional dating match analyst, skilled at analyzing the compatibility between two people and providing valuable advice."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            max_tokens: 1000,
            temperature: 0.7
        });

        return response.choices[0].message.content;
        
    } catch (error) {
        console.error('Error generating match analysis:', error);
        return "Unable to generate match analysis report, please try again later.";
    }
}

// Save match record
async function saveMatchRecord(user1_id, user2_id, matchScore, matchAnalysis) {
    try {
        // Create match records table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_matches (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user1_id UUID NOT NULL,
                user2_id UUID NOT NULL,
                match_score INTEGER NOT NULL,
                score_breakdown JSONB,
                match_analysis TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user1_id, user2_id)
            )
        `);

        // Insert or update match record
        await pool.query(`
            INSERT INTO user_matches (user1_id, user2_id, match_score, score_breakdown, match_analysis)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user1_id, user2_id) DO UPDATE SET
                match_score = EXCLUDED.match_score,
                score_breakdown = EXCLUDED.score_breakdown,
                match_analysis = EXCLUDED.match_analysis,
                created_at = NOW()
        `, [user1_id, user2_id, matchScore.overall, JSON.stringify(matchScore.breakdown), matchAnalysis]);

        console.log(`✅ Match record saved for users ${user1_id} and ${user2_id}`);
        
    } catch (error) {
        console.error('Error saving match record:', error);
        throw error;
    }
}

// Get user match history
router.get("/user-matches/:user_id", async (req, res) => {
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
            WHERE um.user1_id = $1 OR um.user2_id = $1
            ORDER BY um.created_at DESC
        `, [user_id]);

        res.json({
            success: true,
            user_id,
            matches: result.rows
        });

    } catch (error) {
        console.error('❌ Error fetching user matches:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get best match recommendations
router.get("/best-matches/:user_id", async (req, res) => {
    const { user_id } = req.params;
    const { limit = 10 } = req.query;

    if (!user_id) {
        return res.status(400).json({ error: "Missing user_id." });
    }

    try {
        // Get user data
        const userData = await getUserCompleteData(user_id);
        if (!userData) {
            return res.status(404).json({ error: "User not found." });
        }

        // Get all potential match users
        const potentialMatches = await getPotentialMatches(userData, limit);

        // Calculate score for each potential match
        const matchesWithScores = [];
        for (const potentialMatch of potentialMatches) {
            const matchScore = await calculateMatchScore(userData, potentialMatch);
            matchesWithScores.push({
                user: potentialMatch,
                match_score: matchScore
            });
        }

        // Sort by score
        matchesWithScores.sort((a, b) => b.match_score.overall - a.match_score.overall);

        res.json({
            success: true,
            user_id,
            matches: matchesWithScores.slice(0, limit)
        });

    } catch (error) {
        console.error('❌ Error getting best matches:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get potential match users
async function getPotentialMatches(userData, limit) {
    try {
        // Build query conditions
        const conditions = [];
        const params = [];
        let paramIndex = 1;

        // Basic condition: gender preference
        if (userData.interested_in_genders.length > 0) {
            conditions.push(`u.gender = ANY($${paramIndex})`);
            params.push(userData.interested_in_genders);
            paramIndex++;
        }

        // Age range
        conditions.push(`u.age BETWEEN $${paramIndex} AND $${paramIndex + 1}`);
        params.push(userData.age_range[0], userData.age_range[1]);
        paramIndex += 2;

        // Exclude self
        conditions.push(`u.id != $${paramIndex}`);
        params.push(userData.user_id);
        paramIndex++;

        // Users who have submitted forms
        conditions.push(`u.form_submitted = true`);

        const whereClause = conditions.join(' AND ');

        const query = `
            SELECT DISTINCT u.id, u.name, u.age, u.gender, u.photo, u.mbti
            FROM users u
            WHERE ${whereClause}
            ORDER BY u.created_at DESC
            LIMIT $${paramIndex}
        `;
        params.push(limit);

        const result = await pool.query(query, params);
        
        // Get complete data for each user
        const completeMatches = [];
        for (const row of result.rows) {
            const completeData = await getUserCompleteData(row.id);
            if (completeData) {
                completeMatches.push(completeData);
            }
        }

        return completeMatches;

    } catch (error) {
        console.error('Error getting potential matches:', error);
        throw error;
    }
}

module.exports = router;
