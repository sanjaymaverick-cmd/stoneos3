"use client";

import { useRouter } from "next/navigation";
import { useSession } from "../lib/session";

// Replaces Clerk's <UserButton />. Shows who is signed in and offers the one
// action that matters on a shared factory-floor phone: sign out, so the next
// person does not inherit the session.
export function UserButton() {
  const { user, logout } = useSession();
  const router = useRouter();

  if (!user) return null;

  return (
    <span className="user-button">
      <span className="user-button-name" title={`${user.name ?? user.username} (${user.role})`}>
        {user.username}
      </span>
      <button
        type="button"
        className="user-button-signout"
        onClick={() => {
          logout();
          router.replace("/sign-in");
        }}
      >
        Sign out
      </button>
    </span>
  );
}
