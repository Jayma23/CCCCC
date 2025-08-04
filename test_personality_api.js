const axios = require('axios');

// 测试数据 - 包含空值
const testUserData = {
    user_id: 123,
    name: "Test User",
    age: 25,
    gender: "Male",
    orientation: "Straight",
    height: 175,
    mbti: "",
    photo: null,
    photos: [],
    phone: "",
    zip_code: "",
    birthday: "", // 这是导致错误的原因
    ethnicity: [],
    interested_in_genders: [],
    dating_intentions: [],
    ethnicity_attraction: [],
    preferred_areas: [],
    age_range: [],
    about_me: "",
    hobbies: "",
    lifestyle: "",
    values: "",
    future_goals: "",
    perfect_date: "",
    green_flags: "",
    red_flags: "",
    physical_attraction_traits: "",
    extroversion_score: null
};

async function testPersonalityAPI() {
    try {
        console.log('🧪 Testing personality API with empty values...');
        
        const response = await axios.post('http://localhost:3000/api/personality/process-user-embedding', testUserData);
        
        console.log('✅ Test passed! Response:', response.data);
    } catch (error) {
        console.error('❌ Test failed! Error:', error.response?.data || error.message);
    }
}

// 运行测试
testPersonalityAPI(); 