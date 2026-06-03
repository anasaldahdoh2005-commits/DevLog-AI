// Database CRUD Operations via Supabase
import { getSupabase, getCurrentUser } from './auth.js';

const TABLE_NAME = 'logs';

export async function createLog(content, generatedPost, postStyle) {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        // Fallback to localStorage
        return createLocalLog(content, generatedPost, postStyle);
    }

    const { data, error } = await client
        .from(TABLE_NAME)
        .insert({
            user_id: user.id,
            content,
            generated_post: generatedPost || null,
            post_style: postStyle
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getLogs(options = {}) {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        return getLocalLogs(options);
    }

    let query = client
        .from(TABLE_NAME)
        .select('*')
        .eq('user_id', user.id);

    if (options.style) {
        query = query.eq('post_style', options.style);
    }

    if (options.search) {
        query = query.or(`content.ilike.%${options.search}%,generated_post.ilike.%${options.search}%`);
    }

    if (options.order === 'oldest') {
        query = query.order('created_at', { ascending: true });
    } else {
        query = query.order('created_at', { ascending: false });
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function updateLog(id, updates) {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        return updateLocalLog(id, updates);
    }

    const { data, error } = await client
        .from(TABLE_NAME)
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function deleteLog(id) {
    const client = getSupabase();
    const user = getCurrentUser();

    if (!client || !user) {
        return deleteLocalLog(id);
    }

    const { error } = await client
        .from(TABLE_NAME)
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

    if (error) throw error;
}

export async function getStats() {
    const logs = await getLogs();
    const totalLogs = logs.length;
    const postsGenerated = logs.filter(l => l.generated_post).length;
    const lastActivity = logs.length > 0 ? formatDate(logs[0].created_at) : '—';

    return { totalLogs, postsGenerated, lastActivity };
}

// Local Storage Fallback
function getLocalStorage() {
    const data = localStorage.getItem('devlog-logs');
    return data ? JSON.parse(data) : [];
}

function saveLocalStorage(logs) {
    localStorage.setItem('devlog-logs', JSON.stringify(logs));
}

function createLocalLog(content, generatedPost, postStyle) {
    const logs = getLocalStorage();
    const newLog = {
        id: Date.now().toString(),
        user_id: 'local',
        content,
        generated_post: generatedPost || null,
        post_style: postStyle,
        created_at: new Date().toISOString()
    };
    logs.unshift(newLog);
    saveLocalStorage(logs);
    return newLog;
}

function getLocalLogs(options = {}) {
    let logs = getLocalStorage();

    if (options.style) {
        logs = logs.filter(l => l.post_style === options.style);
    }

    if (options.search) {
        const term = options.search.toLowerCase();
        logs = logs.filter(l =>
            l.content.toLowerCase().includes(term) ||
            (l.generated_post && l.generated_post.toLowerCase().includes(term))
        );
    }

    if (options.order === 'oldest') {
        logs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
        logs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    if (options.limit) {
        logs = logs.slice(0, options.limit);
    }

    return logs;
}

function updateLocalLog(id, updates) {
    const logs = getLocalStorage();
    const index = logs.findIndex(l => l.id === id);
    if (index === -1) throw new Error('السجل غير موجود');
    logs[index] = { ...logs[index], ...updates };
    saveLocalStorage(logs);
    return logs[index];
}

function deleteLocalLog(id) {
    const logs = getLocalStorage();
    const filtered = logs.filter(l => l.id !== id);
    saveLocalStorage(filtered);
}

export function formatDate(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;

    return date.toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}