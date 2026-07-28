import { supabase } from './supabase.js';

let currentUser = null;
let passwordRecoveryActive = false;

// =====================
// Exports المطلوبة
// =====================

export function getCurrentUser() {
    return currentUser;
}

export function getSupabase() {
    return supabase;
}

export async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signUp(email, password) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo: getAuthRedirectUrl('verified')
        }
    });

    if (error) throw error;

    return data;
}

export async function resetPassword(email) {
    const { error } =
        await supabase.auth.resetPasswordForEmail(
            email,
            {
                redirectTo: getAuthRedirectUrl('recovery')
            }
        );

    if (error) throw error;
}
export async function updatePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    passwordRecoveryActive = false;
    clearAuthCallbackParams();
}

export async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    window.location.hash = '#/';
}

// =====================
// Init
// =====================

export async function initAuth() {
    try {
        const callbackType = getAuthCallbackType();
        passwordRecoveryActive = callbackType === 'recovery';

        const hasAuthCallback = Boolean(
            callbackType || hasSupabaseAuthHash() || getAuthCode()
        );

        const { data: { session } } = await supabase.auth.getSession();
        applySession(session);

        if (session && passwordRecoveryActive) {
            window.location.hash = '#/reset-password';
        } else if (session && hasAuthCallback) {
            window.location.hash = '#/dashboard';
        }

        supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                passwordRecoveryActive = true;
                applySession(session);
                window.location.hash = '#/reset-password';
                window.dispatchEvent(new CustomEvent('authrecovery'));
                return;
            }
            applySession(session);
        });

    } catch (error) {
        console.error('Auth init error:', error);
    }
}

// =====================
// Helpers
// =====================

function applySession(session) {
    const previousUserId = currentUser?.id || null;
    currentUser = session?.user ?? null;

    if (currentUser) {
        document.body.classList.add('authenticated');
    } else {
        document.body.classList.remove('authenticated');
    }

    const currentUserId = currentUser?.id || null;
    if (previousUserId !== currentUserId) {
        window.dispatchEvent(new CustomEvent('authchange', {
            detail: { user: currentUser }
        }));
    }
}

function getAuthCallbackType() {
    const authStatus = new URLSearchParams(window.location.search).get('auth');
    if (authStatus === 'recovery') return 'recovery';
    if (authStatus === 'verified') return 'signup';

    const hash = window.location.hash;
    if (hash.includes('type=recovery')) return 'recovery';
    if (hash.includes('type=signup')) return 'signup';
    return null;
}

function hasSupabaseAuthHash() {
    return window.location.hash.includes('access_token');
}

function getAuthCode() {
    return new URLSearchParams(window.location.search).get('code');
}

function getAuthRedirectUrl(authStatus) {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    url.searchParams.set('auth', authStatus);
    return url.toString();
}

function clearAuthCallbackParams() {
    const url = new URL(window.location.href);
    url.searchParams.delete('auth');
    url.searchParams.delete('code');
    window.history.replaceState(
        {},
        document.title,
        `${url.pathname}${url.search}${window.location.hash}`
    );
}
