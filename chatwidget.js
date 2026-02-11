(function(window, document) {
    'use strict';

    // Configuration
    // Get base URL for this file in its hosted environment
    const thisScript = document.currentScript.src;
    const baseUrl = thisScript.substring(0, thisScript.lastIndexOf('/') + 1);

    const config = {
        organizationId: '80288446-a606-40b6-abfc-bb53c1b05fe1',
        clientId: '9bcefa6049fb31abf99b83e8a5f51c19',
        // baseURL: 'https://test-chatbot-api.liverpool.ac.uk/api/chat/',
        baseURL: 'https://localhost:7097/api/chat/',
        groupId: 0,
        primaryColor: '#212B58',
        title: 'UoL LiveChat',
        position: {
            bottom: '96px',
            right: '24px'
        }
    };

    // History states
    const historyStates = {
        DONE: 'DONE',
        INACTIVE: 'INACTIVE',
        LOADING: 'LOADING'
    };

    // Application state
    const state = {
        chat: null,
        thread: null,        // Current thread ID
        active: false,
        activating: false,
        users: {},
        pendingMessages: [],
        customerId: null,
        historyStatus: historyStates.INACTIVE,
        history: null,
        waitingForReconnect: false,
        sdkConnected: false,
        closingChat: false,  // Flag to indicate user is intentionally closing the chat
        currentAgent: null   // Track current agent for transfer detection
    };

    // Helper functions
    const noop = () => {};
    const isAgent = (user) => user && user.id !== state.customerId;

    // Convert URLs in text to clickable bold hyperlinks
    const linkifyText = (text) => {
        // URL regex pattern to match http, https, www URLs, mailto:, and tel: links
        const urlPattern = /(https?:\/\/[^\s<]+|www\.[^\s<]+|mailto:[^\s<]+|tel:[^\s<]+)/gi;
        
        // First escape HTML to prevent XSS
        const escapeHtml = (str) => {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        };
        
        const escapedText = escapeHtml(text);
        
        // Replace URLs with anchor tags
        return escapedText.replace(urlPattern, (url) => {
            let href = url;
            let displayText = url;
            
            // Add https:// if the URL starts with www.
            if (url.startsWith('www.')) {
                href = 'https://' + url;
            }
            
            // For mailto and tel links, show a cleaner display text
            if (url.toLowerCase().startsWith('mailto:')) {
                displayText = url.substring(7);
            } else if (url.toLowerCase().startsWith('tel:')) {
                displayText = url.substring(4);
            }
            
            // mailto and tel links don't need target="_blank"
            const isExternalLink = !url.toLowerCase().startsWith('mailto:') && !url.toLowerCase().startsWith('tel:');
            const targetAttr = isExternalLink ? ' target="_blank" rel="noopener noreferrer"' : '';
            
            return `<a href="${href}"${targetAttr} class="uol-message-link"><strong>${displayText}</strong></a>`;
        });
    };

    // DOM Elements (will be set after HTML loads)
    let DOMElements = {};
    
    // Sound state
    let soundEnabled = true;
    
    // Notification sound
    const notificationSound = new Audio(baseUrl + 'new_message.ogg');
    notificationSound.volume = 0.5;
    
    const playNotificationSound = () => {
        if (soundEnabled) {
            notificationSound.currentTime = 0;
            notificationSound.play().catch(err => {
                console.log('Could not play notification sound:', err.message);
            });
        }
    };

    // DOM Operations
    const DOMOperations = {
        enableInput: () => {
            if (DOMElements.input) {
                DOMElements.input.disabled = false;
                DOMElements.input.placeholder = 'Type your message...';
            }
        },

        disableInput: (message) => {
            if (DOMElements.input) {
                DOMElements.input.disabled = true;
                DOMElements.input.placeholder = message || 'Disconnected';
            }
        },

        enableSendButton: () => {
            if (DOMElements.sendButton) {
                DOMElements.sendButton.disabled = false;
            }
        },

        disableSendButton: () => {
            if (DOMElements.sendButton) {
                DOMElements.sendButton.disabled = true;
            }
        },

        showChat: () => {
            if (DOMElements.preChatForm) DOMElements.preChatForm.style.display = 'none';
            if (DOMElements.startChatArea) DOMElements.startChatArea.style.display = 'none';
            if (DOMElements.messages) DOMElements.messages.style.display = 'block';
            if (DOMElements.inputArea) DOMElements.inputArea.style.display = 'block';
        },

        hideChat: () => {
            if (DOMElements.messages) DOMElements.messages.style.display = 'none';
            if (DOMElements.inputArea) DOMElements.inputArea.style.display = 'none';
            if (DOMElements.startChatArea) DOMElements.startChatArea.style.display = 'none';
        },

        showPreChatForm: () => {
            console.log('Showing pre-chat form');
            if (DOMElements.preChatForm) {
                DOMElements.preChatForm.style.display = 'flex';
                // Pre-fill name from customer data or configured username
                if (DOMElements.preChatName) {
                    const customerData = state.customerId ? state.users[state.customerId] : null;
                    const customerName = customerData?.name || config.username || '';
                    DOMElements.preChatName.value = customerName;
                    console.log('  ↳ Pre-filling name field with:', customerName);
                }
                // Update button text based on whether we're resuming or starting new
                if (DOMElements.preChatSubmit) {
                    const buttonText = state.chat ? 'Resume chat' : "Let's chat";
                    DOMElements.preChatSubmit.textContent = buttonText;
                    console.log('  ↳ Pre-chat button text:', buttonText);
                }
            }
            DOMOperations.hideChat();
        },

        // Create in-chat form component
        createInChatForm: (config) => {
            const formDiv = document.createElement('div');
            formDiv.className = `uol-in-chat-form type-${config.type || 'info'}`;
            formDiv.id = config.id;
            
            // Title
            if (config.title) {
                const title = document.createElement('h4');
                title.className = 'uol-in-chat-form-title';
                title.textContent = config.title;
                formDiv.appendChild(title);
            }
            
            // Description
            if (config.description) {
                const desc = document.createElement('p');
                desc.className = 'uol-in-chat-form-description';
                desc.textContent = config.description;
                formDiv.appendChild(desc);
            }
            
            // Fields container
            const fieldsDiv = document.createElement('div');
            fieldsDiv.className = 'uol-in-chat-form-fields';
            
            // Add fields
            config.fields.forEach(field => {
                const fieldDiv = document.createElement('div');
                fieldDiv.className = 'uol-in-chat-form-field';
                
                if (field.label) {
                    const label = document.createElement('label');
                    label.className = 'uol-in-chat-form-label';
                    label.textContent = field.label;
                    fieldDiv.appendChild(label);
                }
                
                let input;
                if (field.type === 'textarea') {
                    input = document.createElement('textarea');
                    input.rows = field.rows || 3;
                } else {
                    input = document.createElement('input');
                    input.type = field.type || 'text';
                }
                
                input.id = field.id;
                input.placeholder = field.placeholder || '';
                input.value = field.value || '';
                if (field.required) input.required = true;
                
                fieldDiv.appendChild(input);
                fieldsDiv.appendChild(fieldDiv);
            });
            
            formDiv.appendChild(fieldsDiv);
            
            // Actions container
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'uol-in-chat-form-actions';
            
            // Add buttons
            config.buttons.forEach(button => {
                const btn = document.createElement('button');
                btn.className = button.primary ? 'primary' : 'secondary';
                btn.textContent = button.text;
                btn.onclick = button.onClick;
                if (button.id) btn.id = button.id;
                actionsDiv.appendChild(btn);
            });
            
            formDiv.appendChild(actionsDiv);
            
            return formDiv;
        },


        // Example: Show feedback/rating form (for future use)
        showFeedbackForm: () => {
            console.log('Showing feedback form');
            
            // Remove existing feedback form if present
            const existing = document.getElementById('uol-feedback-form');
            if (existing) existing.remove();
            
            const feedbackForm = DOMOperations.createInChatForm({
                id: 'uol-feedback-form',
                type: 'success',
                title: 'Chat Ended',
                description: 'How was your experience? Your feedback helps us improve.',
                fields: [
                    {
                        id: 'uol-feedback-comment',
                        type: 'textarea',
                        placeholder: 'Tell us about your experience (optional)',
                        rows: 3
                    }
                ],
                buttons: [
                    {
                        text: 'Skip',
                        primary: false,
                        onClick: () => {
                            const form = document.getElementById('uol-feedback-form');
                            if (form) form.remove();
                        }
                    },
                    {
                        text: 'Submit Feedback',
                        primary: true,
                        onClick: () => {
                            const comment = document.getElementById('uol-feedback-comment')?.value || '';
                            console.log('Feedback submitted:', { comment });
                            // TODO: Send feedback to server
                            const form = document.getElementById('uol-feedback-form');
                            if (form) form.remove();
                            DOMOperations.addSystemMessage('Thank you for your feedback!');
                        }
                    }
                ]
            });
            
            DOMOperations.appendMessage(feedbackForm);
            DOMOperations.scrollToBottom();
        },

        createMessage: (id, text, type, author, timestamp) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `uol-message ${type}`;
            messageDiv.dataset.id = id;

            // Meta info (name + time) for agent messages
            if (type === 'agent' && author) {
                const metaDiv = document.createElement('div');
                metaDiv.className = 'uol-message-meta';
                
                const nameSpan = document.createElement('span');
                nameSpan.className = 'uol-agent-name';
                nameSpan.textContent = author.name || 'Agent';
                
                const timeSpan = document.createElement('span');
                timeSpan.className = 'uol-message-time';
                timeSpan.textContent = DOMOperations.formatTime(timestamp || new Date());
                
                metaDiv.appendChild(nameSpan);
                metaDiv.appendChild(timeSpan);
                messageDiv.appendChild(metaDiv);
            }

            // Message wrapper with avatar
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'uol-message-wrapper';

            if (type === 'agent' && author) {
                const avatarDiv = document.createElement('div');
                avatarDiv.className = 'uol-agent-avatar';
                
                // Check if author has avatar URL
                if (author.avatar) {
                    const avatarImg = document.createElement('img');
                    avatarImg.src = author.avatar;
                    avatarImg.alt = author.name || 'Agent';
                    avatarDiv.appendChild(avatarImg);
                } else {
                    const initials = author.name ? author.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'A';
                    avatarDiv.textContent = initials;
                }
                
                wrapperDiv.appendChild(avatarDiv);
            }

            const contentDiv = document.createElement('div');
            contentDiv.className = 'uol-message-content';
            // Use linkifyText for agent messages to make URLs clickable and bold
            if (type === 'agent') {
                contentDiv.innerHTML = linkifyText(text);
            } else {
                contentDiv.textContent = text;
            }

            wrapperDiv.appendChild(contentDiv);
            messageDiv.appendChild(wrapperDiv);

            // Time for customer messages
            if (type === 'customer') {
                const timeDiv = document.createElement('div');
                timeDiv.className = 'uol-message-time';
                timeDiv.textContent = DOMOperations.formatTime(timestamp || new Date());
                messageDiv.appendChild(timeDiv);
            }

            return messageDiv;
        },

        appendMessage: (messageElement) => {
            if (DOMElements.messages) {
                DOMElements.messages.appendChild(messageElement);
            }
        },

        prependMessages: (messages) => {
            if (DOMElements.messages && messages.length > 0) {
                const fragment = document.createElement('div');
                messages.forEach(msg => fragment.appendChild(msg));
                DOMElements.messages.insertBefore(fragment, DOMElements.messages.firstChild);
            }
        },

        scrollToBottom: () => {
            if (DOMElements.messages) {
                DOMElements.messages.scrollTop = DOMElements.messages.scrollHeight;
            }
        },

        confirmMessageAsSent: (id) => {
            // Message confirmed - could add visual indicator here
        },

        markAsFailedMessage: (id) => {
            const message = DOMElements.messages.querySelector(`[data-id="${id}"]`);
            if (message) {
                message.classList.add('failed');
            }
        },

        addSystemMessage: (text) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'uol-message system';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'uol-message-content';
            contentDiv.textContent = text;
            
            messageDiv.appendChild(contentDiv);
            DOMOperations.appendMessage(messageDiv);
            DOMOperations.scrollToBottom();
        },

        addTimeDivider: (time) => {
            const dividerDiv = document.createElement('div');
            dividerDiv.className = 'uol-time-divider';
            
            const timeSpan = document.createElement('span');
            timeSpan.textContent = time;
            
            dividerDiv.appendChild(timeSpan);
            DOMOperations.appendMessage(dividerDiv);
        },

        showStartChatButton: () => {
            if (DOMElements.startChatArea) {
                DOMElements.startChatArea.style.display = 'block';
            }
            if (DOMElements.inputArea) {
                DOMElements.inputArea.style.display = 'none';
            }
        },

        hideStartChatButton: () => {
            if (DOMElements.startChatArea) {
                DOMElements.startChatArea.style.display = 'none';
            }
        },

        updateStartChatButtonText: (text) => {
            if (DOMElements.startChatBtn) {
                DOMElements.startChatBtn.textContent = text;
            }
        },

        showTypingIndicator: () => {
            if (document.getElementById('uol-typing-indicator')) return;
            
            const typingDiv = document.createElement('div');
            typingDiv.id = 'uol-typing-indicator';
            typingDiv.className = 'uol-message agent';
            
            const indicator = document.createElement('div');
            indicator.className = 'uol-typing-indicator';
            indicator.innerHTML = '<span></span><span></span><span></span>';
            
            typingDiv.appendChild(indicator);
            DOMOperations.appendMessage(typingDiv);
            DOMOperations.scrollToBottom();
        },

        hideTypingIndicator: () => {
            const indicator = document.getElementById('uol-typing-indicator');
            if (indicator) {
                indicator.remove();
            }
        },

        showProcessingIndicator: () => {
            if (document.getElementById('uol-processing-indicator')) return;
            
            const processingDiv = document.createElement('div');
            processingDiv.id = 'uol-processing-indicator';
            processingDiv.className = 'uol-message agent';
            
            const wrapperDiv = document.createElement('div');
            wrapperDiv.className = 'uol-message-wrapper';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'uol-processing-indicator';
            contentDiv.innerHTML = `
                <svg class="uol-processing-spinner" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="31.4 31.4" />
                </svg>
                <span>Processing your message...</span>
            `;
            
            wrapperDiv.appendChild(contentDiv);
            processingDiv.appendChild(wrapperDiv);
            DOMOperations.appendMessage(processingDiv);
            DOMOperations.scrollToBottom();
        },

        hideProcessingIndicator: () => {
            const indicator = document.getElementById('uol-processing-indicator');
            if (indicator) {
                indicator.remove();
            }
        },

        toggleMinimized: () => {
            const chatWindow = document.getElementById('uol-chat-window');
            const chatBubble = document.getElementById('uol-chat-bubble');
            
            if (chatWindow && chatBubble) {
                chatWindow.classList.toggle('open');
                chatBubble.classList.remove('has-notification');
            }
        },

        formatTime: (date) => {
            if (!(date instanceof Date)) {
                date = new Date(date);
            }
            const hours = date.getHours();
            const minutes = date.getMinutes();
            // Use 24-hour format like in the reference image (e.g., "15:56")
            return hours + ':' + (minutes < 10 ? '0' : '') + minutes;
        }
    };

    // Load external CSS
    function loadCSS(callback) {
        const existingLink = document.getElementById('uol-chat-widget-css');
        if (existingLink) {
            callback();
            return;
        }

        const link = document.createElement('link');
        link.id = 'uol-chat-widget-css';
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = baseUrl + 'chatwidget.css';
        link.onload = () => {
            applyDynamicStyles();
            callback();
        };
        link.onerror = () => {
            console.error('Failed to load chatwidget.css');
            callback();
        };
        document.head.appendChild(link);
    }

    function applyDynamicStyles() {
        const styleElement = document.createElement('style');
        styleElement.id = 'uol-chat-widget-dynamic-styles';
        styleElement.textContent = `
            :root {
                --primary-color: ${config.primaryColor};
            }
            #uol-chat-bubble {
                bottom: ${config.position.bottom};
                right: ${config.position.right};
            }
            #uol-chat-window {
                bottom: ${config.position.bottom};
                right: ${config.position.right};
            }
        `;
        document.head.appendChild(styleElement);
    }

    // Create widget HTML dynamically
    function createWidgetHTML(callback) {
        const widgetHTML = `
            <div id="uol-chat-widget">
                <!-- Chat Bubble -->
                <div id="uol-chat-bubble">
                    <img src="https://cdn.files-text.com/us-south1/api/lc/img/15924798/199372d81dafe9a93ed480d2b59d0f2c.png" alt="Chat" />
                </div>

                <!-- Chat Window -->
                <div id="uol-chat-window">
                    <!-- Header -->
                    <div id="uol-chat-header">
                        <div id="uol-chat-header-left">
                            <button id="uol-chat-sound-toggle" class="sound-on" title="Toggle sound">
                                <svg class="sound-on-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                                </svg>
                                <svg class="sound-off-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                    <line x1="23" y1="9" x2="17" y2="15"></line>
                                    <line x1="17" y1="9" x2="23" y2="15"></line>
                                </svg>
                            </button>
                        </div>
                        <div id="uol-chat-header-center">
                            <div id="uol-chat-header-badge">
                                <div id="uol-chat-header-logo">
                                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
                                    </svg>
                                </div>
                                <span data-widget-title>${config.title}</span>
                            </div>
                        </div>
                        <div id="uol-chat-header-right">
                            <button id="uol-chat-minimize" title="Minimize">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                            </button>
                            <button id="uol-chat-close" title="End chat">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Pre-chat Form -->
                    <div id="uol-prechat-form">
                        <div class="uol-prechat-welcome">
                            <div class="uol-prechat-icon">
                                <svg width="40" height="40" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
                                </svg>
                            </div>
                            <h4>Welcome!</h4>
                            <p>Please enter your name to start chatting with us.</p>
                        </div>
                        <div class="uol-prechat-fields">
                            <input type="text" id="uol-prechat-name" placeholder="Your name" required>
                        </div>
                        <button id="uol-prechat-submit">Let's chat</button>
                    </div>

                    <!-- Messages Area -->
                    <div id="uol-chat-messages" style="display: none;"></div>

                    <!-- Input Area -->
                    <div id="uol-chat-input-area" style="display: none;">
                        <div id="uol-chat-input-container">
                            <textarea id="uol-chat-input" placeholder="Type your message..." rows="1"></textarea>
                            <button id="uol-chat-send-btn">
                                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Start Chat Area (shown after chat ends) -->
                    <div id="uol-start-chat-area" style="display: none;">
                        <button id="uol-start-chat-btn">Resume chat</button>
                    </div>
                </div>
            </div>
        `;

        const container = document.createElement('div');
        container.innerHTML = widgetHTML.trim();
        document.body.appendChild(container.firstElementChild);
        
        // Store DOM element references
        DOMElements = {
            bubble: document.getElementById('uol-chat-bubble'),
            window: document.getElementById('uol-chat-window'),
            soundToggle: document.getElementById('uol-chat-sound-toggle'),
            minimizeButton: document.getElementById('uol-chat-minimize'),
            closeButton: document.getElementById('uol-chat-close'),
            preChatForm: document.getElementById('uol-prechat-form'),
            preChatName: document.getElementById('uol-prechat-name'),
            preChatSubmit: document.getElementById('uol-prechat-submit'),
            messages: document.getElementById('uol-chat-messages'),
            inputArea: document.getElementById('uol-chat-input-area'),
            input: document.getElementById('uol-chat-input'),
            sendButton: document.getElementById('uol-chat-send-btn'),
            startChatArea: document.getElementById('uol-start-chat-area'),
            startChatBtn: document.getElementById('uol-start-chat-btn')
        };
        
        callback();
    }

    // Load LiveChat Customer SDK
    function loadCustomerSDK(callback) {
        if (window.CustomerSDK) {
            callback();
            } else {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@livechat/customer-sdk@^4.0.0/dist/customer-sdk.min.js';
            script.onload = callback;
            script.onerror = () => {
                console.error('Failed to load LiveChat Customer SDK');
            };
            document.head.appendChild(script);
        }
    }

    // Initialize SDK
    let sdk = null;

    function initializeSDK() {
        
        if (!window.CustomerSDK) {
            console.error('CustomerSDK not loaded');
            return;
        }

        const sdkConfig = {
            organizationId: config.organizationId,
            clientId: config.clientId
        };

        if (config.groupId !== undefined) {
            sdkConfig.groupId = config.groupId;
        }
        if (config.region) {
            sdkConfig.region = config.region;
        }

        sdk = window.CustomerSDK.init(sdkConfig);
        window.sdk = sdk; // For debugging

        attachSDKListeners();
    }

    // SDK Event Listeners
    function attachSDKListeners() {
        // Connection Events
        sdk.on('connected', () => {
            state.sdkConnected = true;
            onSDKConnected();
        });

        sdk.on('connection_restored', () => {
            console.log('[EVENT] connection_restored - Connection has been restored');
            state.sdkConnected = true;
            DOMOperations.enableInput();
            DOMOperations.enableSendButton();
            DOMOperations.addSystemMessage('Connection restored');
        });

        sdk.on('connection_lost', () => {
            console.warn('[EVENT] connection_lost - Connection to LiveChat lost');
            state.sdkConnected = false;
            DOMOperations.disableInput('Disconnected');
            DOMOperations.disableSendButton();
            DOMOperations.addSystemMessage('Connection lost. Reconnecting...');
        });

        sdk.on('disconnected', (reason) => {
            console.error('[EVENT] disconnected - Disconnected from LiveChat:', reason);
            state.sdkConnected = false;
            
            // If user intentionally closed chat, don't show additional messages
            if (state.closingChat) {
                console.log('  ↳ User closed chat - not showing additional messages');
                return;
            }
            
            // If disconnected due to inactivity and not already waiting for reconnect
            if (reason && reason.reason === 'inactivity_timeout' && !state.waitingForReconnect) {
                console.log('  ↳ SDK disconnected due to inactivity - showing Resume chat button');
                state.active = false;
                state.activating = false;
                state.waitingForReconnect = true;
                
                // Disable input
                DOMOperations.disableInput('Chat inactive');
                DOMOperations.disableSendButton();
                
                // Ensure chat interface is visible and pre-chat form is hidden
                DOMOperations.showChat();
                
                // Add system message and show start chat button
                DOMOperations.addSystemMessage('Chat ended automatically due to your inactivity. Feel free to start it again.');
                DOMOperations.showStartChatButton();
                DOMOperations.updateStartChatButtonText('Resume chat');
            } else if (state.waitingForReconnect) {
            } else {
                // Other disconnection reasons - disable input
                DOMOperations.disableInput('Disconnected');
                DOMOperations.disableSendButton();
            }
        });

        // Customer Events
        sdk.on('customer_id', (id) => {
            console.log('[EVENT] customer_id - Customer ID received:', id);
            state.customerId = id;
        });

        sdk.on('customer_updated', (payload) => {
            console.log('[EVENT] customer_updated - Customer data updated:', payload);
        });

        // User Events
        sdk.on('user_data', (user) => {
            state.users[user.id] = user;
            
            // Track current agent
            if (user.type === 'agent' && state.active) {
                state.currentAgent = user;
            }
        });

        sdk.on('user_joined_chat', ({ user, chat }) => {
            console.log('[EVENT] user_joined_chat - User joined:', { user, chat });
            state.users[user.id] = user;
            if (chat.id === state.chat && isAgent(user)) {
                // Check if this is a transfer (previous agent exists and is different)
                if (state.currentAgent && state.currentAgent.id !== user.id) {
                    const fromName = state.currentAgent.name || 'Agent';
                    const toName = user.name || 'Agent';
                    DOMOperations.addSystemMessage(`Chat transferred: from ${fromName} to ${toName}`);
                } else if (!state.currentAgent) {
                    DOMOperations.addSystemMessage(`${user.name || 'Agent'} joined the chat`);
                }
                // Update current agent
                state.currentAgent = user;
            }
        });

        sdk.on('user_left_chat', ({ user, chat }) => {
            console.log('[EVENT] user_left_chat - User left:', { user, chat });
            if (chat.id === state.chat && isAgent(user)) {
                // Only show "left" message if no transfer is happening
                // (transfer message is shown in user_joined_chat)
                // Clear current agent if this is the current one leaving
                if (state.currentAgent && state.currentAgent.id === user.id) {
                    // Don't show "left" message here - transfer message handles it
                    // Just log for debugging
                    console.log('  ↳ Current agent left, waiting for new agent or chat end');
                } else {
                    DOMOperations.addSystemMessage(`${user.name || 'Agent'} left the chat`);
                }
            }
        });

        // Typing Events
        sdk.on('user_is_typing', ({ user, chat }) => {
            if (chat.id === state.chat && isAgent(user)) {
                DOMOperations.showTypingIndicator();
            }
        });

        sdk.on('user_stopped_typing', ({ user, chat }) => {
            if (chat.id === state.chat && isAgent(user)) {
                DOMOperations.hideTypingIndicator();
            }
        });

        sdk.on('incoming_typing_indicator', (payload) => {
            
            // Show/hide processing indicator based on isTyping
            if (payload.typingIndicator && payload.typingIndicator.isTyping) {
                DOMOperations.showProcessingIndicator();
            } else {
                DOMOperations.hideProcessingIndicator();
            }
        });

        // Chat Events
        sdk.on('incoming_chat', ({ chat }) => {
            console.log('[EVENT] incoming_chat - New chat received:', chat);
            handleChatStart(chat);
        });

        sdk.on('chat_deactivated', (payload) => {
            console.log('[EVENT] chat_deactivated - Chat ended:', payload);
            state.active = false;
            state.currentAgent = null;  // Reset current agent on chat end
            
            const chatId = payload.chatId || payload.chat_id;
            
            // If user intentionally closed the chat, don't show additional messages
            if (state.closingChat) {
                console.log('  ↳ Chat was intentionally closed by user - UI already updated');
                state.closingChat = false;  // Reset the flag
                return;
            }
            
            // Check if this is due to inactivity timeout or other reasons
            // The chat can be deactivated for various reasons: agent ended it, user ended it, or inactivity
            if (chatId === state.chat && !state.waitingForReconnect) {
                console.log('  ↳ Our active chat was deactivated (likely inactivity)');
                
                // Since the chat is now inactive, show reconnect option
                state.waitingForReconnect = true;
                
                // Disable input while showing reconnect option
                DOMOperations.disableInput('Chat inactive');
                DOMOperations.disableSendButton();
                
                // Show system message and start chat button
                DOMOperations.addSystemMessage('Chat ended automatically due to your inactivity. Feel free to start it again.');
                DOMOperations.showStartChatButton();
                DOMOperations.updateStartChatButtonText('Resume chat');
                
                console.log('  ↳ Showing Resume chat button for inactive chat');
            } else if (chatId === state.chat && state.waitingForReconnect) {
                console.log('  ↳ Chat already deactivated and waiting for reconnect - ignoring');
            } else {
                // Different chat was deactivated
                DOMOperations.addSystemMessage('Chat ended');
            }
        });

        sdk.on('chat_properties_updated', (payload) => {
        });

        sdk.on('chat_thread_properties_updated', (payload) => {
        });

        // Message & Event Events
        sdk.on('incoming_event', ({ event }) => {
            console.log('Incoming event received:', event);
            
            if (!state.chat) {
                console.log('  ↳ Event ignored (no active chat)');
                return;
            }
            
            // Handle system messages (like chat transfers)
            if (event.type === 'system_message') {
                console.log(`  ↳ System message: ${event.systemMessageType}`);
                
                // Exclude certain system message types from display
                const excludedSystemMessages = ['manual_archived_customer'];
                if (excludedSystemMessages.includes(event.systemMessageType)) {
                    console.log(`  ↳ System message excluded from display: ${event.systemMessageType}`);
                    return;
                }
                
                if (event.text) {
                    DOMOperations.addSystemMessage(event.text);
                }
                return;
            }
            
            if (event.type !== 'message') {
                console.log('  ↳ Event ignored (not a message)');
                return;
            }
            
            // Hide processing indicator before displaying the message
            DOMOperations.hideProcessingIndicator();
            
            const author = state.users[event.authorId];
            const messageType = isAgent(author) ? 'agent' : 'customer';
            console.log(`  ↳ Displaying ${messageType} message from:`, author?.name || 'Unknown');
            
            const timestamp = event.createdAt ? new Date(event.createdAt) : new Date();
            DOMOperations.appendMessage(
                DOMOperations.createMessage(
                    event.id,
                    event.text,
                    messageType,
                    author,
                    timestamp
                )
            );
            DOMOperations.scrollToBottom();
            
            // Show notification and play sound if it's from agent
            if (messageType === 'agent') {
                const chatWindow = document.getElementById('uol-chat-window');
                const chatBubble = document.getElementById('uol-chat-bubble');
                if (chatWindow && !chatWindow.classList.contains('open')) {
                    chatBubble.classList.add('has-notification');
                }
                // Play notification sound for agent messages
                playNotificationSound();
            }
        });

        sdk.on('incoming_multicast', (payload) => {
            console.log('Multicast event received:', payload);
        });

        sdk.on('incoming_sneak_peek', (payload) => {
            console.log('Agent viewing message (sneak peek):', payload);
        });

        sdk.on('incoming_rich_message_postback', (payload) => {
            console.log('Rich message postback received:', payload);
        });

        // Timestamp Events
        sdk.on('last_seen_timestamp_updated', (payload) => {
            console.log('Last seen timestamp updated:', payload);
        });

        // Storage Events
        sdk.on('customer_side_storage_updated', (payload) => {
            console.log('Customer side storage updated:', payload);
        });

        // Queue Events
        sdk.on('queue_position_updated', (payload) => {
            console.log('Queue position updated:', payload);
        });

        // Greeting Events
        sdk.on('greeting', (payload) => {
            console.log('Greeting received:', payload);
        });

        // Event Properties Events
        sdk.on('event_properties_updated', (payload) => {
            console.log('Event properties updated:', payload);
        });

        // Thread Events
        sdk.on('thread_closed', (payload) => {
            console.log('Thread closed:', payload);
        });

        sdk.on('thread_summary', (payload) => {
            console.log('Thread summary received:', payload);
        });

        // Error Events
        sdk.on('error', (error) => {
            console.error('SDK error occurred:', error);
        });

        // Generic event listener to catch any events we might have missed
        console.log('All SDK event listeners attached');
    }

    // Handle SDK connected
    function onSDKConnected() {
        console.log('Fetching existing chats...');
        
        sdk.listChats().then(({ chatsSummary, totalChats }) => {
            console.log('Received chat list response');
            console.log('Total chats:', totalChats);
            console.log('Chats summary:', chatsSummary);
            
            if (state.chat) {
                console.log('Chat already exists in state');
                // If waiting for reconnect form submission OR in the process of activating, don't enable input
                if (state.waitingForReconnect) {
                    console.log('  ↳ Waiting for user to submit reconnect form - keeping input disabled');
                    return;
                }
                if (state.activating) {
                    console.log('  ↳ Chat is being activated (reconnecting) - keeping input disabled temporarily');
                    return;
                }
                // Only enable if not waiting for reconnect and not activating
                DOMOperations.enableInput();
                DOMOperations.enableSendButton();
                return;
            }
                
            DOMOperations.enableInput();
            DOMOperations.enableSendButton();

            if (totalChats === 0) {
                // No existing chat - show pre-chat form
                console.log('No existing chats, showing pre-chat form');
                DOMOperations.showPreChatForm();
                return;
            }
            
            // Check if the existing chat is active
            const existingChat = chatsSummary[0];
            console.log('Found existing chat:', existingChat);
            
            if (!existingChat.active) {
                // Chat exists but is inactive - store chat ID and show prechat form to reactivate
                console.log('Existing chat is inactive, storing chat ID and showing pre-chat form');
                state.chat = existingChat.id;
                state.active = false;
                DOMOperations.showPreChatForm();
                return;
            }
            
            // Has active chat - load it
            state.chat = existingChat.id;
            state.thread = existingChat.lastThreadId || null;  // Store thread ID from summary
            state.active = existingChat.active;
            
            console.log('Existing chat loaded - chat_id:', state.chat, 'thread_id:', state.thread);

            loadInitialHistory().then(() => {
                console.log('History loaded, chat active:', state.active);
                DOMOperations.showChat();
            }).catch((error) => {
                console.error('Error loading history:', error);
                // Even if history fails, show the chat interface
                DOMOperations.showChat();
            });
        }).catch((error) => {
                console.error('Error listing chats:', error);
            // If listing fails, show pre-chat form as fallback
            DOMOperations.showPreChatForm();
        });
    }

    // Chat start handler
    function handleChatStart(chat) {
        const wasResumingChat = state.chat && state.chat === chat.id;  // Check if we're resuming existing chat
        
        state.chat = chat.id;
        state.thread = chat.thread?.id || null;  // Store thread ID
        state.historyStatus = historyStates.DONE;
        state.active = true;
        state.activating = false;
        state.waitingForReconnect = false;
        
        console.log('Chat started - chat_id:', state.chat, 'thread_id:', state.thread, 'resumed:', wasResumingChat);
        
        const pendingMessages = state.pendingMessages;
        state.pendingMessages = [];
        
        // Show chat interface first
        DOMOperations.showChat();
        
        // Ensure input is enabled after starting/resuming chat
        DOMOperations.enableInput();
        DOMOperations.enableSendButton();
        
        // If resuming an existing chat, load full history
        if (wasResumingChat) {
            console.log('Resuming chat - loading full history');
            loadInitialHistory().then(() => {
                // Add current thread messages that might not be in history yet
                const currentMessages = getMessagesFromThreads([chat.thread]);
                currentMessages.forEach((message) => {
                    // Only add if not already present
                    if (!DOMElements.messages.querySelector(`[data-id="${message.dataset.id}"]`)) {
                        DOMOperations.appendMessage(message);
                    }
                });
                DOMOperations.scrollToBottom();
            }).catch((error) => {
                console.error('Error loading history on resume:', error);
                // Fallback: show current thread messages
                const messages = getMessagesFromThreads([chat.thread]);
                messages.forEach((message) => DOMOperations.appendMessage(message));
                DOMOperations.scrollToBottom();
            });
        } else {
            // New chat - just show current thread messages
            const messages = getMessagesFromThreads([chat.thread]);
            messages.forEach((message) => DOMOperations.appendMessage(message));
            DOMOperations.scrollToBottom();
        }
    }

    // Notify backend API when user sends a message
    function notifyBackend() {
        if (!config.baseURL || !state.chat) {
            console.log('Skipping backend notification - missing baseURL or chat_id');
            return;
        }

        const payload = {
            chat_id: state.chat,
            thread_id: state.thread
        };

        console.log('Notifying backend API:', config.baseURL, payload);

        fetch(config.baseURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })
        .then(response => {
            if (response.ok) {
                console.log('Backend API notified successfully');
            } else {
                console.warn('Backend API notification failed with status:', response.status);
            }
        })
        .catch(error => {
            console.error('Backend API notification error:', error);
        });
    }

    // Send message
    function sendMessage(chat, id, text) {
        const message = { customId: id, text, type: 'message' };

        console.log('Sending message:', { chatId: chat, message });

        sdk.sendEvent({ chatId: chat, event: message }).then(
            (confirmedMessage) => {
                console.log('Message confirmed:', confirmedMessage);
                DOMOperations.confirmMessageAsSent(id);
                
                // Notify backend after message is confirmed
                notifyBackend();
            },
            (error) => {
                console.error('Message send failed:', error);
                DOMOperations.markAsFailedMessage(id);
            }
        );
    }

    // Start chat
    function startChat() {
        state.activating = true;
        
        const payload = {
            chat: {
                ...(state.chat && { id: state.chat }),
                thread: {
                    events: state.pendingMessages.map((pm) => ({
                        type: 'message',
                        text: pm.text,
                        customId: pm.messageId
                    }))
                }
            }
        };

        const action = state.chat ? sdk.resumeChat : sdk.startChat;
        const methodName = state.chat ? 'resumeChat' : 'startChat';
        
        console.log(`${methodName} - Starting/resuming chat:`, payload);
        
        action(payload)
            .then(({ chat }) => {
                console.log(`${methodName} - Success:`, chat);
                handleChatStart(chat);
            })
            .catch((error) => {
                console.error(`${methodName} - Failed:`, error);
                state.activating = false;
                state.pendingMessages.forEach(({ messageId }) =>
                    DOMOperations.markAsFailedMessage(messageId)
                );
                state.pendingMessages = [];
                DOMOperations.addSystemMessage('Failed to start chat. Please try again.');
            });
    }

    // Handle message input
    function handleMessage() {
        const text = DOMElements.input.value.trim();
        DOMElements.input.value = '';
        DOMElements.input.style.height = 'auto';

        if (!text) {
            return;
        }

        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        if (state.active) {
            sendMessage(state.chat, messageId, text);
            } else {
            if (!state.activating) {
                startChat();
            }
            state.pendingMessages.push({ messageId, text });
        }

        DOMOperations.appendMessage(
            DOMOperations.createMessage(messageId, text, 'customer')
        );
        DOMOperations.scrollToBottom();
    }

    // Handle pre-chat form
    function handlePreChatForm() {
        const name = DOMElements.preChatName.value.trim();

        console.log('Pre-chat form submitted:', { name });

        if (!name) {
            console.warn('Pre-chat form validation failed');
            alert('Please enter your name');
            return;
        }

        state.activating = true;
        DOMElements.preChatSubmit.disabled = true;
        DOMElements.preChatSubmit.textContent = 'Starting chat...';

        // First update the customer name in the SDK
        console.log('Updating customer name to:', name);
        sdk.updateCustomer({ name })
            .then(() => {
                console.log('Customer name updated successfully');
                
                // Build payload - if chat exists, reactivate it; otherwise start new
                const payload = {
                    chat: {
                        ...(state.chat && { id: state.chat }),
                        thread: {
                            events: []
                        }
                    }
                };

                // Choose the appropriate SDK method
                const action = state.chat ? sdk.resumeChat : sdk.startChat;
                const methodName = state.chat ? 'resumeChat' : 'startChat';

                console.log(`${methodName} - ${state.chat ? 'Resuming' : 'Starting'} chat:`, payload);

                return action(payload);
            })
            .then(({ chat }) => {
                console.log('Chat started/resumed successfully:', chat);
                handleChatStart(chat);
                
                DOMElements.preChatSubmit.disabled = false;
                DOMElements.preChatSubmit.textContent = 'Start Chat';
            })
            .catch((error) => {
                console.error('Failed to start/resume chat:', error);
                state.activating = false;
                DOMElements.preChatSubmit.disabled = false;
                DOMElements.preChatSubmit.textContent = 'Start Chat';
                alert('Failed to start chat. Please try again.');
            });
    }

    // History loading
    function loadHistory(chat) {
        console.log('Loading more chat history for chat:', chat);
        
        return new Promise((resolve, reject) => {
            state.historyStatus = historyStates.LOADING;
            state.history.next().then(
                ({ value: { threads }, done }) => {
                    console.log('Chat history response received:', { threads, done });
                    
                    if (!threads) {
                        console.log('  ↳ No threads in response');
                        return;
                    }

                    const messages = getMessagesFromThreads(threads);
                    console.log(`  ↳ Loaded ${messages.length} messages from history`);
                    
                    const messageList = DOMElements.messages;

                    const fromTheBottom =
                        messageList.scrollHeight -
                        (messageList.scrollTop + messageList.clientHeight);

                    DOMOperations.prependMessages(messages);

                    messageList.scrollTop =
                        messageList.scrollHeight - messageList.clientHeight - fromTheBottom;

                    state.historyStatus = done
                        ? historyStates.DONE
                        : historyStates.INACTIVE;
                    
                    console.log(`  ↳ History status: ${state.historyStatus}`);
                    resolve();
                },
                (err) => {
                    console.error('Error loading chat history:', err);
                    state.historyStatus = historyStates.INACTIVE;
                    reject(err);
                }
            );
        });
    }

    function getMessagesFromThreads(threads) {
        return threads
            .map(({ events }) => events || [])
            .reduce((acc, current) => [...acc, ...current], [])
            .filter((event) => event.type === 'message')
            .map((event) => {
                const author = state.users[event.authorId];
                const timestamp = event.createdAt ? new Date(event.createdAt) : new Date();
                return DOMOperations.createMessage(
                    event.id,
                    event.text,
                    isAgent(author) ? 'agent' : 'customer',
                    author,
                    timestamp
                );
            });
    }

    function loadInitialHistory() {
        const chatId = state.chat;
        
        console.log('Initializing chat history iterator for chat:', chatId);
        state.history = sdk.getChatHistory({ chatId });

        const loadLatestHistory = () =>
            loadHistory(chatId).then(() => DOMOperations.scrollToBottom());

        return loadLatestHistory()
            .catch(() => {
                console.warn('First history load attempt failed, retrying...');
                return loadLatestHistory();
            })
            .catch((err) => {
                console.error('History loading failed after retry:', err);
                return noop();
            });
    }

    // Handle close/end chat
    function handleCloseChat() {
        // If there's an active chat, end it
        if (state.chat && state.active) {
            console.log('Ending chat:', state.chat);
            
            // Set flag to prevent chat_deactivated event from showing reconnect form
            // This flag will be checked and reset by the chat_deactivated event handler
            state.closingChat = true;
            
            // Keep messages visible, add system message and show "Resume chat" button
            // Do this BEFORE calling deactivateChat to ensure it happens before the event
            DOMOperations.addSystemMessage('Chat ended. Feel free to start a new conversation.');
            
            // Hide input area, show start chat button
            if (DOMElements.inputArea) {
                DOMElements.inputArea.style.display = 'none';
            }
            DOMOperations.showStartChatButton();
            DOMOperations.updateStartChatButtonText('Resume chat');
            
            sdk.deactivateChat({ id: state.chat })
                .then(() => {
                    console.log('Chat deactivated successfully');
                    state.active = false;
                    
                    // Reset state but KEEP chat ID so we can resume it
                    state.historyStatus = historyStates.INACTIVE;
                    state.history = null;
                    
                    // Note: closingChat flag is reset by chat_deactivated event handler
                })
                .catch((error) => {
                    console.error('Failed to deactivate chat:', error);
                    state.closingChat = false;
                    // Restore UI on failure
                    if (DOMElements.inputArea) {
                        DOMElements.inputArea.style.display = 'block';
                    }
                    DOMOperations.hideStartChatButton();
                });
        } else {
            // No active chat, just minimize
            DOMOperations.toggleMinimized();
        }
    }

    // Event handlers setup
    function setupEventHandlers() {
        // Chat bubble click
        DOMElements.bubble.onclick = () => {
            DOMOperations.toggleMinimized();
            // Scroll to bottom when opening chat (with small delay to ensure UI is rendered)
            setTimeout(() => {
                DOMOperations.scrollToBottom();
            }, 50);
        };

        // Sound toggle button
        if (DOMElements.soundToggle) {
            DOMElements.soundToggle.onclick = () => {
                soundEnabled = !soundEnabled;
                DOMElements.soundToggle.classList.toggle('sound-on', soundEnabled);
                DOMElements.soundToggle.classList.toggle('sound-off', !soundEnabled);
                console.log('Sound notification:', soundEnabled ? 'enabled' : 'disabled');
            };
        }

        // Minimize button
        DOMElements.minimizeButton.onclick = () => {
            DOMOperations.toggleMinimized();
        };

        // Close button - ends the chat
        DOMElements.closeButton.onclick = () => {
            handleCloseChat();
        };

        // Pre-chat form
        DOMElements.preChatSubmit.onclick = handlePreChatForm;

        // Start chat button (after chat ended)
        if (DOMElements.startChatBtn) {
            DOMElements.startChatBtn.onclick = () => {
                console.log('Resume chat button clicked - clearing messages and showing pre-chat form');
                state.waitingForReconnect = false;
                
                // Clear previous messages for a fresh start
                if (DOMElements.messages) {
                    DOMElements.messages.innerHTML = '';
                }
                
                DOMOperations.hideStartChatButton();
                DOMOperations.showPreChatForm();
            };
        }

        // Send button
        DOMElements.sendButton.onclick = handleMessage;

        // Input enter key
        DOMElements.input.onkeydown = (event) => {
            if (event.which === 13 && !event.shiftKey) {
                event.preventDefault();
                handleMessage();
            }
        };

        // Auto-resize textarea
        DOMElements.input.oninput = function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        };

        // Load more history on scroll
        DOMElements.messages.onscroll = () => {
            if (DOMElements.messages.scrollTop < 50 && 
                state.historyStatus === historyStates.INACTIVE) {
                loadHistory(state.chat).catch(noop);
            }
        };
    }

    // Initialize widget
    function init(options) {
        console.log('Initializing UoL Chat Widget...');
        console.log('Initial configuration:', config);
        
        // Merge options with config
        if (options) {
            console.log('Merging custom options:', options);
            Object.keys(options).forEach(key => {
                config[key] = options[key];
            });
        }

        console.log('Final configuration:', config);

        // Validate required config
        if (!config.organizationId || !config.clientId) {
            console.error('organizationId and clientId are required');
                return;
            }
            
        // Load dependencies
        loadCSS(() => {
            createWidgetHTML(() => {
                loadCustomerSDK(() => {
                    setupEventHandlers();
                    initializeSDK();
                });
            });
        });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        if (sdk && sdk.disconnect) {
            sdk.disconnect();
        }
    });

    // Expose to global scope
    window.UoLChatWidget = {
        init: init,
        getState: () => {
            console.log('Current State:', state);
            return state;
        },
        getSDK: () => {
            console.log('SDK Instance:', sdk);
            return sdk;
        },
        getConfig: () => {
            console.log('Configuration:', config);
            return config;
        },
        // Utility to see all current status
        debug: () => {
            console.log('=== DEBUG INFO ===');
            console.log('Configuration:', config);
            console.log('State:', state);
            console.log('SDK:', sdk);
            console.log('DOM Elements:', DOMElements);
            console.log('==================');
        }
    };

    console.log('UoL Chat Widget script loaded and ready');

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => init());
    } else {
        init();
    }

})(window, document);
