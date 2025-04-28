מדריך מלא: יצירת קומפוננטת צ'אט מותאמת אישית ב-Retool (2025)
במדריך זה תלמדו כיצד ליצור קומפוננטת צ'אט בסגנון וואטסאפ בתוך Retool, שתומכת בעברית (כיוון ימין-לשמאל), משתמשת בנתוני Retool כמו שם הדף ושם המשתמש לתיוג הודעות, ומאפשרת תקשורת בזמן אמת בין משתמשים. המדריך מבוסס על ניסיון ממשי, תיעוד רשמי של Retool, ומקורות כמו ZeroCodez. הוא כתוב בצורה פשוטה וברורה, כך שגם מי שחדש בתחום יוכל לעקוב.

הקדמה: מה נבנה ולמה?
נבנה קומפוננטת צ'אט מותאמת אישית שתשולב באפליקציית Retool ותאפשר למשתמשים לשלוח ולקבל הודעות בזמן אמת. הקומפוננטה תתמוך בעברית, תציג קישורים כלחיצים, תבצע גלישת טקסט אוטומטית בתוך בועות ההודעות, ותשתמש ב-WebSocket לתקשורת בזמן אמת. נשתמש ב-Custom Component Libraries של Retool (המנגנון המודרני של 2025), שמאפשר לגרור את הקומפוננטה לאפליקציה, לעדכן אותה עם נתונים מ-Retool, ולשלוח ממנה אירועים.

הקומפוננטה תכלול:

תיוג הודעות עם שם המשתמש ושם הדף הנוכחי.
ממשק לשליחת הודעות עם שדה קלט וכפתור "שלח".
תמיכה בעברית (RTL) מבחינת יישור בועות וכיווניות טקסט.
תקשורת בזמן אמת באמצעות WebSocket.
חלק 1: בניית קומפוננטת הצ'אט ב-VS Code עבור Retool
שלב 1: הקמת סביבת פיתוח לקומפוננטה מותאמת אישית
התקן את הכלים הדרושים:
VS Code: הורד והתקן את Visual Studio Code מהאתר הרשמי: https://code.visualstudio.com/.
Node.js: ודא ש-Node.js מותקן (גרסה 16 ומעלה מומלצת). הורד אותו מ-https://nodejs.org/ אם הוא לא מותקן. בדוק את ההתקנה בטרמינל:
פתח טרמינל (ב-Windows: לחץ על Win + R, הקלד cmd, והקש Enter; ב-Mac: פתח את Terminal).
הקלד:
text

Copy
node -v
npm -v
אתה אמור לראות את הגרסאות (למשל, v18.16.0 ו-9.5.0). אם לא, התקן מחדש.
שכפל את תבנית Retool לקומפוננטות מותאמות:
פתח טרמינל (ב-VS Code או מחוצה לו).
שכפל את התבנית הרשמית של Retool לקומפוננטות מותאמות אישית עם הפקודה:
text

Copy
git clone https://github.com/tryretool/custom-component-collection-template.git retool-chat-component
לאחר השכפול, היכנס לתיקייה שנוצרה:
text

Copy
cd retool-chat-component
התקן את התלות של הפרויקט:
בטרמינל, בתוך התיקייה retool-chat-component, הרץ:
text

Copy
npm install
זה יתקין את כל החבילות הדרושות כמו React וספריית התמיכה של Retool לקומפוננטות.
התחבר לחשבון Retool דרך ה-CLI:
כדי לחבר את הפרויקט לחשבון Retool שלך, תצטרך API Token עם הרשאות "קריאה וכתיבה" ל-Custom Components.
ב-Retool:
עבור ל-Settings > API Tokens.
צור טוקן חדש עם הרשאות "Custom Components (Read & Write)".
שמור את הטוקן במקום בטוח.
בטרמינל, בתוך התיקייה retool-chat-component, הרץ:
text

Copy
npx retool-ccl login
הכלי יבקש ממך להזין את ה-API Token. הדבק את הטוקן ולחץ Enter.
לאחר ההתחברות, הפרויקט שלך יהיה מחובר לחשבון Retool שלך.
צור ספריית קומפוננטות חדשה:
הרץ את הפקודה הבאה בטרמינל:
text

Copy
npx retool-ccl init
הכלי ישאל אותך כמה שאלות:
תן שם לספריית הקומפוננטות, למשל: ChatComponent.
תן תיאור אופציונלי (אפשר ללחוץ Enter ולדלג).
הפקודה תעדכן את קובץ package.json ותגדיר את הספרייה בחשבון Retool שלך.
פתח את הפרויקט ב-VS Code:
ב-VS Code, לחץ על File > Open Folder ופתח את התיקייה retool-chat-component.
בתיקייה src, תראה קומפוננטת דוגמה בשם HelloWorld. נחליף אותה בקומפוננטת הצ'אט שלנו.
הפעל מצב פיתוח (Dev Mode):
בטרמינל, בתוך התיקייה retool-chat-component, הרץ:
text

Copy
npx retool-ccl dev
זה יפעיל מצב פיתוח שמסנכרן שינויים בקוד עם Retool בזמן אמת (Hot-Reload). כל שינוי שתשמור בקוד יתעדכן מיידית ב-Retool.
שלב 2: יצירת קומפוננטת הצ'אט ב-VS Code
צור קובץ לקומפוננטה:
בתיקיית הפרויקט (retool-chat-component), בתוך התיקייה src, צור קובץ חדש בשם ChatComponent.tsx.
כתוב את קוד הקומפוננטה:
כבר יש לך את הקוד של ChatComponent.tsx במערכת שלך, אבל לצורך ההדרכה, ודא שהקובץ כולל את הפונקציונליות הבאה:
הצגת הודעות עם שם השולח, טקסט, וזמן.
תמיכה בקישורים לחיצים (טקסט כחול עם קו תחתון).
גלישת טקסט אוטומטית בתוך בועות ההודעות.
תמיכה בעברית (כיווניות RTL).
שדה קלט וכפתור שליחה לשליחת הודעות.
צור קובץ CSS עבור הקומפוננטה:
בתיקיית src, צור קובץ חדש בשם ChatComponent.css.
ודא שהקובץ כולל את העיצוב הבא:
הגדרת רוחב מקסימלי לבועות (max-width: 80%).
גלישת טקסט אוטומטית עם overflow-wrap: break-word ו-word-break: break-word.
גופן Heebo, גודל 12px לטקסט, וזמן מתחת להודעה.
עדכן את index.tsx לייצוא הקומפוננטה:
בתיקיית src, פתח את הקובץ index.tsx.
ודא שהקובץ מייצא את ChatComponent במקום HelloWorld. הקוד צריך להיראות כך:
javascript

Copy
export { ChatComponent } from './ChatComponent';
שמור את השינויים.
שלב 3: שילוב הקומפוננטה ב-Retool
הוסף את הקומפוננטה לאפליקציה ב-Retool:
פתח את Retool בדפדפן והיכנס לחשבון שלך.
צור אפליקציה חדשה או פתח אפליקציה קיימת.
עבור ל-App Settings > Custom Components וודא שהספרייה שלך (למשל, ChatComponent) מופיעה ברשימה.
בסרגל הכלים בצד שמאל, חפש את הקומפוננטה שלך תחת שם הספרייה (למשל, ChatComponent).
גרור את הקומפוננטה אל הקנבס של האפליקציה.
שנה את שם הקומפוננטה ל-customComponent2 בחלונית ה-Inspector בצד ימין.
הגדר את המודל של הקומפוננטה:
בלשונית Model של הקומפוננטה (customComponent2):
הגדר את previousMessages לקבל את ההודעות ממשתנה חיצוני:
text

Copy
{{jsonEditor1.value}}
הגדר את username לקבל את שם המשתמש הנוכחי:
text

Copy
{{current_user.username}}
הגדר את chatId לערך שמייצג את מזהה הצ'אט (למשל, {{taskId}} או ערך קבוע כמו "chat123").
הוסף ווידג'ט jsonEditor לאפליקציה:
גרור ווידג'ט מסוג JSON Editor מסרגל הכלים אל הקנבס.
שנה את שמו ל-jsonEditor1 בחלונית ה-Inspector.
הגדר את הערך ההתחלתי של jsonEditor1.value למערך ריק:
text

Copy
[]
ודא ש-jsonEditor1.value הוא מערך שמחזיק את ההודעות.
שלב 4: הגדרת הקוואריז ב-Retool לתקשורת בזמן אמת
צור קווארי connectWebSocket:
עבור ללשונית Queries ב-Retool ולחץ על + New.
בחר JavaScript כסוג הקווארי.
תן לקווארי שם: connectWebSocket.
הקווארי הזה מתחבר לשרת WebSocket, שולח את chat_id בעת החיבור, ומעדכן את jsonEditor1.value עם הודעות חדשות ממשתמשים אחרים. ודא שהקוד כולל:
חיבור ל-WebSocket בכתובת ws://localhost:8080.
שליחת chat_id בעת החיבור.
קבלת הודעות והוספתן ל-jsonEditor1.value אם הן לא מהמשתמש הנוכחי.
בלשונית Query Settings, סמן Run this query on page load כדי שהקווארי ירוץ אוטומטית כשהאפליקציה נטענת.
צור קווארי sendMessageToWebSocket:
לחץ על + New בלשונית Queries ובחר JavaScript כסוג הקווארי.
תן לקווארי שם: sendMessageToWebSocket.
הקווארי הזה שולח את ההודעה לשרת WebSocket כאשר המשתמש לוחץ על כפתור השליחה. ודא שהקוד כולל:
חיבור ל-WebSocket בכתובת ws://localhost:8080.
שליחת הודעה עם chat_id, sender_name, ו-message.
בלשונית Interactions של הקומפוננטה customComponent2, הוסף handler לאירוע messageSent:
בחר Run Query והפנה ל-sendMessageToWebSocket.
צור קווארי insertChatMessage:
לחץ על + New בלשונית Queries ובחר את סוג הקווארי המתאים למסד הנתונים שלך (למשל, BigQuery).
תן לקווארי שם: insertChatMessage.
הקווארי הזה שומר את ההודעה במסד הנתונים. ודא שהשאילתה כוללת:
שמירת related_to_id (מבוסס על chatId), comment_text, created_by_name, ו-created_at.
בלשונית Interactions של הקומפוננטה customComponent2, הוסף handler נוסף לאירוע messageSent (מתחת ל-sendMessageToWebSocket):
בחר Run Query והפנה ל-insertChatMessage.
צור קווארי לשליפת הודעות ישנות:
לחץ על + New בלשונית Queries ובחר את סוג הקווארי המתאים למסד הנתונים שלך.
תן לקווארי שם, למשל: fetchChatMessages.
הקווארי הזה שולף הודעות קיימות מהמסד הנתונים עבור chatId. ודא שהשאילתה כוללת:
שליפת comment_id, related_to_id, comment_text, created_by_name, ו-created_at.
סינון לפי related_to_id ומיון לפי created_at.
בלשונית Query Settings, סמן Run this query on page load.
חלק 2: בניית שרת WebSocket לתקשורת בזמן אמת
שלב 1: הקמת סביבת פיתוח לשרת ב-VS Code
צור תיקייה חדשה לשרת:
ב-VS Code, לחץ על File > Open Folder.
צור תיקייה חדשה בשם chat-websocket-server (במקום נוח, כמו C:\Projects).
פתח את התיקייה ב-VS Code.
אתחל פרויקט Node.js:
פתח טרמינל ב-VS Code עם Terminal > New Terminal.
בתוך התיקייה chat-websocket-server, הרץ:
text

Copy
npm init -y
זה יצור קובץ package.json בסיסי.
התקן את התלות הדרושה:
התקן את ספריית ws לניהול WebSocket:
text

Copy
npm install ws
הספרייה הזו מאפשרת ליצור שרת WebSocket בקלות.
שלב 2: יצירת שרת WebSocket
צור קובץ לשרת:
בתיקיית הפרויקט (chat-websocket-server), צור קובץ חדש בשם server.js.
כתוב את קוד השרת:
כבר יש לך את הקוד של server.js במערכת שלך, אבל לצורך ההדרכה, ודא שהקובץ כולל את הפונקציונליות הבאה:
יצירת שרת WebSocket שמאזין על פורט 8080.
ניהול לקוחות לפי chat_id (מאגר ששומר לקוחות מחוברים לפי chat_id).
קבלת הודעות מלקוח ושידורן לכל הלקוחות עם אותו chat_id.
טיפול בניתוק לקוחות וניקוי המאגר.
הפעל את השרת:
בטרמינל, בתוך התיקייה chat-websocket-server, הרץ:
text

Copy
node server.js
אתה אמור לראות את ההודעה:
text

Copy
WebSocket server running on ws://localhost:8080
השרת פועל כעת ומאזין על פורט 8080.
שלב 3: בדיקת המערכת כולה
ודא שהשרת פועל:
ודא שהשרת WebSocket פועל בטרמינל ורץ על ws://localhost:8080.
בדוק את הסנכרון בין המשתמשים:
פתח את האפליקציה ב-Retool בשני דפדפנים שונים עם אותו chat_id (למשל, הגדר את chatId של הקומפוננטה לערך קבוע כמו "chat123" בשני הדפדפנים).
שלח הודעה ממשתמש אחד (למשל, שלום! הנה קישור: https://example.com).
בדוק שההודעה:
מופיעה פעם אחת אצל המשתמש השולח.
מופיעה פעם אחת אצל המשתמש השני.
הקישור מופיע כלחיץ (כחול עם קו תחתון).
טקסט ארוך יורד שורה אוטומטית בתוך הבועה.
ודא שהגלישה האוטומטית עובדת וההודעות מוצגות עם Heebo, 12px, וזמן מתחת לטקסט.
בדוק את הקונסולה:
פתח את קונסולת הדפדפן (F12) וחפש הודעות כמו Connected to WebSocket server ו-Received WebSocket message.
ודא שאין שגיאות חדשות.
בדוק את ה-Inspector ב-Retool:
עבור ל-Inspector של הקומפוננטה (customComponent2) ובדוק שאין שגיאות.
ודא ש-previousMessages מתעדכן עם הודעות חדשות ממשתמשים אחרים.
טיפים להתמודדות עם בעיות
ה-WebSocket לא מתחבר:
ודא שהשרת פועל על ws://localhost:8080. בדוק בטרמינל של השרת אם אתה רואה הודעות Client connected.
בדוק את הפורט ב-Windows עם:
text

Copy
netstat -an | findstr 8080
או ב-Mac/Linux עם:
text

Copy
netstat -an | grep 8080
ודא שהדפדפן לא חוסם את החיבור עקב הגדרות חומת אש או CORS.
נסה לחבר לשרת עם כלי כמו WebSocket Client.
הודעות לא מופיעות בזמן אמת:
ודא שהקווארי connectWebSocket מופעל בעת טעינת העמוד (בדוק את ההגדרות ב-Retool).
ודא שהקווארי sendMessageToWebSocket מופעל דרך האירוע messageSent של הקומפוננטה.
בדוק את ה-console.log בקונסולה כדי לראות אם ההודעות מתקבלות.
טקסט לא יורד שורה אוטומטית:
ודא שה-CSS של .bubble כולל max-width, overflow-wrap, ו-word-break.
בדוק את ה-CSS בקונסולה (F12 > Elements) כדי לוודא שהמאפיינים נטענים כראוי.
קישורים לא מופיעים כלחיצים:
ודא שהפונקציה renderTextWithLinks בקומפוננטה מזהה קישורים כראוי (למשל, https://example.com).
בדוק את ה-console.log בקונסולה כדי לראות את הטקסט המעובד.
סיכום
במדריך זה בנינו מערכת צ'אט בזמן אמת עם Retool ו-WebSocket:

יצרנו קומפוננטה מותאמת אישית בשם ChatComponent שמציגה הודעות, תומכת בקישורים לחיצים, ומבצעת גלישת טקסט אוטומטית.
בנינו שרת WebSocket שמנהל תקשורת בזמן אמת בין משתמשים.
הגדרנו קוואריז ב-Retool לניהול התקשורת עם השרת ושמירת הודעות במסד הנתונים.
