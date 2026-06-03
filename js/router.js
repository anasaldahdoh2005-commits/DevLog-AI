// Hash-based SPA Router
const routes = {
    '/': 'landing',
    '/auth': 'auth',
    '/dashboard': 'dashboard',
    '/history': 'history',
    '/settings': 'settings'
};

let currentPage = null;

export function initRouter() {
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
}

export function navigate(path) {
    window.location.hash = path;
}

function handleRoute() {
    const hash = window.location.hash.slice(1) || '/';
    const pageName = routes[hash] || 'landing';

    // Hide all pages
    document.querySelectorAll('.page').forEach(page => {
        page.style.display = 'none';
    });

    // Show target page
    const targetPage = document.getElementById(`page-${pageName}`);
    if (targetPage) {
        targetPage.style.display = 'block';
    }

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('data-page') === pageName) {
            link.classList.add('active');
        }
    });

    // Auth protection
    const isAuthenticated = document.body.classList.contains('authenticated');
    const protectedPages = ['dashboard', 'history', 'settings'];

    if (protectedPages.includes(pageName) && !isAuthenticated) {
        navigate('/auth');
        return;
    }

    if (pageName === 'auth' && isAuthenticated) {
        navigate('/dashboard');
        return;
    }

    currentPage = pageName;

    // Dispatch custom event for page changes
    window.dispatchEvent(new CustomEvent('pagechange', { detail: { page: pageName } }));
}

export function getCurrentPage() {
    return currentPage;
}