import StudioHeader from "@/app/components/StudioHeader";
import RecentJobs from "@/app/components/RecentJobs";
export const metadata={title:"Artwork result | Dragon Pixel Studio",robots:{index:false,follow:false}};
export default async function Job({params}:{params:Promise<{id:string}>}){const {id}=await params;return <><StudioHeader/><main className="jobs-page"><header className="jobs-heading"><div><p className="product-eyebrow">Your artwork</p><h1>Artwork result</h1></div></header><RecentJobs id={id}/></main></>;}
