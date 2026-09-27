import { PageShell } from "@/app/components/SiteChrome";
import RecentJobs from "@/app/components/RecentJobs";
export const metadata={title:"Artwork result | Dragon Pixel Studio",robots:{index:false,follow:false}};
export default async function Job({params}:{params:Promise<{id:string}>}){const {id}=await params;return <PageShell eyebrow="Your artwork" title="Artwork result" intro="Download or continue editing in Studio."><RecentJobs id={id}/></PageShell>;}
