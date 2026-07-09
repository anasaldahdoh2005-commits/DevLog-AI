import { supabase } from './supabase.js';

export let logsState = [];
let logsChannel = null;

export function setLogs(logs) {
    logsState = logs;
}

export function getLogsState() {
    return logsState;
}

export function initRealtime(onLogsChange) {
    if (logsChannel) return logsChannel;

    logsChannel = supabase
        .channel('logs-channel')
        .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'logs' },
            () => {
                if (typeof onLogsChange === 'function') onLogsChange();
            }
        )
        .subscribe();

    return logsChannel;
}
