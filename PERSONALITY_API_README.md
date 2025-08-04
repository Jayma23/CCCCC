# Personality API 使用指南

## 概述

这个API提供了完整的用户personality数据处理功能，包括：
- 从personality上传数据到对应数据库表
- 生成用户数据的embedding并上传到Pinecone
- 确保每个用户的数据都存储到自己的数据库中

## API 端点

### 1. 上传单个Personality数据

**端点:** `POST /personality/upload-personality-data`

**功能:** 根据数据名称将数据存储到对应的数据库表中

**请求体:**
```json
{
    "user_id": "用户ID",
    "data_name": "数据名称",
    "data_content": "数据内容",
    "data_type": "text" // 可选: text, array, object
}
```

**支持的数据名称:**
- 基本信息: `name`, `age`, `gender`, `height`, `mbti`, `orientation`, `photo`
- 详细档案: `birthday`, `phone`, `zip_code`, `ethnicity`
- 偏好设置: `interested_in_genders`, `dating_intentions`, `ethnicity_attraction`, `preferred_areas`, `age_min`, `age_max`
- 个性信息: `about_me`, `hobbies`, `lifestyle`, `values`, `future_goals`, `perfect_date`, `green_flags`, `red_flags`, `physical_attraction_traits`, `extroversion_score`

**响应:**
```json
{
    "success": true,
    "message": "Data 'name' stored successfully for user 123",
    "user_id": "123",
    "data_name": "name",
    "stored_in": "users"
}
```

### 2. 批量上传Personality数据

**端点:** `POST /personality/upload-batch-personality-data`

**功能:** 批量上传多个数据项

**请求体:**
```json
{
    "user_id": "用户ID",
    "data_items": [
        {
            "data_name": "name",
            "data_content": "张三",
            "data_type": "text"
        },
        {
            "data_name": "age",
            "data_content": 25,
            "data_type": "text"
        },
        {
            "data_name": "hobbies",
            "data_content": "阅读,旅行,音乐",
            "data_type": "array"
        }
    ]
}
```

**响应:**
```json
{
    "success": true,
    "message": "Batch upload completed for user 123",
    "user_id": "123",
    "results": [
        {
            "data_name": "name",
            "status": "success",
            "stored_in": "users"
        },
        {
            "data_name": "age",
            "status": "success",
            "stored_in": "users"
        },
        {
            "data_name": "hobbies",
            "status": "success",
            "stored_in": "user_personality"
        }
    ]
}
```

### 3. 处理用户Embedding

**端点:** `POST /personality/process-user-embedding`

**功能:** 从各个数据库表获取用户完整数据，生成embedding并上传到Pinecone

**请求体:**
```json
{
    "user_id": "用户ID"
}
```

**响应:**
```json
{
    "success": true,
    "message": "User embedding processed and saved successfully",
    "user_id": "123",
    "embedding_length": 1536
}
```

### 4. 批量处理所有用户Embedding

**端点:** `POST /personality/process-all-users-embedding`

**功能:** 批量处理所有已提交表单的用户的embedding

**请求体:** 无

**响应:**
```json
{
    "success": true,
    "message": "Processed 10 users",
    "results": [
        {
            "user_id": "123",
            "status": "success"
        },
        {
            "user_id": "456",
            "status": "error",
            "error": "User data not found"
        }
    ]
}
```

### 5. 获取用户Personality数据

**端点:** `GET /personality/user-personality-data/:user_id`

**功能:** 获取用户的所有personality数据

**响应:**
```json
{
    "user_id": "123",
    "basic_info": {
        "name": "张三",
        "age": 25,
        "gender": "male",
        "orientation": "straight",
        "height": 175,
        "mbti": "INTJ",
        "photo": "https://example.com/photo.jpg"
    },
    "contact_info": {
        "phone": "13800138000",
        "zip_code": "100000",
        "birthday": "1998-01-01",
        "ethnicity": ["Asian"]
    },
    "preferences": {
        "interested_in_genders": ["female"],
        "dating_intentions": ["serious"],
        "ethnicity_attraction": ["Asian", "Caucasian"],
        "preferred_areas": ["Beijing", "Shanghai"],
        "age_range": [20, 30]
    },
    "personality": {
        "about_me": "我是一个热爱生活的人...",
        "hobbies": "阅读,旅行,音乐",
        "lifestyle": "健康的生活方式",
        "values": "诚实,善良,上进",
        "future_goals": "事业有成,家庭美满",
        "perfect_date": "一起看电影,共进晚餐",
        "green_flags": "善良,有责任心",
        "red_flags": "不诚实,不负责任",
        "physical_attraction_traits": "笑容,眼睛",
        "extroversion_score": 7
    },
    "photos": [
        {
            "photo_url": "https://example.com/photo1.jpg",
            "is_primary": true
        }
    ]
}
```

### 6. 获取用户Embedding信息

**端点:** `GET /personality/user-embedding/:user_id`

**功能:** 获取用户的embedding信息（从Pinecone和数据库）

**响应:**
```json
{
    "user_id": "123",
    "profile": {
        // 完整的用户档案数据
    },
    "embedding": {
        "id": "user_123",
        "values": [0.1, 0.2, ...],
        "metadata": {
            "user_id": "123",
            "name": "张三",
            "age": 25,
            "gender": "male",
            "orientation": "straight",
            "timestamp": "2024-01-01T00:00:00.000Z"
        }
    }
}
```

### 7. 删除用户特定数据

**端点:** `DELETE /personality/delete-personality-data`

**功能:** 删除用户的特定数据项

**请求体:**
```json
{
    "user_id": "用户ID",
    "data_name": "数据名称"
}
```

**响应:**
```json
{
    "success": true,
    "message": "Data 'hobbies' deleted successfully for user 123",
    "user_id": "123",
    "data_name": "hobbies",
    "deleted_from": "user_personality"
}
```

## 数据库表结构

### 主要表:

1. **users** - 基本用户信息
2. **user_profiles** - 详细档案信息
3. **user_preferences** - 偏好设置
4. **user_personality** - 个性信息
5. **user_photos** - 用户照片
6. **user_complete_profiles** - 完整用户档案（包含embedding）

### 数据映射:

| 数据名称 | 数据库表 | 字段名 |
|---------|---------|--------|
| name, age, gender, height, mbti, orientation, photo | users | 对应字段名 |
| birthday, phone, zip_code, ethnicity | user_profiles | 对应字段名 |
| interested_in_genders, dating_intentions, ethnicity_attraction, preferred_areas, age_min, age_max | user_preferences | 对应字段名 |
| about_me, hobbies, lifestyle, values, future_goals, perfect_date, green_flags, red_flags, physical_attraction_traits, extroversion_score | user_personality | 对应字段名 |

## Embedding处理流程

1. **数据收集**: 从各个数据库表获取用户完整数据
2. **文本生成**: 将用户数据转换为结构化的文本描述
3. **Embedding生成**: 使用OpenAI API生成文本的向量表示
4. **Pinecone上传**: 将embedding上传到Pinecone向量数据库
5. **本地存储**: 将embedding和原始数据保存到本地数据库

## 使用示例

### JavaScript示例:

```javascript
// 上传单个数据
const response = await fetch('/personality/upload-personality-data', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        user_id: '123',
        data_name: 'name',
        data_content: '张三',
        data_type: 'text'
    })
});

// 批量上传数据
const batchResponse = await fetch('/personality/upload-batch-personality-data', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        user_id: '123',
        data_items: [
            { data_name: 'name', data_content: '张三', data_type: 'text' },
            { data_name: 'age', data_content: 25, data_type: 'text' },
            { data_name: 'hobbies', data_content: '阅读,旅行,音乐', data_type: 'array' }
        ]
    })
});

// 处理用户embedding
const embeddingResponse = await fetch('/personality/process-user-embedding', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        user_id: '123'
    })
});
```

## 注意事项

1. **用户隔离**: 每个用户的数据都通过user_id进行隔离，确保数据安全
2. **数据验证**: API会验证必要字段的存在性和数据格式
3. **错误处理**: 所有操作都有完整的错误处理和日志记录
4. **事务安全**: 数据库操作使用事务确保数据一致性
5. **Pinecone集成**: 自动将用户embedding上传到Pinecone进行向量搜索

## 环境变量

确保以下环境变量已正确配置:

```env
DATABASE_URL=postgresql://username:password@host:port/database
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=your_pinecone_index_name
``` 