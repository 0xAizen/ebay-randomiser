import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";

export default async function AdminEnergyPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(sessionToken)) {
    redirect("/admin/login");
  }

  redirect("/admin?channel=energy");
}
