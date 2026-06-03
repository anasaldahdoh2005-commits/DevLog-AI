import { supabase } from "./supabase.js";

console.log("Supabase client:", supabase);

// DevLog AI - Main Entry Point
import { initRouter, navigate } from './router.js';
import { initAuth, getCurrentUser } from './auth.js';
import { initUI } from './ui.js';

// Initialize the application
async function initApp() {
    // Init theme
    const savedTheme = localStorage.getItem('devlog-theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Init auth
    await initAuth();

    // Init UI event listeners
    initUI();

    // Init router
    initRouter();

    // Mobile menu
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('nav-links');
    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('open');
        });
    }

    // Close mobile menu on link click
    navLinks.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('open');
        });
    });

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('devlog-theme', 'light');
        } else {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('devlog-theme', 'dark');
        }
    });

    // Dark mode toggle in settings
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

// Start the app
initApp();

