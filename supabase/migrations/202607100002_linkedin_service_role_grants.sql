-- LinkedIn Edge Functions use the server-only secret key. RLS remains enabled
-- and anon/authenticated keep no direct access, while service_role receives
-- only the table privileges required by the OAuth and publishing workflow.
grant select, insert, update, delete
on table public.linkedin_oauth_states
to service_role;

grant select, insert, update, delete
on table public.linkedin_accounts
to service_role;
