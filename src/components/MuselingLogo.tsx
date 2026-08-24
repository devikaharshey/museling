import { Link } from "@tanstack/react-router";
import logo from "@/assets/museling-logo.png";

export function MuselingLogo({ className = "" }: { className?: string }) {
  return (
    <Link
      to="/"
      className={"inline-flex items-center gap-2 " + className}
      aria-label="Museling home"
    >
      <img src={logo} alt="" className="h-12 w-12 rounded-full object-cover" />
      <span
        className="font-display italic text-primary leading-none tracking-tight"
        style={{ fontWeight: 900, fontSize: "1.85rem" }}
      >
        Museling
      </span>
    </Link>
  );
}
