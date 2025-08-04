const axios = require('axios');

// 配置
const BASE_URL = 'http://localhost:3000';
const TEST_USER_ID = 'test-user-123';

// 测试数据
const testData = {
    basic_info: [
        { data_name: 'name', data_content: '张三', data_type: 'text' },
        { data_name: 'age', data_content: 25, data_type: 'text' },
        { data_name: 'gender', data_content: 'male', data_type: 'text' },
        { data_name: 'height', data_content: 175, data_type: 'text' },
        { data_name: 'mbti', data_content: 'INTJ', data_type: 'text' },
        { data_name: 'orientation', data_content: 'straight', data_type: 'text' }
    ],
    contact_info: [
        { data_name: 'phone', data_content: '13800138000', data_type: 'text' },
        { data_name: 'zip_code', data_content: '100000', data_type: 'text' },
        { data_name: 'birthday', data_content: '1998-01-01', data_type: 'text' },
        { data_name: 'ethnicity', data_content: '["Asian"]', data_type: 'array' }
    ],
    preferences: [
        { data_name: 'interested_in_genders', data_content: '["female"]', data_type: 'array' },
        { data_name: 'dating_intentions', data_content: '["serious"]', data_type: 'array' },
        { data_name: 'ethnicity_attraction', data_content: '["Asian", "Caucasian"]', data_type: 'array' },
        { data_name: 'preferred_areas', data_content: '["Beijing", "Shanghai"]', data_type: 'array' },
        { data_name: 'age_min', data_content: 20, data_type: 'text' },
        { data_name: 'age_max', data_content: 30, data_type: 'text' }
    ],
    personality: [
        { data_name: 'about_me', data_content: '我是一个热爱生活的人，喜欢阅读和旅行。', data_type: 'text' },
        { data_name: 'hobbies', data_content: '阅读,旅行,音乐', data_type: 'array' },
        { data_name: 'lifestyle', data_content: '健康的生活方式，注重运动和饮食。', data_type: 'text' },
        { data_name: 'values', data_content: '诚实,善良,上进', data_type: 'array' },
        { data_name: 'future_goals', data_content: '事业有成,家庭美满', data_type: 'array' },
        { data_name: 'perfect_date', data_content: '一起看电影,共进晚餐', data_type: 'array' },
        { data_name: 'green_flags', data_content: '善良,有责任心,上进', data_type: 'array' },
        { data_name: 'red_flags', data_content: '不诚实,不负责任', data_type: 'array' },
        { data_name: 'physical_attraction_traits', data_content: '笑容,眼睛,气质', data_type: 'array' },
        { data_name: 'extroversion_score', data_content: 7, data_type: 'text' }
    ]
};

// 测试函数
async function testPersonalityAPI() {
    console.log('🧪 开始测试 Personality API...\n');

    try {
        // 1. 测试单个数据上传
        console.log('1️⃣ 测试单个数据上传...');
        for (const category of Object.values(testData)) {
            for (const item of category) {
                try {
                    const response = await axios.post(`${BASE_URL}/personality/upload-personality-data`, {
                        user_id: TEST_USER_ID,
                        ...item
                    });
                    console.log(`✅ ${item.data_name}: ${response.data.message}`);
                } catch (error) {
                    console.log(`❌ ${item.data_name}: ${error.response?.data?.error || error.message}`);
                }
            }
        }

        // 2. 测试批量数据上传
        console.log('\n2️⃣ 测试批量数据上传...');
        const allDataItems = Object.values(testData).flat();
        try {
            const response = await axios.post(`${BASE_URL}/personality/upload-batch-personality-data`, {
                user_id: TEST_USER_ID,
                data_items: allDataItems
            });
            console.log(`✅ 批量上传完成: ${response.data.message}`);
            console.log(`📊 成功: ${response.data.results.filter(r => r.status === 'success').length} 项`);
            console.log(`❌ 失败: ${response.data.results.filter(r => r.status === 'error').length} 项`);
        } catch (error) {
            console.log(`❌ 批量上传失败: ${error.response?.data?.error || error.message}`);
        }

        // 3. 测试获取用户数据
        console.log('\n3️⃣ 测试获取用户数据...');
        try {
            const response = await axios.get(`${BASE_URL}/personality/user-personality-data/${TEST_USER_ID}`);
            console.log('✅ 用户数据获取成功');
            console.log(`📝 基本信息: ${response.data.basic_info.name}, ${response.data.basic_info.age}岁`);
            console.log(`📞 联系方式: ${response.data.contact_info.phone}`);
            console.log(`🎯 偏好: ${response.data.preferences.interested_in_genders.join(', ')}`);
            console.log(`💭 个性: ${response.data.personality.about_me.substring(0, 20)}...`);
        } catch (error) {
            console.log(`❌ 获取用户数据失败: ${error.response?.data?.error || error.message}`);
        }

        // 4. 测试处理用户embedding
        console.log('\n4️⃣ 测试处理用户embedding...');
        try {
            const response = await axios.post(`${BASE_URL}/personality/process-user-embedding`, {
                user_id: TEST_USER_ID
            });
            console.log(`✅ Embedding处理成功: ${response.data.message}`);
            console.log(`🔢 Embedding长度: ${response.data.embedding_length}`);
        } catch (error) {
            console.log(`❌ Embedding处理失败: ${error.response?.data?.error || error.message}`);
        }

        // 5. 测试获取用户embedding信息
        console.log('\n5️⃣ 测试获取用户embedding信息...');
        try {
            const response = await axios.get(`${BASE_URL}/personality/user-embedding/${TEST_USER_ID}`);
            console.log('✅ 用户embedding信息获取成功');
            if (response.data.embedding) {
                console.log(`🔢 Embedding ID: ${response.data.embedding.id}`);
                console.log(`📊 Embedding维度: ${response.data.embedding.values.length}`);
                console.log(`🏷️ 元数据: ${response.data.embedding.metadata.name}, ${response.data.embedding.metadata.age}岁`);
            } else {
                console.log('⚠️ 未找到embedding信息');
            }
        } catch (error) {
            console.log(`❌ 获取embedding信息失败: ${error.response?.data?.error || error.message}`);
        }

        // 6. 测试删除特定数据
        console.log('\n6️⃣ 测试删除特定数据...');
        try {
            const response = await axios.delete(`${BASE_URL}/personality/delete-personality-data`, {
                data: {
                    user_id: TEST_USER_ID,
                    data_name: 'hobbies'
                }
            });
            console.log(`✅ 数据删除成功: ${response.data.message}`);
        } catch (error) {
            console.log(`❌ 数据删除失败: ${error.response?.data?.error || error.message}`);
        }

        console.log('\n🎉 所有测试完成！');

    } catch (error) {
        console.error('❌ 测试过程中发生错误:', error.message);
    }
}

// 运行测试
if (require.main === module) {
    testPersonalityAPI();
}

module.exports = { testPersonalityAPI }; 