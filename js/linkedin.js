import { supabase } from './supabase.js';

const APP_URL = getCurrentAppUrl();

export async function getLinkedInConnection() {
    const { data, error } = await supabase.functions.invoke('linkedin-connection', {
        method: 'GET'
    });

    if (error || data?.error) {
        throw buildFunctionError(error, data, 'تعذر قراءة حالة ربط LinkedIn');
    }

    return data || { connected: false };
}

export async function startLinkedInOAuth() {
    const { data, error } = await supabase.functions.invoke('linkedin-oauth-start', {
        body: { app_url: APP_URL }
    });

    if (error || data?.error || !data?.authorization_url) {
        throw buildFunctionError(error, data, 'تعذر بدء ربط LinkedIn');
    }

    return data;
}

export async function publishLinkedInPost(text) {
    const { data, error } = await supabase.functions.invoke('linkedin-publish', {
        body: { text }
    });

    if (error || data?.error) {
        throw buildFunctionError(error, data, 'تعذر نشر المنشور على LinkedIn');
    }

    return data;
}

export async function disconnectLinkedIn() {
    const { data, error } = await supabase.functions.invoke('linkedin-connection', {
        method: 'DELETE'
    });

    if (error || data?.error) {
        throw buildFunctionError(error, data, 'تعذر فصل LinkedIn');
    }

    return data || { connected: false };
}

function getCurrentAppUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    return url.toString();
}

function buildFunctionError(error, data, fallback) {
    const message = data?.error || error?.message || fallback;
    const normalized = new Error(message);
    normalized.code = data?.code || error?.code || '';
    normalized.status = data?.status || error?.status || 0;
    return normalized;
}
