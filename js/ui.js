// UI Module - DOM manipulation, rendering, event handling
import { signIn, signUp, resetPassword, updatePassword, signOut, getCurrentUser } from './auth.js';
import {
    createLog,
    getLogs,
    updateLog,
    deleteLog,
    getStats,
    formatDate,
    uploadLogImages,
    uploadUserAvatar,
    getCurrentSubscription, // 2026-07-01
    getUserProfile, // 2026-07-01
    saveUserProfile // 2026-07-01
} from './db.js';
import { generatePost, getStyleLabel, getPlatformLabel } from './ai.js';
import { getLinkedInConnection, startLinkedInOAuth, publishLinkedInPost, disconnectLinkedIn } from './linkedin.js';
import { navigate } from './router.js';

let selectedStyle = 'Professional';
let selectedPlatform = 'linkedin';
let editingLogId = null;
let currentGeneratedPost = '';
let currentLogContent = '';
let currentImageUrls = [];
let currentImagePaths = [];
let avatarPreviewUrl = '';
let currentUserProfile = { full_name: '', username: '', avatar_path: '', avatar_url: '' }; // 2026-07-01
let linkedinConnection = { connected: false, can_post: false, needs_reconnect: true };

const PLAN_STORAGE_KEY = 'devlog-selected-plan';
const REMINDER_STORAGE_KEY = 'devlog-daily-reminder';
const REMINDER_LAST_SHOWN_KEY = 'devlog-daily-reminder-last-shown';
const DEFAULT_REMINDER_SETTINGS = { enabled: true, preset: '20:00', time: '20:00' };
let reminderTimerId = null;
let reminderWakeListenersReady = false;
const PLANS = {
    free: {
        name: 'أساسية',
        description: 'خطة البداية عند إطلاق الاشتراكات',
        limit: 'قريباً'
    },
    pro: {
        name: 'احترافية',
        description: 'للنشر المستمر وبناء حضور مهني',
        limit: 'قريباً'
    },
    team: {
        name: 'فريق',
        description: 'للفرق الصغيرة والعمل الجماعي',
        limit: 'قريباً'
    }
};

export function initUI() {
    initPasswordVisibilityToggles();
    initAuthUI();
    initResetPasswordUI();
    initDashboardUI();
    initLogModalUI();
    initPreviewModalUI();
    initHistoryUI();
    initPricingUI();
    initSettingsUI();
    showAuthRedirectNotice();
    showLinkedInRedirectNotice();

    // Listen for page changes
    window.addEventListener('pagechange', (e) => {
        const { page } = e.detail;
        if (page === 'dashboard') loadDashboard();
        if (page === 'history') loadHistory();
        if (page === 'pricing') loadPricing();
        if (page === 'settings') loadSettings();
    });

    window.addEventListener('logschange', refreshCurrentPage);
}

// Toast notifications
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Loading overlay
function showLoading(text = 'جارٍ التحميل...') {
    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent = text;
    overlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

async function loadUserProfileCache() { // 2026-07-01
    try { // 2026-07-01
        currentUserProfile = await getUserProfile(); // 2026-07-01
    } catch (error) { // 2026-07-01
        console.error('Error loading user profile:', error); // 2026-07-01
    } // 2026-07-01
} // 2026-07-01
 // 2026-07-01
function getProfileDisplayName() { // 2026-07-01
    const user = getCurrentUser(); // 2026-07-01
    return currentUserProfile.full_name || currentUserProfile.username || user?.email?.split('@')[0] || ''; // 2026-07-01
} // 2026-07-01
 // 2026-07-01
function renderDashboardProfileName() { // 2026-07-01
    const name = document.getElementById('dashboard-profile-name'); // 2026-07-01
    if (name) name.textContent = getProfileDisplayName(); // 2026-07-01
    renderProfileAvatars();
} // 2026-07-01

function renderProfileAvatars() {
    const avatarUrl = avatarPreviewUrl || currentUserProfile.avatar_url || '';
    const targets = [
        { img: document.getElementById('settings-avatar-img'), root: document.getElementById('settings-avatar-preview') },
        { img: document.getElementById('preview-avatar-img'), root: document.querySelector('.linkedin-avatar') },
        { img: document.getElementById('nav-avatar-img'), root: document.getElementById('nav-user-btn') }
    ];

    targets.forEach(({ img, root }) => {
        if (!img || !root) return;
        img.hidden = !avatarUrl;
        if (avatarUrl) img.src = avatarUrl;
        root.classList.toggle('has-image', Boolean(avatarUrl));
    });
}

function getDisplayName() {
    const user = getCurrentUser();
    return getProfileDisplayName() || user?.email?.split('@')[0] || 'أنت'; // 2026-07-02
}

function getImageFiles() {
    const input = document.getElementById('log-images');
    return input?.files ? Array.from(input.files) : [];
}

function renderSelectedImageNames() {
    const list = document.getElementById('selected-images-list');
    if (!list) return;

    const files = getImageFiles();
    list.innerHTML = files.length
        ? files.map(file => `<span>${escapeHTML(file.name)}</span>`).join('')
        : '<span>لم يتم اختيار صور بعد</span>';
}

async function syncSelectedImages() {
    const files = getImageFiles();
    if (!files.length) {
        return;
    }

    const uploadedImages = await uploadLogImages(files);
    currentImagePaths = uploadedImages.map(image => image.path);
    currentImageUrls = uploadedImages.map(image => image.url);
}

function showAuthRedirectNotice() {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get('auth');

    if (authStatus === 'verified') {
        showToast('تم تأكيد بريدك الإلكتروني بنجاح');
        cleanAuthQueryParams();
    }
}

function showLinkedInRedirectNotice() {
    const query = window.location.hash.includes('?')
        ? window.location.hash.split('?')[1]
        : '';
    const params = new URLSearchParams(query);
    const status = params.get('linkedin');

    if (!status) return;

    if (status === 'connected') {
        showToast('تم ربط حساب LinkedIn بنجاح');
    } else {
        showToast('تعذر ربط LinkedIn. تحقق من إعدادات التطبيق والصلاحيات.', 'error');
    }

    const cleanHash = window.location.hash.split('?')[0] || '#/settings';
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}${cleanHash}`);
}

function cleanAuthQueryParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    url.searchParams.delete('code');
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${window.location.hash}`);
}

function initPasswordVisibilityToggles() {
    document.querySelectorAll('input[type="password"]').forEach(input => {
        if (input.closest('.password-input')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'password-input';
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'password-toggle';
        toggle.setAttribute('aria-label', 'إظهار كلمة المرور');
        toggle.setAttribute('aria-pressed', 'false');
        toggle.innerHTML = `
            <svg class="password-eye password-eye-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>
                <circle cx="12" cy="12" r="3"/>
            </svg>
            <svg class="password-eye password-eye-closed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19C5.5 19 2 12 2 12a20.29 20.29 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A10.54 10.54 0 0 1 12 4c6.5 0 10 8 10 8a20.27 20.27 0 0 1-2.24 3.22"/>
                <path d="M14.12 14.12A3 3 0 0 1 9.88 9.88"/>
                <path d="M1 1l22 22"/>
            </svg>
        `;

        toggle.addEventListener('click', () => {
            const isVisible = input.type === 'text';
            input.type = isVisible ? 'password' : 'text';
            toggle.classList.toggle('is-visible', !isVisible);
            toggle.setAttribute('aria-label', isVisible ? 'إظهار كلمة المرور' : 'إخفاء كلمة المرور');
            toggle.setAttribute('aria-pressed', String(!isVisible));
            input.focus();
        });

        wrapper.appendChild(toggle);
    });
}

// Auth UI
function initAuthUI() {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const resetForm = document.getElementById('reset-form');

    // Form submissions
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const btn = document.getElementById('login-btn');

        try {
            toggleBtnLoading(btn, true);
            hideAuthMessages();
            await signIn(email, password);
            showToast('تم تسجيل الدخول بنجاح!');
            navigate('/dashboard');
        } catch (error) {
            showAuthError(error.message);
        } finally {
            toggleBtnLoading(btn, false);
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;

        const passwordError = getPasswordPolicyError(password);
        if (passwordError) {
            showAuthError(passwordError);
            return;
        }

        if (password !== confirm) {
            showAuthError('كلمات المرور غير متطابقة');
            return;
        }

        const btn = document.getElementById('signup-btn');
        try {
            toggleBtnLoading(btn, true);
            hideAuthMessages();
            await signUp(email, password);
            showAuthSuccess('تم إنشاء الحساب! تحقق من بريدك الإلكتروني للتأكيد.');
        } catch (error) {
            showAuthError(error.message);
        } finally {
            toggleBtnLoading(btn, false);
        }
    });

    resetForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        const btn = document.getElementById('reset-btn');

        try {
            toggleBtnLoading(btn, true);
            hideAuthMessages();
            await resetPassword(email);
            showAuthSuccess('تم إرسال رابط الاستعادة! تحقق من بريدك الإلكتروني.');
        } catch (error) {
            showAuthError(error.message);
        } finally {
            toggleBtnLoading(btn, false);
        }
    });

    // Toggle forms
    document.getElementById('show-signup').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('signup');
    });

    document.getElementById('show-login').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('login');
    });

    document.getElementById('show-reset').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('reset');
    });

    document.getElementById('show-login-from-reset').addEventListener('click', (e) => {
        e.preventDefault();
        showForm('login');
    });
}

function initResetPasswordUI() {
    const form = document.getElementById('update-password-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = document.getElementById('new-password').value;
        const confirm = document.getElementById('new-password-confirm').value;
        const btn = document.getElementById('update-password-btn');

        await handlePasswordUpdate({ password, confirm, btn, onSuccess: () => {
            form.reset();
            showToast('تم تحديث كلمة المرور بنجاح');
            navigate('/dashboard');
        } });
    });
}

async function handlePasswordUpdate({ password, confirm, btn, onSuccess }) {
    const passwordError = getPasswordPolicyError(password);
    if (passwordError) {
        showToast(passwordError, 'error');
        return;
    }

    if (password !== confirm) {
        showToast('كلمات المرور غير متطابقة', 'error');
        return;
    }

    try {
        toggleBtnLoading(btn, true);
        await updatePassword(password);
        onSuccess();
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        toggleBtnLoading(btn, false);
    }
}

function getPasswordPolicyError(password = '') {
    if (password.length < 8) {
        return 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    }

    if (!/[A-Z]/.test(password)) {
        return 'كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل';
    }

    if (!/[0-9]/.test(password)) {
        return 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل';
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
        return 'كلمة المرور يجب أن تحتوي على رمز واحد على الأقل';
    }

    return '';
}

function showForm(formName) {
    document.getElementById('login-form').style.display = formName === 'login' ? 'block' : 'none';
    document.getElementById('signup-form').style.display = formName === 'signup' ? 'block' : 'none';
    document.getElementById('reset-form').style.display = formName === 'reset' ? 'block' : 'none';

    const titles = {
        login: 'تسجيل الدخول',
        signup: 'إنشاء حساب جديد',
        reset: 'استعادة كلمة المرور'
    };
    const subtitles = {
        login: 'مرحباً بعودتك! سجّل دخولك للمتابعة',
        signup: 'أنشئ حسابك وابدأ بتوثيق إنجازاتك',
        reset: 'أدخل بريدك الإلكتروني لاستعادة كلمة المرور'
    };

    document.getElementById('auth-title').textContent = titles[formName];
    document.getElementById('auth-subtitle').textContent = subtitles[formName];
    hideAuthMessages();
}

function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = 'block';
}

function showAuthSuccess(msg) {
    const el = document.getElementById('auth-success');
    el.textContent = msg;
    el.style.display = 'block';
}

function hideAuthMessages() {
    document.getElementById('auth-error').style.display = 'none';
    document.getElementById('auth-success').style.display = 'none';
}

function toggleBtnLoading(btn, loading) {
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');
    if (loading) {
        if (text) text.style.display = 'none';
        if (loader) loader.style.display = 'inline-block';
        btn.disabled = true;
    } else {
        if (text) text.style.display = 'inline';
        if (loader) loader.style.display = 'none';
        btn.disabled = false;
    }
}

// Dashboard UI
function initDashboardUI() {
    document.getElementById('add-log-btn').addEventListener('click', () => {
        openLogModal();
    });
}

async function loadDashboard() {
    try {
        await loadUserProfileCache(); // 2026-07-01
        renderDashboardProfileName(); // 2026-07-01
        const stats = await getStats();
        document.getElementById('stat-total').textContent = stats.totalLogs;
        document.getElementById('stat-posts').textContent = stats.postsGenerated;
        document.getElementById('stat-last').textContent = stats.lastActivity;

        const recentLogs = await getLogs({ limit: 5 });
        renderRecentLogs(recentLogs);
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

function renderRecentLogs(logs) {
    const container = document.getElementById('recent-logs');

    // تحقق من وجود العنصر
    if (!container) {
        console.error('recent-logs container not found');
        return;
    }

    // Empty state
    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>لا توجد إنجازات بعد</p>
            </div>
        `;
        return;
    }

    // Render logs
    container.innerHTML = logs
        .map(log => createLogCardHTML(log, true))
        .join('');

    attachLogCardEvents(container);
}




// Log Modal UI
function initLogModalUI() {
    const modal = document.getElementById('log-modal');
    const textarea = document.getElementById('log-content');
    const charCount = document.getElementById('char-count');

    // Character counter
    textarea.addEventListener('input', () => {
        charCount.textContent = textarea.value.length;
    });

    const imageInput = document.getElementById('log-images');
    if (imageInput) {
        imageInput.addEventListener('change', renderSelectedImageNames);
    }

    document.querySelectorAll('.platform-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.platform-btn').forEach(button => button.classList.remove('active'));
            btn.classList.add('active');
            selectedPlatform = btn.dataset.platform;
        });
    });

    // Style selection
    document.querySelectorAll('.style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedStyle = btn.dataset.style;
        });
    });

    // Generate button
    document.getElementById('generate-btn').addEventListener('click', async () => {
        const content = textarea.value.trim();
        if (!content) {
            showToast('يرجى كتابة الإنجاز أولاً', 'error');
            return;
        }

        try {
            showLoading('جارٍ توليد المنشور بالذكاء الاصطناعي...');
            await syncSelectedImages();
            const post = await generatePost(content, selectedStyle, selectedPlatform); // 2026-07-02
            currentGeneratedPost = post;
            currentLogContent = content;
            hideLoading();
            closeModal('log-modal');
            openPreviewModal(post);
        } catch (error) {
            hideLoading();
            showToast(error.message, 'error');
        }
    });

    // Save only button
    document.getElementById('save-log-btn').addEventListener('click', async () => {
        const content = textarea.value.trim();
        if (!content) {
            showToast('يرجى كتابة الإنجاز أولاً', 'error');
            return;
        }

        try {
            await syncSelectedImages();
            const logMetadata = {
                platform: selectedPlatform,
                image_paths: currentImagePaths
            };

            if (editingLogId) {
                await updateLog(editingLogId, {
                    content,
                    post_style: selectedStyle,
                    platform: selectedPlatform,
                    image_urls: currentImagePaths
                });
                showToast('تم تحديث الإنجاز بنجاح!');
            } else {
                await createLog(content, null, selectedStyle, logMetadata);
                showToast('تم حفظ الإنجاز بنجاح!');
            }

           await refreshCurrentPage();
            closeModal('log-modal');
            closeModal('log-modal');
            
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    // Close/Cancel
    document.getElementById('close-modal-btn').addEventListener('click', () => closeModal('log-modal'));
    document.getElementById('cancel-modal-btn').addEventListener('click', () => closeModal('log-modal'));

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('log-modal');
    });
}

function openLogModal(log = null) {
    const modal = document.getElementById('log-modal');
    const textarea = document.getElementById('log-content');
    const title = document.getElementById('modal-title');
    const charCount = document.getElementById('char-count');
    const imageInput = document.getElementById('log-images');

    if (log) {
        editingLogId = log.id;
        title.textContent = 'تعديل الإنجاز';
        textarea.value = log.content;
        charCount.textContent = log.content.length;
        // Set style
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.style === log.post_style);
        });
        selectedStyle = log.post_style;
        selectedPlatform = log.platform || 'linkedin';
        currentImageUrls = log.image_urls || [];
        currentImagePaths = log.image_paths || log.image_urls || [];
    } else {
        editingLogId = null;
        title.textContent = 'إنجاز جديد';
        textarea.value = '';
        charCount.textContent = '0';
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.style === 'Professional');
        });
        selectedStyle = 'Professional';
        selectedPlatform = 'linkedin';
        currentImageUrls = [];
        currentImagePaths = [];
    }

    if (imageInput) imageInput.value = '';
    renderSelectedImageNames();
    document.querySelectorAll('.platform-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.platform === selectedPlatform);
    });

    modal.style.display = 'flex';
    textarea.focus();
}

// Preview Modal UI
function initPreviewModalUI() {
    const modal = document.getElementById('preview-modal');

    document.getElementById('close-preview-btn').addEventListener('click', () => closeModal('preview-modal'));

    document.getElementById('copy-post-btn').addEventListener('click', () => {
        const content = document.getElementById('preview-content').textContent;
        navigator.clipboard.writeText(content).then(() => {
            showToast('تم نسخ المنشور!');
        }).catch(() => {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = content;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('تم نسخ المنشور!');
        });
    });

    document.getElementById('regenerate-btn').addEventListener('click', async () => {
        try {
            showLoading('جارٍ إعادة التوليد...');
            const post = await generatePost(currentLogContent, selectedStyle, selectedPlatform); // 2026-07-02
            currentGeneratedPost = post;
          document.getElementById('preview-content').textContent = post;
            hideLoading();
            showToast('تم إعادة التوليد بنجاح!');
        } catch (error) {
            hideLoading();
            showToast(error.message, 'error');
        }
    });

    document.getElementById('save-post-btn').addEventListener('click', async () => {
        const editedPost = document.getElementById('preview-content').textContent;
        try {
            if (editingLogId) {
                await updateLog(editingLogId, {
                    generated_post: editedPost,
                    post_style: selectedStyle,
                    platform: selectedPlatform,
                    image_urls: currentImagePaths
                });
            } else {
                await createLog(currentLogContent, editedPost, selectedStyle, {
                    platform: selectedPlatform,
                    image_paths: currentImagePaths
                });
            }
            showToast('تم حفظ المنشور بنجاح!');

            await refreshCurrentPage();


            closeModal('preview-modal');
            
        } catch (error) {
            showToast(error.message, 'error');
        }
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('preview-modal');
    });
}

function openPreviewModal(post) {
    const modal = document.getElementById('preview-modal');
    document.querySelector('.linkedin-name').textContent = getDisplayName();
    renderProfileAvatars();
    document.getElementById('preview-content').textContent = post;
    renderPreviewImages();
    modal.style.display = 'flex';
}

function renderPreviewImages() {
    const container = document.getElementById('preview-images');
    if (!container) return;

    container.innerHTML = currentImageUrls.length
        ? currentImageUrls.map(url => `<img src="${escapeAttr(url)}" alt="صورة مرفقة مع الإنجاز" loading="lazy">`).join('')
        : '';
}

// History UI
function initHistoryUI() {
    
    const searchInput = document.getElementById('search-input');
    searchInput.value = '';
    const filterStyle = document.getElementById('filter-style');
    const sortOrder = document.getElementById('sort-order');

    let debounceTimer;
    searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(loadHistory, 300);
    });

    filterStyle.addEventListener('change', loadHistory);
    sortOrder.addEventListener('change', loadHistory);
}

async function loadHistory() {
const searchInput =
    document.getElementById('search-input');

const search =
    searchInput?.value?.trim() || '';

        const style = document.getElementById('filter-style').value;


    const order = document.getElementById('sort-order').value;

    try {
        
        const logs = await getLogs({ search, style, order });

        renderHistoryLogs(logs);
    } catch (error) {
        console.error('Error loading history:', error);
    }
}


function renderHistoryLogs(logs) {
    const container = document.getElementById('history-logs');

    if (!container) return;

    // Empty state
    if (!logs || logs.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <p>لا توجد إنجازات بعد</p>
            </div>
        `;
        return;
    }

    // Render logs
    container.innerHTML = logs
        .map(log => createLogCardHTML(log, false))
        .join('');

    attachLogCardEvents(container);
}



function createLogCardHTML(log, compact = false) {
    const date = formatDate(log.created_at);
    const styleLabel = getStyleLabel(log.post_style);
    const platformLabel = getPlatformLabel(log.platform || 'linkedin');
    const imageUrls = Array.isArray(log.image_urls) ? log.image_urls : [];
    const imagePaths = Array.isArray(log.image_paths) ? log.image_paths : imageUrls;
    const postPreview = log.generated_post
        ? `<div class="log-post-preview">${escapeHTML(log.generated_post)}</div>`
        : '';
    const imagePreview = imageUrls.length
        ? `<div class="log-image-strip">${imageUrls.map(url => `<img src="${escapeAttr(url)}" alt="صورة مرفقة" loading="lazy">`).join('')}</div>`
        : '';

    return `
        <div class="log-card" data-id="${log.id}" data-content="${escapeAttr(log.content)}" data-style="${log.post_style}" data-platform="${log.platform || 'linkedin'}" data-images="${escapeAttr(JSON.stringify(imageUrls))}" data-image-paths="${escapeAttr(JSON.stringify(imagePaths))}" data-post="${escapeAttr(log.generated_post || '')}">
            <div class="log-card-header">
                <span class="log-date">${date}</span>
                <span class="log-style-badge">${platformLabel} · ${styleLabel}</span>
            </div>
            <div class="log-content">${escapeHTML(log.content)}</div>
            ${imagePreview}
            ${compact ? '' : postPreview}
            <div class="log-actions">
                ${log.generated_post ? `<button class="btn btn-ghost btn-sm copy-log-btn" data-post="${escapeAttr(log.generated_post)}">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    نسخ
                </button>` : ''}
                <button class="btn btn-ghost btn-sm edit-log-btn">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    تعديل
                </button>
                <button class="btn btn-ghost btn-sm btn-danger delete-log-btn">
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    حذف
                </button>

                <div class="publish-dropdown">

    <button class="btn btn-ghost btn-sm publish-btn">
        نشر ▼
    </button>

    <div class="publish-menu">

        <button class="publish-option share-linkedin">
            LinkedIn رسمي
        </button>

        <button class="publish-option share-x">
            🐦 X / Twitter
        </button>

        <button class="publish-option share-instagram is-disabled" type="button" disabled aria-disabled="true" title="Instagram متوقف مؤقتاً لأن النشر يحتاج صورة أو فيديو">
           Instagram (قريباً)
        </button>

    </div>

</div>
            </div>
        </div>
    `;
}

function attachLogCardEvents(container) {
    // Copy buttons
    container.querySelectorAll('.copy-log-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const post = btn.dataset.post;
            navigator.clipboard.writeText(post).then(() => {
                showToast('تم نسخ المنشور!');
            }).catch(() => {
                showToast('تم نسخ المنشور!');
            });
        });
    });

    // Edit buttons
    container.querySelectorAll('.edit-log-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = btn.closest('.log-card');
            const log = {
                id: card.dataset.id,
                content: card.dataset.content,
                post_style: card.dataset.style,
                platform: card.dataset.platform,
                image_urls: safeJsonParse(card.dataset.images, []),
                image_paths: safeJsonParse(card.dataset.imagePaths, []),
                generated_post: card.dataset.post
            };
            openLogModal(log);
        });
    });

    // Delete buttons
    container.querySelectorAll('.delete-log-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm('هل أنت متأكد من حذف هذا الإنجاز؟')) return;
            const card = btn.closest('.log-card');
            try {
                await deleteLog(card.dataset.id);
                showToast('تم حذف الإنجاز');
                refreshCurrentPage();
            } catch (error) {
                showToast(error.message, 'error');
            }
        });
    });
}

// Pricing UI
function initPricingUI() {
    document.querySelectorAll('[data-plan-select]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.disabled) return;
            selectPlan(btn.dataset.planSelect);
        });
    });

    loadPricing();
}

function loadPricing() {
    const selectedPlan = getSelectedPlanKey();

    document.querySelectorAll('[data-plan-card]').forEach(card => {
        card.classList.toggle('plan-card-selected', card.dataset.planCard === selectedPlan);
    });

    document.querySelectorAll('[data-plan-select]').forEach(btn => {
        const planKey = btn.dataset.planSelect;
        const label = btn.querySelector('.btn-text');
        if (!label || !PLANS[planKey]) return;

        if (btn.disabled) {
            label.textContent = 'قريباً';
            return;
        }

        label.textContent = planKey === selectedPlan
            ? 'الخطة الحالية'
            : `اختيار ${PLANS[planKey].name}`;
    });
}

function selectPlan(planKey) {
    if (!PLANS[planKey]) return;

    localStorage.setItem(PLAN_STORAGE_KEY, planKey);
    loadPricing();
    updateSettingsPlan();
    showToast(`تم اختيار خطة ${PLANS[planKey].name}`);
}

function getSelectedPlanKey() {
    const planKey = localStorage.getItem(PLAN_STORAGE_KEY) || 'free';
    return PLANS[planKey] ? planKey : 'free';
}

function updateSettingsPlan() {
    const selectedPlan = getSelectedPlanKey();
    const plan = PLANS[selectedPlan];
    const name = document.getElementById('settings-plan-name');
    const desc = document.getElementById('settings-plan-desc');
    const limit = document.getElementById('settings-plan-limit');

    if (!name || !desc || !limit) return;

    name.textContent = plan.name;
    desc.textContent = plan.description;
    limit.textContent = plan.limit;
}

function renderUserProfileSettings() { // 2026-07-01
    const fullName = document.getElementById('profile-full-name'); // 2026-07-01
    const username = document.getElementById('profile-username'); // 2026-07-01
    const avatarInput = document.getElementById('profile-avatar');
 // 2026-07-01
    if (fullName) fullName.value = currentUserProfile.full_name || ''; // 2026-07-01
    if (username) username.value = currentUserProfile.username || ''; // 2026-07-01
    if (avatarInput) avatarInput.value = '';
    avatarPreviewUrl = '';
    renderProfileAvatars();
} // 2026-07-01

// Settings UI
function initSettingsUI() {
    initDailyReminderUI();
    initLinkedInSettingsUI();
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await signOut();
        showToast('تم تسجيل الخروج');
    });


    document.getElementById('clear-data-btn').addEventListener('click', () => {
        if (!confirm('هل أنت متأكد من مسح جميع البيانات المحلية؟')) return;
        localStorage.removeItem('devlog-logs');
        showToast('تم مسح البيانات المحلية');
        refreshCurrentPage();
    });

    const passwordForm = document.getElementById('settings-password-form');
    passwordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const password = document.getElementById('settings-new-password').value;
        const confirm = document.getElementById('settings-new-password-confirm').value;
        const btn = document.getElementById('settings-password-btn');

        await handlePasswordUpdate({ password, confirm, btn, onSuccess: () => {
            passwordForm.reset();
            showToast('تم تحديث كلمة المرور');
        } });
    });

    const profileForm = document.getElementById('profile-form'); // 2026-07-01
    const avatarInput = document.getElementById('profile-avatar');
    if (avatarInput) {
        avatarInput.addEventListener('change', () => {
            const file = avatarInput.files?.[0];
            if (!file) return;
            if (avatarPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarPreviewUrl);
            avatarPreviewUrl = URL.createObjectURL(file);
            renderProfileAvatars();
        });
    }

    if (profileForm) { // 2026-07-01
        profileForm.addEventListener('submit', async (e) => { // 2026-07-01
            e.preventDefault(); // 2026-07-01
            const btn = document.getElementById('profile-save-btn'); // 2026-07-01
 // 2026-07-01
            try { // 2026-07-01
                toggleBtnLoading(btn, true); // 2026-07-01
                const avatarFile = document.getElementById('profile-avatar')?.files?.[0];
                let avatarPath = currentUserProfile.avatar_path || '';
                let avatarUrl = currentUserProfile.avatar_url || '';

                if (avatarFile) {
                    const avatar = await uploadUserAvatar(avatarFile);
                    avatarPath = avatar?.path || avatarPath;
                    avatarUrl = avatar?.url || avatarUrl;
                }

                currentUserProfile = await saveUserProfile({ // 2026-07-01
                    full_name: document.getElementById('profile-full-name').value, // 2026-07-01
                    username: document.getElementById('profile-username').value, // 2026-07-01
                    avatar_path: avatarPath
                }); // 2026-07-01

                if (avatarUrl) currentUserProfile.avatar_url = avatarUrl;
                if (avatarPreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarPreviewUrl);
                avatarPreviewUrl = '';
                renderUserProfileSettings(); // 2026-07-01
    renderReminderSettings();
                renderDashboardProfileName(); // 2026-07-01
                showToast('تم حفظ الملف الشخصي'); // 2026-07-01
            } catch (error) { // 2026-07-01
                showToast(error.message, 'error'); // 2026-07-01
            } finally { // 2026-07-01
                toggleBtnLoading(btn, false); // 2026-07-01
            } // 2026-07-01
        }); // 2026-07-01
    } // 2026-07-01
}

function initLinkedInSettingsUI() {
    const connectBtn = document.getElementById('linkedin-connect-btn');
    const disconnectBtn = document.getElementById('linkedin-disconnect-btn');

    connectBtn?.addEventListener('click', async () => {
        if (!getCurrentUser()) {
            showToast('سجل الدخول أولاً لربط LinkedIn', 'error');
            navigate('/auth');
            return;
        }

        try {
            toggleBtnLoading(connectBtn, true);
            const { authorization_url } = await startLinkedInOAuth();
            window.location.href = authorization_url;
        } catch (error) {
            showToast(getLinkedInErrorMessage(error), 'error');
        } finally {
            toggleBtnLoading(connectBtn, false);
        }
    });

    disconnectBtn?.addEventListener('click', async () => {
        if (!confirm('هل تريد فصل ربط LinkedIn؟')) return;

        try {
            toggleBtnLoading(disconnectBtn, true);
            linkedinConnection = await disconnectLinkedIn();
            renderLinkedInConnectionStatus();
            showToast('تم فصل LinkedIn');
        } catch (error) {
            showToast(getLinkedInErrorMessage(error), 'error');
        } finally {
            toggleBtnLoading(disconnectBtn, false);
        }
    });
}

async function refreshLinkedInConnectionStatus() {
    if (!getCurrentUser()) {
        linkedinConnection = { connected: false, can_post: false, needs_reconnect: true };
        renderLinkedInConnectionStatus();
        return;
    }

    try {
        linkedinConnection = await getLinkedInConnection();
    } catch (error) {
        console.error('LinkedIn status error:', error);
        linkedinConnection = { connected: false, can_post: false, needs_reconnect: true, error: true };
    }

    renderLinkedInConnectionStatus();
}

function renderLinkedInConnectionStatus() {
    const status = document.getElementById('linkedin-connection-status');
    const detail = document.getElementById('linkedin-connection-detail');
    const connectBtn = document.getElementById('linkedin-connect-btn');
    const disconnectBtn = document.getElementById('linkedin-disconnect-btn');
    const avatar = document.getElementById('linkedin-account-avatar');
    const connected = Boolean(linkedinConnection?.connected && linkedinConnection?.can_post);
    const needsReconnect = Boolean(linkedinConnection?.connected && linkedinConnection?.needs_reconnect);

    if (status) {
        status.textContent = connected
            ? 'مرتبط وجاهز للنشر'
            : needsReconnect
                ? 'يحتاج إعادة ربط'
                : 'غير مرتبط';
        status.dataset.state = connected ? 'connected' : needsReconnect ? 'warning' : 'idle';
    }

    if (detail) {
        detail.textContent = connected
            ? `${linkedinConnection.display_name || 'LinkedIn'} · النشر يتم عبر LinkedIn API`
            : needsReconnect
                ? 'انتهت الجلسة أو تنقص صلاحية w_member_social.'
                : 'اربط حسابك حتى ينشر DevLog AI مباشرة بدون روابط مشاركة غير مضمونة.';
    }

    if (connectBtn) connectBtn.hidden = connected;
    if (disconnectBtn) disconnectBtn.hidden = !linkedinConnection?.connected;

    if (avatar) {
        avatar.textContent = linkedinConnection?.display_name
            ? linkedinConnection.display_name.trim().charAt(0).toUpperCase()
            : 'in';
    }
}


function initDailyReminderUI() {
    const toggle = document.getElementById('daily-reminder-toggle');
    const presetInputs = Array.from(document.querySelectorAll('input[name="reminder-time-preset"]'));
    const customInput = document.getElementById('custom-reminder-time');

    if (!toggle || !presetInputs.length || !customInput) return;

    const saveFromUI = async () => {
        const selectedPreset = presetInputs.find(input => input.checked)?.value || '20:00';
        const time = selectedPreset === 'custom' ? customInput.value || '20:00' : selectedPreset;
        const enabled = toggle.checked;
        const settings = { enabled, preset: selectedPreset, time };

        saveReminderSettings(settings);
        renderReminderSettings(settings);

        if (enabled) await requestReminderPermission();
        scheduleDailyReminder();
        showToast(enabled ? `تم ضبط التذكير اليومي على ${formatReminderTime(time)}` : 'تم إيقاف التذكير اليومي');
    };

    toggle.addEventListener('change', saveFromUI);
    presetInputs.forEach(input => input.addEventListener('change', saveFromUI));
    customInput.addEventListener('change', saveFromUI);

    if (!reminderWakeListenersReady) {
        window.addEventListener('focus', scheduleDailyReminder);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) scheduleDailyReminder();
        });
        reminderWakeListenersReady = true;
    }

    renderReminderSettings(getReminderSettings());
    scheduleDailyReminder();
}

function getReminderSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(REMINDER_STORAGE_KEY) || '{}');
        return {
            ...DEFAULT_REMINDER_SETTINGS,
            ...saved,
            time: normalizeReminderTime(saved.time || saved.preset || DEFAULT_REMINDER_SETTINGS.time),
            preset: saved.preset || saved.time || DEFAULT_REMINDER_SETTINGS.preset
        };
    } catch {
        return { ...DEFAULT_REMINDER_SETTINGS };
    }
}

function saveReminderSettings(settings) {
    localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify({
        enabled: Boolean(settings.enabled),
        preset: settings.preset || '20:00',
        time: normalizeReminderTime(settings.time || '20:00')
    }));
}

function renderReminderSettings(settings = getReminderSettings()) {
    const toggle = document.getElementById('daily-reminder-toggle');
    const timeSettings = document.getElementById('reminder-time-settings');
    const presetInputs = Array.from(document.querySelectorAll('input[name="reminder-time-preset"]'));
    const customInput = document.getElementById('custom-reminder-time');
    const customRow = document.getElementById('custom-reminder-time-row');
    const status = document.getElementById('reminder-status');

    if (!toggle || !timeSettings || !presetInputs.length || !customInput) return;

    const normalized = {
        ...DEFAULT_REMINDER_SETTINGS,
        ...settings,
        time: normalizeReminderTime(settings.time),
        preset: settings.preset || settings.time || '20:00'
    };

    toggle.checked = normalized.enabled;
    timeSettings.hidden = !normalized.enabled;
    presetInputs.forEach(input => {
        input.checked = input.value === normalized.preset;
    });

    if (!presetInputs.some(input => input.checked)) {
        const customPreset = presetInputs.find(input => input.value === 'custom');
        if (customPreset) customPreset.checked = true;
        normalized.preset = 'custom';
    }

    customInput.value = normalized.time;
    const isCustom = normalized.preset === 'custom';
    if (customRow) customRow.hidden = !isCustom;
    if (status) {
        const baseStatus = normalized.enabled
            ? `سيصلك التذكير اليومي الساعة ${formatReminderTime(normalized.time)}.`
            : 'التذكير اليومي متوقف.';
        const mobileNote = isMobileDevice() && normalized.enabled
            ? ' على الجوال تعمل التذكيرات المحلية عندما يكون التطبيق مفتوحًا أو مسموحًا له بالبقاء بالخلفية؛ الإشعارات المضمونة تحتاج Push Server.'
            : '';
        status.textContent = baseStatus + mobileNote;
    }
}

async function requestReminderPermission() {
    if (!('Notification' in window)) {
        showToast('المتصفح لا يدعم إشعارات التذكير', 'error');
        return false;
    }

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        showToast('فعّل الإشعارات من إعدادات المتصفح حتى يصلك التذكير', 'error');
        return false;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
}

function scheduleDailyReminder() {
    if (reminderTimerId) {
        clearTimeout(reminderTimerId);
        reminderTimerId = null;
    }

    const settings = getReminderSettings();
    renderReminderSettings(settings);

    if (!settings.enabled) return;

    const todayReminder = getTodayReminderDate(settings.time);
    const todayKey = new Date().toISOString().slice(0, 10);
    if (todayReminder.getTime() <= Date.now() && localStorage.getItem(REMINDER_LAST_SHOWN_KEY) !== todayKey) {
        reminderTimerId = setTimeout(async () => {
            await showDailyReminderNotification(settings.time);
            scheduleDailyReminder();
        }, 1000);
        return;
    }

    const nextReminder = getNextReminderDate(settings.time);
    const delay = Math.max(1000, nextReminder.getTime() - Date.now());

    reminderTimerId = setTimeout(async () => {
        await showDailyReminderNotification(settings.time);
        scheduleDailyReminder();
    }, delay);
}

function getTodayReminderDate(time) {
    const [hours, minutes] = normalizeReminderTime(time).split(':').map(Number);
    const reminder = new Date();
    reminder.setHours(hours, minutes, 0, 0);
    return reminder;
}

function getNextReminderDate(time) {
    const next = getTodayReminderDate(time);

    if (next.getTime() <= Date.now()) {
        next.setDate(next.getDate() + 1);
    }

    return next;
}

async function showDailyReminderNotification(time) {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(REMINDER_LAST_SHOWN_KEY) === todayKey) return;

    const hasPermission = await requestReminderPermission();
    if (!hasPermission) return;

    const title = 'تذكير يومي';
    const options = {
        body: `حان وقت تدوين خاطرة اليوم (${formatReminderTime(time)}).`,
        icon: './imges/logo-192.png',
        badge: './imges/logo-192.png',
        tag: 'devlog-daily-reminder',
        dir: 'rtl',
        lang: 'ar'
    };

    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready.catch(() => null);
        if (registration?.showNotification) {
            await registration.showNotification(title, options);
        } else {
            new Notification(title, options);
        }
    } else {
        new Notification(title, options);
    }

    localStorage.setItem(REMINDER_LAST_SHOWN_KEY, todayKey);
}

function normalizeReminderTime(value = '20:00') {
    const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return '20:00';

    const hours = Math.min(23, Math.max(0, Number(match[1])));
    const minutes = Math.min(59, Math.max(0, Number(match[2])));
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatReminderTime(value = '20:00') {
    const [hours, minutes] = normalizeReminderTime(value).split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString('ar-SA', { hour: 'numeric', minute: '2-digit' });
}

async function loadSettings() {
    const user = getCurrentUser();
    if (user) {
        document.getElementById('settings-email').textContent = user.email || '—';
        document.getElementById('settings-joined').textContent = user.created_at
            ? `انضم في ${new Date(user.created_at).toLocaleDateString('ar-SA')}`
            : '';
    } else {
        document.getElementById('settings-email').textContent = 'مستخدم محلي';
        document.getElementById('settings-joined').textContent = 'الوضع المحلي (بدون Supabase)';
    }

    // Sync dark mode toggle
    const toggle = document.getElementById('dark-mode-toggle');
    toggle.checked = document.documentElement.getAttribute('data-theme') === 'dark';

    try {
        const subscription = await getCurrentSubscription();
        if (subscription?.plan && PLANS[subscription.plan]) {
            localStorage.setItem(PLAN_STORAGE_KEY, subscription.plan);
        }
    } catch (error) {
        console.error('Error loading subscription:', error);
    }

    updateSettingsPlan();
    await loadUserProfileCache(); // 2026-07-01
    renderUserProfileSettings(); // 2026-07-01
    renderReminderSettings();
    await refreshLinkedInConnectionStatus();
}

// Utilities
function closeModal(id) {
    document.getElementById(id).style.display = 'none';
}

async function refreshCurrentPage() {

    try {

        // تحديث لوحة التحكم دائمًا
        const dashboardContainer =
            document.getElementById('recent-logs');

        if (dashboardContainer) {
            await loadDashboard();
        }

        // تحديث السجل دائمًا
        const historyContainer =
            document.getElementById('history-logs');

        if (historyContainer) {
            await loadHistory();
        }

    } catch (error) {

        console.error('Refresh Error:', error);
    }
}

export async function refreshLogs() {
    return refreshCurrentPage();
}

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(textarea);
        return copied;
    }
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent)
        || (navigator.maxTouchPoints > 1 && window.innerWidth <= 900);
}

function openPublishWindow(url) {
    return window.open(url, '_blank', 'noopener,noreferrer');
}

function getPlatformPublishUrl(platform, text) {
    const encoded = encodeURIComponent(text);
    if (platform === 'linkedin') {
        return `https://www.linkedin.com/feed/`;
    }
    return `https://twitter.com/intent/tweet?text=${encoded}`;
}

async function sharePostToPlatform(platform, postContent) {
    const text = String(postContent || '').trim();
    const platformName = platform === 'linkedin' ? 'LinkedIn' : 'X';

    if (!text) {
        showToast('لا يوجد نص جاهز للنشر', 'error');
        return;
    }

    if (platform === 'linkedin') {
        await publishPostToLinkedIn(text);
        return;
    }

    const publishUrl = getPlatformPublishUrl(platform, text);
    const opened = openPublishWindow(publishUrl);

    showToast(opened
        ? `تم فتح ${platformName}. إذا لم يظهر النص داخل تطبيق الجوال، افتحه من المتصفح لأن بعض تطبيقات الجوال تمنع تعبئة النص تلقائيًا.`
        : `لم يتم فتح ${platformName}. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.`,
        opened ? 'success' : 'error');
}

async function publishPostToLinkedIn(text) {
    try {
        const status = await getLinkedInConnection();
        linkedinConnection = status;

        if (!status?.connected || status?.needs_reconnect || !status?.can_post) {
            await copyText(text);
            const { authorization_url } = await startLinkedInOAuth();
            showToast('تم نسخ النص. اربط LinkedIn أولاً ثم أعد النشر الرسمي.');
            window.location.href = authorization_url;
            return;
        }

        const result = await publishLinkedInPost(text);
        showToast(result?.id ? 'تم نشر المنشور على LinkedIn بنجاح' : 'تم إرسال المنشور إلى LinkedIn');
        await refreshLinkedInConnectionStatus();
    } catch (error) {
        await copyText(text);

        if (['linkedin_not_connected', 'linkedin_reconnect_required', 'linkedin_scope_missing'].includes(error?.code)) {
            try {
                const { authorization_url } = await startLinkedInOAuth();
                showToast('تم نسخ النص. يحتاج LinkedIn إعادة ربط قبل النشر الرسمي.', 'error');
                window.location.href = authorization_url;
                return;
            } catch (oauthError) {
                showToast(getLinkedInErrorMessage(oauthError), 'error');
                return;
            }
        }

        const opened = openPublishWindow(getPlatformPublishUrl('linkedin', text));
        showToast(opened
            ? `${getLinkedInErrorMessage(error)}. تم نسخ النص وفتح LinkedIn كخطة طوارئ.`
            : `${getLinkedInErrorMessage(error)}. تم نسخ النص. افتح LinkedIn والصقه يدوياً.`,
            'error');
    }
}

function getLinkedInErrorMessage(error) {
    const messages = {
        auth_required: 'سجل الدخول أولاً.',
        missing_server_config: 'إعدادات LinkedIn على السيرفر غير مكتملة.',
        linkedin_not_connected: 'حساب LinkedIn غير مربوط.',
        linkedin_reconnect_required: 'جلسة LinkedIn انتهت وتحتاج إعادة ربط.',
        linkedin_scope_missing: 'صلاحية w_member_social غير مفعلة لتطبيق LinkedIn.',
        linkedin_rate_limited: 'LinkedIn أوقف الطلب مؤقتاً بسبب كثرة المحاولات.',
        post_text_too_long: 'نص LinkedIn أطول من الحد المسموح.',
    };

    return messages[error?.code] || error?.message || 'تعذر تنفيذ عملية LinkedIn';
}







document.addEventListener('click', async (e) => {

    // فتح وإغلاق قائمة النشر
    if (e.target.closest('.publish-btn')) {

        const dropdown =
            e.target.closest('.publish-dropdown');

        const menu =
            dropdown.querySelector('.publish-menu');

        // إغلاق باقي القوائم
        document.querySelectorAll('.publish-menu')
            .forEach(m => {
                if (m !== menu) {
                    m.classList.remove('active');
                }
            });

        menu.classList.toggle('active');
        return;
    }

    // LinkedIn Share
    if (e.target.closest('.share-linkedin')) {
        const card = e.target.closest('.log-card');
        await sharePostToPlatform('linkedin', card?.dataset.post);
        return;
    }

    // X / Twitter Share
    if (e.target.closest('.share-x')) {
        const card = e.target.closest('.log-card');
        await sharePostToPlatform('x', card?.dataset.post);
        return;
    }

    if (e.target.closest('.share-instagram')) return;

    // إغلاق القائمة عند الضغط بالخارج
    if (!e.target.closest('.publish-dropdown')) {

        document.querySelectorAll('.publish-menu')
            .forEach(menu => {
                menu.classList.remove('active');
            });
    }

});
