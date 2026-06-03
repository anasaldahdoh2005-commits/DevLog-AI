
// AI Generation via Supabase Edge Function

import { supabase } from './supabase.js';

export async function generatePost(content, style, 
    selectedPlatform)
 {

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
                  platform: window.selectedPlatform
           }
                }
            );

        console.log('FULL AI RESPONSE:', data);

        if (error) {
            console.error(
                'Supabase Function Error:',
                error
            );

            throw new Error(
                error.message ||
                'فشل الاتصال بخدمة الذكاء الاصطناعي'
            );
        }

        // قراءة المنشور القادم من Edge Function
        if (data?.generated_post) {
            return data.generated_post;
        }

        console.log('Unexpected Response:', data);

        throw new Error(
            'لم يتم استلام محتوى من الذكاء الاصطناعي'
        );

    } catch (error) {

        console.error(
            'Generate Post Error:',
            error
        );

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


