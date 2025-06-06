import React, { useState, useEffect, FC, useRef } from 'react';
import { Retool } from '@tryretool/custom-component-support';
import './ChatComponent.css';

export const ChatComponent: FC = () => {
  // Retool state variables
  const [pageName] = Retool.useStateString({ name: 'pageName', initialValue: '', inspector: 'text' });
  const [username] = Retool.useStateString({ name: 'username', initialValue: '', inspector: 'text' });
  const [userId] = Retool.useStateString({ name: 'userId', initialValue: '', inspector: 'text' });
  const [chatId] = Retool.useStateString({ name: 'chatId', initialValue: '', inspector: 'text' });
  const [previousMessages] = Retool.useStateArray({ name: 'previousMessages', initialValue: [] });

  // Retool state for new message
  const [newMessage, setNewMessage] = Retool.useStateObject({
    name: 'newMessage',
    initialValue: { chat_id: '', sender_name: '', message: '', created_by: '' },
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

  // Function to render text with links
  const renderTextWithLinks = (text: string) => {
    const textWithBreaks = text.replace(/\n/g, '<br>');
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    return textWithBreaks.replace(urlPattern, (url) => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color: #1e90ff; text-decoration: underline;">${url}</a>`;
    });
  };

  // Function to format date labels (today, yesterday, or full date)
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
    // Filter out messages with invalid timestamps
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

    // Sort messages by timestamp
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

  // Load previous messages
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
        return [...prev, ...newMessages];
      });
    }
  }, [previousMessages, username, userId]);

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

    const messageData = {
      chat_id: chatId,
      sender_name: username,
      message: trimmed,
      created_by: userId,
    };

    setNewMessage(messageData);
    onMessageSent();
    setInputValue('');
  };

  // Group messages by date
  const messageGroups = groupMessagesByDate(messages);

  return (
    <div className="chat-container">
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
