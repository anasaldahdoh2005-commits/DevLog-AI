
// AI Generation via Supabase Edge Function

import { supabase } from './supabase.js';

export async function generatePost(content, style, platform = 'linkedin', socialProfile = {}) {

    if (!content || !content.trim()) {
        throw new Error('يرجى كتابة الإنجاز أولاً');
    }

    try {

        const { data, error } =
            await supabase.functions.invoke(
                'generate-post',
                {
                  body: {
                   content: content.trim(),
                   post_style: style,
                   platform,
                   social_profile: {
                    username: sanitizeUsername(socialProfile.username),
                    profile_url: sanitizeProfileUrl(socialProfile.profile_url)
                   }
           }
                }
            );

        if (error) {
            throw new Error(await getFunctionErrorMessage(error, data));
        }

        if (data?.error) {
            throw new Error(data.error);
        }

        // قراءة المنشور القادم من Edge Function
        if (data?.generated_post) {
            return data.generated_post;
        }

        throw new Error(
            'لم يتم استلام محتوى من الذكاء الاصطناعي'
        );

    } catch (error) {

        if (
            error.message?.includes('Failed to fetch') ||
            error.message?.includes('NetworkError')
        ) {
            throw new Error(
                'فشل الاتصال بالسيرفر'
            );
        }

        throw error;
    }
}

function sanitizeUsername(value = '') {
    return String(value).trim().replace(/^@+/, '').slice(0, 80);
}

function sanitizeProfileUrl(value = '') {
    const url = String(value).trim();
    if (!url) return '';

    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, 300) : '';
    } catch {
        return '';
    }
}

async function getFunctionErrorMessage(error, data) {
    if (data?.error) return data.error;

    const response = error?.context || error?.response;
    if (response?.clone) {
        try {
            const payload = await response.clone().json();
            if (payload?.error) return payload.error;
        } catch {
            try {
                const text = await response.clone().text();
                if (text) return text;
            } catch {
                // Fall back to the mapped message below.
            }
        }
    }

    if (response?.status === 429 || error?.message?.includes('non-2xx')) {
        return 'وصلت للحد اليومي لتوليد منشورات AI. استخدمت كل محاولات اليوم، جرّب مرة أخرى بعد بداية اليوم الجديد بتوقيت جرينتش UTC.';
    }

    return error.message || 'فشل الاتصال بخدمة الذكاء الاصطناعي';
}
export function getStyleLabel(style) {

    const labels = {
        Professional: 'احترافي',
        Friendly: 'ودّي',
        Motivational: 'تحفيزي',
        Technical: 'تقني',
        Short: 'مختصر',
        Storytelling: 'قصصي'
    };

    return labels[style] || style;
}

export function getPlatformLabel(platform) {
    const labels = {
        linkedin: 'LinkedIn',
        x: 'X',
        instagram: 'Instagram'
    };

    return labels[platform] || labels.linkedin;
}


