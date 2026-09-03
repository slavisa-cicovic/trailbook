import type { Metadata } from "next";
import { HelpPage } from "../../components/public/help-page";

export const metadata: Metadata = { title:"Help Center | Trailbook", description:"Practical guides for recording, waypoints, photos, trip groups, sharing, restore, and Trailbook Premium." };
export default function Page(){return <HelpPage/>}
