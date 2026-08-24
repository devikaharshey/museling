import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "./auth";

export const Route = createFileRoute("/signin")({
  head: () => ({ meta: [{ title: "Sign in · Museling" }] }),
  component: () => <AuthPage initialMode="signin" />,
});
