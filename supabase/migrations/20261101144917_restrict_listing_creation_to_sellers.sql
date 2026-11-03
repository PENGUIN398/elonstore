/*
# Restrict listing creation to sellers

1. Modified Tables
- `listings`: the INSERT policy now also requires the signed-in user to have seller mode on.

2. Security
- Only profiles with `is_seller = true` can create listings, and only under their own id.
- Existing SELECT, UPDATE and DELETE policies are unchanged.

3. Notes
- Store-owned listings (seller_id NULL) can no longer be created by any user through the API.
*/

DROP POLICY IF EXISTS "insert_own_listings" ON listings;
CREATE POLICY "insert_own_listings" ON listings FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = seller_id
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.is_seller = true
  )
);
