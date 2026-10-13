export function AppLogo({ variant = "app" }: { variant?: "app" | "transparent" }) {
  const source = variant === "transparent" ? "/scribe-logo-sidebar.png" : "/scribe-logo-v2.png";
  return <span className="brand-mark app-logo" aria-hidden="true"><img src={source} alt="" draggable={false} /></span>;
}
