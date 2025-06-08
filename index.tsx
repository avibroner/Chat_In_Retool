import React, { useState, useEffect, FC, useRef } from 'react';
import { Retool } from '@tryretool/custom-component-support';
import './ChatComponent.css';

export const ChatComponent: FC = () => {
  // Retool state variables
  const [username] = Retool.useStateString({ name: 'username', initialValue: '', inspector: 'text' });
  const [userId] = Retool.useStateString({ name: 'userId', initialValue: '', inspector: 'text' });
  const [chatId] = Retool.useStateString({ name: 'chatId', initialValue: '', inspector: 'text' });
  const [relatedToType] = Retool.useStateString({ name: 'relatedToType', initialValue: '', inspector: 'text' });
  const [relatedToName] = Retool.useStateString({ name: 'relatedToName', initialValue: '', inspector: 'text' });
  const [createdByUsertype] = Retool.useStateString({ name: 'createdByUsertype', initialValue: '', inspector: 'text' });
  const [previousMessages, setPreviousMessages] = Retool.useStateArray({ name: 'previousMessages', initialValue: [] });
  const [ticketWatchers] = Retool.useStateArray({ name: 'ticketWatchers', initialValue: [], label: 'ticket watchers' });
  const [onlineUsersList, setOnlineUsersList] = useState<string[]>([]);
  const [statusNotifications, setStatusNotifications] = useState<{ id: string; message: string; type: 'info' | 'warning' }[]>([]);

  // Retool state for new message
  const [newMessage, setNewMessage] = Retool.useStateObject({
    name: 'newMessage',
    initialValue: { chat_id: '', sender_name: '', message: '', userId: '' , type: 'CHAT_MESSAGE', ticket_watchers: [] },
    inspector: 'text',
    label: 'New Message',
  });

  // Internal state for input and messages
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<{ sender: string; text: string; timestamp: string; created_by: string }[]>([]);

  // Reference for scrolling to the bottom
  const messagesListRef = useRef<HTMLDivElement>(null);

  // Event callback for message sent
  const onMessageSent = Retool.useEventCallback({ name: 'messageSent' });
   // **חדש:** Event Callback להודעות Presence (שנקרא מתוך connectWebSocket Query)
   // const onPresenceUpdate = Retool.useEventCallback({ name: 'onPresenceUpdate' }); לא בשימוש כי אני לא רוצה התראה בתוך המערכת למשתמש שהתחבר

  // Function to render text with links (ללא שינוי)
  const renderTextWithLinks = (text: string) => {
    const textWithBreaks = text.replace(/\n/g, '<br>');
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return textWithBreaks.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #1e90ff; text-decoration: underline;">${url}</a>`;
    });
  };

  // Function to format date labels
  const formatDateLabel = (date: Date): string => {
    if (!date || isNaN(date.getTime())) return 'לא ידוע';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (messageDate.getTime() === today.getTime()) {
      return 'היום';
    } else if (messageDate.getTime() === yesterday.getTime()) {
      return 'אתמול';
    } else {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear().toString().slice(-2);
      return `${day}/${month}/${year}`;
    }
  };

  // Function to group messages by date
  const groupMessagesByDate = (messages: { sender: string; text: string; timestamp: string; created_by: string }[]) => {
    const validMessages = messages.filter((msg) => {
      try {
        const date = new Date(msg.timestamp);
        if (isNaN(date.getTime())) {
          console.warn('Filtered out message with invalid timestamp:', msg);
          return false;
        }
        return true;
      } catch (e) {
        console.warn('Error parsing timestamp for message:', msg, 'Error:', e);
        return false;
      }
    });

    const sortedMessages = [...validMessages].sort((a, b) => {
      const dateA = new Date(a.timestamp);
      const dateB = new Date(b.timestamp);
      return dateA.getTime() - dateB.getTime();
    });

    const groups: { date: string; messages: { sender: string; text: string; timestamp: string; created_by: string; parsedDate: { timeDisplay: string } }[] }[] = [];
    let currentDate: string | null = null;
    let currentGroup: { date: string; messages: { sender: string; text: string; timestamp: string; created_by: string; parsedDate: { timeDisplay: string } }[] } | null = null;

    for (const msg of sortedMessages) {
      let messageDate: Date;
      try {
        messageDate = new Date(msg.timestamp);
        if (isNaN(messageDate.getTime())) {
          console.warn('Invalid date for message:', msg);
          messageDate = new Date();
        }
      } catch (e) {
        console.warn('Error parsing date:', e, 'Message:', msg);
        messageDate = new Date();
      }

      const formattedDate = formatDateLabel(messageDate);

      const parsedDate = {
        timeDisplay: `${messageDate.getHours().toString().padStart(2, '0')}:${messageDate.getMinutes().toString().padStart(2, '0')}`,
      };

      if (currentDate !== formattedDate) {
        currentDate = formattedDate;
        currentGroup = {
          date: formattedDate,
          messages: [],
        };
        groups.push(currentGroup);
      }

      currentGroup!.messages.push({
        ...msg,
        parsedDate,
      });
    }

    return groups;
  };

  // Load previous messages from Retool's previousMessages state 
  useEffect(() => {
    if (previousMessages && previousMessages.length > 0) {
      const mappedMessages = previousMessages.map((msg: any) => {
        const timestamp = msg.created_at && !isNaN(new Date(msg.created_at).getTime()) ? msg.created_at : new Date().toISOString();
        return {
          sender: msg.created_by_name || 'מערכת',
          text: msg.comment_text ? msg.comment_text.replace(/\+ CHAR\(13\) \+/g, '\n') : '',
          timestamp,
          created_by: msg.created_by || (String(msg.created_by_name) === String(username) ? String(userId) : 'system'),
        };
      });
      setMessages((prev) => {
        const existingTimestamps = new Set(prev.map((msg) => msg.timestamp));
        const newMessages = mappedMessages.filter((msg) => !existingTimestamps.has(msg.timestamp));
        return [...prev, ...newMessages].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      });
    }
  }, [previousMessages, username, userId]);
/*
   // **חדש: פונקציה לטיפול בהודעות WebSocket, נגישה גלובלית**
  // זו הפונקציה ש-connectWebSocket Query יקרא לה
  const handleWebSocketMessageInComponent = React.useCallback((newMsg: any) => {
    try {
      console.log('Parsed WebSocket message in component (via global handler):', newMsg);

      switch (newMsg.type) {
        case 'CHAT_MESSAGE':
          if (newMsg.sender && newMsg.text && newMsg.timestamp) {
            const messageToAdd = {
              sender: newMsg.sender,
              text: newMsg.text,
              timestamp: newMsg.timestamp,
              created_by: newMsg.created_by || 'system',
            };
            setMessages((prev) => {
              const existingTimestamps = new Set(prev.map((msg) => msg.timestamp));
              if (!existingTimestamps.has(messageToAdd.timestamp)) {
                return [...prev, messageToAdd].sort((a,b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
              }
              return prev;
            });
          }
          if (newMsg.onlineUsers && Array.isArray(newMsg.onlineUsers)) {
            setOnlineUsersList(newMsg.onlineUsers);
          }
          break;

        case 'PRESENCE_UPDATE':
          if (newMsg.onlineUsers && Array.isArray(newMsg.onlineUsers)) {
            setOnlineUsersList(newMsg.onlineUsers);
            console.log('Online users updated:', newMsg.onlineUsers);
          }
          if (newMsg.eventType === 'user_joined' && newMsg.affectedUserId !== userId) {
            setStatusNotifications((prev) => [
              ...prev,
              {
                id: `join-${Date.now()}`,
                message: `${newMsg.affectedUserName || 'משתמש לא ידוע'} הצטרף/ה לשיחה!`,
                type: 'info'
              },
            ]);
            setTimeout(() => {
              setStatusNotifications((prev) => prev.filter(n => n.id !== `join-${newMsg.affectedUserId}`));
            }, 5000);
          } else if (newMsg.eventType === 'user_left' && newMsg.affectedUserId !== userId) {
            setStatusNotifications((prev) => [
              ...prev,
              {
                id: `leave-${Date.now()}`,
                message: `${newMsg.affectedUserName || 'משתמש לא ידוע'} יצא/ה מהשיחה.`,
                type: 'warning'
              },
            ]);
            setTimeout(() => {
              setStatusNotifications((prev) => prev.filter(n => n.id !== `leave-${newMsg.affectedUserId}`));
            }, 5000);
          }
          break;

        default:
          console.warn('Unknown WebSocket message type:', newMsg.type, newMsg);
          break;
      }
    } catch (error) {
      console.error('Error processing WebSocket message in component (global handler):', error);
    }
  }, [setMessages, setOnlineUsersList, userId, setStatusNotifications]); // הוספתי setStatusNotifications לתלויות

  // **חדש: הגדרת הפונקציה הגלובלית ב-window**
  useEffect(() => {
      (window as any).handleWebSocketMessageInComponent = handleWebSocketMessageInComponent;

      // ניקוי: הסר את הפונקציה הגלובלית כשהקומפוננטה נעלמת
      return () => {
          if ((window as any).handleWebSocketMessageInComponent === handleWebSocketMessageInComponent) {
              delete (window as any).handleWebSocketMessageInComponent;
          }
      };
  }, [handleWebSocketMessageInComponent]); // תלויות: handleWebSocketMessageInComponent
*/
/*
    // **חדש (קריטי לסגירה נקייה):** ניקוי חיבור WebSocket כאשר הקומפוננטה נעלמת
    // (בדרך כלל כשעוברים עמוד ב-Retool או סוגרים את ה-Modal)
    useEffect(() => {
        // שומר את ה-chatId הקודם כדי שנדע מאיזה צ'אט עזבנו
        let previousChatId = chatId.value; 
            return () => {
            const currentSocket = (window as any).myGlobalWebSocket;
            if (currentSocket && currentSocket.readyState === WebSocket.OPEN && previousChatId && userId.value) {
                console.log(`ChatComponent: Sending LEAVE_CHAT for chat ${previousChatId} on unmount/chat change.`);
                try {
                    currentSocket.send(JSON.stringify({
                        type: 'LEAVE_CHAT', // סוג הודעה חדש
                        chat_id: previousChatId,
                        created_by: userId.value,
                        sender_name: username.value, // כדי שלשרת יהיה מידע לוגינג
                        timestamp: new Date().toISOString()
                    }));
                } catch (e) {
                    console.error('ChatComponent: Error sending LEAVE_CHAT message on unmount:', e);
                }
            } else {
                console.log('ChatComponent: No active socket or missing data to send LEAVE_CHAT on unmount.');
            }

            // לוגיקת סגירת חיבור WebSocket קיימת
            if (currentSocket) {
                console.log(`ChatComponent: Unmounting, found WebSocket connection in state ${currentSocket.readyState}. Attempting to close.`);
                if (currentSocket.readyState === WebSocket.OPEN || currentSocket.readyState === WebSocket.CONNECTING) {
                    currentSocket.close(1001, 'Component Unmount/Page Change');
                } else if (currentSocket.readyState !== WebSocket.CLOSED) {
                    currentSocket.terminate();
                }
                (window as any).myGlobalWebSocket = null;
                console.log('ChatComponent: Global WebSocket reference cleared on unmount.');
            } else {
                console.log('ChatComponent: Unmounting, no active WebSocket found.');
            }
        };
    }, []); // מערך תלויות ריק מבטיח שזה ירוץ רק ב-mount וב-unmount
*/
    
  // Scroll to the bottom when messages update 
  useEffect(() => {
    if (messagesListRef.current) {
      messagesListRef.current.scrollTo({
        top: messagesListRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);

  // Handle sending a new message 
  const handleSend = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    // **קריטי:** וודא שכל הנתונים זמינים לפני שליחה
        if (!chatId || !username || !userId) {
            console.error('ChatComponent: Missing essential data for sending message. Aborting.');
            utils.showNotification({ title: 'שגיאת שליחה', description: 'חסרים נתונים חשובים בהודעה.', variant: 'error' });
            return;
        }

    const messageData = {
      chat_id: chatId,
      sender_name: username,
      message: trimmed,
      created_by: userId,
      ticket_watchers: ticketWatchers, 
      type: "CHAT_MESSAGE",
      related_to_type: relatedToType,
      related_to_name: relatedToName,
      created_by_user_type: createdByUsertype
    };
    
    console.log('Component: Sending message data:', messageData); 
    console.log('Component: userId value before send:', userId); 
    console.log('Component: ticketWatchers value before send:', ticketWatchers); 


    setNewMessage(messageData);
    onMessageSent({ additionalScope: { messageData: messageData } });; // זה יפעיל את sendMessageToWebSocket ב-Retool Query
    setInputValue('');
  };

  // Group messages by date 
  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="chat-container">

        {/* **חדש:** אזור להצגת הודעות סטטוס (מחוץ לצ'אט) */}
        <div style={{ position: 'absolute', top: 0, width: '100%', zIndex: 100 }}>
            {statusNotifications.map((notification) => (
                <div
                    key={notification.id}
                    style={{
                        padding: '10px',
                        margin: '5px auto',
                        width: 'fit-content',
                        backgroundColor: notification.type === 'info' ? '#d4edda' : '#fff3cd', // ירוק/צהוב
                        color: notification.type === 'info' ? '#155724' : '#856404',
                        borderRadius: '5px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        textAlign: 'center',
                        fontSize: '14px'
                    }}
                >
                    {notification.message}
                </div>
            ))}
        </div>
        
      {/* אופציונלי: הצג את רשימת המשתמשים המחוברים */}
      {onlineUsersList && onlineUsersList.length > 0 && (
        <div style={{ padding: '5px', background: '#e1f2f7', borderBottom: '1px solid #ddd', textAlign: 'center' }}>
          מחוברים: {onlineUsersList.join(', ')}
        </div>
      )}
      <div className="messages-list" ref={messagesListRef}>
        {messageGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="messages-group">
            <div className="date-label">
              <span
                style={{
                  backgroundColor: '#E1F2F7',
                  padding: '5px 10px',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: '#677680',
                  fontFamily: 'Heebo, sans-serif',
                  fontWeight: 'normal',
                  boxShadow: '0 1px 0.5px rgba(0,0,0,0.1)',
                }}
              >
                {group.date}
              </span>
            </div>
            {group.messages.map((msg, msgIdx) => (
              <div
                key={`${groupIdx}-${msgIdx}`}
                className={`bubble ${String(msg.created_by) === String(userId) ? 'user' : 'other'}`}
                dir="auto"
              >
                <div className="message-header">
                  <strong className="sender">{msg.sender}</strong>
                </div>
                <p
                  style={{ fontSize: '12px' }}
                  dangerouslySetInnerHTML={{ __html: renderTextWithLinks(msg.text) }}
                />
                <div className="timestamp">{msg.parsedDate.timeDisplay}</div>
              </div>
            ))}
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
          <img src="https://futureflow.co.il/images/send_button.png" alt="Send" />
        </button>
      </div>
    </div>
  );
};
