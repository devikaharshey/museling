
REVOKE EXECUTE ON FUNCTION public.group_chat_open(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.group_chat_open(uuid, uuid) TO service_role;
