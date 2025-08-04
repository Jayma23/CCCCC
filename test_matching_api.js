const axios = require('axios');

// 测试匹配API
async function testMatchingAPI() {
    try {
        console.log('🧪 Testing matching API...');
        
        // 测试获取最佳匹配
        const response = await axios.get('http://localhost:3000/api/match/best-matches/123?limit=5');
        
        console.log('✅ Test passed! Response:', response.data);
    } catch (error) {
        console.error('❌ Test failed! Error:', error.response?.data || error.message);
    }
}

// 运行测试
testMatchingAPI(); 