import { redirect } from "next/navigation";

export default function ObsEnergyPage() {
  redirect("/obs?channel=energy");
}
