import { PageShell } from "@/app/components/SiteChrome";
import RecentJobs from "@/app/components/RecentJobs";
export const metadata={title:"Recent jobs | Dragon Pixel Studio",robots:{index:false,follow:false}};
export default function Jobs(){return <PageShell eyebrow="Your artwork" title="Recent jobs" intro="Recover results from this wallet for 24 hours. Download artwork you want to keep."><RecentJobs/></PageShell>;}
