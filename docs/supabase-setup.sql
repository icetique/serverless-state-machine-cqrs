-- Supabase auth setup for serverless-state-machine-cqrs
--
-- This matches the live project: role data lives in auth.users.raw_app_meta_data,
-- and public.custom_access_token_hook copies it onto top-level JWT claims
-- (app_role, merchant_id, partner_id) that the Lambdas and UI already read.
--
-- Run in the Supabase SQL Editor (Dashboard → SQL → New query).
--
-- Prerequisite: create each user first in Authentication → Users (email + password),
-- then run the metadata UPDATEs below with the same email addresses.

-- ---------------------------------------------------------------------------
-- 1. Custom access token hook (copy from production; do not add extra tables)
-- ---------------------------------------------------------------------------

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $function$
declare
  claims jsonb;
  app_meta jsonb;
begin
  claims := event->'claims';
  app_meta := coalesce(claims->'app_metadata', '{}'::jsonb);

  claims := jsonb_set(
    claims,
    '{app_role}',
    to_jsonb(app_meta->>'app_role'),
    true
  );

  if app_meta ? 'merchant_id' then
    claims := jsonb_set(
      claims,
      '{merchant_id}',
      to_jsonb(app_meta->>'merchant_id'),
      true
    );
  end if;

  if app_meta ? 'partner_id' then
    claims := jsonb_set(
      claims,
      '{partner_id}',
      to_jsonb(app_meta->>'partner_id'),
      true
    );
  end if;

  return jsonb_build_object('claims', claims);
end;
$function$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 2. Demo user metadata (edit emails to match the users you created)
-- ---------------------------------------------------------------------------
-- Keys must match shared/auth-contract.ts and layers/lambda-utils JWT parsing.
-- merchant_id / partner_id values must match agreement rows (merchant_1, partner_2).

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'app_role', 'merchant',
    'merchant_id', 'merchant_1'
)
where email = 'merchant_1@example.com';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'app_role', 'partner',
    'partner_id', 'partner_2'
)
where email = 'partner_2@example.com';

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
    'app_role', 'admin'
)
where email = 'admin_1@example.com';

-- ---------------------------------------------------------------------------
-- 3. Verify metadata (does not show passwords)
-- ---------------------------------------------------------------------------

select
    email,
    raw_app_meta_data ->> 'app_role' as app_role,
    raw_app_meta_data ->> 'merchant_id' as merchant_id,
    raw_app_meta_data ->> 'partner_id' as partner_id
from auth.users
where email in (
    'merchant_1@example.com',
    'partner_2@example.com',
    'admin_1@example.com'
)
order by email;
