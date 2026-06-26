import { supabase } from './supabase.js';

const BASE_URL = 'https://anasaldahdoh2005-commits.github.io/DevLog-AI';

let currentUser = null;

export async function initAuth() {
    const client = supabase;
    try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
            currentUser = session.user;
            setAuthenticatedState(true);
        }

        client.auth.onAuthStateChange((event, session) => {
            // ✅ معالجة PASSWORD_RECOVERY
            if (event === 'PASSWORD_RECOVERY') {
                window.location.href = `${BASE_URL}/reset-password.html`;
                return;
            }
            if (session) {
                currentUser = session.user;
                setAuthenticatedState(true);
            } else {
                currentUser = null;
                setAuthenticatedState(false);
            }
        });
    } catch (error) {
        console.log('Auth init error:', error);
    }
}

export async function signIn(email, password) {
    const client = supabase;
    if (!client) throw new Error('يرجى تكوين Supabase أولاً');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user;
    setAuthenticatedState(true);
    return data;
}

export async function signUp(email, password) {
    const client = supabase;
    if (!client) throw new Error('يرجى تكوين Supabase أولاً');
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
            // ✅ بعد التأكيد يرجع على التطبيق مش على localhost
            emailRedirectTo: `${BASE_URL}/auth.html`
        }
    });
    if (error) throw error;
    return data;
}

export async function resetPassword(email) {
    const client = supabase;
    if (!client) throw new Error('يرجى تكوين Supabase أولاً');
    const { error } = await client.auth.resetPasswordForEmail(email, {
        // ✅ redirectTo محدد بشكل صريح
        redirectTo: `${BASE_URL}/reset-password.html`
    });
    if (error) throw error;
}

export async function signOut() {
    const client = supabase;
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
    setAuthenticatedState(false);
    window.location.hash = '#/';
}

export function getCurrentUser() {
    return currentUser;
}

export function getSupabase() {
    return supabase;
}

function setAuthenticatedState(isAuth) {
    if (isAuth) {
        document.body.classList.add('authenticated');
    } else {
        document.body.classList.remove('authenticated');
    }
}
