// server.js
const WebSocket = require('ws');
const axios = require('axios');

const wss = new WebSocket.Server({ port: 8080 }); // WebSocket server

const chatRooms = new Map(); // Map<chat_id, Map<user_id, WebSocket>> - מי מחובר לאיזה צ'אט
const wsMetadata = new Map(); // Map<WebSocket, { chat_id: string, user_id: string, username: string }> - מטא-דאטה של חיבור ספציפי
const userToGlobalWsMap = new Map(); // Map<user_id, WebSocket> - מי מחובר למערכת (חיבור פיזי גלובלי)

const N8N_WEBHOOK_URL = 'https://n8n.futureflow.co.il/webhook/569f1361-16a7-4340-91a4-17d13b2b9dae';

// פונקציית עזר: מקבלת רשימת משתמשים מחוברים לצ'אט ספציפי
const getConnectedUsersInChat = (currentChatId) => {
    if (chatRooms.has(currentChatId)) {
        return Array.from(chatRooms.get(currentChatId).keys());
    }
    return [];
};

// פונקציית עזר: שליחת הודעה ל-n8n
const sendToN8nForProcessing = async (messageData) => {
    try {
        await axios.post(N8N_WEBHOOK_URL, messageData);
        console.log('Server: Message sent to n8n for processing.');
    } catch (error) {
        console.error('Server: Error sending message to n8n:', error.message);
    }
};

// **חדש:** הגדרות Heartbeat
const HEARTBEAT_INTERVAL = 30 * 1000; // 30 שניות
const HEARTBEAT_TIMEOUT = 20 * 1000; // 10 שניות (זמן המתנה לפונג)

wss.on('connection', (ws) => {
    console.log('Server: Client connected');
    ws.lastPong = Date.now(); // איפוס טיימר Heartbeat

    ws.on('message', (data) => {
        
        try {
            const message = JSON.parse(data);
             const { type, chat_id, created_by, sender_name, message: text, ticket_watchers, currentChatIdAtClient, related_to_type, related_to_name, created_by_user_type } = message;

            // **טיפול בהודעת PONG מותאמת אישית מהלקוח:**
            if (type === 'HEARTBEAT_PONG') {
                const metadata = wsMetadata.get(ws);
                const clientChatId = currentChatIdAtClient; 

                if (metadata) {
                    // **קריטי:** תנאי מורכב לניתוק ב-PONG:
                    // נתק אם:
                    // 1. הלקוח מדווח על chat_id שונה ממה שהשרת זוכר (העביר צ'אט).
                    // 2. הלקוח מדווח על NULL/UNDEFINED, אבל השרת זוכר אותו מחובר לצ'אט.
                    if (
                        (clientChatId && metadata.chat_id && clientChatId !== metadata.chat_id) || // עבר לצ'אט אחר
                        (!clientChatId && metadata.chat_id) // אינו בעמוד צ'אט, אבל השרת זוכר אותו מחובר לצ'אט
                    ) {
                        console.warn(`Server: Heartbeat - Client ${metadata.userId} (from chat ${metadata.chat_id || 'none'}) is now in chat ${clientChatId || 'none'}. Terminating old connection.`);
                        ws.terminate(); // נתק את החיבור
                        return; // סיים טיפול בהודעה זו
                    }
                    ws.lastPong = Date.now(); // עדכן את זמן הפונג האחרון
                    console.log(`Server: Heartbeat - Received PONG from client ${metadata.username || metadata.userId} (Server Chat: ${metadata.chat_id || 'none'}). Client reported Chat: ${clientChatId || 'none'}.`);
                } else {
                    // אם PONG מגיע מלקוח לא מזוהה (ללא metadata)
                    console.log('Server: Heartbeat - Received PONG from unknown client (no metadata). Terminating connection.');
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
                console.log('Server: Error - Message type is missing!');
                ws.send(JSON.stringify({ error: 'Message type is required' }));
                return;
            }

            switch (type) {
                // **חדש:** טיפול בחיבור כללי למערכת
                case 'CLIENT_CONNECTED':
                    console.log('Server: Handling CLIENT_CONNECTED (global connection).');
                    if (!created_by || !sender_name) {
                        console.error('Server: Error - created_by and sender_name are required for CLIENT_CONNECTED.');
                        ws.send(JSON.stringify({ error: 'User data required for CLIENT_CONNECTED' }));
                        return;
                    }
                    // **קריטי:** ניתוק חיבור ישן של אותו יוזר אם קיים ב-userToGlobalWsMap
                    if (userToGlobalWsMap.has(created_by)) {
                        const oldGlobalWs = userToGlobalWsMap.get(created_by);
                        if (oldGlobalWs !== ws) { // אם זה חיבור פיזי שונה
                            console.warn(`Server: CLIENT_CONNECTED - User ${created_by} is already connected globally via another socket. Terminating old global socket.`);
                            if (oldGlobalWs.readyState === WebSocket.OPEN) {
                                oldGlobalWs.close(1000, 'New global connection for same user');
                            } else if (oldGlobalWs.readyState !== WebSocket.CLOSED) {
                                oldGlobalWs.terminate();
                            }
                            // נקה רישומים קודמים של ה-oldGlobalWs
                            const oldMetadata = wsMetadata.get(oldGlobalWs);
                            if (oldMetadata && oldMetadata.chat_id && chatRooms.has(oldMetadata.chat_id)) {
                                chatRooms.get(oldMetadata.chat_id).delete(oldMetadata.userId);
                                if (chatRooms.get(oldMetadata.chat_id).size === 0) chatRooms.delete(oldMetadata.chat_id);
                                console.log(`Server: Cleaned up old chat room entry for user ${created_by} from chat ${oldMetadata.chat_id}.`);
                            }
                            wsMetadata.delete(oldGlobalWs);
                        } else {
                            console.log(`Server: CLIENT_CONNECTED - User ${created_by} is already connected via same socket. Updating metadata.`);
                        }
                    }
                    userToGlobalWsMap.set(created_by, ws); // קשר את החיבור הנוכחי ליוזר גלובלית
                    wsMetadata.set(ws, { chat_id: null, userId: created_by, username: sender_name }); // צ'אט ID הוא null כי זה חיבור כללי
                    ws.lastPong = Date.now(); // איפוס Heartbeat
                    console.log(`Server: User ${created_by} connected globally.`);
                    break;

                // **טיפול בכניסה לצ'אט ספציפי:**
                case 'JOIN_CHAT':
                    console.log('Server: Handling JOIN_CHAT (specific chat).');
                    if (!chat_id || !created_by || !sender_name) {
                        console.error('Server: Error - chat_id, created_by, sender_name are required for JOIN_CHAT.');
                        ws.send(JSON.stringify({ error: 'Required data missing for JOIN_CHAT' }));
                        return;
                    }

                    // **קריטי:** וודא שהחיבור הפיזי הזה (ws) מקושר ליוזר ב-userToGlobalWsMap
                    // אם לא, זה חיבור חדש/יתום שלא עבר CLIENT_CONNECTED.
                    if (!userToGlobalWsMap.has(created_by) || userToGlobalWsMap.get(created_by) !== ws) {
                        console.warn(`Server: JOIN_CHAT received from user ${created_by} not registered as global connection or from wrong socket. Terminating.`);
                        ws.terminate(); // נתק חיבור שאינו מזוהה או לא תואם
                        return;
                    }
                    
                    // **קריטי:** הסרה מכל חדר ישן שהיוזר מחובר אליו (כי הוא עבר חדר)
                    chatRooms.forEach((roomClients, roomChatId) => {
                        if (roomClients.has(created_by) && roomChatId !== chat_id) { // אם היוזר רשום בחדר אחר שאינו החדר הנוכחי
                            roomClients.delete(created_by);
                            if (roomClients.size === 0) chatRooms.delete(roomChatId);
                            console.log(`Server: User ${created_by} removed from old chat ${roomChatId} due to joining new chat ${chat_id}.`);
                        }
                    });

                    // הוספה לחדר החדש / עדכון רישום
                    if (!chatRooms.has(chat_id)) {
                        chatRooms.set(chat_id, new Map());
                    }

                    let userJustJoinedChat = false;
                    // **קריטי:** נבדוק אם היוזר כבר בחדר הנוכחי לפני הוספה
                    if (!chatRooms.get(chat_id).has(created_by)) { 
                        chatRooms.get(chat_id).set(created_by, ws);
                        userJustJoinedChat = true;
                        console.log(`Server: User ${created_by} joined chat ${chat_id}. Current members: ${chatRooms.get(chat_id).size}`);
                    } else {
                        console.log(`Server: User ${created_by} already in chat ${chat_id}. No action needed for chatRooms map.`);
                    }
                    
                    // **קריטי:** עדכן metadata של ה-ws הנוכחי לטיקט החדש (השרת זוכר מיקומו)
                    // זה קריטי גם אם ה-userJustJoinedChat הוא false, כי ה-metadata חייב להתעדכן לטיקט הנכון.
                    wsMetadata.set(ws, { chat_id: chat_id, userId: created_by, username: sender_name });
                    userToGlobalWsMap.set(created_by, ws); // ודא שגם המפה הגלובלית מעודכנת לחיבור הנוכחי (למקרה שהיה חיבור ישן).
                    
                    ws.lastPong = Date.now(); // איפוס Heartbeat
                    const currentUsersAfterJoin = getConnectedUsersInChat(chat_id);
                    const joinConfirmationMessage = {
                        type: 'PRESENCE_UPDATE',
                        chat_id: chat_id,
                        onlineUsers: currentUsersAfterJoin,
                        timestamp: new Date().toISOString(),
                        eventType: userJustJoinedChat ? 'user_joined' : 'current_status', // "התחבר לצ'אט"
                        affectedUserId: created_by,
                        affectedUserName: sender_name
                    };

                    chatRooms.get(chat_id).forEach((clientSocket) => {
                        if (clientSocket.readyState === WebSocket.OPEN) {
                            clientSocket.send(JSON.stringify(joinConfirmationMessage));
                        }
                    });
                    
                    console.log(`Server: User ${created_by} current chat updated to ${chat_id}.`);
                    break;

                // **טיפול בשליחת הודעת צ'אט:**
                case 'CHAT_MESSAGE':
                    console.log('Server: Handling CHAT_MESSAGE.');
                    if (!chat_id || !sender_name || !text || !created_by || !ticket_watchers) {
                        console.error('Server: Error - Missing data for CHAT_MESSAGE, or no watchers!', { chat_id, sender_name, text, created_by, ticket_watchers: ticket_watchers ? ticket_watchers.length : 'none' });
                        ws.send(JSON.stringify({ error: 'Required data missing for CHAT_MESSAGE' }));
                        return;
                    }

                    // ודא שהשולח רשום בחדר (או ב-userToGlobalWsMap)
                    if (!chatRooms.has(chat_id) || !chatRooms.get(chat_id).has(created_by)) {
                        console.warn(`Server: CHAT_MESSAGE from user ${created_by} not registered in chat ${chat_id}. Attempting implicit join.`);
                        // אם לא רשום בחדר, ננסה לרשום אותו (למרות שכבר אמור להיות ב-JOIN_CHAT)
                        if (!chatRooms.has(chat_id)) chatRooms.set(chat_id, new Map());
                        chatRooms.get(chat_id).set(created_by, ws);
                        wsMetadata.set(ws, { chat_id: chat_id, userId: created_by, username: sender_name });
                        userToGlobalWsMap.set(created_by, ws); // וודא שגם המפה הגלובלית מעודכנת
                    }
                    ws.lastPong = Date.now(); // איפוס Heartbeat

                    const currentOnlineUsers = getConnectedUsersInChat(chat_id);

                    // **סינון חכם והפצת התראות:**
                    let offline_watchers_for_whatsapp = []; // קבוצה 3
                    let online_watchers_for_global_notification = []; // קבוצה 2

                    if (Array.isArray(ticket_watchers)) { // ודא ש-ticket_watchers הוא מערך
                        ticket_watchers.forEach(watcher => {
                            if (watcher.user_id === created_by) { // לא לשלוח לשולח ההודעה עצמו
                                return;
                            }
                            if (chatRooms.has(chat_id) && chatRooms.get(chat_id).has(watcher.user_id)) { // מחובר לצ'אט ספציפי (קבוצה 1)
                                // לא עושים כלום, רואה על המסך
                            } else if (userToGlobalWsMap.has(watcher.user_id)) { // מחובר למערכת אבל לא לצ'אט (קבוצה 2)
                                online_watchers_for_global_notification.push(watcher.user_id);
                            } else { // לא מחובר כלל (קבוצה 3)
                                offline_watchers_for_whatsapp.push(watcher); // נשלח את כל אובייקט הוואצ'ר
                            }
                        });
                    } else {
                        console.warn('Server: ticket_watchers is not an array for CHAT_MESSAGE.');
                    }


                    // **שליחה ל-n8n (רק אם יש מישהו לא מחובר):**
                    if (offline_watchers_for_whatsapp.length > 0) {
                        sendToN8nForProcessing({
                            comment_text: text,
                            created_by_name: sender_name,
                            created_by: created_by,
                            created_at: new Date().toISOString(),
                            related_to_id: chat_id,
                            offline_watchers: offline_watchers_for_whatsapp
                        });
                    }

                    // **שליחה ל-Frontend (Global Notification) למחוברים למערכת:**
                    const globalNotificationMessage = {
                        type: 'GLOBAL_NOTIFICATION',
                        chat_id: chat_id,
                        sender_name: sender_name,
                        message: text,
                        timestamp: new Date().toISOString(),
                        related_to_type: related_to_type,
                        related_to_name: related_to_name
                    };
                    online_watchers_for_global_notification.forEach(user_id => {
                        const clientWs = userToGlobalWsMap.get(user_id);
                        if (clientWs && clientWs.readyState === WebSocket.OPEN) {
                            clientWs.send(JSON.stringify(globalNotificationMessage));
                            console.log(`Server: Sent GLOBAL_NOTIFICATION to user ${user_id} (not in chat).`);
                        }
                    });


                    // **שידור ההודעה לכל המחוברים לצ'אט:**
                    const broadcastMessage = {
                        type: 'CHAT_MESSAGE',
                        chat_id: chat_id,
                        sender: sender_name,
                        text,
                        timestamp: new Date().toISOString(),
                        created_by: created_by,
                        onlineUsers: currentOnlineUsers,
                        related_to_type: related_to_type,
                        related_to_name: related_to_name,
                        created_by_user_type: created_by_user_type
                    };

                    chatRooms.get(chat_id).forEach((client) => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify(broadcastMessage));
                        }
                    });
                    console.log(`Server: Message from ${sender_name} in ${chat_id} broadcasted.`);
                    break;

                // **טיפול בעזיבת צ'אט ספציפי:**
                case 'LEAVE_CHAT':
                    console.log('Server: Handling LEAVE_CHAT request.');
                    if (!chat_id || !created_by) {
                        console.error('Server: Error - chat_id and created_by are required for LEAVE_CHAT.');
                        ws.send(JSON.stringify({ error: 'chat_id and created_by required for LEAVE_CHAT' }));
                        return;
                    }

                    const leavingUserMetadata = wsMetadata.get(ws);
                    // **קריטי:** וודא שהבקשה מגיעה מהחיבור הנכון ושהמשתמש רשום בחדר
                    if (!leavingUserMetadata || leavingUserMetadata.userId !== created_by) {
                        console.warn(`Server: LEAVE_CHAT request from non-matching user/socket. Ignoring. Request from ${created_by}, actual socket user ${leavingUserMetadata ? leavingUserMetadata.userId : 'unknown'}.`);
                        ws.send(JSON.stringify({ error: 'LEAVE_CHAT request ignored: user/socket mismatch' }));
                        return;
                    }
                    
                    // **קריטי:** בצע ניקוי מ-chatRooms רק אם היוזר נמצא שם (השרת עשוי כבר לנקות)
                    if (chatRooms.has(chat_id) && chatRooms.get(chat_id).has(created_by)) {
                        chatRooms.get(chat_id).delete(created_by);
                        console.log(`Server: User ${created_by} explicitly left chat ${chat_id}. Remaining members: ${chatRooms.get(chat_id).size}.`);

                        const currentUsersAfterLeave = getConnectedUsersInChat(chat_id);
                        const leaveNotificationMessage = {
                            type: 'PRESENCE_UPDATE',
                            chat_id: chat_id,
                            onlineUsers: currentUsersAfterLeave,
                            timestamp: new Date().toISOString(),
                            eventType: 'user_left',
                            affectedUserId: created_by,
                            affectedUserName: sender_name
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
                        console.warn(`Server: LEAVE_CHAT request for user ${created_by} from chat ${chat_id}, but user not found in chatRooms (might be already left/not in this chat).`);
                    }
                    // **קריטי:** עדכן את ה-chat_id במטאדאטה של החיבור ל-null, כי הוא עזב את הצ'אט
                    // זה קריטי כדי שה-Heartbeat ו-JOIN_CHAT חדש ידעו שהוא כבר לא בטיקט זה.
                    leavingUserMetadata.chat_id = null;
                    console.log(`Server: Updated socket metadata for user ${created_by} to chat_id: null.`);
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

    ws.on('close', (code, reason) => {
        console.log(`Server: Client disconnected with code ${code} and reason: ${reason}`);
        const closedSocketMetadata = wsMetadata.get(ws);
        wsMetadata.delete(ws); 

        // **קריטי:** הסר את היוזר מ-userToGlobalWsMap
        if (closedSocketMetadata && userToGlobalWsMap.get(closedSocketMetadata.userId) === ws) {
            userToGlobalWsMap.delete(closedSocketMetadata.userId);
            console.log(`Server: User ${closedSocketMetadata.userId} removed from userToGlobalWsMap on close.`);
        }

        // **קריטי:** נקה את הלקוח מ-chatRooms אם הוא היה רשום שם
        if (closedSocketMetadata && closedSocketMetadata.chat_id && chatRooms.has(closedSocketMetadata.chat_id)) {
            const { chat_id, userId, username } = closedSocketMetadata;
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
            console.log(`Server: User ${userId} left chat ${chat_id}. Remaining members: ${chatRooms.has(chat_id) ? chatRooms.get(chat_id).size : 0}`);
        } else {
            console.log('Server: Client disconnected, no associated chat/metadata found for cleanup.');
        }
    });

    ws.on('error', (error) => {
        console.error('Server: WebSocket error:', error);
    });
});

// **חדש:** טיימר Heartbeat מותאם אישית בצד השרת
setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState !== WebSocket.OPEN) {
            return;
        }
        const metadata = wsMetadata.get(ws);
        const userInfo = metadata ? ` (User: ${metadata.username || metadata.userId}, Chat: ${metadata.chat_id || 'None'})` : '';

        // **קריטי:** אם עבר יותר מדי זמן מאז הפונג האחרון, נתק את החיבור
        if (Date.now() - ws.lastPong > HEARTBEAT_TIMEOUT) {
            console.log(`Server: Heartbeat - Client ${userInfo} did not respond to PONG within timeout, terminating connection.`);
            return ws.terminate(); // נתק את החיבור
        }
        
        // שלח הודעת PING מותאמת אישית עם ה-chat_id שהשרת זוכר
        ws.send(JSON.stringify({ type: 'HEARTBEAT_PING', timestamp: Date.now(), expectedChatId: metadata ? metadata.chat_id : null }));
        console.log(`Server: Heartbeat - PING sent to client ${userInfo}.`);
    });
}, HEARTBEAT_INTERVAL);

console.log('WebSocket server running on ws://localhost:8080');
