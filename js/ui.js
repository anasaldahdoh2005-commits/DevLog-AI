// UI Module - DOM manipulation, rendering, event handling
import { signIn, signUp, resetPassword, signOut, getCurrentUser } from './auth.js';
import { createLog, getLogs, updateLog, deleteLog, getStats, formatDate } from './db.js';
import { generatePost, getStyleLabel } from './ai.js';
import { navigate } from './router.js';

let selectedStyle = 'Professional';
let editingLogId = null;
let currentGeneratedPost = '';
let currentLogContent = '';

export function initUI() {
    initAuthUI();
    initDashboardUI();
    initLogModalUI();
    initPreviewModalUI();
    initHistoryUI();
    initSettingsUI();
    initApiKeyModalUI();

    // Listen for page changes
    window.addEventListener('pagechange', (e) => {
        const { page } = e.detail;
        if (page === 'dashboard') loadDashboard();
        if (page === 'history') loadHistory();
        if (page === 'settings') loadSettings();
    });
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
        text.style.display = 'none';
        loader.style.display = 'inline-block';
        btn.disabled = true;
    } else {
        text.style.display = 'inline';
        loader.style.display = 'none';
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
            const post = await generatePost(content, selectedStyle);
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
            if (editingLogId) {
                await updateLog(editingLogId, { content, post_style: selectedStyle });
                showToast('تم تحديث الإنجاز بنجاح!');
            } else {
                await createLog(content, null, selectedStyle);
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
    } else {
        editingLogId = null;
        title.textContent = 'إنجاز جديد';
        textarea.value = '';
        charCount.textContent = '0';
        document.querySelectorAll('.style-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.style === 'Professional');
        });
        selectedStyle = 'Professional';
    }

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
            const post = await generatePost(currentLogContent, selectedStyle);
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
                await updateLog(editingLogId, { generated_post: editedPost, post_style: selectedStyle });
            } else {
                await createLog(currentLogContent, editedPost, selectedStyle);
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
    document.getElementById('preview-content').textContent = post;
    modal.style.display = 'flex';
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

    console.log('SEARCH VALUE:', search);


        const style = document.getElementById('filter-style').value;


    const order = document.getElementById('sort-order').value;

    try {
        
        const logs = await getLogs({ search, style, order });

        console.log('HISTORY LOGS:', logs);
        
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
    const postPreview = log.generated_post
        ? `<div class="log-post-preview">${escapeHTML(log.generated_post)}</div>`
        : '';

    return `
        <div class="log-card" data-id="${log.id}" data-content="${escapeAttr(log.content)}" data-style="${log.post_style}" data-post="${escapeAttr(log.generated_post || '')}">
            <div class="log-card-header">
                <span class="log-date">${date}</span>
                <span class="log-style-badge">${styleLabel}</span>
            </div>
            <div class="log-content">${escapeHTML(log.content)}</div>
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
            💼 LinkedIn
        </button>

        <button class="publish-option share-x">
            🐦 X / Twitter
        </button>

        <button class="publish-option disabled">
           📸 Instagram (Coming Soon)
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

// Settings UI
function initSettingsUI() {
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await signOut();
        showToast('تم تسجيل الخروج');
    });

    document.getElementById('set-api-key-btn').addEventListener('click', () => {
        const modal = document.getElementById('apikey-modal');
        const input = document.getElementById('api-key-input');
        input.value = localStorage.getItem('devlog-claude-key') || '';
        modal.style.display = 'flex';
    });

    document.getElementById('clear-data-btn').addEventListener('click', () => {
        if (!confirm('هل أنت متأكد من مسح جميع البيانات المحلية؟')) return;
        localStorage.removeItem('devlog-logs');
        showToast('تم مسح البيانات المحلية');
        refreshCurrentPage();
    });
}

function loadSettings() {
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
}

// API Key Modal
function initApiKeyModalUI() {
    const modal = document.getElementById('apikey-modal');

    document.getElementById('save-apikey-btn').addEventListener('click', () => {
        const key = document.getElementById('api-key-input').value.trim();
        if (key) {
            localStorage.setItem('devlog-claude-key', key);
            showToast('تم حفظ مفتاح API');
        } else {
            localStorage.removeItem('devlog-claude-key');
            showToast('تم إزالة مفتاح API');
        }
        closeModal('apikey-modal');
    });

    document.getElementById('close-apikey-btn').addEventListener('click', () => closeModal('apikey-modal'));
    document.getElementById('cancel-apikey-btn').addEventListener('click', () => closeModal('apikey-modal'));

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal('apikey-modal');
    });
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

function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}







document.addEventListener('click', (e) => {

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

        const card =
            e.target.closest('.log-card');

        const postContent =
    card.dataset.post;

        const linkedinUrl =
            `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(postContent)}`;

        window.open(linkedinUrl, '_blank');
        return;
    }

    // X / Twitter Share
    if (e.target.closest('.share-x')) {

        const card =
            e.target.closest('.log-card');

       const postContent =
    card.dataset.post;

        const twitterUrl =
            `https://twitter.com/intent/tweet?text=${encodeURIComponent(postContent)}`;

        window.open(twitterUrl, '_blank');
        return;
    }

    // إغلاق القائمة عند الضغط بالخارج
    if (!e.target.closest('.publish-dropdown')) {

        document.querySelectorAll('.publish-menu')
            .forEach(menu => {
                menu.classList.remove('active');
            });
    }

});





window.selectedPlatform = 'linkedin';

const platformButtons =
    document.querySelectorAll('.platform-btn');

platformButtons.forEach(button => {

    button.addEventListener('click', () => {

        platformButtons.forEach(btn => {
            btn.classList.remove('active');
        });

        button.classList.add('active');

        window.selectedPlatform =
            button.dataset.platform;

    });

});