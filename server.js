// server.js
const WebSocket = require('ws');
const axios = require('axios');

const wss = new WebSocket.Server({ port: 8080 }); // WebSocket server


const chatRooms = new Map();
const wsMetadata = new Map();

//מפה שמקשרת User ID ל-WebSocket Instance (למעקב אחרי חיבור יחיד למשתמש)
const userToWsMap = new Map();

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

// **חדש:** הגדרות Heartbeat
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 שניות
const HEARTBEAT_TIMEOUT = 10 * 1000; // 10 שניות (זמן המתנה לפונג)

wss.on('connection', (ws) => {
    console.log('Client connected');

    // **חדש:** איפוס טיימר Heartbeat
    ws.lastPong = Date.now(); // שמור מתי הפונג האחרון התקבל

    ws.on('message', (data) => {
        console.log('Server: Raw message received:', data);
        try {
            const message = JSON.parse(data);
            const { type, chat_id, created_by, sender_name, message: text, ticket_watchers, userIdToDisconnect } = message; // userIdToDisconnect אם נשתמש בו בעתיד לניתוק יזום דרך WS

// **חדש:** טיפול בהודעת PONG מותאמת אישית מהלקוח
            if (type === 'HEARTBEAT_PONG') {
                const metadata = wsMetadata.get(ws);
                const { currentChatIdAtClient } = message; // **קריטי:** קבל את ה-chatId האמיתי מהלקוח

                if (metadata) {
                    // **קריטי:** אם הלקוח מדווח שהוא לא באותו צאט ID שהשרת חושב, ננתק אותו.
                     if (
                    (currentChatIdAtClient && metadata.chat_id && currentChatIdAtClient !== metadata.chat_id) || // עבר לצאט אחר
                    (!currentChatIdAtClient && metadata.chat_id)|| // אינו בעמוד צאט (שלח null/undefined), אבל השרת זוכר אותו מחובר לצאט
                    (!currentChatIdAtClient && !metadata.chat_id && !chatRooms.has(currentChatIdAtClient)) // אם הלקוח מדווח על NULL/UNDEFINED וגם השרת זוכר אותו כ-NULL/UNDEFINED, ובפועל הוא לא באף חדר.                
) {
                        console.warn(`Server: Client ${metadata.userId} moved from chat ${metadata.chat_id} to ${currentChatIdAtClient}. Terminating old connection.`);
                        ws.terminate(); // נתק את החיבור
                        return; // סיים טיפול בהודעה זו
                    }
                    ws.lastPong = Date.now(); // עדכן את זמן הפונג האחרון
                    console.log(`Server: Received PONG from client ${metadata.username || metadata.userId} (Chat: ${metadata.chat_id}). Client reports being in chat: ${currentChatIdAtClient}.`);
                } else {
                    console.log('Server: Received PONG from unknown client, cleaning up if possible.');
                    // אם הלקוח לא מזוהה, ננתק אותו אם הוא שולח פונג ללא מטדאטה
                    if (ws.readyState === WebSocket.OPEN) {
                         ws.terminate();
                         return;
                    }
                }
                return; // טופל, אל תמשיך ל-switch case
            }

            console.log('Server: Message type:', type);
            console.log('Server: Chat ID:', chat_id);
            console.log('Server: User ID:', created_by);
            console.log('Server: User Name:', sender_name);

            if (!type) {
                console.error('Server: Error - Message type is missing!');
                ws.send(JSON.stringify({ error: 'Message type is required' }));
                return;
            }

            switch (type) {
                case 'JOIN_CHAT':
                    console.log('Server: Handling JOIN_CHAT...');
                    if (!chat_id || !created_by) {
                        ws.send(JSON.stringify({ error: 'chat_id and created_by are required for JOIN_CHAT' }));
                        return;
                    }

                    // **קריטי:** ניתוק חיבורים קודמים עבור אותו משתמש, אם קיימים
                    if (userToWsMap.has(created_by)) {
                        const oldWs = userToWsMap.get(created_by);
                        // ודא שזה לא אותו חיבור חדש
                        if (oldWs !== ws) {
                            console.warn(`Server: User ${created_by} is already connected via another socket. Terminating old socket.`);
                            if (oldWs.readyState === WebSocket.OPEN) {
                                oldWs.close(1000, 'New connection established for same user'); // סגירה נקייה של הישן
                            } else if (oldWs.readyState !== WebSocket.CLOSED) {
                                oldWs.terminate();
                            }
                            // נקה את הישן מכל החדרים שלו (אם לא נוקה על ידי onclose)
                            const oldMetadata = wsMetadata.get(oldWs);
                            if (oldMetadata && chatRooms.has(oldMetadata.chat_id)) {
                                chatRooms.get(oldMetadata.chat_id).delete(created_by);
                                if (chatRooms.get(oldMetadata.chat_id).size === 0) chatRooms.delete(oldMetadata.chat_id);
                                console.log(`Server: Cleaned up old chat room entry for user ${created_by} in chat ${oldMetadata.chat_id}.`);
                            }
                            wsMetadata.delete(oldWs); // נקה גם מהמטאדאטה
                        }
                    }
                    userToWsMap.set(created_by, ws); // קשר את היוזר לחיבור החדש

                    // הסרה מהחדר הישן (אם היה) לפני הוספה לחדש
                    // הלוגיקה של `userToWsMap` ו-`terminate` למעלה מטפלת בזה במידה רבה.
                    // רק לוודא שיוסר מהחדר הישן שלו
                    // ניתן למצוא את החדר הישן באמצעות wsMetadata
                    const existingMetadataForThisWs = wsMetadata.get(ws);
                    if (existingMetadataForThisWs && existingMetadataForThisWs.chat_id && existingMetadataForThisWs.chat_id !== chat_id) {
                        if (chatRooms.has(existingMetadataForThisWs.chat_id)) {
                            chatRooms.get(existingMetadataForWs.chat_id).delete(created_by);
                            if (chatRooms.get(existingMetadataForWs.chat_id).size === 0) chatRooms.delete(existingMetadataForWs.chat_id);
                            console.log(`Server: User ${created_by} left old chat ${existingMetadataForWs.chat_id} to join new chat ${chat_id}.`);
                        }
                    }

                    if (!chatRooms.has(chat_id)) {
                        chatRooms.set(chat_id, new Map());
                    }

                    let userJustJoined = false;
                    if (!chatRooms.get(chat_id).has(created_by)) {
                        chatRooms.get(chat_id).set(created_by, ws);
                        wsMetadata.set(ws, { chat_id, userId: created_by, username: sender_name }); // שמור גם את השם
                        console.log(`User ${created_by} joined chat ${chat_id}. Current members: ${chatRooms.get(chat_id).size}`);
                        userJustJoined = true;
                    } else {
                        console.log(`User ${created_by} already in chat ${chat_id}. Skipping re-join.`);
                        wsMetadata.set(ws, { chat_id, userId: created_by, username: sender_name }); // ודא עדכון המטאדאטה
                    }
                    // **חדש:** שלח PONG מיד עם ההצטרפות לוודא שהוא חי
                    ws.lastPong = Date.now();

                    const currentUsersAfterJoin = getConnectedUsersInChat(chat_id);
                    const joinConfirmationMessage = {
                        type: 'PRESENCE_UPDATE',
                        chat_id: chat_id,
                        onlineUsers: currentUsersAfterJoin,
                        timestamp: new Date().toISOString(),
                        eventType: userJustJoined ? 'התחבר לצ\'אט' : 'סטטוס עדכני',
                        affectedUserId: created_by,
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
                    if (!chat_id || !sender_name || !text || !created_by || !ticket_watchers) {
                        console.error('Server: Error - Missing data for CHAT_MESSAGE, or no watchers!', { chat_id, sender_name, text, created_by, ticket_watchers: ticket_watchers ? ticket_watchers.length : 'none' });
                        ws.send(JSON.stringify({ error: 'chat_id, sender_name, message, created_by, and ticket_watchers are required for CHAT_MESSAGE' }));
                        return;
                    }

                    if (!chatRooms.has(chat_id) || !chatRooms.get(chat_id).has(created_by)) {
                        if (!chatRooms.has(chat_id)) {
                            chatRooms.set(chat_id, new Map());
                        }
                        chatRooms.get(chat_id).set(created_by, ws);
                        wsMetadata.set(ws, { chat_id, userId: created_by, username: sender_name });
                        console.log(`User ${created_by} implicitly joined chat ${chat_id} by sending message.`);
                    }

                    // **חדש:** עדכן lastPong גם בשליחת הודעה, כי זה מעיד על פעילות
                    ws.lastPong = Date.now();

                    const currentOnlineUsers = getConnectedUsersInChat(chat_id);

                    const offlineWatchers = ticket_watchers.filter(watcher => {
                        if (watcher.user_id === created_by) {
                            return false;
                        }
                        return !currentOnlineUsers.includes(watcher.user_id);
                    });

                    sendToN8nForProcessing({
                        comment_text: text,
                        created_by_name: sender_name,
                        created_by: created_by,
                        created_at: new Date().toISOString(),
                        related_to_id: chat_id,
                        offline_watchers: offlineWatchers
                    });

                    const broadcastMessage = {
                        type: 'CHAT_MESSAGE',
                        sender: sender_name,
                        text,
                        timestamp: new Date().toISOString(),
                        created_by: created_by,
                        onlineUsers: currentOnlineUsers
                    };

                    chatRooms.get(chat_id).forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(broadcastMessage));
                        }
                    });
                    console.log(`Message from ${sender_name} in ${chat_id} broadcasted and offline watchers sent to n8n.`);
                    break;

            case 'LEAVE_CHAT': //טיפול בהודעת עזיבה יזומה מהלקוח
                console.log('Server: Handling LEAVE_CHAT request.');
                if (!chat_id || !created_by) {
                    console.error('Server: Error - chat_id and created_by are required for LEAVE_CHAT.');
                    ws.send(JSON.stringify({ error: 'chat_id and created_by required for LEAVE_CHAT' }));
                    return;
                }

                const leavingUserMetadata = wsMetadata.get(ws);
                if (leavingUserMetadata && leavingUserMetadata.userId === created_by && leavingUserMetadata.chat_id === chat_id) {
                    // הסרה מהחדר
                    if (chatRooms.has(chat_id)) {
                        chatRooms.get(chat_id).delete(created_by);
                        console.log(`User ${created_by} explicitly left chat ${chat_id}. Remaining members: ${chatRooms.get(chat_id).size}.`);

                        // עדכן את רשימת המחוברים ושלח PRESENCE_UPDATE
                        const currentUsersAfterLeave = getConnectedUsersInChat(chat_id);
                        const leaveNotificationMessage = {
                            type: 'PRESENCE_UPDATE',
                            chat_id: chat_id,
                            onlineUsers: currentUsersAfterLeave,
                            timestamp: new Date().toISOString(),
                            eventType: 'user_left',
                            affectedUserId: created_by,
                            affectedUserName: sender_name // השם נשלח מהלקוח
                        };

                        chatRooms.get(chat_id).forEach((clientSocket) => {
                            if (clientSocket.readyState === WebSocket.OPEN) {
                                clientSocket.send(JSON.stringify(leaveNotificationMessage));
                            }
                        });

                        if (chatRooms.get(chat_id).size === 0) {
                            chatRooms.delete(chat_id);
                        }
                    } else {
                        console.warn(`Server: LEAVE_CHAT request for user ${created_by} from chat ${chat_id}, but user not found in chatRooms.`);
                    }
                    // לא לנתק את ה-ws כאן, רק להסיר מהחדר. החיבור יכול להישאר פעיל לדף כללי.
                } else {
                    console.warn(`Server: LEAVE_CHAT request for ${created_by} from ${chat_id}, but connection metadata does not match.`);
                }
                break;

                default:
                    console.warn('Server: Unknown WebSocket message type:', type);
                    ws.send(JSON.stringify({ error: `Unknown message type: ${type}` }));
                    break;
            }
        } catch (error) {
            console.error('Server: Error processing WebSocket message, raw data:', data, 'Error:', error);
            ws.send(JSON.stringify({ error: 'Invalid message format' }));
        }
    });

ws.on('close', (code, reason) => { // **שינוי:** קבל גם code ו-reason
    console.log(`Client disconnected with code ${code} and reason: ${reason}`); // לוג מפורט
    const closedSocketMetadata = wsMetadata.get(ws);

    wsMetadata.delete(ws); // **קריטי:** הסר את ה-ws מהמפה של wsMetadata מיד.

    if (closedSocketMetadata) { // ודא שיש לנו מידע על הלקוח שנסגר
        const { chat_id, userId, username } = closedSocketMetadata;

        //הסר את היוזר מ-userToWsMap
        if (closedSocketMetadata && userToWsMap.get(closedSocketMetadata.userId) === ws) {
          userToWsMap.delete(closedSocketMetadata.userId);
          console.log(`Server: User ${closedSocketMetadata.userId} removed from userToWsMap.`);
          }

        // **קריטי:** נקה את הלקוח מ-chatRooms באופן ודאי
        if (chatRooms.has(chat_id)) {
            chatRooms.get(chat_id).delete(userId);

            const currentUsersAfterDisconnect = getConnectedUsersInChat(chat_id);
            const disconnectMessage = {
                type: 'PRESENCE_UPDATE',
                chat_id: chat_id,
                onlineUsers: currentUsersAfterDisconnect,
                timestamp: new Date().toISOString(),
                eventType: 'התנתק מהצ\'אט',
                affectedUserId: userId,
                affectedUserName: username
            };

            chatRooms.get(chat_id).forEach((clientSocket) => {
                if (clientSocket.readyState === WebSocket.OPEN) {
                    clientSocket.send(JSON.stringify(disconnectMessage));
                }
            });

            if (chatRooms.get(chat_id).size === 0) {
                chatRooms.delete(chat_id); // הסר את החדר אם אין בו יותר חברים
            }
            console.log(`User ${userId} left chat ${chat_id}. Remaining members: ${chatRooms.has(chat_id) ? chatRooms.get(chat_id).size : 0}`);
        } else {
            console.warn(`Client disconnected, but metadata not found for ws. (Already cleaned up?)`);
        }
    } else {
        console.log('Client disconnected, no associated metadata found.');
    }
});

// **חדש:** טיימר Heartbeat מותאם אישית בצד השרת
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState !== WebSocket.OPEN) { // אם החיבור לא פתוח, אל תשלח לו פינג
            return;
        }
        const metadata = wsMetadata.get(ws);
        const userInfo = metadata ? ` (User: ${metadata.username || metadata.userId}, Chat: ${metadata.chat_id})` : '';

        // **קריטי:** אם עבר יותר מדי זמן מאז הפונג האחרון, נתק את החיבור
        if (Date.now() - ws.lastPong > HEARTBEAT_TIMEOUT) {
            console.log(`Server: Client ${userInfo} did not respond to PONG within timeout, terminating connection.`);
            return ws.terminate(); // נתק את החיבור
        }
        
        // שלח הודעת PING מותאמת אישית עם ה-chat_id שהשרת זוכר
        ws.send(JSON.stringify({ type: 'HEARTBEAT_PING', timestamp: Date.now(), expectedChatId: metadata ? metadata.chat_id : null }));
        console.log(`Server: PING sent to client ${userInfo}.`);
    });
}, HEARTBEAT_INTERVAL);

console.log('WebSocket server running on ws://localhost:8080');
