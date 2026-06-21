ALTER TABLE public.tenant_phone_numbers
  DROP CONSTRAINT IF EXISTS tenant_phone_numbers_e164ish_check;

ALTER TABLE public.tenant_phone_numbers
  ADD CONSTRAINT tenant_phone_numbers_e164ish_check
  CHECK (phone_number ~ E'^\\+[1-9][0-9]{7,14}$');
