import { supabase } from "../../supabase/config.js";

class ChatApp {
constructor() {
    this.currentUser = null;
    this.chatPartner = null;
    this.userRole = null;
    this.chatRole = null; // Add this for chat-specific role
    this.hireId = new URLSearchParams(window.location.search).get("hire");
    this.reconnecting = false;
    this.reconnectAttempts = 0;
    this.intentionalClose = false;
    this.lastMessageTime = Date.now();
    
    this.initializeElements();
    this.bindEvents();
}

    initializeElements() {
        // Navigation elements
        this.sidebar = document.getElementById('sidebar');
        this.navMenu = document.getElementById('navMenu');
        this.menuToggle = document.getElementById('menuToggle');
        this.closeSidebar = document.getElementById('closeSidebar');
        
        // Header elements
        this.pageTitle = document.getElementById('pageTitle');
        this.pageSubtitle = document.getElementById('pageSubtitle');
        
        // Chat elements
        this.partnerName = document.getElementById('partnerName');
        this.partnerRole = document.getElementById('partnerRole');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messages = document.getElementById('messages');
        this.messageForm = document.getElementById('messageForm');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');

        this.connectionStatus = this.createConnectionStatus();

        // Add to your init() method or constructor
        this.lastRealtimeActivity = Date.now();
    }

    bindEvents() {
        // Navigation events
        this.menuToggle?.addEventListener('click', () => this.toggleSidebar());
        this.closeSidebar?.addEventListener('click', () => this.closeSidebarMenu());
        
        // Message form events
        this.messageForm?.addEventListener('submit', (e) => this.handleMessageSubmit(e));
        
        // Click outside sidebar to close
        document.addEventListener('click', (e) => this.handleOutsideClick(e));
        
        // Window resize
        window.addEventListener('resize', () => this.handleResize());
    }

async init() {
    if (!this.hireId) {
        this.showError("Invalid chat link. Missing hire ID.");
        return;
    }

    try {
        // Get current user
        const { data: { user }, error } = await supabase.auth.getUser();
        if (error || !user) throw new Error("Authentication required");
        
        this.currentUser = user;
        
        // Initialize theme toggle
        this.initThemeToggle();
        
        // Determine user role
        await this.determineUserRole();
        
        // Setup navigation
        await this.setupNavigation();
        await this.loadHireDetails();
        await this.loadMessages();
        
        // Use polling as primary until realtime is fixed
        this.setupPollingAsPrimary();
        
        // Setup button recovery for stuck states
        this.setupButtonRecovery();
        
        // Optional: Still try realtime, but don't depend on it
        setTimeout(() => {
            this.setupRealtimeSubscription();
        }, 2000);
        
    } catch (error) {
        console.error('Init error:', error);
        this.showError(error.message || "Failed to initialize chat");
    }
}

async determineUserRole() {
    if (!this.currentUser) return;

    try {
        // Simplified approach - get user role directly from users table
        const { data: userData, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', this.currentUser.id)
            .single();

        if (error) {
            console.warn('Error fetching user role:', error);
            // Fallback to user metadata
            this.userRole = this.currentUser.user_metadata?.role || 
                           this.currentUser.app_metadata?.role || 
                           'client';
            return;
        }

        if (userData) {
            this.userRole = userData.role;
        } else {
            // Fallback if no user record found
            this.userRole = this.currentUser.user_metadata?.role || 'client';
        }

        console.log('Determined user role:', this.userRole);

    } catch (error) {
        console.error('Error determining user role:', error);
        this.userRole = 'client'; // default fallback
    }
}

async setupNavigation() {
    if (!this.userRole) {
        console.error('User role not determined');
        return;
    }

    let navItems;
    
    if (this.userRole === 'admin') {
        // Admin users get access to both client and freelancer sections
        navItems = this.getAdminNav();
    } else if (this.userRole === 'client') {
        navItems = this.getClientNav();
    } else {
        navItems = this.getFreelancerNav();
    }

    if (this.navMenu) {
        this.navMenu.innerHTML = navItems;
    }

    this.updateLayout();
}

getAdminNav() {
    return `
        <li class="nav-item">
            <a href="../admin/dashboard.html" class="nav-link">
                <span class="nav-icon">📊</span>
                <span>Admin Dashboard</span>
            </a>
        </li>
        <li class="nav-item">
            <a href="../client/dashboard.html" class="nav-link">
                <span class="nav-icon">👨‍💼</span>
                <span>Client View</span>
            </a>
        </li>
        <li class="nav-item">
            <a href="../freelancer/dashboard.html" class="nav-link">
                <span class="nav-icon">👩‍💻</span>
                <span>Freelancer View</span>
            </a>
        </li>
        <li class="nav-item">
            <a href="../admin/users.html" class="nav-link">
                <span class="nav-icon">👥</span>
                <span>User Management</span>
            </a>
        </li>
        <li class="nav-item">
            <a href="../admin/messages.html" class="nav-link active">
                <span class="nav-icon">💬</span>
                <span>Messages</span>
            </a>
        </li>
        <li class="nav-item">
            <a href="../auth/logout.html" class="nav-link logout">
                <span class="nav-icon">🚪</span>
                <span>Logout</span>
            </a>
        </li>
    `;
}

    getClientNav() {
        return `
            <li class="nav-item">
                <a href="../client/dashboard.html" class="nav-link">
                    <span class="nav-icon">📊</span>
                    <span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/matches.html" class="nav-link">
                    <span class="nav-icon">🔍</span>
                    <span>Matches</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/hires.html" class="nav-link">
                    <span class="nav-icon">👥</span>
                    <span>My Hires</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/contracts.html" class="nav-link">
                    <span class="nav-icon">📝</span>
                    <span>Contracts</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../client/messages.html" class="nav-link active">
                    <span class="nav-icon">💬</span>
                    <span>Messages</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../auth/logout.html" class="nav-link logout">
                    <span class="nav-icon">🚪</span>
                    <span>Logout</span>
                </a>
            </li>
        `;
    }

    getFreelancerNav() {
        return `
            <li class="nav-item">
                <a href="../freelancer/dashboard.html" class="nav-link">
                    <span class="nav-icon">📊</span>
                    <span>Dashboard</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/portfolio.html" class="nav-link">
                    <span class="nav-icon">💼</span>
                    <span>Portfolio</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/jobs.html" class="nav-link">
                    <span class="nav-icon">🔍</span>
                    <span>Jobs</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/hires.html" class="nav-link">
                    <span class="nav-icon">👥</span>
                    <span>Hires</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../freelancer/messages.html" class="nav-link active">
                    <span class="nav-icon">💬</span>
                    <span>Messages</span>
                </a>
            </li>
            <li class="nav-item">
                <a href="../auth/logout.html" class="nav-link logout">
                    <span class="nav-icon">🚪</span>
                    <span>Logout</span>
                </a>
            </li>
        `;
    }

async loadHireDetails() {
    const { data: hire, error } = await supabase
        .from("hires")
        .select(`
            jobs(title),
            client:users!hires_client_id_fkey(full_name, id),
            freelancer:users!hires_freelancer_id_fkey(full_name, id)
        `)
        .eq("id", this.hireId)
        .single();

    if (error || !hire) throw new Error("Chat not found");

    // Determine user's role in this specific chat context
    let userChatRole = this.userRole;
    
    if (this.currentUser.id === hire.client.id) {
        this.chatPartner = hire.freelancer;
        userChatRole = 'client';
    } else if (this.currentUser.id === hire.freelancer.id) {
        this.chatPartner = hire.client;
        userChatRole = 'freelancer';
    } else if (this.userRole === 'admin') {
        // Admin users can access any chat - let them choose which side to appear as
        // Default to client view for admins
        this.chatPartner = hire.freelancer;
        userChatRole = 'client';
        console.log('Admin user accessing chat - defaulting to client view');
    } else {
        throw new Error("Access denied");
    }

    // Store the chat-specific role
    this.chatRole = userChatRole;

    this.updateChatHeader(hire, userChatRole);
    await this.loadPartnerAvatar();
}

updateChatHeader(hire, userChatRole) {
    if (this.pageTitle) this.pageTitle.textContent = `Chat with ${this.chatPartner.full_name}`;
    if (this.pageSubtitle) this.pageSubtitle.textContent = hire.jobs.title;
    
    if (this.partnerName) {
        let nameHtml = this.chatPartner.full_name;
        if (this.userRole === 'admin') {
            nameHtml += `<span class="admin-indicator">ADMIN</span>`;
        }
        this.partnerName.innerHTML = nameHtml;
    }
    
    if (this.partnerRole) {
        this.partnerRole.textContent = `${userChatRole === 'client' ? 'Freelancer' : 'Client'} • ${hire.jobs.title}`;
    }
}

    updateChatHeader(hire) {
        if (this.pageTitle) this.pageTitle.textContent = `Chat with ${this.chatPartner.full_name}`;
        if (this.pageSubtitle) this.pageSubtitle.textContent = hire.jobs.title;
        if (this.partnerName) this.partnerName.textContent = this.chatPartner.full_name;
        if (this.partnerRole) {
            this.partnerRole.textContent = `${this.userRole === 'client' ? 'Freelancer' : 'Client'} • ${hire.jobs.title}`;
        }
    }

    async loadMessages() {
        const { data: messages, error } = await supabase
            .from("messages")
            .select("*")
            .eq("hire_id", this.hireId)
            .order("created_at", { ascending: true });

        if (error) throw new Error("Failed to load messages");

        if (this.messages) {
            this.messages.innerHTML = '';

            if (!messages || messages.length === 0) {
                this.showEmptyState();
                return;
            }

            messages.forEach(message => this.appendMessage(message));
            this.scrollToBottom();
        }
    }

appendMessage(message) {
    if (!this.messages) return;

    const emptyState = this.messages.querySelector('.empty-chat');
    if (emptyState) emptyState.remove();

    // Check if message already exists to prevent duplicates
    if (message.id && this.isMessageDisplayed(message.id)) {
        console.log('Message already displayed, skipping:', message.id);
        return;
    }

    const messageEl = document.createElement('div');
    messageEl.className = `message ${message.sender_id === this.currentUser.id ? 'sent' : 'received'} ${message.isPending ? 'pending' : ''}`;
    
    // Store message data for duplicate detection and polling
    if (message.id) {
        messageEl.setAttribute('data-message-id', message.id);
    }
    messageEl.setAttribute('data-timestamp', message.created_at);
    
    if (message.isPending) {
        messageEl.setAttribute('data-temp-id', message.id);
    }

    const time = new Date(message.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    let statusIndicator = '';
    if (message.sender_id === this.currentUser.id) {
        if (message.isPending) {
            statusIndicator = '<div class="message-status">⏳</div>';
        } else {
            statusIndicator = '<div class="message-status">✓</div>';
        }
    }

    messageEl.innerHTML = `
        <div class="message-content">${this.escapeHtml(message.content)}</div>
        <div class="message-time">${time} ${statusIndicator}</div>
    `;

    this.messages.appendChild(messageEl);
    this.scrollToBottom();
    
    // Update last message time
    this.lastMessageTime = Date.now();
    
    // Add animation for new messages
    messageEl.classList.add('new-message');
    setTimeout(() => {
        messageEl.classList.remove('new-message');
    }, 300);
    
    console.log('Message appended:', message.id, message.content);
}

async handleMessageSubmit(e) {
    e.preventDefault();
    
    const content = this.messageInput.value.trim();
    if (!content) return;

    this.setSendButtonState(true);

    try {
        // Create optimistic UI update
        const tempMessage = {
            id: `temp-${Date.now()}`,
            hire_id: this.hireId,
            sender_id: this.currentUser.id,
            content: content,
            created_at: new Date().toISOString(),
            isPending: true
        };

        this.appendMessage(tempMessage);
        
        // Clear input immediately
        this.messageInput.value = '';
        
        // Reset form validation
        this.messageForm.reset();

        // Send to server
        const { data, error } = await supabase
            .from("messages")
            .insert({
                hire_id: this.hireId,
                sender_id: this.currentUser.id,
                content: content,
            })
            .select()
            .single();

        if (error) throw error;

        console.log('Message sent successfully:', data);
        
        // Replace temporary message with real one
        this.replaceTempMessage(tempMessage.id, data);
        
        await this.sendNotification();

        // ✅ CRITICAL: Reset send button state
        this.setSendButtonState(false);

    } catch (error) {
        console.error('Failed to send message:', error);
        this.showMessageError(tempMessage.id);
        // ✅ Reset send button state on error
        this.setSendButtonState(false);
    }
}

replaceTempMessage(tempId, realMessage) {
    const tempMessageEl = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (tempMessageEl) {
        // Remove the temporary message
        tempMessageEl.remove();
        console.log('Temporary message removed:', tempId);
    }
    
    // Add the real message from server
    this.appendMessage(realMessage);
    console.log('Real message added:', realMessage.id);
}

showMessageError(tempId) {
    const tempMessageEl = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (tempMessageEl) {
        tempMessageEl.classList.add('error');
        tempMessageEl.innerHTML = `
            <div class="message-content">Failed to send message</div>
            <div class="message-time">
                <button onclick="this.closest('.message').remove()" style="background: none; border: none; color: var(--error-color); text-decoration: underline; cursor: pointer;">
                    Retry
                </button>
            </div>
        `;
    }
}

setSendButtonState(sending) {
    if (!this.sendButton) return;
    
    this.sendButton.disabled = sending;
    
    if (sending) {
        this.sendButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".5"/>
                <path d="M20 12h2A10 10 0 0 0 12 2v2a8 8 0 0 1 8 8z">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </path>
            </svg>
        `;
        this.sendButton.setAttribute('aria-label', 'Sending message...');
    } else {
        this.sendButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
        `;
        this.sendButton.setAttribute('aria-label', 'Send message');
        console.log('Send button reset to normal state');
    }
}

removeTempMessage(tempId) {
    const tempMessage = document.querySelector(`[data-temp-id="${tempId}"]`);
    if (tempMessage) {
        tempMessage.remove();
    }
}

showMessageError() {
    const errorEl = document.createElement('div');
    errorEl.className = 'error message-error';
    errorEl.innerHTML = `
        <span>Failed to send message. </span>
        <button onclick="this.parentElement.remove()" style="margin-left: 8px; background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer;">
            Retry
        </button>
    `;
    
    const messageForm = document.querySelector('.message-input-form');
    messageForm.parentNode.insertBefore(errorEl, messageForm);
    
    setTimeout(() => {
        if (errorEl.parentNode) {
            errorEl.remove();
        }
    }, 5000);
}

async sendNotification() {
    const { data: hire } = await supabase
        .from("hires")
        .select("client_id, freelancer_id")
        .eq("id", this.hireId)
        .single();

    let recipientId;
    
    if (this.chatRole === 'client' || this.userRole === 'admin') {
        // If user is acting as client/admin, notify freelancer
        recipientId = hire.freelancer_id;
    } else {
        // If user is freelancer, notify client
        recipientId = hire.client_id;
    }

    await supabase.from("notifications").insert({
        user_id: recipientId,
        type: "message",
        message: `New message from ${this.currentUser.user_metadata?.full_name || 'User'}`,
    });
}

setupRealtimeSubscription() {
    try {
        console.log('Setting up realtime subscription for hire:', this.hireId);
        
        // Clean up existing channel first
        if (this.channel) {
            this.channel.unsubscribe();
            this.channel = null;
        }

        const channel = supabase
            .channel(`chat:${this.hireId}:${Date.now()}`, { // Add timestamp to make channel unique
                config: {
                    broadcast: { self: false },
                    presence: { key: this.currentUser.id }
                }
            })
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `hire_id=eq.${this.hireId}`
                },
                (payload) => {
                    console.log('New message received via realtime:', payload);
                    // Only append if message is not from current user
                    if (payload.new.sender_id !== this.currentUser.id) {
                        this.appendMessage(payload.new);
                    }
                }
            )
            .on('system', { event: '*' }, (payload) => {
                console.log('System event:', payload);
            })
            .subscribe((status, error) => {
                console.log('Realtime subscription status:', status, error);
                
                switch (status) {
                    case 'SUBSCRIBED':
                        console.log('✅ Successfully subscribed to realtime updates');
                        this.updateConnectionStatus('connected');
                        this.reconnectAttempts = 0; // Reset counter on success
                        break;
                    case 'CHANNEL_ERROR':
                        console.error('❌ Channel error:', error);
                        this.updateConnectionStatus('disconnected');
                        this.handleRealtimeError(error);
                        break;
                    case 'TIMED_OUT':
                        console.warn('⏰ Realtime timeout');
                        this.updateConnectionStatus('reconnecting');
                        this.attemptReconnect();
                        break;
                    case 'CLOSED':
                        console.warn('🔒 Realtime channel closed');
                        this.updateConnectionStatus('disconnected');
                        // Only attempt reconnect if it wasn't intentional
                        if (!this.intentionalClose) {
                            this.attemptReconnect();
                        }
                        break;
                }
            });

        this.channel = channel;
        this.intentionalClose = false;

    } catch (error) {
        console.error('Failed to setup realtime subscription:', error);
        this.attemptReconnect();
    }
}

attemptReconnect() {
    // Prevent multiple reconnection attempts and limit retries
    if (this.reconnecting) return;
    
    this.reconnectAttempts = (this.reconnectAttempts || 0) + 1;
    
    if (this.reconnectAttempts > 5) {
        console.error('Max reconnection attempts reached. Giving up.');
        this.updateConnectionStatus('disconnected');
        this.showError('Connection lost. Please refresh the page.');
        return;
    }
    
    this.reconnecting = true;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff
    
    console.log(`Attempting to reconnect in ${delay/1000} seconds... (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
        this.reconnecting = false;
        if (this.channel) {
            this.intentionalClose = true;
            this.channel.unsubscribe();
        }
        this.setupRealtimeSubscription();
    }, delay);
}

// Add reconnection logic
attemptReconnect() {
    console.log('Attempting to reconnect...');
    setTimeout(() => {
        if (this.channel) {
            this.channel.unsubscribe();
        }
        this.setupRealtimeSubscription();
    }, 3000);
}

    // UI Methods
    toggleSidebar() {
        if (this.sidebar) {
            this.sidebar.classList.toggle('open');
        }
    }

    closeSidebarMenu() {
        if (this.sidebar) {
            this.sidebar.classList.remove('open');
        }
    }

    handleOutsideClick(e) {
        if (this.sidebar && this.sidebar.classList.contains('open') && 
            this.menuToggle && !this.sidebar.contains(e.target) && 
            !this.menuToggle.contains(e.target)) {
            this.closeSidebarMenu();
        }
    }

    handleResize() {
        if (window.innerWidth > 768) {
            this.closeSidebarMenu();
        }
        this.updateLayout();
    }

    updateLayout() {
        if (!this.sidebar) return;
        
        if (window.innerWidth > 768) {
            this.sidebar.style.transform = 'translateX(0)';
        } else {
            if (!this.sidebar.classList.contains('open')) {
                this.sidebar.style.transform = 'translateX(-100%)';
            }
        }
    }

    scrollToBottom() {
        setTimeout(() => {
            if (this.messagesContainer) {
                this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
            }
        }, 100);
    }

    setSendButtonState(sending) {
        if (!this.sendButton) return;
        
        this.sendButton.disabled = sending;
        this.sendButton.innerHTML = sending ? 
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".5"/><path d="M20 12h2A10 10 0 0 0 12 2v2a8 8 0 0 1 8 8z"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/></path></svg>' :
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
    }

    showEmptyState() {
        if (!this.messages) return;
        
        this.messages.innerHTML = `
            <div class="empty-chat">
                <h3>No messages yet</h3>
                <p>Start the conversation by sending a message!</p>
            </div>
        `;
    }

    showError(message) {
        if (!this.messages) return;
        
        this.messages.innerHTML = `<div class="error">${message}</div>`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }


    // Add this method to the ChatApp class
initThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const themeLabel = themeToggle.querySelector('.theme-label');
    
    // Check for saved theme or prefer-color-scheme
    const savedTheme = localStorage.getItem('chat-theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    
    if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        document.documentElement.setAttribute('data-theme', 'light');
        themeIcon.textContent = '🌙';
        themeLabel.textContent = 'Dark Mode';
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        themeIcon.textContent = '☀️';
        themeLabel.textContent = 'Light Mode';
    }
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        
        if (currentTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'dark');
            themeIcon.textContent = '☀️';
            themeLabel.textContent = 'Light Mode';
            localStorage.setItem('chat-theme', 'dark');
        } else {
            document.documentElement.setAttribute('data-theme', 'light');
            themeIcon.textContent = '🌙';
            themeLabel.textContent = 'Dark Mode';
            localStorage.setItem('chat-theme', 'light');
        }
    });
}


async loadPartnerAvatar() {
  if (!this.chatPartner || !this.chatPartner.id) return;

  const avatarEl = document.querySelector(".partner-avatar");
  if (!avatarEl) return;

  try {
    // Show loading state
    avatarEl.classList.add('loading');
    
    // Fetch partner's profile picture path from users table
    const { data, error } = await supabase
      .from("users")
      .select("profile_picture")
      .eq("id", this.chatPartner.id)
      .single();

    if (error || !data) {
      throw new Error("No profile picture found");
    }

    if (data.profile_picture) {
      // If profile picture stored in storage, get public URL
      const { data: publicUrl } = supabase.storage
        .from("profile_pictures")
        .getPublicUrl(data.profile_picture);

      if (publicUrl?.publicUrl) {
        // Create image element to handle loading
        const img = new Image();
        img.src = publicUrl.publicUrl;
        img.alt = "Partner Avatar";
        img.className = "avatar-img";
        
        img.onload = () => {
          avatarEl.innerHTML = '';
          avatarEl.appendChild(img);
          avatarEl.classList.remove('loading');
        };
        
        img.onerror = () => {
          avatarEl.classList.remove('loading');
          avatarEl.classList.add('error');
          console.error("Failed to load avatar image");
        };
      } else {
        throw new Error("No public URL available");
      }
    } else {
      throw new Error("No profile picture set");
    }
  } catch (err) {
    console.error("Error loading partner avatar:", err);
    avatarEl.classList.remove('loading');
    avatarEl.classList.add('error');
  }
}


// Add to initializeElements()

// New method
createConnectionStatus() {
    const statusEl = document.createElement('div');
    statusEl.className = 'connection-status';
    statusEl.textContent = 'Connecting...';
    document.body.appendChild(statusEl);
    return statusEl;
}

// Update connection status
updateConnectionStatus(status) {
    if (!this.connectionStatus) return;
    
    this.connectionStatus.className = `connection-status ${status}`;
    
    switch(status) {
        case 'connected':
            this.connectionStatus.textContent = '🟢 Connected';
            break;
        case 'disconnected':
            this.connectionStatus.textContent = '🔴 Disconnected';
            break;
        case 'reconnecting':
            this.connectionStatus.textContent = '🟡 Reconnecting...';
            break;
    }
    
    // Auto-hide connected status after 3 seconds
    if (status === 'connected') {
        setTimeout(() => {
            if (this.connectionStatus.classList.contains('connected')) {
                this.connectionStatus.style.opacity = '0';
            }
        }, 3000);
    } else {
        this.connectionStatus.style.opacity = '1';
    }
}


setupHealthCheck() {
    // Light health check - only check if we suspect issues
    this.healthCheckInterval = setInterval(() => {
        const timeSinceLastMessage = Date.now() - (this.lastMessageTime || 0);
        
        // If no messages for 2 minutes and realtime says connected, do a quick check
        if (timeSinceLastMessage > 120000 && this.isRealtimeConnected()) {
            this.quickHealthCheck();
        }
    }, 60000); // Check every minute
}

async quickHealthCheck() {
    try {
        // Very lightweight check - just test if we can reach Supabase
        const { error } = await supabase
            .from('messages')
            .select('id')
            .limit(1)
            .maybeSingle(); // Use maybeSingle to avoid errors if no rows

        if (error) {
            console.warn('Health check failed:', error);
            this.updateConnectionStatus('disconnected');
        } else {
            this.updateConnectionStatus('connected');
        }
    } catch (error) {
        console.warn('Health check error:', error);
    }
}

// Add to ChatApp class
destroy() {
    if (this.channel) {
        this.channel.unsubscribe();
    }
    if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
    }
}


// Add to your ChatApp class
setupPollingFallback() {
    // Only poll if realtime fails - check every 10 seconds
    this.pollingInterval = setInterval(async () => {
        // Only use polling if realtime is not connected for more than 30 seconds
        if (this.isRealtimeConnected()) {
            this.lastRealtimeActivity = Date.now();
            return;
        }
        
        const timeSinceRealtime = Date.now() - (this.lastRealtimeActivity || 0);
        
        if (timeSinceRealtime > 30000) { // 30 seconds without realtime
            console.log('Realtime disconnected, using polling fallback');
            await this.checkForNewMessages();
        }
    }, 10000);
}

async checkForNewMessages() {
    try {
        if (this.isRealtimeConnected()) {
            console.log('Realtime connected, skipping polling');
            return; // Skip if realtime is working
        }
        
        const lastMessage = this.getLastMessage();
        let lastMessageTime;
        
        if (lastMessage && lastMessage.timestamp) {
            lastMessageTime = lastMessage.timestamp;
        } else {
            // If no messages or invalid timestamp, check from 5 minutes ago
            lastMessageTime = new Date(Date.now() - 5 * 60000).toISOString();
        }
        
        console.log('Polling for messages since:', lastMessageTime);
        
        const { data: newMessages, error } = await supabase
            .from("messages")
            .select("*")
            .eq("hire_id", this.hireId)
            .gt("created_at", lastMessageTime)
            .order("created_at", { ascending: true });

        if (error) {
            console.error('Error checking new messages:', error);
            return;
        }

        if (newMessages && newMessages.length > 0) {
            console.log(`Found ${newMessages.length} new messages via polling`);
            newMessages.forEach(message => {
                // Only add messages not from current user and not already displayed
                if (message.sender_id !== this.currentUser.id && 
                    !this.isMessageDisplayed(message.id)) {
                    this.appendMessage(message);
                }
            });
        }
    } catch (error) {
        console.warn('Polling failed:', error);
    }
}

isMessageDisplayed(messageId) {
    // Check if a message with this ID is already displayed
    return !!document.querySelector(`[data-message-id="${messageId}"]`);
}

getLastMessage() {
    const messageElements = this.messages?.querySelectorAll('.message:not(.pending)');
    if (!messageElements || messageElements.length === 0) return null;
    
    // Get the last message element
    const lastMessageEl = messageElements[messageElements.length - 1];
    const timeElement = lastMessageEl.querySelector('.message-time');
    
    if (timeElement) {
        // Extract time from the displayed text
        const timeText = timeElement.textContent.trim();
        const timeParts = timeText.split(' ');
        
        if (timeParts.length > 0) {
            // Create a date from the time string (this is approximate)
            const now = new Date();
            const timeString = timeParts[0]; // Get just the time part (e.g., "2:30 PM")
            
            // Parse the time and create a full date
            const messageTime = new Date(now.toDateString() + ' ' + timeString);
            
            // If the parsed time is in the future, assume it was from yesterday
            if (messageTime > now) {
                messageTime.setDate(messageTime.getDate() - 1);
            }
            
            return {
                timestamp: messageTime.toISOString()
            };
        }
    }
    
    // Fallback: return a timestamp from 1 minute ago
    const oneMinuteAgo = new Date(Date.now() - 60000);
    return {
        timestamp: oneMinuteAgo.toISOString()
    };
}

isRealtimeConnected() {
    return this.channel && this.connectionStatus?.classList.contains('connected');
}



handleRealtimeError(error) {
    console.error('Realtime error details:', error);
    
    if (error?.message?.includes('bindings')) {
        console.warn('Realtime bindings mismatch - this is usually temporary');
        // Wait a bit longer before reconnecting for binding issues
        setTimeout(() => {
            this.attemptReconnect();
        }, 5000);
    } else if (error?.message?.includes('auth')) {
        console.error('Authentication issue with realtime');
        // Try to refresh auth token
        this.refreshAuth();
    } else {
        console.error('Unknown realtime error, reconnecting...');
        this.attemptReconnect();
    }
}

async refreshAuth() {
    try {
        const { data, error } = await supabase.auth.refreshSession();
        if (error) throw error;
        console.log('Auth token refreshed');
        this.attemptReconnect();
    } catch (error) {
        console.error('Failed to refresh auth:', error);
        this.showError('Authentication issue - please refresh the page');
    }
}

attemptReconnect() {
    // Prevent multiple reconnection attempts
    if (this.reconnecting) return;
    
    this.reconnecting = true;
    console.log('Attempting to reconnect in 3 seconds...');
    
    setTimeout(() => {
        this.reconnecting = false;
        if (this.channel) {
            this.channel.unsubscribe();
        }
        this.setupRealtimeSubscription();
    }, 3000);
}


setupPollingAsPrimary() {
    console.log('Using polling as primary message delivery method');
    
    // Clear any existing intervals
    if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
    }
    
    // Poll every 2 seconds for real-time feel
    this.pollingInterval = setInterval(async () => {
        await this.checkForNewMessages();
    }, 2000);
    
    // Also do an immediate check
    this.checkForNewMessages();
}

async checkForNewMessages() {
    try {
        // Get the latest message timestamp we have
        const lastMessageTime = this.getLastMessageTime();
        
        const { data: newMessages, error } = await supabase
            .from("messages")
            .select("*")
            .eq("hire_id", this.hireId)
            .gt("created_at", lastMessageTime)
            .order("created_at", { ascending: true });

        if (error) {
            console.error('Error checking new messages:', error);
            return;
        }

        if (newMessages && newMessages.length > 0) {
            console.log(`Found ${newMessages.length} new messages via polling`);
            newMessages.forEach(message => {
                // Only add messages not from current user and not already displayed
                if (!this.isMessageDisplayed(message.id)) {
                    this.appendMessage(message);
                }
            });
        }
    } catch (error) {
        console.warn('Polling failed:', error);
    }
}

getLastMessageTime() {
    const messageElements = this.messages?.querySelectorAll('.message:not(.pending)');
    if (!messageElements || messageElements.length === 0) {
        // If no messages, return a timestamp from 1 hour ago
        return new Date(Date.now() - 3600000).toISOString();
    }
    
    // Get the last message element and extract timestamp from data attribute
    const lastMessageEl = messageElements[messageElements.length - 1];
    return lastMessageEl.dataset.timestamp || new Date(Date.now() - 60000).toISOString();
}

isMessageDisplayed(messageId) {
    return !!document.querySelector(`[data-message-id="${messageId}"]`);
}

// Add event listener for page unload


setupButtonRecovery() {
    // Check every 10 seconds if button is stuck in loading state
    setInterval(() => {
        if (this.sendButton && this.sendButton.disabled) {
            const loadingSVG = this.sendButton.querySelector('svg animateTransform');
            if (loadingSVG) {
                // Button is still showing loading animation
                const disabledTime = this.sendButtonDisabledSince || Date.now();
                const timeDisabled = Date.now() - disabledTime;
                
                if (timeDisabled > 10000) { // 10 seconds
                    console.warn('Send button stuck in loading state for 10+ seconds, resetting...');
                    this.setSendButtonState(false);
                }
            }
        }
    }, 10000);
}

// Update setSendButtonState to track when it was disabled
setSendButtonState(sending) {
    if (!this.sendButton) return;
    
    this.sendButton.disabled = sending;
    
    if (sending) {
        this.sendButtonDisabledSince = Date.now();
        this.sendButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" opacity=".5"/>
                <path d="M20 12h2A10 10 0 0 0 12 2v2a8 8 0 0 1 8 8z">
                    <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="1s" repeatCount="indefinite"/>
                </path>
            </svg>
        `;
        this.sendButton.setAttribute('aria-label', 'Sending message...');
    } else {
        this.sendButtonDisabledSince = null;
        this.sendButton.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
        `;
        this.sendButton.setAttribute('aria-label', 'Send message');
        console.log('Send button reset to normal state');
    }
}
}

// Global function for back button

// Initialize the chat app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const chatApp = new ChatApp();
    chatApp.init();
});

document.addEventListener('DOMContentLoaded', () => {
    const chatApp = new ChatApp();
    chatApp.init();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        chatApp.destroy();
    });
});

