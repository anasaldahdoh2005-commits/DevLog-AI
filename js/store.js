
import { supabase }
from './supabase.js';

import { refreshLogs }
from './ui.js';

export let logsState = [];

export function setLogs(logs) {
  logsState = logs;
}

export function getLogsState() {
  return logsState;
}

// Realtime subscription

supabase
  .channel('logs-channel')

.on(
  'postgres_changes',
  {
    event: '*',
    schema: 'public',
    table: 'logs'
  },
  () => {
    console.log('Realtime update detected');
    refreshLogs();
  }
)

  .subscribe();