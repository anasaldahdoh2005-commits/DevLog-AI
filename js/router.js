import { getCurrentUser } from './auth.js';

// Hash-based SPA Router
const routes = {
    '/': 'landing',
    '/auth': 'auth',
    '/pricing': 'pricing',
    '/dashboard': 'dashboard',
    '/history': 'history',
    '/settings': 'settings',
    '/reset-password': 'reset-password'
};

const protectedPages = ['dashboard', 'history', 'settings'];

let currentPage = null;

export function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

export function navigate(path) {
    window.location.hash = path;
}

export function refreshRoute() {
    handleRoute();
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const path = hash.split('?')[0];
    const pageName = routes[path] || 'landing';

    const isAuthenticated = Boolean(getCurrentUser());

    // ✅ التحقق من الصلاحية قبل إظهار أي صفحة
    if (protectedPages.includes(pageName) && !isAuthenticated) {
        navigate('/auth');
        return;
    }

    if (pageName === 'auth' && isAuthenticated) {
        navigate('/dashboard');
        return;
    }

    // إخفاء كل الصفحات ثم إظهار الهدف
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
    });

    const targetPage = document.getElementById(`page-${pageName}`);

    if (!targetPage) {
        console.error(`Page not found: page-${pageName}`);
        return;
    }

    targetPage.style.display = 'block';

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === pageName) {
            link.classList.add('active');
        }
    });

    currentPage = pageName;

    window.dispatchEvent(
        new CustomEvent('pagechange', { detail: { page: pageName } })
    );
}

export function getCurrentPage() {
    return currentPage;
}
