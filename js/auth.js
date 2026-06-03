// Supabase Authentication Module
// Replace these with your actual Supabase credentials
import { supabase } from './supabase.js'; 



let currentUser = null;



export async function initAuth() {
    const client = supabase;

    try {
        const { data: { session } } = await client.auth.getSession();
        if (session) {
            currentUser = session.user;
            setAuthenticatedState(true);
        }

        // Listen for auth changes
        client.auth.onAuthStateChange((event, session) => {
            if (session) {
                currentUser = session.user;
                setAuthenticatedState(true);
            } else {
                currentUser = null;
                setAuthenticatedState(false);
            }
        });
    } catch (error) {
        console.log('Auth init: Supabase not configured yet');
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

    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw error;
    return data;
}

export async function resetPassword(email) {
    const client = supabase;
    if (!client) throw new Error('يرجى تكوين Supabase أولاً');

    const { error } = await client.auth.resetPasswordForEmail(email);
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

function setAuthenticatedState(isAuth) {
    if (isAuth) {
        document.body.classList.add('authenticated');
    } else {
        document.body.classList.remove('authenticated');
    }
}

export function getSupabase() {
    return supabase;
}