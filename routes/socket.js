const socketIO = require('socket.io');

const onlineUsers = new Map();

function setupSocket(server, pool) {
    const io = socketIO(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST']
        }
    });

    io.on('connection', (socket) => {
        console.log('✅ New client connected', socket.id);

        socket.on('register', (userId) => {
            onlineUsers.set(userId, socket.id);
            console.log(`User ${userId} registered on socket`);
        });

        socket.on('send_message', async (data) => {
            const { chat_id, sender_id, receiver_id, content } = data;

            try {
                await pool.query(`
          INSERT INTO chat_messages (chat_id, sender_id, message)
          VALUES ($1, $2, $3)
        `, [chat_id, sender_id, content]);

                await pool.query(`
          UPDATE chat_rooms SET last_updated = NOW() WHERE id = $1
        `, [chat_id]);

                const payload = {
                    chat_id,
                    sender_id,
                    content,
                    timestamp: new Date().toISOString()
                };

                const receiverSocket = onlineUsers.get(receiver_id);
                if (receiverSocket) {
                    io.to(receiverSocket).emit('receive_message', payload);
                }

                socket.emit('receive_message', payload);
            } catch (err) {
                console.error('send_message error:', err);
            }
        });

        socket.on('typing', ({ receiver_id }) => {
            const receiverSocket = onlineUsers.get(receiver_id);
            if (receiverSocket) {
                io.to(receiverSocket).emit('typing', { timestamp: Date.now() });
            }
        });

        socket.on('disconnect', () => {
            for (const [userId, sId] of onlineUsers.entries()) {
                if (sId === socket.id) {
                    onlineUsers.delete(userId);
                    break;
                }
            }
        });
    });

    return io;
}

module.exports = { setupSocket, onlineUsers };
