import React, { useState, useEffect, FC, useRef } from 'react';
import { Retool } from '@tryretool/custom-component-support';
import './ChatComponent.css';

export const ChatComponent: FC = () => {
  // משתנים המגיעים מ-Retool
  const [pageName] = Retool.useStateString({ name: 'pageName', initialValue: '', inspector: 'text' });
  const [username] = Retool.useStateString({ name: 'username', initialValue: '', inspector: 'text' });
  const [chatId] = Retool.useStateString({ name: 'chatId', initialValue: '', inspector: 'text' });
  const [previousMessages] = Retool.useStateArray({ name: 'previousMessages', initialValue: [] });

  // משתנה מצב של ריטול עבור ההודעה החדשה (chat_id, sender_name, message)
  const [newMessage, setNewMessage] = Retool.useStateObject({
    name: 'newMessage',
    initialValue: { chat_id: '', sender_name: '', message: '' },
    inspector: 'text',
    label: 'New Message',
  });

  // מצב פנימי עבור תוכן שדה ההקלדה והודעות
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<{ sender: string; text: string; timestamp: string }[]>([]);

  // התייחסות לרשימת ההודעות לצורך גלילה
  const messagesListRef = useRef<HTMLDivElement>(null);

  // הגדרת אירוע עם useEventCallback
  const onMessageSent = Retool.useEventCallback({ name: 'messageSent' });

  // פונקציה לזיהוי קישורים והמרתם ל-HTML
  const renderTextWithLinks = (text: string) => {
    // החלף שורות חדשות ב-<br> כדי לשמור על הפורמט
    const textWithBreaks = text.replace(/\n/g, '<br>');
    
    // תבנית לזיהוי קישורים (http:// או https://)
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    
    // החלף קישורים בתגי <a> לחיצים
    return textWithBreaks.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #1e90ff; text-decoration: underline;">${url}</a>`;
    });
  };

  // טעינת הודעות קודמות תוך שמירה על הודעות המשתמש
  useEffect(() => {
    if (previousMessages && previousMessages.length > 0) {
      // מפה את הנתונים הישנים לפורמט של הקומפוננטה
      const mappedMessages = previousMessages.map((msg: any) => ({
        sender: msg.created_by_name || 'מערכת',
        text: msg.comment_text.replace(/\+ CHAR\(13\) \+/g, '\n'),
        timestamp: msg.created_at,
      }));
      // שמור על הודעות המשתמש הקיימות והוסף את ההודעות הישנות
      setMessages((prev) => {
        // סנן הודעות כפילות לפי timestamp
        const existingTimestamps = new Set(prev.map((msg) => msg.timestamp));
        const newMessages = mappedMessages.filter((msg) => !existingTimestamps.has(msg.timestamp));
        return [...prev, ...newMessages];
      });
    }
  }, [previousMessages]);

  // גלילה אוטומטית להודעה האחרונה כאשר messages מתעדכן
  useEffect(() => {
    if (messagesListRef.current) {
      messagesListRef.current.scrollTo({
        top: messagesListRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  // פונקציה לשליחת הודעה חדשה
  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // יצירת הודעת המשתמש
   /* const userMessage = { sender: username || 'אני', text: trimmed, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMessage]); */
    setInputValue('');

    // יצירת אובייקט ההודעה עבור ריטול
    const messageData = {
      chat_id: chatId, // משתמשים ב-taskId כ-chat_id
      sender_name: username,
      message: trimmed,
    };

    // עדכון מצב ריטול ישירות
    setNewMessage(messageData);

    // הפעלת האירוע
    onMessageSent();
  };

  return (
    <div className="chat-container">
      <div className="messages-list" ref={messagesListRef}>
        {messages.map((msg, idx) => (
          <div key={idx} className={`bubble ${msg.sender === username ? 'user' : 'other'}`} dir="auto">
            <div className="message-header">
              <strong className="sender">{msg.sender}</strong>
            </div>
            <p
              style={{ fontSize: '12px' }}
              dangerouslySetInnerHTML={{ __html: renderTextWithLinks(msg.text) }}
            />
            <div className="timestamp">{new Date(msg.timestamp).toLocaleString('he-IL')}</div>
          </div>
        ))}
      </div>
      <div className="input-area">
        <textarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="הקלד הודעה..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button onClick={handleSend}>
          <img src="https://futureflow.co.il/send_button.png" alt="Send" />
        </button>
      </div>
    </div>
  );
};