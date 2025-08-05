-- 数据库迁移脚本：为现有数据库添加匹配管理功能所需的字段

-- 1. 检查并添加users表的匹配状态字段
DO $$
BEGIN
    -- 检查match_status字段是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'match_status'
    ) THEN
        ALTER TABLE users ADD COLUMN match_status VARCHAR(20) DEFAULT 'available';
    END IF;
    
    -- 检查status_updated_at字段是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'status_updated_at'
    ) THEN
        ALTER TABLE users ADD COLUMN status_updated_at TIMESTAMP DEFAULT NOW();
    END IF;
    
    -- 检查matched_at字段是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'matched_at'
    ) THEN
        ALTER TABLE users ADD COLUMN matched_at TIMESTAMP;
    END IF;
END $$;

-- 2. 检查并添加user_matches表的绑定标识字段
DO $$
BEGIN
    -- 检查is_bound字段是否存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_matches' AND column_name = 'is_bound'
    ) THEN
        ALTER TABLE user_matches ADD COLUMN is_bound BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3. 创建索引以提高查询性能（如果不存在）
CREATE INDEX IF NOT EXISTS idx_users_match_status ON users(match_status);
CREATE INDEX IF NOT EXISTS idx_users_status_updated ON users(status_updated_at);
CREATE INDEX IF NOT EXISTS idx_user_matches_bound ON user_matches(is_bound);
CREATE INDEX IF NOT EXISTS idx_user_matches_users ON user_matches(user1_id, user2_id);

-- 4. 更新现有用户的匹配状态（如果字段为空）
UPDATE users 
SET match_status = 'available' 
WHERE match_status IS NULL;

-- 5. 创建视图来简化查询已匹配用户
CREATE OR REPLACE VIEW matched_users AS
SELECT 
    um.user1_id,
    um.user2_id,
    um.match_score,
    um.created_at as matched_at,
    u1.name as user1_name,
    u2.name as user2_name,
    u1.photo as user1_photo,
    u2.photo as user2_photo
FROM user_matches um
JOIN users u1 ON um.user1_id = u1.id
JOIN users u2 ON um.user2_id = u2.id
WHERE um.is_bound = true;

-- 6. 创建函数来检查用户是否已匹配
CREATE OR REPLACE FUNCTION is_user_matched(user_id_param INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM user_matches 
        WHERE (user1_id = user_id_param OR user2_id = user_id_param)
          AND is_bound = true
    );
END;
$$ LANGUAGE plpgsql;

-- 7. 创建函数来获取用户的匹配对象
CREATE OR REPLACE FUNCTION get_user_match_partner(user_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
    partner_id INTEGER;
BEGIN
    SELECT 
        CASE 
            WHEN user1_id = user_id_param THEN user2_id
            ELSE user1_id
        END INTO partner_id
    FROM user_matches 
    WHERE (user1_id = user_id_param OR user2_id = user_id_param)
      AND is_bound = true
    LIMIT 1;
    
    RETURN partner_id;
END;
$$ LANGUAGE plpgsql;

-- 8. 创建触发器来自动更新用户状态
CREATE OR REPLACE FUNCTION update_user_match_status()
RETURNS TRIGGER AS $$
BEGIN
    -- 当创建新的绑定匹配时，更新用户状态
    IF NEW.is_bound = true THEN
        UPDATE users 
        SET match_status = 'matched', 
            matched_at = NOW()
        WHERE id IN (NEW.user1_id, NEW.user2_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器（如果不存在）
DROP TRIGGER IF EXISTS trigger_update_user_match_status ON user_matches;
CREATE TRIGGER trigger_update_user_match_status
    AFTER INSERT OR UPDATE ON user_matches
    FOR EACH ROW
    EXECUTE FUNCTION update_user_match_status();

-- 9. 创建统计视图
CREATE OR REPLACE VIEW match_statistics AS
SELECT 
    COUNT(*) as total_matches,
    COUNT(CASE WHEN is_bound = true THEN 1 END) as bound_matches,
    COUNT(CASE WHEN match_score >= 80 THEN 1 END) as high_score_matches,
    AVG(match_score) as average_match_score,
    DATE_TRUNC('day', created_at) as match_date
FROM user_matches
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY match_date DESC;

-- 完成迁移
SELECT 'Database migration completed successfully! Existing tables preserved, new fields added.' as status; 