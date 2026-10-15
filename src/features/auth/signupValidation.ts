export type AuthField = "displayName" | "email" | "password" | "confirmPassword";
export function emailError(email: string) {
  const value = email.trim();
  if (!value) return "Enter your email address.";
  if (value.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "Enter a valid email address, like you@example.com.";
  return "";
}
export function authFieldErrors(displayName: string, email: string, password: string, confirmPassword: string, signup: boolean): Record<AuthField, string> {
  return {
    displayName: !signup ? "" : !displayName.trim() ? "Enter your display name." : displayName.trim().length > 60 ? "Use 60 characters or fewer." : "",
    email: emailError(email),
    password: !password ? "Enter your password." : signup && password.length < 12 ? "Use at least 12 characters." : password.length > 1024 ? "Use 1,024 characters or fewer." : "",
    confirmPassword: !signup ? "" : !confirmPassword ? "Confirm your password." : confirmPassword !== password ? "Passwords do not match." : "",
  };
}
