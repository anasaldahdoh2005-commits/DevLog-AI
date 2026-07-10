import { supabase } from './supabase.js';

const APP_URL = getCurrentAppUrl();

export async function getLinkedInConnection() {
    const { data, error } = await invokeLinkedInFunction('linkedin-connection', {
        method: 'GET'
    });

    if (error || data?.error) {
        throw await buildFunctionError(error, data, 'تعذر قراءة حالة ربط LinkedIn');
    }

    return data || { connected: false };
}

export async function startLinkedInOAuth() {
    const { data, error } = await invokeLinkedInFunction('linkedin-oauth-start', {
        body: { app_url: APP_URL }
    });

    if (error || data?.error || !data?.authorization_url) {
        throw await buildFunctionError(error, data, 'تعذر بدء ربط LinkedIn');
    }

    return data;
}

export async function publishLinkedInPost(text) {
    const { data, error } = await invokeLinkedInFunction('linkedin-publish', {
        body: { text }
    });

    if (error || data?.error) {
        throw await buildFunctionError(error, data, 'تعذر نشر المنشور على LinkedIn');
    }

    return data;
}

export async function disconnectLinkedIn() {
    const { data, error } = await invokeLinkedInFunction('linkedin-connection', {
        method: 'DELETE'
    });

    if (error || data?.error) {
        throw await buildFunctionError(error, data, 'تعذر فصل LinkedIn');
    }

    return data || { connected: false };
}

function getCurrentAppUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    return url.toString();
}

async function invokeLinkedInFunction(name, options = {}) {
    const accessToken = await getFreshAccessToken();
    return supabase.functions.invoke(name, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${accessToken}`
        }
    });
}

async function getFreshAccessToken() {
    let { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
        const authError = new Error('سجل الدخول مرة أخرى لإكمال ربط LinkedIn.');
        authError.code = 'invalid_session';
        throw authError;
    }

    const expiresAt = Number(data.session.expires_at || 0) * 1000;
    if (!expiresAt || expiresAt <= Date.now() + 60_000) {
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error || !refreshed.data?.session?.access_token) {
            const authError = new Error('انتهت جلسة الدخول. سجل الدخول مرة أخرى.');
            authError.code = 'invalid_session';
            throw authError;
        }
        data = refreshed.data;
    }

    return data.session.access_token;
}

async function buildFunctionError(error, data, fallback) {
    let payload = data;
    const response = error?.context || error?.response;

    if (!payload?.error && response?.clone) {
        try {
            payload = await response.clone().json();
        } catch {
            // Keep the SDK fallback when the response is not JSON.
        }
    }

    const message = payload?.error || error?.message || fallback;
    const normalized = new Error(message);
    normalized.code = payload?.code || error?.code || '';
    normalized.status = response?.status || payload?.status || error?.status || 0;
    return normalized;
}
