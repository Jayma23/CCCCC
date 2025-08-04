# Smart Matching API User Guide

## Overview

This API provides intelligent matching functionality for two people, based on comprehensive scoring across multiple dimensions:
- Basic preference matching (gender, sexual orientation, dating intentions)
- Age matching
- Geographic location matching
- Interest and hobby matching
- Values matching
- Embedding similarity (based on AI-generated vectors)

## API Endpoints

### 1. Match Two Users

**Endpoint:** `POST /match/match-two-users`

**Function:** Intelligently match two users, calculate match score and generate analysis report

**Request Body:**
```json
{
    "user1_id": "User 1 ID",
    "user2_id": "User 2 ID"
}
```

**Response:**
```json
{
    "success": true,
    "user1_id": "user-123",
    "user2_id": "user-456",
    "match_score": {
        "overall": 85,
        "breakdown": {
            "basic_preference": 90,
            "age": 100,
            "location": 80,
            "interests": 75,
            "values": 85,
            "embedding": 80,
            "final": 85
        }
    },
    "match_analysis": "Detailed analysis report...",
    "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Get User Match History

**Endpoint:** `GET /match/user-matches/:user_id`

**Function:** Get all match records for a specific user

**Response:**
```json
{
    "success": true,
    "user_id": "user-123",
    "matches": [
        {
            "id": "match-uuid",
            "user1_id": "user-123",
            "user2_id": "user-456",
            "match_score": 85,
            "score_breakdown": {
                "basic_preference": 90,
                "age": 100,
                "location": 80,
                "interests": 75,
                "values": 85,
                "embedding": 80
            },
            "match_analysis": "Detailed analysis report...",
            "created_at": "2024-01-01T00:00:00.000Z",
            "user1_name": "John Smith",
            "user2_name": "Sarah Johnson",
            "user1_photo": "https://example.com/photo1.jpg",
            "user2_photo": "https://example.com/photo2.jpg"
        }
    ]
}
```

### 3. Get Best Match Recommendations

**Endpoint:** `GET /match/best-matches/:user_id?limit=10`

**Function:** Get the best match recommendation list for a specific user

**Parameters:**
- `limit`: Number of recommendations to return (default 10)

**Response:**
```json
{
    "success": true,
    "user_id": "user-123",
    "matches": [
        {
            "user": {
                "user_id": "user-456",
                "name": "Sarah Johnson",
                "age": 25,
                "gender": "female",
                "orientation": "straight",
                "photo": "https://example.com/photo.jpg",
                "hobbies": "Reading,Travel,Music",
                "values": "Honesty,Kindness,Ambition",
                "about_me": "I am a person who loves life...",
                "lifestyle": "Healthy lifestyle...",
                "future_goals": "Career Success,Happy Family",
                "perfect_date": "Watch Movies Together,Dinner",
                "green_flags": "Kind,Responsible",
                "red_flags": "Dishonest,Irresponsible",
                "physical_attraction_traits": "Smile,Eyes,Charisma",
                "extroversion_score": 7
            },
            "match_score": {
                "overall": 85,
                "breakdown": {
                    "basic_preference": 90,
                    "age": 100,
                    "location": 80,
                    "interests": 75,
                    "values": 85,
                    "embedding": 80
                }
            }
        }
    ]
}
```

## Matching Algorithm Details

### 1. Basic Preference Matching (30% weight)

**Scoring Criteria:**
- Gender preference matching: 40 points
- Sexual orientation compatibility: 30 points
- Dating intention matching: 30 points

**Calculation Logic:**
```javascript
// Check gender preferences
if (user1.interested_in_genders.includes(user2.gender) && 
    user2.interested_in_genders.includes(user1.gender)) {
    score += 40;
}

// Check sexual orientation compatibility
if (user1.orientation === user2.orientation || 
    (user1.orientation === 'bisexual' || user2.orientation === 'bisexual')) {
    score += 30;
}

// Check dating intentions
const commonIntentions = user1.dating_intentions.filter(intention => 
    user2.dating_intentions.includes(intention)
);
if (commonIntentions.length > 0) {
    score += (commonIntentions.length / Math.max(user1.dating_intentions.length, user2.dating_intentions.length)) * 30;
}
```

### 2. Age Matching (15% weight)

**Scoring Criteria:**
- Both ages within each other's preference range: 100 points
- One age within the other's preference range: 50 points
- Age difference ≤ 5 years: 30 points
- Age difference ≤ 10 years: 20 points
- Others: 10 points

### 3. Geographic Location Matching (10% weight)

**Scoring Criteria:**
- Common preferred areas: calculated based on common area ratio
- No common areas: 20 points
- No area preferences: 50 points

### 4. Interest and Hobby Matching (15% weight)

**Scoring Criteria:**
- Based on common interests ratio
- Uses fuzzy matching (inclusion relationship)

### 5. Values Matching (15% weight)

**Scoring Criteria:**
- Based on common values ratio
- Uses fuzzy matching (inclusion relationship)

### 6. Embedding Similarity (15% weight)

**Scoring Criteria:**
- Uses cosine similarity to calculate similarity between two users' embedding vectors
- Converts similarity to 0-100 score

## Match Analysis Report

The system uses OpenAI to generate detailed match analysis reports, including:

1. **Overall Match Evaluation**: Comprehensive scoring and evaluation
2. **Multi-dimensional Match Analysis**: Detailed analysis of each dimension's match situation
3. **Potential Advantages and Challenges**: Analysis of match advantages and possible issues
4. **Suggested Dating Activities**: Dating suggestions based on common interests
5. **Match Recommendations**: Professional match advice and considerations

## Database Table Structure

### user_matches Table
```sql
CREATE TABLE user_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user1_id UUID NOT NULL,
    user2_id UUID NOT NULL,
    match_score INTEGER NOT NULL,
    score_breakdown JSONB,
    match_analysis TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user1_id, user2_id)
);
```

## Usage Examples

### JavaScript Example:

```javascript
// Match two users
const matchResponse = await fetch('/match/match-two-users', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        user1_id: 'user-123',
        user2_id: 'user-456'
    })
});

const matchResult = await matchResponse.json();
console.log(`Match score: ${matchResult.match_score.overall}/100`);
console.log(`Analysis report: ${matchResult.match_analysis}`);

// Get user match history
const historyResponse = await fetch('/match/user-matches/user-123');
const history = await historyResponse.json();
console.log(`Match history: ${history.matches.length} records`);

// Get best match recommendations
const recommendationsResponse = await fetch('/match/best-matches/user-123?limit=5');
const recommendations = await recommendationsResponse.json();
console.log(`Recommended users: ${recommendations.matches.length}`);
```

### Python Example:

```python
import requests

# Match two users
response = requests.post('http://localhost:3000/match/match-two-users', json={
    'user1_id': 'user-123',
    'user2_id': 'user-456'
})

match_result = response.json()
print(f"Match score: {match_result['match_score']['overall']}/100")

# Get match history
history_response = requests.get('http://localhost:3000/match/user-matches/user-123')
history = history_response.json()
print(f"Match history: {len(history['matches'])} records")

# Get recommendations
recommendations_response = requests.get('http://localhost:3000/match/best-matches/user-123?limit=5')
recommendations = recommendations_response.json()
print(f"Recommended users: {len(recommendations['matches'])}")
```

## Error Handling

### Common Errors:

1. **Missing Required Parameters**
```json
{
    "error": "Missing required fields: user1_id, user2_id"
}
```

2. **User Not Found**
```json
{
    "error": "One or both users not found"
}
```

3. **Matching Self**
```json
{
    "error": "Cannot match user with themselves"
}
```

4. **Server Error**
```json
{
    "error": "Internal server error"
}
```

## Performance Optimization

### 1. Database Optimization
- Create indexes on user_id fields
- Use connection pools to manage database connections
- Batch queries to reduce database access times

### 2. Embedding Calculation Optimization
- Cache embedding calculation results
- Asynchronous processing for large batch matching requests
- Use vector databases for fast similarity calculations

### 3. Recommendation Algorithm Optimization
- Pre-calculate potential matching users
- Use pagination to reduce data transmission
- Implement intelligent caching mechanisms

## Security Considerations

### 1. Data Privacy
- Users can only view their own match records
- Sensitive information is encrypted during transmission and storage
- Implement user authorization verification

### 2. API Security
- Input validation and sanitization
- Prevent SQL injection attacks
- Implement API rate limiting mechanisms

### 3. Matching Algorithm Security
- Ensure fairness of matching algorithms
- Prevent malicious users from manipulating match results
- Protect user privacy information

## Extension Features

### 1. Advanced Matching Options
- Custom matching weights
- Multi-dimensional filtering conditions
- Real-time match status updates

### 2. Match Quality Assessment
- User feedback collection
- Match success rate statistics
- Algorithm effectiveness evaluation

### 3. Social Features
- Chat functionality after matching
- Dating plan arrangements
- Relationship status tracking

## Important Notes

1. **Data Integrity**: Ensure user data is complete, especially embedding data
2. **Algorithm Fairness**: Matching algorithms should be fair to all users
3. **Performance Monitoring**: Monitor API response times and system resource usage
4. **User Feedback**: Collect user feedback on match results and continuously optimize algorithms
5. **Privacy Protection**: Strictly comply with data privacy regulations

## Environment Variables

Ensure the following environment variables are properly configured:

```env
DATABASE_URL=postgresql://username:password@host:port/database
OPENAI_API_KEY=your_openai_api_key
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=your_pinecone_index_name
```

This intelligent matching system provides powerful user matching functionality for your application, capable of comprehensive evaluation based on multiple dimensions and providing high-quality match recommendations for users. 