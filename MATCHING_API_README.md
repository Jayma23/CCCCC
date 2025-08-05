# 匹配管理功能 API 文档

## 概述

这个模块提供了完整的匹配管理功能，包括用户绑定、状态管理和约会建议生成。

## 主要功能

### 1. 用户匹配绑定
当两个用户匹配成功后，将他们绑定在一起，防止他们再出现在其他匹配中。

### 2. 用户状态管理
用户可以控制自己的匹配状态（可匹配/不可匹配/已匹配）。

### 3. 个人总结和约会建议
为匹配的用户生成个性化的个人总结和约会建议。

## API 端点

### 1. 绑定匹配用户

**POST** `/matching/bind-matched-users`

将两个用户绑定在一起，标记为已匹配。

**请求体：**
```json
{
  "user1_id": 1,
  "user2_id": 2,
  "match_score": 85,
  "match_analysis": "这是一个很好的匹配！"
}
```

**响应：**
```json
{
  "success": true,
  "message": "Users successfully bound together",
  "user1": {
    "name": "张三",
    "photo": "photo_url_1"
  },
  "user2": {
    "name": "李四", 
    "photo": "photo_url_2"
  },
  "match_score": 85,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 2. 更新用户匹配状态

**PUT** `/matching/update-match-status`

更新用户的匹配状态。

**请求体：**
```json
{
  "user_id": 1,
  "match_status": "unavailable"
}
```

**可用的状态值：**
- `available`: 可匹配
- `unavailable`: 不可匹配  
- `matched`: 已匹配

**响应：**
```json
{
  "success": true,
  "message": "User match status updated successfully",
  "user": {
    "id": 1,
    "name": "张三",
    "match_status": "unavailable",
    "status_updated_at": "2024-01-01T12:00:00.000Z"
  },
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 3. 生成个人总结和约会建议

**POST** `/matching/generate-personal-summary`

为两个用户生成个人总结和约会建议。

**请求体：**
```json
{
  "user_id": 1,
  "target_user_id": 2
}
```

**响应：**
```json
{
  "success": true,
  "user_summary": "张三，25岁，阳光开朗的INTJ型男生，热爱运动和阅读，期待与你相遇！",
  "dating_advice": "1. 建议选择咖啡厅或书店进行第一次见面\n2. 可以聊运动、阅读等共同话题\n3. 注意保持轻松愉快的氛围\n4. 建议周末下午见面",
  "user_photos": [
    {
      "photo_url": "photo1.jpg",
      "is_primary": true
    }
  ],
  "target_user_photos": [
    {
      "photo_url": "photo2.jpg", 
      "is_primary": true
    }
  ],
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 4. 获取可匹配用户列表

**GET** `/matching/available-users/:user_id?limit=20`

获取可匹配的用户列表，排除已匹配的用户。

**参数：**
- `user_id`: 当前用户ID
- `limit`: 返回结果数量限制（可选，默认20）

**响应：**
```json
{
  "success": true,
  "user_id": 1,
  "available_users": [
    {
      "id": 3,
      "name": "王五",
      "age": 24,
      "gender": "女",
      "photo": "photo3.jpg",
      "mbti": "ENFP"
    }
  ],
  "count": 1
}
```

### 5. 获取匹配历史

**GET** `/matching/match-history/:user_id`

获取用户的匹配历史记录。

**响应：**
```json
{
  "success": true,
  "user_id": 1,
  "match_history": [
    {
      "id": "uuid",
      "user1_id": 1,
      "user2_id": 2,
      "match_score": 85,
      "is_bound": true,
      "created_at": "2024-01-01T12:00:00.000Z",
      "user1_name": "张三",
      "user2_name": "李四",
      "user1_photo": "photo1.jpg",
      "user2_photo": "photo2.jpg"
    }
  ]
}
```

## 数据库结构

### 用户表 (users) 新增字段
```sql
ALTER TABLE users 
ADD COLUMN match_status VARCHAR(20) DEFAULT 'available',
ADD COLUMN status_updated_at TIMESTAMP DEFAULT NOW(),
ADD COLUMN matched_at TIMESTAMP;
```

### 匹配记录表 (user_matches) 新增字段
```sql
ALTER TABLE user_matches 
ADD COLUMN is_bound BOOLEAN DEFAULT false;
```

## 错误处理

所有API都会返回适当的HTTP状态码和错误信息：

- `400 Bad Request`: 请求参数错误
- `404 Not Found`: 用户不存在
- `500 Internal Server Error`: 服务器内部错误

**错误响应示例：**
```json
{
  "error": "Missing required fields: user1_id, user2_id"
}
```

## 使用示例

### JavaScript 示例

```javascript
const axios = require('axios');

// 绑定匹配用户
async function bindMatchedUsers(user1Id, user2Id, matchScore) {
  try {
    const response = await axios.post('/matching/bind-matched-users', {
      user1_id: user1Id,
      user2_id: user2Id,
      match_score: matchScore,
      match_analysis: "这是一个很好的匹配！"
    });
    console.log('绑定成功:', response.data);
  } catch (error) {
    console.error('绑定失败:', error.response.data);
  }
}

// 更新用户状态
async function updateUserStatus(userId, status) {
  try {
    const response = await axios.put('/matching/update-match-status', {
      user_id: userId,
      match_status: status
    });
    console.log('状态更新成功:', response.data);
  } catch (error) {
    console.error('状态更新失败:', error.response.data);
  }
}

// 生成个人总结和约会建议
async function generateSummary(userId, targetUserId) {
  try {
    const response = await axios.post('/matching/generate-personal-summary', {
      user_id: userId,
      target_user_id: targetUserId
    });
    console.log('个人总结:', response.data.user_summary);
    console.log('约会建议:', response.data.dating_advice);
  } catch (error) {
    console.error('生成失败:', error.response.data);
  }
}
```

## 注意事项

1. **用户绑定后不可逆**: 一旦两个用户被绑定，他们将不再出现在其他匹配中
2. **状态管理**: 用户可以随时更改自己的匹配状态
3. **数据完整性**: 系统会自动维护匹配状态的一致性
4. **性能优化**: 使用了数据库索引来提高查询性能

## 测试

运行测试文件来验证功能：

```bash
node test_matching_functions.js
```

这将测试所有主要功能和错误处理情况。 