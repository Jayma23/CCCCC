const axios = require('axios');

// 配置基础URL
const BASE_URL = 'http://localhost:3000';

// 测试数据
const testUsers = {
    user1: {
        id: 1,
        name: "张三",
        age: 25,
        gender: "男"
    },
    user2: {
        id: 2,
        name: "李四",
        age: 23,
        gender: "女"
    }
};

// 测试函数
async function testMatchingFunctions() {
    console.log('🧪 开始测试匹配管理功能...\n');

    try {
        // 1. 测试绑定匹配用户
        console.log('1️⃣ 测试绑定匹配用户...');
        const bindResult = await axios.post(`${BASE_URL}/matching/bind-matched-users`, {
            user1_id: testUsers.user1.id,
            user2_id: testUsers.user2.id,
            match_score: 85,
            match_analysis: "这是一个很好的匹配！"
        });
        console.log('✅ 绑定成功:', bindResult.data);
        console.log('');

        // 2. 测试更新用户匹配状态
        console.log('2️⃣ 测试更新用户匹配状态...');
        const statusResult = await axios.put(`${BASE_URL}/matching/update-match-status`, {
            user_id: testUsers.user1.id,
            match_status: 'unavailable'
        });
        console.log('✅ 状态更新成功:', statusResult.data);
        console.log('');

        // 3. 测试生成个人总结和约会建议
        console.log('3️⃣ 测试生成个人总结和约会建议...');
        const summaryResult = await axios.post(`${BASE_URL}/matching/generate-personal-summary`, {
            user_id: testUsers.user1.id,
            target_user_id: testUsers.user2.id
        });
        console.log('✅ 个人总结生成成功:');
        console.log('个人总结:', summaryResult.data.user_summary);
        console.log('约会建议:', summaryResult.data.dating_advice);
        console.log('');

        // 4. 测试获取可匹配用户列表
        console.log('4️⃣ 测试获取可匹配用户列表...');
        const availableResult = await axios.get(`${BASE_URL}/matching/available-users/${testUsers.user1.id}?limit=10`);
        console.log('✅ 可匹配用户列表:', availableResult.data);
        console.log('');

        // 5. 测试获取匹配历史
        console.log('5️⃣ 测试获取匹配历史...');
        const historyResult = await axios.get(`${BASE_URL}/matching/match-history/${testUsers.user1.id}`);
        console.log('✅ 匹配历史:', historyResult.data);
        console.log('');

        console.log('🎉 所有测试完成！');

    } catch (error) {
        console.error('❌ 测试失败:', error.response?.data || error.message);
    }
}

// 测试错误情况
async function testErrorCases() {
    console.log('\n🧪 开始测试错误情况...\n');

    try {
        // 1. 测试缺少必要参数
        console.log('1️⃣ 测试缺少必要参数...');
        try {
            await axios.post(`${BASE_URL}/matching/bind-matched-users`, {
                user1_id: testUsers.user1.id
                // 缺少 user2_id
            });
        } catch (error) {
            console.log('✅ 正确捕获错误:', error.response.data.error);
        }
        console.log('');

        // 2. 测试无效的匹配状态
        console.log('2️⃣ 测试无效的匹配状态...');
        try {
            await axios.put(`${BASE_URL}/matching/update-match-status`, {
                user_id: testUsers.user1.id,
                match_status: 'invalid_status'
            });
        } catch (error) {
            console.log('✅ 正确捕获错误:', error.response.data.error);
        }
        console.log('');

        // 3. 测试不存在的用户
        console.log('3️⃣ 测试不存在的用户...');
        try {
            await axios.get(`${BASE_URL}/matching/available-users/99999`);
        } catch (error) {
            console.log('✅ 正确捕获错误:', error.response.data.error);
        }
        console.log('');

        console.log('🎉 错误测试完成！');

    } catch (error) {
        console.error('❌ 错误测试失败:', error.message);
    }
}

// 运行测试
async function runAllTests() {
    console.log('🚀 开始运行匹配管理功能测试...\n');
    
    await testMatchingFunctions();
    await testErrorCases();
    
    console.log('\n✨ 所有测试完成！');
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = {
    testMatchingFunctions,
    testErrorCases,
    runAllTests
}; 