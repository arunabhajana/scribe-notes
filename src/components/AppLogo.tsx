import sidebarLogo from "../assets/scribe-logo-sidebar.png";
import appLogo from "../assets/scribe-logo-v2.png";

export function AppLogo({ variant = "app" }: { variant?: "app" | "transparent" }) {
  const source = variant === "transparent" ? sidebarLogo : appLogo;
  return <span className="brand-mark app-logo" aria-hidden="true"><img src={source} alt="" draggable={false} /></span>;
}
