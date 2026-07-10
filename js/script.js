import { supabase } from "./supabase.js";
import { initRouter, navigate } from './router.js';
import { initAuth } from './auth.js';
import { initUI } from './ui.js';
import { initRealtime } from './store.js';

let deferredInstallPrompt = null;
const INSTALL_DISMISSED_KEY = 'devlog-install-dismissed-at';
const INSTALL_DISMISS_DAYS = 7;

function initPwaInstall() {
    const promptCard = document.getElementById('install-prompt');
    const installButton = document.getElementById('install-app-btn');
    const closeButton = document.getElementById('install-prompt-close');

    if (!promptCard || !installButton) return;

    const hidePrompt = () => {
        promptCard.hidden = true;
        promptCard.classList.remove('show');
    };

    const showPrompt = () => {
        promptCard.hidden = false;
        requestAnimationFrame(() => promptCard.classList.add('show'));
    };

    if (isInstalledDisplayMode()) {
        hidePrompt();
        return;
    }

    closeButton?.addEventListener('click', () => {
        localStorage.setItem(INSTALL_DISMISSED_KEY, String(Date.now()));
        hidePrompt();
    });

    installButton.addEventListener('click', async () => {
        if (!deferredInstallPrompt) return;

        installButton.disabled = true;
        deferredInstallPrompt.prompt();

        try {
            await deferredInstallPrompt.userChoice;
        } finally {
            deferredInstallPrompt = null;
            installButton.disabled = false;
            hidePrompt();
        }
    });

    window.addEventListener('beforeinstallprompt', (event) => {
        if (isInstalledDisplayMode() || wasInstallPromptRecentlyDismissed()) return;

        event.preventDefault();
        deferredInstallPrompt = event;
        showPrompt();
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        hidePrompt();
    });
}

function isInstalledDisplayMode() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function wasInstallPromptRecentlyDismissed() {
    const dismissedAt = Number(localStorage.getItem(INSTALL_DISMISSED_KEY) || 0);
    if (!dismissedAt) return false;

    const daysSinceDismissed = (Date.now() - dismissedAt) / 86400000;
    return daysSinceDismissed < INSTALL_DISMISS_DAYS;
}

function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
            .then((registration) => registration.update())
            .catch((error) => {
                console.warn('Service worker registration failed:', error);
            });
    });
}
async function initApp() {
    // Init theme
    const savedTheme = localStorage.getItem('devlog-theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // PWA install should be ready before auth/network work can delay startup.
    initPwaInstall();
    registerServiceWorker();

    await initAuth();
    initUI();
    initRouter();

    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });

        navLinks.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('open');
            });
        });
    }

    // Nav user button
    const navUserBtn = document.getElementById('nav-user-btn');
    if (navUserBtn) {
        navUserBtn.addEventListener('click', () => navigate('/settings'));
    }

    // Theme toggle (navbar)
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            document.documentElement.toggleAttribute('data-theme', !isDark);
            // ↑ مبسّطة، أو استخدم النسخة الأصلية لو toggleAttribute ما ينفع مع القيم
            if (isDark) {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('devlog-theme', 'light');
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('devlog-theme', 'dark');
            }
        });
    }

    // Dark mode toggle (settings page)
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';
        darkModeToggle.addEventListener('change', () => {
            if (darkModeToggle.checked) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('devlog-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('devlog-theme', 'light');
            }
        });
    }
}

initApp();
