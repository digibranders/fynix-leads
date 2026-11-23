import { redirect } from "next/navigation";

/** The front door: /welcome takes a signed-in person to their portal and anyone else to the sign-in page. */
export default function Home(): never {
  redirect("/welcome");
}
