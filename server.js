// server.js
const WebSocket = require('ws');
const axios = require('axios');

const wss = new WebSocket.Server({ port: 8080 });

const chatRooms = new Map();
const wsMetadata = new Map();

const N8N_WEBHOOK_URL = 'https://n8n.futureflow.co.il/webhook/569f1361-16a7-4340-91a4-17d13b2b9dae';

const getConnectedUsersInChat = (currentChatId) => {
    if (chatRooms.has(currentChatId)) {
        return Array.from(chatRooms.get(currentChatId).keys());
    }
    return [];
};

const sendToN8nForProcessing = async (messageData) => {
    try {
        await axios.post(N8N_WEBHOOK_URL, messageData);
        console.log('Message sent to n8n for processing.');
    } catch (error) {
        console.error('Error sending message to n8n:', error.message);
    }
};

// **חדש:** הגדרת Heartbeat
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 שניות
const HEARTBEAT_TIMEOUT = 10 * 1000; // 10 שניות (זמן המתנה לפונג)

wss.on('connection', (ws) => {
    console.log('Client connected');

    // **חדש:** איפוס טיימר Heartbeat
    ws.isAlive = true; // סימון שהחיבור פעיל
    ws.on('pong', () => { // כשמקבלים פונג מהלקוח
        ws.isAlive = true;
        console.log('Server: Received pong from client.');
    });

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            // **תיקון כאן:** נפרק את ה-User ID מתוך 'created_by'
            const { type, chat_id, created_by, sender_name, message: text, ticket_watchers } = message; 

            console.log('Server: Message type:', type); 
            console.log('Server: Chat ID:', chat_id); 
            console.log('Server: User ID:', created_by); // <--- נציג את created_by כ-User ID בלוג
            console.log('Server: User Name:', sender_name); 

            if (!type) {
                console.error('Server: Error - Message type is missing!');
                ws.send(JSON.stringify({ error: 'Message type is required' }));
                return;
            }

            switch (type) {
                case 'JOIN_CHAT':
                    // **תיקון כאן:** ודא ש-created_by קיים
                    if (!chat_id || !created_by) { 
                        ws.send(JSON.stringify({ error: 'chat_id and created_by are required for JOIN_CHAT' }));
                        return;
                    }

                    if (!chatRooms.has(chat_id)) {
                        chatRooms.set(chat_id, new Map());
                    }

                    let userJustJoined = false;
                    // **תיקון כאן:** נשתמש ב-created_by
                    if (!chatRooms.get(chat_id).has(created_by)) { 
                        chatRooms.get(chat_id).set(created_by, ws);
                        wsMetadata.set(ws, { chat_id, userId: created_by, username: sender_name }); // שמור כ-userId בתוך wsMetadata
                        console.log(`User ${created_by} joined chat ${chat_id}. Current members: ${chatRooms.get(chat_id).size}`);
                        userJustJoined = true;
                    } else {
                        console.log(`User ${created_by} already in chat ${chat_id}. Skipping re-join.`);
                    }

                    const currentUsersAfterJoin = getConnectedUsersInChat(chat_id);
                    const joinConfirmationMessage = {
                        type: 'PRESENCE_UPDATE',
                        chat_id: chat_id,
                        onlineUsers: currentUsersAfterJoin,
                        timestamp: new Date().toISOString(),
                        eventType: userJustJoined ? 'user_joined' : 'current_status',
                        affectedUserId: created_by, // <--- שימוש ב-created_by
                        affectedUserName: sender_name
                    };
                    
                    chatRooms.get(chat_id).forEach((clientSocket) => {
                        if (clientSocket.readyState === WebSocket.OPEN) {
                            clientSocket.send(JSON.stringify(joinConfirmationMessage));
                        }
                    });
                    break;

                case 'CHAT_MESSAGE':
                    console.log('Server: Handling CHAT_MESSAGE...');
                    // **תיקון כאן:** ודא ש-created_by (ולא userId) קיים
                    if (!chat_id || !sender_name || !text || !created_by || !ticket_watchers) { 
                        console.error('Server: Error - Missing data for CHAT_MESSAGE, or no watchers!', { chat_id, sender_name, text, created_by, ticket_watchers: ticket_watchers ? ticket_watchers.length : 'none' });
                        ws.send(JSON.stringify({ error: 'chat_id, sender_name, message, created_by, and ticket_watchers are required for CHAT_MESSAGE' }));
                        return;
                    }

                    // **תיקון כאן:** השולח נרשם לפי created_by
                    if (!chatRooms.has(chat_id) || !chatRooms.get(chat_id).has(created_by)) {
                        if (!chatRooms.has(chat_id)) {
                            chatRooms.set(chat_id, new Map());
                        }
                        chatRooms.get(chat_id).set(created_by, ws);
                        wsMetadata.set(ws, { chat_id, userId: created_by, username: sender_name }); // שמור כ-userId בתוך wsMetadata
                        console.log(`User ${created_by} implicitly joined chat ${chat_id} by sending message.`);
                    }

                    const currentOnlineUsers = getConnectedUsersInChat(chat_id);

                    const offlineWatchers = ticket_watchers.filter(watcher => {
                        // **תיקון כאן:** השוואה מול created_by של השולח
                        if (watcher.user_id === created_by) { 
                            return false;
                        }
                        return !currentOnlineUsers.includes(watcher.user_id);
                    });

                    sendToN8nForProcessing({
                        comment_text: text,
                        created_by_name: sender_name,
                        created_by: created_by, // <--- ודא שזה created_by
                        created_at: new Date().toISOString(),
                        related_to_id: chat_id,
                        offline_watchers: offlineWatchers
                    });

                    const broadcastMessage = {
                        type: 'CHAT_MESSAGE',
                        sender: sender_name,
                        text,
                        timestamp: new Date().toISOString(),
                        created_by: created_by, // <--- שימוש ב-created_by
                        onlineUsers: currentOnlineUsers
                    };

                    chatRooms.get(chat_id).forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(broadcastMessage));
                        }
                    });
                    console.log(`Message from ${sender_name} in ${chat_id} broadcasted and offline watchers sent to n8n.`);
                    break;

                default:
                    ws.send(JSON.stringify({ error: `Unknown message type: ${type}` }));
                    break;
            }
        } catch (error) {
            console.error('Error processing WebSocket message:', error);
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });


    ws.on('close', () => {
        console.log('Client disconnected');
        const metadata = wsMetadata.get(ws);
        if (metadata) {
            const { chat_id, userId, username } = metadata;
            if (chatRooms.has(chat_id)) {
                chatRooms.get(chat_id).delete(userId);
                const currentUsersAfterDisconnect = getConnectedUsersInChat(chat_id);
                const disconnectMessage = {
                    type: 'PRESENCE_UPDATE',
                    chat_id: chat_id,
                    onlineUsers: currentUsersAfterDisconnect,
                    timestamp: new Date().toISOString(),
                    eventType: 'user_left',
                    affectedUserId: userId,
                    affectedUserName: username
                };

                chatRooms.get(chat_id).forEach((clientSocket) => {
                    if (clientSocket.readyState === WebSocket.OPEN) {
                        clientSocket.send(JSON.stringify(disconnectMessage));
                    }
                });

                if (chatRooms.get(chat_id).size === 0) {
                    chatRooms.delete(chat_id);
                }
            }
            wsMetadata.delete(ws);
            console.log(`User ${userId} left chat ${chat_id}. Remaining members: ${chatRooms.has(chat_id) ? chatRooms.get(chat_id).size : 0}`);
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// **חדש:** טיימר Heartbeat בצד השרת
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) { // אם לא קיבלנו פונג בטיימר הקודם
            console.log('Server: Client did not respond to ping, terminating connection.');
            return ws.terminate(); // נתק את החיבור
        }

        ws.isAlive = false; // סמן ל-false, נצפה לקבל פונג
        ws.ping(); // שלח פינג ללקוח
        console.log('Server: Ping sent to client.');

        // טיימר פנימי לכל לקוח למקרה שלא יחזיר פונג בזמן
        setTimeout(() => {
            if (ws.isAlive === false) { // אם עדיין לא קיבלנו פונג אחרי timeout קצר
                console.log('Server: Client did not respond to ping within timeout, terminating connection.');
                ws.terminate();
            }
        }, HEARTBEAT_TIMEOUT);

    });
}, HEARTBEAT_INTERVAL);

console.log('WebSocket server running on ws://localhost:8080');
