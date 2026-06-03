-- Add eyoub@imaccelerator.com as an owner.
-- auth_id is NULL — linked automatically on first Google sign-in.

INSERT INTO public.users (email, name, role, status)
VALUES ('eyoub@imaccelerator.com', 'Eyoub', 'owner', 'active')
ON CONFLICT (email) DO NOTHING;
