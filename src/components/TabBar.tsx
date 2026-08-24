import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Rss, Users, PlusSquare, User } from "lucide-react";

const tabs = [
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/feed", label: "Feed", icon: Rss },
  { to: "/inbox", label: "Groups", icon: Users },
  { to: "/log", label: "Log", icon: PlusSquare },
  { to: "/profile", label: "Profile", icon: User },
] as const;

export function TabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = pathname === to || pathname.startsWith(to + "/");
          return (
            <Link
              key={to}
              to={to}
              className={
                "flex flex-1 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition " +
                (active ? "text-primary" : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className={"h-5 w-5 " + (active ? "stroke-[2.2]" : "")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function TabBarSpacer() {
  return <div className="h-20" aria-hidden />;
}
