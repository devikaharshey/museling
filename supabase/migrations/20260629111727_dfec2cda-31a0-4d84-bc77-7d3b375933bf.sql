
create policy "reporter uploads own evidence"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "reporter reads own evidence"
  on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "admin reads all evidence"
  on storage.objects for select to authenticated
  using (bucket_id = 'report-evidence' and public.has_role(auth.uid(),'admin'));
