// server.js
const WebSocket = require('ws');

// צור שרת WebSocket על פורט 8080
const wss = new WebSocket.Server({ port: 8080 });

// מאגר לחיבורים לפי chat_id
const clientsByChatId = new Map();

wss.on('connection', (ws) => {
  console.log('Client connected');

  // טפל בהודעות נכנסות
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      const { chat_id, sender_name, message: text } = message;

      // ודא ש-chat_id קיים
      if (!chat_id) {
        ws.send(JSON.stringify({ error: 'chat_id is required' }));
        return;
      }

      // הוסף את הלקוח למאגר עבור chat_id
      if (!clientsByChatId.has(chat_id)) {
        clientsByChatId.set(chat_id, new Set());
      }
      clientsByChatId.get(chat_id).add(ws);

      // שדר את ההודעה לכל הלקוחות עם אותו chat_id
      const broadcastMessage = {
        sender: sender_name,
        text,
        timestamp: new Date().toISOString(),
      };
      clientsByChatId.get(chat_id).forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify(broadcastMessage));
        }
      });
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  // טפל בניתוק לקוח
  ws.on('close', () => {
    console.log('Client disconnected');
    // הסר את הלקוח מכל ה-chat_id-ים
    clientsByChatId.forEach((clients, chat_id) => {
      clients.delete(ws);
      if (clients.size === 0) {
        clientsByChatId.delete(chat_id);
      }
    });
  });
});

console.log('WebSocket server running on ws://localhost:8080');