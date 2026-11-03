/*
# Add seller profile photos

1. New profile data
- `profiles.avatar_url` stores the public image URL for a seller's profile photo.
- Sellers can update this photo from My Seller Profile, alongside their display name.
- Marketplace seller cards and product seller labels can display the saved photo.

2. Storage
- Creates the `seller-avatars` bucket for profile photos.
- Images are public to signed-in marketplace visitors because seller profiles are public marketplace content.
- Uploads are limited to image/jpeg, image/png, and image/webp files no larger than 2 MB.
- Each seller's files must be stored inside a folder named with that seller's authenticated user ID.

3. Security
- The profile avatar URL is writable only as part of the existing user's editable profile fields.
- Authenticated users can upload, update, and delete files only inside their own seller-avatar folder.
- Authenticated users can read seller avatar files for marketplace display.
- No anonymous upload, update, or delete access is granted.

4. Important notes
- Existing profile names, seller settings, and photos are preserved.
- Existing avatar files are not deleted when a seller replaces a photo, avoiding accidental data loss.
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url text;

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (handle, display_name, bio, is_seller, avatar_url) ON public.profiles TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'seller-avatars',
  'seller-avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "seller_avatar_read" ON storage.objects;
CREATE POLICY "seller_avatar_read" ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'seller-avatars');

DROP POLICY IF EXISTS "seller_avatar_insert_own" ON storage.objects;
CREATE POLICY "seller_avatar_insert_own" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'seller-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "seller_avatar_update_own" ON storage.objects;
CREATE POLICY "seller_avatar_update_own" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'seller-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'seller-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "seller_avatar_delete_own" ON storage.objects;
CREATE POLICY "seller_avatar_delete_own" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'seller-avatars'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
