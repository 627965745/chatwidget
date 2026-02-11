# UoL Custom LiveChat Widget

A fully custom chat widget built from scratch using LiveChat's Customer SDK. Built with vanilla JavaScript and jQuery, this widget provides complete control over the user interface while integrating seamlessly with LiveChat's backend and the existing Chatbot API.

## Features

- ✨ **Fully Custom UI**: Built from scratch, no default LiveChat widget dependency
- 🎨 **Responsive Design**: Works perfectly on desktop, tablet, and mobile
- 🔄 **Real-time Messaging**: Uses LiveChat Customer SDK for instant communication
- 🤖 **AI Integration**: Connects to OpenAI-powered chatbot backend
- 🔌 **Easy Integration**: Simple one-line script inclusion
- 🚀 **No Build Required**: Pure JavaScript, no npm or bundlers needed
- 📱 **Tab Coordination**: Prevents duplicate API calls across multiple browser tabs

## File Structure

The widget consists of three main files:
- **chatwidget.js** - Main JavaScript logic and SDK integration
- **chatwidget.css** - All widget styles (positioned using CSS variables)
- **chatwidget-template.html** - Widget HTML structure

## Architecture

The widget works as follows:
1. Loads jQuery from CDN (if not already present)
2. Loads LiveChat Customer SDK from CDN
3. Loads external CSS file (`chatwidget.css`)
4. Loads external HTML template (`chatwidget-template.html`)
5. Applies dynamic positioning and colors via CSS variables
6. Initializes Customer SDK and handles all chat events
7. Calls backend API endpoints for message processing

## Quick Start

### 1. Get LiveChat Credentials

Before using the widget, you need to obtain your LiveChat credentials:

1. Log in to your [LiveChat Developer Console](https://developers.livechat.com/console/apps/)
2. **Create a new app** with the following settings:
   - **App Type:** "Web app (frontend, e.g. JavaScript)"
   - **Scopes:** Add `customers:own` scope (required for Customer SDK)
   - **Redirect URI whitelist:** Add your domain (e.g., `http://localhost:3000` for local development)
3. Get your **Organization ID** and **Client ID** from the app settings
4. (Optional) Get your **Group ID** from LiveChat settings if you use groups
5. Note your license **region** ('dal' or 'fra') - defaults to 'dal'

### 2. Include the Widget

Add the required files to your HTML page:

```html
<!-- Optional: Preload CSS for faster rendering -->
<link rel="stylesheet" href="chatwidget.css">

<!-- Required: Main widget script -->
<script src="chatwidget.js"></script>
```

**Note:** The CSS file is automatically loaded by `chatwidget.js` if not already present, but preloading it in the `<head>` can improve initial rendering performance.

### 3. Initialize

Initialize the widget with your configuration:

```javascript
<script>
  UoLChatWidget.init({
    baseURL: 'https://your-api.com/api/chat',
    organizationId: 'your-organization-id',
    clientId: 'your-client-id',
    groupId: 0,
    primaryColor: '#2F80ED',
    title: 'UoL LiveChat',
    username: null  // Optional: set for authenticated users
  });
</script>
```

### 4. Done!

The chat bubble will appear in the bottom-right corner of your page.

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseURL` | string | `''` | **Required.** Base URL of your backend API |
| `organizationId` | string | `''` | **Required.** LiveChat organization ID (UUID format) |
| `clientId` | string | `''` | **Required.** LiveChat client ID (32 chars) |
| `groupId` | number | `0` | LiveChat group ID (optional) |
| `region` | string | `'dal'` | Server region: 'dal' (Dallas) or 'fra' (Frankfurt) |
| `primaryColor` | string | `'#2F80ED'` | Primary color for the widget |
| `title` | string | `'UoL LiveChat'` | Widget title shown in header |
| `username` | string | `null` | Username for authenticated users |
| `position.bottom` | string | `'24px'` | Distance from bottom of screen |
| `position.right` | string | `'24px'` | Distance from right of screen |

### Example Configuration

```javascript
UoLChatWidget.init({
  baseURL: 'https://api.example.com/api/chat',
  organizationId: 'a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6',
  clientId: 'e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0',
  groupId: 11,
  region: 'dal', // or 'fra' for Frankfurt
  primaryColor: '#4A90E2',
  title: 'Customer Support',
  username: 'john.doe@example.com',
  position: {
    bottom: '20px',
    right: '20px'
  }
});
```

## Backend Integration

The widget requires a backend API with the following endpoints:

### POST /api/chat/AssignBotAgent

Assigns a bot agent to handle the chat when a customer enters.

**Request Body:**
```json
{
  "chat_id": "string",
  "thread_id": "string"
}
```

**Response:** 200 OK

### POST /api/chat/

Processes a customer message through the AI backend.

**Request Body:**
```json
{
  "chat_id": "string",
  "thread_id": "string",
  "username": "string (optional)"
}
```

**Response:**
```json
{
  "responseText": "string"
}
```

**Note:** The backend should send the response message via the LiveChat API. The widget will receive it through the LiveChat SDK's `new_event` listener.

## How It Works

### Message Flow

1. **User sends message** → Message is sent via Customer SDK's `sendEvent()`
2. **SDK fires `incoming_event`** → Widget detects customer message
3. **Widget calls backend** → POST to `/api/chat/`
4. **Backend processes** → OpenAI generates response
5. **Backend sends response** → Via LiveChat API as agent message
6. **SDK fires `incoming_event`** → Widget detects agent message
7. **Widget displays message** → Updates custom UI

### Tab Coordination

The widget implements sophisticated tab coordination to prevent duplicate API calls when multiple browser tabs are open:

- Each tab gets a unique ID
- Uses BroadcastChannel API with localStorage fallback
- Messages are deduplicated using event ID hashing
- Only the active tab processes messages
- Automatic cleanup of old coordination data

### Customer SDK Integration

The widget uses LiveChat's Customer SDK methods and events:

**Methods:**
- `init()` → Initialize SDK with organizationId and clientId
- `startChat()` → Start a new chat with pre-chat form data
- `resumeChat()` → Resume an existing inactive chat
- `sendEvent()` → Send customer messages
- `listChats()` → Get list of existing chats
- `getChatHistory()` → Load chat history

**Events:**
- `connected` → SDK connected, list existing chats
- `customer_id` → Receive customer ID
- `user_data` → Receive user information (agents, customers)
- `incoming_chat` → New chat started
- `incoming_event` → New message or event received
- `chat_deactivated` → Chat ended
- `connection_lost` / `connection_restored` → Connection status

## UI Components

### Chat Bubble
- Round floating button
- Chat icon (SVG)
- Notification badge for new messages
- Hover and click animations

### Chat Window
- **Header**: Title, minimize, and close buttons
- **Pre-chat Form**: Name input (before chat starts)
- **Message Area**: Scrollable message list with auto-scroll
- **Message Bubbles**: Different styles for customer vs agent
- **Typing Indicator**: Animated dots when agent is typing
- **Input Area**: Textarea with send button
- **Timestamps**: Formatted time display for each message

## Customization

### Styling

The widget injects all styles dynamically. To customize:

1. The primary color is configurable via the `primaryColor` option
2. Advanced customization requires modifying the `injectStyles()` function in `chatwidget.js`
3. All styles are scoped to avoid conflicts with your page

### Positioning

Change the widget position:

```javascript
UoLChatWidget.init({
  position: {
    bottom: '10px',
    right: '10px'
    // or left: '10px' for left side
  }
});
```

## Browser Support

- ✅ Chrome 60+
- ✅ Firefox 55+
- ✅ Safari 11+
- ✅ Edge 79+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)

## Dependencies

- **jQuery 3.6.0** (loaded from CDN if not present)
- **LiveChat Customer SDK 4.x** (loaded from unpkg CDN)

**Important:** The widget uses Customer SDK v4.x which requires `organizationId` and `clientId`. Older versions (v3.x) used `licenseId` instead of `organizationId`.

## Security Considerations

- Widget uses HTTPS for all API calls
- No sensitive data stored in localStorage
- Tab coordination uses secure event IDs
- Messages are sent through LiveChat's secure API

## Troubleshooting

### Widget doesn't appear
- Check browser console for errors
- Ensure `chatwidget.js` is loaded correctly
- Verify jQuery is available or can be loaded from CDN
- Check that Customer SDK loaded successfully from CDN

### SDK initialization fails (401 Unauthorized)

If you see a `401 (Unauthorized)` error on `https://accounts.livechatinc.com/customer/token`:

**Root Cause:** Invalid or incorrect LiveChat credentials.

**Solutions:**

1. **Verify Your Credentials**
   - Log in to [LiveChat Developer Console](https://developers.livechat.com/console/apps/)
   - Go to your app's settings
   - Copy the **Organization ID** (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
   - Copy the **Client ID** (format: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - Ensure both are copied exactly without extra spaces

2. **Check App Permissions**
   - In Developer Console, ensure your app has the following scope:
     - ✅ `customers:own` (required for Customer SDK)
   - **DO NOT** use Agent API scopes like `chats--all:ro` or `chats--all:rw`
   - Save any changes and wait a few minutes for them to propagate

3. **Verify App is Published**
   - Your app must be in "Published" or "Private" state, not "Draft"
   - Check the app status in Developer Console

4. **Test with Console Logging**
   - Open browser console and check for detailed error messages
   - Look for the logged configuration values to ensure they match your credentials
   - The widget now logs: `Initializing Customer SDK with config:`

5. **Common Mistakes**
   - Using `license ID` instead of `organization ID` (v4.x uses organizationId, v3.x used licenseId)
   - Using the wrong `clientId` (make sure it's for a Customer SDK app, not Agent app)
   - Mixing up development and production credentials
   - Special characters or whitespace in credentials
   - Using wrong SDK version - this widget requires v4.x

6. **Create a New App (if needed)**
   - If credentials are definitely correct but still failing:
     - Create a brand new app in Developer Console
     - Select "Customer Chat API" as the app type
     - Use the new credentials

**Additional Debugging:**

The widget now includes authentication debugging. Check console for:
```
Initializing Customer SDK with config: {...}
Customer SDK initialized
Auth token retrieved: Token exists
```

If you see `Auth token error`, the credentials are invalid.

**Testing Authentication:**

After the widget initializes, you can test authentication from the browser console:

```javascript
UoLChatWidget.testAuth();
```

This will show whether authentication is working and display any error messages.

### WebSocket Connection Failed

If you see `WebSocket connection to 'wss://api-dal.livechatinc.com/v3.5/customer/rtm/ws' failed`:

**This means authentication worked but real-time connection failed.**

**Common Causes:**

1. **Wrong Region**
   - Your license might be in Frankfurt instead of Dallas (or vice versa)
   - Check your LiveChat account region
   - Try changing `region: 'dal'` to `region: 'fra'` in `chatwidget.js` line 16
   - Or vice versa if already on 'fra'

2. **Firewall/Network Blocking WebSockets**
   - Corporate firewall blocking WebSocket protocol
   - VPN interfering with connections
   - Browser extensions (ad blockers, privacy tools) blocking WebSockets
   - Try: Disable extensions, disconnect VPN, try different network

3. **Browser Security Restrictions**
   - Mixed content (HTTPS page loading from HTTP)
   - Localhost security restrictions
   - Try: Use HTTPS for local development or test on a real domain

4. **LiveChat License Issues**
   - License inactive or expired
   - License not properly configured
   - Check your LiveChat dashboard for license status

**How to Find Your Region:**

1. Log into LiveChat
2. Check the URL in your browser
3. If it contains `.eu.` or references Europe → use `region: 'fra'`
4. Otherwise → use `region: 'dal'`

**Quick Test - Try the Other Region:**

In your browser console:
```javascript
// Current config
UoLChatWidget.getConfig()

// If currently 'dal', change to 'fra' in chatwidget.js line 16
// If currently 'fra', change to 'dal' in chatwidget.js line 16
// Then reload the page
```

### Messages not sending
- Verify `baseURL` is correct
- Check backend API is running and accessible
- Review network tab for API call failures
- Ensure chat is active before sending messages
- Check SDK connection status in console

### Multiple API calls
- Tab coordination should prevent this automatically
- Check localStorage is enabled
- Verify BroadcastChannel API support (or fallback works)

### Custom UI not showing
- Ensure Customer SDK is loaded from CDN
- Check z-index conflicts with your page styles
- Verify no JavaScript errors in console
- Check that widget initialization completed successfully

## Development

### Local Testing

1. Open `index.html` in a browser
2. Update `baseURL` to point to your local backend
3. Click the chat bubble to test

### Integration with Existing Chatbot

This widget is designed to work with the existing Chatbot backend at:
`/Users/sgjliu/Documents/Projects/chatbot/Chatbot.API`

The backend handles:
- LiveChat API integration
- OpenAI Assistant sessions
- Message processing
- Agent assignment

## License

This project is proprietary software developed for the University of Liverpool.

## Support

For questions or issues, please contact the development team.

## Version History

### v2.0.0 (Current)
- Complete rewrite using LiveChat Customer SDK
- Fully custom chat implementation (no dependency on LiveChat widget UI)
- Direct SDK integration with all LiveChat features
- Custom UI with complete control
- Backend API integration
- Tab coordination
- Responsive design
- Pre-chat form with customer data
- Chat history loading
- Typing indicators
- Message timestamps
- Support for chat activation/deactivation

