// =========================
// GLOBAL VARIABLES & CONFIG
// =========================
const CONFIG = {
    // Counter animation
    counterDuration: 2000,
    counterSteps: 50,
    
    // Scroll effects
    scrollOffset: 100,
    scrollThreshold: 100,
    
    // Animation delays
    staggerDelay: 100,
    
    // Statistics (demo data - replace with real data)
    stats: {
        freelancers: 1250,
        jobs: 890,
        matches: 2100
    }
};

// =========================
// DOM ELEMENTS
// =========================
const elements = {
    // Navigation
    mobileNav: document.getElementById('mobileNav'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    mobileCloseBtn: document.getElementById('mobileCloseBtn'),
    desktopNav: document.querySelector('.desktop-nav'),
    
    // Counters
    statNumbers: document.querySelectorAll('[data-stat]'),
    
    // Back to top
    backToTop: document.getElementById('backToTop'),
    
    // FAQ
    faqItems: document.querySelectorAll('.faq-item'),
    
    // Banner
    earlyAccessBanner: document.getElementById('earlyAccessBanner'),
    joinEarlyBtn: document.getElementById('joinEarlyBtn'),
    
    // Loader
    loader: document.getElementById('loader'),
    
    // Newsletter
    newsletterForm: document.getElementById('newsletterForm'),
    
    // Header
    mainHeader: document.querySelector('.main-header')
};

// =========================
// INITIALIZATION
// =========================
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
});

function initializeApp() {
    // Initialize all components
    initNavigation();
    initCounters();
    initScrollEffects();
    initFAQ();
    initBanner();
    initNewsletter();
    initAnimations();
    
    // Set current year in footer
    document.getElementById('year').textContent = new Date().getFullYear();
    
    console.log('🚀 Tasknory initialized successfully');
}

// =========================
// NAVIGATION
// =========================
function initNavigation() {
    // Mobile menu toggle
    if (elements.mobileMenuBtn) {
        elements.mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }
    
    if (elements.mobileCloseBtn) {
        elements.mobileCloseBtn.addEventListener('click', toggleMobileMenu);
    }
    
    // Close mobile menu when clicking on links
    const mobileLinks = document.querySelectorAll('.mobile-nav-links a');
    mobileLinks.forEach(link => {
        link.addEventListener('click', () => {
            elements.mobileNav.classList.remove('active');
            document.body.style.overflow = '';
        });
    });
    
    // Smooth scrolling for desktop navigation
    if (elements.desktopNav) {
        const desktopLinks = elements.desktopNav.querySelectorAll('a[href^="#"]');
        desktopLinks.forEach(link => {
            link.addEventListener('click', smoothScroll);
        });
    }
}

function toggleMobileMenu() {
    const isActive = elements.mobileNav.classList.toggle('active');
    document.body.style.overflow = isActive ? 'hidden' : '';
    
    // Add animation class for entrance
    if (isActive) {
        elements.mobileNav.style.animation = 'slideInLeft 0.3s ease-out';
    }
}

// =========================
// SMOOTH SCROLLING
// =========================
function smoothScroll(e) {
  e.preventDefault();
  const target = document.querySelector(this.getAttribute('href'));
  if (!target) return;

  const headerHeight = elements.mainHeader?.offsetHeight || 64;
  const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

  window.scrollTo({ top, behavior: 'smooth' });
}

// =========================
// COUNTER ANIMATION
// =========================
function initCounters() {
    if (!elements.statNumbers.length) return;
    
    // Create intersection observer for counters
    const counterObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounters();
                counterObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    // Observe the first counter (they're all in the same section)
    if (elements.statNumbers[0]) {
        counterObserver.observe(elements.statNumbers[0].closest('.hero-stats'));
    }
}

function animateCounters() {
    elements.statNumbers.forEach((element, index) => {
        const statType = element.getAttribute('data-stat');
        const targetValue = CONFIG.stats[statType] || 0;
        
        // Add slight delay for staggered animation
        setTimeout(() => {
            animateCounter(element, targetValue);
        }, index * 200);
    });
}

function animateCounter(element, targetValue) {
    let currentValue = 0;
    const increment = targetValue / CONFIG.counterSteps;
    const duration = CONFIG.counterDuration / CONFIG.counterSteps;
    
    const timer = setInterval(() => {
        currentValue += increment;
        
        if (currentValue >= targetValue) {
            currentValue = targetValue;
            clearInterval(timer);
        }
        
        // Format number with commas
        element.textContent = Math.floor(currentValue).toLocaleString();
    }, duration);
}

// =========================
// SCROLL EFFECTS
// =========================
function initScrollEffects() {
    // Back to top button
    window.addEventListener('scroll', throttle(handleScroll, 100));
    
    // Header scroll effect
    window.addEventListener('scroll', throttle(toggleHeaderShadow, 100));
    
    // Initialize scroll animations

}

function handleScroll() {
    const scrollPosition = window.scrollY;
    
    // Back to top button
    if (elements.backToTop) {
        if (scrollPosition > 500) {
            elements.backToTop.classList.add('visible');
        } else {
            elements.backToTop.classList.remove('visible');
        }
    }
    
    // Early access banner
}

function toggleHeaderShadow() {
    if (elements.mainHeader) {
        if (window.scrollY > 50) {
            elements.mainHeader.classList.add('scrolled');
        } else {
            elements.mainHeader.classList.remove('scrolled');
        }
    }
}

// Back to top functionality
if (elements.backToTop) {
    elements.backToTop.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// =========================
// FAQ FUNCTIONALITY
// =========================
function initFAQ() {
  if (!elements.faqItems.length) return;

  elements.faqItems.forEach(card => {
    const question = card.querySelector('.faq-question');

    question.addEventListener('click', () => toggleFAQ(card));
    question.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleFAQ(card);
      }
    });
  });
}

function toggleFAQ(targetCard) {
  const wasOpen = targetCard.classList.contains('active');

  // close all
  elements.faqItems.forEach(c => c.classList.remove('active'));

  // open clicked if it wasn't open
  if (!wasOpen) targetCard.classList.add('active');
}

// =========================
// BANNER FUNCTIONALITY
// =========================
// =========================
// BANNER FUNCTIONALITY  –  5 s quiet-scroll → show 60 s → hide 60 s → loop
// =========================
// =========================
// BANNER – 30 s only, never again
// =========================
function initBanner() {
    if (!elements.earlyAccessBanner || !elements.joinEarlyBtn) return;

    const SHOW_TIME = 1_000; // 30 seconds

    /* show banner once after 5 s of quiet scroll */
    let scrollTimer;
    window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(() => showOnce(), 1000);
    }, { passive: true });
    scrollTimer = setTimeout(showOnce, 1000);

    function showOnce() {
        elements.earlyAccessBanner.classList.add('visible');
        setTimeout(() => {
            elements.earlyAccessBanner.classList.remove('visible');
            // remove listeners so it never comes back
            window.removeEventListener('scroll', showOnce);
            clearTimeout(scrollTimer);
        }, SHOW_TIME);
    }

    /* click → redirect and kill banner immediately */
    elements.joinEarlyBtn.addEventListener('click', () => {
        clearTimeout(scrollTimer);
        elements.earlyAccessBanner.classList.remove('visible');
        window.location.href = 'signup.html?source=early_access';
    });
}

function handleEarlyAccessSignup() {
    // Show loading state
    const originalText = elements.joinEarlyBtn.textContent;
    elements.joinEarlyBtn.textContent = 'Redirecting...';
    elements.joinEarlyBtn.disabled = true;
    
    // Simulate API call or redirect
    setTimeout(() => {
        window.location.href = 'signup.html?source=early_access';
    }, 1000);
}

// =========================
// NEWSLETTER FUNCTIONALITY
// =========================
function initNewsletter() {
    if (elements.newsletterForm) {
        elements.newsletterForm.addEventListener('submit', handleNewsletterSubmit);
    }
}

function handleNewsletterSubmit(e) {
    e.preventDefault();
    
    const emailInput = document.getElementById('newsletterEmail');
    const email = emailInput.value.trim();
    
    if (!isValidEmail(email)) {
        showNotification('Please enter a valid email address', 'error');
        return;
    }
    
    // Show loading state
    const submitButton = elements.newsletterForm.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Subscribing...';
    submitButton.disabled = true;
    
    // Simulate API call
    setTimeout(() => {
        showNotification('Successfully subscribed to newsletter!', 'success');
        elements.newsletterForm.reset();
        submitButton.textContent = originalText;
        submitButton.disabled = false;
    }, 1500);
}

function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// =========================
// ANIMATIONS
// =========================
function initAnimations() {
    // Initialize intersection observer for scroll animations
    const animationObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animated');
                
                // Add staggered animation for children
                const animatedChildren = entry.target.querySelectorAll('.animate-on-scroll');
                animatedChildren.forEach((child, index) => {
                    child.style.animationDelay = `${index * 0.1}s`;
                    child.classList.add('animated');
                });
            }
        });
    }, {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    });
    
    // Observe elements that should animate on scroll
    const animatedSections = document.querySelectorAll('.problem-section, .solution-section, .features-section, .evolution-section, .top-freelancers, .join-section, .faq-section, .investor-section');
    animatedSections.forEach(section => {
        animationObserver.observe(section);
    });
    
    // Add animation classes to specific elements
    const animatedElements = document.querySelectorAll('.solution-card, .feature-card, .freelancer-card, .timeline-step');
    animatedElements.forEach(element => {
        element.classList.add('animate-on-scroll');
    });
}

// =========================
// NOTIFICATION SYSTEM
// =========================
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-message">${message}</span>
            <button class="notification-close">&times;</button>
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
        z-index: 10000;
        transform: translateX(400px);
        transition: transform 0.3s ease;
        max-width: 400px;
    `;
    
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Close button functionality
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
        hideNotification(notification);
    });
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        hideNotification(notification);
    }, 5000);
}

function hideNotification(notification) {
    notification.style.transform = 'translateX(400px)';
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 300);
}

// =========================
// PERFORMANCE OPTIMIZATIONS
// =========================
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

function debounce(func, wait, immediate) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        const later = function() {
            timeout = null;
            if (!immediate) func.apply(context, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
    };
}

// =========================
// ERROR HANDLING
// =========================
function handleError(error, context = 'Unknown context') {
    console.error(`Error in ${context}:`, error);
    
    // You can send errors to your error tracking service here
    // Example: Sentry.captureException(error);
}

// Global error handler
window.addEventListener('error', (e) => {
    handleError(e.error, 'Global error handler');
});

// Promise rejection handler
window.addEventListener('unhandledrejection', (e) => {
    handleError(e.reason, 'Unhandled promise rejection');
});

// =========================
// PERFORMANCE MONITORING
// =========================
function monitorPerformance() {
    // Log page load time
    window.addEventListener('load', () => {
        const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
        console.log(`Page loaded in ${loadTime}ms`);
        
        // You can send this to your analytics service
        // Example: analytics.track('page_load_time', loadTime);
    });
}

// Initialize performance monitoring
monitorPerformance();

// =========================
// ADDITIONAL ANIMATIONS CSS
// =========================
function injectAdditionalStyles() {
    const additionalStyles = `
        @keyframes slideInLeft {
            from {
                transform: translateX(-100%);
            }
            to {
                transform: translateX(0);
            }
        }
        
        .animate-on-scroll {
            opacity: 0;
            transform: translateY(30px);
            transition: all 0.6s ease;
        }
        
        .animate-on-scroll.animated {
            opacity: 1;
            transform: translateY(0);
        }
        
        .notification-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
        }
        
        .notification-close {
            background: none;
            border: none;
            color: white;
            font-size: 1.25rem;
            cursor: pointer;
            padding: 0;
            width: 24px;
            height: 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            transition: background-color 0.2s ease;
        }
        
        .notification-close:hover {
            background: rgba(255, 255, 255, 0.2);
        }
    `;
    
    const styleSheet = document.createElement('style');
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);
}

// Inject additional styles
injectAdditionalStyles();

// =========================
// EXPORTS FOR MODULAR USE
// =========================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        CONFIG,
        initializeApp,
        showNotification,
        handleError
    };
}

