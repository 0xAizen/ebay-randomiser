import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import AdminRandomiser from "@/components/admin-randomiser";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-auth";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  if (!verifySessionToken(sessionToken)) {
    redirect("/admin/login");
  }

  return <AdminRandomiser />;
}
