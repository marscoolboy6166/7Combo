import { cookies } from "next/headers";
import { DEFAULT_CITY } from "@/lib/constants";
import { CITY_COOKIE } from "@/components/city-select";

export async function getSelectedCity(): Promise<string> {
  const cookieStore = await cookies();
  return cookieStore.get(CITY_COOKIE)?.value ?? DEFAULT_CITY;
}
