import { redirect } from "next/navigation";

export default function ObsOpPage() {
  redirect("/obs?channel=op");
}
