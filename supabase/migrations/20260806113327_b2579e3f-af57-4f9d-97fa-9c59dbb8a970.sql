CREATE POLICY "Users can update their own going mark"
ON public.concert_intents
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);