import { supabase } from './supabase.js';

let logsChannel = null;
let subscribedUserId = null;

export async function syncLogsRealtime(userId, onLogsChange) {
    const nextUserId = String(userId || '');
    if (logsChannel && subscribedUserId === nextUserId) return logsChannel;

    if (logsChannel) {
        const staleChannel = logsChannel;
        logsChannel = null;
        subscribedUserId = null;
        await supabase.removeChannel(staleChannel);
    }

    if (!nextUserId) return null;

    subscribedUserId = nextUserId;
    logsChannel = supabase
        .channel(`logs:${nextUserId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'logs',
                filter: `user_id=eq.${nextUserId}`
            },
            () => {
                if (typeof onLogsChange === 'function') onLogsChange();
            }
        )
        .subscribe();

    return logsChannel;
}
