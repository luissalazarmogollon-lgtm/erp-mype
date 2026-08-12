import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/lib/auth";

export default async function HomePage() {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  redirect("/dashboard");
}
