import StudioHeader from "@/app/components/StudioHeader";
import Link from "next/link";
import RecentJobs from "@/app/components/RecentJobs";
export const metadata={title:"Recent jobs | Dragon Pixel Studio",robots:{index:false,follow:false}};
export default function Jobs(){return <><StudioHeader/><main className="jobs-page"><header className="jobs-heading"><div><p className="product-eyebrow">Your artwork</p><h1>Recent jobs</h1><p>Your reviews and generated artwork, in one place.</p></div><Link href="/">Back to Studio →</Link></header><RecentJobs/></main></>;}
