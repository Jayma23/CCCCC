const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000';

// Test user data
const testUsers = {
    user1: {
        id: 'test-user-1',
        name: 'John Smith',
        age: 25,
        gender: 'male',
        orientation: 'straight',
        height: 175,
        hobbies: 'Reading,Travel,Music,Photography',
        values: 'Honesty,Kindness,Ambition,Responsibility',
        future_goals: 'Career Success,Happy Family',
        perfect_date: 'Watch Movies Together,Dinner,Walk and Chat',
        interested_in_genders: ['female'],
        dating_intentions: ['serious', 'casual'],
        preferred_areas: ['Beijing', 'Shanghai'],
        age_range: [20, 30],
        about_me: 'I am a person who loves life, enjoys reading and traveling. I have an outgoing personality and am responsible.',
        lifestyle: 'Healthy lifestyle, focusing on exercise and diet.',
        green_flags: 'Kind,Responsible,Ambitious',
        red_flags: 'Dishonest,Irresponsible',
        physical_attraction_traits: 'Smile,Eyes,Charisma',
        extroversion_score: 7
    },
    user2: {
        id: 'test-user-2',
        name: 'Sarah Johnson',
        age: 23,
        gender: 'female',
        orientation: 'straight',
        height: 165,
        hobbies: 'Travel,Music,Food,Photography',
        values: 'Kindness,Honesty,Ambition,Independence',
        future_goals: 'Career Success,Find True Love',
        perfect_date: 'Travel Together,Taste Food,Watch Movies',
        interested_in_genders: ['male'],
        dating_intentions: ['serious'],
        preferred_areas: ['Beijing', 'Shanghai'],
        age_range: [22, 28],
        about_me: 'I am an independent girl who loves travel and food. I have a gentle personality and am ambitious.',
        lifestyle: 'Positive lifestyle, love trying new things.',
        green_flags: 'Honest,Ambitious,Responsible',
        red_flags: 'Dishonest,Lazy',
        physical_attraction_traits: 'Smile,Charisma,Conversation',
        extroversion_score: 6
    },
    user3: {
        id: 'test-user-3',
        name: 'Mike Wilson',
        age: 28,
        gender: 'male',
        orientation: 'straight',
        height: 180,
        hobbies: 'Sports,Fitness,Gaming,Movies',
        values: 'Health,Positivity,Optimism',
        future_goals: 'Physical Health,Stable Career',
        perfect_date: 'Exercise Together,Watch Movies,Chat',
        interested_in_genders: ['female'],
        dating_intentions: ['casual'],
        preferred_areas: ['Beijing'],
        age_range: [25, 35],
        about_me: 'I am a person who loves sports, outgoing personality, and enjoys making friends.',
        lifestyle: 'Healthy lifestyle, exercise regularly.',
        green_flags: 'Healthy,Positive,Optimistic',
        red_flags: 'Negative,Unhealthy',
        physical_attraction_traits: 'Body,Smile,Energy',
        extroversion_score: 8
    }
};

// Test function
async function testMatchingAPI() {
    console.log('🧪 Starting Matching API Test...\n');

    try {
        // 1. First upload test user data
        console.log('1️⃣ Uploading test user data...');
        for (const [key, user] of Object.entries(testUsers)) {
            console.log(`📝 Uploading user data: ${user.name}`);
            
            // Upload basic information
            const basicData = [
                { data_name: 'name', data_content: user.name, data_type: 'text' },
                { data_name: 'age', data_content: user.age, data_type: 'text' },
                { data_name: 'gender', data_content: user.gender, data_type: 'text' },
                { data_name: 'orientation', data_content: user.orientation, data_type: 'text' },
                { data_name: 'height', data_content: user.height, data_type: 'text' }
            ];

            for (const item of basicData) {
                try {
                    await axios.post(`${BASE_URL}/personality/upload-personality-data`, {
                        user_id: user.id,
                        ...item
                    });
                } catch (error) {
                    console.log(`⚠️ ${item.data_name}: ${error.response?.data?.error || error.message}`);
                }
            }

            // Upload personality information
            const personalityData = [
                { data_name: 'hobbies', data_content: user.hobbies, data_type: 'array' },
                { data_name: 'values', data_content: user.values, data_type: 'array' },
                { data_name: 'future_goals', data_content: user.future_goals, data_type: 'array' },
                { data_name: 'perfect_date', data_content: user.perfect_date, data_type: 'array' },
                { data_name: 'about_me', data_content: user.about_me, data_type: 'text' },
                { data_name: 'lifestyle', data_content: user.lifestyle, data_type: 'text' },
                { data_name: 'green_flags', data_content: user.green_flags, data_type: 'array' },
                { data_name: 'red_flags', data_content: user.red_flags, data_type: 'array' },
                { data_name: 'physical_attraction_traits', data_content: user.physical_attraction_traits, data_type: 'array' },
                { data_name: 'extroversion_score', data_content: user.extroversion_score, data_type: 'text' }
            ];

            for (const item of personalityData) {
                try {
                    await axios.post(`${BASE_URL}/personality/upload-personality-data`, {
                        user_id: user.id,
                        ...item
                    });
                } catch (error) {
                    console.log(`⚠️ ${item.data_name}: ${error.response?.data?.error || error.message}`);
                }
            }

            // Upload preference settings
            const preferenceData = [
                { data_name: 'interested_in_genders', data_content: JSON.stringify(user.interested_in_genders), data_type: 'array' },
                { data_name: 'dating_intentions', data_content: JSON.stringify(user.dating_intentions), data_type: 'array' },
                { data_name: 'preferred_areas', data_content: JSON.stringify(user.preferred_areas), data_type: 'array' },
                { data_name: 'age_min', data_content: user.age_range[0], data_type: 'text' },
                { data_name: 'age_max', data_content: user.age_range[1], data_type: 'text' }
            ];

            for (const item of preferenceData) {
                try {
                    await axios.post(`${BASE_URL}/personality/upload-personality-data`, {
                        user_id: user.id,
                        ...item
                    });
                } catch (error) {
                    console.log(`⚠️ ${item.data_name}: ${error.response?.data?.error || error.message}`);
                }
            }
        }

        // 2. Process user embeddings
        console.log('\n2️⃣ Processing user embeddings...');
        for (const user of Object.values(testUsers)) {
            try {
                const response = await axios.post(`${BASE_URL}/personality/process-user-embedding`, {
                    user_id: user.id
                });
                console.log(`✅ ${user.name} embedding processed successfully: ${response.data.embedding_length} dimensions`);
            } catch (error) {
                console.log(`❌ ${user.name} embedding processing failed: ${error.response?.data?.error || error.message}`);
            }
        }

        // 3. Test matching two users
        console.log('\n3️⃣ Testing matching two users...');
        try {
            const response = await axios.post(`${BASE_URL}/match/match-two-users`, {
                user1_id: testUsers.user1.id,
                user2_id: testUsers.user2.id
            });
            
            console.log('✅ User matching successful');
            console.log(`📊 Match score: ${response.data.match_score.overall}/100`);
            console.log(`📈 Score breakdown:`);
            console.log(`   - Basic preference: ${response.data.match_score.breakdown.basic_preference}`);
            console.log(`   - Age matching: ${response.data.match_score.breakdown.age}`);
            console.log(`   - Location: ${response.data.match_score.breakdown.location}`);
            console.log(`   - Interests: ${response.data.match_score.breakdown.interests}`);
            console.log(`   - Values: ${response.data.match_score.breakdown.values}`);
            console.log(`   - Embedding similarity: ${response.data.match_score.breakdown.embedding}`);
            
            console.log(`📝 Match analysis: ${response.data.match_analysis.substring(0, 100)}...`);
            
        } catch (error) {
            console.log(`❌ User matching failed: ${error.response?.data?.error || error.message}`);
        }

        // 4. Test different user combinations
        console.log('\n4️⃣ Testing different user combinations...');
        const combinations = [
            { user1: testUsers.user1, user2: testUsers.user3, description: 'John vs Mike' },
            { user1: testUsers.user2, user2: testUsers.user3, description: 'Sarah vs Mike' }
        ];

        for (const combo of combinations) {
            try {
                const response = await axios.post(`${BASE_URL}/match/match-two-users`, {
                    user1_id: combo.user1.id,
                    user2_id: combo.user2.id
                });
                
                console.log(`✅ ${combo.description} match score: ${response.data.match_score.overall}/100`);
                
            } catch (error) {
                console.log(`❌ ${combo.description} matching failed: ${error.response?.data?.error || error.message}`);
            }
        }

        // 5. Test getting user match history
        console.log('\n5️⃣ Testing getting user match history...');
        try {
            const response = await axios.get(`${BASE_URL}/match/user-matches/${testUsers.user1.id}`);
            console.log(`✅ Get match history successful: ${response.data.matches.length} records`);
            
            for (const match of response.data.matches) {
                console.log(`   - ${match.user1_name} vs ${match.user2_name}: ${match.match_score}/100`);
            }
            
        } catch (error) {
            console.log(`❌ Get match history failed: ${error.response?.data?.error || error.message}`);
        }

        // 6. Test getting best match recommendations
        console.log('\n6️⃣ Testing getting best match recommendations...');
        try {
            const response = await axios.get(`${BASE_URL}/match/best-matches/${testUsers.user1.id}?limit=5`);
            console.log(`✅ Get best match recommendations successful: ${response.data.matches.length} recommendations`);
            
            for (let i = 0; i < response.data.matches.length; i++) {
                const match = response.data.matches[i];
                console.log(`   ${i + 1}. ${match.user.name}: ${match.match_score.overall}/100`);
            }
            
        } catch (error) {
            console.log(`❌ Get best match recommendations failed: ${error.response?.data?.error || error.message}`);
        }

        // 7. Test error cases
        console.log('\n7️⃣ Testing error cases...');
        
        // Test matching self
        try {
            await axios.post(`${BASE_URL}/match/match-two-users`, {
                user1_id: testUsers.user1.id,
                user2_id: testUsers.user1.id
            });
        } catch (error) {
            console.log(`✅ Correctly rejected matching self: ${error.response?.data?.error}`);
        }

        // Test missing parameters
        try {
            await axios.post(`${BASE_URL}/match/match-two-users`, {
                user1_id: testUsers.user1.id
            });
        } catch (error) {
            console.log(`✅ Correctly rejected missing parameters: ${error.response?.data?.error}`);
        }

        console.log('\n🎉 All tests completed!');

    } catch (error) {
        console.error('❌ Error during testing:', error.message);
    }
}

// Run test
if (require.main === module) {
    testMatchingAPI();
}

module.exports = { testMatchingAPI }; 